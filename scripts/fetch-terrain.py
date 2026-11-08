"""Fetch offline NASADEM terrain height data for the 3D view.

For each of the 3 sites (mithapukur, pirganj, gangachara), downloads NASADEM
elevation over the 6 km box around each site from Microsoft Planetary Computer
and saves public/terrain/<site>.json.
"""
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import struct
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TERRAIN_DIR = ROOT / 'public' / 'terrain'
RAW_DIR = ROOT / 'data-raw'

COLLECTION = 'nasadem'
ITEM_ID = 'NASADEM_HGT_n25e089'
BASE_URL = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/'

SITES = [
    {
        'id': 'mithapukur',
        'name': 'Mithapukur',
        'lat': 25.54,
        'lon': 89.27,
    },
    {
        'id': 'pirganj',
        'name': 'Pirganj',
        'lat': 25.50,
        'lon': 89.22,
    },
    {
        'id': 'gangachara',
        'name': 'Gangachara',
        'lat': 25.85,
        'lon': 89.20,
    },
]

GRID_WIDTH = 128
GRID_HEIGHT = 128
NODATA_VALUE = -9999


def parse_geotiff(data: bytes, width: int, height: int):
    """Parse uncompressed single-band int16 GeoTIFF without external dependencies."""
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

    strip_offsets = tags[0x111]
    strip_byte_counts = tags[0x117]
    spp = tags.get(0x115, [1])[0]

    pixel_data = b''.join(data[off : off + cnt] for off, cnt in zip(strip_offsets, strip_byte_counts))
    num_samples = len(pixel_data) // 2
    values = struct.unpack(byte_order + f'{num_samples}h', pixel_data)

    # Elevation is sample 0 (first band)
    elevation_values = values[0::spp] if spp > 1 else values
    if len(elevation_values) != width * height:
        raise ValueError(f'Expected {width * height} samples, got {len(elevation_values)}')

    grid = []
    for r in range(height):
        row = []
        for c in range(width):
            val = elevation_values[r * width + c]
            # Missing data represented as null, never 0
            if val == NODATA_VALUE:
                row.append(None)
            else:
                row.append(int(val))
        grid.append(row)

    return grid


def fetch_site_terrain(site: dict):
    lat = site['lat']
    lon = site['lon']

    # 6 km box around site (3000 m each way)
    dy = 3000.0 / 111195.08
    dx = dy / math.cos(math.radians(lat))
    bounds = [
        round(lon - dx, 6),
        round(lat - dy, 6),
        round(lon + dx, 6),
        round(lat + dy, 6),
    ]

    # Calculate actual cell size in metres
    # 6000 m span divided by grid cells
    cell_size_m = round(6000.0 / GRID_WIDTH, 2)

    query = {
        'collection': COLLECTION,
        'item': ITEM_ID,
        'assets': 'elevation',
        'return_mask': 'false',
    }
    bbox_str = f'{bounds[0]},{bounds[1]},{bounds[2]},{bounds[3]}'
    url = f'{BASE_URL}{bbox_str}/{GRID_WIDTH}x{GRID_HEIGHT}.tif?{urllib.parse.urlencode(query)}'

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = RAW_DIR / f'nasadem-{site["id"]}.tif'

    retrieved_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    if not raw_path.exists():
        req = urllib.request.Request(url, headers={'User-Agent': 'RoponRadar'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read()
        raw_path.write_bytes(content)
    else:
        content = raw_path.read_bytes()

    grid = parse_geotiff(content, GRID_WIDTH, GRID_HEIGHT)

    # Compute valid min and max
    valid_heights = [h for row in grid for h in row if h is not None]
    if not valid_heights:
        raise ValueError(f'No valid height values for site {site["id"]}')

    min_height = min(valid_heights)
    max_height = max(valid_heights)

    doc = {
        'site': site['id'],
        'centre': [lat, lon],
        'bounds': bounds,
        'width': GRID_WIDTH,
        'height': GRID_HEIGHT,
        'cellSizeMetres': cell_size_m,
        'minHeightMetres': min_height,
        'maxHeightMetres': max_height,
        'grid': grid,
        'unit': 'm',
        'source': 'NASADEM Merged DEM Global 1 arc second NC (NASA JPL), accessed via Microsoft Planetary Computer',
        'itemId': ITEM_ID,
        'collection': COLLECTION,
        'requestUrlPattern': 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/{minx},{miny},{maxx},{maxy}/128x128.tif?collection=nasadem&item=NASADEM_HGT_n25e089&assets=elevation&return_mask=false',
        'requestUrl': url,
        'retrievedDate': retrieved_date,
        'provenance': 'REMOTE_OBSERVED',
        'note': 'NASADEM is a surface model: heights include trees and houses.',
    }

    TERRAIN_DIR.mkdir(parents=True, exist_ok=True)
    out_path = TERRAIN_DIR / f'{site["id"]}.json'
    out_content = json.dumps(doc, indent=2)
    out_path.write_text(out_content, encoding='utf-8')

    file_size_kb = len(out_content.encode('utf-8')) / 1024
    print(f'Saved {out_path.name}: {file_size_kb:.1f} KB, min={min_height}m, max={max_height}m')
    assert file_size_kb <= 200, f'File size {file_size_kb:.1f} KB exceeds 200 KB limit'


def main():
    for site in SITES:
        fetch_site_terrain(site)


if __name__ == '__main__':
    main()
