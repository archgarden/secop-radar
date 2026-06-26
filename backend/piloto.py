"""
Flujo piloto end-to-end para un proceso SECOP II.

El pliego de condiciones es el documento principal: de él se extraen los
requisitos reales del proceso y se cruzan con la documentación del cliente.

Pasos:
1. Descarga automática de documentos (modo manual: usuario resuelve CAPTCHA).
2. Análisis del pliego de condiciones (documento descargado automáticamente).
3. Preselección del proceso para un cliente, integrando el score del pliego.

Uso:
    python piloto.py <proceso_id> <cliente_id> [timeout_segundos]

Ejemplo:
    python piloto.py 1 3 180
"""

import json
import sys

from database import SessionLocal
from secop_scraper import descargar_documentos_proceso
from analizador_pliego import analizar_pliego
from preseleccion import analizar_preseleccion
from models import Proceso, Cliente


def main():
    if len(sys.argv) < 3:
        print("Uso: python piloto.py <proceso_id> <cliente_id> [timeout_segundos]")
        sys.exit(1)

    proceso_id = int(sys.argv[1])
    cliente_id = int(sys.argv[2])
    timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 180

    db = SessionLocal()
    try:
        proceso = db.query(Proceso).filter(Proceso.id == proceso_id).first()
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()

        if not proceso:
            print(f"Proceso {proceso_id} no encontrado")
            sys.exit(1)
        if not cliente:
            print(f"Cliente {cliente_id} no encontrado")
            sys.exit(1)

        print("=" * 60)
        print("FLUJO PILOTO SECOP RADAR")
        print("=" * 60)
        print(f"Proceso: {proceso.numero_proceso}")
        print(f"Entidad: {proceso.entidad}")
        print(f"Objeto: {proceso.objeto[:100]}...")
        print(f"Cliente: {cliente.nombre}")
        print(f"URL: {proceso.url_documento}")
        print()

        # 1. Descargar documentos.
        print("[1/3] Descargando documentos...")
        print("      Se abrirá Chrome. Resuelve el CAPTCHA y espera.")
        resultado_descarga = descargar_documentos_proceso(proceso, db, timeout_seconds=timeout)
        print(json.dumps(resultado_descarga, indent=2, ensure_ascii=False))

        if not resultado_descarga.get("ok"):
            print("\n[ERROR] No se pudieron descargar documentos.")
            sys.exit(1)

        # 2. Analizar pliego.
        print("\n[2/3] Analizando pliego de condiciones...")
        resultado_pliego = analizar_pliego(proceso_id, cliente_id, db)
        print(json.dumps(resultado_pliego, indent=2, ensure_ascii=False))

        # 3. Preselección.
        print("\n[3/3] Ejecutando preselección...")
        analisis = analizar_preseleccion(proceso_id, cliente_id, db)
        print(f"Score preselección: {analisis.score_preseleccion}")
        print(f"Score pliego: {analisis.score_pliego}")
        print(f"Recomendación: {analisis.recomendacion}")
        print(f"Faltantes: {json.loads(analisis.faltantes)}")
        print(f"Riesgos: {json.loads(analisis.riesgos)}")

        print("\n" + "=" * 60)
        print("FLUJO PILOTO COMPLETADO")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    main()
