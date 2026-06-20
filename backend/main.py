import json
import logging
import os
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine, get_db
from models import AnalisisProceso, Cliente, Documento, LogEjecucion, Proceso, ProcesoCliente
from preseleccion import analizar_preseleccion
from notificaciones import enviar_alerta_nuevos_procesos
from radar import consultar_contratos_similares, correr_radar
from analizador_pliego import analizar_pliego
from extraccion.procesador import procesar_documento, consolidar_perfil
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
    allow_origins=["http://localhost:3000"],
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


class ClienteOut(BaseModel):
    id: int
    nombre: str
    email: str
    departamentos: str
    municipio: str | None
    unspsc_codes: str
    presupuesto_min: int
    presupuesto_max: int
    activo: bool

    class Config:
        from_attributes = True


class ProcesoOut(BaseModel):
    id: int
    numero_proceso: str
    entidad: str
    objeto: str
    presupuesto: int
    departamento: str | None
    unspsc_code: str | None
    url_documento: str | None
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


# ---------- Rutas ----------

@app.get("/")
def root():
    return {"status": "SECOP Radar corriendo", "version": "1.0"}


@app.get("/clientes", response_model=list[ClienteOut])
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(Cliente).filter(Cliente.activo == True).all()


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
        resultado.append(
            ProcesoOut(
                id=proceso.id,
                numero_proceso=proceso.numero_proceso,
                entidad=proceso.entidad,
                objeto=proceso.objeto,
                presupuesto=proceso.presupuesto,
                departamento=proceso.departamento,
                unspsc_code=proceso.unspsc_code,
                url_documento=proceso.url_documento,
                tiene_adenda=proceso.tiene_adenda,
                score_match=score,
                fecha_cierre=proceso.fecha_cierre.isoformat() if proceso.fecha_cierre else None,
                fecha_publicacion=proceso.fecha_publicacion.isoformat() if proceso.fecha_publicacion else None,
            )
        )
    return resultado


@app.get("/procesos/{proceso_id}", response_model=ProcesoOut)
def obtener_proceso(proceso_id: int, db: Session = Depends(get_db)):
    proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
    if not proceso:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    return ProcesoOut(
        id=proceso.id,
        numero_proceso=proceso.numero_proceso,
        entidad=proceso.entidad,
        objeto=proceso.objeto,
        presupuesto=proceso.presupuesto,
        departamento=proceso.departamento,
        unspsc_code=proceso.unspsc_code,
        url_documento=proceso.url_documento,
        tiene_adenda=proceso.tiene_adenda,
        score_match=0,
        fecha_cierre=proceso.fecha_cierre.isoformat() if proceso.fecha_cierre else None,
        fecha_publicacion=proceso.fecha_publicacion.isoformat() if proceso.fecha_publicacion else None,
    )


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
        procesar_documento(doc, db)
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
