"""Elimina matches duplicados y agrega índice único (proceso_id, cliente_id).

Ejecutar: python migrations/deduplicar_matches.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    # Contar duplicados
    cur.execute("""
        SELECT proceso_id, cliente_id, COUNT(*) as c
        FROM procesos_clientes
        GROUP BY proceso_id, cliente_id
        HAVING c > 1
    """)
    dup = cur.fetchall()
    print(f"Matches duplicados encontrados: {len(dup)}")

    # Eliminar duplicados, conservando el registro con mayor score_match (o el más reciente)
    cur.execute("""
        DELETE FROM procesos_clientes
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM procesos_clientes
            GROUP BY proceso_id, cliente_id
        )
    """)
    eliminados = cur.rowcount
    print(f"Registros eliminados: {eliminados}")

    # Verificar si el índice único ya existe
    cur.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_proceso_cliente'")
    if cur.fetchone():
        print("El índice único 'uq_proceso_cliente' ya existe.")
    else:
        cur.execute("""
            CREATE UNIQUE INDEX uq_proceso_cliente
            ON procesos_clientes(proceso_id, cliente_id)
        """)
        print("Índice único 'uq_proceso_cliente' creado.")

    conn.commit()

    # Verificar
    cur.execute("""
        SELECT proceso_id, cliente_id, COUNT(*) as c
        FROM procesos_clientes
        GROUP BY proceso_id, cliente_id
        HAVING c > 1
    """)
    print(f"Matches duplicados restantes: {len(cur.fetchall())}")

    conn.close()


if __name__ == "__main__":
    main()
