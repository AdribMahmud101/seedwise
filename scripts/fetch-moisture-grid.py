"""Prepare 20 m NDMI on the exact scenes and grid geometry of ndvi-grid.json.

Run with the fetch-map-tiles.py rasterio/numpy environment. --self-check checks
the expression and mask; --validate checks the gzip JSON pack without fetching.
"""

import argparse
import gzip
import importlib.util
import json
import math
import urllib.parse

spec = importlib.util.spec_from_file_location('map_tiles', __file__.replace('fetch-moisture-grid', 'fetch-map-tiles'))
maps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(maps)
OUTPUT = maps.PUBLIC / 'data/moisture-grid.json'
LIMIT = 2_000_000


def ndmi(nir, swir, offset):
    nir, swir = nir + offset, swir + offset
    return (nir - swir) / (nir + swir)


def self_check():
    # BOA reflectances .3 and .1 give .5, not the uncorrected DN ratio 1/3.
    assert ndmi(4000, 2000, -1000) == .5
    assert ndmi(2000, 2000, -1000) == 0
    assert ndmi(2000, 4000, -1000) == -.5
    maps.check_cloud_mask()
    print('NDMI expression self-check passed')


def build_grid(reference):
    from rasterio.io import MemoryFile

    scene = reference['sceneId']
    item = json.loads(maps.cached(scene + '.json', maps.STAC + '/collections/' + maps.COLLECTION + '/items/' + scene))
    radiometry = maps.source_metadata(item, band_ids=(8, 11))  # B8A and B11 in product XML.
    west, south, east, north = reference['projectedBounds']
    width, height = reference['width'], reference['height']
    args = {'collection': maps.COLLECTION, 'item': scene, 'assets': ['B11', 'B8A', 'SCL'],
            'coord_crs': reference['crs'], 'dst_crs': reference['crs'],
            'unscale': 'false', 'resampling': 'nearest', 'return_mask': 'true'}
    url = maps.API + f'/bbox/{west},{south},{east},{north}/{width}x{height}.tif?' + urllib.parse.urlencode(args, doseq=True)
    name = f"ndmi-{reference['siteId']}-{reference['date']}.tif.gz"
    body = maps.cached(name, url, compressed=True)
    with MemoryFile(body) as memory, memory.open() as raster:
        assert raster.shape == (height, width) and raster.count == 4, 'NDMI shape/bands mismatch'
        assert list(raster.transform)[:6] == reference['transform'], 'NDMI transform mismatch'
        assert str(raster.crs) == reference['crs'], 'NDMI CRS mismatch'
        data = raster.read().astype('float64')
    # Reuse the BOA correction and SCL 4/5/6 + data validity mask; SWIR replaces red.
    values, valid = maps.ndvi_values(data, radiometry['boaAddOffset'])
    return {**reference, 'index': 'NDMI', 'resolutionMetres': 20,
            'validFraction': round(float(valid.mean()), 6), 'radiometry': radiometry,
            'values': [[round(float(v), 3) if math.isfinite(v) else None for v in row] for row in values],
            **maps.receipt(name)}


def validate(pack, ndvi):
    assert pack['index'] == 'NDMI'
    assert len(pack['grids']) == len(ndvi['grids'])
    for grid, reference in zip(pack['grids'], ndvi['grids']):
        for key in ('siteId', 'date', 'sceneId', 'bounds', 'crs', 'transform', 'projectedBounds', 'width', 'height'):
            assert grid[key] == reference[key], f'NDMI {key} mismatch'
        assert grid['index'] == 'NDMI' and grid['cellSizeMetres'] == grid['resolutionMetres'] == 20
        assert len(grid['values']) == reference['height']
        assert all(len(row) == reference['width'] for row in grid['values'])
        assert all(v is None or (math.isfinite(v) and -1 <= v <= 1 and v == round(v, 3))
                   for row in grid['values'] for v in row)
    print(f"Validated {len(pack['grids'])} NDMI grids against NDVI shape and transform")


def read_pack():
    body = OUTPUT.read_bytes()
    assert len(body) <= LIMIT, 'NDMI pack exceeds 2 MB'
    return json.loads(gzip.decompress(body))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-check', action='store_true')
    parser.add_argument('--validate', action='store_true')
    args = parser.parse_args()
    self_check()
    if args.self_check:
        return
    ndvi = json.loads((maps.PUBLIC / 'data/ndvi-grid.json').read_text())
    if args.validate:
        validate(read_pack(), ndvi)
        return
    grids = []
    for reference in ndvi['grids']:
        grids.append(build_grid(reference))
        print(f"NDMI {reference['siteId']} {reference['date']}", flush=True)
    pack = {**ndvi, 'index': 'NDMI', 'formula': '(B8A-B11)/(B8A+B11), BOA offset corrected', 'grids': grids}
    validate(pack, ndvi)
    # Six full numeric grids exceed 2 MB as text; gzip preserves every cell and the JSON schema.
    body = gzip.compress((json.dumps(pack, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n').encode(), mtime=0)
    assert len(body) <= LIMIT, 'NDMI pack exceeds 2 MB'
    pending = OUTPUT.with_suffix('.json.pending')
    pending.write_bytes(body)
    pending.replace(OUTPUT)
    print(f'{OUTPUT.name}: {OUTPUT.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
