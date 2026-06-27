"""Crea la tabla configuracion para preferencias globales (ej. cliente activo).

Ejecutar: python migrations/add_configuracion.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT,
            fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("Tabla configuracion creada/verificada.")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
