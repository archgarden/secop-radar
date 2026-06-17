import json
import logging
import os
import time
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

from models import Cliente, LogEjecucion, Proceso, ProcesoCliente

load_dotenv()

SOCRATA_URL = "https://www.datos.gov.co/resource/p6dx-8zbt.json"
SOCRATA_CONTRATOS_URL = "https://www.datos.gov.co/resource/jbjy-vk9h.json"
SOCRATA_APP_TOKEN = os.getenv("SOCRATA_APP_TOKEN", "")
SOCRATA_CLIENT_ID = os.getenv("SOCRATA_CLIENT_ID", "")
SOCRATA_CLIENT_SECRET = os.getenv("SOCRATA_CLIENT_SECRET", "")

MAX_REINTENTOS = 3
ESPERA_REINTENTO_S = 5
LIMITE_REGISTROS = 100

BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = BASE_DIR.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
LOG_FILE = LOG_DIR / "radar.log"

logger = logging.getLogger("radar")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(sh)
    logger.addHandler(fh)
    logger.propagate = False


def _parse_fecha(valor: Any) -> datetime | None:
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace("Z", ""))
    except (ValueError, TypeError):
        return None


def _parse_presupuesto(valor: Any) -> int:
    if valor in (None, ""):
        return 0
    try:
        return int(float(valor))
    except (ValueError, TypeError):
        return 0


def _parse_json_lista(texto: str | None) -> list[str]:
    if not texto:
        return []
    try:
        data = json.loads(texto)
        return [str(x) for x in data] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _construir_where(
    departamentos: list[str], unspsc: list[str], pmin: int, pmax: int
) -> str:
    filtros: list[str] = []
    if departamentos:
        # Socrata no soporta upper(); usamos OR con valores exactos y LIKE para Bogotá
        dep_clauses: list[str] = []
        for d in departamentos:
            d_lower = d.lower()
            if "bogot" in d_lower:
                dep_clauses.append("departamento_entidad like '%Bogot%'")
            else:
                dep_clauses.append(f"departamento_entidad='{d.title()}'")
        filtros.append("(" + " OR ".join(dep_clauses) + ")")
    if unspsc:
        # Los códigos en SECOP II tienen prefijo "V1." y usan los 4 primeros dígitos
        # Ej: 72140000 → like 'V1.7214%'
        unspsc_clauses = [
            f"codigo_principal_de_categoria like 'V1.{c[:4]}%'" for c in unspsc
        ]
        filtros.append("(" + " OR ".join(unspsc_clauses) + ")")
    if pmax > 0:
        filtros.append(f"precio_base between {pmin} and {pmax}")
    return " AND ".join(filtros)


def _socrata_headers() -> dict[str, str]:
    """Devuelve headers para Socrata, incluyendo App Token si existe."""
    headers: dict[str, str] = {"Accept": "application/json"}
    if SOCRATA_APP_TOKEN:
        headers["X-App-Token"] = SOCRATA_APP_TOKEN
    return headers


def _consultar_socrata(where: str) -> list[dict]:
    # Se construye la query string manualmente porque algunas versiones de
    # requests/httpx interpretan mal las claves que empiezan con '$'.
    query_parts: list[str] = [
        f"%24limit={LIMITE_REGISTROS}",
        "%24order=" + urllib.parse.quote("fecha_de_publicacion_del DESC", safe=""),
    ]
    if where:
        query_parts.append("%24where=" + urllib.parse.quote(where, safe=""))
    url = f"{SOCRATA_URL}?{'&'.join(query_parts)}"
    headers = _socrata_headers()

    ultimo_error: Exception | None = None
    for intento in range(1, MAX_REINTENTOS + 1):
        try:
            r = requests.get(url, headers=headers, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as exc:
            ultimo_error = exc
            logger.warning(
                "Intento %d/%d falló al consultar Socrata: %s",
                intento,
                MAX_REINTENTOS,
                exc,
            )
            if intento < MAX_REINTENTOS:
                time.sleep(ESPERA_REINTENTO_S)

    raise RuntimeError(
        f"Socrata no respondió tras {MAX_REINTENTOS} reintentos: {ultimo_error}"
    )


def _calcular_score(
    proceso: Proceso,
    departamentos: list[str],
    unspsc: list[str],
    pmin: int,
    pmax: int,
) -> int:
    score = 0
    if proceso.departamento and any(
        d.lower() in proceso.departamento.lower() or proceso.departamento.lower() in d.lower()
        for d in departamentos
    ):
        score += 25
    if proceso.unspsc_code and any(
        proceso.unspsc_code.startswith(f"V1.{c[:4]}") for c in unspsc
    ):
        score += 25
    if pmax > 0 and proceso.presupuesto and pmin <= proceso.presupuesto <= pmax:
        score += 25
    if proceso.fecha_cierre and proceso.fecha_cierre > datetime.utcnow() + timedelta(
        days=15
    ):
        score += 25
    return score


def _registro_a_proceso(reg: dict) -> Proceso | None:
    numero = (
        reg.get("id_del_proceso")
        or reg.get("referencia_del_proceso")
        or reg.get("numero_de_proceso")
    )
    if not numero:
        return None

    url = reg.get("urlproceso")
    if isinstance(url, dict):
        url = url.get("url")

    objeto = (
        reg.get("descripcion_del_procedimiento")
        or reg.get("descripci_n_del_procedimiento")
        or ""
    )
    fecha_cierre = _parse_fecha(
        reg.get("fecha_de_recepcion_de_respuestas") or reg.get("fecha_de_cierre")
    )

    return Proceso(
        numero_proceso=str(numero),
        entidad=reg.get("entidad", "") or reg.get("nombre_entidad", "") or "",
        objeto=objeto,
        presupuesto=_parse_presupuesto(reg.get("precio_base")),
        fecha_cierre=fecha_cierre,
        url_documento=url,
        departamento=reg.get("departamento_entidad"),
        unspsc_code=reg.get("codigo_principal_de_categoria"),
        fecha_publicacion=_parse_fecha(reg.get("fecha_de_publicacion_del")),
        tiene_adenda=bool(reg.get("adendas")),
    )


def correr_radar(cliente_id: int, db: Session) -> list[Proceso]:
    logger.info("Arrancando radar para cliente_id=%s", cliente_id)

    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        logger.error("Cliente %s no existe", cliente_id)
        raise ValueError(f"Cliente {cliente_id} no encontrado")

    departamentos = _parse_json_lista(cliente.departamentos)
    unspsc = _parse_json_lista(cliente.unspsc_codes)
    pmin = cliente.presupuesto_min or 0
    pmax = cliente.presupuesto_max or 0

    where = _construir_where(departamentos, unspsc, pmin, pmax)
    logger.info(
        "Cliente=%s deps=%s unspsc=%s presupuesto=[%s,%s] where=%s",
        cliente.nombre,
        departamentos,
        unspsc,
        pmin,
        pmax,
        where or "(sin filtros)",
    )

    nuevos: list[Proceso] = []
    encontrados = 0
    error_msg: str | None = None

    try:
        registros = _consultar_socrata(where)
        encontrados = len(registros)
        logger.info("Socrata devolvió %d registros", encontrados)

        for reg in registros:
            candidato = _registro_a_proceso(reg)
            if candidato is None:
                continue

            existente = (
                db.query(Proceso)
                .filter(Proceso.numero_proceso == candidato.numero_proceso)
                .first()
            )
            if existente:
                proceso = existente
            else:
                db.add(candidato)
                db.flush()
                proceso = candidato
                nuevos.append(proceso)
                logger.info(
                    "Proceso nuevo detectado: %s (%s)",
                    proceso.numero_proceso,
                    proceso.entidad,
                )

            ya_matched = (
                db.query(ProcesoCliente)
                .filter(
                    ProcesoCliente.proceso_id == proceso.id,
                    ProcesoCliente.cliente_id == cliente.id,
                )
                .first()
            )
            if not ya_matched:
                score = _calcular_score(proceso, departamentos, unspsc, pmin, pmax)
                db.add(
                    ProcesoCliente(
                        proceso_id=proceso.id,
                        cliente_id=cliente.id,
                        score_match=score,
                        alertado=False,
                    )
                )

        db.commit()
        logger.info(
            "Radar terminó OK: %d nuevos de %d encontrados", len(nuevos), encontrados
        )

    except Exception as exc:
        db.rollback()
        error_msg = str(exc)
        logger.exception("Radar falló para cliente_id=%s: %s", cliente_id, exc)

    db.add(
        LogEjecucion(
            cliente_id=cliente.id,
            procesos_encontrados=encontrados,
            procesos_nuevos=len(nuevos),
            error=error_msg,
        )
    )
    db.commit()

    return nuevos


def consultar_contratos_similares(
    unspsc_codes: list[str],
    departamentos: list[str],
    limit: int = 25,
) -> list[dict]:
    """Consulta contratos históricos adjudicados (jbjy-vk9h) filtrados por
    UNSPSC y departamento. Devuelve datos de inteligencia de mercado:
    quién ganó, por cuánto, en qué modalidad.
    """
    unspsc_prefixes = [c[:4] for c in unspsc_codes]

    # Construir WHERE para SoQL
    conditions: list[str] = []

    if unspsc_prefixes:
        unspsc_clauses = [
            f"codigo_de_categoria_principal like 'V1.{p}%'"
            for p in unspsc_prefixes
        ]
        conditions.append("(" + " OR ".join(unspsc_clauses) + ")")

    if departamentos:
        dep_clauses: list[str] = []
        for d in departamentos:
            safe = d.replace("'", "''")
            dep_clauses.append(f"upper(departamento) like upper('%{safe}%')")
        conditions.append("(" + " OR ".join(dep_clauses) + ")")

    where = " AND ".join(conditions) if conditions else ""

    query_parts: list[str] = [
        f"%24limit={limit}",
        "%24order=" + urllib.parse.quote("fecha_de_firma DESC", safe=""),
        "%24select=" + urllib.parse.quote(
            "nombre_entidad, proveedor_adjudicado, valor_del_contrato, "
            "codigo_de_categoria_principal, descripcion_del_proceso, "
            "modalidad_de_contratacion, estado_contrato, "
            "fecha_de_firma, departamento, urlproceso",
            safe="",
        ),
    ]
    if where:
        query_parts.append("%24where=" + urllib.parse.quote(where, safe=""))
    url = f"{SOCRATA_CONTRATOS_URL}?{'&'.join(query_parts)}"
    headers = _socrata_headers()

    ultimo_error: Exception | None = None
    for intento in range(1, MAX_REINTENTOS + 1):
        try:
            r = requests.get(
                url,
                headers=headers,
                timeout=30,
            )
            r.raise_for_status()
            data: list[dict] = r.json()
            # Limpiar urlproceso (viene como objeto {url: ...})
            for item in data:
                url = item.get("urlproceso")
                if isinstance(url, dict):
                    item["urlproceso"] = url.get("url", "")
            return data
        except requests.RequestException as exc:
            ultimo_error = exc
            logger.warning(
                "Intento %d/%d falló al consultar contratos: %s",
                intento, MAX_REINTENTOS, exc,
            )
            if intento < MAX_REINTENTOS:
                time.sleep(ESPERA_REINTENTO_S)

    raise RuntimeError(
        f"Consulta de contratos falló tras {MAX_REINTENTOS} reintentos: {ultimo_error}"
    )
