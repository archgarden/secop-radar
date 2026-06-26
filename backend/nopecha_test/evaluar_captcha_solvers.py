"""Evaluación técnica de solucionadores de CAPTCHA para SECOP II.

No accede a community.secop.gov.co; solo verifica configuración, existencia de
la extensión NopeCHA y conectividad básica con las APIs pagadas (2captcha,
NopeCHA Token). Útil antes de habilitar el scraper en producción.

Uso:
    cd backend
    source venv/bin/activate
    python nopecha_test/evaluar_captcha_solvers.py
"""

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

CAPTCHA_SOLVER = os.getenv("CAPTCHA_SOLVER", "manual").lower()
CAPTCHA_API_KEY = os.getenv("CAPTCHA_API_KEY", "")
NOPECHA_EXT_PATH = os.getenv(
    "NOPECHA_EXT_PATH",
    str(Path(__file__).resolve().parent / "nopecha_ext"),
)


def check_manual() -> dict:
    return {
        "solver": "manual",
        "listo": True,
        "nota": "El usuario resolverá el CAPTCHA en la ventana del navegador.",
    }


def check_nopecha_extension() -> dict:
    ext_path = Path(NOPECHA_EXT_PATH)
    if not ext_path.is_absolute():
        ext_path = (Path(__file__).resolve().parent.parent / ext_path).resolve()

    listo = ext_path.exists() and (ext_path / "manifest.json").exists()
    return {
        "solver": "nopecha_extension",
        "listo": listo,
        "ruta": str(ext_path),
        "nota": (
            "Extensión encontrada. Requiere IP residencial para créditos gratis; "
            "de lo contrario pide API key dentro de la extensión."
            if listo
            else "Extensión NO encontrada. Descárguela y descomprímala en la ruta indicada."
        ),
    }


def check_2captcha() -> dict:
    if not CAPTCHA_API_KEY:
        return {
            "solver": "2captcha",
            "listo": False,
            "nota": "Falta CAPTCHA_API_KEY en el .env.",
        }

    try:
        r = requests.get(
            "https://2captcha.com/res.php",
            params={"key": CAPTCHA_API_KEY, "action": "getbalance", "json": "1"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        if data.get("status") == 1:
            return {
                "solver": "2captcha",
                "listo": True,
                "balance": data.get("request"),
                "nota": "API key válida. Balance reportado por 2captcha.",
            }
        return {
            "solver": "2captcha",
            "listo": False,
            "respuesta": data,
            "nota": "API key rechazada o error en la respuesta.",
        }
    except Exception as exc:
        return {
            "solver": "2captcha",
            "listo": False,
            "error": str(exc),
            "nota": "No se pudo contactar 2captcha. Verifica conexión/API key.",
        }


def check_nopecha_token() -> dict:
    if not CAPTCHA_API_KEY:
        return {
            "solver": "nopecha_token",
            "listo": False,
            "nota": "Falta CAPTCHA_API_KEY en el .env (se usa como token NopeCHA).",
        }

    try:
        headers = {"Authorization": f"Bearer {CAPTCHA_API_KEY}"}
        # Endpoint de saldo/créditos de NopeCHA
        r = requests.get(
            "https://api.nopecha.com/status",
            headers=headers,
            timeout=30,
        )
        if r.status_code == 200:
            return {
                "solver": "nopecha_token",
                "listo": True,
                "respuesta": r.json(),
                "nota": "Token válido. Respuesta de estado de NopeCHA.",
            }
        return {
            "solver": "nopecha_token",
            "listo": False,
            "status_code": r.status_code,
            "respuesta": r.text[:200],
            "nota": "Token posiblemente inválido o error de NopeCHA.",
        }
    except Exception as exc:
        return {
            "solver": "nopecha_token",
            "listo": False,
            "error": str(exc),
            "nota": "No se pudo contactar api.nopecha.com. Verifica conexión/token.",
        }


def main() -> int:
    print(f"Evaluando solucionador configurado: {CAPTCHA_SOLVER}\n")

    handlers = {
        "manual": check_manual,
        "nopecha_extension": check_nopecha_extension,
        "2captcha": check_2captcha,
        "nopecha": check_nopecha_token,
        "nopecha_token": check_nopecha_token,
    }

    handler = handlers.get(CAPTCHA_SOLVER)
    if not handler:
        print(f"ERROR: solucionador '{CAPTCHA_SOLVER}' no reconocido.")
        print("Valores válidos: manual, nopecha_extension, 2captcha, nopecha, nopecha_token")
        return 1

    result = handler()
    for k, v in result.items():
        print(f"  {k}: {v}")

    print("\n--- Resumen de todos los solucionadores ---")
    for name, h in handlers.items():
        res = h()
        status = "OK" if res.get("listo") else "NO OK"
        print(f"  {name}: {status} - {res.get('nota', '')}")

    return 0 if result.get("listo") else 1


if __name__ == "__main__":
    sys.exit(main())
