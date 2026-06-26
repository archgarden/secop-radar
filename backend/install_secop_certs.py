"""Instala certificados CA intermedios necesarios para verificar SSL de SECOP II.

SECOP II (community.secop.gov.co) no envía la cadena de certificados completa;
Python requests/urllib3 falla con SSLCertVerificationError al intentar descargar
documentos. Este script agrega el certificado intermedio de GlobalSign al bundle
de certifi del entorno virtual.

Uso:
    cd backend
    source venv/bin/activate
    python install_secop_certs.py
"""

import sys
from pathlib import Path

import certifi

CERTS_DIR = Path(__file__).resolve().parent / "certs"
CERTIFICADOS = [
    "globalsign_root_ca_r3.pem",
    "globalsign_rsa_ov_ssl_ca_2018.pem",
]


def instalar() -> None:
    bundle = Path(certifi.where())
    bundle_text = bundle.read_text(encoding="utf-8")

    agregados = 0
    for nombre in CERTIFICADOS:
        path = CERTS_DIR / nombre
        if not path.exists():
            print(f"⚠ Certificado no encontrado: {path}", file=sys.stderr)
            continue

        cert = path.read_text(encoding="utf-8").strip()
        # Evitar duplicados
        if cert in bundle_text:
            print(f"✓ {nombre} ya está instalado")
            continue

        with open(bundle, "a", encoding="utf-8") as f:
            f.write("\n\n")
            f.write(cert)
            f.write("\n")
        agregados += 1
        print(f"✓ {nombre} instalado")

    if agregados:
        print(f"\nBundle actualizado: {bundle}")
    else:
        print("\nNo se agregaron certificados nuevos.")


if __name__ == "__main__":
    instalar()
