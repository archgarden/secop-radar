"""Consolida el Core de Documentos Base Fijos a partir del análisis del corpus completo.

Usa los resultados de backend/analizar_corpus_procesos.py (storage/analisis_corpus/)
para recalcular frecuencias de documentos requeridos usando no solo el pliego,
sino también anexos, formatos, estudios previos y matrices descargadas.

Uso:
    cd backend
    source venv/bin/activate
    python consolidar_core_corpus.py

Salida:
    storage/core_documentos_base_fijos_corpus.json
    storage/core_documentos_base_fijos_corpus.csv
"""

import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from consolidar_core_documentos import (
    DOCUMENTOS_BASE_FIJOS,
    UMBRAL_FRECUENTE,
    UMBRAL_OBLIGATORIO,
    clasificar_documento,
)

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
ANALISIS_DIR = STORAGE_PATH / "analisis_corpus"
OUTPUT_JSON = STORAGE_PATH / "core_documentos_base_fijos_corpus.json"
OUTPUT_CSV = STORAGE_PATH / "core_documentos_base_fijos_corpus.csv"


def _calcular_frecuencia_label(tipo_core: str, relativa: float, requerida_relativa: float) -> str:
    if tipo_core == "proponente":
        metrica = max(requerida_relativa, relativa)
    else:
        metrica = relativa
    if metrica >= UMBRAL_OBLIGATORIO:
        return "obligatorio"
    if metrica >= UMBRAL_FRECUENTE:
        return "frecuente"
    return "segun_pliego"


def main():
    if not ANALISIS_DIR.exists():
        print(f"No se encontró {ANALISIS_DIR}. Ejecuta primero analizar_corpus_procesos.py")
        sys.exit(1)

    archivos = sorted(ANALISIS_DIR.glob("*.json"))
    print(f"Consolidando Core a partir de {len(archivos)} análisis de corpus...")

    conteo_requeridos: Counter = Counter()
    conteo_archivos: Counter = Counter()
    ejemplos: dict[str, list[dict]] = {}
    total = 0

    for path in archivos:
        analisis = json.loads(path.read_text(encoding="utf-8"))
        total += 1
        proceso_id = analisis.get("proceso_id")
        numero_proceso = analisis.get("numero_proceso")

        # Contar documentos requeridos según el análisis del corpus
        for doc_id in analisis.get("requisitos", {}).get("documentos_requeridos", []):
            conteo_requeridos[doc_id] += 1

        # Contar documentos clasificados por nombre de archivo en el proceso
        vistos = set()
        for archivo in analisis.get("archivos", []):
            clasificacion = clasificar_documento(archivo["nombre"])
            if not clasificacion:
                continue
            doc_id = clasificacion["id"]
            if doc_id in vistos:
                continue
            vistos.add(doc_id)
            conteo_archivos[doc_id] += 1
            ejemplos.setdefault(doc_id, []).append({
                "proceso_id": proceso_id,
                "numero_proceso": numero_proceso,
                "filename": archivo["nombre"],
            })

    frecuencias = {}
    for meta in DOCUMENTOS_BASE_FIJOS:
        doc_id = meta["id"]
        req_abs = conteo_requeridos.get(doc_id, 0)
        arch_abs = conteo_archivos.get(doc_id, 0)
        req_rel = req_abs / total if total else 0
        arch_rel = arch_abs / total if total else 0
        label = _calcular_frecuencia_label(meta.get("tipo_core", "proponente"), arch_rel, req_rel)

        frecuencias[doc_id] = {
            **meta,
            "frecuencia_absoluta": arch_abs,
            "frecuencia_relativa": round(arch_rel, 4),
            "requerido_en_pliego": req_abs,
            "requerido_relativo": round(req_rel, 4),
            "frecuencia_label": label,
            "procesos_analizados": total,
            "ejemplos": ejemplos.get(doc_id, [])[:5],
        }

    core_por_tipo = {"proponente": {}, "pliego": {}, "calidad": {}}
    for doc_id, info in frecuencias.items():
        tipo = info.get("tipo_core", "proponente")
        core_por_tipo[tipo][doc_id] = info

    core = {
        "version": "3.0-corpus",
        "fecha_generacion": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "fuente": "analisis_corpus_completo_101_procesos",
        "procesos_analizados": total,
        "umbrales": {
            "obligatorio": UMBRAL_OBLIGATORIO,
            "frecuente": UMBRAL_FRECUENTE,
        },
        "proponente": core_por_tipo["proponente"],
        "pliego": core_por_tipo["pliego"],
        "calidad": core_por_tipo["calidad"],
    }

    OUTPUT_JSON.write_text(json.dumps(core, indent=2, ensure_ascii=False), encoding="utf-8")

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            "tipo_core", "id", "nombre", "categoria", "frecuencia_label",
            "frecuencia_absoluta", "frecuencia_relativa", "requerido_en_pliego",
            "requerido_relativo", "procesos_analizados", "keywords",
        ])
        for tipo, docs in core_por_tipo.items():
            for doc_id, info in docs.items():
                writer.writerow([
                    tipo,
                    doc_id,
                    info["nombre"],
                    info["categoria"],
                    info["frecuencia_label"],
                    info["frecuencia_absoluta"],
                    info["frecuencia_relativa"],
                    info["requerido_en_pliego"],
                    info["requerido_relativo"],
                    info["procesos_analizados"],
                    ", ".join(info["keywords"]),
                ])

    print(f"Core guardado en: {OUTPUT_JSON}")
    print(f"CSV guardado en: {OUTPUT_CSV}")
    print("\nResumen por tipo de Core:")
    for tipo, docs in core_por_tipo.items():
        print(f"\n  [{tipo.upper()}] {len(docs)} documentos")
        for doc_id, info in docs.items():
            print(
                f"    {doc_id}: {info['frecuencia_label']} | "
                f"req {info['requerido_en_pliego']}/{info['procesos_analizados']} | "
                f"archivo {info['frecuencia_absoluta']}/{info['procesos_analizados']}"
            )


if __name__ == "__main__":
    main()
