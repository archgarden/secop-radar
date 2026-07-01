"""Orquesta la extracción de documentos y la consolidación del perfil del cliente."""

import json
from typing import Any

from sqlalchemy.orm import Session

from models import Cliente, Documento

from .extractores import extraer_documento


def _parse_json(text: str | None) -> list[str]:
    try:
        data = json.loads(text or "[]")
        return [str(x).lower() for x in data]
    except Exception:
        return []


def procesar_documento(documento: Documento, db: Session) -> dict[str, Any]:
    """Extrae información de un documento y actualiza su registro en base de datos."""
    resultado = extraer_documento(documento.path, documento.nombre)
    documento.extraccion = json.dumps(resultado)
    documento.estado = "procesado"
    db.commit()
    db.refresh(documento)
    return resultado


def consolidar_perfil(cliente_id: int, db: Session) -> dict[str, Any]:
    """Consolida las extracciones de todos los documentos de un cliente en un perfil único."""
    documentos = db.query(Documento).filter(Documento.cliente_id == cliente_id).all()

    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()

    perfil: dict[str, Any] = {
        "cliente_id": cliente_id,
        "nit": None,
        "razon_social": None,
        "vigencia_rup": None,
        "estado_rup": None,
        "tipo_persona": None,
        "categoria": None,
        "representante_legal": None,
        "correo": None,
        "telefono": None,
        "direccion": None,
        "camara_comercio": None,
        "ciiu": [],
        "municipio": cliente.municipio if cliente else None,
        "municipios": [],
        "unspsc": [],
        "departamentos": [],
        "patrimonio": cliente.patrimonio_liquido if cliente else None,
        "ingresos": cliente.ingresos_anuales if cliente else None,
        "activos": None,
        "pasivos": None,
        "activo_corriente": None,
        "pasivo_corriente": None,
        "utilidad_operacional": None,
        "gastos_intereses": None,
        "experiencia_valor_total": cliente.experiencia_valor_total or 0 if cliente else 0,
        "experiencia_cantidad": cliente.experiencia_cantidad or 0 if cliente else 0,
        "indicadores_financieros": _parse_json(cliente.indicadores_financieros if cliente else "[]"),
        "capacidad_residual_pct": cliente.capacidad_residual_pct if cliente else None,
        "contratos_vigentes_valor": cliente.contratos_vigentes_valor or 0 if cliente else 0,
        "fecha_inscripcion": None,
        "fecha_actualizacion": None,
        "fuentes": {},
    }

    # Registrar fuentes manuales si existen.
    if cliente:
        if cliente.patrimonio_liquido:
            perfil["fuentes"]["patrimonio"] = "perfil_manual"
        if cliente.ingresos_anuales:
            perfil["fuentes"]["ingresos"] = "perfil_manual"
        if cliente.experiencia_valor_total:
            perfil["fuentes"]["experiencia_valor_total"] = "perfil_manual"
        if cliente.experiencia_cantidad:
            perfil["fuentes"]["experiencia_cantidad"] = "perfil_manual"
        if _parse_json(cliente.indicadores_financieros or "[]"):
            perfil["fuentes"]["indicadores_financieros"] = "perfil_manual"
        if cliente.capacidad_residual_pct:
            perfil["fuentes"]["capacidad_residual_pct"] = "perfil_manual"

    for doc in documentos:
        if not doc.extraccion:
            continue
        try:
            extraccion = json.loads(doc.extraccion)
        except json.JSONDecodeError:
            continue

        tipo = extraccion.get("tipo_documento")
        if tipo == "rup":
            if extraccion.get("nit"):
                perfil["nit"] = extraccion["nit"]
                perfil["fuentes"]["nit"] = doc.filename
            if extraccion.get("razon_social"):
                perfil["razon_social"] = extraccion["razon_social"]
                perfil["fuentes"]["razon_social"] = doc.filename
            if extraccion.get("vigencia"):
                perfil["vigencia_rup"] = extraccion["vigencia"]
                perfil["fuentes"]["vigencia_rup"] = doc.filename
            if extraccion.get("estado"):
                perfil["estado_rup"] = extraccion["estado"]
                perfil["fuentes"]["estado_rup"] = doc.filename
            if extraccion.get("tipo_persona"):
                perfil["tipo_persona"] = extraccion["tipo_persona"]
                perfil["fuentes"]["tipo_persona"] = doc.filename
            if extraccion.get("categoria"):
                perfil["categoria"] = extraccion["categoria"]
                perfil["fuentes"]["categoria"] = doc.filename
            if extraccion.get("representante_legal"):
                perfil["representante_legal"] = extraccion["representante_legal"]
                perfil["fuentes"]["representante_legal"] = doc.filename
            if extraccion.get("correo"):
                perfil["correo"] = extraccion["correo"]
                perfil["fuentes"]["correo"] = doc.filename
            if extraccion.get("telefono"):
                perfil["telefono"] = extraccion["telefono"]
                perfil["fuentes"]["telefono"] = doc.filename
            if extraccion.get("direccion"):
                perfil["direccion"] = extraccion["direccion"]
                perfil["fuentes"]["direccion"] = doc.filename
            if extraccion.get("camara_comercio"):
                perfil["camara_comercio"] = extraccion["camara_comercio"]
                perfil["fuentes"]["camara_comercio"] = doc.filename
            if extraccion.get("ciiu"):
                perfil["ciiu"] = sorted(set(perfil["ciiu"] + extraccion["ciiu"]))
            if extraccion.get("unspsc"):
                perfil["unspsc"] = sorted(set(perfil["unspsc"] + extraccion["unspsc"]))
            if extraccion.get("departamentos"):
                perfil["departamentos"] = sorted(set(perfil["departamentos"] + extraccion["departamentos"]))
            if extraccion.get("municipios"):
                perfil["municipios"] = sorted(set(perfil["municipios"] + extraccion["municipios"]))
            if extraccion.get("fecha_inscripcion"):
                perfil["fecha_inscripcion"] = extraccion["fecha_inscripcion"]
                perfil["fuentes"]["fecha_inscripcion"] = doc.filename
            if extraccion.get("fecha_actualizacion"):
                perfil["fecha_actualizacion"] = extraccion["fecha_actualizacion"]
                perfil["fuentes"]["fecha_actualizacion"] = doc.filename

            # Información financiera / capacidad financiera del RUP.
            campos_financieros = [
                "patrimonio",
                "ingresos",
                "activos",
                "activo_total",
                "pasivos",
                "pasivo_total",
                "activo_corriente",
                "pasivo_corriente",
                "utilidad_operacional",
                "gastos_intereses",
            ]
            for campo in campos_financieros:
                if extraccion.get(campo) is not None:
                    # Normalizar alias: activo_total -> activos, pasivo_total -> pasivos
                    clave_perfil = campo
                    if campo == "activo_total":
                        clave_perfil = "activos"
                    elif campo == "pasivo_total":
                        clave_perfil = "pasivos"
                    perfil[clave_perfil] = extraccion[campo]
                    perfil["fuentes"][clave_perfil] = doc.filename

            indicadores_rup = {}
            for k in [
                "indice_liquidez",
                "indice_endeudamiento",
                "razon_cobertura_intereses",
                "rentabilidad_patrimonio",
                "rentabilidad_activo",
            ]:
                if extraccion.get(k) is not None:
                    indicadores_rup[k] = extraccion[k]
            if indicadores_rup:
                actuales = perfil.get("indicadores_financieros") or {}
                if isinstance(actuales, list):
                    actuales = {k: True for k in actuales}
                actuales.update(indicadores_rup)
                perfil["indicadores_financieros"] = actuales
                perfil["fuentes"]["indicadores_financieros"] = doc.filename

            # Experiencia contenida en el RUP (certificados de cámara de comercio)
            exp_rup = extraccion.get("experiencia") or []
            for e in exp_rup:
                if e.get("valor"):
                    perfil["experiencia_valor_total"] += e["valor"]
                    perfil["experiencia_cantidad"] += 1
                    if "experiencia" not in perfil["fuentes"]:
                        perfil["fuentes"]["experiencia"] = []
                    perfil["fuentes"]["experiencia"].append({
                        "archivo": doc.filename,
                        "entidad": e.get("entidad"),
                        "valor": e.get("valor"),
                        "objeto": e.get("objeto"),
                        "fuente": "rup",
                    })

        elif tipo == "estados_financieros":
            if extraccion.get("patrimonio"):
                perfil["patrimonio"] = extraccion["patrimonio"]
                perfil["fuentes"]["patrimonio"] = doc.filename
            if extraccion.get("ingresos"):
                perfil["ingresos"] = extraccion["ingresos"]
                perfil["fuentes"]["ingresos"] = doc.filename
            if extraccion.get("indicadores_calculados"):
                # Fusionar indicadores calculados del documento con los existentes.
                actuales = perfil.get("indicadores_financieros") or {}
                if isinstance(actuales, list):
                    actuales = {k: True for k in actuales}
                actuales.update(extraccion["indicadores_calculados"])
                perfil["indicadores_financieros"] = actuales
                perfil["fuentes"]["indicadores_financieros"] = doc.filename

        elif tipo == "certificado_experiencia":
            if extraccion.get("valor"):
                perfil["experiencia_valor_total"] += extraccion["valor"]
                perfil["experiencia_cantidad"] += 1
                if "experiencia" not in perfil["fuentes"]:
                    perfil["fuentes"]["experiencia"] = []
                perfil["fuentes"]["experiencia"].append({
                    "archivo": doc.filename,
                    "entidad": extraccion.get("entidad"),
                    "valor": extraccion.get("valor"),
                    "objeto": extraccion.get("objeto"),
                })

    # Normalizar fuentes de experiencia: si hay certificados/RUP, reflejar la combinación.
    certificados_valor = sum(
        item.get("valor", 0)
        for item in perfil["fuentes"].get("experiencia", [])
        if isinstance(item, dict)
    )
    certificados_cantidad = len(perfil["fuentes"].get("experiencia", []))
    if certificados_cantidad > 0:
        manual_valor = (cliente.experiencia_valor_total or 0) if cliente else 0
        manual_cantidad = (cliente.experiencia_cantidad or 0) if cliente else 0
        if manual_valor > 0 or manual_cantidad > 0:
            perfil["fuentes"]["experiencia_valor_total"] = f"perfil_manual + {certificados_cantidad} certificados/RUP"
            perfil["fuentes"]["experiencia_cantidad"] = f"perfil_manual + {certificados_cantidad} certificados/RUP"
        else:
            perfil["fuentes"]["experiencia_valor_total"] = f"{certificados_cantidad} certificados/RUP"
            perfil["fuentes"]["experiencia_cantidad"] = f"{certificados_cantidad} certificados/RUP"

    return perfil


def actualizar_cliente_desde_rup(cliente_id: int, db: Session) -> dict[str, Any]:
    """Actualiza el registro del cliente con datos extraídos de su RUP.

    Solo completa campos que estén vacíos en el cliente, priorizando los
    valores manuales ya configurados.
    """
    import json

    perfil = consolidar_perfil(cliente_id, db)
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise ValueError("Cliente no encontrado")

    cambios: dict[str, Any] = {}

    def _normalizar_clave(s: str) -> str:
        """Normaliza una cadena para comparación: minúsculas, sin tildes, sin puntos."""
        import unicodedata

        s = s.strip().lower()
        s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
        s = s.replace(".", "").replace(" ", "")
        return s

    # Departamentos: fusionar con los existentes sin duplicar.
    if perfil.get("departamentos"):
        actuales_raw = json.loads(cliente.departamentos or "[]")
        actuales = {_normalizar_clave(d): d.strip() for d in actuales_raw}
        for d in perfil["departamentos"]:
            clave = _normalizar_clave(d)
            if clave not in actuales:
                actuales[clave] = d
        nuevo = list(actuales.values())
        if len(nuevo) != len(actuales_raw):
            cliente.departamentos = json.dumps(nuevo)
            cambios["departamentos"] = nuevo

    # UNSPSC: fusionar con los existentes sin duplicar.
    if perfil.get("unspsc"):
        actuales = {c.strip(): c.strip() for c in json.loads(cliente.unspsc_codes or "[]")}
        for c in perfil["unspsc"]:
            actuales[c.strip()] = c.strip()
        nuevo = list(actuales.values())
        if sorted(nuevo) != sorted(json.loads(cliente.unspsc_codes or "[]")):
            cliente.unspsc_codes = json.dumps(nuevo)
            cambios["unspsc_codes"] = nuevo

    # Municipio: solo si no está configurado.
    if not cliente.municipio and perfil.get("municipios"):
        cliente.municipio = perfil["municipios"][0]
        cambios["municipio"] = cliente.municipio

    # Patrimonio líquido: solo si no está configurado.
    if cliente.patrimonio_liquido is None and perfil.get("patrimonio"):
        cliente.patrimonio_liquido = perfil["patrimonio"]
        cambios["patrimonio_liquido"] = cliente.patrimonio_liquido

    # Ingresos anuales: solo si no está configurado.
    if cliente.ingresos_anuales is None and perfil.get("ingresos"):
        cliente.ingresos_anuales = perfil["ingresos"]
        cambios["ingresos_anuales"] = cliente.ingresos_anuales

    # NOTA: La experiencia contenida en el RUP se consolida dinámicamente en
    # `consolidar_perfil`. No la guardamos como valor manual del cliente para
    # evitar duplicarla cuando se vuelva a calcular el perfil.

    db.commit()
    db.refresh(cliente)

    return {"cliente_id": cliente_id, "cambios": cambios, "perfil": perfil}
