# SECOP Radar — Pre-Auditor Automatizado

## Qué es este proyecto
SaaS B2B para constructoras e ingenieros colombianos. 
Monitorea SECOP II automáticamente, filtra licitaciones 
por perfil del cliente y alerta cuando hay procesos compatibles.

## Stack
- Backend: Python 3.11 + FastAPI + APScheduler + SQLite
- Frontend: Next.js 14 + Tailwind CSS
- Email: Resend
- Deploy: Railway (backend) + Vercel (frontend)

## Estilo visual
Oscuro, funcional, para ingenieros y contratistas.
- Fondo: #0f1117
- Superficie cards: #1a1d27
- Bordes: #2a2d3a
- Texto principal: #e2e8f0
- Texto secundario: #64748b
- Acento primario: #3b82f6 (azul)
- Éxito / CUMPLE: #22c55e (verde)
- Alerta / NO CUMPLE: #ef4444 (rojo)
- Warning / adenda: #f59e0b (amarillo)
- Fuente: Inter (Google Fonts)
- Sin bordes redondeados exagerados (radius máx 6px)
- Tablas densas, información compacta, sin padding excesivo

## Estructura de carpetas
secop-radar/
├── backend/
│   ├── main.py
│   ├── radar.py
│   ├── secop_scraper.py
│   ├── analizador_pliego.py
│   ├── preseleccion.py
│   ├── piloto.py
│   ├── nopecha_test/
│   │   ├── descargar_documentos_secop.py
│   │   └── nopecha_ext/
│   ├── notificaciones.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── app/
│   │   ├── dashboard/page.tsx
│   │   ├── clientes/nuevo/page.tsx
│   │   └── procesos/[id]/page.tsx
│   ├── components/
│   └── .env.local
├── storage/
│   ├── pliegos/
│   └── procesos/
├── logs/
└── CLAUDE.md

## Variables de entorno (backend/.env)
SOCRATA_APP_TOKEN=tu_token_aqui
RESEND_API_KEY=tu_key_aqui
DATABASE_URL=sqlite:///./secop.db
STORAGE_PATH=../storage/pliegos

# Scraper de documentos SECOP II (Playwright + CAPTCHA solver)
SCOP_SCRAPER_ENABLED=false
SCOP_SCRAPER_TIMEOUT=120
SCOP_SCRAPER_STORAGE=../storage/procesos

# Solucionador de CAPTCHA: manual | 2captcha | nopecha | nopecha_extension
# nopecha_extension usa la extensión NopeCHA gratis (funciona con IP residencial).
CAPTCHA_SOLVER=nopecha_extension
CAPTCHA_API_KEY=tu_key_aqui

# OCR de pliegos escaneados (requiere Tesseract instalado)
TESSERACT_CMD=/opt/homebrew/bin/tesseract
OCR_MAX_PAGES=50

## API principal
- Socrata SECOP II: https://www.datos.gov.co/resource/p6dx-8zbt.json
- Autenticación: header X-App-Token con SOCRATA_APP_TOKEN

## Códigos UNSPSC prioritarios
- 72140000: Infraestructura pública (vías, puentes, obras civiles)
- 72120000: Edificación (escuelas, hospitales, vivienda)
- 72150000: Mantenimiento y reparaciones
- 81100000: Servicios de ingeniería y consultoría

## Reglas del radar
1. Filtrar por departamentos del cliente
2. Filtrar por códigos UNSPSC del cliente
3. Filtrar por rango presupuestal
4. No duplicar procesos ya registrados
5. Solo alertar cuando hay procesos NUEVOS

## MVP — Lo que debe funcionar primero
1. Radar corriendo localmente contra API Socrata
2. Cliente de prueba registrado con parámetros reales
3. Filtros funcionando y guardando en SQLite
4. Correo de alerta enviado cuando hay match
5. Panel web mostrando procesos compatibles

## Estado actual y próximos pasos

### Últimos avances
- **Extracción de RUP ampliada**: el extractor `backend/extraccion/extractores.py` ahora procesa certificados de Cámara de Comercio / Registro Único de Proponentes y extrae NIT, razón social, vigencia, categoría, contacto, UNSPSC, departamentos/municipios y **experiencia acreditada** (contratos del certificado).
- **Experiencia desde RUP**: `backend/extraccion/procesador.py` consolida dinámicamente la experiencia contenida en el RUP junto con certificados de experiencia y datos manuales del cliente.
- **Preselección más inteligente**: `backend/preseleccion.py` ya no exige `Matriz 1 — Experiencia` ni `Certificados de experiencia (Formato 3)` cuando el cliente ya tiene experiencia acreditada en el perfil.
- **Selector de cliente en dashboard**: `frontend/app/dashboard/page.tsx` ahora permite cambiar entre clientes y guarda la selección en `localStorage`.

### Siguiente paso prioritario
**Persistir la selección de cliente activo y su contexto.** ✅ Implementado.
- Creada tabla `configuracion` (clave-valor) y modelo `Configuracion` en `backend/models.py`.
- Endpoints `GET /clientes/activo` y `PUT /clientes/activo` en `backend/main.py`.
- Dashboard ahora consulta el cliente activo desde el backend, sincroniza con query params (`?cliente_id=12`) y guarda la selección en backend + `localStorage`.
- Al subir un documento desde `/clientes/{id}/documentos` y completar el 100 %, se marca ese cliente como activo y se redirige a `/dashboard?cliente_id={id}`.
- Casos edge manejados: un solo cliente se auto-selecciona; sin clientes el dashboard deja de cargar y muestra el estado vacío.

### Próximo paso sugerido
**Refinar el cruce de documentos del Core con información del RUP.**
Algunos documentos del Core (estados financieros, capacidad financiera, indicadores) siguen apareciendo como faltantes aunque el RUP los cubra parcialmente. Evaluar si el certificado de Cámara de Comercio aporta suficiente información para marcarlos como cubiertos o si requieren documentos adicionales.

### Cambios recientes al scraper de documentos SECOP II
- **Descarga bajo demanda únicamente**: el radar ya no descarga documentos automáticamente para todos los procesos nuevos. Ahora solo se descargan los documentos del proceso específico cuando el usuario hace clic en "Ver pliego detallado" / "Descargar documentos".
- **Reutilización de sesión de Playwright**: las descargas individuales usan el contexto HTTP del navegador que ya resolvió el CAPTCHA, reduciendo la cantidad de CAPTCHAs solicitados.
- **Seguimiento de redirección SECOP**: el endpoint `DownloadFile` devuelve un HTML con redirección JS hacia `RetrieveFile/Index`; el scraper ahora sigue esa redirección para obtener el archivo binario real (antes se guardaba el HTML intermedio de 181 bytes).
- **Limpieza de reintentos**: antes de cada descarga se borran documentos previos del proceso en BD y disco, evitando duplicados y archivos corruptos de intentos anteriores.
- **Límite de documentos**: se descargan máximo 25 documentos por proceso (configurable vía `SCOP_SCRAPER_MAX_DOCS`) para evitar descargas masivas innecesarias. Los documentos se ordenan por relevancia (pliego, anexos técnicos, especificaciones, matrices de experiencia/indicadores, formatos) antes de aplicar el límite.
- **Extensión NopeCHA**: se configuró `CAPTCHA_SOLVER=nopecha_extension` para resolver el CAPTCHA automáticamente con la extensión gratuita. En la prueba con el proceso 7 resolvió un solo CAPTCHA en ~43s y descargó 25 documentos reales (pliego, matrices, formatos, anexos).

### Pendientes visibles
- Algunos documentos del Core siguen apareciendo como faltantes aunque el RUP los cubra parcialmente (p. ej. estados financieros, capacidad financiera, indicadores). Evaluar si el certificado de cámara de comercio aporta suficiente información para marcarlos como cubiertos o si requieren documentos adicionales.
- Refinar la extracción de vigencia, representante legal y dirección cuando el certificado no tenga campos estandarizados.
- La extensión NopeCHA gratis resuelve el CAPTCHA automáticamente en la mayoría de los casos, pero ocasionalmente puede fallar o tardar más de 3 minutos. En esos casos el usuario puede resolverlo manualmente en la ventana de Chrome.
