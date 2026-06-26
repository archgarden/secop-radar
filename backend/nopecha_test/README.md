# Prototipo: descarga de documentos SECOP II con NopeCHA + Playwright

> ⚠️ **Advertencia:** Este es un prototipo de validación técnica. Automatizar el acceso al portal SECOP II puede violar los términos de uso de Colombia Compra Eficiente. Úsalo bajo tu propia responsabilidad.

## ¿Qué hace este prototipo?

1. Abre el detalle de un proceso en `community.secop.gov.co` con Playwright.
2. Resuelve el reCAPTCHA v2 del portal (manualmente o con un servicio pagado).
3. Espera a que el portal muestre el detalle del proceso.
4. Extrae los enlaces de documentos de la pestaña Documentación.
5. Descarga los documentos usando las cookies de la sesión de Playwright.
6. Identifica el **pliego de condiciones** como el documento principal.
7. El sistema usa el pliego para extraer requisitos y cruzarlos con la documentación del cliente.

## Estructura

```
nopecha_test/
├── nopecha_ext/                  # Extensión NopeCHA descomprimida
├── nopecha.crx                   # Extensión NopeCHA descargada
├── descargar_documentos_secop.py # Script principal
├── test_nopecha.py               # Script básico de prueba
├── test_nopecha_popup.py         # Muestra el estado de la extensión
└── README.md                     # Este archivo
```

## Requisitos

- Python 3.10+
- Entorno virtual activado (`../venv`)
- Playwright instalado
- Extensión NopeCHA descomprimida en `./nopecha_ext`

## Instalación

Desde la carpeta `backend`:

```bash
source venv/bin/activate
pip install playwright
playwright install chromium
```

## Descargar la extensión NopeCHA

El archivo `nopecha.crx` ya está incluido en esta carpeta. Si necesitas regenerarlo:

```bash
curl -L -o nopecha.crx \
  "https://clients2.google.com/service/update2/crx?response=redirect&prodversion=119.0&acceptformat=crx3&x=id%3Ddknlfmjaanfblgfdfebhijalfmhmjjjo%26installsource%3Dondemand%26uc"

unzip -o nopecha.crx -d nopecha_ext
```

## Uso

```bash
python descargar_documentos_secop.py CO1.NTC.10222436 ./secop_docs --timeout 120
```

Parámetros:

- `notice_uid`: UID del aviso del proceso (viene en `urlproceso` de Socrata).
- `output_dir`: carpeta donde se guardarán los documentos (por defecto `./secop_docs`).
- `--timeout`: segundos máximos esperando que NopeCHA resuelva el CAPTCHA (por defecto 120).

## Notas importantes

- **La extensión NopeCHA gratuita requiere una IP residencial.** Si tu IP es de datacenter, VPN o ya fue marcada, verás el mensaje:

  > "Your IP is ineligible for free credits. Purchase a key to use with VPN/proxy."

- Si NopeCHA no tiene créditos, el script esperará hasta el timeout, guardará un screenshot de la página del CAPTCHA y terminará.

- El modo `headless=False` es obligatorio para que las extensiones funcionen en Playwright.

## Próximos pasos para producción

Si este prototipo funciona estable con IP residencial, se puede integrar al backend:

1. Agregar una tabla `DocumentoProceso` para guardar documentos descargados por proceso.
2. Ejecutar el descargador como tarea en background (APScheduler o Celery).
3. Alimentar `analizador_pliego.py` con el pliego descargado automáticamente.
4. Manejar reintentos, límites de tasa y rotación de IPs.
