import json,urllib.request,urllib.parse,pathlib
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling
p=pathlib.Path(__file__).parent/'dist/data';b=json.load(open(p/'fields.json'))['bbox']
u='https://nasademeuwest.blob.core.windows.net/nasadem-cog/v001/NASADEM_HGT_n25e089.tif'
signed=json.load(urllib.request.urlopen('https://planetarycomputer.microsoft.com/api/sas/v1/sign?href='+urllib.parse.quote(u,safe='')))['href']
with rasterio.open(signed) as ds:
 a=ds.read(1,window=from_bounds(*b,ds.transform),out_shape=(101,101),resampling=Resampling.bilinear)
 (p/'terrain.json').write_text(json.dumps({'source':'NASADEM HGT v001 · NASA/JPL','source_url':'https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001','bbox':b,'width':101,'height':101,'resolution_m':30,'acquired':'2000-02-11/2000-02-21','retrieved':'2026-11-08','values':a.round(2).tolist()},separators=(',',':')))
 print('NASADEM terrain restored',a.shape,int(a.min()),int(a.max()))
