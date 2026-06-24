from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    email = Column(String, nullable=False)
    departamentos = Column(Text, nullable=False, default="[]")
    municipio = Column(String, nullable=True)
    unspsc_codes = Column(Text, nullable=False, default="[]")
    presupuesto_min = Column(Integer, nullable=False, default=0)
    presupuesto_max = Column(Integer, nullable=False, default=0)

    # Datos financieros y de experiencia. Pueden ingresarse manualmente o
    # extraerse de documentos subidos (consolidar_perfil los mezcla).
    patrimonio_liquido = Column(Integer, nullable=True)
    ingresos_anuales = Column(Integer, nullable=True)
    experiencia_valor_total = Column(Integer, nullable=True)
    experiencia_cantidad = Column(Integer, nullable=True)
    indicadores_financieros = Column(Text, nullable=True, default="[]")
    capacidad_residual_pct = Column(Float, nullable=True)
    contratos_vigentes_valor = Column(Integer, nullable=True)

    activo = Column(Boolean, nullable=False, default=True)
    fecha_creacion = Column(DateTime, nullable=False, default=datetime.utcnow)

    matches = relationship("ProcesoCliente", back_populates="cliente")
    logs = relationship("LogEjecucion", back_populates="cliente")
    documentos = relationship("Documento", back_populates="cliente")


class Proceso(Base):
    __tablename__ = "procesos"

    id = Column(Integer, primary_key=True, index=True)
    numero_proceso = Column(String, nullable=False, unique=True, index=True)
    referencia_proceso = Column(String, nullable=True, index=True)
    titulo = Column(String, nullable=True)
    entidad = Column(String, nullable=False)
    objeto = Column(Text, nullable=False)
    presupuesto = Column(Integer, nullable=False, default=0)
    fecha_cierre = Column(DateTime, nullable=True)
    url_documento = Column(String, nullable=True)
    departamento = Column(String, nullable=True, index=True)
    unspsc_code = Column(String, nullable=True, index=True)
    unspsc_codes = Column(Text, nullable=False, default="[]")
    fecha_publicacion = Column(DateTime, nullable=True)
    estado_proceso = Column(String, nullable=True, index=True)
    modalidad = Column(String, nullable=True)
    fase = Column(String, nullable=True)
    tipo_contrato = Column(String, nullable=True)
    subtipo_contrato = Column(String, nullable=True)
    duracion = Column(Integer, nullable=True)
    unidad_duracion = Column(String, nullable=True)
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

    __table_args__ = (
        UniqueConstraint("proceso_id", "cliente_id", name="uq_proceso_cliente"),
    )

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


class Documento(Base):
    __tablename__ = "documentos"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    nombre = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)
    estado = Column(String, nullable=False, default="pendiente")
    extraccion = Column(Text, nullable=True)
    fecha_subida = Column(DateTime, nullable=False, default=datetime.utcnow)

    cliente = relationship("Cliente", back_populates="documentos")


class DocumentoProceso(Base):
    __tablename__ = "documentos_proceso"

    id = Column(Integer, primary_key=True, index=True)
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=False, index=True)
    nombre = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)
    url = Column(String, nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    es_pliego = Column(Boolean, nullable=False, default=False)
    estado = Column(String, nullable=False, default="descargado")
    error = Column(Text, nullable=True)
    fecha_descarga = Column(DateTime, nullable=False, default=datetime.utcnow)

    proceso = relationship("Proceso", backref="documentos")


class AnalisisProceso(Base):
    __tablename__ = "analisis_procesos"

    id = Column(Integer, primary_key=True, index=True)
    proceso_id = Column(Integer, ForeignKey("procesos.id"), nullable=False)
    cliente_id = Column(Integer, ForeignKey("clientes.id"), nullable=False)
    score_preseleccion = Column(Integer, nullable=False, default=0)
    score_pliego = Column(Integer, nullable=False, default=0)
    recomendacion = Column(String, nullable=False, default="pendiente")
    faltantes = Column(Text, nullable=False, default="[]")
    riesgos = Column(Text, nullable=False, default="[]")
    detalle = Column(Text, nullable=False, default="{}")
    analisis_pliego = Column(Text, nullable=False, default="{}")
    fecha_analisis = Column(DateTime, nullable=False, default=datetime.utcnow)

    proceso = relationship("Proceso", backref="analisis")
    cliente = relationship("Cliente", backref="analisis_procesos")
