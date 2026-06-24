"""Utilidades para normalizar y describir códigos UNSPSC provenientes de SECOP II."""

# Diccionario con los códigos UNSPSC más relevantes para constructoras.
# SECOP II expone los códigos con prefijo "V1." seguido de 8 dígitos.
UNSPSC_DESCRIPCIONES: dict[str, str] = {
    # Infraestructura pública
    "72140000": "Infraestructura pública (vías, puentes, obras civiles)",
    "72141000": "Construcción de carreteras, calles y puentes",
    "72141100": "Construcción de carreteras, calles y puentes",
    "72141500": "Mantenimiento y reparación de vías y puentes",
    "72142000": "Construcción de túneles y estructuras subterráneas",
    "72143000": "Construcción de pistas, aeropuertos y puertos",
    # Edificación
    "72120000": "Edificación (escuelas, hospitales, vivienda)",
    "72121000": "Construcción de edificios residenciales",
    "72121400": "Servicios de construcción de edificios públicos especializado",
    "72122000": "Construcción de edificios comerciales e industriales",
    # Mantenimiento y reparaciones
    "72150000": "Mantenimiento y reparaciones",
    "72151000": "Servicios de mantenimiento de edificios",
    "72151500": "Servicios de mantenimiento de infraestructura",
    "72151603": "Servicios de mantenimiento y reparación especializado",
    "72152700": "Servicios de reparación de infraestructura vial",
    # Servicios de ingeniería y consultoría
    "81100000": "Servicios de ingeniería y consultoría",
    "81110000": "Servicios de ingeniería civil",
    "81120000": "Servicios de consultoría de ingeniería",
    "81130000": "Servicios de arquitectura",
}


def limpiar_unspsc(codigo: str | None) -> str | None:
    """Quita el prefijo 'V1.' o 'V1' que Socrata agrega a los códigos UNSPSC."""
    if not codigo:
        return None
    limpio = codigo.strip()
    if limpio.upper().startswith("V1."):
        limpio = limpio[3:]
    elif limpio.upper().startswith("V1"):
        limpio = limpio[2:]
    return limpio or None


def describir_unspsc(codigo: str | None) -> str | None:
    """Devuelve la descripción legible de un código UNSPSC."""
    limpio = limpiar_unspsc(codigo)
    if not limpio:
        return None

    # Primero busca coincidencia exacta de 8 dígitos.
    if limpio in UNSPSC_DESCRIPCIONES:
        return UNSPSC_DESCRIPCIONES[limpio]

    # Si no, busca por los 6 primeros dígitos (segmento/familia).
    familia = limpio[:6]
    if familia in UNSPSC_DESCRIPCIONES:
        return UNSPSC_DESCRIPCIONES[familia]

    # Finalmente por los 4 primeros dígitos (clase).
    clase = limpio[:4]
    if clase in UNSPSC_DESCRIPCIONES:
        return UNSPSC_DESCRIPCIONES[clase]

    return "Categoría no clasificada"
