import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine, get_db
from models import Cliente, LogEjecucion, Proceso, ProcesoCliente
from notificaciones import enviar_alerta_nuevos_procesos
from radar import consultar_contratos_similares, correr_radar

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
    unspsc_codes: list[str] = []
    presupuesto_min: int = 0
    presupuesto_max: int = 0


class ClienteOut(BaseModel):
    id: int
    nombre: str
    email: str
    departamentos: str
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
            )
        )
    return resultado


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
