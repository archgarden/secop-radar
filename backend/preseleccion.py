import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from extraccion.procesador import consolidar_perfil
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


def _pct_cumplimiento(actual: int | float, requerido: int | float) -> float:
    """Devuelve el porcentaje de cumplimiento, limitado a 100%."""
    if not requerido or requerido <= 0:
        return 100.0
    if not actual or actual <= 0:
        return 0.0
    return min(100.0, (actual / requerido) * 100)


def _evaluar_requisitos_estructurados(
    requisitos: dict[str, Any], perfil: dict[str, Any]
) -> dict[str, Any]:
    """Compara requisitos cuantitativos del pliego con el perfil del cliente.

    Retorna {"score": 0-100, "faltantes": [...], "detalle": {...}}.
    """
    faltantes: list[str] = []
    detalle: dict[str, Any] = {}

    if not requisitos:
        return {"score": 0, "faltantes": faltantes, "detalle": detalle}

    experiencia = requisitos.get("experiencia", {})
    capacidad_financiera = requisitos.get("capacidad_financiera", {})
    capacidad_residual = requisitos.get("capacidad_residual", {})

    # Experiencia (peso 50)
    peso_exp = 50
    if experiencia:
        min_contratos = experiencia.get("min_contratos", 1) or 1
        valor_min_cop = experiencia.get("valor_minimo_cop", 0) or 0
        exp_cantidad = perfil.get("experiencia_cantidad") or 0
        exp_valor = perfil.get("experiencia_valor_total") or 0

        pct_cantidad = _pct_cumplimiento(exp_cantidad, min_contratos)
        pct_valor = _pct_cumplimiento(exp_valor, valor_min_cop) if valor_min_cop > 0 else 100.0
        score_exp = round((pct_cantidad + pct_valor) / 2)

        detalle["experiencia"] = {
            "min_contratos_requerido": min_contratos,
            "contratos_cliente": exp_cantidad,
            "valor_minimo_requerido": valor_min_cop,
            "valor_experiencia_cliente": exp_valor,
            "score": score_exp,
        }
        if score_exp < 100:
            faltantes.append(
                f"Experiencia insuficiente: {exp_cantidad}/{min_contratos} contratos, "
                f"${exp_valor:,.0f}/${valor_min_cop:,.0f} COP"
            )
    else:
        score_exp = 100
        peso_exp = 0

    # Capacidad financiera (peso 30)
    peso_fin = 30
    if capacidad_financiera:
        patrimonio_min = capacidad_financiera.get("patrimonio_minimo_cop", 0) or 0
        indicadores_req = [str(i).lower() for i in capacidad_financiera.get("indicadores_requeridos", [])]
        indicadores_cli = [str(i).lower() for i in perfil.get("indicadores_financieros", [])]

        pct_patrimonio = _pct_cumplimiento(perfil.get("patrimonio") or 0, patrimonio_min) if patrimonio_min > 0 else 100.0
        if indicadores_req:
            indicadores_cumplidos = sum(1 for i in indicadores_req if i in indicadores_cli)
            pct_indicadores = _pct_cumplimiento(indicadores_cumplidos, len(indicadores_req))
        else:
            pct_indicadores = 100.0

        if patrimonio_min > 0 and indicadores_req:
            score_fin = round((pct_patrimonio + pct_indicadores) / 2)
        elif patrimonio_min > 0:
            score_fin = round(pct_patrimonio)
        elif indicadores_req:
            score_fin = round(pct_indicadores)
        else:
            score_fin = 100
            peso_fin = 0

        detalle["capacidad_financiera"] = {
            "patrimonio_minimo_requerido": patrimonio_min,
            "patrimonio_cliente": perfil.get("patrimonio") or 0,
            "indicadores_requeridos": indicadores_req,
            "indicadores_cliente": indicadores_cli,
            "indicadores_cumplidos": sum(1 for i in indicadores_req if i in indicadores_cli),
            "score": score_fin,
        }
        if score_fin < 100:
            faltantes.append(
                f"Capacidad financiera insuficiente: patrimonio "
                f"${perfil.get('patrimonio') or 0:,.0f}/${patrimonio_min:,.0f} COP, "
                f"indicadores {detalle['capacidad_financiera']['indicadores_cumplidos']}/{len(indicadores_req)}"
            )
    else:
        score_fin = 100
        peso_fin = 0

    # Capacidad residual (peso 20)
    peso_res = 20
    if capacidad_residual and capacidad_residual.get("requerida"):
        min_crp = capacidad_residual.get("min_crp_pct", 0) or 0
        crp_cliente = perfil.get("capacidad_residual_pct") or 0
        score_res = round(_pct_cumplimiento(crp_cliente, min_crp)) if min_crp > 0 else 100
        detalle["capacidad_residual"] = {
            "min_crp_pct_requerido": min_crp,
            "crp_cliente": crp_cliente,
            "score": score_res,
        }
        if score_res < 100:
            faltantes.append(f"Capacidad residual insuficiente: {crp_cliente}%/{min_crp}%")
    else:
        score_res = 100
        peso_res = 0

    total_peso = peso_exp + peso_fin + peso_res
    if total_peso == 0:
        score_total = 0
    else:
        score_total = round(
            (score_exp * peso_exp + score_fin * peso_fin + score_res * peso_res) / total_peso
        )

    return {"score": score_total, "faltantes": faltantes, "detalle": detalle}


def analizar_preseleccion(proceso_id: int, cliente_id: int, db: Session) -> AnalisisProceso:
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()

    if not proceso or not cliente:
        raise ValueError("Proceso o cliente no encontrado")

    perfil = consolidar_perfil(cliente.id, db)

    # Preferir datos extraídos de documentos; si no existen, usar los registrados en el formulario.
    deptos_cliente = (
        perfil.get("departamentos")
        or _parse_json(cliente.departamentos)
    )
    unspsc_cliente = (
        perfil.get("unspsc")
        or _parse_json(cliente.unspsc_codes)
    )

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

    # Score ponderado base (sin pliego)
    score_base = 0
    score_base += 25 if match_departamento else 0
    score_base += 25 if match_unspsc else 0
    score_base += 20 if match_presupuesto else 0
    score_base += 10 if vigente else 0
    score_base += 20 if not documentos_faltantes else max(0, 20 - int(len(documentos_faltantes) * 2.5))

    # Integrar análisis del pliego si existe.
    analisis_pliego_existente = (
        db.query(AnalisisProceso)
        .filter(AnalisisProceso.proceso_id == proceso_id, AnalisisProceso.cliente_id == cliente_id)
        .first()
    )

    # Score documental: recalcular desde el cumplimiento guardado en analisis_pliego
    # para no depender de score_pliego, que puede haber sido sobrescrito con el combinado.
    score_pliego_documental = 0
    if analisis_pliego_existente and analisis_pliego_existente.analisis_pliego:
        try:
            pliego_data = json.loads(analisis_pliego_existente.analisis_pliego)
            cumplimiento = pliego_data.get("cumplimiento", [])
            total_doc = len(cumplimiento)
            cumplidos_doc = sum(1 for item in cumplimiento if item.get("cumple"))
            score_pliego_documental = round((cumplidos_doc / total_doc) * 100) if total_doc else 0
        except Exception:
            score_pliego_documental = analisis_pliego_existente.score_pliego or 0

    # Score estructurado: comparar requisitos cuantitativos del pliego con el perfil del cliente.
    requisitos_estructurados: dict[str, Any] = {}
    if analisis_pliego_existente and analisis_pliego_existente.analisis_pliego:
        try:
            pliego_data = json.loads(analisis_pliego_existente.analisis_pliego)
            requisitos_estructurados = pliego_data.get("requisitos_estructurados", {})
        except Exception:
            requisitos_estructurados = {}

    eval_estructurada = _evaluar_requisitos_estructurados(requisitos_estructurados, perfil)
    score_pliego_estructurado = eval_estructurada["score"]

    # Combinar: 30% cumplimiento documental + 70% requisitos cuantitativos.
    if requisitos_estructurados:
        score_pliego = round(0.3 * score_pliego_documental + 0.7 * score_pliego_estructurado)
    else:
        score_pliego = score_pliego_documental

    score = round(0.7 * score_base + 0.3 * score_pliego)

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

    # Requisitos del pliego que el cliente no cumple (documental + estructurado).
    requisitos_pliego_faltantes = []
    if analisis_pliego_existente and analisis_pliego_existente.analisis_pliego:
        try:
            pliego_data = json.loads(analisis_pliego_existente.analisis_pliego)
            for item in pliego_data.get("cumplimiento", []):
                if not item.get("cumple"):
                    requisitos_pliego_faltantes.append(item["requisito"]["nombre"])
        except Exception:
            pass

    requisitos_estructurados_faltantes = eval_estructurada.get("faltantes", [])
    requisitos_pliego_faltantes.extend(requisitos_estructurados_faltantes)

    if requisitos_pliego_faltantes:
        faltantes.append(
            f"Requisitos del pliego no cumplidos: {', '.join(requisitos_pliego_faltantes)}"
        )

    riesgos = []
    if proceso.presupuesto > 400 * SMMLV:
        riesgos.append("Licitación pública: competencia alta y trámite complejo")
    if not vigente:
        riesgos.append("Proceso vencido o por vencer")
    if dias_restantes is not None and dias_restantes < 7:
        riesgos.append("Poco tiempo para preparar oferta")
    if proceso.tiene_adenda:
        riesgos.append("El proceso tiene adenda; revisar cambios recientes")
    if score_pliego < 50 and analisis_pliego_existente:
        riesgos.append("El pliego exige requisitos que el cliente no cumple")

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
            "municipio": cliente.municipio,
            "unspsc_codes": unspsc_cliente,
            "presupuesto_min": cliente.presupuesto_min,
            "presupuesto_max": cliente.presupuesto_max,
            "perfil_financiero": {
                "patrimonio_liquido": perfil.get("patrimonio"),
                "ingresos_anuales": perfil.get("ingresos"),
                "experiencia_valor_total": perfil.get("experiencia_valor_total"),
                "experiencia_cantidad": perfil.get("experiencia_cantidad"),
                "indicadores_financieros": perfil.get("indicadores_financieros"),
                "capacidad_residual_pct": perfil.get("capacidad_residual_pct"),
                "contratos_vigentes_valor": perfil.get("contratos_vigentes_valor"),
            },
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
        "score_base": score_base,
        "score_pliego": score_pliego,
        "score_pliego_documental": score_pliego_documental,
        "score_pliego_estructurado": score_pliego_estructurado,
        "evaluacion_requisitos_estructurados": eval_estructurada.get("detalle", {}),
        "requisitos_estructurados_faltantes": requisitos_estructurados_faltantes,
        "requisitos_pliego_faltantes": requisitos_pliego_faltantes,
    }

    existente = (
        db.query(AnalisisProceso)
        .filter(AnalisisProceso.proceso_id == proceso_id, AnalisisProceso.cliente_id == cliente_id)
        .first()
    )

    if existente:
        existente.score_preseleccion = score
        existente.score_pliego = score_pliego
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
        score_pliego=score_pliego,
        recomendacion=recomendacion,
        faltantes=json.dumps(faltantes),
        riesgos=json.dumps(riesgos),
        detalle=json.dumps(detalle),
    )
    db.add(analisis)
    db.commit()
    db.refresh(analisis)
    return analisis
