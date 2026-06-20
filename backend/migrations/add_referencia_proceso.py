"""Agrega la columna referencia_proceso a la tabla procesos.

Ejecutar: python migrations/add_referencia_proceso.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(procesos)")
    columnas = {row[1] for row in cur.fetchall()}

    if "referencia_proceso" in columnas:
        print("La columna 'referencia_proceso' ya existe en procesos.")
    else:
        cur.execute("ALTER TABLE procesos ADD COLUMN referencia_proceso TEXT")
        conn.commit()
        print("Columna 'referencia_proceso' agregada a procesos.")

    conn.close()


if __name__ == "__main__":
    main()
