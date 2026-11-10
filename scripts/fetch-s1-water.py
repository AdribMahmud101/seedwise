"""Fetch observed 2024 Sentinel-1 RTC VV water masks for the app's pilot outlines.

Setup: python -m venv /tmp/datas1-venv
       /tmp/datas1-venv/bin/pip install planetary-computer pystac-client rasterio scipy
Run:   /tmp/datas1-venv/bin/python scripts/fetch-s1-water.py
No generated backscatter, seasonal corrections, or missing-data substitutions.
"""

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import subprocess

import numpy as np
import planetary_computer
from pystac_client import Client
import rasterio
from rasterio.features import geometry_mask
from rasterio.transform import from_origin, array_bounds
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_geom, transform_bounds
from scipy.ndimage import median_filter

ROOT = Path(__file__).resolve().parents[1]
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
COLLECTION = 'sentinel-1-rtc'
SOURCE = 'Sentinel-1 RTC, ESA/Copernicus via Planetary Computer'
EPSG = 32645
CELL_M = 10  # Native sampling; effective SAR resolution is approximately 20 x 22 m.
BUFFER_M = 200
THRESHOLD_DB = -18


def pilot_fields():
    """Use the app's current traced outlines, including their centroid offsets."""
    code = """
import { basePolygon } from './src/legacy/ui.js';
import { readFileSync } from 'node:fs';
const fields = JSON.parse(readFileSync('public/data/earth-data.json')).fields;
console.log(JSON.stringify(fields.map(f => ({id: f.id, ring: basePolygon(f).map(([lat, lon]) => [lon, lat])}))));
"""
    return json.loads(subprocess.check_output(
        ['node', '--no-warnings', '--input-type=module', '-e', code], cwd=ROOT, text=True))


def acquisition(item):
    return datetime.fromisoformat(item.properties['datetime'].replace('Z', '+00:00'))


def distance_from_15th(item):
    date = acquisition(item)
    return abs((date - date.replace(day=15, hour=0, minute=0, second=0, microsecond=0)).total_seconds())


def select_scenes(items):
    """Prefer complete annual tracks, then the smallest total distance to midmonth."""
    tracks = defaultdict(list)
    for item in items:
        if 'vv' in item.assets:
            tracks[(item.properties['sat:relative_orbit'], item.properties['sat:orbit_state'])].append(item)
    complete = []
    for track, candidates in tracks.items():
        months = [[i for i in candidates if acquisition(i).month == month] for month in range(1, 13)]
        if all(months):
            chosen = [min(rows, key=lambda i: (distance_from_15th(i), i.id)) for rows in months]
            complete.append((sum(map(distance_from_15th, chosen)), track, chosen, months))
    if not complete:
        raise ValueError('No single VV orbit/direction covers all twelve months')
    _, track, chosen, months = min(complete, key=lambda entry: (entry[0], entry[1]))
    return track, chosen, months


def otsu_db(values):
    """Maximize between-class variance over 256 equal-width context histogram bins."""
    histogram, edges = np.histogram(values, bins=256)
    centers = (edges[:-1] + edges[1:]) / 2
    weight = np.cumsum(histogram)
    moment = np.cumsum(histogram * centers)
    denominator = weight[:-1] * (weight[-1] - weight[:-1])
    score = np.full(255, -np.inf)
    valid = denominator > 0
    score[valid] = ((moment[-1] * weight[:-1][valid] - moment[:-1][valid] * weight[-1]) ** 2
                    / denominator[valid])
    if not valid.any():
        raise ValueError('Otsu needs at least two populated backscatter bins')
    return float(centers[int(np.argmax(score))])


def read_date(item, transform, shape, field_mask):
    href = item.assets['vv'].href.split('?', 1)[0]
    # One real halo pixel makes the exported edge medians use measured neighbours.
    halo_transform = transform * rasterio.Affine.translation(-1, -1)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR',
                      CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tiff', GDAL_HTTP_TIMEOUT='60',
                      GDAL_HTTP_MAX_RETRY='3', GDAL_HTTP_RETRY_DELAY='2'):
        with rasterio.open(planetary_computer.sign(href)) as source:
            if source.scales != (1.0,) or source.offsets != (0.0,):
                raise ValueError(f'Unexpected calibration scaling: {item.id}')
            with WarpedVRT(source, crs=f'EPSG:{EPSG}', transform=halo_transform,
                           height=shape[0] + 2, width=shape[1] + 2,
                           resampling=rasterio.enums.Resampling.nearest) as grid:
                vv = grid.read(1, masked=True)
    if np.ma.getmaskarray(vv).any() or not np.isfinite(vv).all() or (vv <= 0).any():
        raise ValueError(f'Missing/nonpositive VV in field context: {item.id}')
    linear = np.asarray(vv, dtype=np.float32)
    filtered = median_filter(linear, size=3)[1:-1, 1:-1]
    # Quantize measured dB for the offline pack, then classify those same exported values.
    db = np.round(10 * np.log10(filtered.astype(np.float64)), 4)
    water = db < THRESHOLD_DB
    otsu = otsu_db(db)
    return dict(date=acquisition(item).date().isoformat(), datetime=item.properties['datetime'],
                item_id=item.id, item_url=f'{STAC}/collections/{COLLECTION}/items/{item.id}',
                asset_href=href, relative_orbit=item.properties['sat:relative_orbit'],
                orbit_direction=item.properties['sat:orbit_state'],
                vv_db=db.tolist(), water=water.astype(int).tolist(),
                flooded_pct=round(100 * float(water[field_mask].mean()), 4),
                otsu_db=otsu, flooded_pct_otsu=round(100 * float((db[field_mask] < otsu).mean()), 4),
                field_pixels=int(field_mask.sum()), valid_pixels=int(db.size),
                raw_window_sha256=hashlib.sha256(linear.astype('<f4').tobytes()).hexdigest())


def fetch_site(site, catalog):
    ring = site['ring'] + [site['ring'][0]]
    polygon = dict(type='Polygon', coordinates=[ring])
    projected = transform_geom('EPSG:4326', f'EPSG:{EPSG}', polygon)
    points = projected['coordinates'][0]
    west = math.floor((min(p[0] for p in points) - BUFFER_M) / CELL_M) * CELL_M
    south = math.floor((min(p[1] for p in points) - BUFFER_M) / CELL_M) * CELL_M
    east = math.ceil((max(p[0] for p in points) + BUFFER_M) / CELL_M) * CELL_M
    north = math.ceil((max(p[1] for p in points) + BUFFER_M) / CELL_M) * CELL_M
    shape = ((north - south) // CELL_M, (east - west) // CELL_M)
    transform = from_origin(west, north, CELL_M, CELL_M)
    field_mask = geometry_mask([projected], out_shape=shape, transform=transform, invert=True)
    if not field_mask.any():
        raise ValueError(f'No pixel centers inside {site["id"]}')
    bbox = list(transform_bounds(f'EPSG:{EPSG}', 'EPSG:4326', *array_bounds(*shape, transform)))
    items = list(catalog.search(collections=[COLLECTION], bbox=bbox,
                                datetime='2024-01-01T00:00:00Z/2024-12-31T23:59:59Z',
                                method='GET', limit=1000).items())
    track, chosen, months = select_scenes(items)
    print(f'{site["id"]}: orbit {track[0]} {track[1]}; {len(items)} STAC candidates', flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        dates = list(pool.map(lambda item: read_date(item, transform, shape, field_mask), chosen))
    return dict(bbox=bbox, cell_m=CELL_M, epsg=EPSG, transform=list(transform)[:6],
                polygon=polygon, field_mask=field_mask.astype(int).tolist(),
                truth='REMOTE_OBSERVED', source=SOURCE, collection=COLLECTION, stac_url=STAC,
                caveat='Threshold-detected open water, not measured flood depth. Native 10 m sampling has approximately 20 x 22 m SAR resolution; tiny plots and vegetation limit flood detection. Otsu can separate non-water land covers.',
                relative_orbit=track[0], orbit_direction=track[1],
                method=dict(buffer_m=BUFFER_M, median_filter='3x3 in linear gamma0, one-pixel read halo',
                            db='10*log10(gamma0), rounded to 4 decimals before classification',
                            water_threshold_db=THRESHOLD_DB, otsu_bins=256,
                            otsu_support='entire buffered context; first maximum between-class variance',
                            sampling='nearest native 10 m samples on a common UTM45N grid',
                            field_fraction='water pixel centers inside traced polygon / all field pixel centers',
                            orbit_selection='all 12 months, then minimum sum of seconds from each 15th 00:00 UTC; orbit number breaks ties'),
                candidates=[[dict(item_id=i.id, datetime=i.properties['datetime'])
                             for i in sorted(rows, key=lambda i: (distance_from_15th(i), i.id))] for rows in months],
                dates=dates)


def sanity_check(pack):
    for name, site in pack.items():
        values = [d['flooded_pct'] for d in site['dates']]
        if len(values) != 12 or any(v >= 15 for v in values[:4]):
            raise ValueError(f'{name}: January–April must each be below 15%: {values[:4]}')
        if not any(0 < v < 100 for v in values):
            raise ValueError(f'{name}: all twelve dates are 0/100: {values}')
        if max(values[6:9]) < sum(values[:4]) / 4:
            raise ValueError(f'{name}: July–September peak below January–April mean')
        if not all(d['item_id'] and d['asset_href'] for d in site['dates']):
            raise ValueError(f'{name}: missing STAC provenance')


def main():
    catalog = Client.open(STAC, timeout=60)
    pack = {site['id']: fetch_site(site, catalog) for site in pilot_fields()}
    print('site         month   date        orbit direction   flooded_pct otsu_db  otsu_pct item_id', flush=True)
    for name, site in pack.items():
        for d in site['dates']:
            print(f'{name:12} {d["date"][:7]} {d["date"]} {site["relative_orbit"]:5} '
                  f'{site["orbit_direction"]:10} {d["flooded_pct"]:11.4f} {d["otsu_db"]:8.3f} '
                  f'{d["flooded_pct_otsu"]:8.4f} {d["item_id"]}', flush=True)
    body = json.dumps(pack, separators=(',', ':'), allow_nan=False) + '\n'
    if len(body.encode()) > 1_000_000:
        raise ValueError('Sentinel-1 pack exceeds 1 MB')
    output = ROOT / 'public/data/s1-water.json'
    output.write_text(body)
    print(f'Saved {output.relative_to(ROOT)}: {len(body.encode())} bytes', flush=True)
    # Preserve real observations for inspection even when an acceptance assumption fails.
    sanity_check(pack)


if __name__ == '__main__':
    main()
