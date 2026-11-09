"""Build 3D landscape assets for Mithapukur, Pirganj and Gangachara:
- NASADEM 30 m DEM over the union bbox + 3 km buffer from Microsoft Planetary Computer
- Terrarium-encoded elevation tiles in public/landscape/dem/{z}/{x}/{y}.png (z8-12)
- Pre-rendered hypsometric + hillshade color tiles in public/landscape/color/{z}/{x}/{y}.webp (z8-12)
- River vectors in public/data/landscape-rivers.geojson from OpenStreetMap Overpass API
- Total landscape assets budget <= 4 MB.
"""

from datetime import datetime, timezone
import io
import json
import math
import os
from pathlib import Path
import struct
import urllib.parse
import urllib.request
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
LANDSCAPE = PUBLIC / 'landscape'
DEM_DIR = LANDSCAPE / 'dem'
COLOR_DIR = LANDSCAPE / 'color'
DATA_DIR = PUBLIC / 'data'
RAW_DIR = ROOT / 'data-raw'

COLLECTION = 'nasadem'
ITEM_ID = 'NASADEM_HGT_n25e089'
BASE_URL = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/'

TARGET_UPAZILAS = ['mitha pukur', 'pirganj', 'gangachara']

def get_union_bbox_with_buffer():
    upazilas_file = DATA_DIR / 'rangpur_upazilas.geojson'
    with open(upazilas_file, 'r', encoding='utf-8') as f:
        gj = json.load(f)
    
    feats = [
        f for f in gj['features']
        if f.get('properties', {}).get('name', '').lower() in TARGET_UPAZILAS
    ]
    min_x, min_y = float('inf'), float('inf')
    max_x, max_y = float('-inf'), float('-inf')

    def scan(coords):
        nonlocal min_x, min_y, max_x, max_y
        if isinstance(coords[0], (int, float)):
            x, y = coords[0], coords[1]
            if x < min_x: min_x = x
            if x > max_x: max_x = x
            if y < min_y: min_y = y
            if y > max_y: max_y = y
        else:
            for c in coords:
                scan(c)

    for f in feats:
        scan(f['geometry']['coordinates'])

    mid_y = (min_y + max_y) / 2.0
    buf_lat = 3.0 / 111.195
    buf_lon = 3.0 / (111.195 * math.cos(math.radians(mid_y)))
    return [min_x - buf_lon, min_y - buf_lat, max_x + buf_lon, max_y + buf_lat]

def parse_geotiff(data: bytes):
    byte_order = '<' if data[:2] == b'II' else '>'
    ifd_offset = struct.unpack_from(byte_order + 'I', data, 4)[0]
    num_entries = struct.unpack_from(byte_order + 'H', data, ifd_offset)[0]
    fmt_map = {1: 'B', 2: 's', 3: 'H', 4: 'I', 8: 'h', 9: 'i', 12: 'd'}

    def read_tag(typ, count, val_or_off):
        unit_size = struct.calcsize(fmt_map[typ])
        total_size = count * unit_size
        if total_size <= 4:
            raw = struct.pack(byte_order + 'I', val_or_off)[:total_size]
        else:
            raw = data[val_or_off : val_or_off + total_size]
        return list(struct.unpack(byte_order + f'{count}{fmt_map[typ]}', raw))

    tags = {}
    offset = ifd_offset + 2
    for _ in range(num_entries):
        tag, typ, count, val_or_off = struct.unpack_from(byte_order + 'HHII', data, offset)
        tags[tag] = read_tag(typ, count, val_or_off)
        offset += 12

    width = tags[0x100][0]
    height = tags[0x101][0]
    strip_offsets = tags[0x111]
    strip_byte_counts = tags[0x117]
    pixel_data = b''.join(data[off : off + cnt] for off, cnt in zip(strip_offsets, strip_byte_counts))
    values = struct.unpack(byte_order + f'{width * height}h', pixel_data)
    grid = np.array(values, dtype=np.float32).reshape((height, width))
    return grid

def fetch_master_dem(bbox):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = RAW_DIR / 'nasadem-landscape-master.tif'
    if cache_path.exists():
        data = cache_path.read_bytes()
    else:
        # Request 1536 x 2048 master grid
        w, h = 1536, 2048
        bbox_str = f'{bbox[0]:.6f},{bbox[1]:.6f},{bbox[2]:.6f},{bbox[3]:.6f}'
        query = {
            'collection': COLLECTION,
            'item': ITEM_ID,
            'assets': 'elevation',
            'return_mask': 'false',
        }
        url = f'{BASE_URL}{bbox_str}/{w}x{h}.tif?{urllib.parse.urlencode(query)}'
        req = urllib.request.Request(url, headers={'User-Agent': 'RoponRadar/1.0'})
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        cache_path.write_bytes(data)
    return parse_geotiff(data)

def tile_bounds_latlon(x, y, z):
    n = 2.0 ** z
    lon_min = x / n * 360.0 - 180.0
    lon_max = (x + 1) / n * 360.0 - 180.0
    lat_max = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n))))
    lat_min = math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * (y + 1) / n))))
    return lon_min, lat_min, lon_max, lat_max

def get_tile_range(bbox, z):
    n = 2.0 ** z
    x0 = int(math.floor((bbox[0] + 180.0) / 360.0 * n))
    x1 = int(math.floor((bbox[2] + 180.0) / 360.0 * n))
    lat_rad_min = math.radians(bbox[3])
    lat_rad_max = math.radians(bbox[1])
    y0 = int(math.floor((1.0 - math.asinh(math.tan(lat_rad_min)) / math.pi) / 2.0 * n))
    y1 = int(math.floor((1.0 - math.asinh(math.tan(lat_rad_max)) / math.pi) / 2.0 * n))
    return min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)

FADE_DEG = 0.03  # ~3 km, the same as the bbox buffer

def sample_dem_tile(master_dem, master_bbox, tile_bbox, size=256):
    # Tile coordinate mapping into master_dem
    # master_dem is (H, W), master_bbox is [min_lon, min_lat, max_lon, max_lat]
    # In master_dem, row 0 is max_lat, row H-1 is min_lat
    # col 0 is min_lon, col W-1 is max_lon
    H, W = master_dem.shape
    tile_lon_min, tile_lat_min, tile_lon_max, tile_lat_max = tile_bbox

    # Linear grid of coordinates for tile pixels (size x size)
    # y runs from 0 (tile_lat_max) to size-1 (tile_lat_min)
    tile_lons = np.linspace(tile_lon_min, tile_lon_max, size, endpoint=False) + (tile_lon_max - tile_lon_min) / (2.0 * size)
    tile_lats = np.linspace(tile_lat_max, tile_lat_min, size, endpoint=False) - (tile_lat_max - tile_lat_min) / (2.0 * size)

    # Convert to master row, col floating coordinates
    cols = (tile_lons - master_bbox[0]) / (master_bbox[2] - master_bbox[0]) * (W - 1)
    rows = (master_bbox[3] - tile_lats) / (master_bbox[3] - master_bbox[1]) * (H - 1)

    # Fade toward the data edge (smoothstep over FADE_DEG) instead of smearing edge pixels outward.
    dc_deg = np.minimum(cols, (W - 1) - cols) / (W - 1) * (master_bbox[2] - master_bbox[0])
    dr_deg = np.minimum(rows, (H - 1) - rows) / (H - 1) * (master_bbox[3] - master_bbox[1])
    f = np.clip(np.minimum(dr_deg[:, np.newaxis], dc_deg[np.newaxis, :]) / FADE_DEG, 0.0, 1.0)
    fade = f * f * (3.0 - 2.0 * f)

    cols = np.clip(cols, 0, W - 1)
    rows = np.clip(rows, 0, H - 1)

    r0 = np.floor(rows).astype(np.int32)
    r1 = np.clip(r0 + 1, 0, H - 1)
    c0 = np.floor(cols).astype(np.int32)
    c1 = np.clip(c0 + 1, 0, W - 1)

    dr = (rows - r0)[:, np.newaxis]
    dc = (cols - c0)[np.newaxis, :]

    # Bilinear interpolation
    # grid[rows, cols]
    top = master_dem[r0[:, np.newaxis], c0[np.newaxis, :]] * (1.0 - dc) + master_dem[r0[:, np.newaxis], c1[np.newaxis, :]] * dc
    bot = master_dem[r1[:, np.newaxis], c0[np.newaxis, :]] * (1.0 - dc) + master_dem[r1[:, np.newaxis], c1[np.newaxis, :]] * dc
    tile_elev = top * (1.0 - dr) + bot * dr
    return tile_elev, fade

def gaussian_blur_2d(arr, sigma=1.2):
    radius = int(math.ceil(2 * sigma))
    x = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (x / sigma) ** 2)
    kernel /= kernel.sum()
    pad = np.pad(arr, radius, mode='reflect')
    tmp = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode='valid'), axis=1, arr=pad)
    res = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode='valid'), axis=0, arr=tmp)
    return res

def encode_terrarium(elev_grid):
    # Terrarium: (h + 32768) -> R, G, B
    # h = (r * 256 + g + b / 256) - 32768
    # Raw NASADEM is 1-metre vertical resolution. Storing rounded 1 m values (B=0)
    # perfectly preserves NASADEM accuracy while keeping PNG tiles well within the 4 MB budget.
    val = np.clip(np.round(elev_grid) + 32768.0, 0.0, 65535.0)
    r = np.floor(val / 256.0).astype(np.uint8)
    g = np.floor(val % 256.0).astype(np.uint8)
    b = np.zeros_like(g)
    rgb = np.stack([r, g, b], axis=-1)
    return Image.fromarray(rgb, mode='RGB')

def render_color_tile(elev_grid, cell_size_m):
    # Light Gaussian blur to eliminate noise/speckle
    smoothed = gaussian_blur_2d(elev_grid, sigma=1.2)

    # Hillshade with light from NW (azimuth 315 deg, altitude 45 deg)
    azimuth = 315.0 * math.pi / 180.0
    altitude = 45.0 * math.pi / 180.0
    dy, dx = np.gradient(smoothed, cell_size_m)
    slope = np.arctan(np.sqrt(dx * dx + dy * dy))
    aspect = np.arctan2(-dx, dy)
    shaded = np.sin(altitude) * np.cos(slope) + np.cos(altitude) * np.sin(slope) * np.cos(azimuth - aspect)
    shaded = np.clip(shaded, 0.0, 1.0)

    # 2nd to 98th percentile stretch of regional elevation
    # In Rangpur pilot upazilas: 2nd percentile ~20m, 98th percentile ~41m
    p2 = 20.0
    p98 = 41.0
    t = np.clip((smoothed - p2) / (p98 - p2), 0.0, 1.0)

    # Hypsometric ramp:
    # Lowlands: cool deep green / teal-green -> mid olive -> warm sand high ground
    r = np.interp(t, [0.0, 0.30, 0.65, 1.0], [16, 52, 128, 225])
    g = np.interp(t, [0.0, 0.30, 0.65, 1.0], [76, 112, 140, 198])
    b = np.interp(t, [0.0, 0.30, 0.65, 1.0], [60, 72, 65, 155])
    rgb = np.stack([r, g, b], axis=-1)

    # Soft hillshade blend
    hill_factor = (shaded * 0.65 + 0.68)[..., np.newaxis]
    final_rgb = np.clip(rgb * hill_factor, 0, 255).astype(np.uint8)
    return Image.fromarray(final_rgb, mode='RGB')

def build_tiles(master_dem, bbox):
    total_tiles = 0
    base = float(np.percentile(master_dem, 5))  # flat low plain the faded edge settles to
    for z in range(8, 13):
        x0, x1, y0, y1 = get_tile_range(bbox, z)
        # Approximate cell size in metres at this latitude (~25.6 deg)
        # Earth circumference * cos(lat) / (256 * 2^z)
        cell_size_m = 40075016.686 * math.cos(math.radians(25.6)) / (256.0 * (2.0 ** z))

        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                tb = tile_bounds_latlon(x, y, z)
                raw_dem, fade = sample_dem_tile(master_dem, bbox, tb, size=256)
                if not fade.any():
                    continue  # fully outside the data: skip, MapLibre shows the haze background
                tile_dem = base + (raw_dem - base) * fade

                # 1. Terrarium DEM tile
                dem_img = encode_terrarium(tile_dem)
                dem_path = DEM_DIR / str(z) / str(x) / f'{y}.png'
                dem_path.parent.mkdir(parents=True, exist_ok=True)
                dem_img.save(dem_path, format='PNG', optimize=True)

                # 2. Hypsometric color tile (WebP)
                color_img = render_color_tile(tile_dem, cell_size_m)
                color_img.putalpha(Image.fromarray((fade * 255).astype(np.uint8)))
                color_path = COLOR_DIR / str(z) / str(x) / f'{y}.webp'
                color_path.parent.mkdir(parents=True, exist_ok=True)
                color_img.save(color_path, format='WEBP', quality=82)

                total_tiles += 1
    print(f'Generated {total_tiles} DEM & Color tiles across z8-z12.')

def simplify_line(points, tol):
    if len(points) <= 2:
        return points
    def dist_sq(p, a, b):
        dx = b[0] - a[0]
        dy = b[1] - a[1]
        if dx == 0 and dy == 0:
            return (p[0] - a[0])**2 + (p[1] - a[1])**2
        t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx*dx + dy*dy)
        t = max(0, min(1, t))
        proj_x = a[0] + t * dx
        proj_y = a[1] + t * dy
        return (p[0] - proj_x)**2 + (p[1] - proj_y)**2

    def dp(pts):
        if len(pts) <= 2:
            return pts
        max_d = 0
        idx = 0
        for i in range(1, len(pts) - 1):
            d = dist_sq(pts[i], pts[0], pts[-1])
            if d > max_d:
                max_d = d
                idx = i
        if max_d > tol * tol:
            rec1 = dp(pts[:idx+1])
            rec2 = dp(pts[idx:])
            return rec1[:-1] + rec2
        else:
            return [pts[0], pts[-1]]

    return dp(points)

def fetch_and_build_rivers(bbox):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = RAW_DIR / 'landscape-rivers-overpass.json'
    
    if not raw_path.exists():
        q = f'''[out:json][timeout:60];
(
  way["waterway"~"river|canal"]({bbox[1]:.4f},{bbox[0]:.4f},{bbox[3]:.4f},{bbox[2]:.4f});
  relation["waterway"~"river"]({bbox[1]:.4f},{bbox[0]:.4f},{bbox[3]:.4f},{bbox[2]:.4f});
);
out geom;'''
        url = 'https://overpass-api.de/api/interpreter'
        req = urllib.request.Request(
            url,
            data=urllib.parse.urlencode({'data': q}).encode('utf-8'),
            headers={'User-Agent': 'RoponRadar/1.0 (contact: info@roponradar.org)'}
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            raw_path.write_bytes(data)
        except Exception as e:
            if os.path.exists('/tmp/overpass-rivers.json'):
                raw_path.write_bytes(Path('/tmp/overpass-rivers.json').read_bytes())
            else:
                raise RuntimeError(f'Failed to fetch OSM rivers: {e}')
    
    d = json.loads(raw_path.read_text(encoding='utf-8'))
    tol = 0.00025  # ~25m simplification tolerance
    features = []
    for el in d.get('elements', []):
        tags = el.get('tags', {})
        name = tags.get('name', tags.get('name:en', tags.get('name:bn', ''))).strip()
        waterway = tags.get('waterway', '')
        # Review fix: Keep only OSM waterway=river with names (Teesta, Ghaghat, Karatoya, Jamuneswari, etc.)
        if waterway != 'river' or not name:
            continue
        if el['type'] == 'way':
            pts = [(p['lon'], p['lat']) for p in el.get('geometry', []) if 'lon' in p]
            simplified = simplify_line(pts, tol)
            if len(simplified) >= 2:
                features.append({
                    'type': 'Feature',
                    'properties': {
                        'name': name,
                        'waterway': 'river',
                    },
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': [[round(x, 5), round(y, 5)] for x, y in simplified]
                    }
                })

    fc = {
        'type': 'FeatureCollection',
        'generator': 'scripts/build-landscape.py',
        'attribution': '© OpenStreetMap contributors (ODbL)',
        'features': features
    }
    out_file = DATA_DIR / 'landscape-rivers.geojson'
    out_file.write_text(json.dumps(fc, separators=(',', ':')), encoding='utf-8')
    print(f'Saved {out_file}: {len(features)} river features, {out_file.stat().st_size / 1024:.1f} KB')

def main():
    bbox = get_union_bbox_with_buffer()
    print('Union BBox with 3 km buffer:', [round(x, 6) for x in bbox])

    # 1. Rivers
    fetch_and_build_rivers(bbox)

    # 2. Master DEM & tiles
    print('Fetching master DEM...')
    master_dem = fetch_master_dem(bbox)
    print(f'Master DEM loaded: {master_dem.shape}, min={master_dem.min()}m, max={master_dem.max()}m')

    print('Building tiles...')
    build_tiles(master_dem, bbox)

    # Total size check
    total_bytes = 0
    for root, _, files in os.walk(LANDSCAPE):
        for f in files:
            total_bytes += os.path.getsize(os.path.join(root, f))
    total_bytes += (DATA_DIR / 'landscape-rivers.geojson').stat().st_size
    mb = total_bytes / (1024 * 1024)
    print(f'Total landscape files size: {mb:.2f} MB (Budget <= 4.0 MB)')
    assert mb <= 4.0, f'Landscape files exceed 4.0 MB budget ({mb:.2f} MB)'

if __name__ == '__main__':
    main()
