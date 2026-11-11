"""Freeze real NASA HLS v2 plot means; no credentials are written or printed.

Run in the existing fetch-map-tiles rasterio/numpy environment. --self-check
uses only stdlib. Geometry comes directly from ui.js basePolygon, in lat/lon.
Transient Planetary Computer SAS URLs stay in memory; receipts use unsigned URLs.
"""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
SOURCE_URL = 'https://www.earthdata.nasa.gov/data/projects/hls'
QA_URL = 'https://lpdaac.usgs.gov/documents/1698/HLS_User_Guide_V2.pdf'
DATES = ['2024-03-09', '2024-11-09']
RAW = ROOT / 'data-raw/hls'


def indices(red, nir, swir, fmask):
    # HLS v2 QA bits 1–4: cloud, adjacent cloud/shadow, shadow, snow/ice.
    if fmask == 255 or fmask & 30 or fmask >> 6 == 3:
        return None
    if any(not math.isfinite(v) or v < 0 or v > 10000 for v in (red, nir, swir)):
        return None
    if nir + red <= 0 or nir + swir <= 0:
        return None
    # All HLS reflectances share scale 0.0001 and offset 0, which cancel.
    return (nir - red) / (nir + red), (nir - swir) / (nir + swir)


def self_check():
    assert indices(1000, 3000, 1000, 0) == (.5, .5)
    assert indices(3000, 1000, 3000, 64) == (-.5, -.5)
    assert indices(1000, 3000, 1000, 32) == (.5, .5)  # Water is not a cloud.
    for flag in (2, 4, 8, 16, 192, 255):
        assert indices(1000, 3000, 1000, flag) is None
    for bands in ((-9999, 3000, 1000), (1000, 10001, 1000), (0, 0, 0)):
        assert indices(*bands, 0) is None
    print('HLS expression and Fmask self-check passed')


def get_json(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return json.load(response)


def sample(item, polygon, site_id):
    import numpy as np
    import rasterio
    from rasterio.features import geometry_mask
    from rasterio.warp import transform_geom
    from rasterio.windows import from_bounds, Window

    ring = [[lon, lat] for lat, lon in polygon]
    shape = {'type': 'Polygon', 'coordinates': [ring + [ring[0]]]}
    bands = ['B04', 'B8A', 'B11', 'Fmask'] if item['collection'] == 'hls2-s30' else ['B04', 'B05', 'B06', 'Fmask']
    arrays, receipts = [], []
    window = transform = mask = None
    for band in bands:
        href = item['assets'][band]['href']
        signed = get_json('https://planetarycomputer.microsoft.com/api/sas/v1/sign?' +
                          urllib.parse.urlencode({'href': href}))['href']
        # Do not expose SAS URLs in GDAL diagnostic logs or exception messages.
        with rasterio.Env(CPL_LOG='/dev/null', GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
                          GDAL_HTTP_MAX_RETRY=2, GDAL_HTTP_TIMEOUT=45):
            with rasterio.open(signed) as raster:
                assert raster.res == (30, 30)
                if window is None:
                    projected = transform_geom('EPSG:4326', raster.crs, shape)
                    points = projected['coordinates'][0]
                    xs, ys = zip(*points)
                    bounds = from_bounds(min(xs), min(ys), max(xs), max(ys), raster.transform)
                    c0, r0 = math.floor(bounds.col_off), math.floor(bounds.row_off)
                    window = Window(c0, r0, math.ceil(bounds.col_off + bounds.width) - c0,
                                    math.ceil(bounds.row_off + bounds.height) - r0)
                    transform = raster.window_transform(window)
                    mask = geometry_mask([projected], (int(window.height), int(window.width)),
                                         transform, invert=True, all_touched=False)
                else:
                    assert raster.window_transform(window) == transform
                data = raster.read(1, window=window)
                arrays.append(data)
                path = RAW / f"{item['id']}-{site_id}-{band}.tif"
                with rasterio.open(path, 'w', driver='GTiff', height=data.shape[0], width=data.shape[1],
                                   count=1, dtype=data.dtype, crs=raster.crs, transform=transform) as crop:
                    crop.write(data, 1)
                receipts.append({'band': band, 'url': href,
                                 'windowSha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    samples = [indices(*(int(a[row, col]) for a in arrays)) for row, col in zip(*np.where(mask))]
    valid = [v for v in samples if v is not None]
    return {'ndvi': round(sum(v[0] for v in valid) / len(valid), 6) if valid else None,
            'ndmi': round(sum(v[1] for v in valid) / len(valid), 6) if valid else None,
            'cellCount': len(valid), 'eligibleCellCount': len(samples), 'assets': receipts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-check', action='store_true')
    args = parser.parse_args()
    self_check()
    if args.self_check:
        return
    fields = json.loads((ROOT / 'public/data/earth-data.json').read_text())['fields']
    site_ids = json.loads((ROOT / 'public/data/soil-nutrients.json').read_text())['sites']
    # Reuse the exact traced outlines, rather than duplicating their coordinates.
    polygons = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {basePolygon} from './src/legacy/ui.js';"
        "import fs from 'node:fs';const fields=JSON.parse(fs.readFileSync('public/data/earth-data.json')).fields;"
        "console.log(JSON.stringify(Object.fromEntries(fields.map(f=>[f.id,basePolygon(f)]))))"], cwd=ROOT))
    RAW.mkdir(parents=True, exist_ok=True)
    pack = {'schemaVersion': 1, 'source': 'NASA HLS v2.0 (HLSL30 / HLSS30), Microsoft Planetary Computer',
            'url': SOURCE_URL, 'resolutionMetres': 30,
            'method': 'Nearest acquisition day within ±10 days; ties use tile cloud cover then item ID. '
                      'Native 30 m cell centres inside ui.js basePolygon traced field outlines, no buffer. '
                      'Fmask bits 1–4 and high aerosol (bits 6–7=3) excluded; fill, reflectance outside '
                      '0–1 and nonpositive denominators excluded. Arithmetic mean of per-cell '
                      'NDVI=(NIR-red)/(NIR+red), NDMI=(NIR-SWIR1)/(NIR+SWIR1), same valid cells. '
                      'S30 uses B04/B8A/B11; L30 uses B04/B05/B06. Scale 0.0001, offset 0. '
                      'First scene with at least one jointly valid field cell is selected; '
                      'partial clear coverage is reported by cellCount/eligibleCellCount.',
            'qaReference': QA_URL, 'itemIds': [], 'sites': {}}
    for field in fields:
        site_id = field['id']
        if site_id not in site_ids:
            continue
        polygon = polygons[site_id]
        xs, ys = zip(*[(lon, lat) for lat, lon in polygon])
        site = {'polygon': polygon, 'coordinateOrder': 'latitude,longitude', 'observations': []}
        for target in DATES:
            day = dt.date.fromisoformat(target)
            interval = f'{day - dt.timedelta(days=10)}T00:00:00Z/{day + dt.timedelta(days=10)}T23:59:59Z'
            query = STAC + '/search?' + urllib.parse.urlencode({
                'collections': 'hls2-l30,hls2-s30', 'bbox': ','.join(map(str, (min(xs), min(ys), max(xs), max(ys)))),
                'datetime': interval, 'limit': 100})
            response = get_json(query)
            candidates = response['features']
            while next_link := next((link for link in response['links'] if link['rel'] == 'next'), None):
                response = get_json(next_link['href'])
                candidates.extend(response['features'])
            candidates.sort(key=lambda item: (
                abs((dt.date.fromisoformat(item['properties']['datetime'][:10]) - day).days),
                item['properties'].get('eo:cloud_cover', 100), item['id']))
            obs = {'targetDate': target, 'date': None, 'ndvi': None, 'ndmi': None, 'cellCount': 0,
                   'itemId': None, 'sensor': None, 'reason': 'No clear HLS cells inside field within ±10 days',
                   'searchUrl': query, 'candidateItemIds': [i['id'] for i in candidates],
                   'attemptedItemIds': [], 'attempts': []}
            for item in candidates:
                obs['attemptedItemIds'].append(item['id'])
                (RAW / (item['id'] + '.json')).write_text(json.dumps(item))
                attempt = {'itemId': item['id'], 'date': item['properties']['datetime'][:10],
                           'url': STAC + '/collections/' + item['collection'] + '/items/' + item['id']}
                obs['attempts'].append(attempt)
                try:
                    result = sample(item, polygon, site_id)
                    attempt.update(result)
                    attempt['reason'] = None if result['cellCount'] else 'No jointly valid clear field cells'
                except Exception as error:
                    # Exception text may contain transient SAS credentials. Persist only its type.
                    attempt['reason'] = 'Asset retrieval/processing failed: ' + type(error).__name__
                    continue
                if result['cellCount']:
                    platform = item['properties'].get('platform', '')
                    obs.update(result, itemId=item['id'], date=attempt['date'],
                               sensor=platform,
                               collection=item['collection'], url=attempt['url'], reason=None)
                    pack['itemIds'].append(item['id'])
                    break
            if any('failed:' in (a['reason'] or '') for a in obs['attempts']) and not obs['cellCount']:
                obs['reason'] = 'HLS retrieval failed; clear-scene availability unknown. See attempts.'
            site['observations'].append(obs)
            print(site_id, target, obs['date'], obs['ndvi'], obs['ndmi'], obs['cellCount'], flush=True)
        pack['sites'][site_id] = site
    pack['itemIds'] = sorted(set(pack['itemIds']))
    pack['retrievedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    output = ROOT / 'public/data/hls-field.json'
    pending = output.with_suffix('.json.pending')
    pending.write_text(json.dumps(pack, indent=2, allow_nan=False) + '\n')
    pending.replace(output)


if __name__ == '__main__':
    main()
