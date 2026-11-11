"""Run against an exported site: STUDIO_BASE_URL=http://127.0.0.1:8274 python tests/studio-netarea.browser.py."""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get('STUDIO_BASE_URL', 'http://127.0.0.1:8274')
ARTIFACTS = Path(__file__).resolve().parents[1] / 'docs/reports/netarea2b'
ARTIFACTS.mkdir(parents=True, exist_ok=True)


def contained(page, viewport):
    result = page.locator('#studio-soil-popover').evaluate('''el => {
      const r = el.getBoundingClientRect(), s = document.querySelector('.studio-stage-canvas-host').getBoundingClientRect();
      return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, stage:{left:s.left, top:s.top, right:s.right, bottom:s.bottom}, scroll:el.scrollHeight > el.clientHeight};
    }''')
    assert result['left'] >= max(0, result['stage']['left'])
    assert result['top'] >= max(0, result['stage']['top'])
    assert result['right'] <= min(viewport['width'], result['stage']['right']) + 1
    assert result['bottom'] <= min(viewport['height'], result['stage']['bottom']) + 1
    text = page.locator('#studio-soil-popover').inner_text()
    for row in ['Entered by farmer', 'Width', 'Length', 'Area', 'm²', 'decimals', 'Share of field', '%', 'Illustrative', 'Edit on My field']:
        assert row in text, (row, text)
    return result


def capture(page, name):
    # Freeze animation scheduling while SwiftShader reads the framebuffer.
    page.evaluate('''() => {
      window.captureRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => { window.capturePending = callback; return 0; };
    }''')
    try:
        page.screenshot(path=str(ARTIFACTS / f'{name}.png'), timeout=120000)
    finally:
        page.evaluate('''() => {
          window.requestAnimationFrame = window.captureRaf;
          if (window.capturePending) { const callback = window.capturePending; window.capturePending = null; requestAnimationFrame(callback); }
        }''')


def run(browser_type, name, width, height, scale):
    browser = browser_type.launch(headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--renderer-process-limit=1', '--num-raster-threads=1', '--no-zygote', '--single-process'])
    viewport = {'width': width, 'height': height}
    context = browser.new_context(viewport=viewport, device_scale_factor=scale, is_mobile=name == 'phone', has_touch=name == 'phone', reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    page.set_default_timeout(45000)
    errors = []
    def press(selector):
        target = page.locator(selector)
        target.tap() if name == 'phone' else target.click()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.add_init_script('''Object.defineProperty(navigator, 'deviceMemory', {get: () => 4});
      localStorage.setItem('ropon-radar.workspace.3', JSON.stringify({lang:'en',fieldId:'mithapukur',netInputs:{mithapukur:{bundWidthM:0.4,drainWidthM:0.1,pathWidthM:0.5,otherDecimals:0}}}));''')
    page.goto(BASE + '/#rotations')
    page.locator('[data-measurements]').wait_for()
    page.wait_for_function("!document.querySelector('.studio-loading-overlay')")
    page.evaluate("window.scrollTo(0, document.querySelector('.studio-stage-canvas-host').getBoundingClientRect().top + window.scrollY - 72)")
    press('#soil-pin-drain')
    assert page.locator('#soil-pin-drain').get_attribute('aria-expanded') == 'true'
    bounds = contained(page, viewport)
    assert '0.1 m' in page.locator('#studio-soil-popover').inner_text()
    page.locator('#studio-soil-popover').evaluate('el => el.scrollTop = el.scrollHeight')
    contained(page, viewport)
    page.locator('#studio-soil-popover').evaluate('el => el.scrollTop = 0')
    print(name, '3D card', bounds, 'Chrome', browser.version, flush=True)
    capture(page, name + '-3d-selected')
    press('[data-close-soil]')
    assert page.locator('#studio-soil-popover').is_hidden()
    assert page.locator('.studio-feature-chip.highlight').count() == 0
    press('#btn-view-2d')
    page.wait_for_function("document.querySelectorAll('[data-measurement]').length === 4")
    labels = page.locator('.studio-measurements text').all_text_contents()
    assert all(value in labels for value in ['0.4 m', '0.1 m', '0.5 m']), labels
    # De-overlap and stationary-camera stability.
    positions = page.locator('.studio-measurements text').evaluate_all('els => els.map(el => ({x:el.getAttribute("x"), y:el.getAttribute("y")}))')
    page.wait_for_timeout(150)
    assert positions == page.locator('.studio-measurements text').evaluate_all('els => els.map(el => ({x:el.getAttribute("x"), y:el.getAttribute("y")}))')
    for feature in ['bund', 'drain', 'path']:
        marker = page.locator(f'[data-measurement="{feature}"] .studio-dimension-line')
        point = marker.evaluate('el => { const r = el.ownerSVGElement.getBoundingClientRect(); return {x:r.left+(+el.getAttribute("x1") + +el.getAttribute("x2"))/2,y:r.top+(+el.getAttribute("y1") + +el.getAttribute("y2"))/2}; }')
        if name == 'phone':
            page.touchscreen.tap(point['x'], point['y'])
        else:
            page.mouse.click(point['x'], point['y'])
        assert page.locator(f'#soil-pin-{feature}').get_attribute('aria-expanded') == 'true', feature
        contained(page, viewport)
        press('[data-close-soil]')
    press('[data-measurements]')
    assert page.locator('[data-measurements]').get_attribute('aria-pressed') == 'false'
    assert page.locator('[data-measurement]').count() == 0
    press('[data-measurements]')
    page.wait_for_function("document.querySelectorAll('[data-measurement]').length === 4")
    capture(page, name + '-top-measurements')
    press('#soil-pin-bund')
    page.keyboard.press('Escape')
    assert page.locator('#studio-soil-popover').is_hidden()
    # Partial stage scrolling still clamps the card to the visible viewport.
    page.evaluate('window.scrollBy(0, 90)')
    press('#soil-pin-path')
    contained(page, viewport)
    press('[data-close-soil]')
    assert not errors, errors
    print(name, 'Top labels, all direct feature picks, toggle, Escape, scroll and console passed', flush=True)
    result = {'viewport': viewport, 'scale': scale, 'chrome': browser.version, 'labels': labels, 'popover': bounds, 'consoleErrors': errors}
    browser.close()
    return result


with sync_playwright() as playwright:
    results = [run(playwright.chromium, *values) for values in [('desktop', 1366, 768, 1), ('phone', 412, 915, 2.625)]]
    (ARTIFACTS / 'browser-results.json').write_text(json.dumps(results, indent=2) + '\n')
