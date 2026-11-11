"""Capture HOWTO "Watch how" clips: real footage from the real app, regenerable.

Runs the repo's existing headless setup (Python Playwright + Chromium, same as
tests/planty-guide.browser.py) against a local build (npm run build first),
performs each field and rotation sub-step with a visible synthetic finger
dot + ripple, and encodes looping animated WebP clips + poster JPGs into
public/assets/howto/.

Clips target <= 200 KB each (hard fail above 250 KB); posters <= 30 KB.
The service worker never precaches these (see scripts/prepare-offline.py).
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from threading import Thread
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'public' / 'assets' / 'howto'
VIEW_W, VIEW_H, DSF = 412, 915, 2
CLIP_LIMIT = 200 * 1024
CLIP_FAIL = 250 * 1024
POSTER_LIMIT = 30 * 1024

FINGER_CSS = """
#howto-finger { position: fixed; z-index: 9999; width: 30px; height: 30px; margin: -15px 0 0 -15px;
  border-radius: 50%; background: #284f3888; border: 3px solid #fffef4;
  box-shadow: 0 0 0 2px #284f38, 0 2px 10px #0006; pointer-events: none; }
#howto-finger.pulse::after { content: ''; position: absolute; inset: -3px; border-radius: 50%;
  border: 3px solid #78a653; animation: howto-ripple 1s ease-out infinite; }
@keyframes howto-ripple { from { opacity: .9; transform: scale(1); } to { opacity: 0; transform: scale(1.9); } }
"""


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def log_message(self, *_args):
        pass


def shot(page):
    return Image.open(BytesIO(page.screenshot())).convert('RGB')


def rect(page, selector):
    box = page.locator(selector).first.bounding_box()
    assert box, f'missing {selector}'
    return box


def center(box):
    return (box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)


def finger(page, x, y, pulse=True):
    # The <dialog> top layer sits above body content, so while it is open the
    # finger must live inside it (fixed positioning still uses the viewport).
    page.evaluate(f"""() => {{
      const dialog = document.querySelector('#modal');
      const host = (dialog && dialog.open) ? dialog : document.body;
      let f = document.querySelector('#howto-finger');
      if (!f) {{ f = document.createElement('div'); f.id = 'howto-finger'; }}
      if (f.parentElement !== host) host.append(f);
      f.style.left = '{x}px'; f.style.top = '{y}px';
      f.classList.toggle('pulse', {str(pulse).lower()});
    }}""")


def setup_field_page(context, base):
    """Fresh field page with a started plan, settled map, coach hidden for framing."""
    page = context.new_page()
    page.set_default_timeout(30000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(base + '/#field')
    page.wait_for_selector('#field-map')
    page.wait_for_timeout(2500)
    if page.locator('[data-journey="own"]').count():
        page.locator('[data-journey="own"]').click()
        page.wait_for_timeout(600)
    page.add_style_tag(content=FINGER_CSS)
    page.evaluate("document.querySelector('.coach-host')?.style.setProperty('display', 'none')")
    return page, errors


def setup_rotation_page(context, base):
    page, errors = setup_field_page(context, base)
    field_cta = page.locator('.journey-field-inline [data-journey="field"]')
    if field_cta.count():
        field_cta.click()
        page.wait_for_timeout(500)
    page.goto(base + '/#rotations')
    page.wait_for_selector('.priority-box')
    page.wait_for_timeout(1200)
    page.add_style_tag(content='#studio-3d-host { display: none !important; }')
    return page, errors


def encode_clip(frames, duration_ms):
    last = None
    for width in (360, 320):
        for quality in (60, 50, 40):
            sized = [f.resize((width, round(f.height * width / f.width)), Image.LANCZOS) for f in frames]
            buf = BytesIO()
            sized[0].save(buf, format='WEBP', save_all=True, append_images=sized[1:],
                          duration=duration_ms, loop=0, quality=quality, method=4)
            last = (buf.getvalue(), width, quality)
            if len(buf.getvalue()) <= CLIP_LIMIT:
                return last
    return last


def encode_poster(frame):
    for width in (360, 320):
        for quality in (72, 62, 52, 42):
            sized = frame.resize((width, round(frame.height * width / frame.width)), Image.LANCZOS)
            buf = BytesIO()
            sized.save(buf, format='JPEG', quality=quality)
            if len(buf.getvalue()) <= POSTER_LIMIT:
                return buf.getvalue(), width, quality
    raise SystemExit(f'poster still above {POSTER_LIMIT} bytes')


def crop_region(img, css_box, margin=8):
    x = max(0, round((css_box['x'] - margin) * DSF))
    y = max(0, round((css_box['y'] - margin) * DSF))
    w = round((css_box['width'] + margin * 2) * DSF)
    h = round((css_box['height'] + margin * 2) * DSF)
    return img.crop((x, y, min(img.width, x + w), min(img.height, y + h)))


def band_region(img, css_top=0, css_height=720):
    return img.crop((0, round(css_top * DSF), img.width, round((css_top + css_height) * DSF)))


def capture_map(page):
    """Outlined plot tap -> zoom + -> drag pan."""
    page.locator('#field-map').scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    region = rect(page, '#field-map')
    frames = []
    outline = rect(page, '#field-map .leaflet-overlay-pane path[stroke="#e3f9a2"]')
    ox, oy = center(outline)
    finger(page, ox, oy)
    page.wait_for_timeout(200)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.mouse.click(ox, oy)
    page.wait_for_timeout(300)
    frames.append(crop_region(shot(page), region))
    # Tapping the outline opens the inspect sheet over the map; close it so
    # the zoom + drag stay visible.
    if page.locator('[data-action="close-inspect"]').count():
        page.locator('[data-action="close-inspect"]').click()
        page.wait_for_timeout(300)
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    zoom = rect(page, '.leaflet-control-zoom-in')
    zx, zy = center(zoom)
    finger(page, zx, zy)
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.mouse.click(zx, zy)
    page.wait_for_timeout(350)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    # Drag across the map in two pictured moves.
    mx, my = region['x'] + region['width'] * 0.6, region['y'] + region['height'] * 0.55
    finger(page, mx, my)
    page.mouse.move(mx, my)
    page.mouse.down()
    page.wait_for_timeout(120)
    frames.append(crop_region(shot(page), region))
    nx = mx - region['width'] * 0.25
    page.mouse.move((mx + nx) / 2, my, steps=4)
    finger(page, (mx + nx) / 2, my)
    page.wait_for_timeout(150)
    frames.append(crop_region(shot(page), region))
    page.mouse.move(nx, my, steps=4)
    finger(page, nx, my)
    page.mouse.up()
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    return frames, 250, 1


def capture_area(page):
    """Cultivable value -> Edit -> type in the dialog -> Save."""
    page.locator('.field-meta').scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    frames = []
    value = rect(page, '.field-meta > div:nth-child(2) dd')
    finger(page, *center(value))
    page.wait_for_timeout(200)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    edit = rect(page, '[data-action="edit-net-area"]')
    finger(page, *center(edit))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    page.locator('[data-action="edit-net-area"]').click()
    page.wait_for_selector('#net-area-form')
    page.wait_for_timeout(350)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    field = rect(page, '#in-bundWidthM')
    finger(page, *center(field))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    page.locator('#in-bundWidthM').click()
    page.wait_for_timeout(200)
    frames.append(band_region(shot(page)))
    page.locator('#in-bundWidthM').press('End')
    page.locator('#in-bundWidthM').type('5', delay=60)
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    save = rect(page, '#net-area-form button[type="submit"]')
    finger(page, *center(save))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    page.locator('#net-area-form button[type="submit"]').click()
    page.wait_for_timeout(400)
    # Saving re-renders and resets scroll; frame the card again for the payoff.
    page.locator('.field-meta').scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(250)
    frames.append(band_region(shot(page)))
    return frames, 250, 4


def capture_constraints(page):
    """Edit field assumptions -> pick irrigation -> pick budget -> Save."""
    page.locator('.field-bottom').scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    frames = []
    btn = rect(page, '[data-action="profile"]')
    finger(page, *center(btn))
    page.wait_for_timeout(200)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.locator('[data-action="profile"]').click()
    page.wait_for_selector('#profile-form')
    page.wait_for_timeout(350)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    irrig = rect(page, '#in-irrigation')
    finger(page, *center(irrig))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.locator('#in-irrigation').select_option('limited')
    page.wait_for_timeout(300)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    budget = rect(page, '#in-budget')
    finger(page, *center(budget))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.locator('#in-budget').select_option('high')
    page.wait_for_timeout(300)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.locator('#profile-form button.button.primary').scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    save = rect(page, '#profile-form button.button.primary')
    finger(page, *center(save))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.locator('#profile-form button.button.primary').click()
    page.wait_for_timeout(400)
    # Saving re-renders and resets scroll; frame the card again for the payoff.
    page.locator('.field-bottom').scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    page.wait_for_timeout(280)
    frames.append(band_region(shot(page)))
    return frames, 280, 6


def capture_use(page):
    """Tap Use this field -> confirmed."""
    page.locator('.journey-field-inline').scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    region = rect(page, '.field-card')
    frames = []
    btn = rect(page, '.journey-field-inline [data-journey="field"]')
    finger(page, *center(btn))
    page.wait_for_timeout(200)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region))
    page.locator('.journey-field-inline [data-journey="field"]').click()
    page.wait_for_timeout(450)
    frames.append(crop_region(shot(page), region, margin=8))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region, margin=8))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region, margin=8))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region, margin=8))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region, margin=8))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region, margin=8))
    page.wait_for_timeout(250)
    frames.append(crop_region(shot(page), region, margin=8))
    return frames, 250, 1


def capture_rotation_priorities(page):
    page.locator('.priority-box').scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    frames = []
    for selector in ('#weight-water', '#weight-soil', '#weight-income', '#weight-stability'):
        box = rect(page, selector)
        x, y = center(box)
        finger(page, x, y)
        page.wait_for_timeout(250)
        frames.append(band_region(shot(page), max(0, box['y'] - 300), 600))
        page.mouse.click(x, y)
        page.wait_for_timeout(250)
        frames.append(band_region(shot(page), max(0, box['y'] - 300), 600))
    return frames, 260, 0


def capture_rotation_compare(page):
    page.locator('#rotation-list .rotation-card').first.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    frames = []
    for index in (1, 2):
        card = page.locator(f'#rotation-list .rotation-card:nth-child({index})')
        for selector in ('.score', '.timeline-scroll', '.rotation-info > div:nth-child(1)',
                         '.rotation-info > div:nth-child(2)', '.rotation-cost-badge'):
            item = card.locator(selector)
            item.scroll_into_view_if_needed()
            page.wait_for_timeout(180)
            box = item.bounding_box()
            finger(page, *center(box))
            frames.append(band_region(shot(page)))
            page.wait_for_timeout(180)
            frames.append(band_region(shot(page)))
    return frames, 220, 2


def capture_rotation_choose(page):
    page.locator('#rotation-list .rotation-card.best [data-journey="rotation"], #rotation-list [data-journey="rotation"]').first.scroll_into_view_if_needed()
    page.wait_for_timeout(350)
    frames = []
    button = page.locator('#rotation-list .rotation-card.best [data-journey="rotation"], #rotation-list [data-journey="rotation"]').first
    finger(page, *center(rect(page, '#rotation-list .rotation-card.best [data-journey="rotation"], #rotation-list [data-journey="rotation"]')))
    for _ in range(3):
        page.wait_for_timeout(220)
        frames.append(band_region(shot(page)))
    button.click()
    page.wait_for_timeout(450)
    frames.append(band_region(shot(page)))
    return frames, 250, 0


def capture_rotation_constraints(page):
    page.locator('[data-action="profile"]').scroll_into_view_if_needed()
    page.wait_for_timeout(250)
    frames = []
    button = page.locator('[data-action="profile"]')
    finger(page, *center(rect(page, '[data-action="profile"]')))
    frames.append(band_region(shot(page)))
    button.click()
    page.wait_for_selector('#profile-form')
    page.wait_for_timeout(350)
    frames.append(band_region(shot(page)))
    for selector, value in (('#in-crop', None), ('#in-irrigation', 'limited'), ('#in-budget', 'high')):
        field = page.locator(selector)
        field.scroll_into_view_if_needed()
        box = rect(page, selector)
        finger(page, *center(box))
        frames.append(band_region(shot(page)))
        if value:
            field.select_option(value)
        else:
            field.click()
        page.wait_for_timeout(250)
        frames.append(band_region(shot(page)))
    save = page.locator('#profile-form button.button.primary')
    save.scroll_into_view_if_needed()
    finger(page, *center(rect(page, '#profile-form button.button.primary')))
    frames.append(band_region(shot(page)))
    save.click()
    page.wait_for_timeout(400)
    frames.append(band_region(shot(page)))
    return frames, 260, 0


CLIPS = [
    ('field-map', capture_map),
    ('field-area', capture_area),
    ('field-constraints', capture_constraints),
    ('field-use', capture_use),
    ('rotation-priorities', capture_rotation_priorities),
    ('rotation-compare', capture_rotation_compare),
    ('rotation-choose', capture_rotation_choose),
    ('rotation-constraints', capture_rotation_constraints),
]


def main():
    if not (ROOT / 'out' / 'index.html').exists():
        raise SystemExit('out/ not found. Run `npm run build` first.')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    failures = []
    clips = [item for item in CLIPS if not sys.argv[1:] or item[0] in sys.argv[1:]]
    try:
        with sync_playwright() as playwright:
            for clip_id, capture in clips:
                # Fresh browser per clip: single-process headless shell exits
                # once its last context closes (same pattern as the guide test).
                browser = playwright.chromium.launch(
                    args=['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--single-process'])
                context = browser.new_context(viewport={'width': VIEW_W, 'height': VIEW_H},
                                              device_scale_factor=DSF, is_mobile=True,
                                              has_touch=True, service_workers='block')
                setup = setup_rotation_page if clip_id.startswith('rotation-') else setup_field_page
                page, errors = setup(context, base)
                try:
                    frames, duration, poster_idx = capture(page)
                finally:
                    context.close()
                    browser.close()
                if errors:
                    print(f'{clip_id}: page errors: {errors}', flush=True)
                data, width, quality = encode_clip(frames, duration)
                (OUT_DIR / f'{clip_id}.webp').write_bytes(data)
                status = 'OK' if len(data) <= CLIP_LIMIT else 'OVER TARGET'
                print(f'{clip_id}.webp: {len(data) / 1024:.1f} KB '
                      f'({len(frames)} frames, {width}px, q{quality}, {duration}ms) {status}', flush=True)
                if len(data) > CLIP_FAIL:
                    failures.append(clip_id)
                poster, pwidth, pquality = encode_poster(frames[poster_idx])
                (OUT_DIR / f'{clip_id}.jpg').write_bytes(poster)
                print(f'{clip_id}.jpg: {len(poster) / 1024:.1f} KB ({pwidth}px, q{pquality})', flush=True)
    finally:
        server.shutdown()
    if failures:
        raise SystemExit(f'clips over {CLIP_FAIL / 1024:.0f} KB: {", ".join(failures)}')
    print('all clips + posters written to public/assets/howto/', flush=True)


if __name__ == '__main__':
    main()
