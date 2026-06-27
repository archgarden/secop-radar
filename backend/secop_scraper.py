"""Descarga de documentos de procesos SECOP II usando Playwright.

Soporta resolución de reCAPTCHA v2 mediante servicios de terceros:
- NopeCHA Token API
- 2captcha

Requiere configurar la variable CAPTCHA_SOLVER y CAPTCHA_API_KEY en el .env.

ADVERTENCIA: Automatizar el acceso a community.secop.gov.co puede violar los
terminos de uso de Colombia Compra Eficiente. Usar bajo responsabilidad del
usuario final.
"""

import logging
import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from sqlalchemy.orm import Session

from models import DocumentoProceso, Proceso

load_dotenv()

logger = logging.getLogger("secop_scraper")

SCOP_SCRAPER_ENABLED = os.getenv("SCOP_SCRAPER_ENABLED", "false").lower() in ("true", "1", "yes")
NOPECHA_EXT_PATH = os.getenv("NOPECHA_EXT_PATH", str(Path(__file__).resolve().parent / "nopecha_test" / "nopecha_ext"))
SCOP_SCRAPER_TIMEOUT = int(os.getenv("SCOP_SCRAPER_TIMEOUT", "120"))
SCOP_SCRAPER_STORAGE = os.getenv("SCOP_SCRAPER_STORAGE", "../storage/procesos")

# Configuración del solucionador de CAPTCHA.
CAPTCHA_SOLVER = os.getenv("CAPTCHA_SOLVER", "nopecha_extension").lower()
CAPTCHA_API_KEY = os.getenv("CAPTCHA_API_KEY", "")

BASE_DETAIL_URL = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index"
RETRIEVE_FILE_PATH = "/Public/Areas/Archive/RetrieveFile.aspx"


def _notice_uid_from_url(url: str) -> str | None:
    """Extrae el noticeUID de una URL de detalle de SECOP II."""
    if not url or "OpportunityDetail" not in url:
        return None
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    return qs.get("noticeUID", [None])[0]


def _safe_filename(name: str, fallback: str, idx: int) -> str:
    """Limpia un nombre de archivo para guardarlo en disco."""
    name = name or fallback
    name = Path(name).name
    name = re.sub(r"[^\w\s\.\-_]", "_", name)
    name = re.sub(r"\s+", "_", name).strip("._")
    if not name or name in (".", ".."):
        name = f"doc_{idx}"
    return name


def _unique_dest_path(output_dir: Path, filename: str) -> Path:
    """Devuelve una ruta única, agregando (1), (2), etc. si ya existe."""
    dest = output_dir / filename
    if not dest.exists():
        return dest
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    counter = 1
    while True:
        candidate = output_dir / f"{stem}({counter}){suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def _set_extension(name: str, ext: str) -> str:
    """Reemplaza o agrega una extensión de archivo de forma segura.

    Evita extensiones duplicadas como `archivo.docx.xlsx` cuando el portal
    entrega un nombre con extensión incorrecta y detectamos el tipo real
    por Content-Type o magic bytes.
    """
    if name.lower().endswith(ext.lower()):
        return name
    stem = Path(name).stem
    return f"{stem}{ext}"


def _detect_ooxml_extension(content: bytes) -> str | None:
    """Detecta si un archivo OOXML (ZIP) es docx o xlsx inspeccionando su contenido."""
    try:
        import zipfile
        import io
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            names = set(z.namelist())
            if "word/document.xml" in names:
                return ".docx"
            if "xl/workbook.xml" in names:
                return ".xlsx"
            # Fallback: leer [Content_Types].xml
            if "[Content_Types].xml" in names:
                ct = z.read("[Content_Types].xml").decode("utf-8", errors="ignore").lower()
                if "wordprocessingml" in ct:
                    return ".docx"
                if "spreadsheetml" in ct:
                    return ".xlsx"
    except Exception:
        pass
    return None


def _is_pliego(nombre: str) -> bool:
    """Heurística para detectar si un documento es el pliego de condiciones.

    Busca nombres que claramente sean el pliego/base/terminos de referencia
    y descarta documentos derivados (adendas, observaciones, resoluciones,
    propuestas, etc.).
    """
    n = nombre.lower()
    n_norm = re.sub(r"[_.\-]+", " ", n)

    # Palabras que suelen indicar que NO es el pliego principal.
    descartes = [
        "adenda", "observacion", "observación", "resolucion", "resolución",
        "propuesta", "evaluacion", "evaluación", "cronograma", "visita",
        "convocatoria", "aviso", "invitacion", "invitación", "acta",
        "apertura", "adjudicacion", "adjudicación", "minuta", "pacto",
        "glosario", "autorizacion", "autorización", "certificacion", "certificación",
        "formato", "matriz", "anexo 3", "anexo 4", "anexo 5",
        "cpd", "cdp", "pago", "listado", "planos",
    ]
    if any(d in n for d in descartes):
        return False

    # Términos que sí indican pliego/base del proceso.
    terminos_pliego = [
        "pliego",
        "condiciones",
        "terminos de referencia",
        "términos de referencia",
        "documento base",
        "documento base de contratacion",
        "bases de licitacion",
        "bases de licitación",
        "bases de seleccion",
        "bases de selección",
        "estudios previos",
        "estudio previo",
        "analisis del sector",
        "análisis del sector",
        "programa de",
    ]
    return any(t in n_norm for t in terminos_pliego)


def _prioridad_documento(nombre: str) -> int:
    """Asigna una prioridad mayor a documentos clave para el análisis de pliego."""
    n = nombre.lower()
    # Pliego / documento base es lo más importante.
    if _is_pliego(nombre):
        return 100
    # Anexos técnicos y especificaciones.
    if "anexo tecnico" in n or "anexo técnico" in n or "especificaciones tecnicas" in n or "especificaciones técnicas" in n:
        return 95
    # Documento técnico y documentos de viabilidad.
    if "documento tecnico" in n or "documento técnico" in n or "viabilidad" in n:
        return 90
    # Matrices de experiencia e indicadores.
    if "matriz 1" in n or "matriz-1" in n or "matriz1" in n or "experiencia" in n:
        return 85
    if "matriz 2" in n or "matriz-2" in n or "matriz2" in n or "indicadores financieros" in n:
        return 84
    # Formatos oficiales.
    if "formato 3" in n or "formato 4" in n:
        return 80
    if n.startswith("formato "):
        return 75
    # Presupuesto, análisis de precios, cronograma.
    if "presupuesto" in n or "analisis de precios" in n or "análisis de precios" in n or "cronograma" in n:
        return 70
    # Certificaciones y otros anexos.
    if "certificacion" in n or "certificación" in n:
        return 60
    # Planos (menos prioritarios que el pliego, pero aún útiles).
    if "plano" in n:
        return 40
    # Resto.
    return 0


# ---------------------------------------------------------------------------
# Solucionadores de CAPTCHA
# ---------------------------------------------------------------------------


def _solve_with_2captcha(sitekey: str, page_url: str, timeout: int = 120) -> str | None:
    """Resuelve reCAPTCHA v2 usando 2captcha."""
    if not CAPTCHA_API_KEY:
        raise RuntimeError("CAPTCHA_API_KEY no configurada")

    # 1. Enviar tarea.
    payload = {
        "key": CAPTCHA_API_KEY,
        "method": "userrecaptcha",
        "googlekey": sitekey,
        "pageurl": page_url,
        "json": "1",
    }
    r = requests.post("https://2captcha.com/in.php", data=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    if data.get("status") != 1:
        raise RuntimeError(f"2captcha error: {data}")
    task_id = data["request"]
    logger.info("2captcha tarea creada: %s", task_id)

    # 2. Poll por resultado.
    start = time.time()
    while time.time() - start < timeout:
        time.sleep(5)
        r = requests.get(
            "https://2captcha.com/res.php",
            params={"key": CAPTCHA_API_KEY, "action": "get", "id": task_id, "json": "1"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == 1:
            return data["request"]
        if data.get("request") != "CAPCHA_NOT_READY":
            raise RuntimeError(f"2captcha error: {data}")

    raise RuntimeError("Timeout esperando solución de 2captcha")


def _solve_with_nopecha_token(sitekey: str, page_url: str, timeout: int = 120) -> str | None:
    """Resuelve reCAPTCHA v2 usando NopeCHA Token API."""
    if not CAPTCHA_API_KEY:
        raise RuntimeError("CAPTCHA_API_KEY no configurada")

    headers = {"Authorization": f"Bearer {CAPTCHA_API_KEY}"}
    payload = {
        "type": "recaptcha2",
        "sitekey": sitekey,
        "url": page_url,
    }
    r = requests.post("https://api.nopecha.com/token", json=payload, headers=headers, timeout=30)
    r.raise_for_status()
    data = r.json()
    if "data" not in data:
        raise RuntimeError(f"NopeCHA error: {data}")
    return data["data"]


def _solve_captcha(sitekey: str, page_url: str, timeout: int = 120) -> str | None:
    """Resuelve reCAPTCHA usando el solucionador configurado.

    Retorna None si el modo es 'manual' o 'nopecha_extension' (la extensión
    resuelve el CAPTCHA directamente en el navegador).
    """
    logger.info("Usando solucionador de CAPTCHA: %s", CAPTCHA_SOLVER)
    if CAPTCHA_SOLVER in ("manual", "nopecha_extension"):
        return None
    if CAPTCHA_SOLVER == "2captcha":
        return _solve_with_2captcha(sitekey, page_url, timeout)
    if CAPTCHA_SOLVER in ("nopecha", "nopecha_token"):
        return _solve_with_nopecha_token(sitekey, page_url, timeout)
    raise RuntimeError(f"Solucionador no soportado: {CAPTCHA_SOLVER}")


# ---------------------------------------------------------------------------
# Navegador y descarga
# ---------------------------------------------------------------------------


def _launch_browser(headless: bool = False, load_nopecha_extension: bool = False):
    """Lanza Chromium, opcionalmente con la extensión NopeCHA cargada."""
    user_data_dir = tempfile.mkdtemp(prefix="secop_profile_")
    logger.info("Perfil temporal de Chrome: %s", user_data_dir)

    args = [
        "--no-first-run",
        "--no-default-browser-check",
    ]

    ext_path = Path(NOPECHA_EXT_PATH)
    if not ext_path.is_absolute():
        ext_path = (Path(__file__).resolve().parent / ext_path).resolve()
    if load_nopecha_extension:
        if not ext_path.exists():
            raise RuntimeError(f"Extensión NopeCHA no encontrada en {ext_path}")
        args.extend([
            f"--disable-extensions-except={ext_path}",
            f"--load-extension={ext_path}",
        ])
        logger.info("Cargando extensión NopeCHA desde %s", ext_path)

    playwright = sync_playwright().start()
    context = playwright.chromium.launch_persistent_context(
        user_data_dir,
        headless=headless,
        args=args,
        viewport={"width": 1366, "height": 768},
    )
    return playwright, context, user_data_dir


def _inject_recaptcha_token(page, token: str) -> None:
    """Inyecta el token de reCAPTCHA y dispara el callback."""
    page.evaluate(
        """(token) => {
            const responseField = document.getElementById('g-recaptcha-response');
            if (responseField) {
                responseField.style.display = 'block';
                responseField.value = token;
                responseField.innerHTML = token;
            }
            // Intentar encontrar y ejecutar el callback definido por data-callback.
            const widgets = document.querySelectorAll('.g-recaptcha');
            widgets.forEach(w => {
                const callbackName = w.getAttribute('data-callback');
                if (callbackName && window[callbackName]) {
                    window[callbackName](token);
                }
            });
            // Fallback: buscar en la configuración interna de reCAPTCHA.
            try {
                const cfg = window.___grecaptcha_cfg;
                if (cfg && cfg.clients) {
                    Object.values(cfg.clients).forEach(client => {
                        const cb = client?.aa?.l?.callback || client?.l?.callback;
                        if (typeof cb === 'function') cb(token);
                    });
                }
            } catch (e) {}
        }""",
        token,
    )


def _wait_for_detail_page(page, timeout_seconds: int) -> bool:
    """Espera a que el portal muestre la página real del proceso."""
    logger.info("Esperando carga del detalle del proceso (máx %ds)...", timeout_seconds)
    for i in range(timeout_seconds):
        time.sleep(1)
        current_url = page.url
        title = page.title()

        if i % 10 == 0:
            logger.info("  [%ds] URL=%s | title=%s", i, current_url, title)

        if "ReCaptcha" not in title and "GoogleReCaptcha" not in current_url:
            logger.info("Página de detalle cargada después de %ds", i)
            return True

    logger.warning("No se cargó el detalle del proceso en %ds", timeout_seconds)
    return False


def _extract_document_links(page) -> list[dict]:
    """Extrae los enlaces de descarga de documentos del detalle del proceso SECOP II.

    SECOP II renderiza la lista de documentos en una tabla con enlaces
    `javascript:void(0);` que invocan `getAction('/Public/Tendering/OpportunityDetail/DownloadFile...')`.
    Esta función extrae el documentFileId y el mkey de cada onclick y construye
    la URL directa de descarga.
    """
    logger.info("Extrayendo enlaces de documentos...")
    page.wait_for_load_state("networkidle", timeout=60000)
    time.sleep(3)

    # Intentar varios selectores porque SECOP II cambia los ids según la vista.
    selectors = [
        'table#grdGridDocumentList_tbl tbody tr[id^="grdGridDocumentList_tr"]',
        'table[id*="DocumentList"] tbody tr',
        'table tbody tr',
    ]

    document_data = []
    for selector in selectors:
        try:
            rows = page.query_selector_all(selector)
            logger.info("Selector %s encontró %d filas", selector, len(rows))
            if not rows:
                continue
            document_data = page.eval_on_selector_all(
                selector,
                """rows => rows.map((row, idx) => {
                    // Buscar nombre en varios posibles spans/celdas.
                    const nameSpan = row.querySelector('span[id*="DocumentName"]')
                        || row.querySelector('span[id*="spnDocument"]')
                        || row.querySelector('td:nth-child(2)');
                    const link = row.querySelector('a[onclick*="DownloadFile"]')
                        || row.querySelector('a[id*="DownloadLink"]')
                        || row.querySelector('a');
                    const onclick = link ? link.getAttribute('onclick') || '' : '';
                    const idMatch = onclick.match(/documentFileId='\\s*\\+\\s*'(\d+)'/)
                        || onclick.match(/documentFileId=(\d+)/);
                    const mkeyMatch = onclick.match(/[&?]mkey=([a-f0-9\\-_]+)/);
                    return {
                        text: nameSpan ? (nameSpan.innerText || nameSpan.textContent || '').trim() : `documento_${idx}`,
                        documentFileId: idMatch ? idMatch[1] : null,
                        mkey: mkeyMatch ? mkeyMatch[1] : null,
                        onclick: onclick
                    };
                })""",
            )
            if document_data:
                break
        except Exception as exc:
            logger.warning("Selector %s falló: %s", selector, exc)
            continue

    base_url = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/DownloadFile"
    links = []
    for item in document_data:
        doc_id = item.get("documentFileId")
        mkey = item.get("mkey")
        text = item.get("text") or "documento"
        if doc_id and mkey:
            href = f"{base_url}?documentFileId={doc_id}&mkey={mkey}"
            links.append({
                "text": text,
                "href": href,
                "documentFileId": doc_id,
                "mkey": mkey,
            })
            logger.info("Link encontrado: %s -> %s", text, href)

    logger.info("Documentos encontrados: %d", len(links))
    return links



def _resolve_real_download(session: requests.Session, initial_href: str, headers: dict) -> tuple[bytes, str | None, str]:
    """Resuelve la descarga real de SECOP II.

    El endpoint DownloadFile responde con un HTML que contiene un JavaScript
    de redirección hacia /Public/Archive/RetrieveFile/Index?DocumentId=...
    Seguimos esa redirección para obtener el archivo binario real.

    Retorna (content, real_url_or_none, final_content_type).
    """
    r = session.get(initial_href, headers=headers, timeout=120, allow_redirects=True)
    r.raise_for_status()
    content = r.content
    content_type = r.headers.get("Content-Type", "").lower()

    # Si ya es binario, retornarlo.
    if "html" not in content_type and len(content) > 1000:
        return content, None, content_type

    # Si es HTML pequeño, buscar el redirect JS.
    text = content.decode("utf-8", errors="ignore")
    match = re.search(r"/Public/Archive/RetrieveFile/Index\?([^'\"<>\s]+)", text)
    if match:
        retrieve_path = "/Public/Archive/RetrieveFile/Index?" + match.group(1)
        retrieve_url = "https://community.secop.gov.co" + retrieve_path
        r2 = session.get(retrieve_url, headers=headers, timeout=120, allow_redirects=True)
        r2.raise_for_status()
        return r2.content, retrieve_url, r2.headers.get("Content-Type", "").lower()

    return content, None, content_type


def _download_files(document_links: list[dict], output_dir: Path, context, page=None, max_docs: int | None = None) -> list[dict]:
    """Descarga los documentos reutilizando la sesión de Playwright.

    Primero intenta descargar con el navegador (usando el evento `download`)
    para aprovechar la sesión ya validada con CAPTCHA. Si falla, usa
    requests.Session con las cookies como fallback.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    if max_docs is not None and max_docs > 0:
        total_links = document_links[:max_docs]
        logger.info("Limitando descarga a %d de %d documentos", len(total_links), len(document_links))
    else:
        total_links = document_links

    # Preferir descarga vía navegador si tenemos la página activa.
    if page is not None:
        try:
            return _download_files_with_browser(total_links, output_dir, page)
        except Exception as exc:
            logger.warning("Descarga vía navegador falló, usando fallback HTTP: %s", exc)

    return _download_files_with_requests(total_links, output_dir, context)


def _resolve_secop_download_body(page, initial_href: str) -> tuple[bytes, str]:
    """Obtiene el cuerpo binario real de un documento SECOP II.

    SECOP II responde al endpoint DownloadFile con un HTML que contiene un
    JavaScript de redirección hacia /Public/Archive/RetrieveFile/Index. Esta
    función sigue esa redirección usando el contexto HTTP de Playwright.
    """
    response = page.request.get(initial_href, timeout=60000)
    if not response.ok:
        raise RuntimeError(f"HTTP {response.status}: {response.text()[:200]}")

    content = response.body()
    content_type = response.headers.get("content-type", "").lower()

    # Si ya es binario, retornar.
    if "html" not in content_type and len(content) > 1000:
        return content, content_type

    text = content.decode("utf-8", errors="ignore")
    match = re.search(r"/Public/Archive/RetrieveFile/Index\?([^'""<>\s]+)", text)
    if match:
        retrieve_url = "https://community.secop.gov.co/Public/Archive/RetrieveFile/Index?" + match.group(1)
        logger.info("Siguiendo redirección SECOP: %s", retrieve_url)
        r2 = page.request.get(retrieve_url, timeout=60000)
        if not r2.ok:
            raise RuntimeError(f"HTTP {r2.status} en redirección: {r2.text()[:200]}")
        return r2.body(), r2.headers.get("content-type", "").lower()

    return content, content_type


def _download_files_with_browser(document_links: list[dict], output_dir: Path, page) -> list[dict]:
    """Descarga documentos usando el contexto HTTP de Playwright.

    Al reutilizar la misma página que ya superó el CAPTCHA, las peticiones
    salen con las cookies de sesión validadas y SECOP II normalmente no
    vuelve a pedir CAPTCHA por cada archivo.
    """
    results = []

    for idx, link in enumerate(document_links, start=1):
        href = link["href"]
        text = link.get("text") or f"documento_{idx}"
        safe_name = _safe_filename(None, text, idx)
        if not Path(safe_name).suffix:
            safe_name += ".pdf"
        dest_path = output_dir / safe_name

        logger.info("Descargando con navegador [%d/%d] %s", idx, len(document_links), safe_name)

        try:
            content, content_type = _resolve_secop_download_body(page, href)

            # Ajustar extensión según Content-Type (más confiable) o magic bytes.
            if "pdf" in content_type:
                safe_name = _set_extension(safe_name, ".pdf")
                dest_path = output_dir / safe_name
            elif "excel" in content_type or "spreadsheet" in content_type:
                safe_name = _set_extension(safe_name, ".xlsx")
                dest_path = output_dir / safe_name
            elif "word" in content_type or "document" in content_type:
                safe_name = _set_extension(safe_name, ".docx")
                dest_path = output_dir / safe_name
            elif content[:4] == b"%PDF":
                safe_name = _set_extension(safe_name, ".pdf")
                dest_path = output_dir / safe_name
            elif content[:4] == b"PK\x03\x04":
                # Office Open XML: inspeccionar el ZIP para distinguir docx/xlsx.
                ext = _detect_ooxml_extension(content)
                if ext:
                    safe_name = _set_extension(safe_name, ext)
                    dest_path = output_dir / safe_name
            elif content[:5].lower() == b"<?xml" or content[:4].lower() == b"<htm":
                # Si SECOP sigue devolviendo HTML, es probablemente una página de error/CAPTCHA.
                raise RuntimeError(f"Respuesta HTML inesperada ({len(content)} bytes): {content[:200]}")

            dest_path = _unique_dest_path(output_dir, safe_name)
            safe_name = dest_path.name
            with open(dest_path, "wb") as f:
                f.write(content)

            results.append({
                "nombre": text,
                "filename": safe_name,
                "path": str(dest_path),
                "url": href,
                "size_bytes": len(content),
                "ok": True,
            })
        except Exception as exc:
            logger.exception("Error descargando %s con navegador", href)
            results.append({
                "nombre": text,
                "filename": safe_name,
                "path": None,
                "url": href,
                "size_bytes": 0,
                "ok": False,
                "error": str(exc),
            })

    return results


def _download_files_with_requests(document_links: list[dict], output_dir: Path, context) -> list[dict]:
    """Descarga los documentos usando requests.Session con las cookies de Playwright."""
    results = []
    session = requests.Session()

    for cookie in context.cookies():
        session.cookies.set(
            cookie["name"], cookie["value"], domain=cookie.get("domain")
        )

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/pdf,application/octet-stream,*/*",
    }

    for idx, link in enumerate(document_links, start=1):
        href = link["href"]
        text = link.get("text") or f"documento_{idx}"
        safe_name = _safe_filename(None, text, idx)

        # Si el nombre no tiene extensión, asumimos PDF por defecto.
        if not Path(safe_name).suffix:
            safe_name += ".pdf"

        dest_path = output_dir / safe_name
        logger.info("Descargando con requests [%d/%d] %s", idx, len(document_links), safe_name)

        try:
            content, real_url, content_type = _resolve_real_download(session, href, headers)

            # Ajustar extensión según Content-Type o magic bytes si es necesario.
            if content[:4] == b"%PDF" or "pdf" in content_type:
                safe_name = _set_extension(safe_name, ".pdf")
                dest_path = output_dir / safe_name
            elif content[:4] == b"PK\x03\x04" or "excel" in content_type or "spreadsheet" in content_type:
                safe_name = _set_extension(safe_name, ".xlsx")
                dest_path = output_dir / safe_name
            elif "word" in content_type or "document" in content_type:
                safe_name = _set_extension(safe_name, ".docx")
                dest_path = output_dir / safe_name

            dest_path = _unique_dest_path(output_dir, safe_name)
            safe_name = dest_path.name
            with open(dest_path, "wb") as f:
                f.write(content)
            results.append({
                "nombre": text,
                "filename": safe_name,
                "path": str(dest_path),
                "url": real_url or href,
                "size_bytes": len(content),
                "ok": True,
            })
        except Exception as exc:
            logger.exception("Error descargando %s: %s", href, exc)
            results.append({
                "nombre": text,
                "filename": safe_name,
                "path": None,
                "url": href,
                "size_bytes": 0,
                "ok": False,
                "error": str(exc),
            })

    return results


def _procesar_un_proceso(
    page,
    context,
    proceso: Proceso,
    db: Session,
    timeout_seconds: int,
    resolver_captcha_manual: bool = True,
) -> dict:
    """Descarga los documentos de un único proceso usando una página/navegador ya abiertos.

    Permite reutilizar la sesión del navegador para procesar múltiples procesos
    (modo batch). Si aparece un CAPTCHA, espera a que el usuario lo resuelva
    cuando `resolver_captcha_manual=True`.
    """
    notice_uid = _notice_uid_from_url(proceso.url_documento)
    if not notice_uid:
        return {"ok": False, "error": "El proceso no tiene url_documento válida con noticeUID"}

    output_base = Path(SCOP_SCRAPER_STORAGE)
    if not output_base.is_absolute():
        output_base = (Path(__file__).resolve().parent / output_base).resolve()
    output_dir = output_base / str(proceso.id)

    # Limpiar descargas previas de este proceso para evitar duplicados y
    # archivos corruptos (p. ej. HTMLs de redirección de intentos fallidos).
    logger.info("Limpiando documentos previos del proceso %s", proceso.id)
    db.query(DocumentoProceso).filter(DocumentoProceso.proceso_id == proceso.id).delete()
    db.commit()
    if output_dir.exists():
        shutil.rmtree(output_dir)

    detail_url = f"{BASE_DETAIL_URL}?noticeUID={notice_uid}"

    try:
        logger.info("Navegando a %s", detail_url)
        page.goto(detail_url, wait_until="domcontentloaded", timeout=120000)

        if resolver_captcha_manual:
            print(f"MODO MANUAL [{proceso.numero_proceso}]: resuelve el CAPTCHA si aparece...")
            print(f"  URL: {page.url}")
            print(f"  Title: {page.title()}")
            if not _wait_for_detail_page(page, timeout_seconds=timeout_seconds):
                print(f"  TIMEOUT. URL final: {page.url}")
                return {
                    "ok": False,
                    "error": "No se resolvió el CAPTCHA en el tiempo esperado",
                }
            print(f"  CAPTCHA resuelto / página cargada. URL final: {page.url}")

        # Extraer y descargar documentos.
        document_links = _extract_document_links(page)
        if not document_links:
            return {"ok": True, "descargados": 0, "errores": 0, "documentos": []}

        # Ordenar por relevancia para asegurar que el pliego, anexos técnicos,
        # matrices y formatos entren dentro del límite.
        document_links = sorted(
            document_links,
            key=lambda link: _prioridad_documento(link.get("text", "")),
            reverse=True,
        )

        # Limitar a los documentos más relevantes para evitar decenas de CAPTCHAs
        # y descargas innecesarias. Con 25 entran pliego, anexos, especificaciones,
        # matrices de experiencia/indicadores y formatos clave.
        max_docs = int(os.getenv("SCOP_SCRAPER_MAX_DOCS", "25"))
        downloaded = _download_files(document_links, output_dir, context, page=page, max_docs=max_docs)

        # Persistir en base de datos.
        for item in downloaded:
            doc = DocumentoProceso(
                proceso_id=proceso.id,
                nombre=item["nombre"],
                filename=item["filename"],
                path=item["path"] or "",
                url=item["url"],
                size_bytes=item["size_bytes"],
                es_pliego=_is_pliego(item["nombre"]),
                estado="descargado" if item["ok"] else "error",
                error=item.get("error"),
            )
            db.add(doc)
        db.commit()

        ok_count = sum(1 for d in downloaded if d["ok"])
        error_count = len(downloaded) - ok_count

        return {
            "ok": error_count == 0,
            "descargados": ok_count,
            "errores": error_count,
            "documentos": downloaded,
        }

    except Exception as exc:
        logger.exception("Error procesando proceso %s: %s", proceso.id, exc)
        return {"ok": False, "error": str(exc)}


def descargar_documentos_proceso(
    proceso: Proceso,
    db: Session,
    timeout_seconds: int | None = None,
) -> dict:
    """Descarga documentos de un proceso de SECOP II y los guarda en disco/BD.

    Retorna un dict con:
        - ok: bool
        - descargados: int
        - errores: int
        - documentos: list[dict]
        - error: str | None
    """
    if not SCOP_SCRAPER_ENABLED:
        return {"ok": False, "error": "Scraper deshabilitado (SCOP_SCRAPER_ENABLED=false)"}

    timeout_seconds = timeout_seconds or SCOP_SCRAPER_TIMEOUT
    sitekey = "6LcMmakZAAAAAB157Q90hORUGtNd790TCws4vBNw"
    detail_url = f"{BASE_DETAIL_URL}?noticeUID={_notice_uid_from_url(proceso.url_documento)}"

    playwright = None
    context = None
    user_data_dir = None

    try:
        token = _solve_captcha(sitekey, detail_url, timeout=timeout_seconds)
        if token:
            logger.info("Token de reCAPTCHA obtenido (%s...)", token[:30])

        use_nopecha_ext = CAPTCHA_SOLVER == "nopecha_extension"
        playwright, context, user_data_dir = _launch_browser(
            headless=False, load_nopecha_extension=use_nopecha_ext
        )
        page = context.new_page()

        if token:
            page.goto(detail_url, wait_until="domcontentloaded", timeout=120000)
            page.wait_for_selector(".g-recaptcha", timeout=30000)
            _inject_recaptcha_token(page, token)
            if not _wait_for_detail_page(page, timeout_seconds=30):
                return {"ok": False, "error": "El token no fue aceptado por SECOP II"}
            return _procesar_un_proceso(page, context, proceso, db, timeout_seconds, resolver_captcha_manual=False)

        return _procesar_un_proceso(page, context, proceso, db, timeout_seconds, resolver_captcha_manual=True)

    except Exception as exc:
        logger.exception("Error en scraper SECOP II: %s", exc)
        return {"ok": False, "error": str(exc)}

    finally:
        if context:
            context.close()
        if playwright:
            playwright.stop()
        if user_data_dir:
            shutil.rmtree(user_data_dir, ignore_errors=True)


def descargar_documentos_procesos_batch(
    procesos: list[Proceso],
    db: Session,
    timeout_seconds: int | None = None,
) -> list[dict]:
    """Descarga documentos de múltiples procesos reutilizando una sola sesión de navegador.

    Útil para modo manual: el usuario resuelve el CAPTCHA una vez al inicio y,
    si SECOP mantiene la sesión, los procesos siguientes pueden cargar sin
    volver a pedir CAPTCHA.

    Retorna una lista de dicts con el resultado de cada proceso.
    """
    if not SCOP_SCRAPER_ENABLED:
        return [{"ok": False, "error": "Scraper deshabilitado (SCOP_SCRAPER_ENABLED=false)"}]

    if not procesos:
        return []

    timeout_seconds = timeout_seconds or SCOP_SCRAPER_TIMEOUT
    use_nopecha_ext = CAPTCHA_SOLVER == "nopecha_extension"

    playwright = None
    context = None
    user_data_dir = None
    resultados = []

    try:
        playwright, context, user_data_dir = _launch_browser(
            headless=False, load_nopecha_extension=use_nopecha_ext
        )
        page = context.new_page()

        print("=" * 60)
        print(f"MODO BATCH: se descargarán {len(procesos)} procesos")
        print("Se abrió una ventana de Chrome. Resuelve el CAPTCHA cuando aparezca.")
        print("=" * 60)

        for idx, proceso in enumerate(procesos, start=1):
            print(f"\n[{idx}/{len(procesos)}] Procesando {proceso.numero_proceso} (ID {proceso.id})")
            resultado = _procesar_un_proceso(page, context, proceso, db, timeout_seconds, resolver_captcha_manual=True)
            resultado["proceso_id"] = proceso.id
            resultado["numero_proceso"] = proceso.numero_proceso
            resultados.append(resultado)

            status = "OK" if resultado.get("ok") else "ERROR"
            descargados = resultado.get("descargados", 0)
            errores = resultado.get("errores", 0)
            print(f"   → {status} | {descargados} descargados, {errores} errores | {resultado.get('error', '')}")

        print("\n" + "=" * 60)
        print("Batch finalizado.")
        print("=" * 60)
        return resultados

    except Exception as exc:
        logger.exception("Error en batch scraper SECOP II: %s", exc)
        resultados.append({"ok": False, "error": str(exc)})
        return resultados

    finally:
        if context:
            context.close()
        if playwright:
            playwright.stop()
        if user_data_dir:
            shutil.rmtree(user_data_dir, ignore_errors=True)
