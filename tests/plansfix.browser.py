"""Run after npm run build: python tests/plansfix.browser.py (Python Playwright required)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path(os.environ.get('PLANSFIX_ARTIFACTS', '/tmp/plansfix-browser'))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def do_POST(self):
        # Static export has no worker; keep the unrelated AI summary deterministic.
        if self.path != '/api/plan-summary':
            self.send_error(404)
            return
        self.rfile.read(int(self.headers.get('Content-Length', 0)))
        body = json.dumps({'summary': 'Your saved season plan.'}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


def run(browser, base, name, width, height, scale):
    context = browser.new_context(
        viewport={'width': width, 'height': height}, device_scale_factor=scale,
        is_mobile=name == 'phone', has_touch=name == 'phone', service_workers='block',
        reduced_motion='reduce',
    )
    page = context.new_page()
    page.set_default_timeout(30000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)

    def go(route):
        page.evaluate('(route) => { location.hash = route; }', route)
        page.locator(f'main[data-page="{route}"]').wait_for()

    def no_journey():
        assert page.locator('.journey-bar, .coach-card, .coach-bubble-btn, [data-journey="finish"], '
                            '[data-journey="field"], [data-journey="rotation"], .plan-rotation-note').count() == 0

    page.goto(base + '/#plans')
    page.locator('[data-journey="own"]').click()
    page.locator('main[data-page="field"]').wait_for()
    assert page.locator('.journey-bar').count() == 1
    page.locator('[data-journey="field"]').first.click()
    page.locator('main[data-page="rotations"]').wait_for()
    page.keyboard.press('Escape')
    page.locator('[data-journey="rotation"][data-value="legume"]').click()
    page.locator('main[data-page="planner"]').wait_for()
    page.keyboard.press('Escape')
    page.locator('[data-journey="finish"]').first.click()
    page.locator('.plan-card[data-plan-status="ready"]').wait_for()
    saved_id = page.locator('.plan-card').get_attribute('data-plan-id')
    assert page.evaluate("localStorage.getItem('ropon_season_plan_v1')") is None
    for crop in ['Aman rice', 'Potato', 'Mungbean']:
        assert crop in page.locator('.plan-card-chips').inner_text()
    page.keyboard.press('Escape')
    print(f'{name}: finished and saved Ready', flush=True)

    for route in ['planner', 'field', 'rotations']:
        go(route)
        page.locator('.journey-ready').wait_for()
        no_journey()
        assert '✓ Your plan is ready' in page.locator('.journey-ready').inner_text()
        assert page.locator('.journey-ready').bounding_box()['height'] <= 105
    go('planner')
    page.screenshot(path=str(ARTIFACTS / f'{name}-ready-planner.png'))
    page.locator('[data-journey="dismiss-ready"]').click()
    assert page.locator('.journey-ready').count() == 0
    go('field')
    assert page.locator('.journey-ready').count() == 0
    no_journey()

    go('plans')
    page.locator('[data-plans-action="open"]').click()
    page.locator('main[data-page="plan"]').wait_for()
    no_journey()
    assert 'Plan ready ✓' in page.locator('.plan-hero .eyebrow').text_content()
    assert page.locator('.plan-back-link').inner_text() == '← My plans'
    assert page.locator('[data-check]:enabled, [data-action="plan-edit-season"]').count() == 0
    page.screenshot(path=str(ARTIFACTS / f'{name}-readonly-plan.png'))
    print(f'{name}: Ready pages and read-only plan verified', flush=True)
    page.reload()
    page.locator('[data-action="plan-edit"]').wait_for()
    no_journey()
    page.locator('[data-action="plan-edit"]').click()
    page.locator('main[data-page="planner"] .journey-handoff').first.wait_for()
    assert page.locator('.journey-bar').count() == 1
    assert page.locator('.coach-card, .coach-bubble-btn').count() == 1
    assert page.evaluate("JSON.parse(localStorage.getItem('ropon_saved_plans_v1'))[0].status") == 'draft'
    assert page.evaluate("JSON.parse(localStorage.getItem('ropon_season_plan_v1')).id") == saved_id
    page.screenshot(path=str(ARTIFACTS / f'{name}-editing.png'))

    go('plans')
    count = page.locator('.plan-card').count()
    page.locator('[data-journey="own"]').click()
    page.locator('.journey-exit-btn').click()
    page.locator('[data-journey="exit-draft"]').click()
    page.locator('main[data-page="plans"]').wait_for()
    assert page.locator('.plan-card').count() == count
    assert page.locator('#toast').inner_text() == 'Nothing to save yet'
    assert page.evaluate("localStorage.getItem('ropon_season_plan_v1')") is None
    page.screenshot(path=str(ARTIFACTS / f'{name}-empty-exit.png'))
    assert not errors, errors
    print(f'{name} {width}×{height}@{scale}: finish, revisit, dismiss, read-only, reload, edit, empty exit; zero console errors', flush=True)
    context.close()


if __name__ == '__main__':
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            for name, width, height, scale in [('desktop', 1366, 768, 1), ('phone', 412, 915, 2.625)]:
                browser = playwright.chromium.launch(args=[
                    '--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process',
                ])
                print(f'Headless Chromium {browser.version}', flush=True)
                run(browser, f'http://127.0.0.1:{server.server_port}', name, width, height, scale)
                browser.close()
    finally:
        server.shutdown()
