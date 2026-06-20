"""Agrega columnas de detalle del proceso a la tabla procesos.

Ejecutar: python migrations/add_detalle_proceso.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(procesos)")
    columnas = {row[1] for row in cur.fetchall()}

    nuevas = [
        ("titulo", "TEXT"),
        ("fase", "TEXT"),
        ("tipo_contrato", "TEXT"),
        ("subtipo_contrato", "TEXT"),
        ("duracion", "INTEGER"),
        ("unidad_duracion", "TEXT"),
    ]

    for nombre, tipo in nuevas:
        if nombre in columnas:
            print(f"La columna '{nombre}' ya existe en procesos.")
        else:
            cur.execute(f"ALTER TABLE procesos ADD COLUMN {nombre} {tipo}")
            print(f"Columna '{nombre}' agregada a procesos.")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
