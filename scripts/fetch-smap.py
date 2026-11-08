#!/usr/bin/env python3
"""Fetch NASA SMAP L4 soil moisture from POWER public cloud store.

Reads POWER's public SMAP store (no login):
  s3://nasa-power-smap/smap/temporal/power_smap_daily_temporal_utc.zarr

Variables: SFMC, RZMC, RZMC_PRCNTL, PRMC_PRCNTL
Period: 2021-01-01 to 2025-12-31
Sites: mithapukur (25.54, 89.27), pirganj (25.50, 89.22), gangachara (25.85, 89.20)

Usage:
  uv venv --python-preference only-managed
  uv pip install xarray zarr s3fs numpy
  source .venv/bin/activate  # or use .venv/bin/python
  python scripts/fetch-smap.py
"""

import datetime as dt
import json
import math
from pathlib import Path

import numpy as np
import xarray as xr

# Site definitions
SITES = {
    "mithapukur": {"lat": 25.54, "lon": 89.27},
    "pirganj": {"lat": 25.50, "lon": 89.22},
    "gangachara": {"lat": 25.85, "lon": 89.20},
}

# Data store
STORE = "s3://nasa-power-smap/smap/temporal/power_smap_daily_temporal_utc.zarr"

# Variables to fetch (SFMC_PRCNTL doesn't exist in this dataset)
VARIABLES = ["SFMC", "RZMC", "RZMC_PRCNTL", "PRMC_PRCNTL"]

# Period
START = "2021-01-01"
END = "2025-12-31"

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data-raw"
OUT_DIR = ROOT / "public" / "data"


def open_store():
    """Open the POWER SMAP Zarr store."""
    print(f"Opening store: {STORE}")
    ds = xr.open_zarr(STORE, storage_options={"anon": True})
    return ds


def find_nearest_point(ds, lat, lon):
    """Find the nearest grid point to the given lat/lon."""
    lat_vals = ds['lat'].values
    lon_vals = ds['lon'].values
    
    lat_idx = int(np.argmin(np.abs(lat_vals - lat)))
    lon_idx = int(np.argmin(np.abs(lon_vals - lon)))
    
    actual_lat = float(lat_vals[lat_idx])
    actual_lon = float(lon_vals[lon_idx])
    
    print(f"  Target: ({lat}, {lon})")
    print(f"  Grid point: ({actual_lat}, {actual_lon}) at index ({lat_idx}, {lon_idx})")
    
    return {"lat": lat_idx, "lon": lon_idx}, actual_lat, actual_lon


def extract_site_data(ds, site_id, lat, lon):
    """Extract SMAP data for a single site."""
    print(f"\nExtracting data for {site_id}...")
    
    # Find nearest grid point
    sel, actual_lat, actual_lon = find_nearest_point(ds, lat, lon)
    
    # Time dimension
    time_vals = ds['time'].values
    
    print(f"  Time range: {time_vals[0]} to {time_vals[-1]}")
    
    # Extract all variables at once for this point
    site_ds = ds.isel(lat=sel["lat"], lon=sel["lon"])
    
    # Get the time indices for our period
    start_dt = np.datetime64(START)
    end_dt = np.datetime64(END)
    
    time_mask = (time_vals >= start_dt) & (time_vals <= end_dt)
    time_indices = np.where(time_mask)[0]
    
    print(f"  Extracted {len(time_indices)} days in period {START} to {END}")
    
    # Extract data
    raw_data = []
    for t_idx in time_indices:
        date = str(time_vals[t_idx])[:10]  # YYYY-MM-DD
        row = {"date": date}
        
        for var in VARIABLES:
            try:
                val = site_ds[var].values[t_idx]
                if math.isnan(val) or val is None or val == -999:
                    row[var] = None
                else:
                    row[var] = float(val)
            except (KeyError, IndexError) as e:
                print(f"  Warning: Cannot extract {var} at index {t_idx}: {e}")
                row[var] = None
        
        raw_data.append(row)
    
    return {
        "site": site_id,
        "lat": actual_lat,
        "lon": actual_lon,
        "data": raw_data,
        "grid_point": {"lat": actual_lat, "lon": actual_lon},
    }


def compute_monthly(data):
    """Compute monthly means and valid day counts."""
    from collections import defaultdict
    
    monthly = defaultdict(lambda: {
        "SFMC": [], "RZMC": [], "RZMC_PRCNTL": [], "PRMC_PRCNTL": []
    })
    
    for row in data:
        month = row["date"][:7]  # YYYY-MM
        for var in ["SFMC", "RZMC", "RZMC_PRCNTL", "PRMC_PRCNTL"]:
            if row[var] is not None:
                monthly[month][var].append(row[var])
    
    result = []
    for month in sorted(monthly.keys()):
        mdata = monthly[month]
        record = {"month": month}
        for var in ["SFMC", "RZMC", "RZMC_PRCNTL", "PRMC_PRCNTL"]:
            values = mdata[var]
            if values:
                mean_val = sum(values) / len(values)
                record[f"{var}_mean"] = round(mean_val, 6)
                record[f"{var}_count"] = len(values)
            else:
                record[f"{var}_mean"] = None
                record[f"{var}_count"] = 0
        result.append(record)
    
    return result


def process_all_sites():
    """Main processing function."""
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Fetching NASA SMAP L4 data from POWER cloud store")
    print("=" * 60)
    
    # Open the store
    ds = open_store()
    
    print(f"\nDataset variables: {list(ds.data_vars)}")
    print(f"Dataset dimensions: {dict(ds.sizes)}")
    print(f"Lat range: {ds['lat'].values[0]} to {ds['lat'].values[-1]}")
    print(f"Lon range: {ds['lon'].values[0]} to {ds['lon'].values[-1]}")
    
    # Extract data for each site
    all_raw = {}
    
    for site_id, coords in SITES.items():
        raw = extract_site_data(ds, site_id, coords["lat"], coords["lon"])
        all_raw[site_id] = raw
        
        # Save raw extract
        raw_path = RAW_DIR / f"smap-{site_id}.json"
        with open(raw_path, "w") as f:
            json.dump(raw, f, indent=2)
        print(f"  Saved raw data to {raw_path}")
    
    # Close the store
    ds.close()
    print("\nStore closed.")
    
    # Build the output structure
    output = {
        "version": "1.0",
        "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "period": {"start": START, "end": END},
        "source": {
            "name": "NASA POWER SMAP L4",
            "description": "SMAP L4 Global Daily Soil Moisture and Temperature at 9 km",
            "store": STORE,
            "nativeResolution": "~9 km",
            "provenance": "MODELED",
            "note": "SMAP L4 is a model-assimilated product combining SMAP observations with land surface model simulations. SFMC_PRCNTL is not available in this dataset, so only RZMC_PRCNTL and PRMC_PRCNTL are included.",
        },
        "variables": {
            "SFMC": {
                "name": "Surface Soil Moisture",
                "description": "Volumetric soil moisture at 0-5 cm depth",
                "units": "m3/m3",
            },
            "RZMC": {
                "name": "Root Zone Soil Moisture",
                "description": "Volumetric soil moisture at 0-100 cm depth (root zone)",
                "units": "m3/m3",
            },
            "RZMC_PRCNTL": {
                "name": "Root Zone Soil Moisture Percentile",
                "description": "RZMC percentile relative to 2015-present climatology",
                "units": "%",
            },
            "PRMC_PRCNTL": {
                "name": "Profile Soil Moisture Percentile",
                "description": "PRMC percentile relative to 2015-present climatology",
                "units": "%",
            },
        },
        "sites": {},
    }
    
    # Process each site's data
    for site_id, raw in all_raw.items():
        site_data = raw["data"]
        
        # Filter to 2024 for daily
        daily_2024 = [r for r in site_data if r["date"].startswith("2024")]
        
        # Compute monthly for all years
        monthly_all = compute_monthly(site_data)
        
        output["sites"][site_id] = {
            "name": site_id,
            "location": {"lat": raw["lat"], "lon": raw["lon"]},
            "gridPoint": {"lat": raw["grid_point"]["lat"], "lon": raw["grid_point"]["lon"]},
            "daily": daily_2024,
            "monthly": monthly_all,
        }
    
    # Save output
    out_path = OUT_DIR / "smap.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\nSaved processed data to {out_path}")
    file_size_kb = out_path.stat().st_size / 1024
    print(f"File size: {file_size_kb:.1f} KB")
    
    # Report summary
    print("\n" + "=" * 60)
    print("Summary:")
    for site_id in SITES:
        site_out = output["sites"][site_id]
        print(f"  {site_id}: {len(site_out['daily'])} daily entries (2024), {len(site_out['monthly'])} monthly entries")
        
        # Check July 2024 RZMC mean
        july_2024 = [m for m in site_out["monthly"] if m["month"] == "2024-07"]
        if july_2024:
            rzmc_mean = july_2024[0].get("RZMC_mean")
            print(f"    July 2024 RZMC mean: {rzmc_mean}")
    
    # Check size constraint
    if file_size_kb > 600:
        print(f"\nWARNING: smap.json is {file_size_kb:.1f} KB, which exceeds the 600 KB limit!")
    else:
        print(f"\nOK: smap.json is {file_size_kb:.1f} KB, within 600 KB limit")
    
    return output


if __name__ == "__main__":
    process_all_sites()
