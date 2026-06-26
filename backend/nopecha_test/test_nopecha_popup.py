"""Abre el popup de NopeCHA para verificar estado de la extensión."""
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

EXT_DIR = Path(__file__).resolve().parent / "nopecha_ext"
POPUP_URL = "chrome-extension://dknlfmjaanfblgfdfebhijalfmhmjjjo/assets/svndki.html"

with sync_playwright() as p:
    user_data_dir = tempfile.mkdtemp(prefix="nopecha_profile_")
    context = p.chromium.launch_persistent_context(
        user_data_dir,
        headless=False,
        args=[
            f"--disable-extensions-except={EXT_DIR}",
            f"--load-extension={EXT_DIR}",
            "--no-first-run",
            "--no-default-browser-check",
        ],
    )
    page = context.new_page()
    page.goto(POPUP_URL, wait_until="domcontentloaded")
    time.sleep(3)
    print("Popup title:", page.title())
    print("Popup text:", page.inner_text("body"))
    page.screenshot(path=str(Path(__file__).resolve().parent / "nopecha_popup.png"), full_page=True)
    context.close()
