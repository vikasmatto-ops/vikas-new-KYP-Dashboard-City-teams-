// ============================================================
// HEXA DASHBOARD — DATA LAYER v2
// Fixed: amount parsing, city bucket, date parsing, New India
// ============================================================

const DATA = {
  hospitals:    [],
  aspCases:     [],
  tpaNames:     [],
  insurerNames: [],
  lastUpdated:  null,
  isLoading:    false,
  callbacks:    [],
};

// ── CSV parser ────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = [];
    let cur = '', inQ = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') { if (inQ && line[j+1] === '"') { cur += '"'; j++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cols.push(cur.trim());
    rows.push(cols);
  }
  return rows;
}

// ── Amount parser — handles ₹ UTF-8, commas, ####### ─────
function parseAmount(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s || s === '' || s.startsWith('#')) return null;
  // Remove rupee symbol (all variants), commas, spaces
  const cleaned = s.replace(/[\u20B9\u0024\u00A3£$]/g, '')
                   .replace(/,/g, '')
                   .replace(/\s/g, '')
                   .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ── Date parser — handles "Apr 02, 2024" and "##########" ─
function parseDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s || s.startsWith('#')) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(str) {
  const d = parseDate(str);
  if (!d) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Normalize city using City Bucket (col P = index 15) ──
// City Bucket already has Delhi NCR grouped as "Delhi"
function normalizeCityBucket(bucket) {
  if (!bucket) return '';
  const b = bucket.trim().toLowerCase();
  if (b === 'delhi') return 'delhi ncr';
  return b;
}

// ── Normalize active status ───────────────────────────────
function normalizeStatus(str) {
  if (!str) return 'Unknown';
  const s = str.trim().toLowerCase();
  if (s === 'active' || s === 'active ') return 'Active';
  if (s === 'inactive') return 'Inactive';
  if (s.includes('hold')) return 'On Hold';
  return str.trim();
}

function normalizeMOP(str) {
  if (!str) return '';
  const s = str.trim().toLowerCase();
  if (!s) return '';
  // Handle typos and variants
  if (s === 'cashless') return 'Cashless';
  if (s === 'reimbusement' || s === 'reimbursement' || s === 'reimbursment') return 'Reimbursement';
  if (s === 'cash') return 'Cash';
  if (s.includes('cash') && s.includes('cashless')) return 'Mixed (Cash + Cashless)';
  if (s.includes('cashless')) return 'Cashless';
  if (s.includes('reimb')) return 'Reimbursement';
  if (s.includes('cash')) return 'Cash';
  return str.trim();
}

// ── Parse Sheet 1 — Hospital Network ─────────────────────
function parseHospitalNetwork(rows) {
  if (rows.length < 2) return [];
  const header = rows[0];

  DATA.tpaNames     = header.slice(CONFIG.TPA_COL_START, CONFIG.TPA_COL_END + 1).map(h => (h||'').trim()).filter(Boolean);
  DATA.insurerNames = header.slice(CONFIG.INSURER_COL_START, CONFIG.INSURER_COL_END + 1).map(h => (h||'').trim()).filter(Boolean);

  const hospitals = [];
  const seenNames = new Set();  // Dedupe by lowercase hospital name
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[3] || r[3].trim() === '') continue;

    const tpaMap = {};
    const tpaRaw = {};  // Track raw value: 'Yes', 'No', or '' (blank)
    DATA.tpaNames.forEach((name, idx) => {
      const cellVal = (r[CONFIG.TPA_COL_START + idx] || '').trim().toLowerCase();
      tpaRaw[name] = cellVal === 'yes' ? 'Yes' : cellVal === 'no' ? 'No' : '';
      tpaMap[name] = cellVal === 'yes';
    });

    const insurerMap = {};
    const insurerRaw = {};
    DATA.insurerNames.forEach((name, idx) => {
      const cellVal = (r[CONFIG.INSURER_COL_START + idx] || '').trim().toLowerCase();
      insurerRaw[name] = cellVal === 'yes' ? 'Yes' : cellVal === 'no' ? 'No' : '';
      insurerMap[name] = cellVal === 'yes';
    });

    // Normalize city from col A
    const cityRaw = (r[0] || '').trim();
    const city = normalizeCity(cityRaw);

    const pinCode = String(r[2] || '').trim().replace('.0', '');
    hospitals.push({
      city,
      cityRaw,
      area:           (r[1] || '').trim(),
      pinCode,
      zone:           getPincodeZone(pinCode),
      hospitalName:   (r[3] || '').trim(),
      activeStatus:   normalizeStatus(r[4]),
      mopStatus:      normalizeMOP(r[5]),
      insComments:    (r[6] || '').trim(),
      cityComments:   (r[7] || '').trim(),
      doctorComments: (r[8] || '').trim(),
      tpa:            tpaMap,
      tpaRaw:         tpaRaw,
      insurer:        insurerMap,
      insurerRaw:     insurerRaw,
      aspData:        [],
      tier:           null,
      score:          null,
      empanelmentFlags: {},
    });
  }
  return hospitals;
}


// ── HISTORY TRACKING via localStorage ─────────────────────
// Tracks status changes and comment changes over time
// First seen date is stored when dashboard sees hospital first
function trackHistory(hospitals) {
  const HISTORY_KEY = 'hexa_hospital_history_v1';
  let history;
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  } catch(e) {
    history = {};
  }

  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD

  hospitals.forEach(h => {
    const key = h.hospitalName.toLowerCase().trim();
    if (!history[key]) {
      // First time seeing this hospital — capture today as first-seen
      history[key] = {
        firstSeen: today,
        status: h.activeStatus,
        statusChangedOn: today,    // baseline date
        insComments: h.insComments,
        insCommentsOn: today,
        cityComments: h.cityComments,
        cityCommentsOn: today,
        doctorComments: h.doctorComments,
        doctorCommentsOn: today,
      };
    } else {
      // Existing — check for changes
      const prev = history[key];
      if (prev.status !== h.activeStatus) {
        prev.statusChangedOn = today;
        prev.previousStatus = prev.status;
        prev.status = h.activeStatus;
      }
      if (prev.insComments !== h.insComments) {
        prev.insCommentsOn = today;
        prev.insComments = h.insComments;
      }
      if (prev.cityComments !== h.cityComments) {
        prev.cityCommentsOn = today;
        prev.cityComments = h.cityComments;
      }
      if (prev.doctorComments !== h.doctorComments) {
        prev.doctorCommentsOn = today;
        prev.doctorComments = h.doctorComments;
      }
    }
    // Attach to hospital object
    h.history = history[key];
  });

  // Save back to localStorage
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch(e) {
    console.warn('[Hexa] Could not save history:', e);
  }
}

// ── Parse Sheet 2 — ASP Data ──────────────────────────────
function parseASPData(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map(h => h.trim());
  const idx = {};
  header.forEach((h, i) => idx[h] = i);

  const cases = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[idx['Hospital Name']] || !r[idx['Hospital Name']].trim()) continue;

    const proc = normalizeProcedure(r[idx['Procedure']] || '');

    // Use City Bucket (col P) for city — already normalized (Delhi NCR grouped)
    const cityBucket = (r[idx['City Bucket']] || '').trim();
    const city = normalizeCityBucket(cityBucket);

    cases.push({
      ipdId:           (r[idx['IPD ID']] || '').trim(),
      leadId:          (r[idx['Lead ID']] || '').trim().replace(/\.0+$/,'').replace(/e\+\d+/i,''),
      category:        (r[idx['Category']] || '').trim(),
      mop:             (r[idx['Mode of Payment (MoP)']] || '').trim(),
      procedureRaw:    (r[idx['Procedure']] || '').trim(),
      procedureGroup:  proc.group,
      doaRaw:          (r[idx['DOA']] || '').trim(),
      dodRaw:          (r[idx['DOD']] || '').trim(),
      doaParsed:       parseDate(r[idx['DOA']]),
      dodParsed:       parseDate(r[idx['DOD']]),
      hospitalName:    (r[idx['Hospital Name']] || '').trim(),
      city,
      cityBucket,
      insuranceName:   (r[idx['Insurance Name']] || '').trim(),
      tpaName:         (r[idx['TPA Name']] || '').trim(),
      dischargeStatus: (r[idx['Discharge Status']] || '').trim(),
      approvalAmount:  parseAmount(r[idx['Approval Amount']]),   // Col W = ASP
      billAmount:      parseAmount(r[idx['Bill Amount']]),       // Col V
      settlementAmount:parseAmount(r[idx['Settlement Amount']]), // Col X
    });
  }
  return cases;
}

// ── Fetch CSV ─────────────────────────────────────────────
async function fetchCSV(url) {
  const bustUrl = url + '&_cb=' + Date.now();
  const res = await fetch(bustUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

// ── Enrich hospitals with ASP case data ──────────────────
function enrichHospitals() {
  const byHosp = {};
  DATA.aspCases.forEach(c => {
    const key = c.hospitalName.toLowerCase().trim();
    if (!byHosp[key]) byHosp[key] = [];
    byHosp[key].push(c);
  });

  DATA.hospitals.forEach(h => {
    const key = h.hospitalName.toLowerCase().trim();
    const hc = byHosp[key] || [];
    h.aspData   = hc;
    h.totalCases = hc.length;
    const valid  = hc.filter(c => c.approvalAmount !== null);
    h.avgASP = valid.length ? valid.reduce((s,c) => s + c.approvalAmount, 0) / valid.length : null;
  });
}

// ── Compute city ASP averages (using city bucket) ────────
function computeCityASPAverages() {
  const groups = {};
  DATA.aspCases.forEach(c => {
    if (c.approvalAmount === null) return;
    if (!groups[c.city]) groups[c.city] = [];
    groups[c.city].push(c.approvalAmount);
  });
  const result = {};
  Object.keys(groups).forEach(city => {
    result[city] = groups[city].reduce((s,v) => s+v, 0) / groups[city].length;
  });
  return result;
}

// ── Score and tier hospitals ──────────────────────────────
function scoreHospitals() {
  const cityAvg   = computeCityASPAverages();
  const maxCoverage = DATA.insurerNames.length + DATA.tpaNames.length;
  const maxCases  = Math.max(...DATA.hospitals.map(h => h.totalCases || 0), 1);

  DATA.hospitals.forEach(h => {
    if (!h.totalCases || h.avgASP === null) { h.score = null; h.tier = null; return; }

    const cityMean  = cityAvg[h.city] || h.avgASP;
    const aspScore  = Math.min(100, (h.avgASP / cityMean) * 50 + 50);
    const empCount  = Object.values(h.insurer).filter(Boolean).length +
                      Object.values(h.tpa).filter(Boolean).length;
    const covScore  = maxCoverage > 0 ? (empCount / maxCoverage) * 100 : 0;
    const volScore  = (h.totalCases / maxCases) * 100;
    const score     = aspScore * CONFIG.SCORE_WEIGHT_ASP +
                      covScore * CONFIG.SCORE_WEIGHT_COVERAGE +
                      volScore * CONFIG.SCORE_WEIGHT_VOLUME;

    h.score = Math.round(score);

    if (h.totalCases >= CONFIG.TIER_MIN_CASES) {
      if (score >= CONFIG.TIER_GOLD)        h.tier = 'Gold';
      else if (score >= CONFIG.TIER_SILVER) h.tier = 'Silver';
      else if (score >= CONFIG.TIER_BRONZE) h.tier = 'Bronze';
      else                                  h.tier = null;
    } else if (h.totalCases <= CONFIG.UNDERUTILIZED_MAX_CASES && aspScore >= CONFIG.UNDERUTILIZED_MIN_ASP_SCORE) {
      h.tier = 'Underutilized';
    } else {
      h.tier = null;
    }
  });
}

// ── Cross-check empanelment + AUTO-FILL from ASP cases ────
// If Sheet 1 says "No" but ASP data shows cases for that hospital + insurer/TPA,
// auto-mark as Yes (with a flag) so coverage % reflects actual operating reality
function crossCheckEmpanelment() {
  const byHosp = {};
  DATA.aspCases.forEach(c => {
    const key = c.hospitalName.toLowerCase().trim();
    if (!byHosp[key]) byHosp[key] = [];
    byHosp[key].push(c);
  });

  DATA.hospitals.forEach(h => {
    const key  = h.hospitalName.toLowerCase().trim();
    const hc   = byHosp[key] || [];
    h.empanelmentFlags = {};

    // INSURER auto-fill — OPTION C: skip if explicitly marked "No"
    DATA.insurerNames.forEach(ins => {
      // Skip if explicitly marked Yes (already true) or No (manual depanel)
      if (h.insurer[ins] || h.insurerRaw[ins] === 'No') return;
      // Only auto-fill blank cells from ASP data
      const insLower = ins.toLowerCase().trim();
      const found = hc.some(c => {
        const cIns = c.insuranceName.toLowerCase().trim();
        return cIns === insLower;
      });
      if (found) {
        h.insurer[ins] = true;
        h.empanelmentFlags[ins] = 'insurer';
      }
    });

    // TPA auto-fill — OPTION C: skip if explicitly marked "No"
    DATA.tpaNames.forEach(tpa => {
      if (h.tpa[tpa] || h.tpaRaw[tpa] === 'No') return;
      const tpaLower = tpa.toLowerCase().trim();
      const found = hc.some(c => {
        const cTpa = c.tpaName.toLowerCase().trim();
        return cTpa === tpaLower;
      });
      if (found) {
        h.tpa[tpa] = true;
        h.empanelmentFlags[tpa] = 'tpa';
      }
    });
  });
}

// ── Main refresh ──────────────────────────────────────────
async function refreshData() {
  if (DATA.isLoading) return;
  DATA.isLoading = true;
  try {
    const [s1, s2] = await Promise.all([
      fetchCSV(CONFIG.SHEET_HOSPITAL_NETWORK),
      fetchCSV(CONFIG.SHEET_ASP_DATA),
    ]);
    DATA.hospitals = parseHospitalNetwork(s1);
    DATA.aspCases  = parseASPData(s2);
    enrichHospitals();
    scoreHospitals();
    crossCheckEmpanelment();
    trackHistory(DATA.hospitals);
    DATA.lastUpdated = new Date();
    DATA.isLoading   = false;
    DATA.callbacks.forEach(fn => fn());
    console.log(`[Hexa] Refreshed: ${DATA.hospitals.length} hospitals, ${DATA.aspCases.length} cases`);
  } catch (err) {
    DATA.isLoading = false;
    console.error('[Hexa] Refresh failed:', err);
    throw err;
  }
}

function onDataRefresh(fn) { DATA.callbacks.push(fn); }

async function forceRefresh() {
  // Manual refresh - bypass the isLoading guard
  DATA.isLoading = false;
  await refreshData();
}

function startAutoRefresh() {
  setInterval(() => refreshData().catch(e => console.warn('[Hexa] Auto-refresh error:', e)), CONFIG.REFRESH_INTERVAL);
}

// ── Query helpers ─────────────────────────────────────────

function getCities() {
  // Use city bucket values — already normalized
  const set = new Set(DATA.aspCases.map(c => c.city).filter(Boolean));
  return [...set].sort();
}

function getInsurers() {
  const set = new Set(DATA.aspCases.map(c => c.insuranceName).filter(Boolean));
  return [...set].sort();
}

function getTPAs() {
  const set = new Set(DATA.aspCases.map(c => c.tpaName).filter(Boolean));
  return [...set].sort();
}

function getProceduresForCategory(category) {
  const cases = category
    ? DATA.aspCases.filter(c => c.category.toLowerCase() === category.toLowerCase())
    : DATA.aspCases;
  const set = new Set(cases.map(c => c.procedureGroup).filter(p => p && p !== 'Other'));
  return [...set].sort();
}

// ── Recommendation engine ─────────────────────────────────
function getRecommendations({ city, insurer, tpa, category, procedure, topN = 5 }) {
  let cases = DATA.aspCases;
  if (city)      cases = cases.filter(c => c.city === city);
  if (insurer)   cases = cases.filter(c => c.insuranceName === insurer);
  if (tpa)       cases = cases.filter(c => c.tpaName === tpa);
  if (category)  cases = cases.filter(c => c.category.toLowerCase() === category.toLowerCase());
  if (procedure) cases = cases.filter(c => c.procedureGroup === procedure);

  const byHosp = {};
  cases.forEach(c => {
    if (!byHosp[c.hospitalName]) byHosp[c.hospitalName] = [];
    byHosp[c.hospitalName].push(c);
  });

  return Object.entries(byHosp).map(([name, hc]) => {
    const valid  = hc.filter(c => c.approvalAmount !== null);
    const avgASP = valid.length ? valid.reduce((s,c) => s + c.approvalAmount, 0) / valid.length : null;
    // Last case = latest DOD parsed date
    const dates  = hc.map(c => c.dodParsed).filter(Boolean);
    const lastCase = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
    return { hospitalName: name, caseCount: hc.length, avgASP, lastCaseDate: lastCase };
  })
  .filter(r => r.avgASP !== null)
  .sort((a, b) => b.avgASP - a.avgASP)
  .slice(0, topN);
}

// ── ASP trend ─────────────────────────────────────────────
function getASPTrend({ city, insurer, tpa, category, procedure, year } = {}) {
  let cases = DATA.aspCases.filter(c => c.approvalAmount !== null && c.doaParsed);
  if (city)      cases = cases.filter(c => c.city === city);
  if (insurer)   cases = cases.filter(c => c.insuranceName === insurer);
  if (tpa)       cases = cases.filter(c => c.tpaName === tpa);
  if (category)  cases = cases.filter(c => c.category.toLowerCase() === category.toLowerCase());
  if (procedure) cases = cases.filter(c => c.procedureGroup === procedure);
  if (year)      cases = cases.filter(c => c.doaParsed && c.doaParsed.getFullYear() === parseInt(year));

  const monthly = {};
  cases.forEach(c => {
    const d = c.doaParsed;
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!monthly[key]) monthly[key] = [];
    monthly[key].push(c.approvalAmount);
  });

  return Object.entries(monthly)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      avgASP: Math.round(vals.reduce((s,v) => s+v, 0) / vals.length),
      count:  vals.length,
    }));
}

// ── Hospital comparator ───────────────────────────────────
function compareHospitals(hospA, hospB, filters = {}) {
  function getStats(name) {
    let cases = DATA.aspCases.filter(c => c.hospitalName.toLowerCase().trim() === name.toLowerCase().trim());
    if (filters.category) cases = cases.filter(c => c.category.toLowerCase() === filters.category.toLowerCase());
    if (filters.procedure) cases = cases.filter(c => c.procedureGroup === filters.procedure);

    const valid  = cases.filter(c => c.approvalAmount !== null);
    const avgASP = valid.length ? Math.round(valid.reduce((s,c) => s + c.approvalAmount, 0) / valid.length) : null;
    const dates  = cases.map(c => c.dodParsed).filter(Boolean);
    const lastCase = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

    const procCount = {};
    cases.forEach(c => { procCount[c.procedureGroup] = (procCount[c.procedureGroup]||0)+1; });
    const topProcs = Object.entries(procCount).sort(([,a],[,b]) => b-a).slice(0,3).map(([p,n]) => ({procedure:p,count:n}));

    return {
      hospitalName: name,
      totalCases:   cases.length,
      avgASP,
      lastCaseDate: lastCase ? lastCase.toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : null,
      topProcedures: topProcs,
      businessScore: avgASP ? avgASP * cases.length : 0,
    };
  }

  const a = getStats(hospA);
  const b = getStats(hospB);
  return { a, b, recommended: a.businessScore >= b.businessScore ? hospA : hospB };
}

// ── Supply gap analysis ───────────────────────────────────
function getSupplyGaps({ city, insurer } = {}) {
  let hospitals = DATA.hospitals;
  if (city) hospitals = hospitals.filter(h => h.city === city);
  const active = hospitals.filter(h => h.activeStatus === 'Active');
  const total  = active.length;
  const insurersToCheck = insurer ? [insurer] : DATA.insurerNames;

  return insurersToCheck.map(ins => {
    const emp = active.filter(h => h.insurer[ins]);
    return { insurer: ins, empanelled: emp.length, total, gap: total - emp.length, pct: total > 0 ? Math.round((emp.length/total)*100) : 0 };
  }).sort((a,b) => a.pct - b.pct);
}

// ── Haversine distance (km) ───────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}
