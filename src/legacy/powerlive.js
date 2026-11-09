/**
 * Live NASA POWER and GPM IMERG weather data ingestion and processing.
 * Ports logic from scripts/fetch-earth-data.py to JavaScript.
 * Calculates FAO-56 daily Penman-Monteith reference evapotranspiration (ETo),
 * monthly summaries, and QA disagreement statistics.
 */

export const POWER_API_BASE = "https://power.larc.nasa.gov/api/temporal/daily/point";

export const MET_PARAMETERS = "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETTOP,GWETROOT,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PS";
export const GPM_PARAMETERS = "IMERG_PRECTOT";

export const PARAMETER_MAP = {
  T2M: "tmean",
  T2M_MAX: "tmax",
  T2M_MIN: "tmin",
  PRECTOTCORR: "rainPower",
  GWETTOP: "wetness",
  GWETROOT: "rootWetness",
  RH2M: "humidity",
  WS2M: "wind",
  ALLSKY_SFC_SW_DWN: "solar",
  PS: "pressure",
  IMERG_PRECTOT: "rainGpm",
};

export function isValid(x) {
  return typeof x === "number" && Number.isFinite(x) && x !== -999;
}

export function avg(values) {
  const v = values.filter(isValid);
  if (!v.length) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  return Math.round((sum / v.length) * 10000) / 10000;
}

export function total(values) {
  const v = values.filter(isValid);
  if (!v.length) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  return Math.round(sum * 1000) / 1000;
}

export function sampleStandardDeviation(arr) {
  if (arr.length <= 1) return null;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((acc, val) => acc + (val - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/**
 * FAO-56 daily Penman–Monteith, RHmean approximation, G=0.
 *
 * @param {Object} row {date, tmean, tmax, tmin, humidity, wind, solar, pressure}
 * @param {number} lat Latitude in degrees
 * @param {number} elevation Elevation in meters
 * @returns {number|null} ETo in mm/day or null
 */
export function referenceEt0(row, lat, elevation = 0) {
  const names = ["tmean", "tmax", "tmin", "humidity", "wind", "solar", "pressure"];
  if (!names.every((k) => isValid(row[k]))) return null;

  const [t, tx, tn, rh, u2, rs, p] = names.map((k) => row[k]);
  if (!(0 <= rh && rh <= 100 && 0 <= u2 && 0 <= rs && 50 < p && p < 120)) {
    return null;
  }

  // Day of year j from ISO date (e.g. '2024-01-15')
  const [yearStr, monthStr, dayStr] = row.date.split("-").map(Number);
  const curDate = new Date(Date.UTC(yearStr, monthStr - 1, dayStr));
  const startOfYear = new Date(Date.UTC(yearStr, 0, 1));
  const j = Math.floor((curDate - startOfYear) / 86400000) + 1;

  const phi = (lat * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * j) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * j) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl))));
  const ra = ((24 * 60) / Math.PI) * 0.0820 * dr * (
    ws * Math.sin(phi) * Math.sin(decl) +
    Math.cos(phi) * Math.cos(decl) * Math.sin(ws)
  );
  const rso = (0.75 + 0.00002 * elevation) * ra;

  const e = (temp) => 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
  const es = (e(tx) + e(tn)) / 2;
  const ea = (es * rh) / 100;
  const rns = 0.77 * rs;

  const ratio = rso > 0 ? Math.max(0.3, Math.min(1, rs / rso)) : 0.3;
  const rnl = (4.903e-9 * ((tx + 273.16) ** 4 + (tn + 273.16) ** 4)) / 2 *
    (0.34 - 0.14 * Math.sqrt(ea)) *
    (1.35 * ratio - 0.35);
  const rn = rns - rnl;
  const slope = (4098 * e(t)) / ((t + 237.3) ** 2);
  const gamma = 0.000665 * p;
  const eto = ((0.408 * slope * rn) + (gamma * (900 / (t + 273)) * u2 * (es - ea))) /
    (slope + gamma * (1 + 0.34 * u2));

  return Math.round(Math.max(0, eto) * 1000) / 1000;
}

export function qa(daily) {
  const pairs = daily
    .filter((r) => isValid(r.rainPower) && isValid(r.rainGpm))
    .map((r) => [r.rainPower, r.rainGpm]);

  const diffs = pairs.map(([a, b]) => a - b);
  const meanDiff = avg(diffs);
  const sd = sampleStandardDeviation(diffs);
  const half = sd !== null && diffs.length > 0 ? (1.96 * sd) / Math.sqrt(diffs.length) : null;

  const checkedKeys = ["rainPower", "rainGpm", "wetness", "rootWetness", "tmean", "et0"];
  const missing = {};
  for (const k of checkedKeys) {
    missing[k] = daily.reduce((count, r) => count + (!isValid(r[k]) ? 1 : 0), 0);
  }

  const missingPercent = {};
  for (const k of checkedKeys) {
    missingPercent[k] = daily.length > 0
      ? Math.round((100 * missing[k]) / daily.length * 100) / 100
      : 0;
  }

  const rmse = diffs.length
    ? Math.round(Math.sqrt(diffs.reduce((acc, x) => acc + x * x, 0) / diffs.length) * 1000) / 1000
    : null;

  return {
    pairedDays: pairs.length,
    meanDifferenceMm: meanDiff,
    maeMm: avg(diffs.map((x) => Math.abs(x))),
    rmseMm: rmse,
    meanDifference95CI: half !== null ? [
      Math.round((meanDiff - half) * 1000) / 1000,
      Math.round((meanDiff + half) * 1000) / 1000,
    ] : null,
    missingDays: missing,
    missingPercent,
    differenceDirection: "POWER minus GPM",
    interpretation: "Inter-product disagreement, not measured bias. Neither product is ground truth. The mean-difference interval assumes independent daily differences; temporal correlation may make it too narrow.",
    cloudMaskLoss: null,
    cloudMaskNote: "Not measured for the contextual imagery tiles. Scene cloud percentage is not parcel cloud-mask loss.",
  };
}

export function summarize(daily) {
  const months = Array.from(new Set(daily.map((r) => r.date.slice(0, 7)))).sort();
  const result = [];
  for (const month of months) {
    const rows = daily.filter((r) => r.date.startsWith(month));
    const record = {
      month,
      days: rows.length,
    };
    for (const k of ["tmean", "tmax", "tmin", "wetness", "rootWetness", "humidity", "wind"]) {
      record[k] = avg(rows.map((r) => r[k]));
    }
    for (const k of ["rainPower", "rainGpm", "et0"]) {
      record[k] = total(rows.map((r) => r[k]));
    }
    record.validDays = {
      tmean: rows.filter((r) => isValid(r.tmean)).length,
      rainPower: rows.filter((r) => isValid(r.rainPower)).length,
      rainGpm: rows.filter((r) => isValid(r.rainGpm)).length,
      wetness: rows.filter((r) => isValid(r.wetness)).length,
      rootWetness: rows.filter((r) => isValid(r.rootWetness)).length,
      et0: rows.filter((r) => isValid(r.et0)).length,
    };
    record.qa = qa(rows);
    result.push(record);
  }
  return result;
}

export function processPowerResponses(metObj, gpmObj, lat, lon) {
  const mp = metObj?.properties?.parameter || {};
  const gp = gpmObj?.properties?.parameter || {};

  const keys = Array.from(
    new Set([
      ...Object.values(mp).flatMap((param) => Object.keys(param)),
      ...Object.values(gp).flatMap((param) => Object.keys(param)),
    ]),
  ).sort();

  const elevation = metObj?.geometry?.coordinates?.[2] || 0;
  const solarUnit = metObj?.parameters?.ALLSKY_SFC_SW_DWN?.units || "";

  const daily = [];
  for (const date of keys) {
    const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const row = { date: isoDate };
    for (const [variable, key] of Object.entries(PARAMETER_MAP)) {
      const collection = variable.startsWith("IMERG") ? gp : mp;
      const value = collection[variable]?.[date];
      row[key] = isValid(value) ? value : null;
    }
    if (row.solar !== null && solarUnit.includes("kW")) {
      row.solar *= 3.6;
    }
    row.et0 = referenceEt0(row, lat, elevation);
    daily.append ? daily.append(row) : daily.push(row);
  }

  const monthly = summarize(daily);
  return {
    daily,
    monthly,
    qa: qa(daily),
    elevation,
  };
}

export function buildPowerUrl(lon, lat, parameters, start = "20240101", end = "20241231") {
  const params = new URLSearchParams({
    parameters,
    community: "AG",
    longitude: String(lon),
    latitude: String(lat),
    start,
    end,
    format: "JSON",
    "time-standard": "UTC",
  });
  return `${POWER_API_BASE}?${params.toString()}`;
}

export const POWER_CACHE_PREFIX = "ropon-radar.power.";

export function getCachedPower(fieldId) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${POWER_CACHE_PREFIX}${fieldId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedPower(fieldId, data) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(`${POWER_CACHE_PREFIX}${fieldId}`, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export async function fetchLivePower(field, fetchFn = fetch) {
  const { id, lat, lon } = field;
  const cached = getCachedPower(id);
  if (cached && cached.monthly && cached.monthly.length > 0) {
    return cached;
  }

  const isOnline = typeof navigator !== "undefined" && "onLine" in navigator ? !!navigator.onLine : true;
  if (!isOnline) {
    const err = new Error("Needs internet connection to fetch NASA weather data");
    err.offline = true;
    throw err;
  }

  const metUrl = buildPowerUrl(lon, lat, MET_PARAMETERS);
  const gpmUrl = buildPowerUrl(lon, lat, GPM_PARAMETERS);

  let metResp, gpmResp;
  try {
    [metResp, gpmResp] = await Promise.all([
      fetchFn(metUrl).then((r) => {
        if (!r.ok) throw new Error(`POWER meteorology HTTP ${r.status}`);
        return r.json();
      }),
      fetchFn(gpmUrl).then((r) => {
        if (!r.ok) throw new Error(`GPM IMERG HTTP ${r.status}`);
        return r.json();
      }).catch((err) => {
        return { properties: { parameter: {} }, error: String(err) };
      }),
    ]);
  } catch (err) {
    throw new Error(`NASA POWER request failed: ${err.message}`);
  }

  if (!metResp?.properties?.parameter) {
    throw new Error("Invalid POWER response structure");
  }

  const processed = processPowerResponses(metResp, gpmResp, lat, lon);
  const result = {
    monthly: processed.monthly,
    daily: processed.daily,
    qa: processed.qa,
    elevation: processed.elevation,
    retrievedAt: new Date().toISOString(),
    requestUrls: [metUrl, gpmUrl],
    source: "NASA POWER (MERRA-2) & NASA GPM IMERG via POWER API",
  };

  setCachedPower(id, result);
  return result;
}
