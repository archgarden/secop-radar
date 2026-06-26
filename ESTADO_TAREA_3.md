# Tarea 3 — Análisis de 100 pliegos SECOP II

> **Lectura obligatoria al iniciar una nueva sesión.**
> Este archivo resume el estado de la tarea 3, lo que ya se hizo, el bloqueo actual y los próximos pasos.

---

## Estado actual (resumen para retomar)

- **Muestra:** 100 procesos definidos en `storage/muestra_100_pliegos.csv`.
- **Descargas:** 100 / 100 procesos con documentos en `storage/procesos/`.
- **Análisis:** 100 / 100 pliegos analizados en `storage/analisis_100_pliegos.json`.
- **Core:** v3.0 consolidado en `storage/core_documentos_base_fijos.json` y `.csv`.
- **Integración:** Core consumido por `backend/preseleccion.py`, expuesto en `GET /core-documentos` y visualizado en `frontend/app/preseleccion/page.tsx`.
- **Bloqueo resuelto:** los 14 procesos originales sin `noticeUID` fueron reemplazados por procesos accesibles.

Próximos temas abiertos: continuar refinando el extractor/clasificador para otros documentos (ej. declaración de renta, no intervención), agregar exportación o vista de auditoría del Core, y validar el Core contra casos reales de clientes.

---

## 1. Objetivo

Construir el **Core de Documentos Base Fijos** para SECOP Radar a partir del análisis de 100 pliegos reales de SECOP II.

Tareas derivadas:
1. Definir una muestra estratificada de 100 pliegos.
2. Descargar los documentos de esos 100 procesos.
3. Analizar qué documentos pide cada pliego.
4. Consolidar el Core de Documentos Base Fijos.

---

## 2. Muestra final de 100 pliegos

Archivo: `storage/muestra_100_pliegos.csv`

| Dimensión | Categoría | Cantidad |
|-----------|-----------|----------|
| **Rol** | Obra pública | 45 |
| | Servicios / consultoría | 30 |
| | Bienes | 25 |
| **Modalidad** | Licitación Pública (LP) | 23 |
| | Selección Abreviada (SAMC) | 59 |
| | Mínima Cuantía (MC) | 18 |
| **Geografía** | Nacional / capitales | 36 |
| | Municipios | 64 |

**Ajustes realizados:**
- No había bienes con Licitación Pública en municipios en la base de datos, por lo que esos 7 cupos se transfirieron a **bienes SAMC municipios**.
- Los 14 procesos originales sin `noticeUID` válido fueron reemplazados por procesos accesibles. Como no había bienes disponibles con URL pública, los 5 bienes faltantes se reemplazaron por obras. Por eso la columna "Bienes" conserva 25 filas, pero 5 de ellas corresponden a procesos de obra.

---

## 3. Estado del proyecto

### ✅ Completado

- [x] Muestreo estratificado de 100 pliegos (`backend/sample_100_pliegos.py`).
- [x] Script de análisis masivo de pliegos (`backend/analizar_100_pliegos.py`).
- [x] Script de descarga masiva de pliegos (`backend/descargar_100_pliegos.py`).
- [x] Consolidador del Core de Documentos Base Fijos (`backend/consolidar_core_documentos.py`).
- [x] Extracción de requisitos estructurados (`backend/extraccion/requisitos_pliego.py`).
- [x] Análisis del proceso piloto (ID 1) con pliego + anexos descargados.
- [x] Descarga de documentos de **86 procesos** originales de la muestra (14 no tenían `noticeUID` válido).
- [x] Reemplazo de los 14 procesos originales sin `noticeUID` válido por procesos accesibles:
  - Scripts creados: `backend/encontrar_reemplazos_muestra.py` y `backend/aplicar_reemplazos_muestra.py`.
  - Backup original en `storage/muestra_100_pliegos_original.csv`.
  - Resultado: 100 procesos descargados y analizados.
- [x] Análisis de **100 pliegos** completos.
- [x] Consolidación del Core de Documentos Base Fijos v3.0 con datos de los 100 pliegos:
  - `storage/core_documentos_base_fijos.json`
  - `storage/core_documentos_base_fijos.csv`
- [x] Ajustes al Core solicitados:
  - Mejorados patrones de detección de `propuesta_tecnica` y `certificados_experiencia`.
  - Core separado en tres listas: **proponente**, **pliego** y **calidad**.
  - Etiqueta de frecuencia (`obligatorio` / `frecuente` / `segun_pliego`) basada en umbrales.
  - Eliminado `plan_manejo_transito` del Core por ser específico de vías.
- [x] Reportes generados en `storage/`:
  - `analisis_100_pliegos.json`
  - `analisis_100_pliegos.csv`
  - `resumen_100_pliegos.json`
  - `descarga_100_pliegos.json`
  - `resumen_descarga_100_pliegos.json`

### 📊 Resultados del análisis masivo

| Métrica | Valor |
|---------|-------|
| Pliegos analizados | 100 / 100 |
| Sin pliego / error | 0 / 100 |
| Procesos reemplazados | 14 / 100 |
| Documentos descargados | ~2.500+ |

**Distribución de los 100 pliegos analizados:**

| Dimensión | Resultado |
|-----------|-----------|
| **Rol** | 45 obra / 30 servicios / 25 bienes |
| **Modalidad** | 23 LP / 59 SAMC / 18 MC |
| **Geografía** | 36 nacional/capitales / 64 municipios |

**Documentos más requeridos en los pliegos (según texto extraído):**

| Documento | Requerido en N pliegos |
|-----------|------------------------|
| RUP | 92 / 100 |
| Propuesta económica | 88 / 100 |
| Matriz 3 — Riesgos | 88 / 100 |
| Paz y salvo parafiscales | 84 / 100 |
| Carta de presentación | 74 / 100 |
| Capacidad financiera | 73 / 100 |
| Póliza de seriedad | 73 / 100 |
| Autorización de datos personales | 48 / 100 |
| Estados financieros | 65 / 100 |
| Certificados de experiencia | 61 / 100 |
| Matriz 1 — Experiencia | 52 / 100 |
| Capacidad residual | 51 / 100 |
| Matriz 2 — Indicadores | 47 / 100 |
| Propuesta técnica | 45 / 100 |
| Mipyme | 80 / 100 |
| Industria nacional | 52 / 100 |
| Empresas de mujeres | 57 / 100 |

**Documentos más requeridos en el corpus completo (pliego + anexos + formatos):**

| Documento | Requerido en N procesos |
|-----------|-------------------------|
| Matriz 3 — Riesgos | 100 / 101 |
| Paz y salvo parafiscales | 99 / 101 |
| RUP | 98 / 101 |
| Propuesta económica | 98 / 101 |
| Capacidad financiera | 95 / 101 |
| Carta de presentación | 93 / 101 |
| Póliza de seriedad | 87 / 101 |
| Estados financieros | 82 / 101 |
| Certificados de experiencia | 77 / 101 |
| Matriz 1 — Experiencia | 72 / 101 |
| Matriz 2 — Indicadores | 72 / 101 |
| Capacidad residual | 71 / 101 |
| Autorización de datos personales | 67 / 101 |
| Bienes relevantes | 45 / 101 |

**Core de Documentos Base Fijos consolidado (v3.0-corpus):**

| Tipo de Core | Documentos obligatorios (>70%) | Documentos frecuentes (30–70%) | Según pliego |
|--------------|-------------------------------|--------------------------------|--------------|
| **Proponente** | RUP, paz y salvo parafiscales, póliza de seriedad, estados financieros, capacidad financiera, matriz 1, matriz 2, certificados de experiencia, matriz 3 riesgos, capacidad residual, carta de presentación, propuesta técnica, propuesta económica | Autorización de datos personales, pacto de transparencia, conformación proponente plural, bienes relevantes | Declaración de renta, certificación de no intervención/inhabilidades, carta de manifestación de interés |
| **Pliego** | Pliego, estudios previos | Anexo técnico, cronograma | Memorias de cantidades/presupuesto general, análisis de riesgos del pliego |
| **Calidad** | — | Industria nacional | Empresas de mujeres, Mipyme, factor de calidad, factores de desempate |

### 🔄 Reemplazo de los 14 procesos faltantes

Los 14 procesos originales de la muestra tenían `url_documento` apuntando al login de SECOP II (`/STS/Users/Login/Index`) y **no se encontraron en el buscador público ni en motores de búsqueda** tras múltiples intentos con CAPTCHA manual. Se decidió no bloquear el producto y buscar reemplazos.

**Proceso seguido:**
1. `backend/encontrar_reemplazos_muestra.py` buscó procesos no descargados, no en la muestra y con `noticeUID` accesible, priorizando rol, modalidad, geografía y presupuesto similar.
2. `backend/aplicar_reemplazos_muestra.py` actualizó `storage/muestra_100_pliegos.csv` (backup en `storage/muestra_100_pliegos_original.csv`).
3. `backend/descargar_100_pliegos.py` descargó los 14 reemplazos en modo batch.

**Nota importante:** no había bienes con URL pública disponible en la BD, por lo que los 5 bienes faltantes se reemplazaron por obras. La muestra final conserva 100 procesos, pero con una ligera deformación en la categoría de bienes.

### ✅ Integración en el producto

- [x] Motor de preselección (`backend/preseleccion.py`) carga el Core y usa la lista **proponente** (`obligatorio` + `frecuente`) como documentos requeridos por defecto.
- [x] Matching difuso de documentos subidos mejora con los `keywords` del Core.
- [x] Endpoint nuevo `GET /core-documentos` expone el Core completo (opcionalmente filtrado por `?categoria=proponente|pliego|calidad`).
- [x] Frontend (`frontend/app/preseleccion/page.tsx`) muestra el Core separado en tres categorías con estado subido/pendiente y etiqueta de frecuencia.
- [x] Panel del Core mejorado: tabs por categoría, filtro por frecuencia, búsqueda por nombre/keyword y resumen con progreso.
- [x] Validación: backend compila, endpoint responde, preselección usa 16 documentos del Core y el build de Next.js pasa.
- [x] Refinado extractor de requisitos (`backend/extraccion/requisitos_pliego.py`) para subir detección por texto de:
  - Autorización de datos personales: de 0/100 a **48/100**.
  - Estados financieros: de 64/100 a **65/100**.
  - Póliza de seriedad: se mantiene en **73/100** (ya bien detectada).
- [x] Actualizados keywords del clasificador de documentos (`backend/consolidar_core_documentos.py`) para los mismos documentos.
- [x] Regenerados `storage/analisis_100_pliegos.json`, `storage/resumen_100_pliegos.json` y el Core v3.0 con las mejoras de detección.
- [x] Campo `documentos_no_aplica` agregado al modelo `Cliente` y a la base de datos SQLite.
- [x] Endpoints nuevos:
  - `GET /clientes/{cliente_id}/core-documentos` devuelve el Core marcando `no_aplica` por documento.
  - `PUT /clientes/{cliente_id}/documentos-no-aplica` actualiza la lista de documentos marcados como no aplica.
- [x] Motor de preselección (`backend/preseleccion.py`) excluye documentos marcados como "no aplica" del cálculo de faltantes y enriquece el Core devuelto con el flag `no_aplica`.
- [x] Frontend de preselección (`frontend/app/preseleccion/page.tsx`) permite marcar/desmarcar documentos del Core como "no aplica" y filtrarlos.
  - [x] Página de documentos del cliente (`frontend/app/clientes/[id]/documentos/page.tsx`) ahora consume el Core, muestra frecuencia por documento y sincroniza documentos subidos contra el Core mediante matching difuso.
  - [x] Flujo de "no aplica" + sincronización de documentos probado con el cliente 7 (Constructora Piloto Andina SAS):
    - `PUT /clientes/7/documentos-no-aplica` marca documentos como no aplica.
    - `GET /clientes/7/core-documentos` refleja los flags `no_aplica`.
    - `POST /procesos/2324/preseleccion/7` excluye los documentos no aplica del cálculo de faltantes.
    - Matching difuso reconoce RUP, estados financieros y certificados de experiencia subidos.
    - Frontend build pasa; preselección y documentos renderizan estados correctamente.
  - [x] Validación del Core v3.0-corpus con **cliente tipo constructora** (ID 9) e ID 10:
    - Perfil tipo: constructora de Bogotá/Cundinamarca, UNSPSC 72140000 + 72120000, presupuesto $500M–$5B, patrimonio $2B, experiencia $15B en 3 contratos, indicadores financieros completos, CRP 80%.
    - Cliente tipo completo (18 documentos: 13 obligatorios + 4 frecuentes + 1 según pliego) contra proceso 2045 (CO1.REQ.10449030, El Rosal, Cundinamarca):
      - Score base: 100
      - Score pliego: 96
      - **Score total: 99 → Recomendación: Participar**
      - 0 documentos faltantes del Core; todos los requisitos del pliego cubiertos.
    - Cliente tipo ligero (solo 12 obligatorios, sin frecuentes) contra el mismo proceso:
      - Score total: 44 → Recomendación: No participar
      - Faltantes: Autorización de datos personales, Pacto de transparencia, Conformación de proponente plural, Matriz 2, Matriz 4.
      - Confirma que los documentos frecuentes del Core realmente se piden en los pliegos.
  - [x] **Verificación de piloto real end-to-end** con cliente 11 (Constructora Piloto Real SAS):
    - Registro via `POST /clientes`.
    - Subida de 17 documentos via `POST /clientes/11/documentos` (DOCX de prueba).
    - Extracción automática de RUP (NIT, razón social, vigencia).
    - Radar via `POST /radar/correr/11` sin errores SSL.
    - Análisis de pliego via `POST /procesos/2045/pliego/11`: 9 requisitos detectados, 9 cumplidos, score 100.
    - Preselección via `POST /procesos/2045/preseleccion/11`: **score 99 → Recomendación: Participar**.
  - [x] Solución al error SSL de SECOP II (`community.secop.gov.co`):
    - Creados `backend/certs/globalsign_root_ca_r3.pem` y `backend/certs/globalsign_rsa_ov_ssl_ca_2018.pem`.
    - Creado `backend/install_secop_certs.py` para instalar los certificados intermedios en el bundle de certifi.
  - [x] Extracción de texto de todo el corpus descargado (2.390 archivos / 5,72 GB) con estrategia selectiva de OCR:
    - Script: `backend/extraer_texto_todos_documentos.py`.
    - Resultado: 1.699 archivos con texto extraído, 432 escaneados no relevantes omitidos, 1 fallido (`.DS_Store.pdf` corrupto).
    - Tiempo: ~98 minutos.
    - Log: `storage/extraccion_texto_todos_documentos.json`.
  - [x] Análisis enriquecido del corpus completo por proceso:
    - Script: `backend/analizar_corpus_procesos.py`.
    - 101 procesos analizados, 0 errores, 8.511.330 palabras consolidadas (~84.271 palabras/proceso).
    - Salidas: `storage/analisis_corpus/{proceso_id}.json` y `storage/analisis_corpus_resumen.json`.
    - Extrae requisitos estructurados del corpus completo (pliego + anexos + formatos + estudios previos).
    - Extrae matrices Excel: Matriz 1 Experiencia, Matriz 2 Indicadores, Matriz 3 Riesgos, Matriz 4 Bienes Relevantes.
  - [x] Reporte de frecuencia de nombres de archivo reales: `storage/reporte_nombres_archivos_corpus.json/.csv`.
  - [x] Mejorada la detección de matrices Excel en `backend/extraccion/requisitos_pliego.py` y `backend/analizar_corpus_procesos.py` con puntuación por nombre de archivo y exclusión de falsos positivos.
  - [x] Core de Documentos Base Fijos regenerado a partir del corpus completo (**v3.0-corpus**):
    - Script: `backend/consolidar_core_corpus.py`.
    - Reemplazó `storage/core_documentos_base_fijos.json` y `.csv`.
    - Backup del Core anterior: `storage/core_documentos_base_fijos_v2.json`.
    - 13 documentos del proponente ahora son obligatorios (>70% de los procesos).
    - 4 documentos del proponente son frecuentes (30–70%).
    - 3 documentos del proponente quedan como "según pliego".

### ⏳ Pendiente

- [ ] Mejorar la UX del panel del Core (filtros ya existen; se puede agregar exportación o vista de auditoría).
- [ ] Refinar detección de documentos poco frecuentes pero relevantes: declaración de renta, certificación de no intervención / inhabilidades.

### 🚧 Bloqueo resuelto

**Las descargas de SECOP II requirieron resolver reCAPTCHA.** Se resolvió manualmente en modo batch: una sola sesión de Chrome procesó múltiples procesos y solo fue necesario resolver el CAPTCHA al inicio de cada batch.

Configuración utilizada en `backend/.env`:

```env
SCOP_SCRAPER_ENABLED=true
CAPTCHA_SOLVER=manual
CAPTCHA_API_KEY=tu_key_aqui
```

---

## 4. Scripts clave y cómo usarlos

### Descargar pliegos (modo batch, una sesión de Chrome)

```bash
cd backend
source venv/bin/activate
python descargar_100_pliegos.py
```

### Analizar los 100 pliegos

```bash
cd backend
source venv/bin/activate
TESSERACT_CMD=/opt/homebrew/bin/tesseract python analizar_100_pliegos.py --resume
```

### Consolidar el Core de Documentos Base Fijos

```bash
cd backend
source venv/bin/activate
TESSERACT_CMD=/opt/homebrew/bin/tesseract python consolidar_core_documentos.py --masivo
```

---

## 5. Archivos importantes

| Archivo | Descripción |
|---------|-------------|
| `storage/muestra_100_pliegos.csv` | Muestra estratificada de 100 procesos. |
| `storage/muestra_100_pliegos_faltantes.csv` | Celdas donde no había suficientes procesos en BD. |
| `storage/procesos/` | Directorio donde se guardan documentos descargados. |
| `storage/analisis_100_pliegos.json` | Resultado del análisis masivo (JSON completo). |
| `storage/analisis_100_pliegos.csv` | Resultado del análisis masivo (CSV resumido). |
| `storage/resumen_100_pliegos.json` | Estadísticas agregadas del análisis. |
| `storage/descarga_100_pliegos.json` | Log de descargas. |
| `storage/resumen_descarga_100_pliegos.json` | Resumen de descargas. |
| `storage/core_documentos_base_fijos.json` | Core de Documentos Base Fijos (JSON). |
| `storage/core_documentos_base_fijos.csv` | Core de Documentos Base Fijos (CSV). |
| `storage/extraccion_texto_todos_documentos.json` | Log de extracción de texto de todo el corpus. |
| `storage/analisis_corpus/` | Análisis enriquecido por proceso (pliego + anexos + formatos). |
| `storage/analisis_corpus_resumen.json` | Resumen global del análisis del corpus completo. |
| `backend/sample_100_pliegos.py` | Generador de la muestra. |
| `backend/analizar_100_pliegos.py` | Analizador masivo de pliegos. |
| `backend/descargar_100_pliegos.py` | Descargador masivo de pliegos. |
| `backend/consolidar_core_documentos.py` | Consolidador del Core de Documentos Base Fijos. |
| `backend/extraccion/requisitos_pliego.py` | Extractor estructurado de requisitos. |
| `backend/analizador_pliego.py` | Análisis de pliego + OCR + requisitos. |
| `backend/actualizar_documentos_requeridos.py` | Re-procesa textos ya descargados para ajustar detección de documentos requeridos. |
| `backend/extraer_texto_todos_documentos.py` | Extrae texto de todo el corpus descargado (pliegos + anexos + formatos) con OCR selectivo. |
| `backend/analizar_corpus_procesos.py` | Consolida texto por proceso y extrae requisitos enriquecidos del corpus completo. |
| `backend/consolidar_core_corpus.py` | Regenera el Core usando el análisis del corpus completo (101 procesos). |
| `backend/reporte_nombres_archivos_corpus.py` | Genera reporte de frecuencia de nombres de archivo descargados. |
| `backend/install_secop_certs.py` | Instala certificados CA intermedios necesarios para SSL de SECOP II. |
| `backend/certs/` | Certificados PEM de GlobalSign para verificar `community.secop.gov.co`. |
| `backend/preseleccion.py` | Motor de preselección; ahora consume el Core de documentos base. |
| `backend/main.py` | Expone `GET /core-documentos` y el resultado de preselección incluye el Core. |
| `backend/encontrar_reemplazos_muestra.py` | Busca reemplazos para los procesos faltantes manteniendo estratificación. |
| `backend/aplicar_reemplazos_muestra.py` | Actualiza el CSV de la muestra con los reemplazos seleccionados. |
| `backend/buscar_noticeuid_faltantes.py` | Busca noticeUID de los procesos faltantes usando el buscador de SECOP II. |
| `backend/descargar_faltantes_con_noticeuid.py` | Actualiza url_documento de los faltantes y los descarga usando el scraper batch. |
| `frontend/app/preseleccion/page.tsx` | Pantalla de preselección que renderiza el Core de documentos y permite marcar "no aplica". |
| `frontend/app/clientes/[id]/documentos/page.tsx` | Pantalla de documentos del cliente; consume el Core y sincroniza documentos subidos. |

---

## 6. Notas para retomar en otra sesión

1. **Activar entorno:**
   ```bash
   cd /Users/pc/Documents/GitHub/secop-radar/backend
   source venv/bin/activate
   ```

2. **Leer este archivo** (`ESTADO_TAREA_3.md`) para entender el estado actual.

3. **Si se modifican documentos o se descargan más pliegos:**
   ```bash
   # Reanudar análisis (salta los 100 ya analizados)
   TESSERACT_CMD=/opt/homebrew/bin/tesseract python analizar_100_pliegos.py --resume

   # Regenerar Core
   TESSERACT_CMD=/opt/homebrew/bin/tesseract python consolidar_core_documentos.py --masivo
   ```

4. **Para volver a la muestra original** (antes de los reemplazos):
   ```bash
   cp storage/muestra_100_pliegos_original.csv storage/muestra_100_pliegos.csv
   ```

5. **Para buscar nuevos reemplazos** si se cambia la muestra:
   ```bash
   python backend/encontrar_reemplazos_muestra.py
   python backend/aplicar_reemplazos_muestra.py
   python backend/descargar_100_pliegos.py
   TESSERACT_CMD=/opt/homebrew/bin/tesseract python analizar_100_pliegos.py --resume
   TESSERACT_CMD=/opt/homebrew/bin/tesseract python consolidar_core_documentos.py --masivo
   ```

6. **Al finalizar cada sesión:** actualizar este archivo con el progreso realizado.

---

## 7. Próxima acción sugerida

1. **Actualizar la documentación del producto** (README/CLAUDE.md) con la nueva funcionalidad del Core, checklist de documentos y guía de instalación de certificados SSL.
2. **Mejorar la extracción automática de estados financieros** para que el perfil del cliente se complete sin intervención manual (hoy extrae el texto pero no siempre los números).
3. **Refinar la detección de matrices**: muchas Matriz 1 y Matriz 2 no se encontraron por nombre de archivo; revisar si usan otros nombres (ej. `FORMATOS.xlsx`, `Anexo_*.xlsx`) o si no están en los documentos descargados.
4. **Refinar detección de documentos poco frecuentes** si el negocio lo requiere:
   - Declaración de renta / carga tributaria.
   - Certificación de no intervención / inhabilidades.
5. **Agregar exportación o vista de auditoría** del Core (por ejemplo, descargar CSV desde el panel o ver qué pliegos requieren cada documento).
6. **Preparar entorno de producción**: instalar certificados en el deploy (Railway/Vercel) y confirmar flujo de CAPTCHA manual para descargas de documentos.
