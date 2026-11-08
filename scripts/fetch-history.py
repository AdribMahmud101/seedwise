"""Build a lightweight 2021–2025 monthly archive from official POWER responses."""
import concurrent.futures
import json
from pathlib import Path
import runpy

ROOT=Path(__file__).resolve().parents[1]
helpers=runpy.run_path(str(ROOT/'scripts/fetch-earth-data.py'))
start,end='20210101','20251231'
fields=helpers['FIELDS']
jobs={}
for f in fields:
    lon,lat=f['climateAnchor']
    jobs['met-'+str(lat)]=(lon,lat,helpers['MET'],start,end,'archive-met-'+str(lat))
    jobs['gpm-'+f['id']]=(f['lon'],f['lat'],'IMERG_PRECTOT',start,end,'archive-gpm-'+f['id'])
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    futures={k:executor.submit(helpers['fetch_power'],*args) for k,args in jobs.items()}
    inputs={k:f.result() for k,f in futures.items()}
archive={'period':['2021-01','2025-12'],'scope':'Monthly regional estimates. The 2024 daily QA data in earth-data.json remain a separate fixed replay.','fields':{}}
for f in fields:
    met,met_url=inputs['met-'+str(f['climateAnchor'][1])]
    gpm,gpm_url=inputs['gpm-'+f['id']]
    mp=met['properties']['parameter']
    gp=gpm['properties']['parameter']
    rows=[]
    for date in sorted(mp['T2M']):
        row={'date':date[:4]+'-'+date[4:6]+'-'+date[6:8]}
        for variable,key in helpers['MAP'].items():
            raw=(gp if variable.startswith('IMERG') else mp).get(variable,{}).get(date)
            row[key]=raw if helpers['valid'](raw) else None
        if row['solar'] is not None and 'kW' in met['parameters']['ALLSKY_SFC_SW_DWN']['units']:
            row['solar']*=3.6
        row['et0']=helpers['reference_et0'](row,f['climateAnchor'][1],met['geometry']['coordinates'][2])
        rows.append(row)
    months=[{k:v for k,v in m.items() if k!='qa'} for m in helpers['summarize'](rows)]
    archive['fields'][f['id']]={'monthly':months,'meteorologyRequest':met_url,'gpmRequest':gpm_url}
    print(f['id'],len(rows),'daily inputs,',len(months),'months',flush=True)
path=ROOT/'public/data/history.json'
path.write_text(json.dumps(archive,ensure_ascii=False,separators=(',',':'))+'\n')


