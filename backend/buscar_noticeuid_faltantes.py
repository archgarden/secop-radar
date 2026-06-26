"""Busca noticeUID faltantes para los 14 procesos de la muestra sin descargar.

Algunos procesos de la muestra de 100 pliegos tienen `url_documento` apuntando
a la página de login de SECOP en lugar de la URL de detalle. Este script usa
Playwright para buscar cada proceso en el buscador público de SECOP II y extraer
el noticeUID real del primer resultado.

Uso interactivo (CAPTCHA manual):
    cd backend
    source .venv/bin/activate
    python buscar_noticeuid_faltantes.py

Uso no interactivo / headless:
    python buscar_noticeuid_faltantes.py --headless --auto-wait 10

El resultado se guarda en `storage/noticeuid_faltantes.json`.
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
MUESTRA_CSV = STORAGE_PATH / "muestra_100_pliegos.csv"
PROCESOS_DIR = STORAGE_PATH / "procesos"
OUTPUT_JSON = STORAGE_PATH / "noticeuid_faltantes.json"
DIAG_DIR = STORAGE_PATH / "diagnostico_noticeuid"
DIAG_DIR.mkdir(exist_ok=True)

SEARCH_URLS = [
    "https://community.secop.gov.co/Public/Tendering/ContractNoticeManagement/Index",
    "https://community.secop.gov.co/Public/Tendering/OpportunityNoticesList/Index",
    "https://community.secop.gov.co/Public/Tendering/Index",
]


def _procesos_faltantes() -> list[dict]:
    df = pd.read_csv(MUESTRA_CSV)
    existentes = {int(d.name) for d in PROCESOS_DIR.iterdir() if d.is_dir() and d.name.isdigit()}
    faltantes = []
    for _, row in df.iterrows():
        pid = int(row["id"])
        if pid not in existentes:
            faltantes.append({
                "id": pid,
                "numero_proceso": row.get("numero_proceso"),
                "entidad": row.get("entidad"),
                "url_documento": row.get("url_documento"),
            })
    return faltantes


def _extraer_notice_uid(url: str) -> str | None:
    if "noticeUID" not in url:
        return None
    return parse_qs(urlparse(url).query).get("noticeUID", [None])[0]


def main():
    parser = argparse.ArgumentParser(description="Busca noticeUID de procesos faltantes en SECOP II.")
    parser.add_argument("--headless", action="store_true", help="Ejecutar Chrome sin ventana visible.")
    parser.add_argument("--auto-wait", type=int, default=None, help="Segundos de espera automática antes de buscar (modo no interactivo).")
    parser.add_argument("--wait-seconds", type=int, default=None, help="Segundos de espera para resolver CAPTCHA antes de continuar automáticamente.")
    parser.add_argument("--dry-run", action="store_true", help="Solo listar los procesos faltantes sin abrir navegador.")
    args = parser.parse_args()

    if not MUESTRA_CSV.exists():
        print(f"No se encontró {MUESTRA_CSV}")
        sys.exit(1)

    faltantes = _procesos_faltantes()
    print(f"Procesos faltantes: {len(faltantes)}")
    for p in faltantes:
        print(f"  - ID {p['id']}: {p['numero_proceso']} ({p['entidad'][:40]}...)")

    if not faltantes:
        print("No hay procesos faltantes.")
        return

    if args.dry_run:
        print("\nDry-run: no se abre el navegador.")
        print(f"Guarda esta lista y ejecuta sin --dry-run para buscar sus noticeUID:\n")
        for p in faltantes:
            print(f"  ID {p['id']}: {p['numero_proceso']} ({p['entidad']})")
        return

    resultados = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        context = browser.new_context(viewport={"width": 1400, "height": 900})
        page = context.new_page()

        print("\nNavegando al buscador de SECOP II...")

        search_url = None
        for candidate in SEARCH_URLS:
            try:
                page.goto(candidate, wait_until="domcontentloaded", timeout=60000)
                if "cannot be found" not in page.content().lower():
                    search_url = candidate
                    print(f"URL funcional: {candidate}")
                    break
            except Exception as exc:
                print(f"Falló {candidate}: {exc}")

        if not search_url:
            print("Ninguna URL de búsqueda funcionó.")
            return

        if args.headless and args.auto_wait:
            print(f"Esperando {args.auto_wait}s (modo headless)...")
            time.sleep(args.auto_wait)
        elif args.wait_seconds:
            print(f"Se abrió Chrome. Tienes {args.wait_seconds}s para resolver el CAPTCHA.")
            print("El script continuará automáticamente.")
            time.sleep(args.wait_seconds)
        else:
            print("Se abrió Chrome. Resuelve el CAPTCHA cuando aparezca.")
            input("Presiona Enter cuando el buscador esté listo (después de resolver CAPTCHA)...")

        # Detectar selector de búsqueda (preferir avanzado porque es visible).
        search_input = None
        search_button = None

        for selector in ["#txtProcedureDataAdvancedSearch", "input[name='VB_txtProcedureDataAdvancedSearch']"]:
            try:
                el = page.locator(selector).first
                if el.is_visible(timeout=5000):
                    search_input = el
                    print(f"Campo de búsqueda avanzada detectado: {selector}")
                    break
            except Exception:
                continue

        for selector in ["#btnSearchButton", "button[name='btnSearchButton']"]:
            try:
                el = page.locator(selector).first
                if el.is_visible(timeout=5000):
                    search_button = el
                    print(f"Botón de búsqueda avanzada detectado: {selector}")
                    break
            except Exception:
                continue

        # Fallback a búsqueda simple (usar JS porque puede estar oculto).
        if not search_input:
            for selector in ["#txtAllWords2Search", "input[name='VB_txtAllWords2Search']"]:
                try:
                    el = page.locator(selector).first
                    search_input = el
                    print(f"Campo de búsqueda simple detectado: {selector}")
                    break
                except Exception:
                    continue

        if not search_button:
            for selector in ["#btnGoButton", "input[name='btnGoButton']"]:
                try:
                    el = page.locator(selector).first
                    search_button = el
                    print(f"Botón de búsqueda simple detectado: {selector}")
                    break
                except Exception:
                    continue

        if not search_input or not search_button:
            print("No se detectó el campo o botón de búsqueda.")
            print("URL actual:", page.url)
            print("Título:", page.title())
            return

        for idx, proc in enumerate(faltantes, start=1):
            numero = proc["numero_proceso"]
            print(f"\n[{idx}/{len(faltantes)}] Buscando {numero}...")

            try:
                # Limpiar y escribir el número de proceso en el buscador.
                search_input.fill("")
                search_input.fill(numero)

                # Extraer mkey de la página para construir URL AJAX.
                mkey_match = re.search(r"mkey=([a-f0-9_]+)", page.content())
                mkey = mkey_match.group(1) if mkey_match else ""

                # Determinar si es búsqueda simple o avanzada.
                input_id = search_input.get_attribute("id") or ""
                if "AllWords" in input_id:
                    ajax_url = f"/Public/Tendering/ContractNoticeManagement/QuickSearchAjax?searchText={numero}&mkey={mkey}"
                else:
                    ajax_url = (
                        f"/Public/Tendering/ContractNoticeManagement/AdvancedSearchAjax2?"
                        f"perspective=All&initAction=Index&externalId=&logicalId=&fromMarketplace=&authorityVat=&"
                        f"companyData=&procedureData={numero}&pageNumber=0&startIndex=1&endIndex=5&"
                        f"currentPagingStyle=0&displayAdvancedParams=false&orderParam=RequestOnlinePublishingDateDESC&"
                        f"searchExecuted=False&reference=&description=&mainCategory=&mainCategoryText=&"
                        f"categorizationSystemCode=&region=&regulation=&requestStatus=&publishDateFrom=&publishDateTo=&"
                        f"tendersDeadlineFrom=&tendersDeadlineTo=&openDateFrom=&openDateTo=&companyCode=&mkey={mkey}"
                    )

                # Ejecutar búsqueda vía AJAX directamente.
                page.evaluate(
                    f"() => {{ "
                    f"  if (typeof getAction === 'function') {{ getAction('{ajax_url}', true); }}"
                    f"  else {{ document.getElementById('{search_button.get_attribute('id')}').click(); }}"
                    f"}}"
                )

                # Esperar resultados.
                try:
                    page.wait_for_selector(
                        "#tblMainTable_trRowMiddle_tdCell1_tblForm_trGridRow_tdCell1_grdResultList_tbl tr",
                        timeout=30000,
                    )
                except Exception:
                    pass
                time.sleep(3)

                # Guardar diagnóstico de la página de resultados.
                diag_html = DIAG_DIR / f"{proc['id']}_resultado.html"
                diag_png = DIAG_DIR / f"{proc['id']}_resultado.png"
                diag_html.write_text(page.content(), encoding="utf-8")
                try:
                    page.screenshot(path=str(diag_png), full_page=True)
                except Exception:
                    pass

                # Buscar enlaces a OpportunityDetail.
                links = page.locator("a[href*='OpportunityDetail/Index']").all()
                notice_uid = None
                for link in links:
                    href = link.get_attribute("href") or ""
                    notice_uid = _extraer_notice_uid(href)
                    if notice_uid:
                        break

                detail_url = None
                if notice_uid:
                    detail_url = f"https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID={notice_uid}"
                    print(f"   → noticeUID encontrado: {notice_uid}")
                else:
                    print(f"   → No se encontró noticeUID")

                resultados.append({
                    "id": proc["id"],
                    "numero_proceso": numero,
                    "entidad": proc["entidad"],
                    "notice_uid": notice_uid,
                    "detail_url": detail_url,
                })

            except Exception as exc:
                print(f"   → Error: {exc}")
                resultados.append({
                    "id": proc["id"],
                    "numero_proceso": numero,
                    "entidad": proc["entidad"],
                    "notice_uid": None,
                    "detail_url": None,
                    "error": str(exc),
                })

        browser.close()

    OUTPUT_JSON.write_text(json.dumps(resultados, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nResultados guardados en {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
