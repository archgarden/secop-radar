"""Descarga masiva de documentos para la muestra de 100 pliegos SECOP II.

Lee storage/muestra_100_pliegos.csv, filtra procesos descargables (con noticeUID),
e intenta descargar sus documentos usando el scraper existente.

Soporta reanudación: si un proceso ya tiene documentos descargados en disco,
por defecto se salta (usar --force para volver a descargar).

Uso:
    source backend/venv/bin/activate
    cd backend

    # Descargar todos los pliegos (requiere CAPTCHA manual o API key)
    python descargar_100_pliegos.py

    # Descargar máximo 5 procesos (útil para pruebas)
    python descargar_100_pliegos.py --max 5

    # Forzar re-descarga de procesos que ya tienen documentos
    python descargar_100_pliegos.py --force

    # Usar solucionador automático (requiere CAPTCHA_API_KEY en .env)
    CAPTCHA_SOLVER=2captcha python descargar_100_pliegos.py --max 10
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from database import SessionLocal
from models import DocumentoProceso, Proceso
from secop_scraper import descargar_documentos_proceso, descargar_documentos_procesos_batch

load_dotenv()

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
MUESTRA_CSV = STORAGE_PATH / "muestra_100_pliegos.csv"
PROCESOS_DIR = STORAGE_PATH / "procesos"
LOG_JSON = STORAGE_PATH / "descarga_100_pliegos.json"
RESUMEN_JSON = STORAGE_PATH / "resumen_descarga_100_pliegos.json"


def _notice_uid_from_url(url: str) -> str | None:
    if not url or "OpportunityDetail" not in url:
        return None
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    return qs.get("noticeUID", [None])[0]


def _tiene_documentos_descargados(proceso_id: int) -> bool:
    proc_dir = PROCESOS_DIR / str(proceso_id)
    if not proc_dir.exists():
        return False
    files = [f for f in proc_dir.iterdir() if f.is_file() and not f.name.startswith(".")]
    return len(files) > 0


def _documentos_en_bd(proceso_id: int, db: Session) -> int:
    return db.query(DocumentoProceso).filter(DocumentoProceso.proceso_id == proceso_id).count()


def main():
    parser = argparse.ArgumentParser(description="Descarga masiva de pliegos de la muestra de 100.")
    parser.add_argument("--max", type=int, default=None, help="Número máximo de procesos a descargar.")
    parser.add_argument("--force", action="store_true", help="Volver a descargar procesos que ya tienen documentos.")
    parser.add_argument("--skip-no-url", action="store_true", default=True, help="Saltar procesos sin noticeUID válido.")
    parser.add_argument("--individual", action="store_true", help="Usar un navegador nuevo por proceso (más lento, más CAPTCHAs).")
    args = parser.parse_args()

    if not MUESTRA_CSV.exists():
        print(f"No se encontró la muestra: {MUESTRA_CSV}")
        print("Ejecuta primero: python sample_100_pliegos.py")
        sys.exit(1)

    scraper_enabled = os.getenv("SCOP_SCRAPER_ENABLED", "false").lower() in ("true", "1", "yes")
    if not scraper_enabled:
        print("ADVERTENCIA: SCOP_SCRAPER_ENABLED no está en true en el entorno.")
        print("El scraper no descargará documentos hasta que actives la variable.")
        print("Puedes ejecutar con: SCOP_SCRAPER_ENABLED=true python descargar_100_pliegos.py")
        sys.exit(1)

    df_muestra = pd.read_csv(MUESTRA_CSV)
    print(f"Muestra cargada: {len(df_muestra)} procesos")

    db = SessionLocal()
    try:
        # Cargar datos de la BD y verificar noticeUID
        procesos_para_descargar = []
        for _, row in df_muestra.iterrows():
            proceso_id = int(row["id"])
            proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
            if not proceso:
                print(f"  Proceso {proceso_id} no encontrado en BD, se omite.")
                continue

            notice_uid = _notice_uid_from_url(proceso.url_documento or "")
            if not notice_uid and args.skip_no_url:
                print(f"  Proceso {proceso_id} no tiene noticeUID válido, se omite.")
                continue

            ya_descargado = _tiene_documentos_descargados(proceso_id) or _documentos_en_bd(proceso_id, db) > 0
            if ya_descargado and not args.force:
                print(f"  Proceso {proceso_id} ya tiene documentos descargados, se salta (--force para re-descargar).")
                continue

            procesos_para_descargar.append(proceso)

        total_a_descargar = len(procesos_para_descargar)
        if args.max and args.max > 0:
            procesos_para_descargar = procesos_para_descargar[:args.max]
            print(f"\nSe descargarán {len(procesos_para_descargar)} de {total_a_descargar} procesos pendientes (límite --max={args.max}).")
        else:
            print(f"\nSe descargarán {total_a_descargar} procesos.")

        if not procesos_para_descargar:
            print("No hay procesos pendientes para descargar.")
            return

        resultados = []
        t0_total = time.time()

        if args.individual:
            # Modo antiguo: un navegador por proceso
            for idx, proceso in enumerate(procesos_para_descargar, start=1):
                print(f"\n[{idx}/{len(procesos_para_descargar)}] Descargando proceso {proceso.id} — {proceso.numero_proceso}")
                print(f"   Entidad: {proceso.entidad}")
                print(f"   URL: {proceso.url_documento}")
                t0 = time.time()

                try:
                    resultado = descargar_documentos_proceso(proceso, db, timeout_seconds=180)
                except Exception as exc:
                    resultado = {"ok": False, "error": f"EXCEPCION: {exc}"}

                resultado["proceso_id"] = proceso.id
                resultado["numero_proceso"] = proceso.numero_proceso
                resultado["tiempo_segundos"] = round(time.time() - t0, 2)
                resultados.append(resultado)

                status = "OK" if resultado.get("ok") else "ERROR"
                descargados = resultado.get("descargados", 0)
                errores = resultado.get("errores", 0)
                print(f"   → {status} | {descargados} descargados, {errores} errores | {resultado.get('error', '')}")

                # Guardar log parcial después de cada descarga para reanudar si falla
                LOG_JSON.write_text(json.dumps(resultados, indent=2, ensure_ascii=False), encoding="utf-8")
        else:
            # Modo batch: una sola sesión de navegador para todos
            print("\nModo batch: se usará una sola ventana de Chrome para todos los procesos.")
            print("Resuelve el CAPTCHA cuando aparezca. Si la sesión se mantiene, los siguientes procesos no pedirán CAPTCHA.\n")
            try:
                resultados = descargar_documentos_procesos_batch(procesos_para_descargar, db, timeout_seconds=180)
            except Exception as exc:
                resultados = [{"ok": False, "error": f"EXCEPCION BATCH: {exc}"}]
            LOG_JSON.write_text(json.dumps(resultados, indent=2, ensure_ascii=False), encoding="utf-8")

        print(f"\nDescarga completada en {round(time.time() - t0_total, 1)}s")

        # Resumen
        ok_count = sum(1 for r in resultados if r.get("ok"))
        error_count = len(resultados) - ok_count
        total_descargados = sum(r.get("descargados", 0) for r in resultados)
        total_errores = sum(r.get("errores", 0) for r in resultados)

        resumen = {
            "total_intentados": len(resultados),
            "exitosos": ok_count,
            "fallidos": error_count,
            "total_documentos_descargados": total_descargados,
            "total_documentos_con_error": total_errores,
            "tiempo_total_segundos": round(time.time() - t0_total, 1),
            "resultados": resultados,
        }
        RESUMEN_JSON.write_text(json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")

        print(f"\nLog guardado: {LOG_JSON}")
        print(f"Resumen guardado: {RESUMEN_JSON}")
        print(f"Exitosos: {ok_count}/{len(resultados)} | Documentos descargados: {total_descargados}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
