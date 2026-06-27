import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from extraccion.procesador import consolidar_perfil
from models import AnalisisProceso, Cliente, Documento, Proceso

SMMLV = 1_423_500  # Valor por defecto, se puede leer de env

DEFAULT_CORE_PATH = Path(__file__).resolve().parent.parent / "storage" / "core_documentos_base_fijos.json"

# Fallback clásico si el Core aún no existe.
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


def cargar_core_documentos(path: str | Path | None = None) -> dict[str, list[dict[str, Any]]]:
    """Carga el Core de Documentos Base Fijos y devuelve listas por categoría.

    El Core se genera a partir del análisis masivo de pliegos y contiene
    documentos del proponente, del pliego y de calidad con etiquetas de
    frecuencia: obligatorio, frecuente, segun_pliego.
    """
    ruta = Path(path or DEFAULT_CORE_PATH)
    if not ruta.exists():
        return {}

    try:
        with open(ruta, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}

    core: dict[str, list[dict[str, Any]]] = {}
    for categoria in ["proponente", "pliego", "calidad"]:
        items = data.get(categoria, {})
        if isinstance(items, dict):
            core[categoria] = list(items.values())
        elif isinstance(items, list):
            core[categoria] = items
        else:
            core[categoria] = []

    return core


def _documentos_requeridos_core(core: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Devuelve los documentos del proponente que siempre o frecuentemente se requieren."""
    if not core:
        return []

    docs: list[dict[str, Any]] = []
    for doc in core.get("proponente", []):
        label = doc.get("frecuencia_label", "segun_pliego")
        if label in ("obligatorio", "frecuente"):
            docs.append(doc)
    return docs


def _documento_cubre_requerido(doc_core: dict[str, Any], nombres_subidos: list[str]) -> bool:
    """Matching difuso usando nombre + keywords del Core."""
    terminos: list[str] = [doc_core.get("nombre", "")]
    terminos.extend(doc_core.get("keywords", []))

    for termino in terminos:
        if not termino:
            continue
        req_norm = str(termino).lower()
        req_palabras = set(re.sub(r"[^a-z0-9áéíóúñ]+", " ", req_norm).split())
        if len(req_palabras) < 1:
            continue
        for nombre in nombres_subidos:
            doc_norm = nombre.lower()
            doc_palabras = set(re.sub(r"[^a-z0-9áéíóúñ]+", " ", doc_norm).split())
            interseccion = req_palabras & doc_palabras
            if len(interseccion) >= 2 or (len(req_palabras) == 1 and len(interseccion) == 1):
                return True
    return False


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


def _parse_json_lista(text: str | None) -> list[str]:
    try:
        data = json.loads(text or "[]")
        return [str(x) for x in data] if isinstance(data, list) else []
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

    Retorna {"score": 0-100, "faltantes": [...], "faltantes_detallados": [...], "detalle": {...}}.
    """
    faltantes: list[str] = []
    faltantes_detallados: list[dict[str, Any]] = []
    detalle: dict[str, Any] = {}

    if not requisitos:
        return {"score": 0, "faltantes": faltantes, "faltantes_detallados": faltantes_detallados, "detalle": detalle}

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
            faltante_texto = (
                f"Experiencia insuficiente: {exp_cantidad}/{min_contratos} contratos, "
                f"${exp_valor:,.0f}/${valor_min_cop:,.0f} COP"
            )
            faltantes.append(faltante_texto)
            faltantes_detallados.append({
                "categoria": "experiencia",
                "item": "Experiencia requerida",
                "requerido": f"{min_contratos} contratos / ${valor_min_cop:,.0f} COP",
                "actual": f"{exp_cantidad} contratos / ${exp_valor:,.0f} COP",
                "diferencia": f"Faltan {max(0, min_contratos - exp_cantidad)} contratos / ${max(0, valor_min_cop - exp_valor):,.0f} COP",
                "score": score_exp,
            })
    else:
        score_exp = 100
        peso_exp = 0

    # Capacidad financiera (peso 30)
    peso_fin = 30
    if capacidad_financiera:
        patrimonio_min = capacidad_financiera.get("patrimonio_minimo_cop", 0) or 0
        patrimonio_cliente = perfil.get("patrimonio") or 0

        pct_patrimonio = _pct_cumplimiento(patrimonio_cliente, patrimonio_min) if patrimonio_min > 0 else 100.0

        # Indicadores: comparar presencia y, si hay Matriz 2, valores numéricos.
        indicadores_req_raw = capacidad_financiera.get("indicadores_requeridos", [])
        matriz2 = capacidad_financiera.get("matriz2", {})
        resumen_indicadores = matriz2.get("resumen", {})
        perfil_indicadores = perfil.get("indicadores_financieros") or []
        perfil_indicadores_lower = [str(i).lower() for i in perfil_indicadores]

        indicadores_detalle: list[dict[str, Any]] = []
        indicadores_score_sum = 0.0
        indicadores_score_count = 0

        for indicador in indicadores_req_raw:
            ind_lower = str(indicador).lower()
            presente = ind_lower in perfil_indicadores_lower
            # Buscar valor requerido en Matriz 2 (perfil general por defecto)
            valor_requerido = None
            texto_requerido = None
            if resumen_indicadores:
                for perfil_tipo in ["general", "mipyme"]:
                    if perfil_tipo in resumen_indicadores and ind_lower in resumen_indicadores[perfil_tipo]:
                        valor_requerido = resumen_indicadores[perfil_tipo][ind_lower].get("valor_minimo")
                        texto_requerido = resumen_indicadores[perfil_tipo][ind_lower].get("texto")
                        break

            ind_score = 100.0 if presente else 0.0
            if presente and valor_requerido is not None:
                # El cliente tiene el indicador como nombre pero no valor numérico en el perfil manual.
                # Si en el futuro extraemos valores de estados financieros, aquí se compararán.
                ind_score = 50.0  # Parcial: indicador declarado pero sin valor numérico verificable

            indicadores_score_sum += ind_score
            indicadores_score_count += 1

            indicadores_detalle.append({
                "indicador": indicador,
                "presente": presente,
                "valor_requerido": valor_requerido,
                "texto_requerido": texto_requerido,
                "score": ind_score,
            })

        pct_indicadores = (
            round(indicadores_score_sum / indicadores_score_count, 1)
            if indicadores_score_count > 0
            else 100.0
        )

        if patrimonio_min > 0 and indicadores_score_count > 0:
            score_fin = round((pct_patrimonio + pct_indicadores) / 2)
        elif patrimonio_min > 0:
            score_fin = round(pct_patrimonio)
        elif indicadores_score_count > 0:
            score_fin = round(pct_indicadores)
        else:
            score_fin = 100
            peso_fin = 0

        indicadores_cumplidos = sum(1 for d in indicadores_detalle if d["presente"])
        detalle["capacidad_financiera"] = {
            "patrimonio_minimo_requerido": patrimonio_min,
            "patrimonio_cliente": patrimonio_cliente,
            "indicadores_requeridos": [str(i).lower() for i in indicadores_req_raw],
            "indicadores_cliente": perfil_indicadores_lower,
            "indicadores_cumplidos": indicadores_cumplidos,
            "indicadores_detalle": indicadores_detalle,
            "score": score_fin,
        }
        if score_fin < 100:
            faltantes.append(
                f"Capacidad financiera insuficiente: patrimonio "
                f"${patrimonio_cliente:,.0f}/${patrimonio_min:,.0f} COP, "
                f"indicadores {indicadores_cumplidos}/{indicadores_score_count}"
            )
            if patrimonio_cliente < patrimonio_min:
                faltantes_detallados.append({
                    "categoria": "capacidad_financiera",
                    "item": "Patrimonio líquido",
                    "requerido": f"${patrimonio_min:,.0f} COP",
                    "actual": f"${patrimonio_cliente:,.0f} COP",
                    "diferencia": f"Faltan ${max(0, patrimonio_min - patrimonio_cliente):,.0f} COP",
                    "score": round(pct_patrimonio),
                })
            for d in indicadores_detalle:
                if d["score"] < 100:
                    faltantes_detallados.append({
                        "categoria": "capacidad_financiera",
                        "item": f"Indicador: {d['indicador']}",
                        "requerido": d["texto_requerido"] or "Requerido",
                        "actual": "Declarado" if d["presente"] else "No declarado",
                        "diferencia": "Falta valor numérico verificable" if d["presente"] else "No se reportó",
                        "score": d["score"],
                    })
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
            faltantes_detallados.append({
                "categoria": "capacidad_residual",
                "item": "Capacidad residual",
                "requerido": f"{min_crp}%" if min_crp > 0 else "Requerida",
                "actual": f"{crp_cliente}%",
                "diferencia": f"Faltan {max(0, min_crp - crp_cliente):.1f} puntos porcentuales",
                "score": score_res,
            })
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

    return {
        "score": score_total,
        "faltantes": faltantes,
        "faltantes_detallados": faltantes_detallados,
        "detalle": detalle,
    }


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

    # Normalizar departamentos del cliente para comparación robusta.
    deptos_cliente_upper = [d.upper() for d in deptos_cliente]
    match_departamento = any(d in depto_proceso for d in deptos_cliente_upper)
    match_unspsc = any(unspsc_proceso.startswith(u[:4]) for u in unspsc_cliente)
    match_presupuesto = (
        proceso.presupuesto >= cliente.presupuesto_min
        and (cliente.presupuesto_max == 0 or proceso.presupuesto <= cliente.presupuesto_max)
    )
    vigente = _vigente(proceso.fecha_cierre)
    dias_restantes = _dias_restantes(proceso.fecha_cierre)

    documentos_subidos_raw = db.query(Documento).filter(Documento.cliente_id == cliente_id).all()
    documentos_subidos = sorted({d.nombre for d in documentos_subidos_raw})

    core_documentos = cargar_core_documentos()

    # Documentos que el cliente ha marcado como "no aplica" para su perfil.
    documentos_no_aplica = _parse_json_lista(cliente.documentos_no_aplica)

    # Enriquecer el Core con el estado no_aplica por cliente antes de devolverlo.
    core_documentos_con_estado: dict[str, list[dict[str, Any]]] = {}
    for categoria, docs in core_documentos.items():
        core_documentos_con_estado[categoria] = [
            {**doc, "no_aplica": doc.get("id") in documentos_no_aplica} for doc in docs
        ]

    docs_requeridos_core = _documentos_requeridos_core(core_documentos_con_estado)

    def _es_documento_experiencia(doc: dict[str, Any]) -> bool:
        texto = " ".join([doc.get("nombre", ""), *doc.get("keywords", [])]).lower()
        return any(p in texto for p in [
            "experiencia", "matriz 1", "formato 3", "certificado de experiencia",
        ])

    def _es_documento_financiero(doc: dict[str, Any]) -> bool:
        texto = " ".join([doc.get("nombre", ""), *doc.get("keywords", [])]).lower()
        return any(p in texto for p in [
            "estados financieros", "capacidad financiera", "matriz 2", "indicadores financieros",
        ])

    tiene_experiencia_acreditada = (perfil.get("experiencia_cantidad") or 0) > 0
    tiene_indicadores_financieros = bool(perfil.get("indicadores_financieros"))

    if docs_requeridos_core:
        docs_requeridos_core = [
            d for d in docs_requeridos_core if d.get("id") not in documentos_no_aplica
        ]
        documentos_requeridos = [d["nombre"] for d in docs_requeridos_core]
        documentos_faltantes = []
        for d in docs_requeridos_core:
            if _documento_cubre_requerido(d, documentos_subidos):
                continue
            # Si ya hay experiencia acreditada, no exigir documentos de experiencia adicionales.
            if _es_documento_experiencia(d) and tiene_experiencia_acreditada:
                continue
            # Si ya hay indicadores financieros declarados, no exigir documentos financieros adicionales.
            if _es_documento_financiero(d) and tiene_indicadores_financieros:
                continue
            documentos_faltantes.append(d["nombre"])
    else:
        documentos_requeridos = DOCUMENTOS_REQUERIDOS
        documentos_faltantes = [
            d for d in DOCUMENTOS_REQUERIDOS if not _documento_cubre_requerido({"nombre": d, "keywords": []}, documentos_subidos)
        ]

    # Score ponderado base (sin pliego)
    score_base = 0
    score_base += 25 if match_departamento else 0
    score_base += 25 if match_unspsc else 0
    score_base += 20 if match_presupuesto else 0
    score_base += 10 if vigente else 0
    score_base += 20 if not documentos_faltantes else max(0, 20 - int(len(documentos_faltantes) * 2.5))

    # Recuperar análisis existente (se usa para pliego y para preservar detalles previos).
    existente = (
        db.query(AnalisisProceso)
        .filter(AnalisisProceso.proceso_id == proceso_id, AnalisisProceso.cliente_id == cliente_id)
        .first()
    )

    # Integrar análisis del pliego si existe.
    analisis_pliego_existente = existente

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
    faltantes_detallados_estructurados = eval_estructurada.get("faltantes_detallados", [])

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

    faltantes: list[str] = []
    faltantes_detallados: list[dict[str, Any]] = []

    if not match_departamento:
        faltantes.append("El departamento del proceso no coincide con los departamentos del cliente")
        faltantes_detallados.append({
            "categoria": "ubicacion",
            "item": "Departamento compatible",
            "requerido": depto_proceso.title(),
            "actual": ", ".join(deptos_cliente).title() or "No definido",
            "diferencia": "El proceso está en un departamento no cubierto por el cliente",
            "score": 0,
        })
    if not match_unspsc:
        faltantes.append("El código UNSPSC del proceso no coincide con los rubros del cliente")
        faltantes_detallados.append({
            "categoria": "rubro",
            "item": "UNSPSC compatible",
            "requerido": unspsc_proceso,
            "actual": ", ".join(unspsc_cliente).upper() or "No definido",
            "diferencia": "El código UNSPSC del proceso no está en el perfil del cliente",
            "score": 0,
        })
    if not match_presupuesto:
        faltantes.append("El presupuesto del proceso está fuera del rango del cliente")
        rango = f"${cliente.presupuesto_min:,.0f}"
        if cliente.presupuesto_max and cliente.presupuesto_max > 0:
            rango += f" - ${cliente.presupuesto_max:,.0f}"
        else:
            rango += " en adelante"
        faltantes_detallados.append({
            "categoria": "presupuesto",
            "item": "Presupuesto dentro del rango",
            "requerido": rango + " COP",
            "actual": f"${proceso.presupuesto:,.0f} COP",
            "diferencia": "El presupuesto del proceso está fuera del rango configurado",
            "score": 0,
        })
    if not vigente:
        faltantes.append("El proceso ya cerró o vence en menos de 24 horas")
        faltantes_detallados.append({
            "categoria": "vigencia",
            "item": "Proceso vigente",
            "requerido": "Abierto",
            "actual": "Cerrado o vence en menos de 24 horas",
            "diferencia": "No hay tiempo para preparar oferta",
            "score": 0,
        })
    if documentos_faltantes:
        faltantes.append(f"Documentos faltantes: {', '.join(documentos_faltantes)}")
        for doc in documentos_faltantes:
            faltantes_detallados.append({
                "categoria": "documento",
                "item": doc,
                "requerido": "Requerido",
                "actual": "No subido",
                "diferencia": "Falta subir este documento al perfil",
                "score": 0,
            })

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
    faltantes_detallados.extend(faltantes_detallados_estructurados)

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

    # Preservar detalles previos (por ejemplo, metadatos del pliego guardados por analizar_pliego)
    detalle: dict[str, Any] = {}
    if existente and existente.detalle:
        try:
            detalle = json.loads(existente.detalle)
        except Exception:
            detalle = {}

    detalle.update({
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
        "documentos_requeridos": documentos_requeridos,
        "documentos_faltantes": documentos_faltantes,
        "documentos_no_aplica": documentos_no_aplica,
        "documentos_base_fijos": core_documentos_con_estado,
        "score_base": score_base,
        "score_pliego": score_pliego,
        "score_pliego_documental": score_pliego_documental,
        "score_pliego_estructurado": score_pliego_estructurado,
        "evaluacion_requisitos_estructurados": eval_estructurada.get("detalle", {}),
        "requisitos_estructurados_faltantes": requisitos_estructurados_faltantes,
        "requisitos_pliego_faltantes": requisitos_pliego_faltantes,
        "faltantes_detallados": faltantes_detallados,
    })

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

