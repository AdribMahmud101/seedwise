"""Fetch SoilGrids 2.0 means at prepared site coordinates (Pillow for WCS TIFFs).

Run: python3 scripts/fetch-soilgrids.py [--self-check]
REST is tried briefly before WCS 2.0.1. Failed sites remain null, never estimates.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
import json
import math
from pathlib import Path
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEPTHS = [(0, 5), (5, 15), (15, 30), (30, 60), (60, 100)]
PROPERTIES = {
    'clay': ('clayPct', 10), 'sand': ('sandPct', 10), 'silt': ('siltPct', 10),
    'soc': ('socGkg', 10), 'phh2o': ('ph', 10), 'bdod': ('bulkDensity', 100),
}
SOURCE = 'ISRIC SoilGrids 2.0 (250 m), mean predictions'


def convert(prop, value):
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Missing or invalid SoilGrids value')
    result = value / PROPERTIES[prop][1]
    ceiling = 100 if prop in ('clay', 'sand', 'silt') else 14 if prop == 'phh2o' else 3 if prop == 'bdod' else 1000
    if result > ceiling:
        raise ValueError('SoilGrids value outside physical range')
    return result


def texture_class(clay, sand, silt):
    """USDA fine-earth triangle; normalize rounding in independent mean maps."""
    values = (clay, sand, silt)
    if any(not math.isfinite(v) or v < 0 for v in values) or sum(values) <= 0:
        raise ValueError('Invalid texture fractions')
    clay, sand, silt = (v * 100 / sum(values) for v in values)
    if silt + 1.5 * clay < 15:
        return 'sand'
    if silt + 2 * clay < 30:
        return 'loamy sand'
    if (clay < 20 and sand > 52) or (clay < 7 and silt < 50):
        return 'sandy loam'
    if clay < 27 and 28 <= silt < 50 and sand <= 52:
        return 'loam'
    if silt >= 80 and clay < 12:
        return 'silt'
    if silt >= 50 and clay < 27:
        return 'silt loam'
    if 20 <= clay < 35 and silt < 28 and sand > 45:
        return 'sandy clay loam'
    if 27 <= clay < 40 and 20 < sand <= 45:
        return 'clay loam'
    if 27 <= clay < 40 and sand <= 20:
        return 'silty clay loam'
    if clay >= 35 and sand > 45:
        return 'sandy clay'
    if clay >= 40 and silt >= 40:
        return 'silty clay'
    return 'clay'


def request(url, timeout):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'RoponRadar-SoilGrids/1.0'}), timeout=timeout) as response:
                return response.read()
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def rest_site(site):
    args = [('lat', site['lat']), ('lon', site['lon']), ('value', 'mean')]
    args += [('property', p) for p in PROPERTIES]
    args += [('depth', f'{a}-{b}cm') for a, b in DEPTHS]
    data = json.loads(request('https://rest.isric.org/soilgrids/v2.0/properties/query?' + urlencode(args), 3))
    return {(p['name'], d['label']): d['values']['mean']
            for p in data['properties']['layers'] for d in p['depths']}


def wcs_value(site, prop, top, bottom):
    from PIL import Image

    lat, lon = site['lat'], site['lon']
    args = [('map', f'/map/{prop}.map'), ('SERVICE', 'WCS'), ('VERSION', '2.0.1'),
            ('REQUEST', 'GetCoverage'), ('COVERAGEID', f'{prop}_{top}-{bottom}cm_mean'),
            ('FORMAT', 'image/tiff'), ('SUBSET', f'long({lon - .003},{lon + .003})'),
            ('SUBSET', f'lat({lat - .003},{lat + .003})'),
            ('SUBSETTINGCRS', 'http://www.opengis.net/def/crs/EPSG/0/4326'),
            ('OUTPUTCRS', 'http://www.opengis.net/def/crs/EPSG/0/4326')]
    body = request('https://maps.isric.org/mapserv?' + urlencode(args), 30)
    with Image.open(BytesIO(body)) as image:
        sx, sy, _ = image.tag_v2[33550]
        px, py, _, west, north, _ = image.tag_v2[33922]
        col = math.floor(px + (lon - west) / sx)
        row = math.floor(py + (north - lat) / sy)
        if not (0 <= col < image.width and 0 <= row < image.height):
            raise ValueError('Site outside returned TIFF')
        value = image.getpixel((col, row))
        nodata = str(image.tag_v2.get(42113, '')).strip('\x00')
        if nodata and value == float(nodata):
            raise ValueError('SoilGrids nodata pixel')
        convert(prop, value)
        return (prop, f'{top}-{bottom}cm'), value


def fetch_site(site):
    try:
        try:
            values = rest_site(site)
            # Validate all properties before accepting a partial REST response.
            for prop in PROPERTIES:
                for top, bottom in DEPTHS:
                    convert(prop, values[(prop, f'{top}-{bottom}cm')])
            method = 'REST'
        except (OSError, ValueError, KeyError, TypeError):
            tasks = [(site, prop, a, b) for prop in PROPERTIES for a, b in DEPTHS]
            with ThreadPoolExecutor(max_workers=4) as pool:
                values = dict(pool.map(lambda args: wcs_value(*args), tasks))
            method = 'WCS 2.0.1 GetCoverage; containing pixel in EPSG:4326 output'
        layers = []
        for top, bottom in DEPTHS:
            layer = {'topCm': top, 'bottomCm': bottom}
            for prop, (key, _) in PROPERTIES.items():
                layer[key] = convert(prop, values[(prop, f'{top}-{bottom}cm')])
            layer['textureClass'] = texture_class(layer['clayPct'], layer['sandPct'], layer['siltPct'])
            layers.append(layer)
        print(f"{site['id']}: five real soil layers via {method}", flush=True)
        return {'source': SOURCE, 'cellM': 250, 'lat': site['lat'], 'lon': site['lon'],
                'method': method, 'layers': layers}
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"{site['id']}: unavailable ({type(error).__name__}); writing null", flush=True)
        return None


def fetch_neighborhood(site):
    """Read real pH/SOC neighbours from a 250 m WCS raster in EPSG:4326."""
    from PIL import Image

    grids = {}
    geometry = None
    receipts = []
    for prop, key in [('phh2o', 'ph'), ('soc', 'omPct')]:
        lat, lon = site['lat'], site['lon']
        step_lat = 250 / 111195.08
        step_lon = step_lat / math.cos(math.radians(lat))
        args = [('map', f'/map/{prop}.map'), ('SERVICE', 'WCS'), ('VERSION', '2.0.1'),
                ('REQUEST', 'GetCoverage'), ('COVERAGEID', f'{prop}_0-5cm_mean'),
                ('FORMAT', 'image/tiff'), ('SUBSET', f'long({lon - step_lon * 2},{lon + step_lon * 2})'),
                ('SUBSET', f'lat({lat - step_lat * 2},{lat + step_lat * 2})'),
                ('SUBSETTINGCRS', 'http://www.opengis.net/def/crs/EPSG/0/4326'),
                ('OUTPUTCRS', 'http://www.opengis.net/def/crs/EPSG/0/4326')]
        url = 'https://maps.isric.org/mapserv?' + urlencode(args)
        with Image.open(BytesIO(request(url, 45))) as image:
            sx, sy, _ = image.tag_v2[33550]
            px, py, _, west, north, _ = image.tag_v2[33922]
            col = math.floor(px + (lon - west) / sx)
            row = math.floor(py + (north - lat) / sy)
            if not (1 <= col < image.width - 1 and 1 <= row < image.height - 1):
                raise ValueError('WCS does not cover 3×3 neighbourhood')
            current = {'west': west + (col - 1 + .5 - px) * sx,
                       'north': north - (row - 1 + .5 - py) * sy, 'stepLon': sx, 'stepLat': sy}
            if geometry is not None and geometry != current:
                raise ValueError('SoilGrids property grids do not align')
            geometry = current
            nodata = str(image.tag_v2.get(42113, '')).strip('\x00')
            values = []
            for r in range(row - 1, row + 2):
                values.append([])
                for c in range(col - 1, col + 2):
                    raw = image.getpixel((c, r))
                    if nodata and raw == float(nodata):
                        raise ValueError('Neighbour is nodata')
                    value = convert(prop, raw)
                    values[-1].append(value * .1724 if prop == 'soc' else value)
            grids[key] = values
            receipts.append(url)
    return {**geometry, **grids, 'cellM': 250, 'depthCm': [0, 5],
            'method': '3×3 neighbouring pixels in WCS EPSG:4326 output; native model support 250 m; bilinear display',
            'omConversion': 'OM (%) = SOC (g/kg) × 0.1724; estimated from organic carbon',
            'requestUrls': receipts, 'retrievedAt': datetime.now(timezone.utc).isoformat()}


def self_check():
    for prop, raw, expected in [('clay', 235, 23.5), ('sand', 500, 50), ('silt', 265, 26.5),
                                ('soc', 123, 12.3), ('phh2o', 65, 6.5), ('bdod', 135, 1.35)]:
        assert convert(prop, raw) == expected
    examples = [(3, 95, 2, 'sand'), (5, 85, 10, 'loamy sand'), (10, 65, 25, 'sandy loam'),
                (20, 40, 40, 'loam'), (5, 5, 90, 'silt'), (15, 20, 65, 'silt loam'),
                (25, 55, 20, 'sandy clay loam'), (35, 35, 30, 'clay loam'),
                (35, 10, 55, 'silty clay loam'), (40, 50, 10, 'sandy clay'),
                (45, 10, 45, 'silty clay'), (55, 25, 20, 'clay')]
    for clay, sand, silt, expected in examples:
        assert texture_class(clay, sand, silt) == expected
    for value in (None, -32768, float('nan')):
        try:
            convert('clay', value)
        except ValueError:
            continue
        raise AssertionError('Missing values must be rejected')
    print('SoilGrids conversion and all 12 USDA texture classes passed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-check', action='store_true')
    parser.add_argument('--neighborhood-only', action='store_true')
    args = parser.parse_args()
    if args.neighborhood_only:
        output = ROOT / 'public/data/soil-profile.json'
        pack = json.loads(output.read_text())
        sites = json.loads((ROOT / 'public/data/earth-data.json').read_text())['fields']
        for site in sites:
            neighborhood = fetch_neighborhood(site)
            if pack['sites'].get(site['id']):
                pack['sites'][site['id']]['neighborhood'] = neighborhood
                print(f"{site['id']}: real 3×3 pH/OM neighbourhood", flush=True)
        output.write_text(json.dumps(pack, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
        return
    if args.self_check:
        self_check()
        return
    sites = json.loads((ROOT / 'public/data/earth-data.json').read_text())['fields']
    profiles = {site['id']: fetch_site(site) for site in sites}
    for site in sites:
        if profiles[site['id']]:
            profiles[site['id']]['neighborhood'] = fetch_neighborhood(site)
    pack = {'schemaVersion': 1, 'source': SOURCE, 'url': 'https://soilgrids.org/',
            'license': 'CC BY 4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
            'retrievedAt': datetime.now(timezone.utc).isoformat(), 'statistic': 'mean',
            'unitsReference': 'https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html',
            'textureReference': 'https://www.nrcs.usda.gov/resources/education-and-teaching-materials/soil-texture-calculator',
            'note': 'Modeled 250 m soil properties, not field measurements. Texture uses normalized fine-earth fractions. Failed sites are null.',
            'sites': profiles}
    body = json.dumps(pack, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    assert len(body.encode()) <= 20_000
    output = ROOT / 'public/data/soil-profile.json'
    output.write_text(body)
    print(f'Wrote {output.relative_to(ROOT)} ({len(body.encode())} bytes)')


if __name__ == '__main__':
    main()
