from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, nullable=False)
    departamentos = Column(Text, nullable=False, default="[]")
    unspsc_codes = Column(Text, nullable=False, default="[]")
    presupuesto_min = Column(Integer, nullable=False, default=0)
    presupuesto_max = Column(Integer, nullable=False, default=0)
    activo = Column(Boolean, nullable=False, default=True)
    fecha_creacion = Column(DateTime, nullable=False, default=datetime.utcnow)

    matches = relationship("ProcesoCliente", back_populates="cliente")
    logs = relationship("LogEjecucion", back_populates="cliente")


class Proceso(Base):
    __tablename__ = "procesos"

    id = Column(Integer, primary_key=True, index=True)
    numero_proceso = Column(String, nullable=False, unique=True, index=True)
    entidad = Column(String, nullable=False)
    objeto = Column(Text, nullable=False)
    presupuesto = Column(Integer, nullable=False, default=0)
    fecha_cierre = Column(DateTime, nullable=True)
    url_documento = Column(String, nullable=True)
    departamento = Column(String, nullable=True, index=True)
    unspsc_code = Column(String, nullable=True, index=True)
    fecha_publicacion = Column(DateTime, nullable=True)
    tiene_adenda = Column(Boolean, nullable=False, default=False)
    fecha_detectado = Column(DateTime, nullable=False, default=datetime.utcnow)

    matches = relationship("ProcesoCliente", back_populates="proceso")


class ProcesoCliente(Base):
    __tablename__ = "procesos_clientes"

    id = Column(Integer, primary_key=True, index=True)
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=False)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    score_match = Column(Integer, nullable=False, default=0)
    alertado = Column(Boolean, nullable=False, default=False)
    fecha_match = Column(DateTime, nullable=False, default=datetime.utcnow)

    proceso = relationship("Proceso", back_populates="matches")
    cliente = relationship("Cliente", back_populates="matches")


class LogEjecucion(Base):
    __tablename__ = "logs_ejecucion"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, nullable=False, default=datetime.utcnow)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    procesos_encontrados = Column(Integer, nullable=False, default=0)
    procesos_nuevos = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)

    cliente = relationship("Cliente", back_populates="logs")
