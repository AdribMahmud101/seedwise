"""Run after npm run build: python tests/plancrud.browser.py."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/tmp/plancrud-browser')
PRESET = json.loads((ROOT / 'public/data/advisor-presets.json').read_text())['presets'][0]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def log_message(self, *_args):
        pass


def run(browser, base, width, height):
    context = browser.new_context(viewport={'width': width, 'height': height},
                                  reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    page.set_default_timeout(20000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: (_ for _ in ()).throw(AssertionError(dialog.message)))
    page.goto(base + '/#planner')
    page.locator('[data-action="plan-save"]').wait_for()
    page.evaluate('(source) => localStorage.setItem("ropon_custom_plan_v1", JSON.stringify(source))', PRESET)
    page.reload()
    page.locator('.cs-panel').wait_for()
    page.locator('[data-action="plan-save"]').click()
    page.locator('.plan-card').wait_for()

    def saved():
        return page.evaluate('JSON.parse(localStorage.getItem("ropon_saved_plans_v1"))')

    original_id = saved()[0]['id']
    page.locator('[data-plans-action="open"]').click()
    page.locator('.cs-panel').wait_for()
    page.locator('[data-action="plan-save"]').click()
    page.locator('.plan-card').wait_for()
    assert len(saved()) == 1 and saved()[0]['id'] == original_id

    page.locator('[data-plans-action="edit"]').click()
    row = page.locator('[name="custom-row"][data-idx="0"]')
    row.wait_for()
    coach = page.locator('[data-coach="hide"]').first
    if coach.is_visible():
        coach.click()
    row.evaluate('el => { el.value = 30; el.dispatchEvent(new Event("input", {bubbles:true})); }')
    page.evaluate('window.scrollTo(0, 0)')
    page.locator('[data-action="plan-save"]').click()
    page.locator('.plan-card').wait_for()
    assert len(saved()) == 1 and saved()[0]['status'] == 'draft'
    assert saved()[0]['plan']['planting']['custom-0']['rowSpacingCm'] == 30

    page.locator('[data-plans-action="rename"]').click()
    page.locator('#modal input').fill('Browser checked plan')
    page.locator('#prompt-ok-btn').click()
    page.get_by_role('heading', name='Browser checked plan', exact=True).wait_for()
    page.locator('[data-plans-action="duplicate"]').click()
    assert len(saved()) == 2

    original = page.locator(f'.plan-card[data-plan-id="{original_id}"]')
    original.locator('[data-plans-action="delete"]').click()
    original.locator('[data-plans-action="delete-cancel"]').click()
    assert len(saved()) == 2
    original.locator('[data-plans-action="delete"]').click()
    original.locator('[data-plans-action="delete-confirm"]').click()
    assert len(saved()) == 1

    # Fetch is mocked only in this test; production always calls the real endpoint.
    page.route('**/api/rotation-advisor', lambda route: route.fulfill(
        json={'verdict': 'recommended', 'summary': PRESET['summary']}))
    page.locator('[data-plans-action="recheck"]').click()
    page.get_by_text('Re-checked', exact=False).first.wait_for()
    assert saved()[0]['plan']['rotation']['customPlan']['verdict'] == 'recommended'
    assert saved()[0]['status'] == 'ready'
    page.unroute('**/api/rotation-advisor')
    page.route('**/api/rotation-advisor', lambda route: route.abort('internetdisconnected'))
    page.locator('[data-plans-action="recheck"]').click()
    page.locator('.plans-page [role="alert"]').wait_for()
    assert 'previous verdict was kept' in page.locator('.plans-page [role="alert"]').inner_text()
    assert saved()[0]['plan']['rotation']['customPlan']['verdict'] == 'recommended'

    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(ARTIFACTS / f'plans-{width}.png'), full_page=True)
    page.locator('[data-lang="bn"]').click()
    page.get_by_role('button', name='Planty দিয়ে আবার যাচাই', exact=True).wait_for()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    context.close()
    print(f'{width}×{height}: CRUD, re-check, offline preservation, Bengali and overflow passed', flush=True)


if __name__ == '__main__':
    ARTIFACTS.mkdir(exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            for dimensions in [(412, 915), (1366, 906), (1882, 906)]:
                browser = playwright.chromium.launch(headless=True, args=[
                    '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
                    '--renderer-process-limit=1', '--num-raster-threads=1', '--no-zygote', '--single-process',
                ])
                run(browser, f'http://127.0.0.1:{server.server_port}', *dimensions)
                browser.close()
    finally:
        server.shutdown()
