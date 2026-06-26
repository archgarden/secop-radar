"""Extractores por tipo de documento basados en reglas y etiquetas."""

import json
import re
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from .ocr import extraer_texto, normalizar_texto


def _buscar_etiqueta_linea(texto: str, etiquetas: list[str]) -> str | None:
    """Busca una etiqueta en el texto y devuelve el valor que sigue en la misma línea.

    Busca primero las etiquetas más largas para evitar cortes parciales
    (por ejemplo, "patrimonio liquido" antes que "patrimonio").
    """
    lineas = texto.split("\n")
    for etiqueta in sorted(etiquetas, key=len, reverse=True):
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
        for etiqueta in sorted(etiquetas, key=len, reverse=True):
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


def _buscar_valor_tabla(texto: str, etiquetas: list[str], max_lineas_siguientes: int = 3) -> str | None:
    """Busca una etiqueta y devuelve el primer valor monetario textual válido cercano.

    Útil para estados financieros en formato tabla, donde el valor puede estar
    en la misma línea de la etiqueta o en líneas siguientes. Devuelve el texto
    del valor para que el llamador decida el redondeo/multiplicador final.
    """
    lineas = [l.strip() for l in texto.split("\n") if l.strip()]
    for i, linea in enumerate(lineas):
        for etiqueta in sorted(etiquetas, key=len, reverse=True):
            if re.search(rf"\b{re.escape(etiqueta)}\b", linea, re.IGNORECASE):
                # Buscar en la línea actual y en las siguientes.
                for j in range(i, min(i + 1 + max_lineas_siguientes, len(lineas))):
                    candidata = lineas[j]
                    # Si estamos en la línea de la etiqueta, quitar la etiqueta.
                    if j == i:
                        candidata = re.sub(rf"^.*?\b{re.escape(etiqueta)}\b", "", candidata, flags=re.IGNORECASE).strip()
                    # Buscar todos los valores monetarios en la línea.
                    valores = re.findall(r"[$]?\s*[\d.,\s]+(?:millones?|miles?)?", candidata, flags=re.IGNORECASE)
                    for val in valores:
                        if _limpiar_valor_monetario(val) is not None:
                            return val
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


def _parse_valor_monetario(valor: str | None) -> tuple[Decimal | None, int]:
    """Parsea una cadena monetaria y devuelve (numero, multiplicador_palabra).

    Soporta formatos comunes en documentos colombianos:
      - $2.000.000.000
      - $2,000,000,000
      - 2.000.000.000,00
      - 2 000 000 000
      - 2.000 millones
      - COP 2.000.000.000

    No redondea; el llamador decide cuándo hacerlo.
    """
    if not valor:
        return None, 1

    texto = str(valor).strip()

    # Detectar multiplicadores explícitos (millones / miles).
    multiplicador = 1
    texto_lower = texto.lower()
    if "millones" in texto_lower or "millon" in texto_lower:
        multiplicador = 1_000_000
        texto = re.sub(r"millones?", "", texto, flags=re.IGNORECASE)
    elif "miles" in texto_lower or "mil" in texto_lower:
        multiplicador = 1_000
        texto = re.sub(r"mil(?:es)?", "", texto, flags=re.IGNORECASE)

    # Quitar prefijos monetarios y símbolos que no sean dígitos, puntos, comas o espacios.
    texto = re.sub(r"[^\d,\.\s]", "", texto)
    texto = texto.strip()
    if not texto:
        return None, multiplicador

    # Normalizar: punto o coma como separador de miles vs decimal.
    def _parse_number_raw(s: str) -> Decimal | None:
        # Caso 1: ambos separadores presentes -> convención latina (miles=., decimal=,)
        if "," in s and "." in s:
            ultimo_punto = s.rfind(".")
            ultima_coma = s.rfind(",")
            if ultima_coma > ultimo_punto:
                s = s.replace(".", "").replace(",", ".")
            else:
                s = s.replace(",", "")
            try:
                return Decimal(s)
            except Exception:
                return None

        # Caso 2: solo comas.
        if "," in s:
            partes = s.split(",")
            if len(partes) > 1 and len(partes[-1]) in (1, 2):
                s = "".join(partes[:-1]) + "." + partes[-1]
            else:
                s = s.replace(",", "")
            try:
                return Decimal(s)
            except Exception:
                return None

        # Caso 3: solo puntos.
        if "." in s:
            partes = s.split(".")
            if len(partes) > 1 and len(partes[-1]) in (1, 2):
                if all(len(p) == 3 for p in partes[:-1]):
                    s = s.replace(".", "")
                else:
                    s = "".join(partes[:-1]) + "." + partes[-1]
            else:
                s = s.replace(".", "")
            try:
                return Decimal(s)
            except Exception:
                return None

        # Caso 4: solo dígitos (posiblemente con espacios como miles).
        s = s.replace(" ", "")
        try:
            return Decimal(s)
        except Exception:
            return None

    numero = _parse_number_raw(texto)
    if numero is None:
        return None, multiplicador
    return numero, multiplicador


def _limpiar_valor_monetario(valor: str | None) -> int | None:
    """Convierte una cadena de valor monetario a entero (COP) redondeado."""
    numero, multiplicador = _parse_valor_monetario(valor)
    if numero is None:
        return None
    return int((numero * multiplicador).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


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


def _calcular_indicadores_financieros(campos: dict[str, Any]) -> dict[str, Any]:
    """Calcula indicadores financieros a partir de los campos extraídos."""
    activo_total = campos.get("activos") or campos.get("activo_total")
    pasivo_total = campos.get("pasivos") or campos.get("pasivo_total")
    patrimonio = campos.get("patrimonio")
    activo_corriente = campos.get("activo_corriente")
    pasivo_corriente = campos.get("pasivo_corriente")
    utilidad_operacional = campos.get("utilidad_operacional")
    gastos_intereses = campos.get("gastos_intereses")

    indicadores: dict[str, Any] = {}

    if activo_corriente is not None and pasivo_corriente is not None and pasivo_corriente != 0:
        indicadores["liquidez"] = round(activo_corriente / pasivo_corriente, 4)
        indicadores["razon_corriente"] = round(activo_corriente / pasivo_corriente, 4)

    if pasivo_total is not None and activo_total is not None and activo_total != 0:
        indicadores["endeudamiento"] = round(pasivo_total / activo_total, 4)

    if utilidad_operacional is not None and gastos_intereses is not None and gastos_intereses != 0:
        indicadores["cobertura_intereses"] = round(utilidad_operacional / gastos_intereses, 4)

    if utilidad_operacional is not None and patrimonio is not None and patrimonio != 0:
        indicadores["rentabilidad_patrimonio"] = round(utilidad_operacional / patrimonio, 4)

    if utilidad_operacional is not None and activo_total is not None and activo_total != 0:
        indicadores["rentabilidad_activo"] = round(utilidad_operacional / activo_total, 4)

    return indicadores


def _detectar_multiplicador_global(texto: str) -> int:
    """Detecta si el documento indica que las cifras están en millones/miles."""
    primeras_lineas = "\n".join(texto.split("\n")[:10])
    if re.search(r"\bcifras?\s+en\s+millones?\b", primeras_lineas, re.IGNORECASE):
        return 1_000_000
    if re.search(r"\ben\s+millones?\s+de\s+(pesos?|cop)\b", primeras_lineas, re.IGNORECASE):
        return 1_000_000
    if re.search(r"\bmillones?\s+de\s+(pesos?|cop)\b", primeras_lineas, re.IGNORECASE):
        return 1_000_000
    if re.search(r"\bcifras?\s+en\s+miles?\b", primeras_lineas, re.IGNORECASE):
        return 1_000
    return 1


def extraer_estados_financieros(path: str) -> dict[str, Any]:
    """Extrae indicadores financieros clave de estados financieros."""
    texto_raw = extraer_texto(path)
    texto = normalizar_texto(texto_raw)

    multiplicador_global = _detectar_multiplicador_global(texto)

    def buscar(etiquetas: list[str]) -> int | None:
        # Intentar primero búsqueda de tabla (más robusta para PDFs con tablas).
        val_str = _buscar_valor_tabla(texto, etiquetas)
        if val_str is None:
            # Fallback a búsqueda por línea.
            val_str = _buscar_etiqueta_linea(texto, etiquetas) or _buscar_valor_despues(texto, etiquetas)
        if not val_str:
            return None

        # Si el documento indica "cifras en millones/miles" y el valor no lo dice
        # explícitamente, aplicar el multiplicador global antes de redondear.
        texto_valor = val_str.lower()
        aplica_multiplicador_global = (
            multiplicador_global > 1
            and "millones" not in texto_valor
            and "millon" not in texto_valor
            and "miles" not in texto_valor
            and "mil" not in texto_valor
        )

        numero, multiplicador_palabra = _parse_valor_monetario(val_str)
        if numero is None:
            return None
        multiplicador_final = multiplicador_palabra
        if aplica_multiplicador_global:
            multiplicador_final *= multiplicador_global
        return int((numero * multiplicador_final).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    campos: dict[str, Any] = {
        "tipo_documento": "estados_financieros",
        "activos": buscar(["total activos", "activos totales", "activo total", "activos"]),
        "pasivos": buscar(["total pasivos", "pasivos totales", "pasivo total", "pasivos"]),
        "patrimonio": buscar([
            "patrimonio liquido",
            "patrimonio total",
            "total patrimonio",
            "patrimonio",
            "total patrimonio liquido",
        ]),
        "ingresos": buscar([
            "ingresos operacionales",
            "ingresos de actividades ordinarias",
            "ventas",
            "ingresos totales",
            "total ingresos",
            "ingresos",
        ]),
        "ingresos_no_operacionales": buscar([
            "ingresos no operacionales",
            "ingresos financieros",
        ]),
        "utilidad_neta": buscar([
            "utilidad neta",
            "ganancia neta",
            "resultado del ejercicio",
            "resultado neto",
        ]),
        "utilidad_operacional": buscar([
            "utilidad operacional",
            "utilidad en operacion",
            "ganancia operacional",
            "resultado operacional",
            "utilidad bruta",
        ]),
        "activo_corriente": buscar([
            "total activo corriente",
            "activo corriente",
            "activos corrientes",
            "total activos corrientes",
        ]),
        "pasivo_corriente": buscar([
            "total pasivo corriente",
            "pasivo corriente",
            "pasivos corrientes",
            "total pasivos corrientes",
        ]),
        "activo_total": buscar(["total activos", "activos totales", "activo total"]),
        "pasivo_total": buscar(["total pasivos", "pasivos totales", "pasivo total"]),
        "efectivo": buscar(["efectivo y equivalentes", "efectivo", "caja y bancos", "caja", "bancos"]),
        "cuentas_por_cobrar": buscar([
            "cuentas por cobrar",
            "deudores comerciales",
            "clientes",
        ]),
        "inventarios": buscar(["inventarios", "existencias"]),
        "proveedores": buscar(["proveedores", "cuentas por pagar", "acreedores comerciales"]),
        "obligaciones_laborales": buscar([
            "obligaciones laborales",
            "pasivo laboral",
            "beneficios empleados",
        ]),
        "gastos_intereses": buscar([
            "gastos financieros",
            "gastos por intereses",
            "intereses",
        ]),
        "texto_preview": texto_raw[:1000],
    }

    # Normalizar alias: si no se encontró activos totales pero sí activo_total, usamos el último.
    if campos.get("activo_total") and not campos.get("activos"):
        campos["activos"] = campos["activo_total"]
    if campos.get("pasivo_total") and not campos.get("pasivos"):
        campos["pasivos"] = campos["pasivo_total"]

    # Validación contable básica.
    activos = campos.get("activos")
    pasivos = campos.get("pasivos")
    patrimonio = campos.get("patrimonio")
    if activos and pasivos and patrimonio:
        diferencia = abs(activos - pasivos - patrimonio)
        campos["balance_ok"] = diferencia < max(activos * 0.02, 1000)
        campos["balance_diferencia"] = diferencia

    # Calcular indicadores financieros automáticamente.
    indicadores = _calcular_indicadores_financieros(campos)
    if indicadores:
        campos["indicadores_calculados"] = indicadores

    # Calcular confianza sobre campos clave.
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

    nombre_parts = set(nombre_norm.replace("_", " ").replace("-", " ").split())
    if any(term in nombre_norm for term in [
        "estados financieros",
        "estado financiero",
        "balance",
        "situacion financiera",
        "estado de resultados",
        "perdidas y ganancias",
        "carga tributaria",
    ]) or ("declaracion" in nombre_parts and "renta" in nombre_parts):
        return extraer_estados_financieros(path)

    if "experiencia" in nombre_norm or "certificado" in nombre_norm:
        return extraer_certificado_experiencia(path)

    return {
        "tipo_documento": "desconocido",
        "confianza": 0,
        "texto_preview": extraer_texto(path)[:500],
    }
