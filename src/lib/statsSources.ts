// Exact per-house stats for a drawn comp area, straight from county records.
//
// Why this exists: asking an AI to web-search "sold prices inside this drawn
// polygon" can't work — listing sites aren't searchable by boundary, so the
// AI returns broad zip-code numbers. But the county GIS layers the finder
// already queries DO have per-parcel records, and some counties publish full
// CAMA (tax appraisal) tables with sale price, year built and heated sqft.
// This module turns "every parcel inside the user's drawn area" into exact,
// verifiable stats that the AI reports then use as ground truth.
//
// Two tiers:
//   1. Generic attribute sniffing — whatever the parcel layer itself carries
//      (NC statewide: structure flag, assessed values, last sale DATE, use
//      description; many other county layers include year built/sale price).
//   2. County CAMA enrichment — richer tax tables joined by parcel number.
//      Registry below; Mecklenburg NC wired first (saleprice, saledate,
//      yearbuilt, finishedarea, beds/baths). Add counties as needed.

export type HomeRec = {
  parno: string | null;
  address: string | null;
  owner: string | null;
  acres: number | null;
  hasStruct: boolean;
  useDesc: string | null;
  salePrice: number | null;
  saleDate: number | null; // epoch ms
  yearBuilt: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  bldgVal: number | null;
  landVal: number | null;
  totalVal: number | null;
};

export type AreaStats = ReturnType<typeof computeAreaStats>;

// ── tier 1: sniff whatever fields the parcel layer itself has ──────────────
const FIELD_CANDIDATES: Record<string, string[]> = {
  salePrice: ['saleprice', 'sale_price', 'lastsaleprice', 'last_sale_price', 'totsalprice', 'salesprice', 'saleamt', 'sale_amount', 'deedprice', 'price_paid', 'considerat'],
  saleDate: ['saledate', 'sale_date', 'lastsaledate', 'last_sale_date', 'deeddate', 'deed_date', 'salesdate', 'dateofsale'],
  yearBuilt: ['yearbuilt', 'yrbuilt', 'yr_built', 'yearblt', 'yrblt', 'actyrblt', 'structyear', 'year_built', 'ayb', 'yr_blt'],
  sqft: ['finishedarea', 'heatedsqft', 'heated_sqft', 'heatedarea', 'heated_area', 'livingarea', 'living_area', 'bldgsqft', 'bldg_sqft', 'totalsqft', 'finished_area', 'finsqft'],
  beds: ['bedrooms', 'beds', 'numbeds', 'bedroom'],
  baths: ['fullbath', 'bathrooms', 'baths', 'numbaths', 'fullbaths'],
  bldgVal: ['improvval', 'improv_val', 'bldgval', 'bldg_val', 'buildingvalue', 'building_value', 'totalbuildingvalue', 'impval'],
  landVal: ['landval', 'land_val', 'landvalue', 'land_value', 'totallandvalue'],
  totalVal: ['parval', 'totalval', 'total_value', 'totalvalue', 'assessedval', 'assdvalue', 'taxvalue', 'totalmarketvalue', 'totalassess'],
  useDesc: ['parusedesc', 'landuse_description', 'landusedesc', 'usedesc', 'landuse_desc', 'propertyuse', 'classdesc', 'landuse', 'usecode_desc'],
  struct: ['struct', 'structure', 'has_struct'],
};

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}
function toDateMs(v: any): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e11 ? v : null; // esri dates are epoch ms
  const t = Date.parse(String(v));
  return Number.isFinite(t) && t > 0 ? t : null;
}

export function sniffAttrs(attrs: Record<string, any>): Partial<HomeRec> {
  const lower: Record<string, any> = {};
  for (const k of Object.keys(attrs)) lower[k.toLowerCase()] = attrs[k];
  const pick = (key: string) => {
    for (const cand of FIELD_CANDIDATES[key]) if (lower[cand] != null && lower[cand] !== '') return lower[cand];
    return null;
  };
  const structRaw = pick('struct');
  return {
    salePrice: toNum(pick('salePrice')),
    saleDate: toDateMs(pick('saleDate')),
    yearBuilt: (() => { const y = toNum(pick('yearBuilt')); return y && y > 1700 && y < 2100 ? y : null; })(),
    sqft: (() => { const s = toNum(pick('sqft')); return s && s > 100 ? s : null; })(),
    beds: toNum(pick('beds')),
    baths: toNum(pick('baths')),
    bldgVal: toNum(pick('bldgVal')),
    landVal: toNum(pick('landVal')),
    totalVal: toNum(pick('totalVal')),
    useDesc: pick('useDesc') != null ? String(pick('useDesc')) : null,
    hasStruct: structRaw != null ? /^y/i.test(String(structRaw)) : false,
  };
}

// ── tier 2: county CAMA table registry ──────────────────────────────────────
type CamaSource = {
  label: string;
  match: { stateAbbr: string; county: RegExp };
  parcelTable: { url: string; idField: string; propertyIdField: string; fields: Record<string, string> };
  buildingTable?: { url: string; idField: string; fields: Record<string, string> };
};

export const CAMA_SOURCES: CamaSource[] = [
  {
    label: 'Mecklenburg County tax records',
    match: { stateAbbr: 'NC', county: /mecklenburg/i },
    parcelTable: {
      url: 'https://meckgis.mecklenburgcountync.gov/server/rest/services/CamaDataTables/MapServer/3',
      idField: 'parcelid', propertyIdField: 'propertyid',
      fields: { salePrice: 'saleprice', saleDate: 'saledate', useDesc: 'landuse_description', totalVal: 'totalvalue', bldgVal: 'totalbuildingvalue', landVal: 'totallandvalue' },
    },
    buildingTable: {
      url: 'https://meckgis.mecklenburgcountync.gov/server/rest/services/CamaDataTables/MapServer/1',
      idField: 'propertyid',
      fields: { yearBuilt: 'yearbuilt', sqft: 'finishedarea', beds: 'bedrooms', baths: 'fullbath' },
    },
  },
];

export function camaFor(stateAbbr?: string | null, county?: string | null): CamaSource | null {
  if (!stateAbbr || !county) return null;
  return CAMA_SOURCES.find(c => c.match.stateAbbr === stateAbbr && c.match.county.test(county)) || null;
}

async function fetchTable(url: string, where: string, outFields: string[]): Promise<any[]> {
  const p = new URLSearchParams({ where, outFields: outFields.join(','), returnGeometry: 'false', f: 'json' });
  const res = await fetch(`${url}/query?${p}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CAMA HTTP ${res.status}`);
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || 'CAMA query error');
  return (d.features || []).map((f: any) => f.attributes || {});
}

// Join county CAMA data onto the scanned parcels (by parcel number, then the
// buildings table by property id — largest building = the primary home).
// Best-effort: any failure just leaves tier-1 data in place.
export async function enrichWithCama(cama: CamaSource, homes: HomeRec[]): Promise<{ enriched: number }> {
  const byParno = new Map<string, HomeRec>();
  for (const h of homes) if (h.parno) byParno.set(String(h.parno).trim(), h);
  const ids = Array.from(byParno.keys());
  if (!ids.length) return { enriched: 0 };

  const pt = cama.parcelTable;
  const propToRec = new Map<string, HomeRec>();
  let enriched = 0;
  for (let i = 0; i < ids.length; i += 75) {
    const chunk = ids.slice(i, i + 75).map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const outFields = [pt.idField, pt.propertyIdField, ...Object.values(pt.fields)];
    const rows = await fetchTable(pt.url, `${pt.idField} IN (${chunk})`, outFields);
    for (const row of rows) {
      const rec = byParno.get(String(row[pt.idField] ?? '').trim());
      if (!rec) continue;
      const sp = toNum(row[pt.fields.salePrice]); if (sp) rec.salePrice = sp;
      const sd = toDateMs(row[pt.fields.saleDate]); if (sd) rec.saleDate = sd;
      if (row[pt.fields.useDesc]) rec.useDesc = String(row[pt.fields.useDesc]);
      const tv = toNum(row[pt.fields.totalVal]); if (tv) rec.totalVal = tv;
      const bv = toNum(row[pt.fields.bldgVal]); if (bv) { rec.bldgVal = bv; rec.hasStruct = true; }
      const lv = toNum(row[pt.fields.landVal]); if (lv) rec.landVal = lv;
      const pid = row[pt.propertyIdField];
      if (pid != null) propToRec.set(String(pid), rec);
      enriched++;
    }
  }

  const bt = cama.buildingTable;
  if (bt && propToRec.size) {
    const pids = Array.from(propToRec.keys());
    for (let i = 0; i < pids.length; i += 100) {
      const chunk = pids.slice(i, i + 100).join(',');
      const rows = await fetchTable(bt.url, `${bt.idField} IN (${chunk})`, [bt.idField, ...Object.values(bt.fields)]);
      for (const row of rows) {
        const rec = propToRec.get(String(row[bt.idField]));
        if (!rec) continue;
        const sqft = toNum(row[bt.fields.sqft]);
        // multiple buildings per property → keep the largest as the home
        if (sqft && (!rec.sqft || sqft > rec.sqft)) {
          rec.sqft = sqft;
          const yb = toNum(row[bt.fields.yearBuilt]); if (yb && yb > 1700) rec.yearBuilt = yb;
          rec.beds = toNum(row[bt.fields.beds]);
          rec.baths = toNum(row[bt.fields.baths]);
          rec.hasStruct = true;
        }
      }
    }
  }
  return { enriched };
}

// ── stats ───────────────────────────────────────────────────────────────────
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
const NEW_BUILD_YEARS = 5;   // "new construction" = built within the last N years
const SALE_WINDOW_MONTHS = 48;
const MIN_REAL_SALE = 20000; // filters $0/$1 family transfers

export function computeAreaStats(all: HomeRec[], opts: { newOnly?: boolean; criteria?: string }) {
  const nowYear = new Date().getFullYear();
  const saleCutoff = Date.now() - SALE_WINDOW_MONTHS * 30.44 * 86400000;
  // Optional "3000+ sqft"-style criteria filter we can apply exactly
  const sqftMin = (() => {
    const m = /(\d{3,5})\s*\+?\s*(?:sq\.?\s?ft|sqft|sf)\b/i.exec(opts.criteria || '');
    return m ? Number(m[1]) : null;
  })();

  const isHome = (h: HomeRec) => h.hasStruct || (h.bldgVal ?? 0) > 10000 || !!h.yearBuilt || !!h.sqft;
  const isResidential = (h: HomeRec) => !h.useDesc || /SINGLE ?FAM|RESIDENT|TOWNHOM|TOWNHOUSE|CONDO|DUPLEX|PATIO/i.test(h.useDesc);

  const homes = all.filter(h => isHome(h) && isResidential(h));
  const vacant = all.filter(h => !isHome(h) && isResidential(h));
  const isNew = (h: HomeRec) => (h.yearBuilt != null && h.yearBuilt >= nowYear - NEW_BUILD_YEARS);
  const newBuilds = homes.filter(isNew);
  const fitsSqft = (h: HomeRec) => sqftMin == null || (h.sqft != null && h.sqft >= sqftMin);

  // A "real" comp sale: recent, non-nominal, and plausibly one house — bulk
  // portfolio/apartment transfers ($17M "sales") would wreck the medians.
  const soldRecently = (h: HomeRec) => {
    if (h.salePrice == null || h.salePrice < MIN_REAL_SALE || h.saleDate == null || h.saleDate < saleCutoff) return false;
    if (h.salePrice > 3_000_000) return false;
    if (h.sqft) { const v = h.salePrice / h.sqft; if (v < 40 || v > 1500) return false; }
    return true;
  };
  const recentSales = homes.filter(h => soldRecently(h) && fitsSqft(h));
  const newSales = recentSales.filter(isNew);

  const ppsf = (h: HomeRec) => (h.salePrice && h.sqft ? Math.round(h.salePrice / h.sqft) : null);
  const focus = opts.newOnly ? newSales : (newSales.length >= 3 ? newSales : recentSales);

  return {
    scanned: all.length,
    homes: homes.length,
    vacantLots: vacant.length,
    newBuilds: newBuilds.length,
    recentSales: recentSales.length,
    newSales: newSales.length,
    sqftMin,
    hasSaleData: homes.some(h => h.salePrice != null),
    hasYearData: homes.some(h => h.yearBuilt != null),
    medianSalePrice: median(focus.map(h => h.salePrice!).filter(Boolean)),
    salePriceRange: focus.length ? [Math.min(...focus.map(h => h.salePrice!)), Math.max(...focus.map(h => h.salePrice!))] as [number, number] : null,
    medianPpsf: median(focus.map(ppsf).filter((v): v is number => v != null)),
    medianSqft: median((opts.newOnly ? newBuilds : homes).map(h => h.sqft!).filter(Boolean)),
    medianYearBuilt: median(homes.map(h => h.yearBuilt!).filter(Boolean)),
    medianLotAcres: (() => { const m = median(homes.map(h => (h.acres != null ? Math.round(h.acres * 1000) : null)!).filter(Boolean)); return m != null ? m / 1000 : null; })(),
    medianTotalVal: median(homes.map(h => h.totalVal!).filter(Boolean)),
    medianBldgVal: median(homes.map(h => h.bldgVal!).filter(Boolean)),
    focusHomes: focus,
    allHomes: homes,
    newBuildHomes: newBuilds,
  };
}

// ── report + AI ground-truth payload ────────────────────────────────────────
const money = (v: number | null | undefined) => (v != null ? '$' + Math.round(v).toLocaleString() : 'n/a');
const dateTx = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-US', { month: 'numeric', year: 'numeric' }) : '');

function homeLine(h: HomeRec): string {
  const bits = [
    h.address || (h.parno ? `parcel ${h.parno}` : 'unknown address'),
    h.yearBuilt ? `built ${h.yearBuilt}` : null,
    h.sqft ? `${h.sqft.toLocaleString()} sqft` : null,
    h.beds || h.baths ? `${h.beds ?? '?'}bd/${h.baths ?? '?'}ba` : null,
    h.salePrice ? `sold ${dateTx(h.saleDate)} ${money(h.salePrice)}${h.sqft ? ` (${money(Math.round(h.salePrice / h.sqft))}/sqft)` : ''}` : (h.totalVal ? `assessed ${money(h.totalVal)}` : null),
  ].filter(Boolean);
  return '- ' + bits.join(' · ');
}

export function renderAreaStats(stats: AreaStats, opts: { areaDesc: string; camaLabel: string | null; newOnly?: boolean; criteria?: string }): string {
  const L: string[] = [];
  L.push(`**Exact stats from county records** — ${stats.scanned} parcels scanned ${opts.areaDesc}${opts.camaLabel ? ` (enriched with ${opts.camaLabel})` : ''}`);
  L.push('');
  L.push(`**Homes**: ${stats.homes} · **vacant residential lots**: ${stats.vacantLots}`);
  if (stats.hasYearData) L.push(`**New builds** (built ${new Date().getFullYear() - NEW_BUILD_YEARS}+): ${stats.newBuilds}${stats.medianYearBuilt ? ` · median year built (all homes): ${stats.medianYearBuilt}` : ''}`);
  if (stats.hasSaleData) {
    L.push(`**Sales in last 4 years**: ${stats.recentSales}${stats.hasYearData ? ` (${stats.newSales} were new construction)` : ''}${stats.sqftMin ? ` · filtered to ${stats.sqftMin}+ sqft` : ''}`);
    if (stats.medianSalePrice) {
      const rangeTx = stats.salePriceRange ? ` · range ${money(stats.salePriceRange[0])}–${money(stats.salePriceRange[1])}` : '';
      L.push(`**Median sold price${opts.newOnly || stats.newSales >= 3 ? ' (new construction)' : ''}**: ${money(stats.medianSalePrice)}${stats.medianPpsf ? ` · ${money(stats.medianPpsf)}/sqft` : ''}${rangeTx}`);
    }
  } else {
    L.push(`This county's public layer doesn't publish sale prices — using assessed values instead (typically a bit under market).`);
  }
  if (stats.medianSqft) L.push(`**Typical home**: ${stats.medianSqft.toLocaleString()} sqft${stats.medianLotAcres ? ` on ${stats.medianLotAcres} ac lot` : ''}`);
  if (stats.medianTotalVal) L.push(`**Median assessed value**: ${money(stats.medianTotalVal)}${stats.medianBldgVal ? ` (building ${money(stats.medianBldgVal)})` : ''}`);
  L.push('');
  const list = opts.newOnly ? stats.newBuildHomes : (stats.focusHomes.length ? stats.focusHomes : stats.allHomes);
  const sorted = [...list].sort((a, b) => (b.saleDate ?? 0) - (a.saleDate ?? 0) || (b.yearBuilt ?? 0) - (a.yearBuilt ?? 0));
  L.push(`**Every ${opts.newOnly ? 'new build' : 'matching home'} in the area** (${sorted.length}):`);
  for (const h of sorted.slice(0, 45)) L.push(homeLine(h));
  if (sorted.length > 45) L.push(`…and ${sorted.length - 45} more.`);
  return L.join('\n');
}

// Compact ground-truth payload the deal-analysis / market APIs hand to the AI.
export type CompData = {
  source: string;
  areaDesc: string;
  parcels: number; homes: number; vacantLots: number; newBuilds: number;
  recentSales: number; newSales: number;
  medianSalePrice: number | null; medianPpsf: number | null; medianSqft: number | null;
  medianYearBuilt: number | null; medianLotAcres: number | null;
  medianTotalVal: number | null;
  sales: Array<{ address: string | null; yearBuilt: number | null; sqft: number | null; price: number; date: string }>;
  streets: string[];
};

export function buildCompData(stats: AreaStats, opts: { areaDesc: string; camaLabel: string | null }): CompData {
  const sales = [...stats.focusHomes]
    .filter(h => h.salePrice)
    .sort((a, b) => (b.saleDate ?? 0) - (a.saleDate ?? 0))
    .slice(0, 25)
    .map(h => ({ address: h.address, yearBuilt: h.yearBuilt, sqft: h.sqft, price: h.salePrice!, date: dateTx(h.saleDate) }));
  // Street names give the AI something concrete to web-search when it needs
  // to fill gaps (e.g. "new construction <street/subdivision> Charlotte NC").
  const streets = Array.from(new Set(stats.allHomes
    .map(h => (h.address || '').replace(/^[\d\-]+\s+/, '').replace(/\s+(CHARLOTTE|NC|SC)\b.*$/i, '').trim())
    .filter(s => s.length > 3))).slice(0, 8);
  return {
    source: opts.camaLabel || 'county parcel records',
    areaDesc: opts.areaDesc,
    parcels: stats.scanned, homes: stats.homes, vacantLots: stats.vacantLots, newBuilds: stats.newBuilds,
    recentSales: stats.recentSales, newSales: stats.newSales,
    medianSalePrice: stats.medianSalePrice, medianPpsf: stats.medianPpsf, medianSqft: stats.medianSqft,
    medianYearBuilt: stats.medianYearBuilt, medianLotAcres: stats.medianLotAcres, medianTotalVal: stats.medianTotalVal,
    sales, streets,
  };
}

// Prompt block shared by the deal-analysis and market-snapshot routes.
export function compDataLines(cd: any): string[] {
  if (!cd || typeof cd !== 'object' || !cd.parcels) return [];
  const L: string[] = [];
  L.push(`VERIFIED COUNTY RECORDS for the user's comp area (${cd.areaDesc || 'drawn area'}; source: ${cd.source}). These are GROUND TRUTH — base your numbers on them; use web search only to fill gaps (e.g. active listing prices, current builder pricing), NEVER to override them:`);
  L.push(`- ${cd.parcels} parcels: ${cd.homes} homes, ${cd.vacantLots} vacant residential lots, ${cd.newBuilds} built in the last ${NEW_BUILD_YEARS} years.`);
  if (cd.medianSalePrice) {
    L.push(`- ${cd.recentSales} sales in the last 4 years (${cd.newSales} new construction). Median sold: $${Number(cd.medianSalePrice).toLocaleString()}${cd.medianPpsf ? ` ($${cd.medianPpsf}/sqft)` : ''}.`);
  } else {
    L.push(`- County layer publishes no sale prices here. Median assessed value: $${Number(cd.medianTotalVal || 0).toLocaleString()} — treat as a floor and web-search actual sold prices on these streets: ${(cd.streets || []).join(', ') || 'n/a'}.`);
  }
  if (cd.medianSqft) L.push(`- Typical home: ${Number(cd.medianSqft).toLocaleString()} sqft${cd.medianLotAcres ? ` on ${cd.medianLotAcres}-acre lots` : ''}${cd.medianYearBuilt ? `, median year built ${cd.medianYearBuilt}` : ''}.`);
  if (Array.isArray(cd.sales) && cd.sales.length) {
    L.push('- Individual recorded sales (address · built · sqft · price · date):');
    for (const s of cd.sales.slice(0, 25)) {
      L.push(`  · ${s.address || 'n/a'} · ${s.yearBuilt || '?'} · ${s.sqft ? s.sqft + ' sqft' : '?'} · $${Number(s.price).toLocaleString()} · ${s.date || '?'}`);
    }
  }
  return L;
}
