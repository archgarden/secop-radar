"""Crea la tabla documentos_proceso para almacenar documentos descargados de SECOP II.

Ejecutar: python migrations/add_documentos_proceso.py
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "secop.db"


def main():
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS documentos_proceso (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            proceso_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            url TEXT,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            es_pliego INTEGER NOT NULL DEFAULT 0,
            estado TEXT NOT NULL DEFAULT 'descargado',
            error TEXT,
            fecha_descarga TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (proceso_id) REFERENCES procesos(id)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_documentos_proceso_proceso_id ON documentos_proceso(proceso_id)"
    )
    conn.commit()
    conn.close()
    print("Tabla 'documentos_proceso' creada correctamente.")


if __name__ == "__main__":
    main()
