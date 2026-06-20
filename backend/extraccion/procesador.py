"""Orquesta la extracción de documentos y la consolidación del perfil del cliente."""

import json
from typing import Any

from sqlalchemy.orm import Session

from models import Cliente, Documento

from .extractores import extraer_documento


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
        "patrimonio": None,
        "ingresos": None,
        "experiencia_valor_total": 0,
        "experiencia_cantidad": 0,
        "fuentes": {},
    }

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
