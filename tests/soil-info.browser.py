"""After npm run build: python tests/soil-info.browser.py (requires Python Playwright)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def log_message(self, *_args):
        pass


def check_cards(page, width):
    layers = page.locator('.studio-soil-layers')
    layers.evaluate('el => el.open = true')
    assert page.locator('.studio-inspection, #probe-card, #transect-card').count() == 0
    cards = layers.locator('.soil-info')
    assert cards.count() == 3
    for index in range(3):
        info = cards.nth(index)
        button = info.locator('summary')
        button.scroll_into_view_if_needed()
        rect = button.bounding_box()
        assert rect['width'] == 22 and rect['height'] == 22, rect
        header = button.locator('..').locator('..').bounding_box()
        assert abs(rect['x'] + 22 - header['x'] - header['width']) < 1
        button.click()
        page.wait_for_function("document.querySelectorAll('.soil-info[open]').length === 1")
        popover = info.locator('div')
        bounds = popover.bounding_box()
        assert bounds and bounds['width'] <= 280, bounds
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= width, bounds
        assert bounds['y'] >= 0 and bounds['y'] + bounds['height'] <= page.viewport_size['height'], bounds
        page.keyboard.press('Escape')
        assert not info.evaluate('el => el.open')
        assert button.evaluate('el => el === document.activeElement')
        button.click()
        page.wait_for_function("document.querySelectorAll('.soil-info[open]').length === 1")
        layers.locator('.callout-title').nth(index).click()
        assert not info.evaluate('el => el.open')
        layers.evaluate('el => el.open = true')
    print(f'{width}px: three 22px circles, viewport bounds, Escape/focus, outside click passed', flush=True)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=['--disable-dev-shm-usage', '--no-zygote', '--single-process'])
        context = browser.new_context(viewport={'width': 412, 'height': 906}, reduced_motion='reduce',
                                      service_workers='block')
        page = context.new_page()
        page.set_default_timeout(30000)
        page.add_init_script("localStorage.setItem('ropon-radar.workspace.3', JSON.stringify({lang: 'en', fieldId: 'mithapukur'}))")
        page.goto(f'http://127.0.0.1:{server.server_port}/#rotations')
        page.locator('.studio-soil-layers .soil-info').first.wait_for()
        for width in [412, 1366, 1882]:
            page.set_viewport_size({'width': width, 'height': 906})
            check_cards(page, width)
        browser.close()
finally:
    server.shutdown()
