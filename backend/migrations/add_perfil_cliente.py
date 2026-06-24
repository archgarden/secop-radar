"""Agrega campos de perfil financiero/experiencia a la tabla clientes.

Ejecutar: python migrations/add_perfil_cliente.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"

NUEVAS_COLUMNAS = [
    ("patrimonio_liquido", "INTEGER"),
    ("ingresos_anuales", "INTEGER"),
    ("experiencia_valor_total", "INTEGER"),
    ("experiencia_cantidad", "INTEGER"),
    ("indicadores_financieros", "TEXT"),
    ("capacidad_residual_pct", "REAL"),
    ("contratos_vigentes_valor", "INTEGER"),
]


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(clientes)")
    columnas = {row[1] for row in cur.fetchall()}

    for nombre, tipo in NUEVAS_COLUMNAS:
        if nombre in columnas:
            print(f"La columna '{nombre}' ya existe en clientes.")
        else:
            cur.execute(f"ALTER TABLE clientes ADD COLUMN {nombre} {tipo}")
            print(f"Columna '{nombre}' ({tipo}) agregada a clientes.")

    conn.commit()
    conn.close()
    print("Migración de perfil de cliente completada.")


if __name__ == "__main__":
    main()
