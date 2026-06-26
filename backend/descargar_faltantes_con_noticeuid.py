"""Actualiza url_documento de los procesos faltantes y los descarga.

Lee `storage/noticeuid_faltantes.json` generado por `buscar_noticeuid_faltantes.py`,
actualiza la columna `url_documento` de cada proceso en la BD con la URL de detalle
 correcta, y luego descarga sus documentos usando el scraper en modo batch.

Uso:
    cd backend
    source .venv/bin/activate
    SCOP_SCRAPER_ENABLED=true python descargar_faltantes_con_noticeuid.py

Opciones:
    --dry-run     Mostrar qué se actualizaría/descargaría sin tocar BD ni scraper.
    --force       Volver a descargar procesos que ya tengan documentos en disco.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Proceso
from secop_scraper import descargar_documentos_procesos_batch

load_dotenv()

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
NOTICEUID_JSON = STORAGE_PATH / "noticeuid_faltantes.json"
PROCESOS_DIR = STORAGE_PATH / "procesos"
LOG_JSON = STORAGE_PATH / "descarga_faltantes_con_noticeuid.json"

BASE_DETAIL_URL = "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index"


def _tiene_documentos_descargados(proceso_id: int) -> bool:
    proc_dir = PROCESOS_DIR / str(proceso_id)
    if not proc_dir.exists():
        return False
    files = [f for f in proc_dir.iterdir() if f.is_file() and not f.name.startswith(".")]
    return len(files) > 0


def main():
    parser = argparse.ArgumentParser(description="Descarga procesos faltantes usando noticeUID encontrados manualmente.")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar plan, no modificar BD ni descargar.")
    parser.add_argument("--force", action="store_true", help="Forzar re-descarga si ya existen documentos.")
    args = parser.parse_args()

    if not NOTICEUID_JSON.exists():
        print(f"No se encontró {NOTICEUID_JSON}")
        print("Ejecuta primero: python buscar_noticeuid_faltantes.py")
        sys.exit(1)

    scraper_enabled = os.getenv("SCOP_SCRAPER_ENABLED", "false").lower() in ("true", "1", "yes")
    if not scraper_enabled and not args.dry_run:
        print("ADVERTENCIA: SCOP_SCRAPER_ENABLED no está en true.")
        print("Ejecuta con: SCOP_SCRAPER_ENABLED=true python descargar_faltantes_con_noticeuid.py")
        sys.exit(1)

    with open(NOTICEUID_JSON, "r", encoding="utf-8") as f:
        encontrados = json.load(f)

    validos = [item for item in encontrados if item.get("notice_uid")]
    print(f"NoticeUID encontrados: {len(validos)} / {len(encontrados)}")

    if not validos:
        print("No hay noticeUID válidos para descargar.")
        return

    db = SessionLocal()
    try:
        procesos_para_descargar: list[Proceso] = []

        for item in validos:
            proceso_id = int(item["id"])
            notice_uid = item["notice_uid"]
            detail_url = f"{BASE_DETAIL_URL}?noticeUID={notice_uid}"

            proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
            if not proceso:
                print(f"  ID {proceso_id}: no existe en BD, se omite.")
                continue

            if args.dry_run:
                print(f"  ID {proceso_id}: actualizaría url_documento a {detail_url}")
                procesos_para_descargar.append(proceso)
                continue

            proceso.url_documento = detail_url
            print(f"  ID {proceso_id}: url_documento actualizada")

            ya_descargado = _tiene_documentos_descargados(proceso_id)
            if ya_descargado and not args.force:
                print(f"    → ya tiene documentos descargados, se salta (--force para re-descargar)")
                continue

            procesos_para_descargar.append(proceso)

        if not args.dry_run:
            db.commit()
            print(f"\nBD actualizada. Procesos a descargar: {len(procesos_para_descargar)}")

        if not procesos_para_descargar:
            print("No hay procesos para descargar.")
            return

        if args.dry_run:
            print(f"\nDry-run: descargaría {len(procesos_para_descargar)} procesos en modo batch.")
            return

        resultados = descargar_documentos_procesos_batch(procesos_para_descargar, db)

        LOG_JSON.write_text(json.dumps(resultados, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nLog guardado en {LOG_JSON}")

        ok = sum(1 for r in resultados if r.get("ok"))
        errores = len(resultados) - ok
        print(f"Resumen: {ok} OK, {errores} errores")

    finally:
        db.close()


if __name__ == "__main__":
    main()
