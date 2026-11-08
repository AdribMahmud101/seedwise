"""Cache a sharper, real 10 m Copernicus context image for each prepared site."""
import concurrent.futures
import io
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data/earth-data.json'
COLLECTION = 'sentinel-2-l2a'
SCENE = 'S2A_MSIL2A_20240309T043701_R033_T45RYJ_20240309T091652'
ITEM_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/collections/' + COLLECTION + '/items/' + SCENE
API = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/'


def fetch_one(field, item):
    lat, lon = field['lat'], field['lon']
    dy = 1500/111195.08
    dx = dy/math.cos(math.radians(lat))
    bounds = [lon-dx,lat-dy,lon+dx,lat+dy]
    args = dict(collection=COLLECTION,item=SCENE,assets='visual',asset_bidx='visual|1,2,3',nodata=0,dst_crs='EPSG:3857',return_mask='false')
    url = API + ','.join(format(x,'.8f') for x in bounds) + '/512x512.jpg?' + urllib.parse.urlencode(args)
    name = 'sentinel-' + field['id'] + '.jpg'
    path = ROOT / 'public/assets' / name
    if not path.exists():
        req=urllib.request.Request(url,headers={'User-Agent':'RoponRadar research demo'})
        with urllib.request.urlopen(req,timeout=45) as r: body=r.read()
        with Image.open(io.BytesIO(body)) as pic:
            if pic.size != (512,512): raise ValueError('Unexpected image dimensions')
            pic.convert('RGB').save(path,quality=94)
    return {'url':'assets/'+name,'bounds':bounds,'date':item['properties']['datetime'][:10],
            'sceneId':SCENE,'itemUrl':ITEM_URL,'source':'Copernicus Sentinel-2 Level-2A (ESA), via Microsoft Planetary Computer',
            'sceneCloudPercent':item['properties']['eo:cloud_cover'],'resolutionMetres':10,
            'sourceLabel':'Copernicus / ESA','dataRequest':url}


if __name__=='__main__':
    doc=json.loads(DATA.read_text())
    item=json.load(urllib.request.urlopen(ITEM_URL,timeout=30))
    assert item['assets']['visual']['gsd']==10
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        frames=list(pool.map(lambda f:fetch_one(f,item),doc['fields']))
    for f,frame in zip(doc['fields'],frames):
        f['contextImage']=frame
        print(f['id'],frame['date'],frame['url'])
    if not any(s['id']=='sentinel2' for s in doc['sources']):
        doc['sources'].append({'id':'sentinel2','name':'Copernicus Sentinel-2 Level-2A','url':ITEM_URL,'role':'10 m true-colour context image, 9 March 2024. Contains modified Copernicus Sentinel data 2024.'})
    tmp=DATA.with_suffix('.context-pending')
    tmp.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n')
    tmp.replace(DATA)


