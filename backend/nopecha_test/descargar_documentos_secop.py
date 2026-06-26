"""
Prototipo: descarga automática de documentos de un proceso SECOP II usando
Playwright + extensión NopeCHA.

ADVERTENCIA: Este script es solo para validación técnica. Usar NopeCHA contra
SECOP II puede violar los términos de uso de Colombia Compra Eficiente.
Úsalo bajo tu propia responsabilidad.

Uso:
    python descargar_documentos_secop.py CO1.NTC.xxxxxxxx [directorio_salida]

Requisitos:
    - Python 3.10+
    - Playwright instalado
    - Extensión NopeCHA descomprimida en ./nopecha_ext
    - Navegador Chromium instalado (playwright install chromium)
    - Una IP residencial o API key de NopeCHA con créditos disponibles.
"""

import argparse
import json
import logging
import shutil
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from playwright.sync_api import sync_playwright

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("secop_downloader")

EXT_DIR = Path(__file__).resolve().parent / "nopecha_ext"
BASE_DETAIL_URL = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index"
RETRIEVE_FILE_PATH = "/Public/Areas/Archive/RetrieveFile.aspx"


def build_detail_url(notice_uid: str) -> str:
    return f"{BASE_DETAIL_URL}?noticeUID={notice_uid}"


def ensure_extension() -> None:
    if not EXT_DIR.exists():
        logger.error("No se encontró la extensión NopeCHA en %s", EXT_DIR)
        logger.info(
            "Descárgala desde https://nopecha.com/chrome "
            "y descomprime el .crx en la carpeta nopecha_ext."
        )
        sys.exit(1)


def launch_browser_with_nopecha():
    """Lanza Chromium con la extensión NopeCHA cargada."""
    ensure_extension()
    user_data_dir = tempfile.mkdtemp(prefix="nopecha_profile_")
    logger.info("Peril temporal de Chrome: %s", user_data_dir)

    playwright = sync_playwright().start()
    context = playwright.chromium.launch_persistent_context(
        user_data_dir,
        headless=False,
        args=[
            f"--disable-extensions-except={EXT_DIR}",
            f"--load-extension={EXT_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
        ],
        viewport={"width": 1366, "height": 768},
    )
    return playwright, context, user_data_dir


def wait_for_captcha_resolution(page, timeout_seconds: int = 120) -> bool:
    """Espera a que NopeCHA resuelva el reCAPTCHA y el portal redirija."""
    logger.info("Esperando resolución de CAPTCHA (máx %ds)...", timeout_seconds)
    for i in range(timeout_seconds):
        time.sleep(1)
        current_url = page.url
        title = page.title()

        if i % 10 == 0:
            logger.info("  [%ds] URL=%s | title=%s", i, current_url, title)

        # Si ya no estamos en la página intermedia de reCAPTCHA, asumimos éxito.
        if "ReCaptcha" not in title and "GoogleReCaptcha" not in current_url:
            logger.info("CAPTCHA superado después de %ds", i)
            return True

    logger.warning("No se superó el CAPTCHA en %ds", timeout_seconds)
    return False


def extract_document_links(page) -> list[dict]:
    """Extrae todos los enlaces de descarga de documentos del detalle del proceso."""
    logger.info("Extrayendo enlaces de documentos...")

    # Esperamos que la pestaña Documentación esté renderizada.
    # SECOP II carga el contenido por AJAX, así que damos un margen.
    page.wait_for_load_state("networkidle", timeout=60000)
    time.sleep(3)

    links = page.eval_on_selector_all(
        f'a[href*="{RETRIEVE_FILE_PATH}"]',
        """elements => elements.map(e => ({
            text: e.innerText.trim(),
            href: e.href,
            filename: e.getAttribute('title') || e.innerText.trim()
        }))""",
    )

    # Deduplicamos por href.
    seen = set()
    unique_links = []
    for link in links:
        href = link.get("href", "")
        if href and href not in seen:
            seen.add(href)
            unique_links.append(link)

    logger.info("Documentos únicos encontrados: %d", len(unique_links))
    return unique_links


def parse_retrieve_params(href: str) -> dict:
    """Extrae key y filename de un enlace RetrieveFile.aspx."""
    parsed = urlparse(href)
    qs = parse_qs(parsed.query)
    return {
        "key": qs.get("key", [""])[0],
        "filename": qs.get("filename", [""])[0],
    }


def download_documents(document_links: list[dict], output_dir: Path, context) -> list[dict]:
    """Descarga los documentos usando cookies de la sesión de Playwright."""
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []

    # Copiamos las cookies del contexto de Playwright a requests para que
    # las descargas de documentos respeten la sesión autenticada por CAPTCHA.
    session = requests.Session()
    for cookie in context.cookies():
        session.cookies.set(cookie["name"], cookie["value"], domain=cookie.get("domain"))

    for idx, link in enumerate(document_links, start=1):
        href = link["href"]
        text = link.get("text", f"documento_{idx}")
        params = parse_retrieve_params(href)
        filename = params["filename"] or f"doc_{idx}.pdf"
        # Limpieza básica del nombre.
        safe_name = "".join(c for c in filename if c.isalnum() or c in " ._-").strip()
        if not safe_name:
            safe_name = f"doc_{idx}"

        dest_path = output_dir / safe_name
        logger.info("Descargando [%d/%d] %s -> %s", idx, len(document_links), text, dest_path.name)

        try:
            r = session.get(href, timeout=120, allow_redirects=True)
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                f.write(r.content)
            results.append({
                "nombre": text,
                "url": href,
                "archivo": str(dest_path),
                "bytes": len(r.content),
                "ok": True,
            })
        except Exception as exc:
            logger.exception("Error descargando %s: %s", href, exc)
            results.append({
                "nombre": text,
                "url": href,
                "archivo": None,
                "bytes": 0,
                "ok": False,
                "error": str(exc),
            })

    return results


def save_metadata(notice_uid: str, detail_url: str, output_dir: Path, results: list[dict]) -> None:
    metadata = {
        "notice_uid": notice_uid,
        "detail_url": detail_url,
        "total_documentos": len(results),
        "descargados": sum(1 for r in results if r["ok"]),
        "errores": sum(1 for r in results if not r["ok"]),
        "documentos": results,
    }
    meta_path = output_dir / "metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    logger.info("Metadata guardada en %s", meta_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Descarga documentos SECOP II con NopeCHA")
    parser.add_argument("notice_uid", help="UID del aviso, ej: CO1.NTC.10222436")
    parser.add_argument("output_dir", nargs="?", default="./secop_docs", help="Directorio de salida")
    parser.add_argument("--timeout", type=int, default=120, help="Segundos máximos esperando CAPTCHA")
    args = parser.parse_args()

    detail_url = build_detail_url(args.notice_uid)
    output_dir = Path(args.output_dir) / args.notice_uid

    playwright, context, user_data_dir = launch_browser_with_nopecha()
    page = context.new_page()

    try:
        logger.info("Navegando a %s", detail_url)
        page.goto(detail_url, wait_until="domcontentloaded", timeout=120000)

        if not wait_for_captcha_resolution(page, timeout_seconds=args.timeout):
            screenshot_path = output_dir / "captcha_timeout.png"
            screenshot_path.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(screenshot_path), full_page=True)
            logger.info("Screenshot guardado en %s", screenshot_path)
            logger.error("No fue posible superar el CAPTCHA. "
                         "Verifica que NopeCHA tenga créditos disponibles.")
            return

        # Tomamos screenshot de la página de detalle para verificación visual.
        screenshot_path = output_dir / "opportunity_detail.png"
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot_path), full_page=True)
        logger.info("Screenshot de detalle guardado en %s", screenshot_path)

        document_links = extract_document_links(page)
        if not document_links:
            logger.warning("No se encontraron documentos en la página.")
            return

        results = download_documents(document_links, output_dir, context)
        save_metadata(args.notice_uid, detail_url, output_dir, results)

    finally:
        context.close()
        playwright.stop()
        shutil.rmtree(user_data_dir, ignore_errors=True)
        logger.info("Perfil temporal eliminado")


if __name__ == "__main__":
    main()
