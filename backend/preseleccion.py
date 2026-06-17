import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models import AnalisisProceso, Cliente, Documento, Proceso

SMMLV = 1_423_500  # Valor por defecto, se puede leer de env

DOCUMENTOS_REQUERIDOS = [
    "RUP vigente (Registro Único de Proponentes)",
    "Estados financieros con corte (año anterior)",
    "Certificados de experiencia en SMMLV",
    "Paz y salvo de parafiscales (SENA, ICBF, Caja)",
    "Póliza de seriedad de la oferta",
    "Propuesta técnica",
    "Propuesta económica",
    "Carta de presentación de oferta",
]


def _modalidad_estimada(valor: int) -> str:
    if valor <= 10 * SMMLV:
        return "Contratación directa"
    if valor <= 50 * SMMLV:
        return "Mínima cuantía"
    if valor <= 400 * SMMLV:
        return "Selección abreviada"
    return "Licitación pública"


def _parse_json(text: str | None) -> list[str]:
    try:
        data = json.loads(text or "[]")
        return [str(x).upper() for x in data]
    except Exception:
        return []


def _vigente(fecha_cierre: datetime | None) -> bool:
    if not fecha_cierre:
        return True
    return fecha_cierre > datetime.utcnow() + timedelta(days=1)


def _dias_restantes(fecha_cierre: datetime | None) -> int | None:
    if not fecha_cierre:
        return None
    return (fecha_cierre - datetime.utcnow()).days


def analizar_preseleccion(proceso_id: int, cliente_id: int, db: Session) -> AnalisisProceso:
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()

    if not proceso or not cliente:
        raise ValueError("Proceso o cliente no encontrado")

    deptos_cliente = _parse_json(cliente.departamentos)
    unspsc_cliente = _parse_json(cliente.unspsc_codes)

    depto_proceso = (proceso.departamento or "").upper()
    unspsc_proceso = (proceso.unspsc_code or "").replace("V1.", "").upper()

    match_departamento = any(d in depto_proceso for d in deptos_cliente)
    match_unspsc = any(unspsc_proceso.startswith(u[:4]) for u in unspsc_cliente)
    match_presupuesto = (
        proceso.presupuesto >= cliente.presupuesto_min
        and (cliente.presupuesto_max == 0 or proceso.presupuesto <= cliente.presupuesto_max)
    )
    vigente = _vigente(proceso.fecha_cierre)
    dias_restantes = _dias_restantes(proceso.fecha_cierre)

    documentos_subidos_raw = db.query(Documento).filter(Documento.cliente_id == cliente_id).all()
    documentos_subidos = sorted({d.nombre for d in documentos_subidos_raw})
    documentos_faltantes = [d for d in DOCUMENTOS_REQUERIDOS if d not in documentos_subidos]

    # Score ponderado
    score = 0
    score += 25 if match_departamento else 0
    score += 25 if match_unspsc else 0
    score += 20 if match_presupuesto else 0
    score += 10 if vigente else 0
    score += 20 if not documentos_faltantes else max(0, 20 - int(len(documentos_faltantes) * 2.5))

    if score >= 80:
        recomendacion = "Participar"
    elif score >= 50:
        recomendacion = "Revisar manualmente"
    else:
        recomendacion = "No participar"

    faltantes = []
    if not match_departamento:
        faltantes.append("El departamento del proceso no coincide con los departamentos del cliente")
    if not match_unspsc:
        faltantes.append("El código UNSPSC del proceso no coincide con los rubros del cliente")
    if not match_presupuesto:
        faltantes.append("El presupuesto del proceso está fuera del rango del cliente")
    if not vigente:
        faltantes.append("El proceso ya cerró o vence en menos de 24 horas")
    if documentos_faltantes:
        faltantes.append(f"Documentos faltantes: {', '.join(documentos_faltantes)}")

    riesgos = []
    if proceso.presupuesto > 400 * SMMLV:
        riesgos.append("Licitación pública: competencia alta y trámite complejo")
    if not vigente:
        riesgos.append("Proceso vencido o por vencer")
    if dias_restantes is not None and dias_restantes < 7:
        riesgos.append("Poco tiempo para preparar oferta")
    if proceso.tiene_adenda:
        riesgos.append("El proceso tiene adenda; revisar cambios recientes")

    detalle: dict[str, Any] = {
        "proceso": {
            "numero_proceso": proceso.numero_proceso,
            "entidad": proceso.entidad,
            "objeto": proceso.objeto,
            "presupuesto": proceso.presupuesto,
            "departamento": proceso.departamento,
            "unspsc_code": proceso.unspsc_code,
            "fecha_cierre": proceso.fecha_cierre.isoformat() if proceso.fecha_cierre else None,
            "url_documento": proceso.url_documento,
            "tiene_adenda": proceso.tiene_adenda,
            "modalidad_estimada": _modalidad_estimada(proceso.presupuesto),
        },
        "cliente": {
            "nombre": cliente.nombre,
            "departamentos": deptos_cliente,
            "unspsc_codes": unspsc_cliente,
            "presupuesto_min": cliente.presupuesto_min,
            "presupuesto_max": cliente.presupuesto_max,
        },
        "checklist": [
            {"item": "Departamento compatible", "cumple": match_departamento, "peso": 25},
            {"item": "UNSPSC compatible", "cumple": match_unspsc, "peso": 25},
            {"item": "Presupuesto dentro del rango", "cumple": match_presupuesto, "peso": 20},
            {"item": "Proceso vigente", "cumple": vigente, "peso": 10, "dias_restantes": dias_restantes},
            {"item": "Documentación completa", "cumple": not documentos_faltantes, "peso": 20, "faltantes": documentos_faltantes},
        ],
        "documentos_subidos": documentos_subidos,
        "documentos_requeridos": DOCUMENTOS_REQUERIDOS,
        "documentos_faltantes": documentos_faltantes,
    }

    existente = (
        db.query(AnalisisProceso)
        .filter(AnalisisProceso.proceso_id == proceso_id, AnalisisProceso.cliente_id == cliente_id)
        .first()
    )

    if existente:
        existente.score_preseleccion = score
        existente.recomendacion = recomendacion
        existente.faltantes = json.dumps(faltantes)
        existente.riesgos = json.dumps(riesgos)
        existente.detalle = json.dumps(detalle)
        existente.fecha_analisis = datetime.utcnow()
        db.commit()
        db.refresh(existente)
        return existente

    analisis = AnalisisProceso(
        proceso_id=proceso_id,
        cliente_id=cliente_id,
        score_preseleccion=score,
        recomendacion=recomendacion,
        faltantes=json.dumps(faltantes),
        riesgos=json.dumps(riesgos),
        detalle=json.dumps(detalle),
    )
    db.add(analisis)
    db.commit()
    db.refresh(analisis)
    return analisis
