#!/usr/bin/env python3
"""Fetch real JPL mascon total water storage (including groundwater) for 2024.

Requires requests, netCDF4 and EARTHDATA_TOKEN in the environment. The token
stays outside the output. Run from any directory; only the site JSON is saved.
"""
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile

import netCDF4
import requests

ROOT = Path(__file__).resolve().parents[1]
COLLECTION = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"
SOURCE_URL = "https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/"


def extract(path, granule, url):
    sites = json.loads((ROOT / "public/data/soil-nutrients.json").read_text())["sites"]
    result = {
        "schemaVersion": 1,
        "source": "NASA JPL GRACE / GRACE-FO mascons RL06.3Mv04 CRI",
        "url": SOURCE_URL,
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "collectionId": COLLECTION,
        "granuleId": granule["id"],
        "fileId": url.rsplit("/", 1)[-1],
        "fileUrl": url,
        "variable": "lwe_thickness",
        "units": "cm",
        "resolution": {"effective": "~300 km (3-degree mascons)", "sampling": "0.5 degrees"},
        "baseline": {"start": "2004-01-01", "end": "2009-12-31", "note": "Anomalies relative to the January 2004–December 2009 time mean; normal is this fixed baseline, not the selected month's climatology."},
        "method": "Nearest 0.5-degree grid centre to each soil-nutrients.json site; original monthly lwe_thickness in cm, no gain factors, interpolation or synthetic gap filling. Calendar month assigned by the native time coordinate.",
        "note": "Total terrestrial water storage includes groundwater, soil moisture, surface water, snow and ice. This is not a groundwater-only estimate or a local well depth. Nearby sites may share one mascon.",
        "period": {"start": "2024-01", "end": "2024-12"},
        "sites": {},
    }
    with path.open("rb") as handle:
        result["sha256"] = hashlib.file_digest(handle, "sha256").hexdigest()
    with netCDF4.Dataset(path) as ds:
        time = ds["time"]
        dates = netCDF4.num2date(time[:], time.units, calendar=getattr(time, "calendar", "standard"))
        indices = {f"{d.year:04d}-{d.month:02d}": i for i, d in enumerate(dates) if d.year == 2024}
        water = ds["lwe_thickness"]
        assert water.units == "cm", water.units
        assert water.dimensions == ("time", "lat", "lon"), water.dimensions
        result["nativeMetadata"] = {name: str(ds.getncattr(name)) for name in ["title", "institution", "summary", "time_mean_removed"] if name in ds.ncattrs()}
        for key, site in sites.items():
            lat_idx = int(abs(ds["lat"][:] - site["lat"]).argmin())
            lon_idx = int(abs(ds["lon"][:] - (site["lon"] % 360)).argmin())
            monthly = []
            for month in range(1, 13):
                label = f"2024-{month:02d}"
                idx = indices.get(label)
                row = {"month": label, "twsAnomalyCm": None, "fileId": result["fileId"], "granuleId": result["granuleId"]}
                if idx is None:
                    row["reason"] = "No native monthly solution in this granule"
                else:
                    value = water[idx, lat_idx, lon_idx]
                    if not bool(getattr(value, "mask", False)) and math.isfinite(float(value)):
                        row["twsAnomalyCm"] = round(float(value), 6)
                        row["timeIndex"] = idx
                        row["nativeTime"] = dates[idx].isoformat()
                    else:
                        row["reason"] = "NASA pixel is masked or non-finite"
                monthly.append(row)
            result["sites"][key] = {
                "lat": site["lat"], "lon": site["lon"],
                "gridCentre": {"lat": float(ds["lat"][lat_idx]), "lon": float(ds["lon"][lon_idx])},
                "gridIndex": {"lat": lat_idx, "lon": lon_idx},
                "masconId": int(ds["mascon_ID"][lat_idx, lon_idx]),
                "monthly": monthly,
            }
    output = ROOT / "public/data/grace-groundwater.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    print(f"Saved {output}: {result['fileId']}")


if __name__ == "__main__":
    token = os.environ["EARTHDATA_TOKEN"]
    response = requests.get("https://cmr.earthdata.nasa.gov/search/granules.json", params={"short_name": COLLECTION, "page_size": 1}, timeout=60)
    response.raise_for_status()
    granule = response.json()["feed"]["entry"][0]
    url = next(link["href"] for link in granule["links"] if link["href"].startswith("https://archive.podaac.earthdata.nasa.gov/") and link["href"].endswith(".nc"))
    with tempfile.TemporaryDirectory(prefix="soilnasa-grace-") as tmp:
        path = Path(tmp) / "mascons.nc"
        with requests.get(url, headers={"Authorization": f"Bearer {token}"}, stream=True, timeout=120) as download:
            download.raise_for_status()
            with path.open("wb") as handle:
                for chunk in download.iter_content(1024 * 1024):
                    handle.write(chunk)
        extract(path, granule, url)
