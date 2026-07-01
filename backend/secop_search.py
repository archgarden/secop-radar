"""Búsqueda de noticeUID en el buscador público de SECOP II.

Este módulo permite encontrar la URL de detalle (noticeUID) de un proceso cuando
el radar solo tiene el número de proceso o la referencia, pero no la URL directa.

Se asume que el navegador ya está autenticado frente al CAPTCHA (manualmente o
vía extensión NopeCHA) antes de llamar a `buscar_notice_uid_en_buscador`.
"""

import logging
import re
import time
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Page

from models import Proceso

logger = logging.getLogger("secop_search")

SEARCH_URL = "https://community.secop.gov.co/Public/Tendering/OpportunityNoticesList/Index"


def extraer_notice_uid(url: str) -> str | None:
    """Extrae noticeUID de una URL de detalle de SECOP II."""
    if not url or "noticeUID" not in url:
        return None
    return parse_qs(urlparse(url).query).get("noticeUID", [None])[0]


def _detectar_campo_busqueda(page: Page) -> tuple:
    """Detecta el campo y botón de búsqueda disponibles en la página."""
    # Buscador avanzado (página principal de oportunidades).
    for selector in ["#txtProcedureDataAdvancedSearch", "input[name='VB_txtProcedureDataAdvancedSearch']"]:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=5000):
                return el, "advanced"
        except Exception:
            continue

    # Buscador simple (fallback).
    for selector in ["#txtAllWords2Search", "input[name='VB_txtAllWords2Search']"]:
        try:
            el = page.locator(selector).first
            if el.is_visible(timeout=5000):
                return el, "simple"
        except Exception:
            continue

    return None, None


def _esperar_resultados(page: Page, timeout: int = 30) -> bool:
    """Espera a que aparezca la tabla de resultados o el mensaje de sin resultados."""
    start = time.time()
    while time.time() - start < timeout:
        content = page.content().lower()
        if "grdresultlist" in content or "tblmaintable" in content:
            return True
        if "no existen resultados" in content or "no results" in content:
            return True
        time.sleep(0.5)
    return False


def buscar_notice_uid_en_buscador(
    page: Page,
    proceso: Proceso,
    timeout_captcha: int = 120,
    timeout_resultados: int = 30,
) -> str | None:
    """Busca el noticeUID de un proceso en el buscador público de SECOP II.

    Args:
        page: Página de Playwright con una sesión ya autenticada (CAPTCHA resuelto).
        proceso: Instancia del proceso a buscar.
        timeout_captcha: Tiempo máximo para esperar a que el buscador esté listo.
        timeout_resultados: Tiempo máximo para esperar resultados tras buscar.

    Returns:
        noticeUID si se encuentra, None en caso contrario.
    """
    termino = proceso.numero_proceso or proceso.referencia_proceso
    if not termino:
        logger.warning("Proceso %s no tiene número ni referencia para buscar", proceso.id)
        return None

    logger.info("Buscando noticeUID para proceso %s con término '%s'", proceso.id, termino)

    # Navegar al buscador y esperar a que esté listo (CAPTCHA si aplica).
    page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=120000)

    if not _wait_for_search_page(page, timeout_captcha):
        logger.warning("El buscador de SECOP II no estuvo listo tras %ds", timeout_captcha)
        return None

    campo, modo = _detectar_campo_busqueda(page)
    if not campo:
        logger.warning("No se detectó campo de búsqueda en el buscador")
        return None

    try:
        campo.fill("")
        campo.fill(termino)

        # Limpiar filtros de fecha para buscar en todo el histórico.
        page.evaluate(
            """() => {
                const fromField = document.getElementById('dtmbPublishDateFrom_txt');
                const toField = document.getElementById('dtmbPublishDateTo_txt');
                if (fromField) fromField.value = '';
                if (toField) toField.value = '';
            }"""
        )

        # Intentar enviar con la tecla Enter (funciona en ambos modos).
        campo.press("Enter")

        if not _esperar_resultados(page, timeout_resultados):
            logger.warning("No se cargaron resultados tras buscar '%s'", termino)
            return None

        # Buscar enlaces a OpportunityDetail en toda la página.
        links = page.locator("a[href*='OpportunityDetail/Index']").all()
        logger.info("Se encontraron %d enlaces de detalle", len(links))

        for link in links:
            href = link.get_attribute("href") or ""
            notice_uid = extraer_notice_uid(href)
            if notice_uid:
                logger.info("noticeUID encontrado: %s", notice_uid)
                return notice_uid

        # Si no hay enlaces, verificar mensaje de sin resultados.
        content = page.content().lower()
        if "no existen resultados" in content:
            logger.info("SECOP II reporta 'No existen resultados' para '%s'", termino)
        else:
            logger.info("No se encontró noticeUID para '%s'", termino)
        return None

    except Exception as exc:
        logger.exception("Error buscando noticeUID para proceso %s: %s", proceso.id, exc)
        return None


def _wait_for_search_page(page: Page, timeout_seconds: int) -> bool:
    """Espera a que el buscador esté listo (CAPTCHA resuelto)."""
    logger.info("Esperando buscador listo (máx %ds)...", timeout_seconds)
    for i in range(timeout_seconds):
        time.sleep(1)
        title = page.title()
        url = page.url

        if i % 10 == 0:
            logger.info("  [%ds] URL=%s | title=%s", i, url, title)

        # Si ya aparece el campo de búsqueda, estamos listos.
        try:
            if page.locator("#txtProcedureDataAdvancedSearch, #txtAllWords2Search").first.is_visible(timeout=2000):
                logger.info("Buscador listo después de %ds", i)
                return True
        except Exception:
            pass

    logger.warning("Buscador no estuvo listo en %ds", timeout_seconds)
    return False
