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
        "municipio": cliente.municipio if cliente else None,
        "unspsc": [],
        "departamentos": [],
        "patrimonio": cliente.patrimonio_liquido if cliente else None,
        "ingresos": cliente.ingresos_anuales if cliente else None,
        "experiencia_valor_total": cliente.experiencia_valor_total or 0 if cliente else 0,
        "experiencia_cantidad": cliente.experiencia_cantidad or 0 if cliente else 0,
        "indicadores_financieros": _parse_json(cliente.indicadores_financieros if cliente else "[]"),
        "capacidad_residual_pct": cliente.capacidad_residual_pct if cliente else None,
        "contratos_vigentes_valor": cliente.contratos_vigentes_valor or 0 if cliente else 0,
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
            if extraccion.get("unspsc"):
                perfil["unspsc"] = sorted(set(perfil["unspsc"] + extraccion["unspsc"]))
            if extraccion.get("departamentos"):
                perfil["departamentos"] = sorted(set(perfil["departamentos"] + extraccion["departamentos"]))

        elif tipo == "estados_financieros":
            if extraccion.get("patrimonio"):
                perfil["patrimonio"] = extraccion["patrimonio"]
                perfil["fuentes"]["patrimonio"] = doc.filename
            if extraccion.get("ingresos"):
                perfil["ingresos"] = extraccion["ingresos"]
                perfil["fuentes"]["ingresos"] = doc.filename

        elif tipo == "certificado_experiencia":
            if extraccion.get("valor"):
                perfil["experiencia_valor_total"] += extraccion["valor"]
                perfil["experiencia_cantidad"] += 1

    return perfil
