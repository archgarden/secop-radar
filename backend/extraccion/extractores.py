"""Extractores por tipo de documento basados en reglas y etiquetas."""

import json
import re
from datetime import datetime
from typing import Any

from .ocr import extraer_texto, normalizar_texto


def _buscar_etiqueta_linea(texto: str, etiquetas: list[str]) -> str | None:
    """Busca una etiqueta en el texto y devuelve el valor que sigue en la misma línea."""
    lineas = texto.split("\n")
    for etiqueta in etiquetas:
        patron = re.compile(rf"\b{re.escape(etiqueta)}\b", re.IGNORECASE)
        for linea in lineas:
            if patron.search(linea):
                # Quitar la etiqueta y devolver el resto limpio
                resto = patron.split(linea, maxsplit=1)[-1]
                resto = re.sub(r"^[\s:=-]+", "", resto).strip()
                if resto:
                    return resto
    return None


def _buscar_etiqueta_linea_limitada(texto: str, etiquetas: list[str], stopwords: list[str] | None = None) -> str | None:
    """Busca etiqueta y devuelve valor en la misma línea, cortando si aparece otra etiqueta conocida."""
    lineas = texto.split("\n")
    stopwords = stopwords or []
    for etiqueta in etiquetas:
        patron = re.compile(rf"\b{re.escape(etiqueta)}\b", re.IGNORECASE)
        for linea in lineas:
            if patron.search(linea):
                resto = patron.split(linea, maxsplit=1)[-1]
                resto = re.sub(r"^[\s:=-]+", "", resto).strip()
                # Cortar si aparece otra etiqueta dentro de la misma línea
                for stop in stopwords:
                    if re.search(rf"\b{re.escape(stop)}\b", resto, re.IGNORECASE):
                        resto = re.split(rf"\b{re.escape(stop)}\b", resto, flags=re.IGNORECASE)[0].strip()
                if resto:
                    return resto
    return None


def _buscar_valor_despues(texto: str, etiquetas: list[str]) -> str | None:
    """Busca etiqueta y devuelve la siguiente línea no vacía si no hay valor en la misma."""
    lineas = [l.strip() for l in texto.split("\n") if l.strip()]
    for i, linea in enumerate(lineas):
        for etiqueta in etiquetas:
            if re.search(rf"\b{re.escape(etiqueta)}\b", linea, re.IGNORECASE):
                # Si la línea tiene valor, usarla
                resto = re.sub(rf"^.*?\b{re.escape(etiqueta)}\b", "", linea, flags=re.IGNORECASE)
                resto = re.sub(r"^[\s:=-]+", "", resto).strip()
                if resto:
                    return resto
                # Si no, mirar la siguiente línea
                if i + 1 < len(lineas):
                    return lineas[i + 1]
    return None


def _extraer_nit(valor: str | None) -> str | None:
    if not valor:
        return None
    # Buscar secuencia de 9 dígitos (NIT colombiano sin DV) o 9-10 dígitos con guión
    m = re.search(r"(\d{9,10})(?:\s*-\s*(\d))?", re.sub(r"[^\d-]", "", valor))
    if m:
        nit = m.group(1)
        dv = m.group(2)
        return f"{nit}-{dv}" if dv else nit
    return None


def _extraer_fecha(valor: str | None) -> str | None:
    if not valor:
        return None
    # Formatos comunes: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd
    patrones = [
        r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})",
        r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})",
    ]
    for patron in patrones:
        m = re.search(patron, valor)
        if m:
            return m.group(0)
    return None


def _parse_fecha_iso(valor: str | None) -> str | None:
    fecha = _extraer_fecha(valor)
    if not fecha:
        return None
    try:
        for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m-%d"):
            try:
                return datetime.strptime(fecha, fmt).date().isoformat()
            except ValueError:
                continue
    except Exception:
        pass
    return fecha


def _extraer_lista_codigos(valor: str | None) -> list[str]:
    if not valor:
        return []
    # Buscar códigos de 8 dígitos (UNSPSC)
    return re.findall(r"\b\d{8}\b", re.sub(r"[^\d,\s]", "", valor))


def _extraer_lista_departamentos(valor: str | None) -> list[str]:
    if not valor:
        return []
    # Limpiar prefijos y sufijos comunes
    noise = ["departamento", "departamentos", "de operacion", "operacion", "estado", "activo", "inactivo"]
    cleaned = valor
    for word in noise:
        cleaned = re.sub(rf"\b{re.escape(word)}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[:\-]", ",", cleaned)
    items = [x.strip() for x in re.split(r"[,;]", cleaned) if x.strip()]
    return [i.title() for i in items]


def _limpiar_valor_monetario(valor: str | None) -> int | None:
    if not valor:
        return None
    # Quitar símbolos y puntos de miles, reemplazar coma decimal por punto
    limpio = re.sub(r"[^\d,\.]", "", valor)
    if "," in limpio and "." in limpio:
        # Asumir punto como separador de miles: 1.234.567,89
        limpio = limpio.replace(".", "").replace(",", ".")
    elif "," in limpio:
        # Podría ser separador decimal o de miles; usamos heurística
        partes = limpio.split(",")
        if len(partes[-1]) == 2:
            limpio = "".join(partes[:-1]) + "." + partes[-1]
        else:
            limpio = "".join(partes)
    try:
        return int(float(limpio))
    except ValueError:
        return None


def extraer_rup(path: str) -> dict[str, Any]:
    """Extrae campos clave de un RUP (Registro Único de Proponentes)."""
    texto_raw = extraer_texto(path)
    texto = normalizar_texto(texto_raw)

    razon_social = (
        _buscar_etiqueta_linea_limitada(
            texto,
            ["razon social", "nombre o razon social", "razon social o nombre"],
            stopwords=["vigencia", "nit", "unspsc", "departamentos", "estado"],
        )
        or _buscar_valor_despues(texto, ["razon social"])
    )

    campos = {
        "tipo_documento": "rup",
        "nit": _extraer_nit(
            _buscar_etiqueta_linea(texto, ["nit", "numero de identificacion tributaria"])
            or _buscar_valor_despues(texto, ["nit"])
        ),
        "razon_social": razon_social,
        "vigencia": _parse_fecha_iso(
            _buscar_etiqueta_linea(texto, ["vigencia", "valido hasta", "fecha de vencimiento", "vence"])
            or _buscar_valor_despues(texto, ["vigencia", "valido hasta"])
        ),
        "unspsc": _extraer_lista_codigos(
            _buscar_etiqueta_linea(texto, ["codigo unspsc", "unspsc", "codigos unspsc", "categorias"])
            or _buscar_valor_despues(texto, ["unspsc"])
        ),
        "departamentos": _extraer_lista_departamentos(
            _buscar_etiqueta_linea(texto, ["departamento", "departamentos", "departamentos de operacion", "ubicacion"])
            or _buscar_valor_despues(texto, ["departamentos"])
        ),
        "texto_preview": texto_raw[:1000],
    }

    # Calcular confianza básica: cuántos campos clave logramos extraer
    clave = ["nit", "razon_social", "vigencia", "unspsc"]
    encontrados = sum(1 for k in clave if campos.get(k))
    campos["confianza"] = round(encontrados / len(clave), 2)
    return campos


def extraer_estados_financieros(path: str) -> dict[str, Any]:
    """Extrae indicadores financieros clave de estados financieros."""
    texto_raw = extraer_texto(path)
    texto = normalizar_texto(texto_raw)

    def buscar(etiquetas: list[str]) -> int | None:
        val = _buscar_etiqueta_linea(texto, etiquetas) or _buscar_valor_despues(texto, etiquetas)
        return _limpiar_valor_monetario(val)

    campos = {
        "tipo_documento": "estados_financieros",
        "activos": buscar(["total activos", "activos totales", "activo total"]),
        "pasivos": buscar(["total pasivos", "pasivos totales", "pasivo total"]),
        "patrimonio": buscar(["patrimonio", "patrimonio liquido", "patrimonio total", "total patrimonio"]),
        "ingresos": buscar(["ingresos operacionales", "ingresos", "ventas"]),
        "utilidad_neta": buscar(["utilidad neta", "ganancia neta", "resultado del ejercicio"]),
        "texto_preview": texto_raw[:1000],
    }

    if campos["activos"] and campos["pasivos"] and campos["patrimonio"]:
        # Validación contable básica
        campos["balance_ok"] = abs(campos["activos"] - campos["pasivos"] - campos["patrimonio"]) < max(campos["activos"] * 0.02, 1000)

    clave = ["activos", "pasivos", "patrimonio", "ingresos"]
    encontrados = sum(1 for k in clave if campos.get(k))
    campos["confianza"] = round(encontrados / len(clave), 2)
    return campos


def extraer_certificado_experiencia(path: str) -> dict[str, Any]:
    """Extrae datos de certificados de experiencia."""
    texto_raw = extraer_texto(path)
    texto = normalizar_texto(texto_raw)

    campos = {
        "tipo_documento": "certificado_experiencia",
        "entidad": _buscar_etiqueta_linea(texto, ["entidad", "contratante", "contratista"]),
        "objeto": _buscar_valor_despues(texto, ["objeto", "objeto del contrato"]),
        "valor": _limpiar_valor_monetario(
            _buscar_etiqueta_linea(texto, ["valor", "valor del contrato", "valor total"])
            or _buscar_valor_despues(texto, ["valor"])
        ),
        "fecha_inicio": _parse_fecha_iso(_buscar_etiqueta_linea(texto, ["fecha de inicio", "inicio"])),
        "fecha_fin": _parse_fecha_iso(_buscar_etiqueta_linea(texto, ["fecha de terminacion", "terminacion", "finalizacion", "fecha fin"])),
        "acta_liquidacion": _buscar_etiqueta_linea(texto, ["acta de liquidacion", "liquidacion"]),
        "texto_preview": texto_raw[:1000],
    }

    clave = ["entidad", "valor", "fecha_inicio", "fecha_fin"]
    encontrados = sum(1 for k in clave if campos.get(k))
    campos["confianza"] = round(encontrados / len(clave), 2)
    return campos


def extraer_documento(path: str, nombre_documento: str) -> dict[str, Any]:
    """Rutea el documento al extractor adecuado según su nombre."""
    nombre_norm = normalizar_texto(nombre_documento)

    if "rup" in nombre_norm or "registro unico" in nombre_norm:
        return extraer_rup(path)

    if "estados financieros" in nombre_norm or "balance" in nombre_norm or "situacion financiera" in nombre_norm:
        return extraer_estados_financieros(path)

    if "experiencia" in nombre_norm or "certificado" in nombre_norm:
        return extraer_certificado_experiencia(path)

    return {
        "tipo_documento": "desconocido",
        "confianza": 0,
        "texto_preview": extraer_texto(path)[:500],
    }
