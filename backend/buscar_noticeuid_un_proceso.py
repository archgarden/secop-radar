"""Busca el noticeUID de un único proceso en SECOP II.

Uso:
    cd backend
    source .venv/bin/activate
    python buscar_noticeuid_un_proceso.py <proceso_id> [--wait-seconds 120] [--auto-descargar]

Abre Chrome (con NopeCHA si está configurado), resuelve el CAPTCHA y extrae el noticeUID.
"""

import argparse
import json
import sys
import time
from pathlib import Path

from database import SessionLocal
from models import Proceso
from secop_scraper import CAPTCHA_SOLVER, _launch_browser
from secop_search import buscar_notice_uid_en_buscador

OUTPUT_JSON = Path(__file__).resolve().parent.parent / "storage" / "noticeuid_un_proceso.json"
DIAG_DIR = Path(__file__).resolve().parent.parent / "storage" / "diagnostico_noticeuid"
DIAG_DIR.mkdir(exist_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Busca noticeUID de un proceso en SECOP II.")
    parser.add_argument("proceso_id", type=int, help="ID del proceso en la BD")
    parser.add_argument("--wait-seconds", type=int, default=120, help="Segundos para resolver CAPTCHA antes de buscar")
    parser.add_argument("--auto-descargar", action="store_true", help="Actualizar url_documento y descargar documentos si se encuentra noticeUID")
    args = parser.parse_args()

    db = SessionLocal()
    proceso = db.query(Proceso).filter(Proceso.id == args.proceso_id).first()
    if not proceso:
        print(f"Proceso {args.proceso_id} no encontrado")
        sys.exit(1)

    numero = proceso.numero_proceso
    entidad = proceso.entidad
    print(f"Buscando noticeUID para proceso {args.proceso_id}: {numero} ({entidad})")

    use_nopecha_ext = CAPTCHA_SOLVER == "nopecha_extension"
    playwright = None
    context = None
    user_data_dir = None
    notice_uid = None
    detail_url = None

    try:
        playwright, context, user_data_dir = _launch_browser(
            headless=False, load_nopecha_extension=use_nopecha_ext
        )
        page = context.new_page()

        notice_uid = buscar_notice_uid_en_buscador(page, proceso, timeout_captcha=args.wait_seconds)
        if notice_uid:
            detail_url = f"https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID={notice_uid}"
            print(f"→ noticeUID encontrado: {notice_uid}")
            print(f"→ URL de detalle: {detail_url}")
        else:
            print("→ No se encontró noticeUID")

        # Guardar diagnóstico.
        diag_html = DIAG_DIR / f"{args.proceso_id}_resultado.html"
        diag_png = DIAG_DIR / f"{args.proceso_id}_resultado.png"
        try:
            diag_html.write_text(page.content(), encoding="utf-8")
            page.screenshot(path=str(diag_png), full_page=True)
            print(f"Diagnóstico guardado en {diag_html} y {diag_png}")
        except Exception as exc:
            print(f"No se pudo guardar diagnóstico: {exc}")

    finally:
        if context:
            context.close()
        if playwright:
            playwright.stop()
        if user_data_dir:
            import shutil
            shutil.rmtree(user_data_dir, ignore_errors=True)

    resultado = {
        "id": args.proceso_id,
        "numero_proceso": numero,
        "entidad": entidad,
        "notice_uid": notice_uid,
        "detail_url": detail_url,
    }
    OUTPUT_JSON.write_text(json.dumps(resultado, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nResultado guardado en {OUTPUT_JSON}")

    if notice_uid and args.auto_descargar:
        proceso.url_documento = detail_url
        db.commit()
        print("URL de detalle actualizada en la BD.")
        print("Ahora descargando documentos...")
        from secop_scraper import descargar_documentos_proceso
        res = descargar_documentos_proceso(proceso, db)
        print(json.dumps(res, indent=2, default=str))

    db.close()


if __name__ == "__main__":
    main()
