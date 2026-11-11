"""Run after npm run build: python tests/planty-guide.browser.py (requires Python Playwright)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'docs/reports/planty-guide'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def translate_path(self, path):
        if path.startswith('/__source/'):
            return str(ROOT / path.removeprefix('/__source/'))
        return super().translate_path(path)

    def log_message(self, *_args):
        pass


def run_demo(browser, base, name, width, height, scale):
    context = browser.new_context(viewport={'width': width, 'height': height}, device_scale_factor=scale,
                                  is_mobile=name == 'phone', has_touch=name == 'phone', service_workers='block')
    page = context.new_page()
    page.set_default_timeout(30000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base + '/#planner')
    page.locator('[data-action="plan-guide"]').click(no_wait_after=True)
    tour = page.locator('.planty-guide--tour')
    tour.wait_for(state='visible')
    page.wait_for_timeout(700)
    assert tour.locator('[data-guide="next"]').is_disabled()
    page.screenshot(path=str(ARTIFACTS / f'{name}-spotlight.png'))
    # Regression: crop selection replaces the target before the action's deferred completion.
    page.locator('.plan-crop:has([value="potato"])').click(no_wait_after=True)
    page.wait_for_function("document.querySelector('.planty-guide__instruction')?.textContent.includes('Change')")
    page.wait_for_timeout(650)
    page.locator('#plan-row-range').focus()
    page.keyboard.press('ArrowRight')
    page.wait_for_function("document.querySelector('.planty-guide [aria-live]')?.textContent.includes('Ask Planty')")
    page.wait_for_timeout(650)
    # The bottom bubble must leave the real fixed launcher clickable.
    page.clock.install(time=1000000000000)
    page.clock.pause_at(1000000001000)
    page.locator('.planty-launch').click(no_wait_after=True)
    page.clock.run_for(20)
    page.locator('.planty-guide--celebrate').wait_for(state='visible')
    assert page.locator('.planty-guide__burst i').count() == 12
    # Capture a deterministic burst frame even when software WebGL makes screenshots slow.
    page.locator('.planty-guide__burst i').evaluate_all("""elements => elements.forEach(element =>
      element.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = 180; }))""")
    page.screenshot(path=str(ARTIFACTS / f'{name}-celebrate.png'))
    page.keyboard.press('Escape')
    assert page.locator('.planty-guide').count() == 0
    assert not errors, errors
    print(f'{name}: demo, rerender, spotlight, celebration, Escape passed', flush=True)
    return context


def run_api(browser, base):
    context = browser.new_context(viewport={'width': 412, 'height': 915}, reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    page.goto(base + '/404.html')
    page.evaluate("""async () => {
      window.probeGuide = (await import('/__source/src/legacy/planty-guide.js')).guide;
      window.probeUi = await import('/__source/src/legacy/ui.js');
      document.body.insertAdjacentHTML('beforeend', '<button id="origin">Start</button><button id="probe">Target</button><input id="probe-input" type="range">');
      window.completions = 0;
      document.querySelector('#origin').focus();
      window.scrollCalls = [];
      Element.prototype.scrollIntoView = options => window.scrollCalls.push(options);
      probeGuide.show({ target: '#probe', text: '<b>Plain text</b>', action: 'click', onDone: () => completions++ });
    }""")
    page.locator('.planty-guide--tour').wait_for(state='visible')
    assert page.locator('.planty-guide [aria-live]').inner_text() == '<b>Plain text</b>'
    page.evaluate("document.querySelector('#probe').click()")
    page.wait_for_timeout(50)
    assert page.evaluate('completions') == 0
    page.locator('#probe').click(no_wait_after=True)
    page.wait_for_function('completions === 1')
    assert page.locator('.planty-guide').count() == 0
    page.evaluate("""() => {
      probeUi.state.lang = 'bn';
      probeGuide.sequence([
        { target: '#absent', timeout: 80, text: 'Missing', onDone: () => completions++ },
        { target: '#late', text: { en: 'Late target', bn: 'নতুন লক্ষ্য' } }
      ]);
      setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<button id="late">Late</button>'), 120);
    }""")
    page.wait_for_function("document.querySelector('.planty-guide [aria-live]')?.textContent === 'নতুন লক্ষ্য'")
    assert page.evaluate('completions') == 1
    assert page.evaluate("scrollCalls.every(call => call.behavior === 'instant')")
    assert page.locator('.planty-guide__ripple i').first.evaluate("el => getComputedStyle(el).animationName") == 'none'
    page.locator('[data-guide="skip"]').click(no_wait_after=True)
    page.evaluate("""() => {
      document.querySelector('#origin').focus();
      probeGuide.hint('#probe', 'Hint');
    }""")
    page.locator('.planty-guide--hint').wait_for(state='visible')
    assert page.evaluate("document.activeElement.id") == 'origin'
    assert not page.locator('.planty-guide__spotlight').is_visible()
    page.keyboard.press('Escape')
    page.evaluate("probeGuide.show({target: '#probe', text: 'Focus'})")
    page.locator('.planty-guide__bubble').wait_for(state='visible')
    page.keyboard.press('Escape')
    assert page.evaluate("document.activeElement.id") == 'origin'
    page.evaluate("""() => {
      probeGuide.show({target: '#cancelled', text: 'Never shown'});
      probeGuide.stop();
      document.body.insertAdjacentHTML('beforeend', '<button id="cancelled">Cancelled</button>');
      probeGuide.celebrate('Done');
    }""")
    assert not page.locator('.planty-guide__burst').is_visible()
    page.keyboard.press('Escape')
    assert page.locator('.planty-guide').count() == 0
    print('API: trusted actions, missing/late targets, Bengali, plain text, reduced motion, hints, focus, stop passed', flush=True)
    context.close()


if __name__ == '__main__':
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as playwright:
            # Container-compatible Chromium flags; no application dependencies are installed.
            for name, width, height, scale in [('desktop', 1366, 768, 1), ('phone', 412, 915, 2.625)]:
                browser = playwright.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'])
                run_demo(browser, base, name, width, height, scale)
                browser.close()
            browser = playwright.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'])
            run_api(browser, base)
            browser.close()
    finally:
        server.shutdown()
