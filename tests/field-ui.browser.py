"""After npm run build: python3 tests/field-ui.browser.py (Python Playwright)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from subprocess import check_output
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/tmp/fieldui-preview')
VIEWPORTS = [(360, 800), (412, 915), (1024, 768), (1100, 768), (1366, 768), (1642, 888), (1920, 1080)]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def log_message(self, *_args):
        pass


def launch(playwright):
    # Container Chromium needs a single process; use a fresh browser per context.
    return playwright.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'])


def open_field(browser, base, width, height, lang='en', reduced_motion='no-preference', journey=None):
    context = browser.new_context(viewport={'width': width, 'height': height}, service_workers='block',
                                  reduced_motion=reduced_motion)
    context.add_init_script("sessionStorage.setItem('ropon_toast_welcome', '1')")
    if journey:
        context.add_init_script(f"localStorage.setItem('ropon_season_plan_v1', JSON.stringify({journey}))")
    page = context.new_page()
    page.errors = []
    page.on('pageerror', lambda error: page.errors.append(str(error)))
    page.set_default_timeout(15000)
    page.goto(base + '/#field')
    page.locator('.leaflet-control-zoom-in').wait_for()
    if lang == 'bn':
        page.locator('[data-lang="bn"]').click()
        page.locator('.leaflet-control-zoom-in').wait_for()
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(400)
    page.evaluate('window.scrollTo(0, 0)')
    return page


def assert_layout(page, width, height):
    metrics = page.evaluate("""() => {
      const box = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return {x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom};
      };
      const card = document.querySelector('.field-card');
      return {scroll: document.documentElement.scrollWidth, map: box('.map-shell'),
        dossier: box('.field-overview > .panel:last-child'), cta: box('.field-recommend .button'),
        card: box('.field-card'), cardOverflow: card.scrollHeight - card.clientHeight,
        headerButton: box('.page-head-actions .button'), nav: box('.leaflet-bar a')};
    }""")
    assert metrics['scroll'] <= width, metrics
    assert metrics['headerButton']['height'] == 40, metrics
    assert metrics['nav']['width'] == metrics['nav']['height'] == 36, metrics
    if width >= 1100:
        assert metrics['map']['bottom'] <= height, metrics
        assert metrics['dossier']['bottom'] <= height, metrics
        assert metrics['cta']['bottom'] <= metrics['card']['bottom'] + 1, metrics
        assert metrics['cardOverflow'] <= 2, metrics
    if width <= 412:
        assert abs(metrics['map']['height'] - max(360, height * .55)) < 2, metrics
        assert metrics['dossier']['y'] >= metrics['map']['bottom'], metrics
    assert page.locator('.data-stat').count() == 5
    assert page.locator('.stat-spark svg').count() >= 4
    assert page.locator('.stat-badge .nasa-badge').count() >= 4
    assert page.locator('.field-meta > div:nth-child(2) dd').is_visible()
    assert not page.errors, page.errors
    return metrics


def interactions(page):
    page.locator('.field-chip').nth(1).click()
    page.wait_for_timeout(400)
    assert page.locator('.field-chip').nth(1).get_attribute('aria-pressed') == 'true'
    assert page.evaluate("""() => {
      const selected = document.querySelector('.field-chip.selected').parentElement;
      const indicator = getComputedStyle(document.querySelector('.field-selector'), '::before');
      return Math.abs(parseFloat(indicator.width) - selected.offsetWidth) < 2;
    }""")
    for width in [412, 1366]:
        page.set_viewport_size({'width': width, 'height': 768})
        page.wait_for_timeout(400)
        assert page.evaluate("""() => {
          const selected = document.querySelector('.field-chip.selected').parentElement;
          const selector = document.querySelector('.field-selector');
          return Math.abs(parseFloat(selector.style.getPropertyValue('--active-width')) - selected.offsetWidth) < 2;
        }""")
    layers = page.locator('.map-layers-menu > summary')
    layers.focus()
    page.keyboard.press('Enter')
    assert page.locator('#layer-opacity-slider').is_visible()
    page.locator('#layer-opacity-slider').focus()
    page.keyboard.press('ArrowLeft')
    assert float(page.locator('#layer-opacity-slider').input_value()) < .6
    page.locator('[data-action="toggle-osm-context"]').click()
    assert page.locator('[data-action="toggle-osm-context"]').get_attribute('aria-pressed') == 'false'
    page.locator('[data-action="set-layer-mode"][data-value="natural"]').click()
    layers.click()
    page.locator('[data-action="set-active-date"]').first.click()
    assert '9 Mar 2024' in page.locator('#map-label').text_content()
    layers.click()
    page.locator('[data-action="toggle-low-ground"]').click()
    layers.click()
    assert page.locator('.low-ground-legend .nasa-badge').is_visible()
    layers.click()
    page.locator('[data-action="draw"]').click()
    page.locator('.corner-marker-handle').first.wait_for()
    assert page.locator('.corner-marker-handle').count() >= 4
    page.locator('[data-action="draw"]').click()
    page.locator('.map-control-btn[aria-label="Full screen"]').click()
    page.wait_for_timeout(400)
    rect = page.locator('.field-map-fullscreen').bounding_box()
    assert abs(rect['x']) < 1 and abs(rect['y']) < 1, rect
    assert rect['height'] == page.viewport_size['height'], rect
    page.locator('.map-control-btn[aria-label="Full screen"]').click()
    page.locator('[data-action="edit-net-area"]').click()
    page.locator('#in-bundWidthM').wait_for()
    page.locator('#modal [data-action="close"]').click()
    page.locator('[data-action="profile"]').click()
    page.locator('#in-irrigation').wait_for()
    page.locator('#modal [data-action="close"]').click()
    page.locator('[data-action="guide-field"]').click()
    page.wait_for_selector('.planty-guide')
    assert page.locator('#field-map .leaflet-overlay-pane path[stroke="#e3f9a2"]').count() > 0
    page.keyboard.press('Escape')
    assert not page.errors, page.errors


def mobile_interactions(page):
    page.locator('.map-shell').scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    assert page.locator('.field-mobile-cta').is_visible()
    assert not page.locator('.map-info').evaluate('(element) => element.open')
    page.locator('.map-info > summary').click()
    assert page.locator('#map-label').is_visible()
    page.locator('.map-info > summary').click()
    page.locator('[data-action="toggle-pick-map"]').click()
    page.locator('#field-map').click(position={'x': 150, 'y': 200})
    page.locator('#inspect-sheet .inspect-sheet-card').wait_for()
    rect = page.locator('#inspect-sheet').bounding_box()
    assert rect['y'] >= 0 and abs(rect['y'] + rect['height'] - page.viewport_size['height']) < 2, rect
    page.locator('[data-action="close-inspect"]').click()
    page.locator('[data-action="toggle-pick-map"]').click()
    page.locator('[data-action="draw"]').click()
    page.locator('[data-action="finish-draw"]').click()
    page.locator('.map-shell').scroll_into_view_if_needed()
    assert page.locator('.map-controls [data-action="reset-demo"]').is_visible()
    info = page.locator('.map-info').bounding_box()
    actions = page.locator('.map-actions').bounding_box()
    assert info['y'] + info['height'] + 8 <= actions['y'], (info, actions)
    assert page.evaluate("""() => !document.querySelector('.field-overview').getAnimations().length""")
    assert not page.errors, page.errors


def active_journey(playwright, base):
    journey = check_output(['node', '--no-warnings', '--input-type=module', '-e',
                            'import {startPlan, getPlan} from "./src/legacy/journey.js"; '
                            'startPlan(); console.log(JSON.stringify(getPlan()))'], cwd=ROOT, text=True)
    for lang in ['en', 'bn']:
        browser = launch(playwright)
        page = open_field(browser, base, 1366, 768, lang, journey=journey)
        assert_layout(page, 1366, 768)
        cta = page.locator('.journey-field-inline [data-journey="field"]')
        assert cta.is_visible()
        cta_box = cta.bounding_box()
        card_box = page.locator('.field-card').bounding_box()
        assert cta_box['y'] + cta_box['height'] <= card_box['y'] + card_box['height']
        browser.close()
    print('Active journey: English/Bengali dossier and Use this field CTA fit laptop fold', flush=True)


def main():
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            active_journey(playwright, base)
            for lang in ['en', 'bn']:
                for width, height in VIEWPORTS:
                    browser = launch(playwright)
                    page = open_field(browser, base, width, height, lang)
                    assert_layout(page, width, height)
                    print(f'{lang} {width}×{height}: layout, overflow, data, and fold passed', flush=True)
                    if lang == 'en' and width in [360, 1642]:
                        page.wait_for_timeout(1500)
                        page.screenshot(path=str(ARTIFACTS / f'field-{width}.png'), full_page=True)
                    browser.close()
            browser = launch(playwright)
            page = open_field(browser, base, 1366, 768)
            interactions(page)
            browser.close()
            print('Field selection, layer settings/dates, boundary handles, fullscreen, edits, Guide me passed', flush=True)
            browser = launch(playwright)
            page = open_field(browser, base, 360, 800, reduced_motion='reduce')
            mobile_interactions(page)
            browser.close()
            print('Mobile source disclosure, sticky CTA, map picking, fixed inspection sheet, reduced motion passed', flush=True)
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
