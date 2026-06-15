import logging
import os
from datetime import datetime
from typing import Any, Iterable

import resend
from dotenv import load_dotenv

from models import Cliente, Proceso

load_dotenv()

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
REMITENTE = os.getenv("RESEND_FROM", "SECOP Radar <radar@archgarden.ai>")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

logger = logging.getLogger("notificaciones")

COLOR_FONDO = "#0f1117"
COLOR_SUPERFICIE = "#1a1d27"
COLOR_BORDE = "#2a2d3a"
COLOR_TEXTO = "#e2e8f0"
COLOR_TEXTO_SEC = "#64748b"
COLOR_AZUL = "#3b82f6"
COLOR_VERDE = "#22c55e"
COLOR_ROJO = "#ef4444"
COLOR_AMARILLO = "#f59e0b"

FOOTER_HTML = (
    f'<div style="color:{COLOR_TEXTO_SEC};font-size:12px;text-align:center;'
    f'padding:24px 0;border-top:1px solid {COLOR_BORDE};margin-top:24px;">'
    f"SECOP Radar — Arch Garden AI</div>"
)


def _formato_cop(valor: Any) -> str:
    try:
        n = int(valor or 0)
    except (TypeError, ValueError):
        n = 0
    return "$" + f"{n:,}".replace(",", ".")


def _formato_fecha(dt: datetime | None) -> str:
    if not dt:
        return "Sin fecha"
    return dt.strftime("%d/%m/%Y")


def _color_badge(score: int) -> str:
    if score > 70:
        return COLOR_VERDE
    if score >= 40:
        return COLOR_AMARILLO
    return COLOR_ROJO


def _extraer_proceso_score(item: Any) -> tuple[Proceso, int]:
    if hasattr(item, "proceso") and hasattr(item, "score_match"):
        return item.proceso, int(item.score_match or 0)
    if isinstance(item, (tuple, list)) and len(item) == 2:
        return item[0], int(item[1] or 0)
    return item, 0


def _enviar(destinatario: str, asunto: str, html: str) -> dict | None:
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY vacía — imprimiendo correo (modo debug)")
        print("=" * 72)
        print(f"PARA:    {destinatario}")
        print(f"ASUNTO:  {asunto}")
        print("-" * 72)
        print(html)
        print("=" * 72)
        return None

    try:
        return resend.Emails.send(
            {
                "from": REMITENTE,
                "to": [destinatario],
                "subject": asunto,
                "html": html,
            }
        )
    except Exception as exc:
        logger.exception("Resend falló enviando a %s: %s", destinatario, exc)
        return None


def _tarjeta_proceso(proceso: Proceso, score: int) -> str:
    color = _color_badge(score)
    presupuesto = _formato_cop(proceso.presupuesto)
    fecha = _formato_fecha(proceso.fecha_cierre)
    entidad = proceso.entidad or "Entidad sin nombre"
    objeto = proceso.objeto or ""
    url = proceso.url_documento or "#"

    boton = (
        f'<a href="{url}" style="display:inline-block;background:{COLOR_AZUL};'
        f'color:#ffffff;padding:8px 16px;text-decoration:none;border-radius:4px;'
        f'font-size:13px;font-weight:600;margin-top:12px;">Ver pliego</a>'
        if proceso.url_documento
        else ""
    )

    return f"""
<div style="background:{COLOR_SUPERFICIE};border:1px solid {COLOR_BORDE};
            border-radius:6px;padding:20px;margin-bottom:16px;">
  <div style="color:{COLOR_AZUL};font-size:20px;font-weight:600;margin-bottom:8px;
              font-family:Inter,Arial,sans-serif;">{entidad}</div>
  <div style="color:{COLOR_TEXTO};font-size:14px;line-height:1.5;margin-bottom:14px;
              font-family:Inter,Arial,sans-serif;">{objeto}</div>
  <table cellpadding="0" cellspacing="0" style="width:100%;
         font-family:Inter,Arial,sans-serif;">
    <tr>
      <td style="color:{COLOR_TEXTO_SEC};font-size:12px;padding:2px 0;">Presupuesto</td>
      <td style="color:{COLOR_TEXTO};font-size:13px;text-align:right;font-weight:600;">
        {presupuesto}
      </td>
    </tr>
    <tr>
      <td style="color:{COLOR_TEXTO_SEC};font-size:12px;padding:2px 0;">Fecha límite</td>
      <td style="color:{COLOR_TEXTO};font-size:13px;text-align:right;">{fecha}</td>
    </tr>
    <tr>
      <td style="color:{COLOR_TEXTO_SEC};font-size:12px;padding:6px 0 0;">Score</td>
      <td style="text-align:right;padding:6px 0 0;">
        <span style="display:inline-block;background:{color};color:#0f1117;
                     padding:4px 10px;border-radius:4px;font-size:12px;font-weight:700;">
          {score}/100
        </span>
      </td>
    </tr>
  </table>
  {boton}
</div>
"""


def enviar_alerta_nuevos_procesos(
    cliente: Cliente, procesos: Iterable[Any]
) -> dict | None:
    items = [_extraer_proceso_score(p) for p in procesos]
    n = len(items)
    if n == 0:
        logger.info("Sin procesos nuevos para %s, no se envía correo", cliente.email)
        return None

    asunto = f"SECOP Radar — {n} nuevos procesos compatibles"
    tarjetas = "".join(_tarjeta_proceso(p, s) for p, s in items)

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:{COLOR_FONDO};margin:0;padding:0;
             font-family:Inter,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;background:{COLOR_FONDO};">
    <div style="color:{COLOR_TEXTO};font-size:22px;font-weight:700;margin-bottom:4px;">
      SECOP Radar
    </div>
    <div style="color:{COLOR_TEXTO_SEC};font-size:14px;margin-bottom:24px;">
      Hola {cliente.nombre}, detectamos {n} procesos compatibles con tu perfil.
    </div>
    {tarjetas}
    {FOOTER_HTML}
  </div>
</body>
</html>"""

    return _enviar(cliente.email, asunto, html)


def enviar_alerta_adenda(
    cliente: Cliente, proceso: Proceso, descripcion_cambio: str
) -> dict | None:
    asunto = f"⚠️ ADENDA — {proceso.entidad or 'Entidad'}"

    fecha_limite = _formato_fecha(proceso.fecha_cierre)
    presupuesto = _formato_cop(proceso.presupuesto)
    url = proceso.url_documento

    boton = (
        f'<a href="{url}" style="display:inline-block;background:{COLOR_AZUL};'
        f'color:#ffffff;padding:8px 16px;text-decoration:none;border-radius:4px;'
        f'font-size:13px;font-weight:600;margin-top:12px;">Ver pliego actualizado</a>'
        if url
        else ""
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:{COLOR_FONDO};margin:0;padding:0;
             font-family:Inter,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:{COLOR_FONDO};">
    <div style="background:{COLOR_AMARILLO};color:#0f1117;padding:14px 24px;
                font-size:15px;font-weight:700;letter-spacing:0.3px;">
      ⚠️ ADENDA DETECTADA — Revisa los cambios
    </div>
    <div style="padding:24px;">
      <div style="color:{COLOR_TEXTO_SEC};font-size:14px;margin-bottom:16px;">
        Hola {cliente.nombre}, un proceso que estás siguiendo fue modificado.
      </div>
      <div style="background:{COLOR_SUPERFICIE};border:1px solid {COLOR_BORDE};
                  border-radius:6px;padding:20px;margin-bottom:16px;">
        <div style="color:{COLOR_AZUL};font-size:20px;font-weight:600;
                    margin-bottom:8px;">{proceso.entidad or ''}</div>
        <div style="color:{COLOR_TEXTO};font-size:14px;line-height:1.5;
                    margin-bottom:14px;">{proceso.objeto or ''}</div>
        <table cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="color:{COLOR_TEXTO_SEC};font-size:12px;padding:2px 0;">
              Presupuesto
            </td>
            <td style="color:{COLOR_TEXTO};font-size:13px;text-align:right;
                       font-weight:600;">{presupuesto}</td>
          </tr>
          <tr>
            <td style="color:{COLOR_TEXTO_SEC};font-size:12px;padding:2px 0;">
              Nueva fecha límite
            </td>
            <td style="color:{COLOR_AMARILLO};font-size:13px;text-align:right;
                       font-weight:600;">{fecha_limite}</td>
          </tr>
        </table>
      </div>
      <div style="background:{COLOR_SUPERFICIE};border-left:3px solid {COLOR_AMARILLO};
                  padding:14px 18px;border-radius:4px;margin-bottom:16px;">
        <div style="color:{COLOR_TEXTO_SEC};font-size:11px;text-transform:uppercase;
                    letter-spacing:0.5px;margin-bottom:6px;">Qué cambió</div>
        <div style="color:{COLOR_TEXTO};font-size:14px;line-height:1.5;">
          {descripcion_cambio}
        </div>
      </div>
      {boton}
      {FOOTER_HTML}
    </div>
  </div>
</body>
</html>"""

    return _enviar(cliente.email, asunto, html)
