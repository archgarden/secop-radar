"""Genera un reporte de frecuencia de nombres de archivo en el corpus descargado.

Uso:
    cd backend
    source venv/bin/activate
    python reporte_nombres_archivos_corpus.py

Salida:
    storage/reporte_nombres_archivos_corpus.json
    storage/reporte_nombres_archivos_corpus.csv
"""

import csv
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
PROCESOS_DIR = STORAGE_PATH / "procesos"
OUTPUT_JSON = STORAGE_PATH / "reporte_nombres_archivos_corpus.json"
OUTPUT_CSV = STORAGE_PATH / "reporte_nombres_archivos_corpus.csv"


def _normalizar_nombre(nombre: str) -> str:
    """Limpia el nombre para agrupar variantes similares."""
    n = nombre.lower()
    # Quitar extensiones
    n = re.sub(r"\.(pdf|xlsx|xls|docx|doc|zip|rar|txt)$", "", n)
    # Quitar números de versión, fechas y guiones bajos múltiples
    n = re.sub(r"_v\d+(_\d+)*", "", n)
    n = re.sub(r"_\d{2}-\d{2}-\d{4}", "", n)
    n = re.sub(r"_+", " ", n)
    n = re.sub(r"[^a-z0-9áéíóúñ ]+", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def main():
    conteo_exacto = Counter()
    conteo_normalizado = Counter()
    procesos_por_nombre: dict[str, set[str]] = {}

    for proc_dir in sorted(PROCESOS_DIR.iterdir()):
        if not proc_dir.is_dir():
            continue
        proceso_id = proc_dir.name
        for f in proc_dir.iterdir():
            if not f.is_file():
                continue
            if f.name.startswith("."):
                continue
            if f.name.endswith(".texto_extraido.txt"):
                continue
            nombre = f.name
            conteo_exacto[nombre] += 1
            norm = _normalizar_nombre(nombre)
            conteo_normalizado[norm] += 1
            procesos_por_nombre.setdefault(norm, set()).add(proceso_id)

    # Top nombres exactos
    top_exactos = [
        {"nombre": nombre, "frecuencia": freq}
        for nombre, freq in conteo_exacto.most_common(200)
    ]

    # Top nombres normalizados
    top_normalizados = [
        {
            "nombre_normalizado": nombre,
            "frecuencia": freq,
            "procesos": len(procesos_por_nombre.get(nombre, set())),
        }
        for nombre, freq in conteo_normalizado.most_common(200)
    ]

    resumen = {
        "total_archivos": sum(conteo_exacto.values()),
        "nombres_unicos_exactos": len(conteo_exacto),
        "nombres_unicos_normalizados": len(conteo_normalizado),
        "top_exactos": top_exactos,
        "top_normalizados": top_normalizados,
    }

    OUTPUT_JSON.write_text(json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["nombre_normalizado", "frecuencia", "procesos_distintos"])
        for item in top_normalizados:
            writer.writerow([item["nombre_normalizado"], item["frecuencia"], item["procesos"]])

    print(f"Total archivos: {resumen['total_archivos']}")
    print(f"Nombres únicos exactos: {resumen['nombres_unicos_exactos']}")
    print(f"Nombres únicos normalizados: {resumen['nombres_unicos_normalizados']}")
    print(f"JSON: {OUTPUT_JSON}")
    print(f"CSV: {OUTPUT_CSV}")
    print("\nTop 20 nombres normalizados:")
    for item in top_normalizados[:20]:
        print(f"  {item['nombre_normalizado']}: {item['frecuencia']} ({item['procesos']} procesos)")


if __name__ == "__main__":
    main()
