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
    noise = ["departamento", "departamentos", "de operacion", "operacion"]
    cleaned = valor
    for word in noise:
        cleaned = re.sub(rf"\b{re.escape(word)}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[:\-]", ",", cleaned)
    items = [x.strip() for x in re.split(r"[,;]", cleaned) if x.strip()]
    return [i.title() for i in items]


def _extraer_lista_municipios(valor: str | None) -> list[str]:
    if not valor:
        return []
    noise = ["municipio", "municipios", "de operacion", "operacion", "ciudad", "ciudades"]
    cleaned = valor
    for word in noise:
        cleaned = re.sub(rf"\b{re.escape(word)}\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[:\-]", ",", cleaned)
    items = [x.strip() for x in re.split(r"[,;]", cleaned) if x.strip()]
    # Excluir códigos numéricos puros (ej: 81001) y dejar solo nombres
    return [i.title() for i in items if not re.fullmatch(r"\d+", i)]


def _extraer_estado_rup(valor: str | None) -> str | None:
    if not valor:
        return None
    valor_norm = normalizar_texto(valor)
    if re.search(r"\bactivo\b", valor_norm):
        return "Activo"
    if re.search(r"\binactivo\b", valor_norm):
        return "Inactivo"
    return None


def _extraer_tipo_persona(valor: str | None) -> str | None:
    if not valor:
        return None
    valor_norm = normalizar_texto(valor)
    if "juridica" in valor_norm or "persona juridica" in valor_norm:
        return "Jurídica"
    if "natural" in valor_norm or "persona natural" in valor_norm:
        return "Natural"
    return None


def _extraer_categoria_rup(valor: str | None) -> str | None:
    if not valor:
        return None
    valor_norm = normalizar_texto(valor)
    if "gran empresa" in valor_norm or "gran" in valor_norm:
        return "Gran empresa"
    if "mediana empresa" in valor_norm or "mediana" in valor_norm:
        return "Mediana empresa"
    if "pequena empresa" in valor_norm or "pequena" in valor_norm:
        return "Pequeña empresa"
    if "micro empresa" in valor_norm or "micro" in valor_norm:
        return "Microempresa"
    return None


def _extraer_email(valor: str | None) -> str | None:
    if not valor:
        return None
    m = re.search(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", valor)
    return m.group(0) if m else None


def _extraer_telefono(valor: str | None) -> str | None:
    if not valor:
        return None
    # Buscar números de teléfono colombianos comunes (3xx xxx xxxx, 60x xxx xxxx, etc.)
    m = re.search(r"(?:\+57\s*)?(?:\(?\d{1,3}\)?[\s\-]?)?\d{3}[\s\-]?\d{3}[\s\-]?\d{4}", re.sub(r"[^\d+\s\-()]", "", valor))
    return m.group(0).strip() if m else None


def _limpiar_cargo_representante(valor: str | None) -> str | None:
    if not valor:
        return None
    valor = valor.strip()
    # Quitar prefijos genéricos que no aportan el nombre
    prefijos = [
        r"^y/o\s+gerente\s*",
        r"^y/o\s+",
        r"^gerente\s*",
        r"^representante legal\s*",
        r"^rep\.?\s*legal\s*",
        r"^:\s*",
    ]
    for p in prefijos:
        valor = re.sub(p, "", valor, flags=re.IGNORECASE).strip()
    return valor if len(valor) > 2 else None


def _extraer_representante_legal(texto: str) -> str | None:
    valor = (
        _buscar_etiqueta_linea_limitada(
            texto,
            [
                "representante legal",
                "nombre del representante legal",
                "representante",
                "rep. legal",
            ],
            stopwords=["nit", "cedula", "identificacion", "cargo", "direccion", "telefono", "correo"],
        )
        or _buscar_valor_despues(texto, ["representante legal"])
    )
    return _limpiar_cargo_representante(valor)


def _limpiar_direccion(valor: str | None) -> str | None:
    if not valor:
        return None
    valor = valor.strip()
    prefijos = [
        r"^del\s+domicilio\s+principal\s*[:\-]?\s*",
        r"^domicilio\s+principal\s*[:\-]?\s*",
        r"^direccion\s*(principal|de notificacion)?\s*[:\-]?\s*",
        r"^:\s*",
    ]
    for p in prefijos:
        valor = re.sub(p, "", valor, flags=re.IGNORECASE).strip()
    return valor if len(valor) > 3 else None


def _extraer_direccion(texto: str) -> str | None:
    valor = (
        _buscar_etiqueta_linea_limitada(
            texto,
            ["direccion", "direccion de notificacion", "direccion principal", "domicilio"],
            stopwords=["telefono", "correo", "ciudad", "municipio", "departamento"],
        )
        or _buscar_valor_despues(texto, ["direccion"])
    )
    return _limpiar_direccion(valor)


def _extraer_camara_comercio(texto: str) -> str | None:
    valor = (
        _buscar_etiqueta_linea_limitada(
            texto,
            [
                "camara de comercio",
                "matricula mercantil",
                "numero de matricula",
                "matricula",
            ],
            stopwords=["nit", "fecha", "vigencia"],
        )
        or _buscar_valor_despues(texto, ["camara de comercio", "matricula mercantil"])
    )
    if not valor:
        return None
    # Intentar extraer número de matrícula
    m = re.search(r"\d{6,}(?:\s*-\s*\d+)?", valor)
    return m.group(0) if m else valor


def _extraer_ciiu(texto: str) -> list[str]:
    # Buscar códigos CIIU de 4 dígitos explícitos o prefijos comunes
    texto_norm = normalizar_texto(texto)
    codigos = re.findall(r"\b\d{4}\b", texto_norm)
    # Filtrar solo los que parecen CIIU (contexto)
    resultado = []
    for codigo in codigos:
        # Buscar contexto cercano de actividad económica / CIIU
        patron = re.compile(rf"(?:ciiu|actividad economica|codigo de actividad).{{0,80}}\b{codigo}\b", re.IGNORECASE)
        if patron.search(texto):
            resultado.append(codigo)
    return list(dict.fromkeys(resultado))  # preservar orden, eliminar duplicados


def _extraer_fecha_inscripcion(texto: str) -> str | None:
    return _parse_fecha_iso(
        _buscar_etiqueta_linea(texto, ["fecha de inscripcion", "inscripcion", "fecha inscripcion"])
        or _buscar_valor_despues(texto, ["fecha de inscripcion"])
    )


def _extraer_fecha_actualizacion(texto: str) -> str | None:
    return _parse_fecha_iso(
        _buscar_etiqueta_linea(texto, ["fecha de actualizacion", "actualizacion", "fecha actualizacion", "ultima actualizacion"])
        or _buscar_valor_despues(texto, ["fecha de actualizacion", "ultima actualizacion"])
    )


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


def _extraer_razon_social_certificado(texto: str) -> str | None:
    """Busca la razón social en certificados de Cámara de Comercio / RUP."""
    razon = (
        _buscar_etiqueta_linea_limitada(
            texto,
            ["razon social", "nombre o razon social", "razon social o nombre", "nombre", "nombre completo"],
            stopwords=["vigencia", "nit", "unspsc", "departamentos", "estado", "tipo de persona", "categoria"],
        )
        or _buscar_valor_despues(texto, ["razon social"])
    )
    if razon:
        return razon

    # Certificado de Cámara de Comercio: buscar 'NOMBRE DEL CONTRATISTA'
    patron = re.compile(
        r"NOMBRE DEL CONTRATISTA\s*[:\-]?\s*(.+?)(?=\n\s*(?:NOMBRE DEL CONTRATISTA|NOMBRE DEL CONTRATANTE|CONTRATO CELEBRADO|PÁGINA|\*\*\*))",
        re.IGNORECASE | re.DOTALL,
    )
    candidatas = []
    for m in patron.finditer(texto):
        valor = m.group(1).replace("\n", " ").strip()
        valor = re.sub(r"^[:\-]+\s*", "", valor)
        if valor and len(valor) > 5:
            candidatas.append(valor)

    nombres_limpios = []
    for c in candidatas:
        if re.search(r"\b(union temporal|consorcio|ut\s|cv\.)\b", c, re.IGNORECASE):
            continue
        if re.search(r"\b(s\.a\.s\.?|s\.a\.?|ltda|limitada|empresa)\b", c, re.IGNORECASE):
            nombres_limpios.append(c)

    if nombres_limpios:
        return max(nombres_limpios, key=len)
    return None


def _extraer_vigencia_certificado(texto: str) -> str | None:
    """Busca vigencia o fecha de expedición en certificados de cámara de comercio."""
    # 1) Fecha de expedición es la más confiable en certificados de cámara de comercio.
    m = re.search(r"fecha\s*(?:de\s*)?expedicion\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})", texto, re.IGNORECASE)
    if m:
        return _parse_fecha_iso(m.group(1))

    fecha_exp = _buscar_etiqueta_linea(texto, ["fecha expedicion", "fecha de expedicion", "expedido el", "expedicion"])
    if fecha_exp:
        fecha = _parse_fecha_iso(fecha_exp)
        if fecha:
            return fecha

    # 2) Vigencia / vencimiento explícito
    vigencia = (
        _buscar_etiqueta_linea(texto, ["vigencia", "valido hasta", "fecha de vencimiento", "vence", "vigente hasta"])
        or _buscar_valor_despues(texto, ["vigencia", "valido hasta"])
    )
    if vigencia:
        fecha = _parse_fecha_iso(vigencia)
        if fecha:
            return fecha

    # 3) Fecha de expedición como palabra suelta
    m = re.search(r"expedido\s*(?:el)?\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})", texto, re.IGNORECASE)
    if m:
        return _parse_fecha_iso(m.group(1))

    return None


def _extraer_municipio_departamento_cc(texto: str) -> tuple[list[str], list[str]]:
    """Extrae municipios y departamentos de certificados de cámara de comercio."""
    departamentos: set[str] = set()
    municipios: set[str] = set()

    for m in re.finditer(r"MUNICIPIO\s*[:\-]?\s*\d+\s*[-]\s*([A-ZÁÉÍÓÚÑ\s]+)", texto, re.IGNORECASE):
        nombre = m.group(1).strip().title()
        if nombre:
            municipios.add(nombre)
            depto = nombre.upper().replace(" D.C.", "").replace(".", "")
            if depto in [
                "ARAUCA", "BOGOTA", "CUNDINAMARCA", "ANTIOQUIA", "VALLE DEL CAUCA",
                "ATLANTICO", "BOLIVAR", "BOYACA", "CALDAS", "CAQUETA", "CASANARE",
                "CAUCA", "CESAR", "CHOCO", "CORDOBA", "GUAINIA", "GUAVIARE", "HUILA",
                "LA GUAJIRA", "MAGDALENA", "META", "NARIÑO", "NORTE DE SANTANDER",
                "PUTUMAYO", "QUINDIO", "RISARALDA", "SAN ANDRES", "SANTANDER", "SUCRE",
                "TOLIMA", "VAUPES", "VICHADA", "AMAZONAS",
            ]:
                departamentos.add(depto.title())

    m = re.search(r"CAMARA DE COMERCIO DE\s+([A-ZÁÉÍÓÚÑ\s]+)", texto, re.IGNORECASE)
    if m:
        cc = m.group(1).strip().title()
        if cc:
            departamentos.add(cc)

    return sorted(departamentos), sorted(municipios)


def _extraer_unspsc_desde_codigos(texto: str) -> list[str]:
    """Extrae códigos UNSPSC de 8 dígitos presentes en el texto."""
    texto_limpio = re.sub(r"(\d{2})\s+(\d{2})\s+(\d{2})\s+(\d{2})", r"\1\2\3\4", texto)
    return _extraer_lista_codigos(texto_limpio)


def _extraer_experiencia_rup(texto_raw: str) -> list[dict[str, Any]]:
    """Extrae contratos de experiencia de certificados de Cámara de Comercio / RUP."""
    experiencia: list[dict[str, Any]] = []

    SMMLV_VALOR = 1_423_500  # Valor SMMLV Colombia 2025 por defecto

    def _parse_valor_smmlv(valor_str: str) -> int | None:
        """Convierte un valor en SMMLV (ej: 120,63) a COP."""
        numero, _ = _parse_valor_monetario(valor_str)
        if numero is None:
            return None
        return int((numero * SMMLV_VALOR).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

    def _extraer_bloque(tipo_entidad: str, match: re.Match) -> dict[str, Any] | None:
        inicio = match.start()
        fin = len(texto_raw)
        siguiente = re.search(
            r"(?:ENTIDAD CONTRATANTE|NOMBRE DEL CONTRATANTE|\*\*\* EXPERIENCIA No\.\d+)",
            texto_raw[inicio + 1:],
            re.IGNORECASE,
        )
        if siguiente:
            fin = inicio + 1 + siguiente.start()
        bloque = texto_raw[inicio:fin]

        entidad = match.group(1).strip()
        objeto = None
        valor = None
        fecha_inicio = None
        fecha_fin = None
        fecha_liquidacion = None

        m_objeto = re.search(
            r"OBJETO\s*[:\-]?\s*([\s\S]+?)(?=\n\s*(?:SG FM CL PR|NÚMERO CONSECUTIVO|NÚMERO DEL CONTRATO|FECHA DE|\*\*\*))",
            bloque,
            re.IGNORECASE,
        )
        if m_objeto:
            objeto = " ".join(m_objeto.group(1).split())

        # Valor en COP
        m_valor = re.search(r"VALOR DEL CONTRATO\s*[:\-]?\s*([\$\d\.\,]+)", bloque, re.IGNORECASE)
        if m_valor:
            valor = _limpiar_valor_monetario(m_valor.group(1))

        # Valor en SMMLV (común en certificados de cámara de comercio)
        if valor is None:
            m_smmlv = re.search(r"VALOR CONTRATADO EN SMMLV\s*[:\-]?\s*([\d\.\,]+)", bloque, re.IGNORECASE)
            if m_smmlv:
                valor = _parse_valor_smmlv(m_smmlv.group(1))

        m_inicio = re.search(r"FECHA DE INICIO\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})", bloque, re.IGNORECASE)
        if m_inicio:
            fecha_inicio = _parse_fecha_iso(m_inicio.group(1))

        m_fin = re.search(r"FECHA DE TERMINADO\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})", bloque, re.IGNORECASE)
        if m_fin:
            fecha_fin = _parse_fecha_iso(m_fin.group(1))

        m_liq = re.search(r"FECHA DE LIQUIDACI[OÓ]N\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})", bloque, re.IGNORECASE)
        if m_liq:
            fecha_liquidacion = _parse_fecha_iso(m_liq.group(1))

        if entidad and valor:
            return {
                "entidad": entidad,
                "objeto": objeto,
                "valor": valor,
                "fecha_inicio": fecha_inicio,
                "fecha_fin": fecha_fin or fecha_liquidacion,
                "acta_liquidacion": "SI" if fecha_liquidacion else "NO",
            }
        return None

    # Buscar bloques con ENTIDAD CONTRATANTE (contratos perfectuados/liquidados)
    for m in re.finditer(r"ENTIDAD CONTRATANTE\s*[:\-]?\s*([^\n]+)", texto_raw, re.IGNORECASE):
        exp = _extraer_bloque("entidad", m)
        if exp:
            experiencia.append(exp)

    # Buscar bloques con NOMBRE DEL CONTRATANTE (experiencias numeradas)
    for m in re.finditer(r"NOMBRE DEL CONTRATANTE\s*[:\-]?\s*([^\n]+)", texto_raw, re.IGNORECASE):
        exp = _extraer_bloque("contratante", m)
        if exp:
            experiencia.append(exp)

    # Deduplicar por entidad + valor + objeto (primeros 60 chars)
    vistos: set[str] = set()
    unicos: list[dict[str, Any]] = []
    for e in experiencia:
        clave = f"{e['entidad']}|{e['valor']}|{str(e['objeto'])[:60]}"
        if clave not in vistos:
            vistos.add(clave)
            unicos.append(e)

    return unicos


def extraer_rup(path: str) -> dict[str, Any]:
    """Extrae campos clave de un RUP (Registro Único de Proponentes)."""
    texto_raw = extraer_texto(path)
    texto = normalizar_texto(texto_raw)

    razon_social = _extraer_razon_social_certificado(texto)

    nit_raw = (
        _buscar_etiqueta_linea(texto, ["nit", "numero de identificacion tributaria", "identificacion tributaria"])
        or _buscar_valor_despues(texto, ["nit"])
    )

    vigencia_raw = (
        _buscar_etiqueta_linea(texto, ["vigencia", "valido hasta", "fecha de vencimiento", "vence", "vigente hasta"])
        or _buscar_valor_despues(texto, ["vigencia", "valido hasta"])
    )

    unspsc_raw = (
        _buscar_etiqueta_linea(texto, ["codigo unspsc", "unspsc", "codigos unspsc", "categorias", "codigos de categoria"])
        or _buscar_valor_despues(texto, ["unspsc"])
    )

    departamentos_raw = (
        _buscar_etiqueta_linea(texto, ["departamento", "departamentos", "departamentos de operacion", "departamentos de operaciones", "ubicacion"])
        or _buscar_valor_despues(texto, ["departamentos"])
    )

    municipios_raw = (
        _buscar_etiqueta_linea(texto, ["municipio", "municipios", "municipios de operacion", "municipios de operaciones", "ciudad", "ciudades"])
        or _buscar_valor_despues(texto, ["municipios"])
    )

    estado_raw = (
        _buscar_etiqueta_linea(texto, ["estado del rup", "estado", "situacion", "estado del proponente"])
        or _buscar_valor_despues(texto, ["estado"])
    )

    tipo_persona_raw = (
        _buscar_etiqueta_linea(texto, ["tipo de persona", "tipo persona", "persona", "naturaleza"])
        or _buscar_valor_despues(texto, ["tipo de persona"])
    )

    categoria_raw = (
        _buscar_etiqueta_linea(texto, ["categoria", "categoria empresa", "tipo de empresa", "tamano de empresa"])
        or _buscar_valor_despues(texto, ["categoria"])
    )

    correo_raw = (
        _buscar_etiqueta_linea(texto, ["correo electronico", "email", "e-mail", "correo"])
        or _buscar_valor_despues(texto, ["correo electronico", "email"])
    )

    telefono_raw = (
        _buscar_etiqueta_linea(texto, ["telefono", "celular", "telefono de contacto", "numero de contacto"])
        or _buscar_valor_despues(texto, ["telefono"])
    )

    # Datos específicos de certificados de cámara de comercio
    depts_cc, munis_cc = _extraer_municipio_departamento_cc(texto)
    unspsc_cc = _extraer_unspsc_desde_codigos(texto)
    vigencia_cc = _extraer_vigencia_certificado(texto)
    experiencia_cc = _extraer_experiencia_rup(texto_raw)

    unspsc_lista = _extraer_lista_codigos(unspsc_raw)
    if not unspsc_lista and unspsc_cc:
        # Limitar a códigos de construcción/ingeniería más frecuentes para no saturar
        relevantes = [c for c in unspsc_cc if c.startswith(("72", "81", "83", "80"))]
        unspsc_lista = sorted(set(relevantes))[:30]

    departamentos_lista = _extraer_lista_departamentos(departamentos_raw)
    if not departamentos_lista and depts_cc:
        departamentos_lista = depts_cc

    municipios_lista = _extraer_lista_municipios(municipios_raw)
    if not municipios_lista and munis_cc:
        municipios_lista = munis_cc

    vigencia_final = _parse_fecha_iso(vigencia_raw) or vigencia_cc

    campos = {
        "tipo_documento": "rup",
        "nit": _extraer_nit(nit_raw),
        "razon_social": razon_social,
        "vigencia": vigencia_final,
        "estado": _extraer_estado_rup(estado_raw),
        "tipo_persona": _extraer_tipo_persona(tipo_persona_raw),
        "categoria": _extraer_categoria_rup(categoria_raw),
        "representante_legal": _extraer_representante_legal(texto),
        "correo": _extraer_email(correo_raw),
        "telefono": _extraer_telefono(telefono_raw),
        "direccion": _extraer_direccion(texto),
        "camara_comercio": _extraer_camara_comercio(texto),
        "ciiu": _extraer_ciiu(texto),
        "unspsc": unspsc_lista,
        "departamentos": departamentos_lista,
        "municipios": municipios_lista,
        "fecha_inscripcion": _extraer_fecha_inscripcion(texto),
        "fecha_actualizacion": _extraer_fecha_actualizacion(texto),
        "experiencia": experiencia_cc,
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
