"""Diagnóstico del buscador de SECOP II.

Abre Chrome, espera a que se resuelva el CAPTCHA manualmente y luego imprime
los campos de entrada disponibles en la página de búsqueda.
"""

import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

SEARCH_URL = "https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index"


def main():
    wait_seconds = int(sys.argv[1]) if len(sys.argv) > 1 else 60

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=120000)
        print(f"URL: {page.url}")
        print(f"Título: {page.title()}")
        print(f"Tienes {wait_seconds}s para resolver el CAPTCHA...")
        time.sleep(wait_seconds)

        print("\n--- Inputs en la página ---")
        inputs = page.locator("input").all()
        for i, inp in enumerate(inputs):
            try:
                attrs = {}
                for attr in ["name", "id", "type", "placeholder", "class"]:
                    attrs[attr] = inp.get_attribute(attr)
                visible = inp.is_visible(timeout=2000)
                print(f"{i}: {attrs} visible={visible}")
            except Exception as exc:
                print(f"{i}: error leyendo input: {exc}")

        print("\n--- Botones en la página ---")
        buttons = page.locator("button").all()
        for i, btn in enumerate(buttons):
            try:
                text = btn.inner_text().strip()[:60]
                attrs = {}
                for attr in ["name", "id", "type", "class"]:
                    attrs[attr] = btn.get_attribute(attr)
                print(f"{i}: text='{text}' attrs={attrs}")
            except Exception as exc:
                print(f"{i}: error leyendo botón: {exc}")

        # Guardar HTML para análisis manual.
        html_path = Path(__file__).resolve().parent.parent / "storage" / "diagnostico_buscador_secop.html"
        html_path.write_text(page.content(), encoding="utf-8")
        print(f"\nHTML guardado en {html_path}")

        browser.close()


if __name__ == "__main__":
    main()
