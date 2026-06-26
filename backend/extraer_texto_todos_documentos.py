"""Extrae texto de todos los documentos descargados de los 100 pliegos.

No solo extrae el pliego principal, sino también anexos, matrices, formatos,
estudios previos y cualquier otro archivo en storage/procesos/{proceso_id}/.

El texto extraído se guarda junto a cada archivo como:
    {archivo}.{ext}.texto_extraido.txt

Soporta reanudación: si el cache ya existe y no está vacío, salta el archivo.

Estrategia de OCR selectivo:
- Extrae texto nativo de todos los archivos (rápido).
- Si un PDF es escaneado (sin texto nativo), aplica OCR solo cuando el nombre
  del archivo indique que es relevante para requisitos (pliego, anexo técnico,
  estudio previo, formato, matriz, etc.).
- Para PDFs escaneados no relevantes (planos, certificados, fotos) guarda un
  marcador para no volver a intentar.

Uso:
    cd backend
    source venv/bin/activate
    TESSERACT_CMD=/opt/homebrew/bin/tesseract python extraer_texto_todos_documentos.py

    # Procesar solo ciertos formatos
    python extraer_texto_todos_documentos.py --ext pdf,xlsx

    # Forzar re-extracción de archivos ya cacheados
    python extraer_texto_todos_documentos.py --force
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

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from analizador_pliego import extraer_texto

# Configurar Tesseract si está definido en variables de entorno.
TESSERACT_CMD = os.getenv("TESSERACT_CMD")
if TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD

STORAGE_PATH = Path(__file__).resolve().parent.parent / "storage"
PROCESOS_DIR = STORAGE_PATH / "procesos"
OUTPUT_JSON = STORAGE_PATH / "extraccion_texto_todos_documentos.json"

# Timeout por archivo (segundos).
TIMEOUT_ARCHIVO = int(os.getenv("TIMEOUT_EXTRACCION_TEXTO", "120"))

# Máximo de páginas a OCR para PDFs escaneados relevantes.
OCR_MAX_PAGES_RELEVANTE = int(os.getenv("OCR_MAX_PAGES_RELEVANTE", "5"))

# Formatos soportados
EXTENSIONES_SOPORTADAS = {".pdf", ".docx", ".xlsx", ".xls", ".doc", ".zip", ".txt"}

# Nombres que indican que un documento escaneado vale la pena OCR.
PALABRAS_RELEVANTES_OCR = [
    "pliego", "condiciones", "documento base", "bases", "terminos", "términos",
    "anexo tecnico", "anexo técnico", "especificaciones", "especificaciones tecnicas",
    "estudio previo", "estudios previos", "diagnostico", "diagnóstico",
    "formato", "matriz", "experiencia", "indicadores", "riesgos", "capacidad",
    "propuesta", "carta", "pacto", "transparencia", "minuta", "acta",
    "cronograma", "presupuesto", "analisis", "análisis",
]


class TimeoutException(Exception):
    pass


def _timeout_handler(signum, frame):
    raise TimeoutException(f"El archivo excedió {TIMEOUT_ARCHIVO} segundos")


def _cache_path(archivo: Path) -> Path:
    """Ruta del cache de texto extraído para un archivo."""
    return archivo.with_suffix(archivo.suffix + ".texto_extraido.txt")


def _listar_documentos(exts: set[str] | None = None) -> list[Path]:
    """Lista todos los archivos descargados de todos los procesos."""
    documentos: list[Path] = []
    if not PROCESOS_DIR.exists():
        return documentos

    for proc_dir in sorted(PROCESOS_DIR.iterdir()):
        if not proc_dir.is_dir():
            continue
        for f in proc_dir.iterdir():
            if not f.is_file():
                continue
            if f.name.startswith("."):
                continue
            if f.name.endswith(".texto_extraido.txt"):
                continue
            if exts and f.suffix.lower() not in exts:
                continue
            documentos.append(f)

    return documentos


def _ocr_pdf_limitado(path: str, max_pages: int = OCR_MAX_PAGES_RELEVANTE) -> str:
    """Aplica OCR a las primeras max_pages páginas de un PDF."""
    textos = []
    try:
        doc = fitz.open(path)
        paginas = min(len(doc), max_pages)
        for i in range(paginas):
            page = doc.load_page(i)
            pix = page.get_pixmap(dpi=150)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            texto = pytesseract.image_to_string(img, lang="spa")
            textos.append(f"--- PAGINA {i + 1} ---\n{texto}")
        doc.close()
    except Exception as exc:
        textos.append(f"[Error en OCR de PDF: {exc}]")
    return "\n".join(textos)


def _es_relevante_para_ocr(nombre: str) -> bool:
    """Decide si un PDF escaneado merece OCR según su nombre."""
    n = re.sub(r"[_.\-]+", " ", nombre.lower())
    return any(p in n for p in PALABRAS_RELEVANTES_OCR)


def _extraer_pdf_selectivo(path: str, nombre: str) -> str:
    """Extrae texto de PDF: nativo si existe, OCR selectivo si es escaneado."""
    doc = fitz.open(path)
    textos = []
    for page in doc:
        txt = page.get_text()
        if txt:
            textos.append(txt)
    doc.close()

    texto_nativo = "\n".join(textos)
    if texto_nativo.strip():
        return texto_nativo

    # PDF escaneado: decidir si OCR
    if not _es_relevante_para_ocr(nombre):
        return "[PDF_ESCANEADO_NO_RELEVANTE_OMITIDO]"

    try:
        return _ocr_pdf_limitado(path, max_pages=OCR_MAX_PAGES_RELEVANTE)
    except Exception as exc:
        return f"[PDF_ESCANEADO_OCR_FALLÓ: {exc}]"


def _extraer_con_timeout(path: str, nombre: str) -> str:
    """Envuelve la extracción con timeout por signal."""
    signal.signal(signal.SIGALRM, _timeout_handler)
    signal.alarm(TIMEOUT_ARCHIVO)
    try:
        if path.lower().endswith(".pdf"):
            texto = _extraer_pdf_selectivo(path, nombre)
        else:
            texto = extraer_texto(path)
    finally:
        signal.alarm(0)
    return texto


def main():
    parser = argparse.ArgumentParser(description="Extrae texto de todos los documentos descargados.")
    parser.add_argument("--ext", type=str, default=None, help="Extensiones a procesar, separadas por coma (ej: pdf,xlsx).")
    parser.add_argument("--force", action="store_true", help="Re-extraer archivos que ya tienen cache.")
    parser.add_argument("--max", type=int, default=None, help="Máximo número de archivos a procesar (útil para pruebas).")
    args = parser.parse_args()

    exts = None
    if args.ext:
        exts = set(f"." + e.strip().lstrip(".") for e in args.ext.split(","))
        print(f"Filtrando por extensiones: {exts}")

    documentos = _listar_documentos(exts)
    print(f"Documentos encontrados: {len(documentos)}")

    if args.max:
        documentos = documentos[:args.max]
        print(f"Procesando máximo {args.max} archivos.")

    resultados: list[dict[str, Any]] = []
    exitosos = 0
    fallidos = 0
    saltados = 0
    omitidos = 0
    t0_total = time.time()

    for idx, doc_path in enumerate(documentos, start=1):
        cache = _cache_path(doc_path)
        proceso_id = doc_path.parent.name

        # Reanudar si ya existe cache
        if not args.force and cache.exists() and cache.stat().st_size > 0:
            print(f"[{idx}/{len(documentos)}] SKIP (ya extraído) {doc_path.name}")
            saltados += 1
            resultados.append({
                "proceso_id": proceso_id,
                "path": str(doc_path),
                "filename": doc_path.name,
                "status": "saltado",
                "cache": str(cache),
            })
            continue

        print(f"[{idx}/{len(documentos)}] Extrayendo {doc_path.name} ...")
        t0 = time.time()

        try:
            texto = _extraer_con_timeout(str(doc_path), doc_path.name)
            cache.write_text(texto, encoding="utf-8", errors="ignore")

            duracion = round(time.time() - t0, 2)
            palabras = len(texto.split())

            if "[PDF_ESCANEADO_NO_RELEVANTE_OMITIDO]" in texto:
                print(f"   → OMITIDO (escaneado no relevante) | {duracion}s")
                omitidos += 1
                status = "omitido"
            elif "[PDF_ESCANEADO_OCR_FALLÓ" in texto or "[SIN_TEXTO]" in texto:
                print(f"   → SIN_TEXTO | {duracion}s")
                status = "sin_texto"
            else:
                print(f"   → OK | {palabras} palabras | {duracion}s")
                exitosos += 1
                status = "ok"

            resultados.append({
                "proceso_id": proceso_id,
                "path": str(doc_path),
                "filename": doc_path.name,
                "status": status,
                "palabras": palabras,
                "duracion_segundos": duracion,
                "cache": str(cache),
            })

        except TimeoutException as exc:
            print(f"   → TIMEOUT: {exc}")
            fallidos += 1
            resultados.append({
                "proceso_id": proceso_id,
                "path": str(doc_path),
                "filename": doc_path.name,
                "status": "timeout",
                "error": str(exc),
            })

        except Exception as exc:
            traceback.print_exc()
            print(f"   → ERROR: {exc}")
            fallidos += 1
            resultados.append({
                "proceso_id": proceso_id,
                "path": str(doc_path),
                "filename": doc_path.name,
                "status": "error",
                "error": str(exc),
            })

        # Guardar log parcial cada 10 archivos
        if idx % 10 == 0:
            resumen_parcial = {
                "total_archivos": len(documentos),
                "exitosos": exitosos,
                "fallidos": fallidos,
                "saltados": saltados,
                "omitidos": omitidos,
                "tiempo_total_segundos": round(time.time() - t0_total, 1),
                "resultados": resultados,
            }
            OUTPUT_JSON.write_text(json.dumps(resumen_parcial, indent=2, ensure_ascii=False), encoding="utf-8")

    resumen = {
        "total_archivos": len(documentos),
        "exitosos": exitosos,
        "fallidos": fallidos,
        "saltados": saltados,
        "omitidos": omitidos,
        "tiempo_total_segundos": round(time.time() - t0_total, 1),
        "resultados": resultados,
    }
    OUTPUT_JSON.write_text(json.dumps(resumen, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nExtracción finalizada en {resumen['tiempo_total_segundos']}s")
    print(f"Exitosos: {exitosos} | Fallidos: {fallidos} | Saltados: {saltados} | Omitidos: {omitidos}")
    print(f"Log guardado: {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
