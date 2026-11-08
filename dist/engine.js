// Pure calculations. Preference scores are explicit prototype judgments, never ML probabilities.
export const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const mean = (a) => {
  const v = a.filter(finite);
  return v.length ? v.reduce((s, n) => s + n, 0) / v.length : null;
};
export const sum = (a) => {
  const v = a.filter(finite);
  return v.length ? v.reduce((s, n) => s + n, 0) : null;
};
export function quantile(a, p) {
  const v = a.filter(finite).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * p;
  return v[Math.floor(i)] + (v[Math.ceil(i)] - v[Math.floor(i)]) * (i % 1);
}
export function areaHa(points) {
  if (points.length < 3) return 0;
  const latitude = (mean(points.map((p) => p[0])) * Math.PI) / 180;
  const [originLat, originLon] = points[0];
  const local = points.map(([lat, lon]) => [
    (lon - originLon) * 111195.08 * Math.cos(latitude),
    (lat - originLat) * 111195.08,
  ]);
  const doubledArea = local.reduce((a, [x, y], i) => {
    const [u, v] = local[(i + 1) % local.length];
    return a + x * v - u * y;
  }, 0);
  return Math.abs(doubledArea) / 20000;
}
export function polygonValid(points) {
  if (
    points.length < 3 ||
    points.length > 500 ||
    points.some((p) => p.length !== 2 || !p.every(finite))
  )
    return false;
  if (
    new Set(points.map((p) => p.join(','))).size !== points.length ||
    areaHa(points) < 0.001
  )
    return false;
  function turn(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  function on(a, b, c) {
    return [0, 1].every(
      (i) =>
        c[i] >= Math.min(a[i], b[i]) - 1e-12 &&
        c[i] <= Math.max(a[i], b[i]) + 1e-12
    );
  }
  function crosses(a, b, c, d) {
    const v = [turn(a, b, c), turn(a, b, d), turn(c, d, a), turn(c, d, b)];
    return (
      (v[0] * v[1] < 0 && v[2] * v[3] < 0) ||
      (Math.abs(v[0]) < 1e-14 && on(a, b, c)) ||
      (Math.abs(v[1]) < 1e-14 && on(a, b, d)) ||
      (Math.abs(v[2]) < 1e-14 && on(c, d, a)) ||
      (Math.abs(v[3]) < 1e-14 && on(c, d, b))
    );
  }
  for (let i = 0; i < points.length; i++)
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue;
      if (
        crosses(
          points[i],
          points[(i + 1) % points.length],
          points[j],
          points[(j + 1) % points.length]
        )
      )
        return false;
    }
  return true;
}
export function pairedQA(daily) {
  const pairs = daily.filter((d) => finite(d.rainPower) && finite(d.rainGpm));
  const diff = pairs.map((d) => d.rainPower - d.rainGpm);
  return {
    n: pairs.length,
    meanDifference: mean(diff),
    mae: mean(diff.map(Math.abs)),
    q10: quantile(diff, 0.1),
    q90: quantile(diff, 0.9),
    totalPower: sum(pairs.map((d) => d.rainPower)),
    totalGpm: sum(pairs.map((d) => d.rainGpm)),
  };
}
export const STRATEGIES = [
  {
    id: 'baseline',
    label: 'Keep the familiar rhythm',
    bn: 'পরিচিত ফসলচক্র',
    crops: ['Aman rice', 'Fallow', 'Boro rice'],
    bnCrops: ['আমন ধান', 'পতিত', 'বোরো ধান'],
    intent: 'Current-practice reference',
    benefits: { water: 0.2, soil: 0.25, cost: 0.65, risk: 0.8 },
    cost: 'medium',
    turnaround: 0,
    source: 'Hossain et al., 2022',
    url: 'https://doi.org/10.1155/2022/6288494',
    why: 'Keeps two rice seasons and a winter gap. Useful when labor or a new market is limited.',
    risk: 'Boro needs dependable irrigation. Winter land remains uncovered.',
    months: [
      'boro',
      'boro',
      'boro',
      'boro',
      'boro',
      'fallow',
      'aman',
      'aman',
      'aman',
      'aman',
      'aman',
      'fallow',
    ],
  },
  {
    id: 'mustard',
    label: 'Make the winter gap count',
    bn: 'শীতের ফাঁকে সরিষা',
    crops: ['Aman rice', 'Mustard', 'Boro rice'],
    bnCrops: ['আমন ধান', 'সরিষা', 'বোরো ধান'],
    intent: 'Winter diversification',
    benefits: { water: 0.58, soil: 0.62, cost: 0.55, risk: 0.6 },
    cost: 'medium',
    turnaround: 80,
    source: 'Hossain et al., 2022',
    url: 'https://doi.org/10.1155/2022/6288494',
    why: 'Adds a locally studied winter crop and keeps rice in the sequence.',
    risk: 'A late Aman harvest can squeeze mustard and delay Boro. Confirm a short-duration variety.',
    months: [
      'mustard',
      'mustard',
      'boro',
      'boro',
      'boro',
      'boro',
      'aman',
      'aman',
      'aman',
      'aman',
      'mustard',
      'mustard',
    ],
  },
  {
    id: 'potato',
    label: 'Plan for a potato harvest',
    bn: 'আলুর মৌসুম পরিকল্পনা',
    crops: ['Aman rice', 'Potato', 'Boro rice'],
    bnCrops: ['আমন ধান', 'আলু', 'বোরো ধান'],
    intent: 'Higher-input option',
    benefits: { water: 0.5, soil: 0.55, cost: 0.18, risk: 0.32 },
    cost: 'high',
    turnaround: 95,
    source: 'Hossain et al., 2022',
    url: 'https://doi.org/10.1155/2022/6288494',
    why: 'Uses an established Rangpur crop in the winter window.',
    risk: 'Requires cash for planting material, labor, disease checks, and a buyer or storage.',
    months: [
      'potato',
      'potato',
      'boro',
      'boro',
      'boro',
      'boro',
      'aman',
      'aman',
      'aman',
      'aman',
      'potato',
      'potato',
    ],
  },
  {
    id: 'legume',
    label: 'Bring a pulse into the cycle',
    bn: 'ফসলচক্রে ডাল যোগ করুন',
    crops: ['Short Aman', 'Potato', 'Mungbean'],
    bnCrops: ['স্বল্পমেয়াদি আমন', 'আলু', 'মুগ'],
    intent: 'Legume diversification',
    benefits: { water: 0.84, soil: 0.88, cost: 0.27, risk: 0.43 },
    cost: 'high',
    turnaround: 95,
    source: 'Islam et al., 2014',
    url: 'https://www.banglajol.info/index.php/IJARIT/article/download/22645/15576',
    why: 'A Gangachara experiment supports this sequence. Returning legume residues can support the soil.',
    risk: 'Potato still needs inputs. Mungbean needs a suitable window and drainage.',
    months: [
      'potato',
      'potato',
      'pulse',
      'pulse',
      'fallow',
      'fallow',
      'aman',
      'aman',
      'aman',
      'aman',
      'potato',
      'potato',
    ],
  },
];
export function rankRotations(weights, options = {}) {
  const denominator = Object.values(weights).reduce((a, b) => a + Number(b), 0);
  const harvest = new Date(options.harvest || '2026-11-10');
  return STRATEGIES.map((strategy) => {
    const issues = [];
    const benefits = { ...strategy.benefits };
    if (finite(options.waterFit?.[strategy.id]))
      benefits.water = options.waterFit[strategy.id];
    if (options.irrigation === 'none')
      issues.push(
        strategy.id === 'legume'
          ? 'Potato establishment still needs a verified water source.'
          : 'Reliable Boro irrigation is unavailable.'
      );
    if (options.irrigation === 'limited' && strategy.id !== 'legume')
      issues.push('Confirm the irrigation supply for the Boro stage.');
    if (options.budget === 'low' && strategy.cost === 'high')
      issues.push(
        'The selected low budget does not fit the higher-input potato stage.'
      );
    if (
      strategy.turnaround &&
      ((harvest.getUTCMonth() === 10 && harvest.getUTCDate() > 25) ||
        harvest.getUTCMonth() === 11)
    )
      issues.push('Late Aman harvest makes this winter sequence conditional.');
    if (options.floodDays > 14 && strategy.turnaround)
      issues.push(
        'Flood delay requires a revised sowing window and drainage check.'
      );
    const score = denominator
      ? Math.round(
          (100 *
            Object.entries(weights).reduce(
              (sum, [key, weight]) => sum + Number(weight) * benefits[key],
              0
            )) /
            denominator
        )
      : null;
    return {
      ...strategy,
      benefits,
      score,
      issues,
      feasible: issues.length === 0,
    };
  }).sort(
    (a, b) =>
      Number(b.feasible) - Number(a.feasible) ||
      (b.score ?? -1) - (a.score ?? -1)
  );
}
// Compare covered months using the same weather year and representative crop coefficients.
// The calculation excludes storage, carryover, paddy seepage and application losses.
export function rotationEvidence(monthly, weights, options) {
  const coefficients = {
    aman: 1.1,
    boro: 1.1,
    mustard: 0.85,
    potato: 0.95,
    pulse: 0.85,
    fallow: 0,
  };
  const deficits = Object.fromEntries(
    STRATEGIES.map((s) => {
      const monthlyDeficits = s.months.map((crop, i) => {
        const m = monthly[i];
        if (!m || !finite(m.et0) || !finite(m.rainGpm)) return null;
        return Math.max(0, m.et0 * coefficients[crop] - m.rainGpm * 0.65);
      });
      return [
        s.id,
        monthlyDeficits.every(finite) ? sum(monthlyDeficits) : null,
      ];
    })
  );
  const peak = Math.max(0, ...Object.values(deficits).filter(finite));
  const waterFit = Object.fromEntries(
    Object.entries(deficits).map(([id, mm]) => [id, aggregate(mm)])
  );
  function aggregate(mm) {
    return finite(mm) ? (peak > 0 ? 1 - (0.85 * mm) / peak : 1) : null;
  }
  return rankRotations(weights, { ...options, waterFit }).map((s) => ({
    ...s,
    deficit: deficits[s.id],
  }));
}
export const PLANTING = {
  rice: {
    row: 0.2,
    spacing: 0.2,
    seedlings: 2,
    label: 'Rice hills',
    bn: 'ধানের গোছা',
    yield: [4.9, 5.7],
    unit: 'hills',
    source: 'Rangpur trial reference; management-dependent',
  },
  potato: {
    row: 0.6,
    spacing: 0.25,
    seedlings: 1,
    label: 'Potato planting positions',
    bn: 'আলু লাগানোর স্থান',
    yield: [16.7, 33.6],
    unit: 'positions',
    source: 'Rangpur trial yield span, not a prediction',
  },
  mustard: {
    row: null,
    spacing: null,
    seedRate: 7,
    label: 'Broadcast mustard',
    bn: 'ছিটিয়ে বোনা সরিষা',
    yield: [1.2, 1.5],
    unit: 'kg seed',
    source: 'Published cultivar/trial range; confirm seed rate locally',
  },
  mungbean: {
    row: 0.3,
    spacing: 0.1,
    seedlings: 1,
    label: 'Mungbean positions',
    bn: 'মুগ লাগানোর স্থান',
    yield: [1.47, 1.5],
    unit: 'positions',
    source: 'Gangachara study range, not a prediction',
  },
};
export function capacity(area, usable, crop, row, spacing) {
  const c = PLANTING[crop];
  const net = (Math.max(0, area) * Math.min(100, Math.max(0, usable))) / 100;
  return {
    net,
    positions:
      row > 0 && spacing > 0
        ? Math.floor((net * 1e4) / (row * spacing) + 1e-8)
        : null,
    seedKg: c.seedRate ? net * c.seedRate : null,
    low: net * c.yield[0],
    high: net * c.yield[1],
  };
}
export function waterBalance({
  area,
  netMm,
  efficiency,
  groundwaterShare,
  rechargeMm,
  seasons,
}) {
  const efficiencyFraction = Math.min(1, Math.max(0.01, efficiency / 100));
  const pumped =
    (((area * 10 * netMm) / efficiencyFraction) * groundwaterShare) / 100;
  const recharge = area * 10 * rechargeMm;
  return {
    pumped,
    recharge,
    annualDifference: pumped - recharge,
    cumulativeDifference: (pumped - recharge) * seasons,
  };
}
// BARC FRG 2024 elemental nutrient basis: N, P, K, not P2O5/K2O.
export function nutrientProducts(n, p, k) {
  return { urea: n / 0.46, tsp: p / 0.2, mop: k / 0.5 };
}
