"""Agrega la columna unspsc_codes a la tabla procesos.

Ejecutar: python migrations/add_unspsc_codes.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(procesos)")
    columnas = {row[1] for row in cur.fetchall()}

    if "unspsc_codes" in columnas:
        print("La columna 'unspsc_codes' ya existe en procesos.")
    else:
        cur.execute("ALTER TABLE procesos ADD COLUMN unspsc_codes TEXT NOT NULL DEFAULT '[]'")
        print("Columna 'unspsc_codes' agregada a procesos.")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
