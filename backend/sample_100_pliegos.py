"""Muestreo estratificado de 100 pliegos SECOP para análisis de Documentos Base Fijos.

Distribución acordada:
- Por rol: Obra pública 45, Servicios/Consultores 30, Bienes 25
- Por modalidad: LP 30, SAMC 51, MC 19
- Por geografía: Nacional/Capitales 36, Municipios 4-5-6 64
"""

import os
import random
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).parent))

os.environ.setdefault("DATABASE_URL", "sqlite:///./secop.db")

from database import SessionLocal
from models import Proceso


@dataclass
class Categoria:
    rol: str  # obra | servicios | bienes
    modalidad: str  # LP | SAMC | MC
    geografia: str  # nacional/capitales | municipios


# Cuotas exactas por celda: (rol, modalidad, geografia) -> cantidad
CUOTAS = {
    ("obra", "LP", "nacional/capitales"): 2,
    ("obra", "LP", "municipios"): 6,
    ("obra", "SAMC", "nacional/capitales"): 9,
    ("obra", "SAMC", "municipios"): 16,
    ("obra", "MC", "nacional/capitales"): 3,
    ("obra", "MC", "municipios"): 9,
    ("servicios", "LP", "nacional/capitales"): 3,
    ("servicios", "LP", "municipios"): 7,
    ("servicios", "SAMC", "nacional/capitales"): 6,
    ("servicios", "SAMC", "municipios"): 9,
    ("servicios", "MC", "nacional/capitales"): 2,
    ("servicios", "MC", "municipios"): 3,
    ("bienes", "LP", "nacional/capitales"): 5,
    ("bienes", "LP", "municipios"): 0,
    ("bienes", "SAMC", "nacional/capitales"): 5,
    ("bienes", "SAMC", "municipios"): 14,
    ("bienes", "MC", "nacional/capitales"): 1,
    ("bienes", "MC", "municipios"): 0,
}


def clasificar_rol(unspsc: str | None, objeto: str | None) -> str | None:
    """Clasifica el proceso en obra, servicios o bienes según UNSPSC u objeto."""
    if not unspsc:
        unspsc = ""
    objeto = (objeto or "").lower()
    codigo = unspsc.replace("V1.", "").replace(".", "")

    # Obras públicas e infraestructura (prioridad alta)
    if codigo.startswith(("7212", "7213", "7214", "7215")):
        return "obra"
    if any(p in objeto for p in [
        "construccion", "construcción", "obra publica", "obra pública",
        "infraestructura vial", "mantenimiento vial", "puente", "edificacion",
        "edificación", "pavimentacion", "pavimentación", "red vial", "vias terciarias",
        "vías terciarias", "interventoria", "interventoría", "obra civil",
    ]):
        return "obra"

    # Bienes (prioridad alta para palabras específicas de suministro)
    if codigo.startswith(("42", "43", "44", "45", "48", "49")):
        return "bienes"
    if any(p in objeto for p in [
        "suministro", "adquisicion", "adquisición", "compra de", "dotacion", "dotación",
        "papeleria", "papelería", "tecnologia", "tecnología", "computadores", "mobiliario",
        "equipos", "materiales", "insumos", "insumos", "uniformes", "cafe", "cafeteria",
        "cafetería", "alimentos", "medicamentos", "vehiculos", "vehículos", "combustible",
        "muebles", "impresoras", "servidores", "licencias", "parques recreativos",
        "juegos infantiles", "gimnasio", "canchas", "mobiliario urbano", "señalizacion",
        "señalización", "cerramiento", "cercas", "portones",
    ]):
        return "bienes"

    # Servicios y consultorías
    if codigo.startswith(("811", "812", "813")):
        return "servicios"
    if any(p in objeto for p in [
        "consultoria", "consultoría", "asesoria", "asesoría", "estudios",
        "diseno", "diseño", "software", "servicios profesionales",
        "capacitacion", "capacitación", "vigilancia", "aseo", "seguridad",
        "limpieza", "mantenimiento de edificaciones", "mantenimiento de instalaciones",
        "outsourcing", "outsourcing", "recoleccion", "recolección", "disposicion", "disposición",
    ]):
        return "servicios"

    # Servicios de salud y otros
    if codigo.startswith(("85", "86")):
        return "servicios"

    return None


def clasificar_modalidad(modalidad: str | None) -> str | None:
    if not modalidad:
        return None
    m = modalidad.lower()
    if "licitación pública" in m or "licitacion publica" in m:
        return "LP"
    if "selección abreviada" in m or "seleccion abreviada" in m:
        return "SAMC"
    if "mínima cuantía" in m or "minima cuantia" in m:
        return "MC"
    return None


NACIONALES = [
    r"\bminist(erio|erios)\b",
    r"\binvias\b",
    r"\banm\b",
    r"\bani\b",
    r"\bica\b",
    r"\barn\b",
    r"\bins\b",
    r"\bfondo\b",
    r"\bagencia\b",
    r"\binstituto\b",
    r"\bunidad\b",
    r"\bservicio\b",
    r"\bsuperintendencia\b",
]

CAPITALES = ["bogotá", "bogota", "medellín", "medellin", "cali", "barranquilla"]


def clasificar_geografia(entidad: str | None, departamento: str | None) -> str | None:
    texto = f"{(entidad or '')} {(departamento or '')}".lower()

    if any(re.search(p, texto) for p in NACIONALES):
        return "nacional/capitales"
    if any(cap in texto for cap in CAPITALES):
        return "nacional/capitales"
    return "municipios"


def es_excluible(proceso: Proceso) -> bool:
    """Descarta procesos que no aportan al análisis de documentos base."""
    if not proceso.modalidad:
        return True
    m = proceso.modalidad.lower()

    # Excluir contratación directa, regímenes especiales, concursos de méritos, etc.
    excluir = [
        "contratación directa",
        "contratacion directa",
        "régimen especial",
        "regimen especial",
        "concurso de méritos",
        "concurso de meritos",
        "subasta inversa",
        "solicitud de información",
    ]
    if any(e in m for e in excluir):
        return True

    # Excluir procesos sin presupuesto definido o muy pequeños
    if proceso.presupuesto is None or proceso.presupuesto < 10_000_000:
        return True

    # Excluir procesos sin URL de documento (no se puede descargar)
    if not proceso.url_documento:
        return True

    return False


def construir_muestra(db: Session, semilla: int = 42) -> pd.DataFrame:
    random.seed(semilla)

    # Cargar y clasificar todos los procesos elegibles
    procesos = db.query(Proceso).all()
    elegibles = []
    for p in procesos:
        if es_excluible(p):
            continue
        rol = clasificar_rol(p.unspsc_code, p.objeto)
        modalidad = clasificar_modalidad(p.modalidad)
        geografia = clasificar_geografia(p.entidad, p.departamento)
        if rol and modalidad and geografia:
            elegibles.append({
                "id": p.id,
                "numero_proceso": p.numero_proceso,
                "entidad": p.entidad,
                "departamento": p.departamento,
                "modalidad_original": p.modalidad,
                "modalidad": modalidad,
                "presupuesto": p.presupuesto,
                "objeto": p.objeto[:200],
                "unspsc_code": p.unspsc_code,
                "url_documento": p.url_documento,
                "rol": rol,
                "geografia": geografia,
            })

    df = pd.DataFrame(elegibles)
    seleccionados = []
    faltantes = []

    for (rol, modalidad, geografia), cuota in CUOTAS.items():
        if cuota == 0:
            continue
        candidatos = df[
            (df["rol"] == rol)
            & (df["modalidad"] == modalidad)
            & (df["geografia"] == geografia)
        ]
        if len(candidatos) >= cuota:
            muestra = candidatos.sample(n=cuota, random_state=semilla)
            seleccionados.append(muestra)
        else:
            # Tomar los que hay y reportar faltante
            seleccionados.append(candidatos)
            faltantes.append({
                "rol": rol,
                "modalidad": modalidad,
                "geografia": geografia,
                "cuota": cuota,
                "disponibles": len(candidatos),
                "faltan": cuota - len(candidatos),
            })

    if seleccionados:
        resultado = pd.concat(seleccionados, ignore_index=True)
    else:
        resultado = pd.DataFrame()

    return resultado, pd.DataFrame(faltantes)


def main():
    db = SessionLocal()
    try:
        muestra, faltantes = construir_muestra(db)

        print(f"Procesos seleccionados: {len(muestra)}")
        print("\n=== Distribución por rol ===")
        print(muestra["rol"].value_counts().to_string())
        print("\n=== Distribución por modalidad ===")
        print(muestra["modalidad"].value_counts().to_string())
        print("\n=== Distribución por geografía ===")
        print(muestra["geografia"].value_counts().to_string())
        print("\n=== Cruce rol × modalidad × geografía ===")
        print(pd.crosstab([muestra["rol"], muestra["modalidad"]], muestra["geografia"]))

        if not faltantes.empty:
            print("\n=== Celdas con faltantes ===")
            print(faltantes.to_string(index=False))

        # Guardar CSV de control
        output_path = Path("../storage/muestra_100_pliegos.csv")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        muestra.to_csv(output_path, index=False, encoding="utf-8")
        print(f"\nMuestra guardada en: {output_path}")

        # Guardar faltantes
        if not faltantes.empty:
            faltantes_path = Path("../storage/muestra_100_pliegos_faltantes.csv")
            faltantes.to_csv(faltantes_path, index=False, encoding="utf-8")
            print(f"Faltantes guardados en: {faltantes_path}")

    finally:
        db.close()


if __name__ == "__main__":
    main()
