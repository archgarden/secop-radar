"""Consolida el Core de Documentos Base Fijos a partir de pliegos analizados.

Puede ejecutarse de dos formas:

1. Usar el proceso piloto (ID 1) como semilla inicial del Core:
   TESSERACT_CMD=/opt/homebrew/bin/tesseract python consolidar_core_documentos.py

2. Cuando se hayan descargado los 100 pliegos, consolidar el Core a partir del
   análisis masivo:
   TESSERACT_CMD=/opt/homebrew/bin/tesseract python consolidar_core_documentos.py --masivo

Genera:
  - storage/core_documentos_base_fijos.json
  - storage/core_documentos_base_fijos.csv
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

from analizador_pliego import analizar_pliego
from database import SessionLocal
from models import DocumentoProceso, Proceso

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
OUTPUT_JSON = STORAGE_PATH / "core_documentos_base_fijos.json"
OUTPUT_CSV = STORAGE_PATH / "core_documentos_base_fijos.csv"
ANALISIS_JSON = STORAGE_PATH / "analisis_100_pliegos.json"

# Umbral para considerar un documento "obligatorio" o "frecuente"
UMBRAL_OBLIGATORIO = 0.70
UMBRAL_FRECUENTE = 0.30


# ---------------------------------------------------------------------------
# Core de Documentos Base Fijos
# ---------------------------------------------------------------------------
# Cada entrada define un documento, su categoría, a qué "Core" pertenece
# (proponente, pliego, calidad) y los patrones de nombre de archivo que lo
# identifican. Los patrones se evalúan en el orden definido.

DOCUMENTOS_BASE_FIJOS: list[dict[str, Any]] = [
    # --- Documentos del pliego (anexos y referencia técnica) ---
    {
        "id": "pliego",
        "nombre": "Pliego de condiciones / Documento base",
        "categoria": "pliego",
        "tipo_core": "pliego",
        "obligatorio": True,
        "keywords": [
            "pliego",
            "documento base",
            "documento_base",
            "doc base",
            "bases",
            "condiciones",
            "terminos",
            "términos",
            "proyecto de pliego",
            "pliego tipo",
            "documento tipo",
        ],
    },
    {
        "id": "anexo_tecnico",
        "nombre": "Anexo técnico / especificaciones técnicas",
        "categoria": "anexo_tecnico",
        "tipo_core": "pliego",
        "obligatorio": False,
        "keywords": ["anexo tecnico", "anexo técnico", "especificaciones tecnicas", "especificaciones técnicas", "documento tecnico"],
    },
    {
        "id": "estudios_previos",
        "nombre": "Estudios previos / diagnóstico",
        "categoria": "anexo_tecnico",
        "tipo_core": "pliego",
        "obligatorio": False,
        "keywords": ["estudios previos", "estudio previo", "diagnostico", "diagnóstico", "estudio del sector"],
    },
    {
        "id": "memorias_cantidades",
        "nombre": "Memorias de cantidades / presupuesto general",
        "categoria": "anexo_tecnico",
        "tipo_core": "pliego",
        "obligatorio": False,
        "keywords": ["memorias de cantidades", "presupuesto gnal", "presupuesto general", "apu", "analisis de precios"],
    },
    {
        "id": "cronograma",
        "nombre": "Cronograma",
        "categoria": "anexo_tecnico",
        "tipo_core": "pliego",
        "obligatorio": False,
        "keywords": ["cronograma"],
    },
    {
        "id": "analisis_riesgos_pliego",
        "nombre": "Análisis de riesgos del pliego",
        "categoria": "anexo_tecnico",
        "tipo_core": "pliego",
        "obligatorio": False,
        "keywords": ["analisis de riesgos", "análisis de riesgos"],
    },
    # --- Documentos que el proponente debe presentar ---
    {
        "id": "rup",
        "nombre": "RUP vigente (Registro Único de Proponentes)",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["rup", "registro unico de proponentes", "registro único de proponentes"],
    },
    {
        "id": "autorizacion_datos_personales",
        "nombre": "Autorización de datos personales",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "autorizacion de datos personales",
            "autorización de datos personales",
            "autorizacion para el tratamiento de datos personales",
            "autorización para el tratamiento de datos personales",
            "tratamiento de datos personales",
            "datos personales",
            "ley 1581 de 2012",
            "formato 11",
            "formato11",
        ],
    },
    {
        "id": "pacto_transparencia",
        "nombre": "Pacto de transparencia",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["pacto de transparencia", "transparencia"],
    },
    {
        "id": "paz_salvo_parafiscales",
        "nombre": "Paz y salvo de parafiscales (SENA, ICBF, Caja)",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "paz y salvo",
            "parafiscales",
            "pago de seguridad social",
            "aportes legales",
            "sena",
            "icbf",
            "caja de compensacion",
            "formato6",
        ],
    },
    {
        "id": "poliza_seriedad",
        "nombre": "Póliza de seriedad de la oferta",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "poliza de seriedad",
            "póliza de seriedad",
            "seriedad de la oferta",
            "garantia de seriedad",
            "garantia de seriedad de la oferta",
            "garantia de oferta",
            "caucion de seriedad",
            "caucion de oferta",
        ],
    },
    {
        "id": "declaracion_renta",
        "nombre": "Declaración de renta / carga tributaria",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["declaracion de renta", "declaración de renta", "carga tributaria", "impuesto de renta"],
    },
    {
        "id": "no_intervencion",
        "nombre": "Certificación de no intervención / inhabilidades",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["no intervencion", "no intervención", "inhabilidad", "inhabilidades", "conflicto de interes"],
    },
    {
        "id": "conformacion_proponente_plural",
        "nombre": "Conformación de proponente plural",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": False,
        "keywords": ["conformacion de proponente plural", "conformación de proponente plural", "formato2"],
    },
    {
        "id": "manifestacion_interes",
        "nombre": "Carta de manifestación de interés",
        "categoria": "habilitante_legal",
        "tipo_core": "proponente",
        "obligatorio": False,
        "keywords": ["manifestacion de interes", "manifestación de interés", "carta de interes", "formato10"],
    },
    {
        "id": "estados_financieros",
        "nombre": "Estados financieros",
        "categoria": "habilitante_financiero",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "estados financieros",
            "estado de situacion financiera",
            "estado de situación financiera",
            "estado de resultados",
            "balance general",
            "estados financieros auditados",
            "estados contables",
        ],
    },
    {
        "id": "capacidad_financiera",
        "nombre": "Capacidad financiera y organizacional",
        "categoria": "habilitante_financiero",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["capacidad financiera", "capacidad_financiera", "formato4"],
    },
    {
        "id": "matriz2_indicadores",
        "nombre": "Matriz 2 — Indicadores financieros",
        "categoria": "habilitante_financiero",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["matriz 2", "matriz2", "indicadores financieros", "indicadores_y_organizacionales"],
    },
    {
        "id": "matriz1_experiencia",
        "nombre": "Matriz 1 — Experiencia",
        "categoria": "habilitante_tecnico",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["matriz 1", "matriz1"],
    },
    {
        "id": "certificados_experiencia",
        "nombre": "Certificados de experiencia (Formato 3)",
        "categoria": "habilitante_tecnico",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "certificado de experiencia",
            "certificados de experiencia",
            "formato3",
            "formato 3",
            "actas de liquidacion",
            "actas de liquidación",
            "experiencia del proponente",
            "soportes de experiencia",
        ],
    },
    {
        "id": "matriz3_riesgos",
        "nombre": "Matriz 3 — Riesgos",
        "categoria": "habilitante_tecnico",
        "tipo_core": "proponente",
        "obligatorio": False,
        "keywords": ["matriz 3", "matriz3"],
    },
    {
        "id": "capacidad_residual",
        "nombre": "Capacidad residual (Formato 5)",
        "categoria": "habilitante_tecnico",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["capacidad residual", "formato5", "formato 5"],
    },
    {
        "id": "bienes_relevantes",
        "nombre": "Matriz 4 — Bienes relevantes",
        "categoria": "habilitante_tecnico",
        "tipo_core": "proponente",
        "obligatorio": False,
        "keywords": ["matriz 4", "matriz4", "bienes relevantes"],
    },
    {
        "id": "carta_presentacion",
        "nombre": "Carta de presentación de la oferta (Formato 1)",
        "categoria": "oferta",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": ["carta de presentacion", "carta de presentación", "formato1", "formato 1"],
    },
    {
        "id": "propuesta_tecnica",
        "nombre": "Propuesta técnica / plan de trabajo",
        "categoria": "oferta",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "propuesta tecnica",
            "propuesta técnica",
            "oferta tecnica",
            "oferta técnica",
            "plan de trabajo",
            "metodologia",
            "metodología",
            "programa de trabajo",
        ],
    },
    {
        "id": "propuesta_economica",
        "nombre": "Propuesta económica / presupuesto oficial",
        "categoria": "oferta",
        "tipo_core": "proponente",
        "obligatorio": True,
        "keywords": [
            "propuesta economica",
            "propuesta económica",
            "oferta economica",
            "oferta económica",
            "formato de precios",
            "precios unitarios",
        ],
    },
    # --- Factores de calidad / preferencias ---
    {
        "id": "empresas_mujeres",
        "nombre": "Emprendimiento y empresas de mujeres",
        "categoria": "calidad",
        "tipo_core": "calidad",
        "obligatorio": False,
        "keywords": ["empresas de mujeres", "emprendimiento y empresa de mujeres"],
    },
    {
        "id": "mipyme",
        "nombre": "Acreditación Mipyme",
        "categoria": "calidad",
        "tipo_core": "calidad",
        "obligatorio": False,
        "keywords": ["acreditacion mipyme", "acreditación mipyme", "formato13"],
    },
    {
        "id": "factor_calidad",
        "nombre": "Factor de calidad",
        "categoria": "calidad",
        "tipo_core": "calidad",
        "obligatorio": False,
        "keywords": ["factor de calidad", "factorcalidad", "factor calidad"],
    },
    {
        "id": "industria_nacional",
        "nombre": "Industria nacional",
        "categoria": "calidad",
        "tipo_core": "calidad",
        "obligatorio": False,
        "keywords": ["industria nacional"],
    },
    {
        "id": "factores_desempate",
        "nombre": "Factores de desempate",
        "categoria": "calidad",
        "tipo_core": "calidad",
        "obligatorio": False,
        "keywords": ["factores de desempate", "formato8"],
    },
]


def _normalizar(nombre: str) -> str:
    n = nombre.lower()
    n = re.sub(r"[^a-z0-9áéíóúñ]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


def clasificar_documento(nombre: str) -> dict[str, Any] | None:
    """Clasifica un documento descargado según el Core de Documentos Base Fijos."""
    nombre_norm = _normalizar(nombre)
    for meta in DOCUMENTOS_BASE_FIJOS:
        for kw in meta["keywords"]:
            if _normalizar(kw) in nombre_norm:
                return {"id": meta["id"], **meta}
    return None


def _extraer_documentos_proceso(proceso_id: int, db) -> list[dict[str, Any]]:
    """Lista documentos descargados del proceso, clasificados por tipo."""
    docs_db = db.query(DocumentoProceso).filter(DocumentoProceso.proceso_id == proceso_id).all()
    resultado = []
    vistos = set()

    for doc in docs_db:
        clasificacion = clasificar_documento(doc.nombre)
        item = {
            "nombre": doc.nombre,
            "filename": doc.filename,
            "path": doc.path,
            "es_pliego": doc.es_pliego,
            "size_bytes": doc.size_bytes,
            "clasificacion": clasificacion,
        }
        key = (doc.nombre, doc.filename)
        if key not in vistos:
            resultado.append(item)
            vistos.add(key)

    proc_dir = STORAGE_PATH / "procesos" / str(proceso_id)
    if proc_dir.exists():
        for f in proc_dir.iterdir():
            if not f.is_file() or f.name.startswith(".") or f.name.endswith(".texto_extraido.txt"):
                continue
            if (f.name, f.name) in vistos:
                continue
            clasificacion = clasificar_documento(f.name)
            resultado.append({
                "nombre": f.name,
                "filename": f.name,
                "path": str(f),
                "es_pliego": False,
                "size_bytes": f.stat().st_size,
                "clasificacion": clasificacion,
            })
            vistos.add((f.name, f.name))

    return resultado


def _analizar_proceso(proceso_id: int, db) -> dict[str, Any]:
    """Analiza un proceso y retorna datos estructurados para el Core."""
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    if not proceso:
        return {"proceso_id": proceso_id, "error": "Proceso no encontrado"}

    try:
        analisis = analizar_pliego(proceso_id, 3, db)
    except Exception as exc:
        return {"proceso_id": proceso_id, "error": f"Error analizando pliego: {exc}"}

    documentos = _extraer_documentos_proceso(proceso_id, db)

    return {
        "proceso_id": proceso_id,
        "numero_proceso": proceso.numero_proceso,
        "entidad": proceso.entidad,
        "departamento": proceso.departamento,
        "modalidad": proceso.modalidad,
        "presupuesto": proceso.presupuesto,
        "unspsc_code": proceso.unspsc_code,
        "objeto": proceso.objeto,
        "documentos_descargados": len(documentos),
        "documentos": documentos,
        "requisitos_detectados": analisis.get("requisitos", []),
        "requisitos_estructurados": analisis.get("requisitos_estructurados", {}),
        "resumen_requisitos": analisis.get("resumen_requisitos", []),
    }


def _calcular_frecuencia_label(tipo_core: str, relativa: float, requerida_relativa: float) -> str:
    """Determina si un documento es obligatorio, frecuente o según pliego.

    Para documentos del proponente se usa la mayor frecuencia entre lo que el
    texto del pliego requiere y lo que aparece como archivo/modelo en el pliego.
    Para documentos del pliego y factores de calidad se usa la frecuencia con
    la que aparecen como archivos descargados.
    """
    if tipo_core == "proponente":
        metrica = max(requerida_relativa, relativa)
    else:
        metrica = relativa

    if metrica >= UMBRAL_OBLIGATORIO:
        return "obligatorio"
    if metrica >= UMBRAL_FRECUENTE:
        return "frecuente"
    return "segun_pliego"


def _frecuencia_documentos(analisis_list: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Calcula la frecuencia de cada documento del Core entre los procesos analizados."""
    conteo: Counter = Counter()
    total = 0
    ejemplos: dict[str, list[dict]] = {}

    for analisis in analisis_list:
        if analisis.get("error"):
            continue
        total += 1
        vistos_ids = set()
        for doc in analisis.get("documentos", []):
            clasificacion = doc.get("clasificacion")
            if not clasificacion:
                continue
            doc_id = clasificacion["id"]
            if doc_id in vistos_ids:
                continue
            vistos_ids.add(doc_id)
            conteo[doc_id] += 1
            ejemplos.setdefault(doc_id, []).append({
                "proceso_id": analisis["proceso_id"],
                "numero_proceso": analisis["numero_proceso"],
                "filename": doc["filename"],
            })

    # También detectar documentos requeridos desde el texto del pliego
    req_texto_conteo: Counter = Counter()
    for analisis in analisis_list:
        if analisis.get("error"):
            continue
        re = analisis.get("requisitos_estructurados", {})
        for doc_id in re.get("documentos_requeridos", []):
            req_texto_conteo[doc_id] += 1

    frecuencias = {}
    for meta in DOCUMENTOS_BASE_FIJOS:
        doc_id = meta["id"]
        freq_abs = conteo.get(doc_id, 0)
        freq_rel = freq_abs / total if total else 0
        req_abs = req_texto_conteo.get(doc_id, 0)
        req_rel = req_abs / total if total else 0

        # Obligatoriedad basada en frecuencia real
        frecuencia_label = _calcular_frecuencia_label(meta.get("tipo_core", "proponente"), freq_rel, req_rel)

        frecuencias[doc_id] = {
            **meta,
            "frecuencia_absoluta": freq_abs,
            "frecuencia_relativa": round(freq_rel, 4),
            "requerido_en_pliego": req_abs,
            "requerido_relativo": round(req_rel, 4),
            "frecuencia_label": frecuencia_label,
            "procesos_analizados": total,
            "ejemplos": ejemplos.get(doc_id, [])[:5],
        }
    return frecuencias


def _consolidar_requisitos(analisis_list: list[dict[str, Any]]) -> dict[str, Any]:
    """Consolida requisitos cuantitativos detectados."""
    conteo_tipo_proceso: Counter = Counter()
    conteo_complejidad: Counter = Counter()
    conteo_indicadores: Counter = Counter()
    conteo_capacidad_residual = 0
    conteo_factor_calidad = 0
    conteo_mipyme = 0
    conteo_industria_nacional = 0
    valores_experiencia: list[dict] = []
    total = 0

    for analisis in analisis_list:
        if analisis.get("error"):
            continue
        total += 1
        re = analisis.get("requisitos_estructurados", {})

        if re.get("tipo_proceso"):
            conteo_tipo_proceso[re["tipo_proceso"]] += 1
        if re.get("complejidad_tecnica"):
            conteo_complejidad[re["complejidad_tecnica"]] += 1

        exp = re.get("experiencia", {})
        if exp.get("valor_minimo_smmlv") or exp.get("valor_minimo_cop"):
            valores_experiencia.append({
                "proceso_id": analisis["proceso_id"],
                "valor_minimo_smmlv": exp.get("valor_minimo_smmlv"),
                "valor_minimo_cop": exp.get("valor_minimo_cop"),
                "fuente": exp.get("fuente_valor_minimo"),
                "tipos_obra": exp.get("tipos_obra", []),
            })

        cf = re.get("capacidad_financiera", {})
        for ind in cf.get("indicadores_requeridos", []):
            conteo_indicadores[ind] += 1

        cr = re.get("capacidad_residual", {})
        if cr.get("requerida"):
            conteo_capacidad_residual += 1

        fc = re.get("factores_calidad", {})
        if fc.get("factor_calidad"):
            conteo_factor_calidad += 1
        if fc.get("mipyme"):
            conteo_mipyme += 1
        if fc.get("industria_nacional"):
            conteo_industria_nacional += 1

    return {
        "procesos_analizados": total,
        "tipos_proceso": dict(conteo_tipo_proceso),
        "complejidades_tecnicas": dict(conteo_complejidad),
        "valores_minimos_experiencia": valores_experiencia,
        "indicadores_financieros_requeridos": dict(conteo_indicadores),
        "con_capacidad_residual": conteo_capacidad_residual,
        "con_factor_calidad": conteo_factor_calidad,
        "con_mipyme": conteo_mipyme,
        "con_industria_nacional": conteo_industria_nacional,
    }


def _generar_csv(core: dict[str, Any]) -> None:
    """Genera una versión plana del Core en CSV."""
    filas = []
    for tipo_core in ["proponente", "pliego", "calidad"]:
        for doc_id, info in core.get(tipo_core, {}).items():
            filas.append({
                "tipo_core": tipo_core,
                "id": doc_id,
                "nombre": info["nombre"],
                "categoria": info["categoria"],
                "frecuencia_label": info["frecuencia_label"],
                "frecuencia_absoluta": info["frecuencia_absoluta"],
                "frecuencia_relativa": info["frecuencia_relativa"],
                "requerido_en_pliego": info["requerido_en_pliego"],
                "requerido_relativo": info["requerido_relativo"],
                "procesos_analizados": info["procesos_analizados"],
                "keywords": ", ".join(info["keywords"]),
            })

    import pandas as pd
    pd.DataFrame(filas).to_csv(OUTPUT_CSV, index=False, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--masivo", action="store_true", help="Usar analisis_100_pliegos.json en lugar del proceso piloto.")
    parser.add_argument("--proceso-piloto", type=int, default=1, help="ID del proceso piloto a usar.")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.masivo:
            if not ANALISIS_JSON.exists():
                print(f"No se encontró {ANALISIS_JSON}. Ejecuta primero analizar_100_pliegos.py")
                sys.exit(1)
            analisis_list = json.loads(ANALISIS_JSON.read_text(encoding="utf-8"))
            print(f"Consolidando Core a partir de {len(analisis_list)} procesos del análisis masivo...")
        else:
            print(f"Consolidando Core a partir del proceso piloto ID {args.proceso_piloto}...")
            analisis_list = [_analizar_proceso(args.proceso_piloto, db)]

        exitosos = [a for a in analisis_list if not a.get("error")]
        print(f"Procesos analizados exitosamente: {len(exitosos)}")

        # En modo masivo, enriquecer cada análisis con los documentos descargados
        if args.masivo:
            for analisis in exitosos:
                docs = _extraer_documentos_proceso(analisis["proceso_id"], db)
                analisis["documentos"] = docs
                analisis["documentos_descargados"] = len(docs)

        frecuencias = _frecuencia_documentos(exitosos)
        requisitos = _consolidar_requisitos(exitosos)

        # Separar en tres listas
        core_por_tipo = {"proponente": {}, "pliego": {}, "calidad": {}}
        for doc_id, info in frecuencias.items():
            tipo = info.get("tipo_core", "proponente")
            core_por_tipo[tipo][doc_id] = info

        core = {
            "version": "2.0",
            "fecha_generacion": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            "fuente": "analisis_masivo_100_pliegos" if args.masivo else f"proceso_piloto_{args.proceso_piloto}",
            "procesos_analizados": len(exitosos),
            "umbrales": {
                "obligatorio": UMBRAL_OBLIGATORIO,
                "frecuente": UMBRAL_FRECUENTE,
            },
            "proponente": core_por_tipo["proponente"],
            "pliego": core_por_tipo["pliego"],
            "calidad": core_por_tipo["calidad"],
            "requisitos_estructurados": requisitos,
        }

        OUTPUT_JSON.write_text(json.dumps(core, indent=2, ensure_ascii=False), encoding="utf-8")
        _generar_csv(core)

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

    finally:
        db.close()


if __name__ == "__main__":
    main()
