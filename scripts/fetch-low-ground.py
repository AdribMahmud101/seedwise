"""Freeze NASADEM low-ground overlays and tap classifications using only stdlib.

Run: python scripts/fetch-low-ground.py
Access pattern recovered from 427991b:scripts/fetch-terrain.py.
Raw responses stay in data-raw/low-ground; runtime needs only public files.
"""
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from statistics import median
import struct
import urllib.parse
import urllib.request
import zlib

ROOT = Path(__file__).resolve().parents[1]
SIZE = 200
PAD = 24  # Includes the 1 km median window and the Gaussian kernel beyond each edge.
SIGMA = 1.5
ITEM = 'NASADEM_HGT_n25e089'


def read_tiff(data, size):
    """Read the API's uncompressed, signed int16 elevation band; reject other layouts."""
    order = '<' if data[:2] == b'II' else '>'
    if data[:2] not in (b'II', b'MM'):
        raise ValueError('Expected TIFF response')
    offset = struct.unpack_from(order + 'I', data, 4)[0]
    tags = {}
    for i in range(struct.unpack_from(order + 'H', data, offset)[0]):
        tag, kind, count, value = struct.unpack_from(order + 'HHII', data, offset + 2 + i * 12)
        if kind not in (3, 4):
            continue
        code = 'H' if kind == 3 else 'I'
        length = struct.calcsize(code) * count
        raw = struct.pack(order + 'I', value) if length <= 4 else data[value:value + length]
        tags[tag] = struct.unpack(order + code * count, raw[:length])
    if (tags[256][0], tags[257][0], tags[258][0], tags[259][0],
            tags.get(277, (1,))[0], tags.get(339, (1,))[0]) != (size, size, 16, 1, 1, 2):
        raise ValueError('Unexpected NASADEM TIFF layout')
    pixels = b''.join(data[start:start + length] for start, length in zip(tags[273], tags[279]))
    values = struct.unpack(order + 'h' * (size * size), pixels)
    # Never turn missing elevation into a low spot.
    if any(value < -500 or value > 9000 for value in values):
        raise ValueError('Missing or invalid NASADEM elevation')
    return [list(values[y * size:(y + 1) * size]) for y in range(size)]


def relative_grid(elevation, radius):
    height, width = len(elevation), len(elevation[0])
    relative = []
    for y in range(height):
        rows = elevation[max(0, y - radius):min(height, y + radius + 1)]
        relative.append([
            elevation[y][x] - median([v for row in rows
                                     for v in row[max(0, x - radius):min(width, x + radius + 1)]])
            for x in range(width)
        ])
    radius = math.ceil(3 * SIGMA)
    weights = [math.exp(-i * i / (2 * SIGMA * SIGMA)) for i in range(-radius, radius + 1)]
    total = sum(weights)
    weights = [w / total for w in weights]
    horizontal = [[sum(row[min(width - 1, max(0, x + k - radius))] * w
                       for k, w in enumerate(weights)) for x in range(width)] for row in relative]
    return [[sum(horizontal[min(height - 1, max(0, y + k - radius))][x] * w
                 for k, w in enumerate(weights)) for x in range(width)] for y in range(height)]


def alpha(value, edge):
    fade = min(1, max(0, edge / 4))
    fade = fade * fade * (3 - 2 * fade)
    return round(255 * 0.55 * min(1, max(0, (-value - 1) / 3)) * fade)


def write_png(path, grid):
    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))
    size = len(grid)
    raw = bytearray()
    for y, row in enumerate(grid):
        raw.append(0)
        for x, value in enumerate(row):
            raw.extend((47, 111, 181, alpha(value, min(x, y, size - 1 - x, size - 1 - y))))
    body = b'\x89PNG\r\n\x1a\n'
    body += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    body += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    path.write_bytes(body)


def fetch_site(site):
    west, south, east, north = site['bounds']
    dx, dy = (east - west) / SIZE, (north - south) / SIZE
    bounds = [west - PAD * dx, south - PAD * dy, east + PAD * dx, north + PAD * dy]
    size = SIZE + 2 * PAD
    query = urllib.parse.urlencode(dict(collection='nasadem', item=ITEM, assets='elevation', return_mask='false'))
    url = ('https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/' +
           ','.join(map(str, bounds)) + f'/{size}x{size}.tif?' + query)
    raw_path = ROOT / 'data-raw' / 'low-ground' / f'{site["id"]}.tif'
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    receipt = raw_path.with_suffix('.receipt.json')
    if not raw_path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'RoponRadar'})
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        read_tiff(data, size)
        raw_path.write_bytes(data)
        receipt.write_text(json.dumps(dict(requestUrl=url, fetchedAt=datetime.now(timezone.utc).isoformat())))
    elif json.loads(receipt.read_text())['requestUrl'] != url:
        raise ValueError(f'Stale cache: remove {raw_path.parent} and rerun')
    elevation = read_tiff(raw_path.read_bytes(), size)
    cell_metres = dy * 111195.08
    radius = round(1000 / cell_metres / 2)
    if PAD < radius + math.ceil(3 * SIGMA):
        raise ValueError('Median/Gaussian window needs more padding')
    smoothed = relative_grid(elevation, radius)
    grid = [row[PAD:PAD + SIZE] for row in smoothed[PAD:PAD + SIZE]]
    png = f'/overlays/low-ground-{site["id"]}.png'
    write_png(ROOT / 'public' / png.lstrip('/'), grid)
    values = [v for row in grid for v in row]
    return dict(id=site['id'], bounds=site['bounds'], png=png, width=SIZE, height=SIZE,
                grid=[''.join('l' if v < -1 else 'h' if v > 1 else 'e' for v in row) for row in grid],
                stats=dict(minRelativeMetres=round(min(values), 2), maxRelativeMetres=round(max(values), 2),
                           lowPercent=round(100 * sum(v < -1 for v in values) / len(values), 1)),
                **json.loads(receipt.read_text()))


def main():
    sites = json.loads((ROOT / 'public/data/map-layers.json').read_text())['sites']
    (ROOT / 'public/overlays').mkdir(parents=True, exist_ok=True)
    outputs = []
    for site in sites:
        outputs.append(fetch_site(site))
        print(site['id'], outputs[-1]['stats'], flush=True)
    doc = dict(sites=outputs,
               source='NASADEM 30 m (NASA JPL), via Microsoft Planetary Computer; NASADEM_HGT_n25e089',
               method=dict(relativeElevation='elevation minus median in a ~1 km square; then Gaussian smoothing',
                           windowMetres=1000, sigmaCells=SIGMA, lowThresholdMetres=-1, highThresholdMetres=1,
                           alpha='0 at -1 m; linear to 0.55 at <= -4 m; outer 4 cells feathered',
                           grid='200x200, north to south; l: below -1 m, e: -1 to +1 m, h: above +1 m'),
               caveat='Approximate (30 m, includes trees and buildings). Relative surface height, not flood prediction or drainage advice.')
    body = json.dumps(doc, separators=(',', ':'), allow_nan=False) + '\n'
    total = len(body.encode()) + sum((ROOT / 'public' / s['png'].lstrip('/')).stat().st_size for s in outputs)
    if total > 300_000:
        raise ValueError(f'Low-ground pack exceeds 300 KB: {total} bytes')
    (ROOT / 'public/data/low-ground.json').write_text(body)
    print(f'Low-ground pack: {total} bytes')


if __name__ == '__main__':
    assert alpha(-1, 10) == 0 and alpha(-4, 10) == 140 and alpha(-5, 0) == 0
    main()
