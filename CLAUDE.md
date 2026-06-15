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
│   ├── downloader.py
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
│   └── pliegos/
├── logs/
└── CLAUDE.md

## Variables de entorno (backend/.env)
SOCRATA_APP_TOKEN=tu_token_aqui
RESEND_API_KEY=tu_key_aqui
DATABASE_URL=sqlite:///./secop.db
STORAGE_PATH=../storage/pliegos

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
