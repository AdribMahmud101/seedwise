// Net cultivable area calculation (spec #1, F18 "koto tuku jaygay chash kora jabe")
import { mean } from './engine.js';

export const DEFAULT_NET_INPUTS = {
  bundWidthM: 0.3,
  drainWidthM: 0,
  pathWidthM: 0,
  otherDecimals: 0,
};

export function polygonPerimeterM(points) {
  if (!points || points.length < 2) return 0;
  const latitude = (mean(points.map((p) => p[0])) * Math.PI) / 180;
  const [originLat, originLon] = points[0];
  const local = points.map(([lat, lon]) => [
    (lon - originLon) * 111195.08 * Math.cos(latitude),
    (lat - originLat) * 111195.08,
  ]);
  let perim = 0;
  for (let i = 0; i < local.length; i++) {
    const [x1, y1] = local[i];
    const [x2, y2] = local[(i + 1) % local.length];
    perim += Math.hypot(x2 - x1, y2 - y1);
  }
  return perim;
}

export function netArea(grossHa, perimeterM, inputs = {}) {
  const bundWidthM = Math.max(0, Number(inputs.bundWidthM ?? DEFAULT_NET_INPUTS.bundWidthM) || 0);
  const drainWidthM = Math.max(0, Number(inputs.drainWidthM ?? DEFAULT_NET_INPUTS.drainWidthM) || 0);
  const pathWidthM = Math.max(0, Number(inputs.pathWidthM ?? DEFAULT_NET_INPUTS.pathWidthM) || 0);
  const otherDecimals = Math.max(0, Number(inputs.otherDecimals ?? DEFAULT_NET_INPUTS.otherDecimals) || 0);

  const grossM2 = Math.max(0, (Number(grossHa) || 0) * 10000);
  const p = Math.max(0, Number(perimeterM) || 0);

  // Perimeter strip (bund + drain) along the perimeter with corner-overlap correction
  const perimeterStripWidth = bundWidthM + drainWidthM;
  let perimeterStripLossM2 = 0;

  // Maximum effective strip width before opposing boundaries meet (for square: side/2 = (p/4)/2 = p/8)
  const maxStripWidth = p > 0 ? p / 8 : 0;
  if (perimeterStripWidth >= maxStripWidth || (perimeterStripWidth * p - 4 * (perimeterStripWidth ** 2)) >= grossM2) {
    perimeterStripLossM2 = grossM2;
  } else {
    perimeterStripLossM2 = Math.min(grossM2, Math.max(0, perimeterStripWidth * p - 4 * (perimeterStripWidth ** 2)));
  }

  // Path as an extra strip along perimeter
  const pathLossM2 = pathWidthM * p;

  // Other non-cultivable deductions directly in decimals (1 ha = 247.105381 decimals => 1 decimal = 10000 / 247.105381 m²)
  const otherLossM2 = otherDecimals * (10000 / 247.105381);

  const totalLossM2 = perimeterStripLossM2 + pathLossM2 + otherLossM2;
  const netM2 = Math.max(0, grossM2 - totalLossM2);
  const netHa = netM2 / 10000;
  const lossPct = grossM2 > 0 ? ((grossM2 - netM2) / grossM2) * 100 : 0;
  const netPct = grossM2 > 0 ? (netM2 / grossM2) * 100 : 0;

  return {
    grossHa,
    perimeterM: p,
    netHa,
    netPct,
    lossPct,
    lossM2: grossM2 - netM2,
    inputs: {
      bundWidthM,
      drainWidthM,
      pathWidthM,
      otherDecimals,
    },
  };
}
