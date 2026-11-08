"""Read real Landsat Collection 2 windows from the Planetary Computer Data API.

One approximately 900 m square per prepared centre. QA remains attached to
this fixed support when the user redraws a field boundary.
"""
import io
import json
import math
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.warp import transform

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data/earth-data.json'
BASE = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/'
QA_REFERENCE = 'https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands'
REFLECTANCE_REFERENCE = 'https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance'


def extract(field):
    image = field['imagery'][0]
    xs, ys = transform('EPSG:4326', 'EPSG:32645', [field['lon']], [field['lat']])
    # Landsat collection 2 native centres lie on 30 m UTM multiples.
    west = math.floor((xs[0] - 450) / 30) * 30 - 15
    south = math.floor((ys[0] - 450) / 30) * 30 - 15
    bounds = [west, south, west + 900, south + 900]
    bands = ['qa_pixel', 'qa_radsat', 'red', 'nir08']
    query = {'collection': 'landsat-c2-l2', 'item': image['sceneId'],
             'assets': bands, 'coord_crs': 'EPSG:32645', 'dst_crs': 'EPSG:32645',
             'unscale': 'false', 'return_mask': 'false', 'resampling': 'nearest'}
    url = BASE + ','.join(str(v) for v in bounds) + '/30x30.tif?' + urllib.parse.urlencode(query, doseq=True)
    path = ROOT / 'data-raw' / ('optical-' + field['id'] + '.tif')
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent':'RoponRadar research demo'})
        with urllib.request.urlopen(request, timeout=40) as response:
            content = response.read()
    else:
        content = path.read_bytes()
    with MemoryFile(content) as mem, mem.open() as src:
        if src.count != 4 or src.width != 30 or src.height != 30:
            raise ValueError('Unexpected optical window dimensions or bands')
        qa, saturation, red, nir = src.read().astype('int32')
        coverage = (qa & 1) == 0
        clouds = coverage & ((qa & 30) != 0)
        clear = coverage & ((qa & 62) == 0) & ((saturation & ((1<<3)|(1<<4)|(1<<11))) == 0)
        red_sr, nir_sr = red * 0.0000275 - 0.2, nir * 0.0000275 - 0.2
        valid = clear & (red > 0) & (nir > 0) & (red_sr >= 0) & (nir_sr >= 0) & (red_sr + nir_sr > 0)
        ndvi = (nir_sr[valid]-red_sr[valid])/(nir_sr[valid]+red_sr[valid])
        eligible, usable = int(coverage.sum()), int(valid.sum())
        metrics = {'cloudMaskLoss': round(int(clouds.sum()) / eligible, 5) if eligible else None,
                   'validFraction': round(usable / qa.size, 5), 'ndvi': round(float(ndvi.mean()), 4) if usable else None,
                   'pixels': int(qa.size), 'eligiblePixels': eligible, 'validPixels': usable,
                   'cloudOrShadowPixels': int(clouds.sum()), 'supportBoundsUtm45N': bounds,
                   'method': '900 m square on a 30 m grid. QA_PIXEL bits 1–4 flag dilated cloud, cirrus, cloud and shadow. Fill excluded from cloud denominator. NDVI also excludes snow, red/NIR saturation, terrain occlusion and invalid reflectance.',
                   'qaReference': QA_REFERENCE, 'reflectanceReference': REFLECTANCE_REFERENCE, 'dataRequest': url}
    path.write_bytes(content)
    return field['id'], metrics


if __name__ == '__main__':
    doc = json.loads(DATA.read_text())
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(extract, doc['fields']))
    for field_id, metrics in results:
        f = next(f for f in doc['fields'] if f['id']==field_id)
        image = f['imagery'][0]
        image['opticalQA'] = metrics
        for key in ['ndvi','validFraction','cloudMaskLoss']:
            image[key] = metrics[key]
        image['qualityNote'] = (f"Fixed 900 m square centred near the demo plot. {metrics['validPixels']} of "
             f"{metrics['pixels']} 30 m samples passed QA. NDVI is the mean over usable samples. "
             "Redrawing a boundary does not change this prepared window.")
        f['qa']['cloudMaskLoss'] = metrics['cloudMaskLoss']
        f['qa']['cloudMaskNote'] = image['qualityNote']
        print(field_id, {k:metrics[k] for k in ['pixels','validPixels','cloudMaskLoss','ndvi']}, flush=True)
    doc['sources'].extend(s for s in [
       {'id':'landsat-qa','name':'USGS Landsat Collection 2 quality bands','url':QA_REFERENCE,'role':'Optical cloud and shadow exclusions'},
       {'id':'landsat-sr','name':'USGS Landsat surface reflectance','url':REFLECTANCE_REFERENCE,'role':'Reflectance scale and offset for NDVI'}] if s['id'] not in {a['id'] for a in doc['sources']})
    temporary = DATA.with_suffix('.pending')
    temporary.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n')
    temporary.replace(DATA)


