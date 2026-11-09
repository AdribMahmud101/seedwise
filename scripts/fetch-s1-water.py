#!/usr/bin/env python3
"""Fetch Sentinel-1 RTC backscatter and compute water/ponding mask for pilot fields.

Downloads Sentinel-1 RTC VV/VH bands from Microsoft Planetary Computer for pre-selected
scenes covering Mithapukur, Pirganj, and Gangachara fields (relative orbit 48, descending).
Uses the scene nearest to mid-month for each month in 2024.

Applies simplified Lee speckle filter + median filter to reduce noise.
Water mask uses VV < -18 dB (also reports Otsu threshold for comparison).
Flooded percentage is computed for pixels inside the field polygon.

Truth: REMOTE_OBSERVED
Source: "Sentinel-1 RTC, ESA/Copernicus via Planetary Computer"
Outputs: public/data/s1-water.json
Raw data: data-raw/s1-water/ (gitignored)

Run: python3 scripts/fetch-s1-water.py [--self-check]
"""

from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import time
import urllib.error
import urllib.request

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_FILE = ROOT / 'public' / 'data' / 's1-water.json'
DATA_API = 'https://planetarycomputer.microsoft.com/api/data/v1/item'
USER_AGENT = 'RoponRadar/1.0 (Sentinel-1 water fetcher)'

# Raw data directory (gitignored via .gitignore)
RAW_DIR = ROOT / 'data-raw' / 's1-water'

# Water threshold in dB
WATER_THRESHOLD_DB = -18.0

# Speckle filter window size (in pixels)
LEE_WINDOW = 3
MEDIAN_WINDOW = 3

# Load site bounds from map-layers.json
import json as json_module

MAP_LAYERS_PATH = ROOT / 'public' / 'data' / 'map-layers.json'

# Load site configurations from map-layers.json
try:
    with open(MAP_LAYERS_PATH, 'r') as f:
        map_layers = json_module.load(f)
    SITES_CONFIG = {}
    for site in map_layers.get('sites', []):
        site_id = site['id']
        SITES_CONFIG[site_id] = {
            'name': site_id.title(),
            'lat': site['lat'],
            'lon': site['lon'],
            'bounds': site['bounds'],  # [west, south, east, north]
        }
except Exception as e:
    print(f"Warning: Could not load map-layers.json: {e}")
    print("Using fallback site configurations")
    # Fallback to hardcoded values from map-layers.json
    SITES_CONFIG = {
        'mithapukur': {
            'name': 'Mithapukur',
            'lat': 25.54,
            'lon': 89.27,
            'bounds': [89.24009855467958, 25.5130203890316, 89.29990144532042, 25.5669796109684],
        },
        'pirganj': {
            'name': 'Pirganj',
            'lat': 25.50,
            'lon': 89.22,
            'bounds': [89.19010851889988, 25.4730203890316, 89.24989148110012, 25.5269796109684],
        },
        'gangachara': {
            'name': 'Gangachara',
            'lat': 25.85,
            'lon': 89.20,
            'bounds': [89.17002060981353, 25.8230203890316, 89.22997939018647, 25.8769796109684],
        },
    }

# Pre-selected scenes: relative orbit 48, descending, nearest to mid-month for 2024
# These scenes were verified to cover all three sites
TARGET_SCENES = {
    1: 'S1A_IW_GRDH_1SDV_20240114T000349_20240114T000414_052095_064BDC_rtc',
    2: 'S1A_IW_GRDH_1SDV_20240207T000349_20240207T000414_052445_0657A8_rtc',
    3: 'S1A_IW_GRDH_1SDV_20240314T000349_20240314T000414_052970_066981_rtc',
    4: 'S1A_IW_GRDH_1SDV_20240419T000350_20240419T000415_053495_067DD4_rtc',
    5: 'S1A_IW_GRDH_1SDV_20240525T000350_20240525T000415_054020_069143_rtc',
    6: 'S1A_IW_GRDH_1SDV_20240618T000349_20240618T000414_054370_069D59_rtc',
    7: 'S1A_IW_GRDH_1SDV_20240716T120532_20240716T120557_054786_06ABD2_rtc',
    8: 'S1A_IW_GRDH_1SDV_20240814T121338_20240814T121403_055209_06BAB8_rtc',
    9: 'S1A_IW_GRDH_1SDV_20240916T235541_20240916T235606_055697_06CD44_rtc',
    10: 'S1A_IW_GRDH_1SDV_20241016T000349_20241016T000414_056120_06DDFB_rtc',
    11: 'S1A_IW_GRDH_1SDV_20241113T120533_20241113T120558_056536_06EE88_rtc',
    12: 'S1A_IW_GRDH_1SDV_20241215T000346_20241215T000411_056995_0700B5_rtc',
}


def compute_site_geometry(site_id: str):
    """Compute bounding box (from map-layers.json) with 200m buffer, and grid dimensions.
    
    Uses the site bounds from map-layers.json as the field bounding box.
    """
    cfg = SITES_CONFIG[site_id]
    # The bounds from map-layers.json are already the field bounds
    # Format: [west, south, east, north]
    west, south, east, north = cfg['bounds']
    
    # Add 200m buffer around the field bounding box
    base_lat = (south + north) / 2
    base_lon = (west + east) / 2
    m_per_deg_lat = 111320.0
    m_per_deg_lon = 111320.0 * math.cos(math.radians(base_lat))

    lat_pad = 200.0 / m_per_deg_lat
    lon_pad = 200.0 / m_per_deg_lon

    bbox_200m = [
        round(west - lon_pad, 6),
        round(south - lat_pad, 6),
        round(east + lon_pad, 6),
        round(north + lat_pad, 6),
    ]

    # Calculate grid dimensions for the buffered bbox
    width_m = (bbox_200m[2] - bbox_200m[0]) * m_per_deg_lon
    height_m = (bbox_200m[3] - bbox_200m[1]) * m_per_deg_lat

    # Sentinel-1 RTC is ~20m resolution
    cell_m = 20.0
    cols = int(round(width_m / cell_m))
    rows = int(round(height_m / cell_m))

    # For the field polygon, use the bounds as a rectangle
    # This is the actual field area from map-layers.json
    field_polygon = [
        [south, west],
        [south, east],
        [north, east],
        [north, west],
    ]

    return {
        'field_polygon': field_polygon,
        'field_bbox': [round(west, 6), round(south, 6), round(east, 6), round(north, 6)],
        'bbox_200m': bbox_200m,
        'cols': cols,
        'rows': rows,
        'cell_m': cell_m
    }


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


def read_tiff_data(data: bytes):
    """Parse TIFF bands (float32) from PC Titiler response.
    
    Handles both contiguous and stripped TIFFs.
    """
    order = '<' if data[:2] == b'II' else '>'
    if data[:2] not in (b'II', b'MM'):
        raise ValueError('Expected TIFF response')
    offset = struct.unpack_from(order + 'I', data, 4)[0]
    num_tags = struct.unpack_from(order + 'H', data, offset)[0]
    tags = {}
    for i in range(num_tags):
        tag, kind, count, value = struct.unpack_from(order + 'HHII', data, offset + 2 + i * 12)
        tags[tag] = (kind, count, value)

    tw = tags[256][2]  # ImageWidth
    th = tags[257][2]  # ImageLength
    samples = tags[277][2]  # SamplesPerPixel
    
    # Handle StripOffsets and StripByteCounts
    strip_offsets_tag = tags[273]  # StripOffsets
    strip_byte_counts_tag = tags[279]  # StripByteCounts
    
    if strip_offsets_tag[1] == 1 and strip_byte_counts_tag[1] == 1:
        # Contiguous storage
        data_offset = strip_offsets_tag[2]
        byte_count = strip_byte_counts_tag[2]
        arr = np.frombuffer(data[data_offset:data_offset + byte_count], dtype=np.float32)
    else:
        # Stripped storage - need to read multiple strips
        # Get the offset to the strip offsets array
        strip_offsets_offset = strip_offsets_tag[2]
        strip_byte_counts_offset = strip_byte_counts_tag[2]
        
        # Read strip offsets (array of uint32)
        strip_offsets = []
        for i in range(strip_offsets_tag[1]):
            off = struct.unpack_from(order + 'I', data, strip_offsets_offset + i * 4)[0]
            strip_offsets.append(off)
        
        # Read strip byte counts (array of uint32)
        strip_byte_counts = []
        for i in range(strip_byte_counts_tag[1]):
            bc = struct.unpack_from(order + 'I', data, strip_byte_counts_offset + i * 4)[0]
            strip_byte_counts.append(bc)
        
        # Concatenate all strips
        all_strip_data = b''
        for off, bc in zip(strip_offsets, strip_byte_counts):
            all_strip_data += data[off:off + bc]
        
        arr = np.frombuffer(all_strip_data, dtype=np.float32)
    
    return arr.reshape((th, tw, samples))


def fetch_url(url: str, timeout: int = 60) -> bytes:
    """Fetch URL with retries and return content."""
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as err:
            if attempt == 2:
                raise RuntimeError(f"Failed to fetch {url}: {err}") from err
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Failed to fetch {url}")


def sha256_hex(data: bytes) -> str:
    """Compute SHA256 hex digest of data."""
    return hashlib.sha256(data).hexdigest()


def save_raw_file(data: bytes, path: Path, url: str) -> dict:
    """Save raw data and return provenance info."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    sha = sha256_hex(data)
    return {
        'url': url,
        'sha256': sha,
        'retrieved': datetime.now(timezone.utc).isoformat(),
        'size': len(data)
    }


def apply_median_filter(arr: np.ndarray, window_size: int = 3) -> np.ndarray:
    """Apply median filter to SAR data using pure Python."""
    if arr.ndim != 2 or arr.shape[0] < window_size or arr.shape[1] < window_size:
        return arr.copy()
    
    half = window_size // 2
    result = np.zeros_like(arr, dtype=np.float32)
    
    for i in range(arr.shape[0]):
        for j in range(arr.shape[1]):
            i_min = max(0, i - half)
            i_max = min(arr.shape[0], i + half + 1)
            j_min = max(0, j - half)
            j_max = min(arr.shape[1], j + half + 1)
            
            neighborhood = arr[i_min:i_max, j_min:j_max]
            result[i, j] = np.median(neighborhood)
    
    return result


def apply_lee_filter_simple(arr: np.ndarray, window_size: int = 3) -> np.ndarray:
    """Simplified Lee speckle filter - uses local mean for uniform areas."""
    if arr.ndim != 2 or arr.shape[0] < window_size or arr.shape[1] < window_size:
        return arr.copy()
    
    half = window_size // 2
    result = np.zeros_like(arr, dtype=np.float32)
    
    for i in range(arr.shape[0]):
        for j in range(arr.shape[1]):
            i_min = max(0, i - half)
            i_max = min(arr.shape[0], i + half + 1)
            j_min = max(0, j - half)
            j_max = min(arr.shape[1], j + half + 1)
            
            neighborhood = arr[i_min:i_max, j_min:j_max]
            local_mean = np.nanmean(neighborhood)
            local_std = np.nanstd(neighborhood)
            
            # For uniform areas (low std), use local mean to reduce speckle
            # For non-uniform areas, keep original value
            # Threshold of 1.0 dB seems reasonable for Sentinel-1
            if not np.isnan(local_std) and local_std < 1.5:  # Increased threshold
                result[i, j] = local_mean
            else:
                result[i, j] = arr[i, j]
    
    return result


def fetch_s1_band(site_id: str, scene_id: str, bbox: list[float], cols: int, rows: int, asset: str = 'vv') -> tuple[np.ndarray, dict]:
    """Fetch a single band (VV or VH) from Planetary Computer data API.
    
    Returns: (array, provenance_dict)
    """
    west, south, east, north = bbox
    url = f"{DATA_API}/bbox/{west},{south},{east},{north}/{cols}x{rows}.tif?collection=sentinel-1-rtc&item={scene_id}&assets={asset}"
    
    # Raw file path
    raw_path = RAW_DIR / site_id / scene_id / f'{asset}.tif'
    provenance_path = raw_path.with_suffix('.receipt.json')
    
    # Check if we already have this file
    if raw_path.exists() and provenance_path.exists():
        with open(provenance_path, 'r') as f:
            prov = json.load(f)
        data = raw_path.read_bytes()
        # Verify sha256
        if sha256_hex(data) != prov['sha256']:
            print(f"  Warning: SHA256 mismatch for {asset} {scene_id}, re-downloading")
            data = fetch_url(url, timeout=60)
            prov = save_raw_file(data, raw_path, url)
        return read_tiff_data(data), prov
    
    # Download fresh
    data = fetch_url(url, timeout=60)
    prov = save_raw_file(data, raw_path, url)
    return read_tiff_data(data), prov


def compute_otsu_threshold(values: np.ndarray) -> float:
    """Compute Otsu threshold for a 1D array of values."""
    if len(values) == 0:
        return WATER_THRESHOLD_DB
    
    # Filter out NaN and Inf
    values = values[~np.isnan(values) & ~np.isinf(values)]
    if len(values) == 0:
        return WATER_THRESHOLD_DB
    
    # Normalize to range for histogram
    min_val = np.min(values) - 5
    max_val = np.max(values) + 5
    hist, bin_edges = np.histogram(values, bins=256, range=(min_val, max_val))
    
    total = len(values)
    sum_total = np.sum(values)
    
    current_max = 0
    threshold = WATER_THRESHOLD_DB
    sum_background = 0
    weight_background = 0
    
    for i in range(1, len(hist)):
        weight_background += hist[i]
        if weight_background == 0:
            continue
        weight_foreground = total - weight_background
        if weight_foreground == 0:
            break
        sum_background += hist[i] * (bin_edges[i] + bin_edges[i+1]) / 2
        mean_background = sum_background / weight_background
        mean_foreground = (sum_total - sum_background) / weight_foreground
        between_var = weight_background * weight_foreground * (mean_background - mean_foreground) ** 2
        
        if between_var > current_max:
            current_max = between_var
            threshold = (bin_edges[i] + bin_edges[i+1]) / 2
    
    return threshold


def process_site_date(site_id: str, geo: dict, month: int, scene_id: str) -> dict:
    """Process a single site for a single date/scene."""
    date_str = f"2024-{month:02d}-15"  # Approximate mid-month date
    bbox = geo['bbox_200m']
    cols = geo['cols']
    rows = geo['rows']
    
    # Fetch VV band
    vv_arr, vv_prov = fetch_s1_band(site_id, scene_id, bbox, cols, rows, 'vv')
    
    # Extract single band if needed
    if vv_arr.ndim == 3 and vv_arr.shape[2] == 1:
        vv_lin = vv_arr[:, :, 0]
    elif vv_arr.ndim == 3 and vv_arr.shape[2] > 1:
        vv_lin = vv_arr[:, :, 0]  # Take first band (VV)
    else:
        vv_lin = vv_arr
    
    # Convert linear gamma0 to dB: 10 * log10(val)
    # Clip to avoid log10 of negative or zero values
    vv_db = 10.0 * np.log10(np.clip(vv_lin, 1e-10, None))
    
    # Also try to fetch VH
    vh_db = None
    vh_prov = None
    try:
        vh_arr, vh_prov = fetch_s1_band(site_id, scene_id, bbox, cols, rows, 'vh')
        if vh_arr.ndim == 3 and vh_arr.shape[2] == 1:
            vh_lin = vh_arr[:, :, 0]
        elif vh_arr.ndim == 3 and vh_arr.shape[2] > 1:
            vh_lin = vh_arr[:, :, 1]  # Take second band (VH)
        else:
            vh_lin = vh_arr
        vh_db = 10.0 * np.log10(np.clip(vh_lin, 1e-10, None))
    except Exception as e:
        print(f"  Warning: Could not fetch VH for {site_id} {scene_id}: {e}")
    
    # Apply speckle filters to VV
    # First Lee filter
    vv_filtered = apply_lee_filter_simple(vv_db, LEE_WINDOW)
    
    # Then median filter
    vv_filtered = apply_median_filter(vv_filtered, MEDIAN_WINDOW)
    
    # Water mask using VV < -18 dB
    water_mask = (vv_filtered < WATER_THRESHOLD_DB).astype(int)
    
    # Calculate flooded percentage inside actual field polygon
    # The field polygon is the rectangle defined by field_bbox
    field_west, field_south, field_east, field_north = geo['field_bbox']
    
    # The grid covers bbox_200m, so we need to convert pixel coords to lat/lon
    grid_west, grid_south, grid_east, grid_north = bbox

    field_cells = 0
    field_water_cells = 0

    for r in range(rows):
        # Convert row to latitude (south to north)
        lat = grid_south + (r + 0.5) * (grid_north - grid_south) / rows
        for c in range(cols):
            # Convert column to longitude (west to east)
            lon = grid_west + (c + 0.5) * (grid_east - grid_west) / cols
            # Check if point is in the field rectangle
            if field_west <= lon <= field_east and field_south <= lat <= field_north:
                field_cells += 1
                if water_mask[r, c] == 1:
                    field_water_cells += 1

    flooded_pct = round((field_water_cells / field_cells) * 100.0, 1) if field_cells > 0 else 0.0

    # Also compute Otsu threshold for comparison
    otsu_threshold = compute_otsu_threshold(vv_filtered)
    otsu_mask = (vv_filtered < otsu_threshold).astype(int)
    otsu_field_water = 0
    for r in range(rows):
        lat = grid_south + (r + 0.5) * (grid_north - grid_south) / rows
        for c in range(cols):
            lon = grid_west + (c + 0.5) * (grid_east - grid_west) / cols
            if field_west <= lon <= field_east and field_south <= lat <= field_north:
                if otsu_mask[r, c] == 1:
                    otsu_field_water += 1
    otsu_flooded_pct = round((otsu_field_water / field_cells) * 100.0, 1) if field_cells > 0 else 0.0

    # Downsample the arrays to keep output size small
    # Use every 10th pixel to reduce size (320x320 -> 32x32 = 1024 pixels per month)
    # This keeps the total output under 1 MB
    downsample = 10
    
    # Create downsampled arrays by taking every downsample-th pixel
    vv_db_downsampled = []
    water_downsampled = []
    for i in range(0, rows, downsample):
        row_vv = []
        row_water = []
        for j in range(0, cols, downsample):
            val = vv_filtered[i, j]
            row_vv.append(round(float(val), 2) if np.isfinite(val) else None)
            row_water.append(int(water_mask[i, j]))
        vv_db_downsampled.append(row_vv)
        water_downsampled.append(row_water)
    
    vv_db_down = vv_db_downsampled
    water_down = water_downsampled
    
    return {
        'date': date_str,
        'sceneId': scene_id,
        'month': month,
        'vv_db': vv_db_down,
        'water': water_down,
        'flooded_pct': flooded_pct,
        'water_cells_in_field': field_water_cells,
        'field_cells_tested': field_cells,
        'threshold_db': WATER_THRESHOLD_DB,
        'otsu_threshold_db': round(otsu_threshold, 2),
        'otsu_flooded_pct': otsu_flooded_pct,
        'provenance': {
            'vv': vv_prov,
            'vh': vh_prov
        }
    }


def self_check():
    """Verify geometry and polygon calculations."""
    for sid in ('mithapukur', 'pirganj', 'gangachara'):
        geo = compute_site_geometry(sid)
        assert geo['cols'] >= 20 and geo['rows'] >= 20, f"{sid}: too small grid"
        assert geo['bbox_200m'][0] < geo['bbox_200m'][2], f"{sid}: invalid bbox lon"
        assert geo['bbox_200m'][1] < geo['bbox_200m'][3], f"{sid}: invalid bbox lat"
        poly = [[p[1], p[0]] for p in geo['field_polygon']]
        c_lon = sum(p[0] for p in poly) / len(poly)
        c_lat = sum(p[1] for p in poly) / len(poly)
        assert point_in_poly(c_lon, c_lat, poly), f"{sid}: centroid not in polygon"
    print("S1 water self-check passed.")


def sanity_check(doc: dict):
    """Check that the data meets sanity requirements.
    
    Requirements:
    - Jan-Apr flooded_pct < 15% for every site
    - Values not all 0/100
    - Peak (Jul-Sep) >= dry-season
    """
    violations = []
    
    for site_id, site_data in doc['sites'].items():
        dry_season = []  # Jan-Apr
        peak_season = []  # Jul-Sep
        all_values = []
        
        for date_entry in site_data['dates']:
            month = date_entry['month']
            flooded = date_entry['flooded_pct']
            all_values.append(flooded)
            
            # Check if all values are 0 or 100
            if flooded == 0 or flooded == 100:
                print(f"  Warning: {site_id} month {month}: flooded_pct={flooded}%")
            
            # Dry season (Jan-Apr): must be < 15%
            if month in [1, 2, 3, 4]:
                dry_season.append(flooded)
                if flooded >= 15:
                    violations.append(f"{site_id} month {month}: flooded_pct={flooded}% >= 15% in dry season")
            
            # Peak season (Jul-Sep)
            if month in [7, 8, 9]:
                peak_season.append(flooded)
        
        # Check peak >= dry
        if dry_season and peak_season:
            max_dry = max(dry_season)
            max_peak = max(peak_season)
            if max_peak < max_dry:
                violations.append(f"{site_id}: peak season max ({max_peak}%) < dry season max ({max_dry}%)")
    
    if violations:
        raise ValueError("Sanity check failed:\n" + "\n".join(violations))
    
    print("S1 water sanity checks passed.")


def print_summary(doc: dict):
    """Print a summary table of the results."""
    print("\n" + "=" * 80)
    print("Sentinel-1 Water Detection Summary")
    print("=" * 80)
    print(f"{'Site':<15} {'Month':<8} {'Scene':<45} {'Flooded %':<12} {'Otsu %':<10}")
    print("-" * 80)
    
    for site_id, site_data in doc['sites'].items():
        for date_entry in site_data['dates']:
            print(f"{site_id:<15} {date_entry['month']:<8} {date_entry['sceneId']:<45} {date_entry['flooded_pct']:<12.1f} {date_entry.get('otsu_flooded_pct', 0):<10.1f}")
    
    print("=" * 80)


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
        'citation': 'European Space Agency (ESA) Copernicus Sentinel-1 RTC processed by Microsoft Planetary Computer. Radiometric terrain corrected gamma naught backscatter (VV and VH, dB) at 20 m resolution. Lee/median speckle filtering applied. Relative orbit: 48, direction: descending.',
        'thresholdDb': WATER_THRESHOLD_DB,
        'leeFilterWindow': LEE_WINDOW,
        'medianFilterWindow': MEDIAN_WINDOW,
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'sites': {}
    }

    for site_id in SITES_CONFIG:
        print(f"Processing site: {site_id}...", flush=True)
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

        for month in TARGET_SCENES:
            scene_id = TARGET_SCENES[month]
            date_entry = process_site_date(site_id, geo, month, scene_id)
            site_entry['dates'].append(date_entry)
            print(f"  Month {month:02d} ({scene_id[:30]}...): flooded {date_entry['flooded_pct']}% (Otsu: {date_entry.get('otsu_flooded_pct', 0):.1f}%)", flush=True)

        doc['sites'][site_id] = site_entry

    # Sanity check
    try:
        sanity_check(doc)
    except ValueError as e:
        print(f"\nSanity check FAILED: {e}")
        print("\nThis means the water detection method needs adjustment.")
        print("Possible causes:")
        print("  - Threshold (-18 dB) may be wrong for this region")
        print("  - The polygon may not be aligned with the SAR data")
        print("  - The scenes may not cover the fields correctly")
        sys.exit(1)

    # Print summary
    print_summary(doc)

    # Save output
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n'
    byte_len = len(body.encode('utf-8'))
    print(f"\nTotal output size: {byte_len:,} bytes (Budget: <= 1,000,000 bytes)")
    assert byte_len <= 1_000_000, f"s1-water.json exceeds 1 MB limit ({byte_len:,} bytes)"

    pending = OUT_FILE.with_suffix('.pending')
    pending.write_text(body, encoding='utf-8')
    pending.replace(OUT_FILE)
    print(f"Successfully generated {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes)")


if __name__ == '__main__':
    main()
