"""After npm run build: python3 tests/netarea1.browser.py (requires Python Playwright)."""
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'docs/reports/netarea1'
WIDTHS = {'bundWidthM': 0.4, 'drainWidthM': 0.1, 'pathWidthM': 0.5, 'otherDecimals': 0}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'out'), **kwargs)

    def translate_path(self, path):
        if path.startswith('/__source/'):
            return str(ROOT / path.removeprefix('/__source/'))
        return super().translate_path(path)

    def log_message(self, *_args):
        pass

    def do_GET(self):
        if self.path == '/__probe':
            body = b'<!doctype html><html><head><link rel="stylesheet" href="/__source/app/planner3d.css"></head><body></body></html>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


def track_errors(page):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    return errors


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
    field_value = float(page.locator('#plan-usable').input_value())
    assert field_value == 86.9
    assert 'From your field widths' in page.locator('.plan-usable-note').inner_text()
    page.locator('#plan-usable-range').evaluate("el => { el.value = 70; el.dispatchEvent(new Event('input', {bubbles:true})); }")
    assert 'Your planner override' in page.locator('.plan-usable-note').inner_text()
    page.locator('[data-action="plan-use-field-widths"]').click()
    assert float(page.locator('#plan-usable').input_value()) == field_value
    for kind, value in [('bund', '0.4 m'), ('drain', '0.1 m'), ('path', '0.5 m')]:
        chip = page.locator(f'[data-zone-kind="{kind}"]')
        chip.tap() if name == 'phone' else chip.click()
        content = page.locator('.zone-popover').inner_text()
        for text in [kind.capitalize(), value, 'Length', 'Area', 'm²', 'decimals', 'Share of field', 'Entered by farmer', 'Edit on My field']:
            assert text in content, content
        assert chip.get_attribute('aria-pressed') == 'true'
        page.keyboard.press('Escape')
        assert page.locator('.zone-popover').count() == 0
    page.locator('[data-zone-kind="drain"]').click()
    page.locator('.planner3d-stage-wrap').evaluate('el => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8)')
    page.screenshot(path=str(ARTIFACTS / f'{name}-drain.png'), timeout=120000)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    box = page.locator('.zone-popover').bounding_box()
    assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1
    page.locator('.planner3d-toolbar').click(position={'x': 150, 'y': 25})
    assert page.locator('.zone-popover').count() == 0
    assert not errors, errors
    result = {'viewport': [width, height], 'scale': scale, 'usable': field_value,
              'consoleErrors': errors, 'popover': content}
    context.close()
    print(f'{name}: slider, reset, chips, parameters, Escape, outside dismissal, screenshot passed', flush=True)
    return result


def check_renderer(browser, base):
    context = browser.new_context(viewport={'width': 1366, 'height': 768}, reduced_motion='reduce', service_workers='block')
    page = context.new_page()
    page.set_default_timeout(60000)
    errors = track_errors(page)
    page.goto(base + '/__probe')
    page.evaluate("""async () => {
      document.body.innerHTML = '<div class="planner3d-stage-wrap" style="width:800px;position:relative"><div id="host" style="width:800px;height:500px"></div><div class="planner3d-footer"></div></div>';
      const map = document.createElement('script'); map.type = 'importmap';
      map.textContent = JSON.stringify({imports:{three:'/__source/node_modules/three/build/three.module.js','three/':'/__source/node_modules/three/'}});
      document.head.appendChild(map);
      const THREE = await import('three');
      const objects = new Set();
      const add = THREE.Object3D.prototype.add;
      THREE.Object3D.prototype.add = function(...items) { items.forEach(item => objects.add(item)); return add.apply(this,items); };
      const updateProjection = THREE.PerspectiveCamera.prototype.updateProjectionMatrix;
      THREE.PerspectiveCamera.prototype.updateProjectionMatrix = function() {
        if(window.rig) rig.camera=this;
        return updateProjection.call(this);
      };
      const ui = await import('/__source/src/legacy/ui.js'); await ui.loadData();
      const planner = await import('/__source/src/legacy/planner3d.js');
      const helpers = await import('/__source/src/legacy/planner3d-helpers.js');
      const {buildStudioData} = await import('/__source/src/legacy/studiodata.js');
      const host = document.querySelector('#host');
      const input = {field:ui.field(),polygon:ui.polygon(),agronomy:ui.agronomy,
        planner:{crop:'rice',row:20,spacing:20,usable:86.9},
        net:{inputs:{bundWidthM:.4,drainWidthM:.1,pathWidthM:.5,otherDecimals:.5},edited:true}};
      window.rig = {THREE,objects,planner,helpers,host,input,buildStudioData};
      rig.active = () => [...objects].filter(o => { let p=o; while(p.parent) p=p.parent; return p.isScene; });
      await planner.mountPlanner3d(host,input);
    }""")
    # Test actual Three.js meshes, not descriptors or source-code text.
    result = page.evaluate("""() => {
      const {THREE,helpers,input} = rig;
      const meshes = rig.active().filter(o => o.isMesh && o.userData.zoneKind);
      const kinds = [...new Set(meshes.map(o => o.userData.zoneKind))].sort();
      const bund = meshes.find(o => o.userData.zoneKind==='bund' && !o.isInstancedMesh);
      const normals = bund.geometry.getAttribute('normal');
      const upward = Array.from({length:normals.count},(_,i)=>normals.getY(i)).filter(y=>y>0).length;
      const drain = meshes.find(o => o.userData.zoneKind==='drain' && !o.material.transparent);
      const depth = Math.min(...Array.from({length:drain.geometry.getAttribute('position').count},(_,i)=>drain.geometry.getAttribute('position').getY(i)));
      const plants = rig.active().find(o => o.isGroup && o.userData.plants);
      const clumps = plants.children[0], vertices = clumps.geometry.getAttribute('position');
      const data = rig.buildStudioData(input), outline = data.field.outlineM;
      const zones = helpers.buildZoneGeometry(outline,input.net.inputs,{display:true});
      const dp=drain.geometry.getAttribute('position'), first=3, last=dp.count-4;
      zones.drain={...zones.drain,ax:dp.getX(first),ay:-dp.getZ(first),bx:dp.getX(last),by:-dp.getZ(last)};
      let radius=0; for(let i=0;i<vertices.count;i++) radius=Math.max(radius,Math.hypot(vertices.getX(i),vertices.getZ(i)));
      const matrix = new THREE.Matrix4(), center = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
      let rootLeaks=0,footprintLeaks=0;
      for(let i=0;i<clumps.count;i++) {
        clumps.getMatrixAt(i,matrix); matrix.decompose(center,rotation,scale);
        if(helpers.pointInFieldZones(center.x,-center.z,zones,outline)) rootLeaks++;
        if(radius*Math.max(scale.x,scale.z)>helpers.fieldZoneClearance(center.x,-center.z,zones,outline)+1e-5) footprintLeaks++;
      }
      return {kinds,upward,totalNormals:normals.count,depth,rootLeaks,footprintLeaks,plantCount:clumps.count};
    }""")
    assert result['kinds'] == ['bund', 'drain', 'other', 'path'], result
    assert result['upward'] > result['totalNormals'] * 0.9, result
    assert abs(result['depth'] + 0.3) < 1e-5, result
    assert result['rootLeaks'] == 0 and result['footprintLeaks'] == 0, result
    # A ray click on the real canvas must open the feature's parameters.
    point = page.evaluate("""() => {
      const mesh = rig.active().find(o=>o.isMesh && !o.isInstancedMesh && o.userData.zoneKind==='bund');
      mesh.updateWorldMatrix(true,false); rig.camera.updateMatrixWorld();
      const p = new rig.THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),12).applyMatrix4(mesh.matrixWorld).project(rig.camera);
      const r=rig.host.getBoundingClientRect(); return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
    }""")
    page.mouse.click(point['x'], point['y'])
    assert 'Bund' in page.locator('.zone-popover').inner_text()
    page.keyboard.press('Escape')
    page.evaluate("""async () => {
      rig.input.net = {inputs:{bundWidthM:0,drainWidthM:0,pathWidthM:0,otherDecimals:0},edited:false};
      await rig.planner.mountPlanner3d(rig.host,rig.input);
    }""")
    assert page.evaluate("rig.active().filter(o => o.isMesh && (o.userData.zoneKind || o.geometry.type==='TubeGeometry')).length") == 0
    assert page.locator('[data-zone-kind]').count() == 0
    assert page.locator('[data-measurements]').count() == 1
    page.evaluate("""async () => {
      rig.input.net = null;
      rig.input.net = {inputs:{bundWidthM:.4,drainWidthM:.1,pathWidthM:.5,otherDecimals:0},edited:false};
      rig.input.polygon = [...rig.input.polygon].reverse();
      await rig.planner.mountPlanner3d(rig.host,rig.input);
    }""")
    page.locator('[data-zone-kind="bund"]').click()
    assert 'Scenario default' in page.locator('.zone-popover').inner_text()
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate("""() => {
      const water=rig.active().find(o=>o.isMesh && o.userData.zoneKind==='drain' && o.material.transparent);
      rig.waterTexture=water.material.map; rig.waterOffset=rig.waterTexture.offset.x;
    }""")
    page.wait_for_function('rig.waterTexture.offset.x !== rig.waterOffset')
    page.evaluate('rig.planner.disposePlanner3d()')
    assert not errors, errors
    result['consoleErrors'] = errors
    context.close()
    print('renderer: real meshes, winding, channel depth, ray picking, zero widths, scenario labels passed', flush=True)
    return result


if __name__ == '__main__':
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            report = {}
            for name, width, height, scale in [('desktop', 1366, 768, 1), ('phone', 412, 915, 2.625), ('renderer', 1366, 768, 1)]:
                browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader',
                    '--use-angle=swiftshader', '--renderer-process-limit=1', '--num-raster-threads=1', '--no-zygote', '--single-process'])
                report['chrome'] = browser.version
                report[name] = check_renderer(browser, base) if name == 'renderer' else check_app(browser, base, name, width, height, scale)
                browser.close()
                (ARTIFACTS / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
            (ARTIFACTS / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    finally:
        server.shutdown()
