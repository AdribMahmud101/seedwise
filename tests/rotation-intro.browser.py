"""Run after npm run build: python3 tests/rotation-intro.browser.py."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = Path('/tmp/rotintro-browser')
MICRO = [
    ('Your field, built from NASA elevation data', '.studio-stage-canvas-host'),
    ('Play the year — crops grow month by month', '.studio-calendar-bar'),
    ('Switch between 3D view, soil slice, and top view', '.studio-view-toggle'),
    ('Tap a layer to see soil and NASA moisture', '.studio-soil-pin'),
    ('Your bunds, drains and paths with real sizes', '.studio-feature-chips'),
    ('Switch to NASA water, greenness, elevation', '[data-studio-layers]'),
]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def log_message(self, *_args):
        pass


def run(browser, base, name, width, height, scale):
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=scale,
                                  is_mobile=name == 'phone', has_touch=name == 'phone', service_workers='block')
    page = context.new_page()
    page.set_default_timeout(60000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    page.goto(base + '/#field')
    page.locator('[data-journey="own"]').click()
    page.locator('.journey-field-inline [data-journey="field"]').click()
    page.wait_for_selector('.studio-stage-canvas-host canvas')
    page.wait_for_timeout(1500)
    intro = page.locator('[data-item-id="rotation-intro"]')
    assert page.locator('.coach-check-item').first.get_attribute('data-item-id') == 'rotation-intro'
    assert intro.locator('[data-coach="toggle"]').get_attribute('aria-expanded') == 'true'
    assert 'is-done' not in intro.get_attribute('class')
    intro.locator('[data-coach="show-me"]').click()
    for index, (text, selector) in enumerate(MICRO):
        page.wait_for_function('text => document.querySelector(".planty-guide [aria-live]")?.textContent === text', arg=text)
        assert page.locator('[data-guide="next"]').is_enabled()
        assert 'is-done' not in intro.get_attribute('class'), 'intro waits for the final Next'
        # All controls, including the three soil names, share their spotlight and ripple bounds.
        for effect in ['.planty-guide__spotlight', '.planty-guide__ripple']:
            page.wait_for_function('''({selector, effect, width, height}) => {
              const focus = document.querySelector(effect).getBoundingClientRect();
              const targets = [...document.querySelectorAll(selector)].map(el => el.getBoundingClientRect());
              return targets.every(rect => rect.width > 0 && rect.height > 0
                && rect.left >= focus.left && rect.right <= focus.right
                && rect.top >= focus.top && rect.bottom <= focus.bottom
                && rect.left < width && rect.right > 0 && rect.top < height && rect.bottom > 0);
            }''', arg={'selector': selector, 'effect': effect, 'width': width, 'height': height})
        bubble = page.locator('.planty-guide__bubble').bounding_box()
        assert bubble['x'] >= 0 and bubble['y'] >= 0
        assert bubble['x'] + bubble['width'] <= width and bubble['y'] + bubble['height'] <= height
        page.screenshot(path=str(ARTIFACTS / f'{name}-{index + 1}.png'))
        if index == 1:
            page.locator('[data-guide="back"]').click()
            page.wait_for_function('text => document.querySelector(".planty-guide [aria-live]")?.textContent === text', arg=MICRO[0][0])
            page.locator('[data-guide="next"]').click()
            page.wait_for_function('text => document.querySelector(".planty-guide [aria-live]")?.textContent === text', arg=text)
        page.locator('[data-guide="next"]').click()
        print(f'{name}: {index + 1}/6 spotlight, ripple, scroll, Next passed', flush=True)
    assert page.locator('.planty-guide').count() == 0
    assert 'is-done' in intro.get_attribute('class')
    assert page.locator('.coach-check-item.is-open').get_attribute('data-item-id') == 'rotation-priorities'
    intro.locator('[data-coach="toggle"]').click()
    intro.locator('.coach-item-btns [data-coach="watch"]').click()
    page.wait_for_function('document.querySelector("[data-item-id=rotation-intro] .coach-clip-anim")?.naturalWidth > 0')
    page.reload()
    page.wait_for_selector('.studio-stage-canvas-host canvas')
    intro.locator('[data-coach="show-me"]').click()
    page.locator('.planty-guide__bubble').wait_for(state='visible')
    page.keyboard.press('Escape')
    assert 'is-done' not in intro.get_attribute('class'), 'cancelling is not completion'
    intro.locator('[data-coach="show-me"]').click()
    page.locator('.planty-guide__bubble').wait_for(state='visible')
    page.locator('[data-guide="next"]').click()
    page.wait_for_function('text => document.querySelector(".planty-guide [aria-live]")?.textContent === text', arg=MICRO[1][0])
    page.locator('[data-guide="skip"]').click()
    assert page.locator('.planty-guide').count() == 0
    assert 'is-done' in intro.get_attribute('class')
    assert 'is-done' not in page.locator('[data-item-id="rotation-choose"]').get_attribute('class')
    assert not errors, errors
    print(f'{name} {width}x{height}@{scale}: completion, Back, Skip, Escape, clip; zero console/page errors', flush=True)


if __name__ == '__main__':
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as playwright:
            for name, width, height, scale in [('desktop', 1366, 768, 1), ('phone', 412, 915, 2.625)]:
                browser = playwright.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'])
                run(browser, f'http://127.0.0.1:{server.server_port}', name, width, height, scale)
                browser.close()
    finally:
        server.shutdown()
