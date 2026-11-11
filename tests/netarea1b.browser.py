"""NETAREA1B scale annotations. After npm run build: python3 tests/netarea1b.browser.py (requires Python Playwright)."""
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'docs/reports/netarea1b'
WIDTHS = {'bundWidthM': 0.4, 'drainWidthM': 0.1, 'pathWidthM': 0.5, 'otherDecimals': 0}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def log_message(self, *_args):
        pass


def track_errors(page):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    return errors


def measurement_labels(page):
    return page.evaluate("""() => [...document.querySelectorAll('.planner3d-measurements [data-measurement]')]
        .map(g => [g.dataset.measurement, g.querySelector('text')?.textContent])""")


def check_app(browser, base, name, width, height, scale):
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=scale,
                                  is_mobile=name == 'phone', has_touch=name == 'phone',
                                  reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    page.set_default_timeout(60000)
    errors = track_errors(page)
    workspace = {'lang': 'en', 'fieldId': 'mithapukur', 'netInputs': {'mithapukur': WIDTHS}}
    page.add_init_script(f"localStorage.setItem('ropon-radar.workspace.3', JSON.stringify({json.dumps(workspace)}));")
    page.goto(base + '/#planner')
    page.locator('.planner3d-ready .zone-legend').wait_for(timeout=90000)
    page.locator('.planner3d-measurements [data-measurement="bund"]').wait_for(timeout=30000)
    # Toggle chip defaults ON next to the zone chips.
    chip = page.locator('[data-measurements]')
    assert chip.inner_text() == 'Measurements'
    assert chip.get_attribute('aria-pressed') == 'true'
    # Real widths in the labels, including the enlarged 0.1 m drain.
    labels = dict(measurement_labels(page))
    assert labels.get('bund') == '0.4 m', labels
    assert labels.get('drain') == '0.1 m', labels
    assert labels.get('path') == '0.5 m', labels
    assert labels.get('edge', '').endswith(' m'), labels
    assert labels.get('row-spacing') == '↔ 20 cm', labels
    assert labels.get('plant-spacing') == '↕ 20 cm', labels
    assert 'enlarged' in page.locator('.planner3d-crop-chip').inner_text()
    for marker in ['bund', 'drain', 'path']:
        line = page.locator(f'[data-measurement="{marker}"] .planner3d-dimension-line')
        assert line.get_attribute('marker-start') and line.get_attribute('marker-end')
    page.locator('.planner3d-stage-wrap').evaluate('el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8)')
    page.screenshot(path=str(ARTIFACTS / f'{name}-measurements.png'), timeout=120000)
    # Toggle hides and restores the overlay.
    chip.click()
    assert page.evaluate("document.querySelector('.planner3d-measurements').hidden") is True
    assert chip.get_attribute('aria-pressed') == 'false'
    chip.click()
    page.locator('.planner3d-measurements [data-measurement="bund"]').wait_for(timeout=30000)
    # Spacing markers track the sliders live.
    page.locator('#plan-row-range').evaluate("el => { el.value = 30; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    page.wait_for_function("() => [...document.querySelectorAll('.planner3d-measurements [data-measurement] text')].some(t => t.textContent === '↔ 30 cm')", timeout=30000)
    page.locator('#plan-row-range').evaluate("el => { el.value = 20; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    page.wait_for_function("() => [...document.querySelectorAll('.planner3d-measurements [data-measurement] text')].some(t => t.textContent === '↔ 20 cm')", timeout=30000)
    # Top view keeps every marker flat and exact.
    page.locator('[data-action="plan-view"][data-value="top"]').click()
    page.locator('.planner3d-measurements [data-measurement="drain"]').wait_for(timeout=30000)
    labels = dict(measurement_labels(page))
    assert labels.get('drain') == '0.1 m', labels
    assert labels.get('row-spacing') == '↔ 20 cm', labels
    page.screenshot(path=str(ARTIFACTS / f'{name}-measurements-top.png'), timeout=120000)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    result = {'viewport': [width, height], 'scale': scale, 'labels': labels, 'consoleErrors': errors}
    context.close()
    print(f'{name}: markers, toggle, sliders, top view, screenshots passed', flush=True)
    return result


if __name__ == '__main__':
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            report = {}
            for name, width, height, scale in [('desktop', 1366, 768, 1), ('phone', 412, 915, 2.625)]:
                browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader',
                    '--use-angle=swiftshader', '--renderer-process-limit=1', '--num-raster-threads=1', '--no-zygote', '--single-process'])
                report['chrome'] = browser.version
                report[name] = check_app(browser, base, name, width, height, scale)
                browser.close()
                (ARTIFACTS / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
            (ARTIFACTS / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    finally:
        server.shutdown()
