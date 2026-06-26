"""Actualiza el campo documentos_requeridos en analisis_100_pliegos.json
usando el texto cacheado y los patrones actuales de requisitos_pliego.

Esto evita re-extraer todo el texto de los pliegos cuando solo cambian
los patrones de detección de documentos requeridos.

Uso:
    source backend/venv/bin/activate
    TESSERACT_CMD=/opt/homebrew/bin/tesseract python actualizar_documentos_requeridos.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from extraccion.requisitos_pliego import extraer_requisitos_estructurados

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
ANALISIS_JSON = STORAGE_PATH / "analisis_100_pliegos.json"
OUTPUT_RESUMEN = STORAGE_PATH / "resumen_100_pliegos.json"


def _cache_texto_path(pliego_path: str) -> Path:
    return Path(pliego_path).with_suffix(Path(pliego_path).suffix + ".texto_extraido.txt")


def main():
    if not ANALISIS_JSON.exists():
        print(f"No se encontró {ANALISIS_JSON}")
        sys.exit(1)

    analisis_list = json.loads(ANALISIS_JSON.read_text(encoding="utf-8"))
    print(f"Registros cargados: {len(analisis_list)}")

    actualizados = 0
    sin_cache = 0

    for analisis in analisis_list:
        if analisis.get("error"):
            continue

        pliego_path = analisis.get("pliego_path")
        if not pliego_path:
            continue

        cache = _cache_texto_path(pliego_path)
        if not cache.exists():
            sin_cache += 1
            continue

        texto = cache.read_text(encoding="utf-8", errors="ignore")
        if not texto.strip():
            continue

        # Re-extraer requisitos estructurados con patrones actuales
        requisitos_estructurados = extraer_requisitos_estructurados(
            texto,
            documentos_proceso=[],  # No necesitamos documentos para documentos_requeridos
            presupuesto=analisis.get("presupuesto", 0),
        )

        # Actualizar solo documentos_requeridos y factores_calidad
        analisis["requisitos_estructurados"]["documentos_requeridos"] = requisitos_estructurados.get("documentos_requeridos", [])
        analisis["requisitos_estructurados"]["factores_calidad"] = requisitos_estructurados.get("factores_calidad", {})
        actualizados += 1

    print(f"Registros actualizados: {actualizados}")
    print(f"Sin cache disponible: {sin_cache}")

    # Guardar JSON actualizado
    ANALISIS_JSON.write_text(json.dumps(analisis_list, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"JSON actualizado guardado: {ANALISIS_JSON}")

    # Regenerar resumen
    analizados = [a for a in analisis_list if not a.get("error")]
    resumen = {
        "total_muestra": len(analisis_list),
        "con_pliego_analizado": len(analizados),
        "sin_pliego_o_error": len(analisis_list) - len(analizados),
    }

    # Conteos simples
    doc_conteo = {}
    fc_conteo = {}
    for a in analizados:
        re = a.get("requisitos_estructurados", {})
        for doc_id in re.get("documentos_requeridos", []):
            doc_conteo[doc_id] = doc_conteo.get(doc_id, 0) + 1
        for k, v in re.get("factores_calidad", {}).items():
            if v:
                fc_conteo[k] = fc_conteo.get(k, 0) + 1

    resumen["documentos_requeridos"] = doc_conteo
    resumen["factores_calidad"] = fc_conteo

    OUTPUT_RESUMEN.write_text(json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Resumen regenerado: {OUTPUT_RESUMEN}")
    print(json.dumps(resumen, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
