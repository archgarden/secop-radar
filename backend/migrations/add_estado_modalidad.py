"""Agrega las columnas estado_proceso y modalidad a la tabla procesos.

Ejecutar: python migrations/add_estado_modalidad.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(procesos)")
    columnas = {row[1] for row in cur.fetchall()}

    if "estado_proceso" in columnas:
        print("La columna 'estado_proceso' ya existe en procesos.")
    else:
        cur.execute("ALTER TABLE procesos ADD COLUMN estado_proceso TEXT")
        print("Columna 'estado_proceso' agregada a procesos.")

    if "modalidad" in columnas:
        print("La columna 'modalidad' ya existe en procesos.")
    else:
        cur.execute("ALTER TABLE procesos ADD COLUMN modalidad TEXT")
        print("Columna 'modalidad' agregada a procesos.")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
