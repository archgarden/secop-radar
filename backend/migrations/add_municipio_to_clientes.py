"""Agrega la columna municipio a la tabla clientes.

Ejecutar: python migrations/add_municipio_to_clientes.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    # Verificar si la columna ya existe
    cur.execute("PRAGMA table_info(clientes)")
    columnas = {row[1] for row in cur.fetchall()}

    if "municipio" in columnas:
        print("La columna 'municipio' ya existe en clientes.")
    else:
        cur.execute("ALTER TABLE clientes ADD COLUMN municipio TEXT")
        conn.commit()
        print("Columna 'municipio' agregada a clientes.")

    conn.close()


if __name__ == "__main__":
    main()
