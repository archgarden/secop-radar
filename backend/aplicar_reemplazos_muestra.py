"""Aplica los reemplazos encontrados a storage/muestra_100_pliegos.csv.

Lee storage/reemplazos_muestra.csv y actualiza la muestra original con los
nuevos IDs y datos de los procesos reemplazantes.

Uso:
    cd backend
    source .venv/bin/activate
    python aplicar_reemplazos_muestra.py
"""

import sys
from pathlib import Path

import pandas as pd
from sqlalchemy.orm import Session

from database import SessionLocal
from models import Proceso

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
MUESTRA_CSV = STORAGE_PATH / "muestra_100_pliegos.csv"
REEMPLAZOS_CSV = STORAGE_PATH / "reemplazos_muestra.csv"


def main():
    if not MUESTRA_CSV.exists():
        print(f"No se encontró {MUESTRA_CSV}")
        sys.exit(1)
    if not REEMPLAZOS_CSV.exists():
        print(f"No se encontró {REEMPLAZOS_CSV}. Ejecuta primero: python encontrar_reemplazos_muestra.py")
        sys.exit(1)

    df_muestra = pd.read_csv(MUESTRA_CSV)
    df_reemplazos = pd.read_csv(REEMPLAZOS_CSV)

    db = SessionLocal()
    try:
        reemplazos_validos = df_reemplazos[df_reemplazos["reemplazo_id"].notna()]
        print(f"Aplicando {len(reemplazos_validos)} reemplazos...")

        for _, row in reemplazos_validos.iterrows():
            faltante_id = int(row["faltante_id"])
            reemplazo_id = int(row["reemplazo_id"])
            proceso = db.query(Proceso).filter(Proceso.id == reemplazo_id).first()
            if not proceso:
                print(f"  ID {reemplazo_id} no encontrado en BD, se omite")
                continue

            idx = df_muestra.index[df_muestra["id"] == faltante_id].tolist()
            if not idx:
                print(f"  ID {faltante_id} no encontrado en muestra, se omite")
                continue

            idx = idx[0]
            df_muestra.at[idx, "id"] = proceso.id
            df_muestra.at[idx, "numero_proceso"] = proceso.numero_proceso
            df_muestra.at[idx, "entidad"] = proceso.entidad
            df_muestra.at[idx, "objeto"] = proceso.objeto
            df_muestra.at[idx, "presupuesto"] = proceso.presupuesto
            df_muestra.at[idx, "departamento"] = proceso.departamento
            df_muestra.at[idx, "url_documento"] = proceso.url_documento
            df_muestra.at[idx, "reemplazo"] = True
            print(
                f"  ID {faltante_id} → {proceso.id} ({proceso.numero_proceso}) "
                f"{proceso.modalidad} | {proceso.tipo_contrato} | {proceso.departamento}"
            )

        df_muestra.to_csv(MUESTRA_CSV, index=False)
        print(f"\nMuestra actualizada guardada en {MUESTRA_CSV}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
