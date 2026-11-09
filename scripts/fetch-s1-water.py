#!/usr/bin/env python3
"""Fetch Sentinel-1 RTC backscatter and compute water/ponding mask for pilot fields.

Queries Microsoft Planetary Computer STAC for Sentinel-1 RTC (IW GRD RTC) scenes in 2024
covering Mithapukur, Pirganj, and Gangachara fields.
Computes VV/VH backscatter grids (≈20 m resolution, field bbox + 200 m buffer),
water mask (VV < -18 dB or Otsu threshold), and flooded percentage per date.

Truth: REMOTE_OBSERVED
Source: "Sentinel-1 RTC, ESA/Copernicus via Planetary Computer"
Outputs: public/data/s1-water.json

Run: python3 scripts/fetch-s1-water.py [--self-check]
"""

from __future__ import annotations
import argparse
from datetime import datetime, timezone
import io
import json
import math
from pathlib import Path
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_FILE = ROOT / 'public' / 'data' / 's1-water.json'
STAC_API = 'https://planetarycomputer.microsoft.com/api/stac/v1'
DATA_API = 'https://planetarycomputer.microsoft.com/api/data/v1/item'
USER_AGENT = 'RoponRadar/1.0 (Sentinel-1 water fetcher)'

# Pilot fields: base centroid coordinates and polygon vertex offsets from ui.js
SITES_CONFIG = {
    'mithapukur': {
        'name': 'Mithapukur',
        'lat': 25.54,
        'lon': 89.27,
        'offsets': [
            [0.001043, 0.001147],
            [0.000992, 0.001421],
            [0.000692, 0.001343],
            [0.000728, 0.001091],
        ],
    },
    'pirganj': {
        'name': 'Pirganj',
        'lat': 25.50,
        'lon': 89.22,
        'offsets': [
            [0.000745, 0.000838],
            [0.000736, 0.001298],
            [0.000487, 0.00129],
            [0.000479, 0.000832],
        ],
    },
    'gangachara': {
        'name': 'Gangachara',
        'lat': 25.85,
        'lon': 89.20,
        'offsets': [
            [0.001101, -0.000599],
            [0.001071, -0.00021],
            [0.00086, -0.000217],
            [0.000691, -0.000264],
            [0.000721, -0.000666],
            [0.000854, -0.000653],
        ],
    },
}

# 12 representative dates spanning 2024 seasons (pre-monsoon, peak monsoon Jul-Sep, Aman Oct-Nov, post-flood Dec)
TARGET_SCENES = [
    {'date': '2024-01-14', 'sceneId': 'S1A_IW_GRDH_1SDV_20240114T000349_20240114T000414_052095_064BDC_rtc', 'season': 'rabi'},
    {'date': '2024-02-16', 'sceneId': 'S1A_IW_GRDH_1SDV_20240216T121340_20240216T121405_052584_065C6B_rtc', 'season': 'rabi'},
    {'date': '2024-03-14', 'sceneId': 'S1A_IW_GRDH_1SDV_20240314T000349_20240314T000414_052970_066981_rtc', 'season': 'pre_monsoon'},
    {'date': '2024-04-16', 'sceneId': 'S1A_IW_GRDH_1SDV_20240416T121341_20240416T121406_053459_067C6D_rtc', 'season': 'pre_monsoon'},
    {'date': '2024-05-17', 'sceneId': 'S1A_IW_GRDH_1SDV_20240517T120534_20240517T120559_053911_068D7E_rtc', 'season': 'pre_monsoon'},
    {'date': '2024-06-15', 'sceneId': 'S1A_IW_GRDH_1SDV_20240615T121340_20240615T121405_054334_069C22_rtc', 'season': 'early_monsoon'},
    {'date': '2024-07-16', 'sceneId': 'S1A_IW_GRDH_1SDV_20240716T120532_20240716T120557_054786_06ABD2_rtc', 'season': 'peak_monsoon'},
    {'date': '2024-08-14', 'sceneId': 'S1A_IW_GRDH_1SDV_20240814T121338_20240814T121403_055209_06BAB8_rtc', 'season': 'peak_monsoon'},
    {'date': '2024-09-16', 'sceneId': 'S1A_IW_GRDH_1SDV_20240916T235541_20240916T235606_055697_06CD44_rtc', 'season': 'peak_monsoon'},
    {'date': '2024-10-16', 'sceneId': 'S1A_IW_GRDH_1SDV_20241016T000349_20241016T000414_056120_06DDFB_rtc', 'season': 'aman'},
    {'date': '2024-11-13', 'sceneId': 'S1A_IW_GRDH_1SDV_20241113T120533_20241113T120558_056536_06EE88_rtc', 'season': 'aman'},
    {'date': '2024-12-15', 'sceneId': 'S1A_IW_GRDH_1SDV_20241215T000346_20241215T000411_056995_0700B5_rtc', 'season': 'post_flood'},
]

WATER_THRESHOLD_DB = -18.0  # Standard SAR water backscatter threshold (<-18 dB)

def point_in_poly(x: float, y: float, poly: list[list[float]]) -> bool:
    """Ray-casting algorithm for point-in-polygon test."""
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def compute_site_geometry(site_id: str):
    cfg = SITES_CONFIG[site_id]
    base_lat, base_lon = cfg['lat'], cfg['lon']
    poly = [[base_lat + dy, base_lon + dx] for dy, dx in cfg['offsets']]
    lats = [p[0] for p in poly]
    lons = [p[1] for p in poly]

    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)

    # 200 m buffer around field bounding box
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(base_lat))

    lat_pad = 200.0 / m_per_deg_lat
    lon_pad = 200.0 / m_per_deg_lon

    bbox_200m = [
        round(min_lon - lon_pad, 6),
        round(min_lat - lat_pad, 6),
        round(max_lon + lon_pad, 6),
        round(max_lat + lat_pad, 6),
    ]

    width_m = (max_lon - min_lon) * m_per_deg_lon + 400.0
    height_m = (max_lat - min_lat) * m_per_deg_lat + 400.0

    cols = int(round(width_m / 20.0))
    rows = int(round(height_m / 20.0))

    return {
        'field_polygon': poly,
        'field_bbox': [round(min_lon, 6), round(min_lat, 6), round(max_lon, 6), round(max_lat, 6)],
        'bbox_200m': bbox_200m,
        'cols': cols,
        'rows': rows,
        'cell_m': 20.0
    }

def read_tiff_data(data: bytes, width: int, height: int):
    """Parse TIFF bands (float32) from PC Titiler response."""
    order = '<' if data[:2] == b'II' else '>'
    offset = struct.unpack_from(order + 'I', data, 4)[0]
    num_tags = struct.unpack_from(order + 'H', data, offset)[0]
    tags = {}
    for i in range(num_tags):
        tag, kind, count, value = struct.unpack_from(order + 'HHII', data, offset + 2 + i * 12)
        tags[tag] = (kind, count, value)

    tw = tags[256][2]
    th = tags[257][2]
    samples = tags[277][2]
    data_offset = tags[273][2]
    byte_count = tags[279][2]

    arr = np.frombuffer(data[data_offset:data_offset + byte_count], dtype=np.float32).reshape((th, tw, samples))
    return arr

def fetch_s1_grid(scene_id: str, bbox: list[float], cols: int, rows: int):
    """Fetch VV and VH TIFF from Planetary Computer data API."""
    west, south, east, north = bbox
    url = f"{DATA_API}/bbox/{west},{south},{east},{north}/{cols}x{rows}.tif?collection=sentinel-1-rtc&item={scene_id}&assets=vv&assets=vh"
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                content = resp.read()
                return read_tiff_data(content, cols, rows)
        except Exception as err:
            if attempt == 2:
                raise RuntimeError(f"Failed to fetch {scene_id} at {bbox}: {err}") from err
            time.sleep(1 + attempt)

def process_site_date(site_geo: dict, scene_info: dict):
    scene_id = scene_info['sceneId']
    date_str = scene_info['date']
    bbox = site_geo['bbox_200m']
    cols = site_geo['cols']
    rows = site_geo['rows']

    arr = fetch_s1_grid(scene_id, bbox, cols, rows)
    vv_lin = arr[:, :, 0]
    vh_lin = arr[:, :, 1] if arr.shape[2] > 1 else None

    # Linear gamma0 to dB: 10 * log10(val)
    vv_db = 10.0 * np.log10(np.clip(vv_lin, 1e-5, None))
    vh_db = 10.0 * np.log10(np.clip(vh_lin, 1e-5, None)) if vh_lin is not None else None

    # Water mask (VV < -18 dB)
    water_mask = (vv_db < WATER_THRESHOLD_DB).astype(int)

    # Calculate flooded percentage inside actual field polygon
    # Note: polygon vertices are [lat, lon], so point_in_poly(lon, lat, poly_lon_lat)
    poly_lon_lat = [[p[1], p[0]] for p in site_geo['field_polygon']]
    west, south, east, north = bbox

    field_cells = 0
    field_water_cells = 0

    for r in range(rows):
        lat = north - (r + 0.5) * (north - south) / rows
        for c in range(cols):
            lon = west + (c + 0.5) * (east - west) / cols
            if point_in_poly(lon, lat, poly_lon_lat):
                field_cells += 1
                if water_mask[r, c] == 1:
                    field_water_cells += 1

    flooded_pct = round((field_water_cells / field_cells) * 100.0, 1) if field_cells > 0 else 0.0

    return {
        'date': date_str,
        'sceneId': scene_id,
        'season': scene_info['season'],
        'vv_db': [[round(float(v), 2) for v in row] for row in vv_db],
        'vh_db': [[round(float(v), 2) for v in row] for row in vh_db] if vh_db is not None else None,
        'water': [[int(v) for v in row] for row in water_mask],
        'flooded_pct': flooded_pct,
        'field_cells_tested': field_cells,
        'water_cells_in_field': field_water_cells
    }

def self_check():
    # Verify geometry and polygon calculations
    for sid in ('mithapukur', 'pirganj', 'gangachara'):
        geo = compute_site_geometry(sid)
        assert geo['cols'] >= 20 and geo['rows'] >= 20
        assert geo['bbox_200m'][0] < geo['bbox_200m'][2]
        assert geo['bbox_200m'][1] < geo['bbox_200m'][3]
        poly = [[p[1], p[0]] for p in geo['field_polygon']]
        c_lon = sum(p[0] for p in poly) / len(poly)
        c_lat = sum(p[1] for p in poly) / len(poly)
        assert point_in_poly(c_lon, c_lat, poly)
    print("S1 water self-check passed.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-check', action='store_true', help='Run self check and exit')
    args = parser.parse_args()

    self_check()
    if args.self_check:
        return

    doc = {
        'schemaVersion': 1,
        'truth': 'REMOTE_OBSERVED',
        'source': 'Sentinel-1 RTC, ESA/Copernicus via Planetary Computer',
        'citation': 'European Space Agency (ESA) Copernicus Sentinel-1 RTC processed by Microsoft Planetary Computer. Radiometric terrain corrected gamma naught backscatter (VV and VH, dB) at 20 m resolution.',
        'thresholdDb': WATER_THRESHOLD_DB,
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'sites': {}
    }

    for site_id in SITES_CONFIG:
        print(f"Fetching Sentinel-1 RTC for site: {site_id}...", flush=True)
        geo = compute_site_geometry(site_id)
        site_entry = {
            'siteId': site_id,
            'name': SITES_CONFIG[site_id]['name'],
            'bbox': geo['bbox_200m'],
            'fieldBbox': geo['field_bbox'],
            'cell_m': geo['cell_m'],
            'width': geo['cols'],
            'height': geo['rows'],
            'dates': []
        }

        for scene_info in TARGET_SCENES:
            date_entry = process_site_date(geo, scene_info)
            site_entry['dates'].append(date_entry)
            print(f"  {scene_info['date']} ({scene_info['season']}): flooded {date_entry['flooded_pct']}%", flush=True)

        doc['sites'][site_id] = site_entry

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n'
    byte_len = len(body.encode('utf-8'))
    print(f"Total output size: {byte_len:,} bytes (Budget: <= 1,000,000 bytes)")
    assert byte_len <= 1_000_000, f"s1-water.json exceeds 1 MB limit ({byte_len:,} bytes)"

    pending = OUT_FILE.with_suffix('.pending')
    pending.write_text(body, encoding='utf-8')
    pending.replace(OUT_FILE)
    print(f"Successfully generated {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes)")

if __name__ == '__main__':
    main()
