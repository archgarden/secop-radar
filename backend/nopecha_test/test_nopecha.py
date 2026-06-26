"""
Prototipo: descarga de documentos SECOP II con Playwright + extensión NopeCHA.

ADVERTENCIA: Este script es solo para validación técnica. Usar NopeCHA contra
SECOP II puede violar los términos de uso de Colombia Compra Eficiente.
Úsalo bajo tu propia responsabilidad.
"""
import os
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

NOTICE_UID = "CO1.NTC.10222436"
URL = f"https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID={NOTICE_UID}"

# Ruta donde se descomprimió la extensión NopeCHA
EXT_DIR = Path(__file__).resolve().parent / "nopecha_ext"


def main():
    if not EXT_DIR.exists():
        print(f"No se encontró la extensión en {EXT_DIR}")
        sys.exit(1)

    # Playwright requiere un directorio de perfil persistente para cargar extensiones.
    user_data_dir = tempfile.mkdtemp(prefix="nopecha_profile_")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,  # Las extensiones no funcionan en modo headless.
            args=[
                f"--disable-extensions-except={EXT_DIR}",
                f"--load-extension={EXT_DIR}",
                "--no-first-run",
                "--no-default-browser-check",
            ],
            viewport={"width": 1366, "height": 768},
        )

        page = context.new_page()
        print(f"Navegando a {URL}")
        page.goto(URL, wait_until="domcontentloaded", timeout=120000)

        # Esperamos un tiempo prudente para que NopeCHA resuelva el CAPTCHA
        # y el portal redirija a la página real del proceso.
        print("Esperando resolución de CAPTCHA por NopeCHA (puede tomar varios segundos)...")
        for i in range(60):
            time.sleep(2)
            current_url = page.url
            title = page.title()
            print(f"  [{i+1}] URL: {current_url} | Title: {title}")

            # Si ya no estamos en la página de ReCaptcha, asumimos éxito.
            if "ReCaptcha" not in title and "GoogleReCaptcha" not in current_url:
                print("CAPTCHA superado (aparentemente).")
                break
        else:
            print("No se logró superar el CAPTCHA en el tiempo esperado.")
            context.close()
            return

        # Esperar carga de contenido del proceso.
        page.wait_for_load_state("networkidle", timeout=60000)

        # Tomar screenshot para depuración.
        screenshot_path = Path(__file__).resolve().parent / "opportunity_detail.png"
        page.screenshot(path=str(screenshot_path), full_page=True)
        print(f"Screenshot guardado en {screenshot_path}")

        # Intentar extraer enlaces de documentos.
        # En SECOP II los documentos suelen estar en tablas con enlaces de descarga
        # que apuntan a /Public/Areas/Archive/RetrieveFile.aspx
        links = page.eval_on_selector_all(
            'a[href*="RetrieveFile.aspx"]',
            "elements => elements.map(e => ({text: e.innerText.trim(), href: e.href}))",
        )
        print(f"Enlaces de documentos encontrados: {len(links)}")
        for link in links[:20]:
            print(f"  - {link['text']}: {link['href']}")

        context.close()


if __name__ == "__main__":
    main()
