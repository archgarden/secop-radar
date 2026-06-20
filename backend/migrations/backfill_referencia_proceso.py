"""Actualiza referencia_proceso, url_documento, fechas, estado y modalidad de procesos existentes.

Ejecutar: python migrations/backfill_referencia_proceso.py
"""

import os
import sqlite3
import time
import urllib.parse
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"
SOCRATA_URL = "https://www.datos.gov.co/resource/p6dx-8zbt.json"
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
BATCH_SIZE = 40


def socrata_headers() -> dict:
    headers = {"Accept": "application/json"}
    if SOCRATA_APP_TOKEN:
        headers["X-App-Token"] = SOCRATA_APP_TOKEN
    return headers


def parse_fecha(valor):
    if not valor:
        return None
    try:
        from datetime import datetime
        return datetime.fromisoformat(str(valor).replace("Z", "")).isoformat()
    except (ValueError, TypeError):
        return None


def consultar_por_ids(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    ids_escaped = ",".join(f"'{i.replace(chr(39), chr(39)+chr(39))}'" for i in ids)
    where = f"id_del_proceso IN ({ids_escaped})"
    select = (
        "id_del_proceso,referencia_del_proceso,entidad,descripci_n_del_procedimiento,"
        "precio_base,departamento_entidad,codigo_principal_de_categoria,urlproceso,"
        "fecha_de_publicacion_del,fecha_de_recepcion_de,estado_del_procedimiento,"
        "modalidad_de_contratacion"
    )
    url = (
        f"{SOCRATA_URL}?"
        f"%24limit={len(ids) + 10}&"
        f"%24select={urllib.parse.quote(select, safe='')}&"
        f"%24where={urllib.parse.quote(where, safe='')}"
    )
    try:
        r = requests.get(url, headers=socrata_headers(), timeout=60)
        r.raise_for_status()
        return r.json()
    except Exception as exc:
        print(f"  Error consultando lote: {exc}")
        return []


def main():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        "SELECT id, numero_proceso, url_documento FROM procesos "
        "WHERE referencia_proceso IS NULL OR url_documento IS NULL OR url_documento LIKE '%Login%' "
        "OR fecha_cierre IS NULL OR estado_proceso IS NULL"
    )
    filas = cur.fetchall()
    print(f"Procesos pendientes de actualizar: {len(filas)}")

    ids = [fila["numero_proceso"] for fila in filas]
    actualizados = 0

    for i in range(0, len(ids), BATCH_SIZE):
        lote = ids[i : i + BATCH_SIZE]
        print(f"Consultando lote {i // BATCH_SIZE + 1}/{(len(ids) - 1) // BATCH_SIZE + 1} ({len(lote)} ids)...")
        registros = consultar_por_ids(lote)

        for reg in registros:
            numero = reg.get("id_del_proceso")
            if not numero:
                continue

            url = reg.get("urlproceso")
            if isinstance(url, dict):
                url = url.get("url")

            fila = next((f for f in filas if f["numero_proceso"] == numero), None)
            url_actual = fila["url_documento"] if fila else ""
            nueva_url = url if url and "OpportunityDetail" in url else url_actual

            cur.execute(
                """UPDATE procesos SET
                    referencia_proceso = COALESCE(?, referencia_proceso),
                    objeto = COALESCE(?, objeto),
                    presupuesto = COALESCE(?, presupuesto),
                    fecha_cierre = COALESCE(?, fecha_cierre),
                    fecha_publicacion = COALESCE(?, fecha_publicacion),
                    departamento = COALESCE(?, departamento),
                    unspsc_code = COALESCE(?, unspsc_code),
                    url_documento = ?,
                    estado_proceso = COALESCE(?, estado_proceso),
                    modalidad = COALESCE(?, modalidad)
                WHERE numero_proceso = ?""",
                (
                    reg.get("referencia_del_proceso"),
                    reg.get("descripci_n_del_procedimiento"),
                    int(float(reg.get("precio_base") or 0)) or None,
                    parse_fecha(reg.get("fecha_de_recepcion_de")),
                    parse_fecha(reg.get("fecha_de_publicacion_del")),
                    reg.get("departamento_entidad"),
                    reg.get("codigo_principal_de_categoria"),
                    nueva_url,
                    reg.get("estado_del_procedimiento"),
                    reg.get("modalidad_de_contratacion"),
                    numero,
                ),
            )
            actualizados += 1

        conn.commit()
        time.sleep(0.5)

    print(f"Procesos actualizados: {actualizados}")
    conn.close()


if __name__ == "__main__":
    main()
