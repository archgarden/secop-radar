"""Calculadoras de licitación para SECOP Radar."""

from datetime import date
from typing import Literal

SMMLV = 1_423_500


def calcular_capacidad_financiera(
    activo_corriente: float,
    pasivo_corriente: float,
    activo_total: float,
    pasivo_total: float,
    patrimonio: float,
    utilidad_operacional: float,
    gastos_intereses: float,
) -> dict:
    """Calcula indicadores de capacidad financiera."""
    liquidez = activo_corriente / pasivo_corriente if pasivo_corriente else None
    endeudamiento = pasivo_total / activo_total if activo_total else None
    cobertura_intereses = utilidad_operacional / gastos_intereses if gastos_intereses else None
    rent_patrimonio = utilidad_operacional / patrimonio if patrimonio else None
    rent_activo = utilidad_operacional / activo_total if activo_total else None

    return {
        "indicadores": {
            "liquidez": {
                "valor": round(liquidez, 4) if liquidez is not None else None,
                "formula": "Activo Corriente / Pasivo Corriente",
                "interpretacion": _interpretar_liquidez(liquidez),
            },
            "endeudamiento": {
                "valor": round(endeudamiento, 4) if endeudamiento is not None else None,
                "formula": "Pasivo Total / Activo Total",
                "interpretacion": _interpretar_endeudamiento(endeudamiento),
            },
            "cobertura_intereses": {
                "valor": round(cobertura_intereses, 4) if cobertura_intereses is not None else None,
                "formula": "Utilidad Operacional / Gastos por Intereses",
                "interpretacion": _interpretar_cobertura(cobertura_intereses),
            },
            "rentabilidad_patrimonio": {
                "valor": round(rent_patrimonio, 4) if rent_patrimonio is not None else None,
                "formula": "Utilidad Operacional / Patrimonio",
                "interpretacion": _interpretar_rentabilidad(rent_patrimonio),
            },
            "rentabilidad_activo": {
                "valor": round(rent_activo, 4) if rent_activo is not None else None,
                "formula": "Utilidad Operacional / Activo Total",
                "interpretacion": _interpretar_rentabilidad(rent_activo),
            },
        }
    }


def _interpretar_liquidez(v: float | None) -> str:
    if v is None:
        return "No calculable"
    if v >= 1.5:
        return "Buena liquidez"
    if v >= 1:
        return "Liquidez aceptable"
    return "Liquidez baja"


def _interpretar_endeudamiento(v: float | None) -> str:
    if v is None:
        return "No calculable"
    if v <= 0.4:
        return "Bajo endeudamiento"
    if v <= 0.7:
        return "Endeudamiento moderado"
    return "Alto endeudamiento"


def _interpretar_cobertura(v: float | None) -> str:
    if v is None:
        return "No calculable"
    if v >= 3:
        return "Buena cobertura de intereses"
    if v >= 1:
        return "Cobertura aceptable"
    return "Cobertura insuficiente"


def _interpretar_rentabilidad(v: float | None) -> str:
    if v is None:
        return "No calculable"
    if v > 0.1:
        return "Rentabilidad alta"
    if v > 0:
        return "Rentabilidad positiva"
    return "Rentabilidad negativa"


def calcular_capacidad_residual(
    presupuesto_proceso: float,
    plazo_proceso_meses: int,
    anticipo_pct: float,
    ingresos_operacionales_anuales: float,
    contratos_vigentes: list[dict],
) -> dict:
    """Calcula capacidad residual simplificada."""
    obligaciones_mensuales = 0.0
    for c in contratos_vigentes:
        valor = float(c.get("valor", 0) or 0)
        plazo = int(c.get("plazo_meses", 1) or 1)
        obligaciones_mensuales += valor / plazo if plazo else 0

    ingresos_mensuales = ingresos_operacionales_anuales / 12
    capacidad_residual_mensual = ingresos_mensuales - obligaciones_mensuales
    requerido_nuevo_mensual = (presupuesto_proceso * (1 - anticipo_pct / 100)) / plazo_proceso_meses
    capacidad_suficiente = capacidad_residual_mensual >= requerido_nuevo_mensual

    return {
        "ingresos_mensuales": round(ingresos_mensuales, 2),
        "obligaciones_mensuales": round(obligaciones_mensuales, 2),
        "capacidad_residual_mensual": round(capacidad_residual_mensual, 2),
        "requerido_nuevo_mensual": round(requerido_nuevo_mensual, 2),
        "capacidad_suficiente": capacidad_suficiente,
        "relacion": round(capacidad_residual_mensual / requerido_nuevo_mensual, 4) if requerido_nuevo_mensual else None,
    }


def calcular_precio_artificialmente_bajo(
    presupuesto_oficial: float,
    ofertas: list[float],
    umbral_pct: float = 70.0,
) -> dict:
    """Detecta ofertas por debajo del umbral respecto al precio de referencia (promedio)."""
    ofertas_validas = [float(o) for o in ofertas if o and o > 0]
    if not ofertas_validas:
        return {"error": "No hay ofertas válidas"}

    precio_referencia = sum(ofertas_validas) / len(ofertas_validas)
    limite_bajo = precio_referencia * (umbral_pct / 100)

    resultado_ofertas = []
    for o in ofertas_validas:
        es_bajo = o < limite_bajo
        resultado_ofertas.append({
            "oferta": o,
            "porcentaje_referencia": round((o / precio_referencia) * 100, 2) if precio_referencia else None,
            "artificialmente_bajo": es_bajo,
        })

    ofertas_bajas = [r for r in resultado_ofertas if r["artificialmente_bajo"]]

    return {
        "precio_referencia": round(precio_referencia, 2),
        "umbral_pct": umbral_pct,
        "limite_bajo": round(limite_bajo, 2),
        "ofertas": resultado_ofertas,
        "alerta": len(ofertas_bajas) > 0,
        "cantidad_bajas": len(ofertas_bajas),
    }


def consolidar_experiencia_smmlv(contratos: list[dict], smmlv: float | None = None) -> dict:
    """Convierte experiencia de contratos a SMMLV."""
    smmlv = smmlv or SMMLV
    total_valor = 0.0
    total_anos = 0.0
    detalle = []

    for c in contratos:
        valor = float(c.get("valor", 0) or 0)
        fecha_inicio = c.get("fecha_inicio")
        fecha_fin = c.get("fecha_fin")

        anos = 0.0
        if fecha_inicio and fecha_fin:
            try:
                fi = date.fromisoformat(str(fecha_inicio))
                ff = date.fromisoformat(str(fecha_fin))
                dias = (ff - fi).days
                anos = max(0, dias / 365.0)
            except Exception:
                anos = 0.0

        smmlv_contrato = valor / smmlv if smmlv else 0
        total_valor += valor
        total_anos += anos
        detalle.append({
            "valor": valor,
            "fecha_inicio": fecha_inicio,
            "fecha_fin": fecha_fin,
            "anos": round(anos, 2),
            "smmlv": round(smmlv_contrato, 2),
        })

    return {
        "smmlv_usado": smmlv,
        "total_valor": round(total_valor, 2),
        "total_anos": round(total_anos, 2),
        "total_smmlv": round(total_valor / smmlv, 2) if smmlv else 0,
        "contratos": detalle,
    }


def clasificar_mipyme(
    sector: Literal["manufacturero", "servicios", "comercio"],
    empleados: int,
    ingresos_anuales: float,
) -> dict:
    """Clasifica empresa según criterios MIPYME 2021."""
    tablas = {
        "manufacturero": {
            "micro": (0, 23563),
            "pequena": (23564, 204995),
            "mediana": (204996, 1_736_565),
        },
        "servicios": {
            "micro": (0, 32988),
            "pequena": (32989, 131951),
            "mediana": (131952, 483034),
        },
        "comercio": {
            "micro": (0, 44770),
            "pequena": (44796, 431196),
            "mediana": (431197, 2_160_692),
        },
    }
    tablas_ingresos = {
        "manufacturero": {
            "micro": (0, 1_173_413_837),
            "pequena": (1_173_463_636, 10_208_546_005),
            "mediana": (10_208_595_804, 86_479_200_435),
        },
        "servicios": {
            "micro": (0, 1_642_769_412),
            "pequena": (1_642_819_211, 6_571_027_849),
            "mediana": (6_571_077_648, 24_054_610_166),
        },
        "comercio": {
            "micro": (0, 2_229_501_230),
            "pequena": (2_230_796_004, 21_473_129_604),
            "mediana": (21_473_179_403, 107_600_300_908),
        },
    }

    sector_key = sector.lower()
    if sector_key not in tablas:
        raise ValueError("Sector no válido. Use: manufacturero, servicios, comercio")

    def _clasificar_por_tabla(valor: float, tabla: dict) -> str:
        for categoria, (min_v, max_v) in tabla.items():
            if min_v <= valor <= max_v:
                return categoria
        return "grande"

    categoria_empleados = _clasificar_por_tabla(empleados, tablas[sector_key])
    categoria_ingresos = _clasificar_por_tabla(ingresos_anuales, tablas_ingresos[sector_key])

    # La categoría más restrictiva (mayor) prevalece
    orden = {"micro": 1, "pequena": 2, "mediana": 3, "grande": 4}
    categoria_final = max([categoria_empleados, categoria_ingresos], key=lambda x: orden[x])

    return {
        "sector": sector_key,
        "empleados": empleados,
        "ingresos_anuales": ingresos_anuales,
        "categoria_por_empleados": categoria_empleados,
        "categoria_por_ingresos": categoria_ingresos,
        "categoria_final": categoria_final,
    }
