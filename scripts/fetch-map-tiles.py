"""Freeze Sentinel-2 XYZ tiles, tap values and OSM context; never used by the app.

Re-run/validate the committed pack: python3 scripts/fetch-map-tiles.py
To rebuild missing assets, use a disposable environment outside the repository:
  uv venv /tmp/ropon-map-venv
  uv pip install --python /tmp/ropon-map-venv/bin/python pillow numpy rasterio shapely
  /tmp/ropon-map-venv/bin/python scripts/fetch-map-tiles.py

Raw public responses are cached in data-raw/map-tiles. No credentials are needed.
"""

import concurrent.futures
import datetime
import gzip
import io
import json
import math
from pathlib import Path
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
RAW = ROOT / 'data-raw/map-tiles'
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
API = 'https://planetarycomputer.microsoft.com/api/data/v1/item'
COLLECTION = 'sentinel-2-l2a'
SOURCE = 'Copernicus Sentinel-2 L2A (ESA), via Microsoft Planetary Computer'
PROVENANCE = 'REMOTE_OBSERVED'
LIMIT = 30_000_000
BASE_ZOOM = 14  # 8.6 m/pixel here; higher zooms cannot add to the native 10 m detail.
SCL_VALID = [4, 5, 6]
RAMP = [
    [[0, 85], [0, 0, 0, 0]],
    [[85, 128], [49, 54, 149, 255]],
    [[128, 153], [165, 0, 38, 255]],
    [[153, 170], [244, 109, 67, 255]],
    [[170, 187], [254, 224, 139, 255]],
    [[187, 204], [217, 239, 139, 255]],
    [[204, 221], [102, 189, 99, 255]],
    [[221, 256], [0, 104, 55, 255]],
]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.pending')
    pending.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                                  separators=(',', ':')) + '\n')
    pending.replace(path)


def request(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'RoponRadar offline map preparation'})
            with urllib.request.urlopen(req, timeout=90) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 3:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)


def cached(name, url, compressed=False):
    path = RAW / name
    if path.exists():
        return gzip.decompress(path.read_bytes()) if compressed else path.read_bytes()
    body = request(url)
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(path.suffix + '.pending')
    pending.write_bytes(gzip.compress(body, mtime=0) if compressed else body)
    pending.replace(path)
    write_json(path.with_suffix(path.suffix + '.receipt.json'), {
        'requestUrl': url, 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    return body


def receipt(name):
    return json.loads((RAW / (name + '.receipt.json')).read_text())


def site_bounds(field):
    dy = 3000 / 111195.08
    dx = dy / math.cos(math.radians(field['lat']))
    return [field['lon'] - dx, field['lat'] - dy, field['lon'] + dx, field['lat'] + dy]


def tile_range(bounds, zoom):
    west, south, east, north = bounds
    x = lambda lon: math.floor((lon + 180) / 360 * 2 ** zoom)
    y = lambda lat: math.floor((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2 ** zoom)
    return [x(west), y(north), x(east), y(south)]


def tiles(bounds, zoom):
    x0, y0, x1, y1 = tile_range(bounds, zoom)
    return {(zoom, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def ndvi_expression(offset):
    # PC COGs have no scale/offset metadata; use the product XML, including PB >= 04.00 offsets.
    denominator = f'(B08+B04+({2 * offset:g}))'
    valid = f'((SCL==4)|(SCL==5)|(SCL==6))&({denominator}>0)&(B04+({offset:g})>=0)&(B08+({offset:g})>=0)&(B04>0)&(B08>0)'
    return f'where({valid},(B08-B04)/{denominator},-2)'


def tile_pattern(layer, scene, offset):
    args = {'collection': COLLECTION, 'item': scene, 'resampling': 'nearest', 'return_mask': 'true'}
    if layer == 'natural':
        args.update(assets='visual', asset_bidx='visual|1,2,3')
    else:
        args.update(asset_as_band='true', expression=ndvi_expression(offset),
                    rescale='-2,1', colormap=json.dumps(RAMP, separators=(',', ':')))
    return API + '/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?' + urllib.parse.urlencode(args)


def source_metadata(item):
    name = item['id'] + '-product.xml'
    path = RAW / name
    url = item['assets']['product-metadata']['href']
    if not path.exists():
        # The anonymous SAS is transient. Never persist the signed URL or token response.
        signed = json.loads(request('https://planetarycomputer.microsoft.com/api/sas/v1/sign?' +
                                    urllib.parse.urlencode({'href': url})))
        body = request(signed['href'])
        path.write_bytes(body)
        write_json(path.with_suffix('.xml.receipt.json'), {
            'requestUrl': url, 'access': 'Anonymous, transient Planetary Computer SAS',
            'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
    root = ET.fromstring(path.read_bytes())
    offsets = {int(e.attrib['band_id']): float(e.text) for e in root.iter()
               if e.tag.split('}')[-1] == 'BOA_ADD_OFFSET'}
    quantification = next(float(e.text) for e in root.iter()
                          if e.tag.split('}')[-1] == 'BOA_QUANTIFICATION_VALUE')
    red, nir = offsets.get(3, 0), offsets.get(7, 0)
    if red != nir or quantification <= 0:
        raise ValueError('Unexpected Sentinel-2 radiometric metadata')
    return {'boaAddOffset': red, 'quantificationValue': quantification,
            'metadataRequest': url, 'metadataReceipt': receipt(name)}


def build_tiles(layer, date, coordinates, pattern):
    from PIL import Image

    def path_for(coord):
        z, x, y = coord
        return PUBLIC / f'tiles/{layer}/{date}/{z}/{x}/{y}.png'

    def save(image, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        pending = path.with_suffix('.pending')
        image.save(pending, format='PNG', optimize=True)
        pending.replace(path)

    parents = {(BASE_ZOOM, x >> (z - BASE_ZOOM), y >> (z - BASE_ZOOM))
               for z, x, y in coordinates if z > BASE_ZOOM}
    direct = {c for c in coordinates if c[0] <= BASE_ZOOM} | parents

    def fetch(coord):
        path = path_for(coord)
        if path.exists():
            return
        z, x, y = coord
        url = pattern.format(z=z, x=x, y=y)
        name = f'{layer}/{date}/{z}/{x}/{y}.png'
        outside = RAW / (name + '.outside.json')
        try:
            if outside.exists():
                save(Image.new('RGBA', (256, 256)), path)
                return
            body = cached(name, url)
        except urllib.error.HTTPError as error:
            body = error.read()
            if error.code != 404 or 'is outside bounds' not in body.decode(errors='replace'):
                raise
            outside.parent.mkdir(parents=True, exist_ok=True)
            outside.write_bytes(body)
            write_json(outside.with_suffix('.json.receipt.json'), {
                'requestUrl': url, 'status': 404,
                'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            })
            save(Image.new('RGBA', (256, 256)), path)
            return
        with Image.open(io.BytesIO(body)) as image:
            if image.size != (256, 256):
                raise ValueError(f'Unexpected tile dimensions: {url}')
            rgba = image.convert('RGBA')
            # A palette compresses colour only; the source's spatial detail is retained.
            image = rgba.quantize(colors=256 if layer == 'natural' else 8,
                                  method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            save(image, path)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(fetch, sorted(direct)))
    for z, x, y in sorted(coordinates):
        path = path_for((z, x, y))
        if z <= BASE_ZOOM or path.exists():
            continue
        factor = 2 ** (z - BASE_ZOOM)
        width = 256 // factor
        with Image.open(path_for((BASE_ZOOM, x // factor, y // factor))) as parent:
            left, top = (x % factor) * width, (y % factor) * width
            tile = parent.crop((left, top, left + width, top + width))
            save(tile.resize((256, 256), Image.Resampling.NEAREST), path)
    print(f'{layer} {date}: {len(coordinates)} tiles', flush=True)


def ndvi_values(data, offset):
    import numpy as np

    red, nir = data[0] + offset, data[1] + offset
    valid = (np.isin(data[2], SCL_VALID) & (data[3] > 0) & (data[0] > 0) & (data[1] > 0)
             & (red >= 0) & (nir >= 0) & ((red + nir) > 0))
    values = np.full(red.shape, np.nan)
    np.divide(nir - red, nir + red, out=values, where=valid)
    return values, valid


def build_grid(field, item, radiometry):
    from rasterio.io import MemoryFile
    from rasterio.warp import transform_bounds

    bounds = site_bounds(field)
    projected = transform_bounds('EPSG:4326', 'EPSG:32645', *bounds)
    west, south = [math.floor(v / 20) * 20 for v in projected[:2]]
    east, north = [math.ceil(v / 20) * 20 for v in projected[2:]]
    width, height = (east - west) // 20, (north - south) // 20
    args = {'collection': COLLECTION, 'item': item['id'], 'assets': ['B04', 'B08', 'SCL'],
            'coord_crs': 'EPSG:32645', 'dst_crs': 'EPSG:32645',
            'unscale': 'false', 'resampling': 'nearest', 'return_mask': 'true'}
    url = API + f'/bbox/{west},{south},{east},{north}/{width}x{height}.tif?' + urllib.parse.urlencode(args, doseq=True)
    name = f"ndvi-{field['id']}-{item['properties']['datetime'][:10]}.tif.gz"
    body = cached(name, url, compressed=True)
    with MemoryFile(body) as memory, memory.open() as raster:
        if raster.shape != (height, width) or raster.count != 4:
            raise ValueError('Unexpected NDVI grid dimensions/bands')
        data = raster.read().astype('float64')
        transform = list(raster.transform)[:6]
    values, valid = ndvi_values(data, radiometry['boaAddOffset'])
    rows = [[round(float(v), 4) if math.isfinite(v) else None for v in row] for row in values]
    return {'siteId': field['id'], 'date': item['properties']['datetime'][:10], 'bounds': bounds,
            'sceneId': item['id'], 'cloudPercent': item['properties']['eo:cloud_cover'],
            'source': SOURCE, 'provenance': PROVENANCE, 'resolutionMetres': 10,
            'cellSizeMetres': 20, 'maskResolutionMetres': 20, 'crs': 'EPSG:32645',
            'transform': transform, 'projectedBounds': [west, south, east, north],
            'width': width, 'height': height, 'rowOrder': 'north-to-south',
            'validFraction': round(float(valid.mean()), 6), 'values': rows,
            'processingBaseline': item['properties']['s2:processing_baseline'],
            'radiometry': radiometry, **receipt(name)}


def build_context(fields):
    from shapely.geometry import LineString, Point, box, mapping

    features = []
    requests = []
    for field in fields:
        west, south, east, north = site_bounds(field)
        bbox = f'{south:.8f},{west:.8f},{north:.8f},{east:.8f}'
        query = (f'[out:json][timeout:60];(way[highway]({bbox});way[waterway]({bbox});'
                 f'way[natural=water]({bbox});relation[waterway=river]({bbox});'
                 f'nwr[place][name]({bbox}););out geom;')
        name = f"overpass-{field['id']}.json.gz"
        for endpoint in ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']:
            url = endpoint + '?' + urllib.parse.urlencode({'data': query})
            try:
                response = json.loads(cached(name, url, compressed=True))
                if response.get('remark'):
                    raise ValueError('Overpass returned incomplete data: ' + response['remark'])
                break
            except (urllib.error.URLError, TimeoutError):
                if endpoint.endswith('kumi.systems/api/interpreter'):
                    raise
        requests.append({'siteId': field['id'], 'bounds': [west, south, east, north], **receipt(name)})
        clip = box(west, south, east, north)
        for element in response['elements']:
            tags = element.get('tags', {})
            geometries = []
            if element['type'] == 'node':
                geometries = [Point(element['lon'], element['lat'])]
            elif element['type'] == 'way':
                points = [(p['lon'], p['lat']) for p in element.get('geometry', []) if 'lon' in p]
                if len(points) > 1:
                    geometries = [LineString(points)]
            else:
                for member in element.get('members', []):
                    points = [(p['lon'], p['lat']) for p in member.get('geometry', []) if 'lon' in p]
                    if len(points) > 1:
                        geometries.append(LineString(points))
            for index, geometry in enumerate(geometries):
                clipped = geometry.intersection(clip)
                if clipped.is_empty:
                    continue
                properties = {**tags, 'siteId': field['id'], 'osmType': element['type'],
                              'osmId': element['id'], 'provenance': PROVENANCE,
                              'source': 'OpenStreetMap contributors', 'productVersion': response.get('version'),
                              'dataTimestamp': response.get('osm3s', {}).get('timestamp_osm_base'),
                              **receipt(name)}
                features.append({'type': 'Feature', 'id': f"{field['id']}/{element['type']}/{element['id']}/{index}",
                                 'properties': properties, 'geometry': mapping(clipped)})
        print(f"OSM {field['id']}: {len(response['elements'])} source elements", flush=True)
    return {'type': 'FeatureCollection', 'attribution': '© OpenStreetMap contributors, ODbL 1.0',
            'license': 'https://opendatacommons.org/licenses/odbl/1-0/', 'requests': requests,
            'limitations': ['OpenStreetMap coverage may be incomplete; absent features are not confirmed absent on the ground.'],
            'waterGeometry': 'Riverbanks and water outlines are context lines, not flood extents.',
            'features': features}


def validate(manifest, grids, context):
    expected = set()
    assert {site['id'] for site in manifest['sites']} == {'mithapukur', 'pirganj', 'gangachara'}
    assert {layer['id'] for layer in manifest['layers']} == {'natural', 'ndvi'}
    for layer in manifest['layers']:
        for frame in layer['dates']:
            assert frame['provenance'] == PROVENANCE and frame['resolutionMetres'] == 10
            for coverage in frame['coverage']:
                assert coverage['minZoom'] <= coverage['maxZoom']
                for zoom in range(coverage['minZoom'], coverage['maxZoom'] + 1):
                    for z, x, y in tiles(coverage['bounds'], zoom):
                        expected.add(PUBLIC / frame['pathTemplate'].lstrip('/').format(z=z, x=x, y=y))
    for path in expected:
        with path.open('rb') as stream:
            header = stream.read(24)
        assert header[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', header[16:24]) == (256, 256), path
    files = list((PUBLIC / 'tiles').rglob('*.png'))
    logical = sum(p.stat().st_size for p in files)
    allocated = sum(p.stat().st_blocks * 512 for p in (PUBLIC / 'tiles').rglob('*')) + (PUBLIC / 'tiles').stat().st_blocks * 512
    assert logical <= LIMIT and allocated <= LIMIT, f'Tile budget exceeded: {logical} bytes; {allocated} allocated'
    assert len(files) == manifest['tileCount'] and logical == manifest['tileBytes']
    for grid in grids['grids']:
        assert len(grid['values']) == grid['height']
        assert all(len(row) == grid['width'] for row in grid['values'])
        assert all(v is None or (isinstance(v, (int, float)) and math.isfinite(v) and -1 <= v <= 1)
                   for row in grid['values'] for v in row)
        assert grid['cellSizeMetres'] == 20 and grid['provenance'] == PROVENANCE
    expected_grids = {(site['id'], date['date']) for site in manifest['sites']
                      for date in manifest['layers'][0]['dates']}
    assert {(g['siteId'], g['date']) for g in grids['grids']} == expected_grids
    assert context['type'] == 'FeatureCollection' and context['features']
    for site in manifest['sites']:
        assert any(f['properties']['siteId'] == site['id'] and f['properties'].get('highway') for f in context['features'])
    print(f'Validated {len(files)} tiles: {logical:,} bytes; {allocated:,} allocated bytes; '
          f"{len(grids['grids'])} grids; {len(context['features'])} OSM features", flush=True)


def self_check():
    assert tile_range([-1, -1, 1, 1], 0) == [0, 0, 0, 0]
    assert tiles([-1, -1, 1, 1], 1) == {(1, 0, 0), (1, 1, 0), (1, 0, 1), (1, 1, 1)}
    assert len(RAMP) == 8 and RAMP[0][1][3] == 0
    assert all(a[0][1] == b[0][0] for a, b in zip(RAMP, RAMP[1:]))
    assert '(B08+B04+(-2000))' in ndvi_expression(-1000)
    # Known reflectances: red .1, NIR .3 must give .5 after the DN offset, not .3333.
    red, nir, offset = 2000, 4000, -1000
    assert (nir - red) / (nir + red + 2 * offset) == .5


def check_cloud_mask():
    import numpy as np

    # Vegetation, real zero, water, cloud, shadow, snow, no data, zero sum and negative reflectance.
    data = np.array([[2000, 2000, 3000, 2000, 2000, 2000, 0, 1000, 999],
                     [4000, 2000, 2000, 4000, 4000, 4000, 0, 1000, 2000],
                     [4, 5, 6, 9, 3, 11, 4, 4, 4],
                     [255, 255, 255, 255, 255, 255, 0, 255, 255]], dtype='float64')
    values, valid = ndvi_values(data, -1000)
    assert np.allclose(values[:3], [.5, 0, -1 / 3])
    assert np.isnan(values[3:]).all() and valid.tolist() == [True, True, True] + [False] * 6


def main():
    self_check()
    paths = [PUBLIC / 'data' / name for name in ('map-layers.json', 'ndvi-grid.json', 'context-osm.geojson')]
    if all(path.exists() for path in paths):
        try:
            validate(*(json.loads(path.read_text()) for path in paths))
            return
        except (AssertionError, FileNotFoundError):
            print('Incomplete pack; rebuilding from cached public responses.', flush=True)
    fields = json.loads((PUBLIC / 'data/earth-data.json').read_text())['fields']
    check_cloud_mask()
    sites = [{'id': f['id'], 'lat': f['lat'], 'lon': f['lon'], 'bounds': site_bounds(f)} for f in fields]
    district = json.loads((PUBLIC / 'data/rangpur_district.geojson').read_text())
    from shapely.geometry import shape
    geometries = [shape(f['geometry']) for f in district['features']]
    overview = [min(g.bounds[0] for g in geometries), min(g.bounds[1] for g in geometries),
                max(g.bounds[2] for g in geometries), max(g.bounds[3] for g in geometries)]
    search_args = {'collections': COLLECTION, 'bbox': ','.join(str(v) for v in overview),
                   'datetime': '2024-01-01T00:00:00Z/2024-12-31T23:59:59Z', 'limit': 1000,
                   'query': json.dumps({'eo:cloud_cover': {'lt': 15}}),
                   'fields': 'id,bbox,geometry,properties.datetime,properties.eo:cloud_cover,properties.s2:processing_baseline'}
    url = STAC + '/search?' + urllib.parse.urlencode(search_args)
    search = json.loads(cached('search-2024.json.gz', url, compressed=True))
    if any(link['rel'] == 'next' for link in search['links']):
        raise ValueError('Scene search truncated; refine the search before selecting dates')
    candidates = [f for f in search['features'] if all(
        shape(f['geometry']).covers(shape({'type': 'Polygon', 'coordinates': [[
            [s['bounds'][0], s['bounds'][1]], [s['bounds'][2], s['bounds'][1]],
            [s['bounds'][2], s['bounds'][3]], [s['bounds'][0], s['bounds'][3]],
            [s['bounds'][0], s['bounds'][1]]]]})) for s in sites)]
    if not candidates:
        raise ValueError('No clear 2024 Sentinel-2 scene covers the prepared sites')
    chosen = min(candidates, key=lambda f: (f['properties']['eo:cloud_cover'], f['id']))
    item_url = STAC + '/collections/' + COLLECTION + '/items/' + chosen['id']
    item = json.loads(cached(chosen['id'] + '.json', item_url))
    radiometry = source_metadata(item)
    date = item['properties']['datetime'][:10]
    coverage = [{'id': s['id'], 'bounds': s['bounds'], 'minZoom': 12, 'maxZoom': 17} for s in sites]
    coverage.append({'id': 'rangpur', 'bounds': overview, 'minZoom': 9, 'maxZoom': 12})
    coordinates = set().union(*(tiles(c['bounds'], z) for c in coverage
                                for z in range(c['minZoom'], c['maxZoom'] + 1)))
    minimum_two_dates = 2 * 2 * len(coordinates) * 4096
    # shortcut: one date fits the disk cap; add seasonal tile dates when the 30 MB cap increases.
    assert minimum_two_dates > LIMIT, 'Revisit the single-date budget calculation'
    selection = {'maximumDatesPerSite': 4, 'selectedDatesPerSite': 1,
                 'method': 'Lowest eo:cloud_cover among 2024 scenes covering all three site boxes.',
                 'cloudThresholdPercent': 15, 'searchRequest': url, **receipt('search-2024.json.gz'),
                 'seasonalCoverage': 'One date only: two complete dates exceed the disk budget even with 4 KiB files.',
                 'twoDateMinimumAllocatedBytes': minimum_two_dates}
    layers = []
    print(f'Selected {date}: {item["id"]}; {len(coordinates)} tiles per layer', flush=True)
    for layer in ('natural', 'ndvi'):
        pattern = tile_pattern(layer, item['id'], radiometry['boaAddOffset'])
        build_tiles(layer, date, coordinates, pattern)
        frame = {'date': date, 'pathTemplate': f'/tiles/{layer}/{date}/{{z}}/{{x}}/{{y}}.png',
                 'minZoom': 9, 'maxZoom': 17, 'bounds': overview, 'coverage': coverage,
                 'sceneId': item['id'], 'cloudPercent': item['properties']['eo:cloud_cover'],
                 'resolutionMetres': 10, 'source': SOURCE, 'provenance': PROVENANCE,
                 'processingBaseline': item['properties']['s2:processing_baseline'],
                 'itemUrl': item_url, 'requestUrlPattern': pattern, 'radiometry': radiometry,
                 'rawTileReceipts': f'data-raw/map-tiles/{layer}/{date}/{{z}}/{{x}}/{{y}}.png.receipt.json',
                 'fetchedAt': receipt(chosen['id'] + '.json')['fetchedAt'],
                 'rendering': '256-colour PNG (natural); 7 fixed NDVI colours plus transparent unknown. '
                              'XYZ WebMercatorQuad, 256 px; z9–14 from data API, z15–17 cropped from z14 '
                              'and enlarged with nearest-neighbour. No additional detail beyond native 10 m.'}
        if layer == 'ndvi':
            frame.update(formula='(B08-B04)/(B08+B04) on offset-corrected BOA reflectance',
                         rescale=[-1, 1], apiRescale=[-2, 1], unknownSentinel=-2, colormap=RAMP,
                         maskValidSclClasses=SCL_VALID, maskResolutionMetres=20)
        layers.append({'id': layer, 'dates': [frame]})
    grids = {'schemaVersion': 1, 'missingValue': None, 'formula': '(NIR-red)/(NIR+red), BOA offset corrected',
             'sampling': 'Nearest 20 m cell, row-major. Transform maps pixel corners in EPSG:32645. '
                         'Lookup: project longitude/latitude; column=floor((x-transform[2])/20), '
                         'row=floor((transform[5]-y)/20). Outside site bounds or grid returns null.',
             'mask': 'Only SCL 4/5/6; no data, saturated, dark, cloud shadow, unclassified, cloud, '
                     'cirrus and snow are null. Negative reflectance and nonpositive denominators are null.',
             'grids': [build_grid(field, item, radiometry) for field in fields]}
    context = build_context(fields)
    files = list((PUBLIC / 'tiles').rglob('*.png'))
    manifest = {'schemaVersion': 1, 'tileScheme': 'xyz', 'tileSize': 256, 'offline': True,
                'attribution': 'Contains modified Copernicus Sentinel data (2024). ESA / Microsoft Planetary Computer.',
                'sites': sites, 'selection': selection, 'layers': layers,
                'tileCount': len(files), 'tileBytes': sum(p.stat().st_size for p in files), 'tileBudgetBytes': LIMIT,
                'ndviGrid': '/data/ndvi-grid.json', 'context': '/data/context-osm.geojson',
                'limitations': ['One clear date per site under the 30 MB disk budget; no seasonal comparison.',
                               'Scene cloud percentage is not local pixel cloud loss. NDVI uses the 20 m SCL mask.',
                               'Tiles intersecting coverage bounds are included in full. Outside coverage has no tiles.',
                               'Rangpur overview uses the same scene; any pixels outside its footprint are transparent.',
                               'NDVI is satellite-observed greenness, not crop diagnosis or ground measurement.']}
    validate(manifest, grids, context)
    for path, value in zip(paths, [manifest, grids, context]):
        write_json(path, value)


if __name__ == '__main__':
    main()
