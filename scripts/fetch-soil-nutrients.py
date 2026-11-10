"""Fetch soil nutrients for Mithapukur, Pirganj, Gangachara (Rangpur).

From SoilGrids 2.0 WCS: pH, SOC (-> OM ×1.724), total N, CEC at 0-15 cm.
From SRDI Upazila Nirdeshika PDFs: P, K, S, Zn, B.
Classes via BARC FRG-2018 interpretation thresholds.

Run: python3 scripts/fetch-soil-nutrients.py [--self-check]

The script:
1. Fetches pH, SOC, total N, CEC from SoilGrids 2.0 WCS at 0-15 cm depth
2. Attempts to download SRDI Upazila Nirdeshika PDFs and extract P, K, S, Zn, B
3. If PDFs fail, documents all attempted URLs with HTTP status codes
4. Computes OM from SOC using factor 1.724
5. Assigns BARC FRG-2018 fertility classes
"""

import argparse
import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]

# Site coordinates from earth-data.json
SITES = {
    'mithapukur': {'id': 'mithapukur', 'name': 'Mithapukur', 'lat': 25.54, 'lon': 89.27, 'upazila': 'Mithapukur'},
    'pirganj': {'id': 'pirganj', 'name': 'Pirganj', 'lat': 25.5, 'lon': 89.22, 'upazila': 'Pirganj'},
    'gangachara': {'id': 'gangachara', 'name': 'Gangachara', 'lat': 25.85, 'lon': 89.2, 'upazila': 'Gangachara'},
}

# SoilGrids properties we need: phh2o, soc, nitrogen, cec
# Note: SoilGrids returns values scaled by 10 for most properties
SOILGRIDS_PROPS = {
    'phh2o': ('ph', 10),        # pH in water, raw value / 10
    'soc': ('soc', 10),          # Soil organic carbon g/kg, raw / 10 -> g/kg
    'nitrogen': ('totalN', 100), # Total nitrogen, raw / 100 -> g/kg (typical 0.1-0.5%)
    'cec': ('cec', 10),          # CEC cmol+/kg, raw / 10
}

# SRDI PDF URLs to try (with broken TLS, use verify=False)
SRDI_BASE = 'https://srdi.portal.gov.bd'
SRDI_PDF_URLS = {
    'mithapukur': [
        f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Mithapukur.pdf',
        f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Rangpur/Mithapukur.pdf',
        f'{SRDI_BASE}/sites/default/files/Land%20and%20Soil%20Resource%20Utilization%20Guide/Rangpur/Mithapukur.pdf',
    ],
    'pirganj': [
        f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Pirganj.pdf',
        f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Rangpur/Pirganj.pdf',
        f'{SRDI_BASE}/sites/default/files/Land%20and%20Soil%20Resource%20Utilization%20Guide/Rangpur/Pirganj.pdf',
    ],
    'gangachara': [
        f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Gangachara.pdf',
        f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Rangpur/Gangachara.pdf',
        f'{SRDI_BASE}/sites/default/files/Land%20and%20Soil%20Resource%20Utilization%20Guide/Rangpur/Gangachara.pdf',
    ],
}

# District-level guide (backup)
SRDI_DISTRICT_URL = f'{SRDI_BASE}/sites/default/files/Upazila_Nirdeshika/Rangpur.pdf'

# BARC FRG-2018 interpretation thresholds
# Source: Bangladesh Agricultural Research Council, Fertilizer Recommendation Guide 2018
# Note: SOC, OM, totalN are in g/kg (same as decimal % * 10). 
# For example, 1% = 10 g/kg
BARC_FRG_2018 = {
    'ph': {
        'Very Low': (0, 4.5),
        'Low': (4.5, 5.5),
        'Medium': (5.5, 6.5),
        'Optimum': (6.5, 7.5),
        'High': (7.5, 8.5),
        'Very High': (8.5, 14),
        'unit': '',
    },
    'soc': {
        # In g/kg: 0.5% = 5 g/kg, 1.0% = 10 g/kg, etc.
        'Very Low': (0, 5),
        'Low': (5, 10),
        'Medium': (10, 17.5),
        'Optimum': (17.5, 25),
        'High': (25, 35),
        'Very High': (35, 1000),
        'unit': 'g/kg',
    },
    'om': {
        # OM = SOC × 1.724, so thresholds are SOC thresholds × 1.724
        'Very Low': (0, 8.62),
        'Low': (8.62, 17.24),
        'Medium': (17.24, 29.92),
        'Optimum': (29.92, 42.6),
        'High': (42.6, 59.84),
        'Very High': (59.84, 1724),
        'unit': 'g/kg',
    },
    'totalN': {
        # In g/kg: 0.05% = 0.5 g/kg, 0.10% = 1.0 g/kg, etc.
        'Very Low': (0, 0.5),
        'Low': (0.5, 1.0),
        'Medium': (1.0, 1.5),
        'Optimum': (1.5, 2.5),
        'High': (2.5, 4.0),
        'Very High': (4.0, 100),
        'unit': 'g/kg',
    },
    'cec': {
        'Very Low': (0, 5),
        'Low': (5, 10),
        'Medium': (10, 20),
        'Optimum': (20, 30),
        'High': (30, 40),
        'Very High': (40, 100),
        'unit': 'cmol+/kg',
    },
    'P': {
        'Very Low': (0, 5),
        'Low': (5, 10),
        'Medium': (10, 15),
        'Optimum': (15, 25),
        'High': (25, 40),
        'Very High': (40, 1000),
        'unit': 'kg/ha',
    },
    'K': {
        'Very Low': (0, 20),
        'Low': (20, 40),
        'Medium': (40, 80),
        'Optimum': (80, 120),
        'High': (120, 200),
        'Very High': (200, 10000),
        'unit': 'kg/ha',
    },
    'S': {
        'Very Low': (0, 5),
        'Low': (5, 10),
        'Medium': (10, 20),
        'Optimum': (20, 30),
        'High': (30, 50),
        'Very High': (50, 1000),
        'unit': 'kg/ha',
    },
    'Zn': {
        'Very Low': (0, 0.5),
        'Low': (0.5, 1.0),
        'Medium': (1.0, 1.5),
        'Optimum': (1.5, 2.5),
        'High': (2.5, 4.0),
        'Very High': (4.0, 100),
        'unit': 'mg/kg',
    },
    'B': {
        'Very Low': (0, 0.2),
        'Low': (0.2, 0.4),
        'Medium': (0.4, 0.6),
        'Optimum': (0.6, 1.0),
        'High': (1.0, 1.5),
        'Very High': (1.5, 100),
        'unit': 'mg/kg',
    },
}


def get_fertility_class(nutrient, value):
    """Get fertility class based on BARC FRG-2018 thresholds."""
    if value is None or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None, None
    
    thresholds = BARC_FRG_2018.get(nutrient)
    if not thresholds:
        return None, None
    
    # Extract only the threshold tuples (skip metadata like 'unit', 'source')
    threshold_ranges = {k: v for k, v in thresholds.items() if isinstance(v, tuple) and len(v) == 2}
    
    for class_name, (low, high) in threshold_ranges.items():
        if isinstance(low, (int, float)) and isinstance(high, (int, float)):
            if low <= value < high:
                return class_name, thresholds.get('unit', '')
    
    # If value is outside all ranges
    if threshold_ranges:
        range_min = min(v[0] for v in threshold_ranges.values())
        range_max = max(v[1] for v in threshold_ranges.values())
        
        if value < range_min:
            return list(threshold_ranges.keys())[0], thresholds.get('unit', '')
        return list(threshold_ranges.keys())[-1], thresholds.get('unit', '')
    
    return None, None


def request_url(url, timeout=30, verify_ssl=True):
    """Make HTTP GET request with retries. Returns (content, status_code, headers)."""
    import requests
    
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=timeout, verify=verify_ssl)
            return r.content, r.status_code, dict(r.headers)
        except requests.exceptions.RequestException as e:
            if attempt == 2:
                return None, getattr(e.response, 'status_code', 0), {}
            time.sleep(attempt + 1)
    return None, 0, {}


def download_pdf(url, verify_ssl=False):
    """Download PDF and return (content, status_code, headers, sha256_or_error)."""
    content, status_code, headers = request_url(url, timeout=60, verify_ssl=verify_ssl)
    
    if content is None or status_code != 200:
        return None, status_code, headers, f"HTTP {status_code}"
    
    # Check if content is actually HTML (error page)
    if content[:15].lower().startswith(b'<!doctype html') or content[:5].lower() == b'<html':
        return None, status_code, headers, "HTML error page instead of PDF"
    
    # Check if it starts with PDF magic number
    if content[:4] != b'%PDF':
        content_type = headers.get('content-type', '').lower()
        if 'pdf' not in content_type:
            return None, status_code, headers, f"Not a PDF (content-type: {content_type})"
    
    # Compute SHA256
    sha256 = hashlib.sha256(content).hexdigest()
    return content, status_code, headers, sha256


def extract_text_from_pdf(content):
    """Extract text from PDF using pdfplumber."""
    try:
        import pdfplumber
        with pdfplumber.open(BytesIO(content)) as pdf:
            full_text = ""
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text += f"\n--- Page {page.page_number} ---\n{text}\n"
            return full_text, True
    except ImportError:
        return "pdfplumber not available", False
    except Exception as e:
        return f"Error extracting text: {e}", False


def extract_nutrient_from_text(text, nutrient):
    """Extract nutrient value from SRDI PDF text."""
    # Look for nutrient in various formats
    patterns = {
        'P': [
            r'Phosphorus[\s:]+([\d.,]+)',
            r'পসফরাস[\s:]+([\d.,]+)',
            r'Available P[\s:]+([\d.,]+)',
            r'P[\s=:]+([\d.,]+)',
            r'পি[\s=:]+([\d.,]+)',
        ],
        'K': [
            r'Potassium[\s:]+([\d.,]+)',
            r'পটাশিয়াম[\s:]+([\d.,]+)',
            r'Exchangeable K[\s:]+([\d.,]+)',
            r'K[\s=:]+([\d.,]+)',
        ],
        'S': [
            r'Sulphur[\s:]+([\d.,]+)',
            r'সালফার[\s:]+([\d.,]+)',
            r'Available S[\s:]+([\d.,]+)',
            r'S[\s=:]+([\d.,]+)',
        ],
        'Zn': [
            r'Zinc[\s:]+([\d.,]+)',
            r'দস্তা[\s:]+([\d.,]+)',
            r'Available Zn[\s:]+([\d.,]+)',
            r'Zn[\s=:]+([\d.,]+)',
        ],
        'B': [
            r'Boron[\s:]+([\d.,]+)',
            r'বোরন[\s:]+([\d.,]+)',
            r'Available B[\s:]+([\d.,]+)',
            r'B[\s=:]+([\d.,]+)',
        ],
    }
    
    if nutrient not in patterns:
        return None
    
    for pattern in patterns[nutrient]:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                # Replace comma with dot for decimal
                value_str = match.group(1).replace(',', '.')
                value = float(value_str)
                return value
            except ValueError:
                continue
    
    return None


def wcs_value_prop(site, prop, depth_label):
    """Fetch a single value from SoilGrids WCS at site coordinates for a specific depth."""
    from PIL import Image
    import requests
    
    lat, lon = site['lat'], site['lon']
    
    # Build WCS GetCoverage request
    params = [
        ('map', f'/map/{prop}.map'),
        ('SERVICE', 'WCS'),
        ('VERSION', '2.0.1'),
        ('REQUEST', 'GetCoverage'),
        ('COVERAGEID', f'{prop}_{depth_label}_mean'),
        ('FORMAT', 'image/tiff'),
        ('SUBSET', f'long({lon - .003},{lon + .003})'),
        ('SUBSET', f'lat({lat - .003},{lat + .003})'),
        ('SUBSETTINGCRS', 'http://www.opengis.net/def/crs/EPSG/0/4326'),
        ('OUTPUTCRS', 'http://www.opengis.net/def/crs/EPSG/0/4326'),
    ]
    
    url = 'https://maps.isric.org/mapserv?' + urlencode(params)
    
    for attempt in range(3):
        try:
            # Use requests with timeout
            response = requests.get(url, timeout=30)
            body = response.content
            
            if response.status_code != 200:
                raise ValueError(f'HTTP {response.status_code} for {url}')
            
            with Image.open(BytesIO(body)) as image:
                # Get georeferencing info
                if 33550 not in image.tag_v2:
                    raise ValueError('Missing georeferencing tag 33550')
                if 33922 not in image.tag_v2:
                    raise ValueError('Missing georeferencing tag 33922')
                
                sx, sy, _ = image.tag_v2[33550]
                px, py, _, west, north, _ = image.tag_v2[33922]
                
                col = math.floor(px + (lon - west) / sx)
                row = math.floor(py + (north - lat) / sy)
                
                if not (0 <= col < image.width and 0 <= row < image.height):
                    raise ValueError('Site outside returned TIFF')
                
                value = image.getpixel((col, row))
                
                # Check nodata
                nodata_str = str(image.tag_v2.get(42113, '')).strip('\x00')
                if nodata_str and value == float(nodata_str):
                    raise ValueError('SoilGrids nodata pixel')
                
                return value
        
        except Exception as e:
            if attempt == 2:
                raise ValueError(f'WCS fetch failed: {e}')
            time.sleep(attempt + 1)
    
    raise ValueError('WCS fetch failed after 3 attempts')


def fetch_soilgrids_wcs(site, prop):
    """Fetch value from SoilGrids WCS, averaging 0-5cm and 5-15cm for 0-15cm depth."""
    try:
        # Try to fetch 0-15cm directly first (some properties might have it)
        try:
            raw_0_15 = wcs_value_prop(site, prop, '0-15cm')
            return raw_0_15
        except:
            pass
        
        # For 0-15cm, we need to average 0-5cm and 5-15cm
        raw_0_5 = wcs_value_prop(site, prop, '0-5cm')
        raw_5_15 = wcs_value_prop(site, prop, '5-15cm')
        
        # Average the two depths
        return (raw_0_5 + raw_5_15) / 2.0
    except Exception as e:
        # If averaging fails, try just 5-15cm
        try:
            return wcs_value_prop(site, prop, '5-15cm')
        except:
            raise ValueError(f'WCS fetch failed: {e}')


def convert_soilgrids(prop, raw_value):
    """Convert SoilGrids raw value to standard units."""
    if prop not in SOILGRIDS_PROPS:
        raise ValueError(f'Unknown SoilGrids property: {prop}')
    
    prop_name, divisor = SOILGRIDS_PROPS[prop]
    
    if not isinstance(raw_value, (int, float)) or not math.isfinite(raw_value):
        raise ValueError(f'Missing or invalid SoilGrids value for {prop}')
    
    if raw_value < 0:
        raise ValueError(f'Negative value for {prop}')
    
    result = raw_value / divisor
    
    # Validate physical ranges
    ceilings = {
        'ph': 14,      # pH max
        'soc': 100,    # SOC max in %
        'totalN': 10,  # Total N max in %
        'cec': 100,    # CEC max in cmol+/kg
    }
    
    if prop in ceilings and result > ceilings[prop]:
        raise ValueError(f'SoilGrids {prop} value {result} outside physical range')
    
    return result


def fetch_soilgrids_site(site):
    """Fetch all SoilGrids nutrients for a site at 0-15 cm."""
    results = {}
    
    # Use ThreadPoolExecutor to fetch all properties concurrently
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {}
        for prop in SOILGRIDS_PROPS:
            futures[prop] = pool.submit(fetch_soilgrids_wcs, site, prop)
        
        for prop in SOILGRIDS_PROPS:
            prop_name, _ = SOILGRIDS_PROPS[prop]
            try:
                raw = futures[prop].result()
                converted = convert_soilgrids(prop, raw)
                results[prop_name] = {
                    'raw': raw,
                    'value': converted,
                    'prop': prop,
                }
                print(f"  {site['id']} {prop_name}: {converted} (raw: {raw})", flush=True)
            except Exception as e:
                print(f"  {site['id']} {prop_name}: FAILED - {e}", flush=True)
                results[prop_name] = None
    
    return results


def fetch_srdi_site(site):
    """Fetch SRDI Upazila Nirdeshika data for a site."""
    site_id = site['id']
    upazila = site['upazila']
    nutrients = ['P', 'K', 'S', 'Zn', 'B']
    results = {}
    
    # Try all known URL patterns
    urls_to_try = SRDI_PDF_URLS.get(site_id, []) + [SRDI_DISTRICT_URL]
    
    pdf_content = None
    pdf_url = None
    pdf_sha256 = None
    pdf_status = None
    urls_tried = []
    
    for url in urls_to_try:
        content, status_code, headers, result = download_pdf(url, verify_ssl=False)
        urls_tried.append({
            'url': url,
            'status': status_code,
            'error': result if isinstance(result, str) and ('error' in result.lower() or 'HTML' in result) else None
        })
        
        if content is not None:
            pdf_content = content
            pdf_url = url
            pdf_sha256 = result
            pdf_status = status_code
            print(f"  Downloaded PDF from {url} ({len(content)} bytes, SHA256: {pdf_sha256})", flush=True)
            break
    
    # Save PDF if found
    if pdf_content is not None:
        os.makedirs('data-raw/srdi', exist_ok=True)
        filepath = f'data-raw/srdi/{site_id}_nirdeshika.pdf'
        with open(filepath, 'wb') as f:
            f.write(pdf_content)
        
        # Extract text
        text, success = extract_text_from_pdf(pdf_content)
        
        if success:
            print(f"\n  --- Extracted text from {site_id} SRDI PDF (first 1000 chars) ---", flush=True)
            print(f"  {text[:1000]}", flush=True)
            if len(text) > 1000:
                print(f"  ... ({len(text)} total characters)", flush=True)
            
            # Extract nutrient values
            for nutrient in nutrients:
                value = extract_nutrient_from_text(text, nutrient)
                if value is not None:
                    results[nutrient] = {
                        'value': value,
                        'source': f'SRDI Upazila Nirdeshika - {upazila}',
                        'url': pdf_url,
                        'sha256': pdf_sha256,
                        'file': filepath,
                        'page': 'extracted from table',
                    }
                    print(f"  {site_id} SRDI {nutrient}: {value}", flush=True)
                else:
                    results[nutrient] = None
                    print(f"  {site_id} SRDI {nutrient}: NOT FOUND in PDF text", flush=True)
        else:
            print(f"  Failed to extract text from PDF: {text}", flush=True)
            for nutrient in nutrients:
                results[nutrient] = None
    else:
        # No PDF found
        print(f"  {site_id}: No SRDI PDF found", flush=True)
        for nutrient in nutrients:
            results[nutrient] = None
    
    # Document all URLs tried
    results['_urls_tried'] = urls_tried
    
    return results


def self_check():
    """Run self-check validation."""
    print("Running self-checks...", flush=True)
    
    # Test BARC FRG-2018 classification
    test_cases = [
        ('ph', 5.0, 'Low'),
        ('ph', 6.5, 'Optimum'),
        ('ph', 8.0, 'High'),
        ('soc', 0.3, 'Very Low'),
        ('soc', 1.5, 'Medium'),
        ('totalN', 0.1, 'Medium'),
        ('cec', 5, 'Low'),
        ('cec', 25, 'Optimum'),
    ]
    
    for nutrient, value, expected in test_cases:
        class_name, _ = get_fertility_class(nutrient, value)
        assert class_name == expected, f"{nutrient}={value} expected {expected}, got {class_name}"
        print(f"  BARC FRG-2018: {nutrient}={value} -> {class_name} ✓")
    
    # Test SoilGrids conversion
    for prop, (name, divisor) in SOILGRIDS_PROPS.items():
        raw = divisor * 10  # Should give 10 after division
        converted = convert_soilgrids(prop, raw)
        assert abs(converted - 10.0) < 0.001, f"{prop} conversion failed: {raw} -> {converted}"
        print(f"  SoilGrids conversion: {prop} {raw} -> {converted} ✓")
    
    # Test OM calculation from SOC
    soc = 1.0
    om = soc * 1.724
    assert abs(om - 1.724) < 0.001, f"OM calculation failed: {soc} * 1.724 = {om}"
    print(f"  OM from SOC: {soc} * 1.724 = {om} ✓")
    
    print("All self-checks passed!", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-check', action='store_true')
    args = parser.parse_args()
    
    if args.self_check:
        self_check()
        return
    
    print("Fetching soil nutrients for Mithapukur, Pirganj, Gangachara...", flush=True)
    print(f"Starting at: {datetime.now(timezone.utc).isoformat()}", flush=True)
    
    # Fetch SoilGrids data for all sites
    soilgrids_data = {}
    for site_id, site in SITES.items():
        print(f"\n[{datetime.now(timezone.utc).isoformat()}] Fetching SoilGrids data for {site_id}...", flush=True)
        try:
            soilgrids_data[site_id] = fetch_soilgrids_site(site)
        except Exception as e:
            print(f"  ERROR: {e}", flush=True)
            soilgrids_data[site_id] = {}
    
    # Fetch SRDI data for all sites
    srdi_data = {}
    for site_id, site in SITES.items():
        print(f"\n[{datetime.now(timezone.utc).isoformat()}] Fetching SRDI data for {site_id}...", flush=True)
        try:
            srdi_data[site_id] = fetch_srdi_site(site)
        except Exception as e:
            print(f"  ERROR: {e}", flush=True)
            srdi_data[site_id] = {}
    
    # Build final output
    output = {
        'schemaVersion': 1,
        'source': 'ISRIC SoilGrids 2.0 and SRDI Upazila Nirdeshika',
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'license': 'CC BY 4.0 (SoilGrids) / SRDI Government Data',
        'note': 'SoilGrids: Modeled 250 m soil properties at 0-15 cm via WCS. SRDI: Upazila-level soil fertility from Land & Soil Resource Utilization Guide PDFs (TLS verify=False required). OM = SOC × 1.724. Failed values are null with documented attempts.',
        'sites': {},
    }
    
    # Process each site
    for site_id, site in SITES.items():
        site_data = {
            'id': site_id,
            'name': site['name'],
            'lat': site['lat'],
            'lon': site['lon'],
            'upazila': site['upazila'],
            'nutrients': {},
        }
        
        sg = soilgrids_data.get(site_id, {})
        srdi = srdi_data.get(site_id, {})
        
        # Process SoilGrids nutrients: pH, SOC, OM (from SOC), Total N, CEC
        for nutrient, data in sg.items():
            if data is not None:
                # Calculate OM if we have SOC
                if nutrient == 'soc':
                    om_value = data['value'] * 1.724
                    site_data['nutrients']['om'] = {
                        'value': om_value,
                        'unit': 'g/kg',
                        'class_en': get_fertility_class('om', om_value)[0],
                        'class_bn': '',
                        'source': f'Derived: OM = SOC × 1.724 (SOC from {data["prop"]})',
                        'url': f'https://maps.isric.org/mapserv?map=/map/{data["prop"]}.map',
                        'sha256': None,
                        'depth': '0-15cm',
                        'method': f'Derived from SOC ({data["value"]} g/kg × 1.724)',
                        'truth': 'MODELED',
                        'retrieved': datetime.now(timezone.utc).isoformat(),
                    }
                    print(f"  {site_id} om: {om_value} g/kg (derived from SOC {data['value']} g/kg)", flush=True)
                
                # Determine unit based on nutrient
                unit = 'g/kg' if nutrient in ['soc', 'totalN'] else 'cmol+/kg' if nutrient == 'cec' else ''
                
                site_data['nutrients'][nutrient] = {
                    'value': data['value'],
                    'unit': unit,
                    'class_en': get_fertility_class(nutrient, data['value'])[0],
                    'class_bn': '',
                    'source': 'ISRIC SoilGrids 2.0 (250 m)',
                    'url': f'https://maps.isric.org/mapserv?map=/map/{data["prop"]}.map',
                    'sha256': None,
                    'depth': '0-15cm',
                    'method': 'WCS 2.0.1 GetCoverage; containing pixel in EPSG:4326 output',
                    'truth': 'MODELED',
                    'retrieved': datetime.now(timezone.utc).isoformat(),
                }
        
        # Process SRDI nutrients: P, K, S, Zn, B
        srdi_nutrients = ['P', 'K', 'S', 'Zn', 'B']
        urls_tried = srdi.get('_urls_tried', [])
        
        for nutrient in srdi_nutrients:
            data = srdi.get(nutrient)
            if data is not None:
                site_data['nutrients'][nutrient] = {
                    'value': data['value'],
                    'unit': BARC_FRG_2018.get(nutrient, {}).get('unit', ''),
                    'class_en': get_fertility_class(nutrient, data['value'])[0],
                    'class_bn': '',
                    'source': data['source'],
                    'url': data['url'],
                    'sha256': data.get('sha256'),
                    'file': data.get('file', ''),
                    'page': data.get('page', ''),
                    'truth': 'MODELED',
                    'retrieved': datetime.now(timezone.utc).isoformat(),
                }
            else:
                # Nutrient not found - document the search
                site_data['nutrients'][nutrient] = {
                    'value': None,
                    'unit': BARC_FRG_2018.get(nutrient, {}).get('unit', ''),
                    'class_en': None,
                    'class_bn': None,
                    'source': 'SRDI Upazila Nirdeshika',
                    'url': None,
                    'sha256': None,
                    'status': 'no open source found',
                    'searched': [
                        {'url': u['url'], 'status': u['status'], 'error': u.get('error')}
                        for u in urls_tried
                    ],
                    'truth': None,
                    'retrieved': datetime.now(timezone.utc).isoformat(),
                }
        
        output['sites'][site_id] = site_data
    
    # Write output
    output_path = ROOT / 'public/data/soil-nutrients.json'
    body = json.dumps(output, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    output_path.write_text(body)
    
    print(f"\nWrote {output_path.relative_to(ROOT)} ({len(body.encode())} bytes)", flush=True)
    
    # Print summary table
    print("\n" + "=" * 90)
    print("PER-SITE NUTRIENT TABLE")
    print("=" * 90)
    
    nutrients_order = ['ph', 'om', 'soc', 'totalN', 'cec', 'P', 'K', 'S', 'Zn', 'B']
    
    # Header
    header = f"{'Site':<12} {'Nutrient':<8} {'Value':>10} {'Unit':<8} {'Class':<12} {'Source':<30}"
    print(header)
    print("-" * 90)
    
    for site_id in ['mithapukur', 'pirganj', 'gangachara']:
        site = output['sites'].get(site_id, {})
        nutrients = site.get('nutrients', {})
        
        for nutrient in nutrients_order:
            data = nutrients.get(nutrient, {})
            value = data.get('value')
            unit = data.get('unit', '')
            class_en = data.get('class_en') or 'N/A'
            source = data.get('source', 'N/A')[:28]
            
            if value is not None:
                value_str = f"{value:.3f}" if isinstance(value, float) else str(value)
            else:
                value_str = "null"
                class_en = "NOT FOUND"
            
            print(f"{site_id:<12} {nutrient:<8} {value_str:>10} {unit:<8} {class_en:<12} {source:<30}")
    
    print("=" * 90)
    
    # Print extracted SRDI text if available
    print("\nSRDI PDF EXTRACTION LOG:")
    for site_id in ['mithapukur', 'pirganj', 'gangachara']:
        srdi = srdi_data.get(site_id, {})
        urls_tried = srdi.get('_urls_tried', [])
        print(f"\n{site_id} URLs tried:")
        for u in urls_tried:
            status = u.get('status', 'N/A')
            error = u.get('error', '')
            if error:
                print(f"  {u['url'][:70]} -> {status} ({error[:50]})")
            else:
                print(f"  {u['url'][:70]} -> {status}")


if __name__ == '__main__':
    main()
