"""Análisis masivo de la muestra estratificada de 100 pliegos SECOP II.

Lee storage/muestra_100_pliegos.csv, busca documentos descargados en
storage/procesos/{proceso_id}/, identifica el pliego de condiciones, extrae
texto y requisitos estructurados, y genera reportes consolidados en
storage/analisis_100_pliegos.json y storage/analisis_100_pliegos.csv.

Soporta reanudación y timeout por proceso para evitar que un solo documento
cuelgue todo el análisis.

Uso:
    source backend/venv/bin/activate
    cd backend
    TESSERACT_CMD=/opt/homebrew/bin/tesseract python analizar_100_pliegos.py

    # Reanudar saltando procesos ya analizados en el JSON previo
    TESSERACT_CMD=/opt/homebrew/bin/tesseract python analizar_100_pliegos.py --resume
"""

import argparse
import json
import os
import re
import signal
import sys
import time
import traceback
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from sqlalchemy.orm import Session

from analizador_pliego import detectar_requisitos, extraer_texto
from database import SessionLocal
from extraccion.requisitos_pliego import extraer_requisitos_estructurados, resumen_requisitos_para_cliente
from models import DocumentoProceso, Proceso

# Ruta base de almacenamiento
STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
MUESTRA_CSV = STORAGE_PATH / "muestra_100_pliegos.csv"
PROCESOS_DIR = STORAGE_PATH / "procesos"
OUTPUT_JSON = STORAGE_PATH / "analisis_100_pliegos.json"
OUTPUT_CSV = STORAGE_PATH / "analisis_100_pliegos.csv"
OUTPUT_RESUMEN = STORAGE_PATH / "resumen_100_pliegos.json"

# Timeout por proceso (segundos). Evita que un PDF escaneado grande cuelgue el batch.
TIMEOUT_PROCESO = int(os.getenv("TIMEOUT_ANALISIS_PROCESO", "120"))

# Máximo tamaño de pliego a analizar (bytes). Archivos muy grandes se saltan.
MAX_PLIEGO_SIZE = int(os.getenv("MAX_PLIEGO_SIZE", "150_000_000"))

# Heurística para identificar el pliego entre los documentos descargados
PLIEGO_KEYWORDS = [
    "pliego",
    "condiciones",
    "terminos",
    "términos",
    "documento base",
    "documento_base",
    "doc base",
    "bases",
    "proyecto de pliego",
    "pliego tipo",
    "documento tipo",
]


class TimeoutException(Exception):
    pass


def _timeout_handler(signum, frame):
    raise TimeoutException(f"El proceso excedió {TIMEOUT_PROCESO} segundos")


def _es_pliego(nombre: str) -> bool:
    """Determina si un nombre de archivo parece ser el pliego de condiciones."""
    nombre_norm = re.sub(r"[_.\-]+", " ", nombre.lower())
    return any(palabra in nombre_norm for palabra in PLIEGO_KEYWORDS)


def _encontrar_pliego_en_disco(proceso_id: int) -> tuple[Path | None, str]:
    """Busca el archivo del pliego en el directorio de documentos del proceso."""
    proc_dir = PROCESOS_DIR / str(proceso_id)
    if not proc_dir.exists():
        return None, ""

    candidatos = []
    for f in proc_dir.iterdir():
        if not f.is_file():
            continue
        if f.name.startswith(".") or f.name.startswith("_") or f.name.endswith(".texto_extraido.txt"):
            continue
        score = 0
        nombre_lower = f.name.lower()
        if _es_pliego(f.name):
            score += 100
        # Priorizar PDFs y DOCX sobre XLSX / formatos
        if f.suffix.lower() in (".pdf", ".docx"):
            score += 10
        # Penalizar formatos numéricos pequeños
        if f.suffix.lower() in (".xlsx", ".xls"):
            score -= 5
        # Preferir archivos grandes dentro de los candidatos
        score += min(f.stat().st_size / 1_000_000, 20)  # hasta +20 puntos por MB
        if score > 0:
            candidatos.append((score, f))

    if candidatos:
        candidatos.sort(key=lambda x: x[0], reverse=True)
        return candidatos[0][1], candidatos[0][1].name

    return None, ""


def _encontrar_pliego_en_bd(proceso_id: int, db: Session) -> tuple[Path | None, str]:
    """Busca un documento marcado como pliego en la base de datos."""
    docs = (
        db.query(DocumentoProceso)
        .filter(DocumentoProceso.proceso_id == proceso_id, DocumentoProceso.es_pliego == True)
        .all()
    )
    for doc in docs:
        if doc.path and Path(doc.path).exists():
            return Path(doc.path), doc.nombre
    return None, ""


def _cache_texto_path(pliego_path: Path) -> Path:
    """Ruta de cache de texto extraído para evitar repetir OCR."""
    return pliego_path.with_suffix(pliego_path.suffix + ".texto_extraido.txt")


def _extraer_texto_con_cache(pliego_path: Path) -> str:
    """Extrae texto del pliego, usando cache si existe."""
    cache = _cache_texto_path(pliego_path)
    if cache.exists() and cache.stat().st_size > 0:
        return cache.read_text(encoding="utf-8", errors="ignore")

    texto = extraer_texto(str(pliego_path))
    if texto.strip():
        cache.write_text(texto, encoding="utf-8", errors="ignore")
    return texto


def _documentos_proceso_para_extraccion(proceso_id: int, db: Session) -> list[Any]:
    """Retorna los documentos del proceso registrados en BD."""
    return db.query(DocumentoProceso).filter(DocumentoProceso.proceso_id == proceso_id).all()


def analizar_pliego_muestra(proceso_id: int, db: Session) -> dict[str, Any]:
    """Analiza un pliego de la muestra sin cruzar con cliente.

    Retorna un dict con metadatos del proceso, resultado del análisis o error.
    """
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    if not proceso:
        return {"proceso_id": proceso_id, "error": "Proceso no encontrado en BD"}

    # 1. Buscar pliego
    pliego_path, pliego_nombre = _encontrar_pliego_en_bd(proceso_id, db)
    if not pliego_path:
        pliego_path, pliego_nombre = _encontrar_pliego_en_disco(proceso_id)

    if not pliego_path:
        return {
            "proceso_id": proceso_id,
            "numero_proceso": proceso.numero_proceso,
            "entidad": proceso.entidad,
            "departamento": proceso.departamento,
            "modalidad": proceso.modalidad,
            "rol": None,
            "geografia": None,
            "presupuesto": proceso.presupuesto,
            "unspsc_code": proceso.unspsc_code,
            "error": "No se encontró pliego descargado",
            "pliego_nombre": None,
        }

    if pliego_path.stat().st_size > MAX_PLIEGO_SIZE:
        return {
            "proceso_id": proceso_id,
            "numero_proceso": proceso.numero_proceso,
            "entidad": proceso.entidad,
            "departamento": proceso.departamento,
            "modalidad": proceso.modalidad,
            "presupuesto": proceso.presupuesto,
            "unspsc_code": proceso.unspsc_code,
            "error": f"Pliego demasiado grande ({pliego_path.stat().st_size / 1_000_000:.1f} MB > {MAX_PLIEGO_SIZE / 1_000_000:.1f} MB)",
            "pliego_nombre": pliego_nombre,
        }

    # 2. Extraer texto con timeout
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(TIMEOUT_PROCESO)
    try:
        texto = _extraer_texto_con_cache(pliego_path)
    except TimeoutException:
        return {
            "proceso_id": proceso_id,
            "numero_proceso": proceso.numero_proceso,
            "entidad": proceso.entidad,
            "departamento": proceso.departamento,
            "modalidad": proceso.modalidad,
            "presupuesto": proceso.presupuesto,
            "unspsc_code": proceso.unspsc_code,
            "error": f"Timeout extrayendo texto del pliego ({TIMEOUT_PROCESO}s)",
            "pliego_nombre": pliego_nombre,
        }
    finally:
        signal.alarm(0)

    if not texto.strip():
        return {
            "proceso_id": proceso_id,
            "numero_proceso": proceso.numero_proceso,
            "entidad": proceso.entidad,
            "departamento": proceso.departamento,
            "modalidad": proceso.modalidad,
            "presupuesto": proceso.presupuesto,
            "unspsc_code": proceso.unspsc_code,
            "error": "No se pudo extraer texto del pliego",
            "pliego_nombre": pliego_nombre,
        }

    # 3. Detectar requisitos generales
    requisitos = detectar_requisitos(texto)

    # 4. Extraer requisitos estructurados
    documentos_proceso = _documentos_proceso_para_extraccion(proceso_id, db)
    requisitos_estructurados = extraer_requisitos_estructurados(
        texto,
        documentos_proceso,
        presupuesto=proceso.presupuesto or 0,
    )
    resumen_requisitos = resumen_requisitos_para_cliente(requisitos_estructurados)

    # 5. Calcular métricas simples
    palabras = len(texto.split())
    caracteres = len(texto)

    return {
        "proceso_id": proceso_id,
        "numero_proceso": proceso.numero_proceso,
        "entidad": proceso.entidad,
        "departamento": proceso.departamento,
        "modalidad": proceso.modalidad,
        "presupuesto": proceso.presupuesto,
        "unspsc_code": proceso.unspsc_code,
        "objeto": proceso.objeto,
        "url_documento": proceso.url_documento,
        "pliego_nombre": pliego_nombre,
        "pliego_path": str(pliego_path),
        "pliego_size_bytes": pliego_path.stat().st_size,
        "texto_palabras": palabras,
        "texto_caracteres": caracteres,
        "cantidad_requisitos": len(requisitos),
        "requisitos": requisitos,
        "requisitos_estructurados": requisitos_estructurados,
        "resumen_requisitos": resumen_requisitos,
        "error": None,
    }


def _flatten_requisitos_estructurados(re: dict[str, Any]) -> dict[str, Any]:
    """Convierte requisitos estructurados en columnas planas para CSV."""
    exp = re.get("experiencia", {})
    cf = re.get("capacidad_financiera", {})
    cr = re.get("capacidad_residual", {})

    return {
        "tipo_proceso": re.get("tipo_proceso"),
        "complejidad_tecnica": re.get("complejidad_tecnica"),
        "actividad_principal": (re.get("actividad_principal") or {}).get("descripcion"),
        "exp_min_contratos": exp.get("min_contratos"),
        "exp_max_contratos": exp.get("max_contratos"),
        "exp_valor_minimo_cop": exp.get("valor_minimo_cop"),
        "exp_valor_minimo_smmlv": exp.get("valor_minimo_smmlv"),
        "exp_tipos_obra": ", ".join(exp.get("tipos_obra", [])) if exp.get("tipos_obra") else None,
        "cf_patrimonio_minimo_cop": cf.get("patrimonio_minimo_cop"),
        "cf_indicadores_requeridos": ", ".join(cf.get("indicadores_requeridos", [])) if cf.get("indicadores_requeridos") else None,
        "cf_matriz2_presente": bool(cf.get("matriz2")),
        "cr_requerida": cr.get("requerida", False),
        "cr_min_crp_pct": cr.get("min_crp_pct"),
        "doc_rup": "rup" in re.get("documentos_requeridos", []),
        "doc_estados_financieros": "estados_financieros" in re.get("documentos_requeridos", []),
        "doc_certificados_experiencia": "certificados_experiencia" in re.get("documentos_requeridos", []),
        "doc_paz_salvo_parafiscales": "paz_salvo_parafiscales" in re.get("documentos_requeridos", []),
        "doc_poliza_seriedad": "poliza_seriedad" in re.get("documentos_requeridos", []),
        "doc_propuesta_tecnica": "propuesta_tecnica" in re.get("documentos_requeridos", []),
        "doc_propuesta_economica": "propuesta_economica" in re.get("documentos_requeridos", []),
        "doc_carta_presentacion": "carta_presentacion" in re.get("documentos_requeridos", []),
        "factor_calidad": re.get("factores_calidad", {}).get("factor_calidad", False),
        "mipyme": re.get("factores_calidad", {}).get("mipyme", False),
        "advertencias": " | ".join(re.get("advertencias", [])) if re.get("advertencias") else None,
    }


def _generar_resumen(resultados: list[dict[str, Any]], errores: list[dict[str, Any]]) -> dict[str, Any]:
    """Genera el resumen estadístico a partir de los resultados."""
    analizados = [r for r in resultados if not r.get("error")]
    con_error = [r for r in resultados if r.get("error")]

    resumen = {
        "total_muestra": len(resultados),
        "con_pliego_analizado": len(analizados),
        "sin_pliego_o_error": len(con_error),
        "por_rol": {},
        "por_modalidad": {},
        "por_geografia": {},
        "requisitos_detectados": {},
        "requisitos_estructurados": {
            "con_tipo_proceso": 0,
            "con_complejidad": 0,
            "con_actividad_principal": 0,
            "con_valor_minimo_experiencia": 0,
            "con_matriz1": 0,
            "con_matriz2": 0,
            "con_capacidad_financiera": 0,
            "con_capacidad_residual": 0,
            "documentos_requeridos": {},
            "factores_calidad": {
                "factor_calidad": 0,
                "mipyme": 0,
                "industria_nacional": 0,
                "empresas_mujeres": 0,
            },
        },
        "errores": [
            {"proceso_id": e["proceso_id"], "error": e["error"]} for e in errores
        ],
    }

    for r in analizados:
        rol = r.get("rol") or "desconocido"
        mod = r.get("modalidad_estandar") or "desconocido"
        geo = r.get("geografia") or "desconocido"
        resumen["por_rol"][rol] = resumen["por_rol"].get(rol, 0) + 1
        resumen["por_modalidad"][mod] = resumen["por_modalidad"].get(mod, 0) + 1
        resumen["por_geografia"][geo] = resumen["por_geografia"].get(geo, 0) + 1

        for req in r.get("requisitos", []):
            rid = req["id"]
            resumen["requisitos_detectados"][rid] = resumen["requisitos_detectados"].get(rid, 0) + 1

        re = r.get("requisitos_estructurados", {})
        if re.get("tipo_proceso"):
            resumen["requisitos_estructurados"]["con_tipo_proceso"] += 1
        if re.get("complejidad_tecnica"):
            resumen["requisitos_estructurados"]["con_complejidad"] += 1
        if re.get("actividad_principal"):
            resumen["requisitos_estructurados"]["con_actividad_principal"] += 1
        exp = re.get("experiencia", {})
        if exp.get("valor_minimo_cop") or exp.get("valor_minimo_smmlv"):
            resumen["requisitos_estructurados"]["con_valor_minimo_experiencia"] += 1
        if exp.get("matriz1"):
            resumen["requisitos_estructurados"]["con_matriz1"] += 1
        cf = re.get("capacidad_financiera", {})
        if cf:
            resumen["requisitos_estructurados"]["con_capacidad_financiera"] += 1
        if cf.get("matriz2"):
            resumen["requisitos_estructurados"]["con_matriz2"] += 1
        cr = re.get("capacidad_residual", {})
        if cr.get("requerida"):
            resumen["requisitos_estructurados"]["con_capacidad_residual"] += 1

        for doc_id in re.get("documentos_requeridos", []):
            resumen["requisitos_estructurados"]["documentos_requeridos"][doc_id] = (
                resumen["requisitos_estructurados"]["documentos_requeridos"].get(doc_id, 0) + 1
            )

        fc = re.get("factores_calidad", {})
        for k in resumen["requisitos_estructurados"]["factores_calidad"]:
            if fc.get(k):
                resumen["requisitos_estructurados"]["factores_calidad"][k] += 1

    return resumen


def _guardar_reportes(resultados: list[dict[str, Any]], errores: list[dict[str, Any]]) -> None:
    """Guarda JSON, CSV y resumen."""
    OUTPUT_JSON.write_text(
        json.dumps(resultados, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    filas_csv = []
    for r in resultados:
        fila = {
            "proceso_id": r.get("proceso_id"),
            "numero_proceso": r.get("numero_proceso"),
            "entidad": r.get("entidad"),
            "departamento": r.get("departamento"),
            "modalidad": r.get("modalidad"),
            "rol": r.get("rol"),
            "geografia": r.get("geografia"),
            "presupuesto": r.get("presupuesto"),
            "unspsc_code": r.get("unspsc_code"),
            "pliego_nombre": r.get("pliego_nombre"),
            "pliego_size_bytes": r.get("pliego_size_bytes"),
            "texto_palabras": r.get("texto_palabras"),
            "texto_caracteres": r.get("texto_caracteres"),
            "cantidad_requisitos": r.get("cantidad_requisitos"),
            "error": r.get("error"),
            "tiempo_segundos": r.get("tiempo_segundos"),
        }
        fila.update(_flatten_requisitos_estructurados(r.get("requisitos_estructurados", {})))
        filas_csv.append(fila)

    pd.DataFrame(filas_csv).to_csv(OUTPUT_CSV, index=False, encoding="utf-8")

    resumen = _generar_resumen(resultados, errores)
    OUTPUT_RESUMEN.write_text(
        json.dumps(resumen, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return resumen


def main():
    parser = argparse.ArgumentParser(description="Análisis masivo de 100 pliegos.")
    parser.add_argument("--resume", action="store_true", help="Reanudar usando analisis_100_pliegos.json previo.")
    args = parser.parse_args()

    if not MUESTRA_CSV.exists():
        print(f"No se encontró la muestra: {MUESTRA_CSV}")
        print("Ejecuta primero: python sample_100_pliegos.py")
        sys.exit(1)

    df_muestra = pd.read_csv(MUESTRA_CSV)
    print(f"Muestra cargada: {len(df_muestra)} procesos")
    print(f"Timeout por proceso: {TIMEOUT_PROCESO}s")
    print(f"Máximo tamaño de pliego: {MAX_PLIEGO_SIZE / 1_000_000:.1f} MB")

    resultados_previos = {}
    if args.resume and OUTPUT_JSON.exists():
        previos = json.loads(OUTPUT_JSON.read_text(encoding="utf-8"))
        resultados_previos = {r["proceso_id"]: r for r in previos if not r.get("error")}
        print(f"Reanudando: {len(resultados_previos)} procesos ya analizados se saltarán.")

    db = SessionLocal()
    try:
        resultados = []
        errores = []
        t0_total = time.time()

        for idx, row in df_muestra.iterrows():
            proceso_id = int(row["id"])
            print(f"\n[{idx + 1}/{len(df_muestra)}] Analizando proceso {proceso_id}...")

            if proceso_id in resultados_previos:
                print(f"   → YA ANALIZADO (resume), se salta")
                resultado = resultados_previos[proceso_id]
                resultados.append(resultado)
                continue

            t0 = time.time()
            try:
                resultado = analizar_pliego_muestra(proceso_id, db)
            except TimeoutException as exc:
                resultado = {
                    "proceso_id": proceso_id,
                    "error": f"TIMEOUT: {exc}",
                }
                errores.append({"proceso_id": proceso_id, "error": str(exc)})
            except Exception as exc:
                traceback.print_exc()
                resultado = {
                    "proceso_id": proceso_id,
                    "error": f"EXCEPCION: {exc}",
                }
                errores.append({"proceso_id": proceso_id, "error": str(exc)})

            resultado["tiempo_segundos"] = round(time.time() - t0, 2)
            resultado["rol"] = row.get("rol")
            resultado["modalidad_estandar"] = row.get("modalidad")
            resultado["geografia"] = row.get("geografia")
            resultados.append(resultado)

            status = "OK" if not resultado.get("error") else "ERROR"
            print(f"   → {status} en {resultado['tiempo_segundos']}s | {resultado.get('error', '')}")

            # Guardar reportes parciales cada 5 procesos
            if (idx + 1) % 5 == 0:
                _guardar_reportes(resultados, errores)
                print(f"   (reportes parciales guardados)")

        print(f"\nAnálisis completado en {round(time.time() - t0_total, 1)}s")

        resumen = _guardar_reportes(resultados, errores)
        print(f"Reporte JSON guardado: {OUTPUT_JSON}")
        print(f"Reporte CSV guardado: {OUTPUT_CSV}")
        print(f"Resumen estadístico guardado: {OUTPUT_RESUMEN}")
        print("\n=== RESUMEN ===")
        print(json.dumps(resumen, indent=2, ensure_ascii=False))

    finally:
        db.close()


if __name__ == "__main__":
    main()
