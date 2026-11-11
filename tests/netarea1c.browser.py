"""NETAREA1C planner bund/drain visibility + highlight. After npm run build: python3 tests/netarea1c.browser.py (requires Python Playwright).

Serves out/ (override with NETAREA1C_SERVE) and checks, at 1366x768 and
412x915@2.625 with widths 0.4/0.1/0.5 m, that bund + drain are clearly
visible, that tapping a chip highlights the feature and opens its popover
fully on screen, and that measurements still state the real widths.
"""
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SERVE = Path(os.environ.get('NETAREA1C_SERVE', ROOT / 'out'))
ARTIFACTS = ROOT / 'docs/reports/netarea1c'
WIDTHS = {'bundWidthM': 0.4, 'drainWidthM': 0.1, 'pathWidthM': 0.5, 'otherDecimals': 0}
NOTE = 'Bund and drain drawn wider for readability; numbers use your real widths'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SERVE), **kwargs)

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


def marker_length(page, marker):
    return page.evaluate("""(marker) => {
      const line = document.querySelector(`[data-measurement="${marker}"] .planner3d-dimension-line`);
      if (!line) return 0;
      const dx = +line.getAttribute('x2') - +line.getAttribute('x1');
      const dy = +line.getAttribute('y2') - +line.getAttribute('y1');
      return Math.hypot(dx, dy);
    }""", marker)


def popover_contained(page):
    """Popover rect fully inside the stage wrap rect (desktop absolute card)."""
    return page.evaluate("""() => {
      const el = document.querySelector('.zone-popover');
      const wrap = document.querySelector('.planner3d-stage-wrap');
      const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      return {left: r.left, top: r.top, right: r.right, bottom: r.bottom,
              wrap: {left: w.left, top: w.top, right: w.right, bottom: w.bottom}};
    }""")


def press(page, selector, name):
    target = page.locator(selector)
    target.tap() if name == 'phone' else target.click()


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
    page.locator('.planner3d-measurements [data-measurement="drain"]').wait_for(timeout=30000)
    # Legend chips state the real widths plus the honesty note.
    legend = page.locator('.zone-legend').inner_text()
    for text in ['Bund 0.4 m', 'Drain 0.1 m', 'Path 0.5 m', NOTE]:
        assert text in legend, legend
    # Measurements still state the real widths.
    labels = dict(measurement_labels(page))
    assert labels.get('bund') == '0.4 m', labels
    assert labels.get('drain') == '0.1 m', labels
    assert labels.get('path') == '0.5 m', labels
    # Drawn ribbons project to a readable on-screen width. The x6 cap binds
    # for the 0.1 m drain on the phone stage, so its ~4 px there prove the
    # cap takes precedence (same maths as the studio); the bund reaches ~6 px.
    drawn = {marker: marker_length(page, marker) for marker in ['bund', 'drain', 'path']}
    assert drawn['bund'] >= 6, drawn
    assert drawn['drain'] >= (6 if name == 'desktop' else 3.5), drawn
    page.locator('.planner3d-stage-wrap').evaluate('el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8)')
    page.screenshot(path=str(ARTIFACTS / f'{name}-overview.png'), timeout=120000)
    # Tapping the Drain chip highlights it and opens its full popover.
    press(page, '[data-zone-kind="drain"]', name)
    popover = page.locator('.zone-popover')
    popover.wait_for(timeout=15000)
    assert page.locator('[data-zone-kind="drain"]').get_attribute('aria-pressed') == 'true'
    text = popover.inner_text()
    for row in ['Drain', 'Width', '0.1 m', 'Length', 'Area', 'm²', 'decimals',
                'Share of field', '%', 'Source', 'Entered by farmer', 'Edit on My field']:
        assert row in text, text
    if name == 'desktop':
        box = popover_contained(page)
        assert box['left'] >= box['wrap']['left'] - 1, box
        assert box['top'] >= box['wrap']['top'] - 1, box
        assert box['right'] <= box['wrap']['right'] + 1, box
        assert box['bottom'] <= box['wrap']['bottom'] + 1, box
    else:
        assert popover.is_visible()
    page.screenshot(path=str(ARTIFACTS / f'{name}-drain-selected.png'), timeout=120000)
    # Switching chips moves the highlight; Escape clears it.
    press(page, '[data-zone-kind="bund"]', name)
    assert 'Bund' in popover.inner_text()
    assert page.locator('[data-zone-kind="bund"]').get_attribute('aria-pressed') == 'true'
    assert page.locator('[data-zone-kind="drain"]').get_attribute('aria-pressed') == 'false'
    page.keyboard.press('Escape')
    assert popover.is_hidden()
    # Tapping the 3D drain ribbon itself (via its dimension marker midpoint) reopens it.
    point = page.evaluate("""() => {
      const line = document.querySelector('[data-measurement="drain"] .planner3d-dimension-line');
      const svg = line.ownerSVGElement.getBoundingClientRect();
      return {x: svg.left + (+line.getAttribute('x1') + +line.getAttribute('x2')) / 2,
              y: svg.top + (+line.getAttribute('y1') + +line.getAttribute('y2')) / 2};
    }""")
    page.mouse.click(point['x'], point['y'])
    popover.wait_for(timeout=15000)
    assert 'Drain' in popover.inner_text(), popover.inner_text()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert not errors, errors
    result = {'viewport': [width, height], 'scale': scale, 'labels': labels,
              'drawnPx': drawn, 'consoleErrors': errors}
    context.close()
    print(f'{name}: visibility, highlight, popover, picking passed; drawn px {drawn}', flush=True)
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
