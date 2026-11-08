#!/usr/bin/env python3
"""Build a small reproducible real-data Rangpur demo pack.

Only public reads. No credentials required. Missing observations stay null.
Run with the primary runtime Python (Pillow available).
The image path follows the catalog-provided TileJSON, avoiding guessed imagery.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import datetime as dt
import io
import json
import math
from pathlib import Path
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'data'
ASSETS = ROOT / 'public' / 'assets'
RAW = ROOT / 'data-raw'
FIELDS = [
    {'id': 'mithapukur', 'name': 'Mithapukur', 'lat': 25.54, 'lon': 89.27, 'climateAnchor': [89.375, 25.5]},
    {'id': 'pirganj', 'name': 'Pirganj', 'lat': 25.50, 'lon': 89.22, 'climateAnchor': [89.375, 25.5]},
    {'id': 'gangachara', 'name': 'Gangachara', 'lat': 25.85, 'lon': 89.20, 'climateAnchor': [89.375, 26.0]},
]
POWER = 'https://power.larc.nasa.gov/api/temporal/daily/point'
PC = 'https://planetarycomputer.microsoft.com/api/stac/v1'
MET = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETTOP,GWETROOT,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PS'
MAP = {'T2M':'tmean','T2M_MAX':'tmax','T2M_MIN':'tmin','PRECTOTCORR':'rainPower','GWETTOP':'wetness','GWETROOT':'rootWetness','RH2M':'humidity','WS2M':'wind','ALLSKY_SFC_SW_DWN':'solar','PS':'pressure','IMERG_PRECTOT':'rainGpm'}

def get(url, timeout=60):
    req = urllib.request.Request(url, headers={'User-Agent':'RoponRadarDemo/1.0 research prototype'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)

def get_json(url):
    return json.loads(get(url))

def valid(x):
    return isinstance(x, (float,int)) and math.isfinite(x) and x != -999

def avg(values):
    v = [x for x in values if valid(x)]
    return round(statistics.mean(v),4) if v else None

def total(values):
    v = [x for x in values if valid(x)]
    return round(sum(v),3) if v else None

def fetch_power(lon, lat, parameters, start, end, name):
    args = {'parameters':parameters,'community':'AG','longitude':lon,'latitude':lat,'start':start,'end':end,'format':'JSON','time-standard':'UTC'}
    url = POWER + '?' + urllib.parse.urlencode(args)
    path = RAW / f'{name}-{start}-{end}.json'
    if path.exists():
        body = path.read_bytes()
    else:
        body = get(url)
        path.write_bytes(body)
    obj=json.loads(body)
    if 'properties' not in obj:
        raise ValueError(f'Unexpected POWER response for {name}: {str(obj)[:300]}')
    return obj, url

def reference_et0(row, lat, elevation):
    """FAO-56 daily Penman–Monteith, RHmean approximation, G=0.

    RHmean-derived vapour pressure is an approximation; this is potential
    reference-grass ET, not measured crop ET or groundwater extraction.
    """
    names=['tmean','tmax','tmin','humidity','wind','solar','pressure']
    if not all(valid(row.get(k)) for k in names):
        return None
    t,tx,tn,rh,u2,rs,p=[row[k] for k in names]
    if not (0<=rh<=100 and 0<=u2 and 0<=rs and 50<p<120):
        return None
    j=dt.date.fromisoformat(row['date']).timetuple().tm_yday
    phi=math.radians(lat)
    dr=1+.033*math.cos(2*math.pi*j/365)
    decl=.409*math.sin(2*math.pi*j/365-1.39)
    ws=math.acos(max(-1,min(1,-math.tan(phi)*math.tan(decl))))
    ra=(24*60/math.pi)*.0820*dr*(ws*math.sin(phi)*math.sin(decl)+math.cos(phi)*math.cos(decl)*math.sin(ws))
    rso=(.75+.00002*elevation)*ra
    e=lambda temp: .6108*math.exp(17.27*temp/(temp+237.3))
    es=(e(tx)+e(tn))/2
    ea=es*rh/100
    rns=.77*rs
    # FAO-56 daily cloudiness factor is bounded for very cloudy conditions.
    ratio=max(.3,min(1,rs/rso)) if rso>0 else .3
    rnl=4.903e-9*((tx+273.16)**4+(tn+273.16)**4)/2*(.34-.14*math.sqrt(ea))*(1.35*ratio-.35)
    rn=rns-rnl
    slope=4098*e(t)/(t+237.3)**2
    gamma=.000665*p
    eto=(.408*slope*rn+gamma*900/(t+273)*u2*(es-ea))/(slope+gamma*(1+.34*u2))
    return round(max(0,eto),3)

def qa(daily):
    pairs=[(r['rainPower'],r['rainGpm']) for r in daily if valid(r.get('rainPower')) and valid(r.get('rainGpm'))]
    diffs=[a-b for a,b in pairs]
    mean=avg(diffs)
    sd=statistics.stdev(diffs) if len(diffs)>1 else None
    # Sampling interval for the mean inter-product difference; not sensor accuracy.
    half=1.96*sd/math.sqrt(len(diffs)) if sd is not None else None
    missing={key:sum(not valid(r.get(key)) for r in daily) for key in ['rainPower','rainGpm','wetness','rootWetness','tmean','et0']}
    return {'pairedDays':len(pairs),'meanDifferenceMm':mean,'maeMm':avg([abs(x) for x in diffs]),'rmseMm':round(math.sqrt(statistics.mean([x*x for x in diffs])),3) if diffs else None,'meanDifference95CI':[round(mean-half,3),round(mean+half,3)] if half is not None else None,'missingDays':missing,'missingPercent':{k:round(100*v/len(daily),2) for k,v in missing.items()},'differenceDirection':'POWER minus GPM','interpretation':'Inter-product disagreement, not measured bias. Neither product is ground truth. The mean-difference interval assumes independent daily differences; temporal correlation may make it too narrow.','cloudMaskLoss':None,'cloudMaskNote':'Not measured for the contextual imagery tiles. Scene cloud percentage is not parcel cloud-mask loss.'}

def summarize(daily):
    months=sorted(set(r['date'][:7] for r in daily))
    result=[]
    for month in months:
        rows=[r for r in daily if r['date'].startswith(month)]
        record={'month':month,'days':len(rows)}
        for k in ['tmean','tmax','tmin','wetness','rootWetness','humidity','wind']:
            record[k]=avg([r.get(k) for r in rows])
        for k in ['rainPower','rainGpm','et0']:
            record[k]=total([r.get(k) for r in rows])
        record['validDays']={k:sum(valid(r.get(k)) for r in rows) for k in ['tmean','rainPower','rainGpm','wetness','rootWetness','et0']}
        record['qa']=qa(rows)
        result.append(record)
    return result

def xtile(lon,z): return (lon+180)/360*(2**z)
def ytile(lat,z): return (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*(2**z)
def lon_tile(x,z): return x/(2**z)*360-180
def lat_tile(y,z): return math.degrees(math.atan(math.sinh(math.pi*(1-2*y/(2**z)))))

def fetch_context_image(field, item):
    """Get actual georeferenced image tiles via a catalog-provided TileJSON."""
    from PIL import Image
    assets=item.get('assets',{})
    asset=assets.get('tilejson')
    if not asset or not asset.get('href'):
        raise ValueError('Catalog item supplies no TileJSON asset')
    info=get_json(asset['href'])
    template=info['tiles'][0]
    # z15: contextual patch roughly 1.1km across for a 1x1 tile at this latitude.
    # Use 2x2 tiles around the point, preserving exact WebMercator tile bounds.
    z=min(15,int(info.get('maxzoom',15)))
    x0=math.floor(xtile(field['lon'],z))
    y0=math.floor(ytile(field['lat'],z))
    if xtile(field['lon'],z)-x0<.5:x0-=1
    if ytile(field['lat'],z)-y0<.5:y0-=1
    tiles=[]
    for oy in range(2):
        for ox in range(2):
            href=template.replace('{z}',str(z)).replace('{x}',str(x0+ox)).replace('{y}',str(y0+oy)).replace('{scale}','1').replace('{format}','png')
            tile=Image.open(io.BytesIO(get(href))).convert('RGB')
            tiles.append((ox,oy,tile))
    size=tiles[0][2].size[0]
    mosaic=Image.new('RGB',(size*2,size*2))
    for ox,oy,tile in tiles:mosaic.paste(tile,(ox*size,oy*size))
    path=ASSETS/f"satellite-{field['id']}.jpg"
    mosaic.save(path,quality=91)
    prop=item['properties']
    return {'url':f"assets/{path.name}",'bounds':[lon_tile(x0,z),lat_tile(y0+2,z),lon_tile(x0+2,z),lat_tile(y0,z)],'date':prop.get('datetime','')[:10],'source':'NASA/USGS Landsat Collection 2 Level 2 via Microsoft Planetary Computer','sceneId':item['id'],'sceneCloudPercent':prop.get('eo:cloud_cover'),'ndvi':None,'validFraction':None,'qualityNote':'Dated contextual RGB. Pixel-level cloud-mask loss and NDVI have not been extracted from these rendered tiles.','itemUrl':f"{PC}/collections/landsat-c2-l2/items/{item['id']}"}

def build(start,end,imagery=True):
    for p in [OUT,ASSETS,RAW]:p.mkdir(parents=True,exist_ok=True)
    anchors=sorted({tuple(f['climateAnchor']) for f in FIELDS})
    mets={}
    for lon,lat in anchors:
        key=(lon,lat)
        print(f'Fetching regional meteorology {key}',flush=True)
        mets[key]=fetch_power(lon,lat,MET,start,end,'meteorology-'+str(lat))
    result={'version':'1.0','retrievedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'period':{'start':start,'end':end},'scope':'Historical demo. Field outlines and farmer profiles are illustrative; environmental records are real regional estimates.','sources':[
        {'id':'power','name':'NASA POWER / MERRA-2','url':'https://power.larc.nasa.gov/docs/services/api/temporal/daily/','spatialSupport':'Regional meteorology: native approximately 0.5° latitude × 0.625° longitude; radiation has its own source grid.','timeStandard':'UTC','role':'Model/reanalysis estimate'},
        {'id':'gpm','name':'NASA GPM IMERG via POWER','url':'https://gpm.nasa.gov/data/imerg','spatialSupport':'Nominal 0.1° rainfall grid','timeStandard':'UTC','role':'Satellite-derived precipitation estimate'},
        {'id':'eto','name':'FAO-56 daily reference evapotranspiration','url':'https://www.fao.org/4/X0490E/x0490e08.htm','method':'Daily Penman–Monteith with POWER mean/max/min temperature, mean relative humidity approximation, 2m wind, solar radiation and pressure; daily soil heat flux G=0.','role':'Calculated potential reference-grass ET. Not actual crop ET or groundwater extraction.'},
        {'id':'landsat','name':'NASA/USGS Landsat Collection 2 Level 2','url':'https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2','role':'Dated contextual RGB imagery'},
    ],'fields':[],'limitations':['POWER wetness is a dimensionless modeled index, not volumetric soil moisture or a parcel sensor reading.','SMAP direct ingestion is not included: the tested POWER moisture alias route returned missing data.','No local BMD probe readings are included.','No measured groundwater storage or extraction is included.','Nearby fields may share identical regional values.','Scene-level cloud cover does not equal field-level cloud-mask loss.']}
    item=None
    if imagery:
        try:
            print('Fetching catalog item for Landsat context imagery',flush=True)
            item=get_json(f'{PC}/collections/landsat-c2-l2/items/LC08_L2SP_138042_20240128_02_T1')
        except Exception as error:print('Image catalog unavailable:',error,flush=True)
    for field in FIELDS:
        met,url=mets[tuple(field['climateAnchor'])]
        print('Fetching IMERG '+field['id'],flush=True)
        try:gpm,gpm_url=fetch_power(field['lon'],field['lat'],'IMERG_PRECTOT',start,end,'gpm-'+field['id'])
        except Exception as error:
            print('GPM unavailable:',field['id'],error,flush=True)
            gpm={'properties':{'parameter':{}}};gpm_url=None
        mp=met['properties']['parameter'];gp=gpm['properties']['parameter']
        keys=sorted({d for param in mp.values() for d in param})
        elevation=met.get('geometry',{}).get('coordinates',[0,0,0])[2]
        daily=[]
        for date in keys:
            row={'date':date[:4]+'-'+date[4:6]+'-'+date[6:8]}
            for variable,key in MAP.items():
                collection=gp if variable.startswith('IMERG') else mp
                value=collection.get(variable,{}).get(date)
                row[key]=value if valid(value) else None
            # Community AG usually returns MJ/m²/day and kPa; honor returned units.
            solar_unit=met.get('parameters',{}).get('ALLSKY_SFC_SW_DWN',{}).get('units','')
            if row['solar'] is not None and 'kW' in solar_unit:row['solar']*=3.6
            row['et0']=reference_et0(row,field['climateAnchor'][1],elevation)
            daily.append(row)
        record={**field,'period':{'start':daily[0]['date'],'end':daily[-1]['date']},'daily':daily,'monthly':summarize(daily),'qa':qa(daily),'imagery':[],'provenance':{'meteorologyRequest':url,'gpmRequest':gpm_url,'meteorologySourceHeader':met.get('header'),'meteorologyParameterMetadata':met.get('parameters'),'gpmSourceHeader':gpm.get('header'),'elevationSource':'POWER response geometry, used only in clear-sky radiation calculation','elevationMeters':elevation,'spatialSupport':'Coarse regional estimates attached to a demonstration centroid; not field-level measurements.'}}
        if item:
            try:
                print('Fetching image tiles '+field['id'],flush=True)
                record['imagery']=[fetch_context_image(field,item)]
            except Exception as error:print('Image tiles unavailable:',field['id'],error,flush=True)
        result['fields'].append(record)
        # A checkpoint ensures actual completed fields survive an interruption.
        (OUT/'earth-data.json').write_text(json.dumps(result,separators=(',',':'),ensure_ascii=False))
    print(json.dumps({'output':str(OUT/'earth-data.json'),'fields':len(result['fields']),'observations':sum(len(f['daily']) for f in result['fields']),'imagery':sum(len(f['imagery']) for f in result['fields'])}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--start',default='20240101')
    parser.add_argument('--end',default='20241231')
    parser.add_argument('--no-imagery',action='store_true')
    args=parser.parse_args()
    build(args.start,args.end,not args.no_imagery)
