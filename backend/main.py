import json
import logging
import os
import shutil
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine, get_db
from models import AnalisisProceso, Cliente, Configuracion, Documento, DocumentoProceso, LogEjecucion, Proceso, ProcesoCliente
from preseleccion import analizar_preseleccion, cargar_core_documentos
from notificaciones import enviar_alerta_nuevos_procesos
from radar import consultar_contratos_similares, correr_radar
from analizador_pliego import analizar_pliego
from secop_scraper import descargar_documentos_proceso
from extraccion.procesador import actualizar_cliente_desde_rup, procesar_documento, consolidar_perfil
from unspsc import describir_unspsc, limpiar_unspsc
from calculadoras import (
    calcular_capacidad_financiera,
    calcular_capacidad_residual,
    calcular_precio_artificialmente_bajo,
    clasificar_mipyme,
    consolidar_experiencia_smmlv,
)

logger = logging.getLogger("main")

scheduler = BackgroundScheduler()


def _job_radar(cliente_id: int) -> None:
    db = SessionLocal()
    try:
        nuevos = correr_radar(cliente_id, db)
        if nuevos:
            cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
            if cliente:
                matches = (
                    db.query(ProcesoCliente)
                    .filter(
                        ProcesoCliente.cliente_id == cliente_id,
                        ProcesoCliente.proceso_id.in_([p.id for p in nuevos]),
                    )
                    .all()
                )
                enviar_alerta_nuevos_procesos(cliente, matches)
    except Exception as exc:
        logger.exception("Error en job scheduler cliente_id=%s: %s", cliente_id, exc)
    finally:
        db.close()


def _programar_clientes() -> None:
    db = SessionLocal()
    try:
        clientes = db.query(Cliente).filter(Cliente.activo == True).all()
        for c in clientes:
            job_id = f"radar_cliente_{c.id}"
            if not scheduler.get_job(job_id):
                scheduler.add_job(
                    _job_radar,
                    "interval",
                    hours=4,
                    args=[c.id],
                    id=job_id,
                )
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _programar_clientes()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="SECOP Radar", version="1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Schemas ----------

class ClienteCreate(BaseModel):
    nombre: str
    email: str
    departamentos: list[str] = []
    municipio: str | None = None
    unspsc_codes: list[str] = []
    presupuesto_min: int = 0
    presupuesto_max: int = 0


class ClienteUpdate(BaseModel):
    nombre: str | None = None
    email: str | None = None
    departamentos: list[str] | None = None
    municipio: str | None = None
    unspsc_codes: list[str] | None = None
    presupuesto_min: int | None = None
    presupuesto_max: int | None = None
    patrimonio_liquido: int | None = None
    ingresos_anuales: int | None = None
    experiencia_valor_total: int | None = None
    experiencia_cantidad: int | None = None
    indicadores_financieros: list[str] | None = None
    capacidad_residual_pct: float | None = None
    contratos_vigentes_valor: int | None = None
    documentos_no_aplica: list[str] | None = None


class ClienteOut(BaseModel):
    id: int
    nombre: str
    email: str
    departamentos: str
    municipio: str | None
    unspsc_codes: str
    presupuesto_min: int
    presupuesto_max: int
    patrimonio_liquido: int | None
    ingresos_anuales: int | None
    experiencia_valor_total: int | None
    experiencia_cantidad: int | None
    indicadores_financieros: str | None
    capacidad_residual_pct: float | None
    contratos_vigentes_valor: int | None
    documentos_no_aplica: str
    activo: bool

    class Config:
        from_attributes = True


class ProcesoOut(BaseModel):
    id: int
    numero_proceso: str
    referencia_proceso: str | None
    titulo: str | None
    entidad: str
    objeto: str
    presupuesto: int
    departamento: str | None
    unspsc_code: str | None
    unspsc_code_clean: str | None
    unspsc_descripcion: str | None
    unspsc_codes: list[str]
    unspsc_codes_detalle: list[dict[str, str]]
    url_documento: str | None
    estado_proceso: str | None
    modalidad: str | None
    fase: str | None
    tipo_contrato: str | None
    subtipo_contrato: str | None
    duracion: int | None
    unidad_duracion: str | None
    tiene_adenda: bool
    score_match: int
    fecha_cierre: str | None
    fecha_publicacion: str | None

    class Config:
        from_attributes = True


class LogOut(BaseModel):
    id: int
    cliente_id: int
    procesos_encontrados: int
    procesos_nuevos: int
    error: str | None

    class Config:
        from_attributes = True


def _parse_json_lista(texto: str | None) -> list[str]:
    if not texto:
        return []
    try:
        data = json.loads(texto)
        return [str(x) for x in data] if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _proceso_to_out(proceso: Proceso, score: int = 0) -> ProcesoOut:
    return ProcesoOut(
        id=proceso.id,
        numero_proceso=proceso.numero_proceso,
        referencia_proceso=proceso.referencia_proceso,
        titulo=proceso.titulo,
        entidad=proceso.entidad,
        objeto=proceso.objeto,
        presupuesto=proceso.presupuesto,
        departamento=proceso.departamento,
        unspsc_code=proceso.unspsc_code,
        unspsc_code_clean=limpiar_unspsc(proceso.unspsc_code),
        unspsc_descripcion=describir_unspsc(proceso.unspsc_code),
        unspsc_codes=_parse_json_lista(proceso.unspsc_codes),
        unspsc_codes_detalle=[
            {"codigo": c, "descripcion": describir_unspsc(c) or "Categoría no clasificada"}
            for c in _parse_json_lista(proceso.unspsc_codes)
        ],
        url_documento=proceso.url_documento,
        estado_proceso=proceso.estado_proceso,
        modalidad=proceso.modalidad,
        fase=proceso.fase,
        tipo_contrato=proceso.tipo_contrato,
        subtipo_contrato=proceso.subtipo_contrato,
        duracion=proceso.duracion,
        unidad_duracion=proceso.unidad_duracion,
        tiene_adenda=proceso.tiene_adenda,
        score_match=score,
        fecha_cierre=proceso.fecha_cierre.isoformat() if proceso.fecha_cierre else None,
        fecha_publicacion=proceso.fecha_publicacion.isoformat() if proceso.fecha_publicacion else None,
    )


# ---------- Rutas ----------

@app.get("/")
def root():
    return {"status": "SECOP Radar corriendo", "version": "1.0"}


@app.get("/clientes", response_model=list[ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(Cliente).filter(Cliente.activo == True).all()


class ClienteActivoOut(BaseModel):
    cliente_id: int | None


class ClienteActivoUpdate(BaseModel):
    cliente_id: int | None


@app.get("/clientes/activo", response_model=ClienteActivoOut)
def obtener_cliente_activo(db: Session = Depends(get_db)):
    cfg = db.query(Configuracion).filter(Configuracion.clave == "cliente_activo_id").first()
    if not cfg or not cfg.valor:
        return {"cliente_id": None}
    try:
        return {"cliente_id": int(cfg.valor)}
    except ValueError:
        return {"cliente_id": None}


@app.put("/clientes/activo", response_model=ClienteActivoOut)
def establecer_cliente_activo(payload: ClienteActivoUpdate, db: Session = Depends(get_db)):
    if payload.cliente_id is not None:
        cliente = db.query(Cliente).filter(Cliente.id == payload.cliente_id, Cliente.activo == True).first()
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado o inactivo")

    cfg = db.query(Configuracion).filter(Configuracion.clave == "cliente_activo_id").first()
    if cfg:
        cfg.valor = str(payload.cliente_id) if payload.cliente_id is not None else None
    else:
        cfg = Configuracion(clave="cliente_activo_id", valor=str(payload.cliente_id) if payload.cliente_id is not None else None)
        db.add(cfg)
    db.commit()
    return {"cliente_id": payload.cliente_id}


@app.post("/clientes", response_model=ClienteOut, status_code=201)
def crear_cliente(payload: ClienteCreate, db: Session = Depends(get_db)):
    import json

    cliente = Cliente(
        nombre=payload.nombre,
        email=payload.email,
        departamentos=json.dumps(payload.departamentos),
        municipio=payload.municipio,
        unspsc_codes=json.dumps(payload.unspsc_codes),
        presupuesto_min=payload.presupuesto_min,
        presupuesto_max=payload.presupuesto_max,
    )
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    job_id = f"radar_cliente_{cliente.id}"
    if not scheduler.get_job(job_id):
        scheduler.add_job(
            _job_radar,
            "interval",
            hours=4,
            args=[cliente.id],
            id=job_id,
        )

    # Radar inicial en background para que el cliente vea recomendaciones
    # inmediatamente después de registrarse, sin esperar al scheduler.
    def _radar_inicial() -> None:
        db2 = SessionLocal()
        try:
            correr_radar(cliente.id, db2)
        except Exception as exc:
            logger.exception("Radar inicial falló para cliente_id=%s: %s", cliente.id, exc)
        finally:
            db2.close()

    threading.Thread(target=_radar_inicial, daemon=True).start()

    return cliente


@app.put("/clientes/{cliente_id}", response_model=ClienteOut)
def actualizar_cliente(cliente_id: int, payload: ClienteUpdate, db: Session = Depends(get_db)):
    import json

    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    campos_simples = [
        "nombre", "email", "municipio", "presupuesto_min", "presupuesto_max",
        "patrimonio_liquido", "ingresos_anuales", "experiencia_valor_total",
        "experiencia_cantidad", "capacidad_residual_pct", "contratos_vigentes_valor",
    ]
    for campo in campos_simples:
        valor = getattr(payload, campo, None)
        if valor is not None:
            setattr(cliente, campo, valor)

    if payload.departamentos is not None:
        cliente.departamentos = json.dumps(payload.departamentos)
    if payload.unspsc_codes is not None:
        cliente.unspsc_codes = json.dumps(payload.unspsc_codes)
    if payload.indicadores_financieros is not None:
        cliente.indicadores_financieros = json.dumps(payload.indicadores_financieros)
    if payload.documentos_no_aplica is not None:
        cliente.documentos_no_aplica = json.dumps(payload.documentos_no_aplica)

    db.commit()
    db.refresh(cliente)
    return cliente


@app.get("/clientes/{cliente_id}/procesos", response_model=list[ProcesoOut])
def procesos_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    rows = (
        db.query(Proceso, ProcesoCliente.score_match)
        .join(ProcesoCliente, ProcesoCliente.proceso_id == Proceso.id)
        .filter(ProcesoCliente.cliente_id == cliente_id)
        .order_by(ProcesoCliente.score_match.desc())
        .all()
    )

    resultado = []
    for proceso, score in rows:
        resultado.append(_proceso_to_out(proceso, score))
    return resultado


@app.get("/procesos/{proceso_id}", response_model=ProcesoOut)
def obtener_proceso(proceso_id: int, db: Session = Depends(get_db)):
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    return _proceso_to_out(proceso, 0)


@app.post("/radar/correr/{cliente_id}")
def correr_radar_manual(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    nuevos = correr_radar(cliente_id, db)

    alerta_enviada = False
    if nuevos:
        matches = (
            db.query(ProcesoCliente)
            .filter(
                ProcesoCliente.cliente_id == cliente_id,
                ProcesoCliente.proceso_id.in_([p.id for p in nuevos]),
            )
            .all()
        )
        enviar_alerta_nuevos_procesos(cliente, matches)
        alerta_enviada = True

    return {
        "cliente_id": cliente_id,
        "procesos_nuevos": len(nuevos),
        "alerta_enviada": alerta_enviada,
    }


@app.get("/log", response_model=list[LogOut])
def listar_logs(db: Session = Depends(get_db)):
    return (
        db.query(LogEjecucion)
        .order_by(LogEjecucion.fecha.desc())
        .limit(50)
        .all()
    )


@app.get("/clientes/{cliente_id}/contratos-similares")
def contratos_similares(cliente_id: int, db: Session = Depends(get_db)):
    import json

    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    departamentos = json.loads(cliente.departamentos or "[]")
    unspsc_codes = json.loads(cliente.unspsc_codes or "[]")

    try:
        return consultar_contratos_similares(unspsc_codes, departamentos)
    except Exception as exc:
        logger.exception("Error consultando contratos similares: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))


# ---------- Documentos ----------

_PROJECT_DIR = Path(__file__).resolve().parent.parent
_STORAGE_ENV = os.getenv("STORAGE_PATH", "../storage/pliegos")
if Path(_STORAGE_ENV).is_absolute():
    STORAGE_PATH = Path(_STORAGE_ENV)
else:
    STORAGE_PATH = (_PROJECT_DIR / _STORAGE_ENV).resolve()
DOC_DIR = STORAGE_PATH.parent / "documentos"


class DocumentoOut(BaseModel):
    id: int
    cliente_id: int
    nombre: str
    filename: str
    estado: str
    extraccion: dict | None = None
    fecha_subida: str

    class Config:
        from_attributes = True


@app.get("/clientes/{cliente_id}/documentos", response_model=list[DocumentoOut])
def listar_documentos(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    import json

    docs = db.query(Documento).filter(Documento.cliente_id == cliente_id).all()
    resultado = []
    for d in docs:
        extraccion = None
        if d.extraccion:
            try:
                extraccion = json.loads(d.extraccion)
            except json.JSONDecodeError:
                extraccion = None
        resultado.append(
            DocumentoOut(
                id=d.id,
                cliente_id=d.cliente_id,
                nombre=d.nombre,
                filename=d.filename,
                estado=d.estado,
                extraccion=extraccion,
                fecha_subida=d.fecha_subida.isoformat(),
            )
        )
    return resultado


@app.post("/clientes/{cliente_id}/documentos", response_model=DocumentoOut, status_code=201)
def subir_documento(
    cliente_id: int,
    nombre: str = Form(...),
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del documento es obligatorio")

    ext = Path(archivo.filename or "documento").suffix
    safe_filename = f"{cliente_id}_{nombre.replace(' ', '_').lower()}{ext}"
    dest_dir = DOC_DIR / str(cliente_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / safe_filename

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(archivo.file, buffer)
    except Exception as exc:
        logger.exception("Error guardando documento: %s", exc)
        raise HTTPException(status_code=500, detail="No se pudo guardar el archivo")
    finally:
        archivo.file.close()

    doc = Documento(
        cliente_id=cliente_id,
        nombre=nombre,
        filename=archivo.filename or safe_filename,
        path=str(dest_path),
        estado="pendiente",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Extraer información del documento de forma asíncrona al upload.
    try:
        resultado = procesar_documento(doc, db)
        # Si el documento es un RUP, actualizar el cliente con los datos extraídos.
        if resultado.get("tipo_documento") == "rup":
            try:
                actualizar_cliente_desde_rup(cliente_id, db)
            except Exception as exc:
                logger.exception("Error actualizando cliente desde RUP %s: %s", doc.id, exc)
    except Exception as exc:
        logger.exception("Error extrayendo información del documento %s: %s", doc.id, exc)

    import json

    extraccion = None
    if doc.extraccion:
        try:
            extraccion = json.loads(doc.extraccion)
        except json.JSONDecodeError:
            extraccion = None

    return DocumentoOut(
        id=doc.id,
        cliente_id=doc.cliente_id,
        nombre=doc.nombre,
        filename=doc.filename,
        estado=doc.estado,
        extraccion=extraccion,
        fecha_subida=doc.fecha_subida.isoformat(),
    )


@app.delete("/documentos/{documento_id}")
def eliminar_documento(documento_id: int, db: Session = Depends(get_db)):
    doc = db.query(Documento).filter(Documento.id == documento_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    try:
        Path(doc.path).unlink(missing_ok=True)
    except Exception as exc:
        logger.exception("Error eliminando archivo: %s", exc)
    db.delete(doc)
    db.commit()
    return {"ok": True}


@app.get("/clientes/{cliente_id}/perfil")
def perfil_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return consolidar_perfil(cliente_id, db)


class DocumentosNoAplicaUpdate(BaseModel):
    documentos_no_aplica: list[str]


def _documentos_cubiertos_por_rup(perfil: dict) -> dict[str, str]:
    """Determina qué documentos del Core están cubiertos por la información del RUP.

    El certificado de Cámara de Comercio / RUP incluye información que sustituye
    parcial o totalmente algunos documentos solicitados en los pliegos.
    """
    cubiertos: dict[str, str] = {}
    if not perfil:
        return cubiertos

    indicadores = perfil.get("indicadores_financieros") or {}
    if isinstance(indicadores, list):
        indicadores = {k: True for k in indicadores}

    fuentes = perfil.get("fuentes") or {}
    experiencia = perfil.get("experiencia") or fuentes.get("experiencia") or []
    if isinstance(experiencia, list):
        contratos_con_liquidacion = [
            e for e in experiencia if isinstance(e, dict) and e.get("acta_liquidacion") == "SI"
        ]
        total_contratos = len(experiencia)
    else:
        contratos_con_liquidacion = []
        total_contratos = 0

    # Estados financieros: activos, pasivos y patrimonio (suficiente para recomendar).
    if perfil.get("patrimonio") and perfil.get("activos") and perfil.get("pasivos"):
        cubiertos["estados_financieros"] = "Dato disponible en RUP para recomendación"

    # Capacidad financiera: índices de liquidez y endeudamiento.
    if indicadores.get("indice_liquidez") is not None or indicadores.get("indice_endeudamiento") is not None:
        cubiertos["capacidad_financiera"] = "Dato disponible en RUP para recomendación"

    # Matriz 2 — Indicadores: múltiples indicadores financieros/organizacionales.
    indicadores_clave = [
        "indice_liquidez",
        "indice_endeudamiento",
        "razon_cobertura_intereses",
        "rentabilidad_patrimonio",
        "rentabilidad_activo",
    ]
    indicadores_encontrados = sum(1 for k in indicadores_clave if indicadores.get(k) is not None)
    if indicadores_encontrados >= 2:
        cubiertos["matriz2_indicadores"] = "Dato disponible en RUP para recomendación"

    # Matriz 1 — Experiencia: experiencia acreditada en el RUP.
    if total_contratos > 0:
        cubiertos["matriz1_experiencia"] = f"{total_contratos} contratos reportados en el RUP para recomendación"

    return cubiertos


@app.get("/clientes/{cliente_id}/core-documentos")
def core_documentos_cliente(cliente_id: int, db: Session = Depends(get_db)):
    """Devuelve el Core de Documentos Base Fijos marcando los documentos
    que el cliente tiene configurados como 'no aplica' o cubiertos por el RUP."""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    no_aplica = _parse_json_lista(cliente.documentos_no_aplica)
    core = cargar_core_documentos()
    if not core:
        raise HTTPException(status_code=503, detail="Core de documentos no disponible")

    # Reglas de negocio: ciertos documentos no aplican según el perfil del cliente.
    # La capacidad residual solo aplica si el cliente tiene contratos en ejecución.
    sin_contratos_vigentes = not (cliente.contratos_vigentes_valor and cliente.contratos_vigentes_valor > 0)

    # Documentos cubiertos por la información del RUP.
    perfil = consolidar_perfil(cliente_id, db)
    cubiertos_por_rup = _documentos_cubiertos_por_rup(perfil)

    resultado = {}
    for categoria, documentos in core.items():
        if categoria in ("version", "fecha_generacion", "fuente", "procesos_analizados", "umbrales", "requisitos_estructurados"):
            resultado[categoria] = documentos
            continue
        resultado[categoria] = []
        for doc in documentos:
            doc_con_estado = dict(doc)
            doc_id = doc.get("id")
            manual_no_aplica = doc_id in no_aplica
            auto_no_aplica = doc_id == "capacidad_residual" and sin_contratos_vigentes
            cubierto_motivo = cubiertos_por_rup.get(doc_id)

            doc_con_estado["no_aplica"] = manual_no_aplica or auto_no_aplica
            doc_con_estado["cubierto_por_rup"] = bool(cubierto_motivo)
            doc_con_estado["cubierto_por_rup_motivo"] = cubierto_motivo

            if auto_no_aplica and not manual_no_aplica:
                doc_con_estado["no_aplica_motivo"] = "Sin contratos vigentes"
                doc_con_estado["frecuencia_label"] = "no aplica"
            elif cubierto_motivo:
                doc_con_estado["frecuencia_label"] = "precargado"
            resultado[categoria].append(doc_con_estado)
    return resultado


@app.put("/clientes/{cliente_id}/documentos-no-aplica")
def actualizar_documentos_no_aplica(
    cliente_id: int,
    payload: DocumentosNoAplicaUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza la lista de documentos del Core marcados como 'no aplica'
    para el cliente. Recibe una lista de IDs de documentos base fijos."""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    # Validar que los IDs existan en el Core
    core = cargar_core_documentos()
    ids_core = set()
    for categoria, documentos in core.items():
        if not isinstance(documentos, list):
            continue
        for doc in documentos:
            ids_core.add(doc.get("id"))

    invalidos = [doc_id for doc_id in payload.documentos_no_aplica if doc_id not in ids_core]
    if invalidos:
        raise HTTPException(
            status_code=400,
            detail=f"Documentos no válidos: {', '.join(invalidos)}",
        )

    cliente.documentos_no_aplica = json.dumps(payload.documentos_no_aplica)
    db.commit()
    db.refresh(cliente)
    return {"cliente_id": cliente_id, "documentos_no_aplica": payload.documentos_no_aplica}


class RecomendacionOut(BaseModel):
    perfil_completo: bool
    departamentos: list[str]
    unspsc: list[dict]
    rango_presupuestal: dict
    modalidad_sugerida: dict | None
    documentos_recomendados: list[str]
    pasos_siguientes: list[str]


@app.get("/clientes/{cliente_id}/recomendaciones", response_model=RecomendacionOut)
def recomendaciones_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    import json

    departamentos = _parse_json_lista(cliente.departamentos)
    unspsc_codes = _parse_json_lista(cliente.unspsc_codes)
    pmin = cliente.presupuesto_min or 0
    pmax = cliente.presupuesto_max or 0

    UNSPSC_INFO = {
        "7214": {"label": "Infraestructura pública", "ejemplos": "vías, puentes, obras civiles"},
        "7212": {"label": "Edificación", "ejemplos": "escuelas, hospitales, vivienda"},
        "7215": {"label": "Mantenimiento y reparaciones", "ejemplos": "mantenimiento de edificios e infraestructura"},
        "8110": {"label": "Servicios de ingeniería y consultoría", "ejemplos": "diseños, interventoría, asesorías"},
        "7213": {"label": "Construcción especializada", "ejemplos": "obras especiales y técnicas"},
        "7210": {"label": "Servicios de construcción", "ejemplos": "servicios generales de obra"},
    }

    unspsc_recs = []
    for code in unspsc_codes:
        prefix = code[:4]
        info = UNSPSC_INFO.get(prefix, {"label": "Categoría UNSPSC", "ejemplos": "procesos relacionados"})
        unspsc_recs.append({
            "codigo": code,
            "label": info["label"],
            "ejemplos": info["ejemplos"],
            "sugerencia": f"Buscar procesos de {info['label'].lower()} ({info['ejemplos']}) en los departamentos seleccionados.",
        })

    modalidad = None
    if pmax > 0:
        modalidad = modalidad_recomendada(pmax)

    docs_base = [
        "RUP vigente (Registro Único de Proponentes)",
        "Estados financieros con corte del año anterior",
        "Certificados de experiencia acreditada",
        "Paz y salvo de parafiscales (SENA, ICBF, Caja de compensación)",
        "Póliza de seriedad de la oferta",
    ]

    if any(u.startswith("721") for u in unspsc_codes):
        docs_base.extend([
            "Certificado de existencia y representación legal",
            "Declaración de renta del último año",
            "Certificado de antecedentes judiciales",
        ])

    if any(u.startswith("8110") for u in unspsc_codes):
        docs_base.extend([
            "Hojas de vida del personal técnico propuesto",
            "Certificados de estudios y experiencia del profesional responsable",
        ])

    pasos = [
        "Completa tu perfil financiero y de experiencia para mejorar el score de pre-selección.",
        "Sube documentos de soporte (RUP, estados financieros, certificados de experiencia).",
        "Revisa las oportunidades que el radar encuentra cada 4 horas.",
        "Analiza el pliego de condiciones antes de presentar propuesta.",
    ]

    if not departamentos:
        pasos.insert(0, "Selecciona al menos un departamento de interés en tu perfil.")
    if not unspsc_codes:
        pasos.insert(0, "Agrega códigos UNSPSC relacionados con tu actividad económica.")

    perfil_completo = bool(
        departamentos and unspsc_codes and (pmax > 0 or pmin > 0)
    )

    return RecomendacionOut(
        perfil_completo=perfil_completo,
        departamentos=departamentos,
        unspsc=unspsc_recs,
        rango_presupuestal={"min": pmin, "max": pmax},
        modalidad_sugerida=modalidad,
        documentos_recomendados=docs_base,
        pasos_siguientes=pasos,
    )


SMMLV = int(os.getenv("SMMLV", "1423500"))

MODALIDADES = [
    (10 * SMMLV, "Contratación directa", "Hasta 10 SMMLV. Proceso ágil sin publicación prolongada."),
    (50 * SMMLV, "Mínima cuantía", "Hasta 50 SMMLV. Proceso simplificado para contratos menores."),
    (400 * SMMLV, "Selección abreviada", "Hasta 400 SMMLV. Proceso intermedio con menor trámite que licitación."),
    (float("inf"), "Licitación pública", "Mayor a 400 SMMLV. Proceso competitivo completo."),
]


@app.get("/modalidad/recomendada/{valor}")
def modalidad_recomendada(valor: int):
    for limite, modalidad, descripcion in MODALIDADES:
        if valor <= limite:
            return {
                "valor": valor,
                "smmlv": SMMLV,
                "modalidad": modalidad,
                "descripcion": descripcion,
            }
    return {
        "valor": valor,
        "smmlv": SMMLV,
        "modalidad": "Licitación pública",
        "descripcion": "Mayor a 400 SMMLV. Proceso competitivo completo.",
    }


# ---------- Pre-selección de procesos ----------


class AnalisisOut(BaseModel):
    id: int
    proceso_id: int
    cliente_id: int
    score_preseleccion: int
    score_pliego: int
    recomendacion: str
    faltantes: list[str]
    riesgos: list[str]
    detalle: dict
    analisis_pliego: dict
    fecha_analisis: str

    class Config:
        from_attributes = True


def _analisis_to_out(analisis: AnalisisProceso) -> AnalisisOut:
    return AnalisisOut(
        id=analisis.id,
        proceso_id=analisis.proceso_id,
        cliente_id=analisis.cliente_id,
        score_preseleccion=analisis.score_preseleccion,
        score_pliego=analisis.score_pliego,
        recomendacion=analisis.recomendacion,
        faltantes=json.loads(analisis.faltantes),
        riesgos=json.loads(analisis.riesgos),
        detalle=json.loads(analisis.detalle),
        analisis_pliego=json.loads(analisis.analisis_pliego),
        fecha_analisis=analisis.fecha_analisis.isoformat(),
    )


@app.post("/procesos/{proceso_id}/preseleccion/{cliente_id}", response_model=AnalisisOut)
def preseleccionar_proceso(proceso_id: int, cliente_id: int, db: Session = Depends(get_db)):
    try:
        analisis = analizar_preseleccion(proceso_id, cliente_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Error en pre-selección: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    return _analisis_to_out(analisis)


@app.get("/procesos/{proceso_id}/preseleccion/{cliente_id}", response_model=AnalisisOut)
def obtener_preseleccion(proceso_id: int, cliente_id: int, db: Session = Depends(get_db)):
    analisis = (
        db.query(AnalisisProceso)
        .filter(AnalisisProceso.proceso_id == proceso_id, AnalisisProceso.cliente_id == cliente_id)
        .first()
    )
    if not analisis:
        raise HTTPException(status_code=404, detail="No hay análisis previo. Ejecute POST primero.")

    return _analisis_to_out(analisis)


@app.get("/core-documentos")
def obtener_core_documentos(categoria: str | None = None):
    """Devuelve el Core de Documentos Base Fijos generado del análisis masivo.

    - categoria: proponente | pliego | calidad. Si no se envía, retorna todas.
    """
    core = cargar_core_documentos()
    if not core:
        raise HTTPException(status_code=503, detail="Core de documentos no disponible")

    if categoria:
        if categoria not in core:
            raise HTTPException(status_code=400, detail=f"Categoría inválida: {categoria}")
        return {"categoria": categoria, "documentos": core[categoria]}

    return core


# ---------- Análisis de pliego ----------


class PliegoOut(BaseModel):
    proceso_id: int
    cliente_id: int
    analisis_id: int
    documento_pliego: str | None
    cantidad_requisitos: int
    cantidad_cumplidos: int
    score_pliego: int
    requisitos: list[dict]
    cumplimiento: list[dict]
    requisitos_estructurados: dict = {}
    resumen_requisitos: list[dict] = []
    error: str | None = None


@app.post("/procesos/{proceso_id}/pliego/{cliente_id}", response_model=PliegoOut)
def analizar_pliego_endpoint(proceso_id: int, cliente_id: int, db: Session = Depends(get_db)):
    try:
        resultado = analizar_pliego(proceso_id, cliente_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("Error analizando pliego: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    return PliegoOut(**resultado)


@app.get("/procesos/{proceso_id}/pliego/{cliente_id}", response_model=PliegoOut)
def obtener_pliego_endpoint(proceso_id: int, cliente_id: int, db: Session = Depends(get_db)):
    analisis = (
        db.query(AnalisisProceso)
        .filter(AnalisisProceso.proceso_id == proceso_id, AnalisisProceso.cliente_id == cliente_id)
        .first()
    )
    if not analisis or not analisis.analisis_pliego:
        raise HTTPException(status_code=404, detail="No hay análisis de pliego previo. Ejecute POST primero.")

    pliego = json.loads(analisis.analisis_pliego)
    detalle = json.loads(analisis.detalle)
    pliego_meta = detalle.get("pliego", {})

    return PliegoOut(
        proceso_id=proceso_id,
        cliente_id=cliente_id,
        analisis_id=analisis.id,
        documento_pliego=pliego_meta.get("documento_pliego_nombre"),
        cantidad_requisitos=pliego_meta.get("cantidad_requisitos", 0),
        cantidad_cumplidos=pliego_meta.get("cantidad_cumplidos", 0),
        score_pliego=analisis.score_pliego,
        requisitos=pliego_meta.get("requisitos", []),
        cumplimiento=pliego.get("cumplimiento", []),
        requisitos_estructurados=pliego.get("requisitos_estructurados", {}),
        resumen_requisitos=pliego.get("resumen_requisitos", []),
    )


# ---------- Calculadoras ----------


class CapacidadFinancieraIn(BaseModel):
    activo_corriente: float
    pasivo_corriente: float
    activo_total: float
    pasivo_total: float
    patrimonio: float
    utilidad_operacional: float
    gastos_intereses: float


@app.post("/calculadoras/capacidad-financiera")
def capacidad_financiera(payload: CapacidadFinancieraIn):
    return calcular_capacidad_financiera(
        activo_corriente=payload.activo_corriente,
        pasivo_corriente=payload.pasivo_corriente,
        activo_total=payload.activo_total,
        pasivo_total=payload.pasivo_total,
        patrimonio=payload.patrimonio,
        utilidad_operacional=payload.utilidad_operacional,
        gastos_intereses=payload.gastos_intereses,
    )


class ContratoVigente(BaseModel):
    valor: float
    plazo_meses: int


class CapacidadResidualIn(BaseModel):
    presupuesto_proceso: float
    plazo_proceso_meses: int
    anticipo_pct: float
    ingresos_operacionales_anuales: float
    contratos_vigentes: list[ContratoVigente] = []


@app.post("/calculadoras/capacidad-residual")
def capacidad_residual(payload: CapacidadResidualIn):
    return calcular_capacidad_residual(
        presupuesto_proceso=payload.presupuesto_proceso,
        plazo_proceso_meses=payload.plazo_proceso_meses,
        anticipo_pct=payload.anticipo_pct,
        ingresos_operacionales_anuales=payload.ingresos_operacionales_anuales,
        contratos_vigentes=[c.model_dump() for c in payload.contratos_vigentes],
    )


class PrecioArtificialmenteBajoIn(BaseModel):
    presupuesto_oficial: float
    ofertas: list[float]
    umbral_pct: float = 70.0


@app.post("/calculadoras/precio-artificialmente-bajo")
def precio_artificialmente_bajo(payload: PrecioArtificialmenteBajoIn):
    return calcular_precio_artificialmente_bajo(
        presupuesto_oficial=payload.presupuesto_oficial,
        ofertas=payload.ofertas,
        umbral_pct=payload.umbral_pct,
    )


class ContratoExperiencia(BaseModel):
    valor: float
    fecha_inicio: str
    fecha_fin: str


class ExperienciaSMMLVIn(BaseModel):
    contratos: list[ContratoExperiencia]
    smmlv: float | None = None


@app.post("/calculadoras/experiencia-smmlv")
def experiencia_smmlv(payload: ExperienciaSMMLVIn):
    return consolidar_experiencia_smmlv(
        contratos=[c.model_dump() for c in payload.contratos],
        smmlv=payload.smmlv,
    )


class MipymeIn(BaseModel):
    sector: str
    empleados: int
    ingresos_anuales: float


@app.post("/calculadoras/mipyme")
def mipyme(payload: MipymeIn):
    try:
        return clasificar_mipyme(
            sector=payload.sector,
            empleados=payload.empleados,
            ingresos_anuales=payload.ingresos_anuales,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------- Descarga de documentos SECOP II ----------


class DocumentoProcesoOut(BaseModel):
    id: int
    proceso_id: int
    nombre: str
    filename: str
    path: str
    url: str | None
    size_bytes: int
    es_pliego: bool
    estado: str
    fecha_descarga: str

    class Config:
        from_attributes = True


@app.post("/procesos/{proceso_id}/descargar-documentos")
def descargar_documentos_endpoint(proceso_id: int, db: Session = Depends(get_db)):
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")

    try:
        resultado = descargar_documentos_proceso(proceso, db)
    except Exception as exc:
        logger.exception("Error descargando documentos: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

    if not resultado.get("ok"):
        raise HTTPException(status_code=502, detail=resultado.get("error"))

    return resultado


@app.get("/procesos/{proceso_id}/documentos", response_model=list[DocumentoProcesoOut])
def listar_documentos_proceso(proceso_id: int, db: Session = Depends(get_db)):
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")

    docs = db.query(DocumentoProceso).filter(DocumentoProceso.proceso_id == proceso_id).all()
    return [
        DocumentoProcesoOut(
            id=d.id,
            proceso_id=d.proceso_id,
            nombre=d.nombre,
            filename=d.filename,
            path=d.path,
            url=d.url,
            size_bytes=d.size_bytes,
            es_pliego=d.es_pliego,
            estado=d.estado,
            fecha_descarga=d.fecha_descarga.isoformat(),
        )
        for d in docs
    ]


@app.get("/documentos-proceso/{documento_id}/download")
def descargar_documento_proceso(documento_id: int, db: Session = Depends(get_db)):
    doc = db.query(DocumentoProceso).filter(DocumentoProceso.id == documento_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    path = Path(doc.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    return FileResponse(
        path,
        filename=doc.filename,
        media_type="application/octet-stream",
    )
