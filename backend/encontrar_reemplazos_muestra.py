"""Busca reemplazos para los 14 procesos faltantes de la muestra de 100 pliegos.

Criterios:
- Misma combinación de rol + modalidad + geografía que el proceso faltante.
- url_documento válido con noticeUID (OpportunityDetail/Index?noticeUID=...).
- No estar ya en la muestra.
- Preferir presupuesto similar.

Uso:
    cd backend
    source .venv/bin/activate
    python encontrar_reemplazos_muestra.py

Genera:
    storage/reemplazos_muestra.csv
"""

import csv
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Proceso

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
MUESTRA_CSV = STORAGE_PATH / "muestra_100_pliegos.csv"
OUTPUT_CSV = STORAGE_PATH / "reemplazos_muestra.csv"


def _notice_uid_valido(url: str | None) -> bool:
    if not url or "OpportunityDetail" not in url:
        return False
    qs = parse_qs(urlparse(url).query)
    return bool(qs.get("noticeUID", [None])[0])


def _modalidad_filtro(modalidad_muestra: str) -> list[str]:
    """Mapea abreviaturas de modalidad a patrones de búsqueda en BD."""
    m = modalidad_muestra.upper()
    if m == "LP":
        return ["Licitación pública"]
    if m == "SAMC":
        return ["Selección Abreviada de Menor Cuantía"]
    if m == "MC":
        return ["Mínima cuantía"]
    return [m]


def main():
    if not MUESTRA_CSV.exists():
        print(f"No se encontró {MUESTRA_CSV}")
        sys.exit(1)

    df_muestra = pd.read_csv(MUESTRA_CSV)
    muestra_ids = set(df_muestra["id"].astype(int))

    # Procesos descargados exitosamente.
    procesos_dir = STORAGE_PATH / "procesos"
    descargados = [
        int(d.name)
        for d in procesos_dir.iterdir()
        if d.is_dir() and d.name.isdigit() and any(f.is_file() for f in d.iterdir())
    ]

    db = SessionLocal()
    try:
        faltantes = []
        reemplazos = []
        usados = set()

        for _, row in df_muestra.iterrows():
            pid = int(row["id"])
            if pid in descargados:
                continue

            rol = str(row.get("rol", "")).lower()
            modalidad = str(row.get("modalidad", "")).upper()
            geografia = str(row.get("geografia", "")).lower()
            presupuesto = float(row.get("presupuesto", 0) or 0)

            faltantes.append({
                "id": pid,
                "numero_proceso": row.get("numero_proceso"),
                "entidad": row.get("entidad"),
                "rol": rol,
                "modalidad": modalidad,
                "geografia": geografia,
                "presupuesto": presupuesto,
            })

            # Buscar candidatos similares.
            patrones = _modalidad_filtro(modalidad)
            candidatos = []
            for patron in patrones:
                candidatos.extend(
                    db.query(Proceso)
                    .filter(
                        Proceso.id.notin_(muestra_ids),
                        Proceso.id.notin_(usados),
                        Proceso.id.notin_(descargados),
                        Proceso.modalidad.ilike(f"%{patron}%"),
                    )
                    .limit(200)
                    .all()
                )

            mejor = None
            mejor_score = -1
            for c in candidatos:
                if not _notice_uid_valido(c.url_documento):
                    continue

                c_rol = str(c.tipo_contrato or "").lower()
                c_geo = str(c.departamento or "").lower()
                c_pres = float(c.presupuesto or 0)

                score = 0
                # Matching exacto de rol (prioridad máxima).
                if rol == "obra" and "obra" in c_rol:
                    score += 100
                elif rol == "servicios" and "servicio" in c_rol:
                    score += 100
                elif rol == "bienes" and "bien" in c_rol:
                    score += 100
                else:
                    # Fallback: cualquier rol con contrato.
                    if any(r in c_rol for r in ["obra", "servicio", "bien"]):
                        score += 10

                # Geografía.
                if geografia == "nacional/capitales":
                    if c.departamento in ("Bogotá", "Cundinamarca", None) or "distrito" in c_geo or "capital" in c_geo:
                        score += 20
                else:  # municipios
                    if c.departamento and c.departamento not in ("Bogotá",):
                        score += 20

                # Presupuesto similar (dentro de factor 10).
                if presupuesto > 0 and c_pres > 0:
                    ratio = max(presupuesto, c_pres) / min(presupuesto, c_pres)
                    if ratio <= 10:
                        score += 10
                    if ratio <= 3:
                        score += 10

                if score > mejor_score:
                    mejor_score = score
                    mejor = c

            if mejor:
                usados.add(mejor.id)
                reemplazos.append({
                    "faltante_id": pid,
                    "faltante_numero": row.get("numero_proceso"),
                    "reemplazo_id": mejor.id,
                    "reemplazo_numero": mejor.numero_proceso,
                    "reemplazo_entidad": mejor.entidad,
                    "reemplazo_url": mejor.url_documento,
                    "reemplazo_presupuesto": mejor.presupuesto,
                    "score": mejor_score,
                })
            else:
                reemplazos.append({
                    "faltante_id": pid,
                    "faltante_numero": row.get("numero_proceso"),
                    "reemplazo_id": None,
                    "reemplazo_numero": None,
                    "reemplazo_entidad": None,
                    "reemplazo_url": None,
                    "reemplazo_presupuesto": None,
                    "score": 0,
                })

        print(f"Procesos faltantes: {len(faltantes)}")
        encontrados = [r for r in reemplazos if r["reemplazo_id"]]
        print(f"Reemplazos encontrados: {len(encontrados)}")

        for r in reemplazos:
            if r["reemplazo_id"]:
                print(
                    f"  ID {r['faltante_id']} ({r['faltante_numero']}) → "
                    f"ID {r['reemplazo_id']} ({r['reemplazo_numero']}) score={r['score']}"
                )
            else:
                print(f"  ID {r['faltante_id']} ({r['faltante_numero']}) → SIN REEMPLAZO")

        df_out = pd.DataFrame(reemplazos)
        df_out.to_csv(OUTPUT_CSV, index=False)
        print(f"\nGuardado en {OUTPUT_CSV}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
