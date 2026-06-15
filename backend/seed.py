"""Registra un cliente de prueba vía API y muestra el resultado."""
import json
import sys

import requests

BASE = "http://localhost:8000"

payload = {
    "nombre": "Constructora Prueba SAS",
    "email": "evelyngallop12@gmail.com",
    "departamentos": ["CUNDINAMARCA", "BOGOTÁ D.C."],
    "unspsc_codes": ["72140000", "72120000"],
    "presupuesto_min": 500_000_000,
    "presupuesto_max": 5_000_000_000,
}

print("Registrando cliente de prueba...")
r = requests.post(f"{BASE}/clientes", json=payload)
if r.status_code != 201:
    print(f"ERROR {r.status_code}: {r.text}")
    sys.exit(1)

cliente = r.json()
print(f"Cliente creado con ID={cliente['id']}")
print(json.dumps(cliente, indent=2, ensure_ascii=False))
