"""Sample four 2024 Landsat acquisitions and keep their own dates and cloud losses."""
import json
import runpy
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

root=Path(__file__).resolve().parents[1]
path=root/'public/data/earth-data.json'
doc=json.loads(path.read_text())
base=runpy.run_path(str(root/'scripts/extract-optical.py'))
first=doc['fields'][0]['imagery'][0]
choices=[{'id':first['sceneId'],'properties':{'datetime':first['date']+'T00:00:00Z','eo:cloud_cover':first['sceneCloudPercent']}}]
for month,end in [('04','30'),('07','31'),('10','31')]:
    args={'collections':'landsat-c2-l2','bbox':'89.19,25.48,89.29,25.86','limit':'100',
        'datetime':f'2024-{month}-01T00:00:00Z/2024-{month}-{end}T23:59:59Z'}
    with urllib.request.urlopen('https://planetarycomputer.microsoft.com/api/stac/v1/search?'+urllib.parse.urlencode(args),timeout=30) as r:
        scenes=json.load(r)['features']
    candidates=[s for s in scenes if s['id'].startswith(('LC08','LC09')) and '_138042_' in s['id'] and s['id'].endswith('_T1')]
    if candidates:
        choices.append(min(candidates,key=lambda s:s['properties'].get('eo:cloud_cover',100)))
jobs=[(f,item) for f in doc['fields'] for item in choices]
def get_epoch(job):
    f,item=job
    date=item['properties']['datetime'][:10]
    if item['id']==first['sceneId']:
        metrics=f['imagery'][0]['opticalQA']
    else:
        patch=dict(f,id=f['id']+'-'+date,imagery=[{'sceneId':item['id']}])
        _,metrics=base['extract'](patch)
    return f['id'],{'date':date,'sceneId':item['id'],'sceneCloudPercent':item['properties'].get('eo:cloud_cover'),
       'itemUrl':'https://planetarycomputer.microsoft.com/api/stac/v1/collections/landsat-c2-l2/items/'+item['id'],'opticalQA':metrics}
with ThreadPoolExecutor(max_workers=4) as pool:
    results=list(pool.map(get_epoch,jobs))
for f in doc['fields']:
    f['opticalHistory']=[epoch for fid,epoch in results if fid==f['id']]
    print(f['id'],[(e['date'],e['opticalQA']['ndvi'],e['opticalQA']['cloudMaskLoss']) for e in f['opticalHistory']])
temp=path.with_suffix('.epoch-pending')
temp.write_text(json.dumps(doc,ensure_ascii=False,separators=(',',':'))+'\n')
temp.replace(path)


