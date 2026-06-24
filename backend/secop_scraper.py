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


def _is_pliego(nombre: str) -> bool:
    """Heurística para detectar si un documento es el pliego de condiciones."""
    # Normalizar separadores para que "documento_base" cuente como "documento base".
    nombre_norm = re.sub(r"[_.\-]+", " ", nombre.lower())
    return any(
        palabra in nombre_norm
        for palabra in [
            "pliego",
            "condiciones",
            "terminos",
            "términos",
            "base",
            "bases",
            "documento base",
            "documento base de contratacion",
        ]
    )


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

    # SECOP II carga todos los documentos en el DOM; no es necesario cambiar de pestaña.
    # La tabla de documentos tiene id grdGridDocumentList.
    document_data = page.eval_on_selector_all(
        'table#grdGridDocumentList_tbl tbody tr[id^="grdGridDocumentList_tr"]',
        """rows => rows.map((row, idx) => {
            const nameSpan = row.querySelector('span[id^="tdColumnDocumentNameP2Gen_spnDocumentName_"]');
            const link = row.querySelector('a[id^="lnkDownloadLinkP3Gen_"]');
            const onclick = link ? link.getAttribute('onclick') : '';
            const idMatch = onclick.match(/documentFileId='\s*\+\s*'(\d+)'/);
            const mkeyMatch = onclick.match(/[&?]mkey=([a-f0-9\-_]+)/);
            return {
                text: nameSpan ? nameSpan.innerText.trim() : `documento_${idx}`,
                documentFileId: idMatch ? idMatch[1] : null,
                mkey: mkeyMatch ? mkeyMatch[1] : null,
                onclick: onclick
            };
        })""",
    )

    base_url = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/DownloadFile"
    links = []
    for item in document_data:
        doc_id = item.get("documentFileId")
        mkey = item.get("mkey")
        if doc_id and mkey:
            href = f"{base_url}?documentFileId={doc_id}&mkey={mkey}"
            links.append({
                "text": item["text"],
                "href": href,
                "documentFileId": doc_id,
                "mkey": mkey,
            })

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


def _download_files(document_links: list[dict], output_dir: Path, context) -> list[dict]:
    """Descarga los documentos usando las cookies de la sesión de Playwright."""
    output_dir.mkdir(parents=True, exist_ok=True)
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
        logger.info("Descargando [%d/%d] %s", idx, len(document_links), safe_name)

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

    notice_uid = _notice_uid_from_url(proceso.url_documento)
    if not notice_uid:
        return {"ok": False, "error": "El proceso no tiene url_documento válida con noticeUID"}

    output_base = Path(SCOP_SCRAPER_STORAGE)
    if not output_base.is_absolute():
        output_base = (Path(__file__).resolve().parent / output_base).resolve()
    output_dir = output_base / str(proceso.id)

    timeout_seconds = timeout_seconds or SCOP_SCRAPER_TIMEOUT
    detail_url = f"{BASE_DETAIL_URL}?noticeUID={notice_uid}"
    sitekey = "6LcMmakZAAAAAB157Q90hORUGtNd790TCws4vBNw"

    playwright = None
    context = None
    user_data_dir = None

    try:
        # 1. Resolver CAPTCHA con el servicio configurado (o None para modo manual).
        token = _solve_captcha(sitekey, detail_url, timeout=timeout_seconds)
        if token:
            logger.info("Token de reCAPTCHA obtenido (%s...)", token[:30])

        # 2. Abrir navegador (con extensión NopeCHA si está configurada).
        use_nopecha_ext = CAPTCHA_SOLVER == "nopecha_extension"
        playwright, context, user_data_dir = _launch_browser(
            headless=False, load_nopecha_extension=use_nopecha_ext
        )
        page = context.new_page()
        logger.info("Navegando a %s", detail_url)
        page.goto(detail_url, wait_until="domcontentloaded", timeout=120000)

        if token:
            # Modo automático: inyectar token.
            page.wait_for_selector(".g-recaptcha", timeout=30000)
            _inject_recaptcha_token(page, token)
            if not _wait_for_detail_page(page, timeout_seconds=30):
                return {"ok": False, "error": "El token no fue aceptado por SECOP II"}
        else:
            # Modo manual: esperar a que el usuario resuelva el CAPTCHA.
            print("MODO MANUAL: resuelve el CAPTCHA en la ventana de Chrome...")
            print(f"  URL inicial: {page.url}")
            print(f"  Title inicial: {page.title()}")
            if not _wait_for_detail_page(page, timeout_seconds=timeout_seconds):
                print(f"  TIMEOUT. URL final: {page.url}")
                return {"ok": False, "error": "No se resolvió el CAPTCHA en el tiempo esperado"}
            print(f"  CAPTCHA resuelto. URL final: {page.url}")

        # 3. Extraer y descargar documentos.
        document_links = _extract_document_links(page)
        if not document_links:
            return {"ok": True, "descargados": 0, "errores": 0, "documentos": []}

        downloaded = _download_files(document_links, output_dir, context)

        # 4. Persistir en base de datos.
        registros_db = []
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
            registros_db.append(doc)
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
        logger.exception("Error en scraper SECOP II: %s", exc)
        return {"ok": False, "error": str(exc)}

    finally:
        if context:
            context.close()
        if playwright:
            playwright.stop()
        if user_data_dir:
            shutil.rmtree(user_data_dir, ignore_errors=True)
