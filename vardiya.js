/* QR Mola Takip — Vardiya modülü: kurallı plan, izin/gelmedi takvimi, aylık puantaj */
(() => {
'use strict';
let C = null; // app.js'den gelen yardımcılar

// ------------------------------------------------------------------ sabitler
const SL = ['ac', 'og', 'ka'];
const SN = { ac: 'Açılış', og: 'Öğlen', ka: 'Kapanış' };
const DN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const MN = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DEF_HOURS = { ac: ['07:00', '15:00'], og: ['11:00', '19:00'], ka: ['15:00', '23:00'] };
const DEF_POS = ['Barista', 'Aşçı', 'Kasa'];
const DEF_RULES = [
  { id: 'r1', type: 'cover', pos: 'Barista', slot: 'ac', days: 'all', op: 'min', n: 1, lvl: 'A', on: true },
  { id: 'r2', type: 'cover', pos: 'Barista', slot: 'ka', days: 'all', op: 'min', n: 1, lvl: 'A', on: true },
  { id: 'r3', type: 'cover', pos: 'Barista', slot: 'og', days: 'all', op: 'min', n: 1, lvl: 'B', on: true },
  { id: 'r4', type: 'pair', on: true },
  { id: 'r5', type: 'clopen', on: true },
  { id: 'r6', type: 'maxdays', n: 5, on: true },
  { id: 'r7', type: 'fair', on: true }
];
// Dini bayramlar (Diyanet takvimi). Arife yarım gün; varsayılan normal yevmiye.
const RELIGIOUS = {
  2026: [['03-19', 'Ramazan Bayramı arifesi', 1], ['03-20', 'Ramazan Bayramı 1. gün'], ['03-21', 'Ramazan Bayramı 2. gün'], ['03-22', 'Ramazan Bayramı 3. gün'],
    ['05-26', 'Kurban Bayramı arifesi', 1], ['05-27', 'Kurban Bayramı 1. gün'], ['05-28', 'Kurban Bayramı 2. gün'], ['05-29', 'Kurban Bayramı 3. gün'], ['05-30', 'Kurban Bayramı 4. gün']],
  2027: [['03-08', 'Ramazan Bayramı arifesi', 1], ['03-09', 'Ramazan Bayramı 1. gün'], ['03-10', 'Ramazan Bayramı 2. gün'], ['03-11', 'Ramazan Bayramı 3. gün'],
    ['05-15', 'Kurban Bayramı arifesi', 1], ['05-16', 'Kurban Bayramı 1. gün'], ['05-17', 'Kurban Bayramı 2. gün'], ['05-18', 'Kurban Bayramı 3. gün'], ['05-19', 'Kurban Bayramı 4. gün']]
};
const NATIONAL = [['01-01', 'Yılbaşı'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-19', 'Atatürk’ü Anma, Gençlik ve Spor Bayramı'],
  ['07-15', 'Demokrasi ve Milli Birlik Günü', 0, 'normal'], ['08-30', 'Zafer Bayramı'], ['10-28', 'Cumhuriyet Bayramı arifesi', 1], ['10-29', 'Cumhuriyet Bayramı']];
const LK = { yillik: ['Yıllık izin', 'l-yillik'], rapor: ['Raporlu', 'l-rapor'], gelmedi: ['Gelmedi', 'l-gelmedi'], izin: ['İzinli', 'l-izin'] };

// ------------------------------------------------------------------ tarih yardımcıları
const p2 = (n) => String(n).padStart(2, '0');
const parse = (iso) => { const q = iso.split('-'); return Date.UTC(+q[0], +q[1] - 1, +q[2]); };
const fromMs = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`; };
const addD = (iso, k) => fromMs(parse(iso) + k * 864e5);
const wdOf = (iso) => (new Date(parse(iso)).getUTCDay() + 6) % 7;
const monday = (iso) => addD(iso, -wdOf(iso));
const diffD = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const dShort = (iso) => `${+iso.slice(8, 10)} ${MN[+iso.slice(5, 7) - 1].slice(0, 3)}`;
const dLong = (iso) => `${+iso.slice(8, 10)} ${MN[+iso.slice(5, 7) - 1]}`;
const monthLast = (ym) => fromMs(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0));
const todayIso = () => new Date(C.now() - 125 * 60000).toLocaleDateString('sv-SE', { timeZone: C.tz() });
const weekLabel = (ws) => { const we = addD(ws, 6); return ws.slice(5, 7) === we.slice(5, 7) ? `${+ws.slice(8)}–${dLong(we)} ${we.slice(0, 4)}` : `${dShort(ws)} – ${dShort(we)} ${we.slice(0, 4)}`; };
const hNum = (h) => (Math.round(h * 10) / 10).toLocaleString('tr-TR');
const lcode = (kind) => /yıll/i.test(kind || '') ? 'yillik' : /rapor/i.test(kind || '') ? 'rapor' : /gelmedi/i.test(kind || '') ? 'gelmedi' : 'izin';
const dur = (h) => { const t = (x) => { const q = String(x).split(':'); return +q[0] * 60 + +q[1]; }; let m = t(h[1]) - t(h[0]); if (m <= 0) m += 1440; return m / 60; };
const range = (hours, s) => `${hours[s][0]}–${hours[s][1]}`;
const esc = (s) => C.esc(s);
const first = (n) => String(n || '').split(' ')[0];

// ------------------------------------------------------------------ durum
const V = {
  loaded: false, sub: 'plan', company: null, staff: [], leaves: [],
  week: null, row: null, plan: { asg: {}, locks: {} }, hours: null, adj: [], edit: null,
  saveT: null, saving: false, draft: { type: 'cover', pos: '', slot: 'og', days: 'all', op: 'min', n: 1, lvl: 'any' },
  adjDraft: { kind: 'eksik', hours: '2', note: '' }, editHours: false,
  cal: { pid: null, ym: null, sel: [], note: '' }, month: null, puan: null, grps: [], editRule: null, ruleConfirm: null, grpConfirm: null, posConfirm: null
};
function cfgFrom(c) {
  c = c || {};
  const legacy = Array.isArray(c.positions) ? c.positions : DEF_POS;
  const groups = (Array.isArray(c.groups) ? c.groups : [{ id: 'g1', name: 'Genel', positions: legacy, hours: c.hours }])
    .map((g) => ({ id: String(g.id), name: String(g.name || 'Grup'), positions: Array.isArray(g.positions) ? g.positions : [], hours: g.hours && g.hours.ac ? g.hours : (c.hours && c.hours.ac ? c.hours : DEF_HOURS) }));
  return {
    groups, positions: groups.flatMap((g) => g.positions),
    loose: (Array.isArray(c.loose_positions) ? c.loose_positions : []).filter((x) => !groups.some((g) => g.positions.includes(x))),
    rules: Array.isArray(c.rules) ? c.rules : DEF_RULES,
    holiday_pay: c.holiday_pay || {},
    holiday_extra: Array.isArray(c.holiday_extra) ? c.holiday_extra : [],
    offdays: c.offdays && typeof c.offdays === 'object' ? c.offdays : {},
    daily: c.daily && typeof c.daily === 'object' ? c.daily : {},
    weekly_limit: c.weekly_limit == null ? 45 : Number(c.weekly_limit) || 0,
    templates: Array.isArray(c.templates) ? c.templates : []
  };
}
let _cfgKey = null, _cfgVal = null;
const cfg = () => { const sc = V.company && V.company.shift_config; if (sc !== _cfgKey || !_cfgVal) { _cfgKey = sc; _cfgVal = cfgFrom(sc); } return _cfgVal; };
const grpById = (id, c) => (c || cfg()).groups.find((g) => g.id === id);
const groupOf = (pos, c) => (c || cfg()).groups.find((g) => g.positions.includes(pos));
const posMatch = (rp, xp) => { if (String(rp).startsWith('g:')) { const g = grpById(rp.slice(2)); return !!g && g.positions.includes(xp); } return rp === xp; };
const posLabel = (pos, c) => { if (String(pos).startsWith('g:')) { const g = grpById(pos.slice(2), c); return (g ? g.name : 'Silinmiş grup') + ' (tüm grup)'; } return pos; };
function hoursFor(gid, wh, c) {
  if (wh && wh.g && wh.g[gid] && wh.g[gid].ac) return wh.g[gid];
  if (wh && wh.ac && !wh.g) return wh; // eski kayıt
  const g = grpById(gid, c); return (g && g.hours) || DEF_HOURS;
}
const hoursPos = (pos, wh, c) => { c = c || cfg(); const g = groupOf(pos, c); return hoursFor(g ? g.id : '', wh === undefined ? V.hours : wh, c); };
const weekHours = () => { const out = { g: {} }; cfg().groups.forEach((g) => { out.g[g.id] = JSON.parse(JSON.stringify(hoursFor(g.id, V.hours))); }); return out; };
const saveGroups = (groups, extra) => { const inG = groups.flatMap((g) => g.positions); const loose = ((extra && extra.loose_positions) || cfg().loose).filter((x) => !inG.includes(x)); return saveCfg(Object.assign({ groups, positions: inG }, extra || {}, { loose_positions: loose })); };
const allPositions = () => { const out = []; const push = (x) => { if (x && !out.includes(x)) out.push(x); }; cfg().groups.forEach((g) => g.positions.forEach(push)); cfg().loose.forEach(push); V.staff.forEach((p) => Object.keys(p.levels || {}).forEach(push)); return out; };
const loosePositions = () => allPositions().filter((x) => !groupOf(x));
const selGroup = () => {
  const gs = (V.grps || []).map((id) => grpById(id)).filter(Boolean); if (!gs.length) return null;
  return { id: gs.map((g) => g.id).join(','), ids: gs.map((g) => g.id), name: gs.map((g) => g.name).join(' + '), positions: gs.flatMap((g) => g.positions) };
};
const shownGroups = () => { const s = selGroup(); return s ? s.ids.map((id) => grpById(id)) : cfg().groups; };
// vardiya saati: elle girilmişse o; kişinin günlük saati varsa dilime göre kısaltılır (açılış/öğlen başa, kapanış sona hizalı)
const hm2 = (t) => { const q = String(t).split(':'); return +q[0] * 60 + +q[1]; };
const mm2 = (m) => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
// günlük net (mola hariç) saat: kişiye özel değer; yoksa haftalık sınır ÷ çalışma günü (5 dk'ya aşağı yuvarlı); 'slot' = kalıp kadar
function netDaily(pid, c) {
  c = c || cfg(); const d = (c.daily || {})[pid];
  if (d === 'slot') return 0; if (d) return Number(d);
  const lim = Number(c.weekly_limit); if (!lim) return 0;
  const p = V.staff.find((x) => x.id === pid), t = p ? (p.target_days ?? 5) : 5; if (!t) return 0;
  return Math.floor(lim * 60 / t / 5) * 5 / 60;
}
const shiftMin = (pid, base, c, brkH) => { const n = pid ? netDaily(pid, c) : 0; return n ? Math.round((n + (brkH !== undefined ? brkH : breakH(pid))) * 60) : Math.round(dur(base) * 60); };
const nearSlot = (start, pos) => { const H = hoursPos(pos); return SL.slice().sort((a, b) => { const da = Math.abs(hm2(H[a][0]) - hm2(start)), db = Math.abs(hm2(H[b][0]) - hm2(start)); return Math.min(da, 1440 - da) - Math.min(db, 1440 - db); })[0]; };
const cellH = (x, wh, c, pid, brkH) => {
  if (x.h && x.h.length === 2 && x.h[0] && x.h[1]) return x.h;
  const base = hoursPos(x.p, wh, c)[x.s];
  if (!pid || !netDaily(pid, c)) return base;
  const len = shiftMin(pid, base, c, brkH);
  return x.s === 'ka' ? [mm2(hm2(base[1]) - len), base[1]] : [base[0], mm2(hm2(base[0]) + len)];
};
// çalışan ekranı: yayınlanan plandaki hesaplanmış saat
const pubH = (x, wh, CE) => (x.h && x.h[0] ? x.h : x.hh && x.hh[0] ? x.hh : hoursPos(x.p, wh, CE)[x.s]);
const inGroupStaff = (p, grp, a) => !grp || Object.keys(p.levels || p.pos || {}).some((k) => grp.positions.includes(k)) || (a && DN.some((_, d) => { const x = a[p.id + '|' + d]; return x && grp.positions.includes(x.p); }));
async function saveCfg(patch) {
  const next = Object.assign({}, (V.company && V.company.shift_config) || {}, patch);
  const { error } = await C.S.sb.from('companies').update({ shift_config: next }).eq('id', C.S.me.company.id);
  if (error) { C.toast(C.errMsg(error)); return false; }
  V.company.shift_config = next; return true;
}
function holidays(year) {
  const c = cfg(), out = {};
  NATIONAL.concat((RELIGIOUS[year] || []).map((x) => x)).forEach(([md, name, half, pay]) => {
    const iso = `${year}-${md}`;
    out[iso] = { iso, name, half: !!half, pay2x: pay === 'normal' || half ? false : true };
  });
  c.holiday_extra.filter((h) => h.iso.startsWith(String(year))).forEach((h) => { out[h.iso] = { iso: h.iso, name: h.name, half: false, pay2x: true, extra: true }; });
  Object.keys(out).forEach((k) => { if (k in c.holiday_pay) out[k].pay2x = !!c.holiday_pay[k]; });
  return out;
}
const planStaff = () => V.staff.filter((p) => p.active && p.tracked);
const staffG = () => planStaff().map((p) => ({ id: p.id, name: p.full_name, pos: p.levels || {}, target: p.target_days ?? 5, fixed: p.fixed_slot || '' }));
function leaveMapWeek(ws) {
  const m = {};
  V.leaves.forEach((l) => { for (let d = 0; d < 7; d++) { const iso = addD(ws, d); if (iso >= l.day_from && iso <= l.day_to) m[l.user_id + '|' + d] = lcode(l.kind); } });
  return m;
}
const G = () => ({ staff: staffG(), rules: cfg().rules, offd: cfg().offdays, leave: leaveMapWeek(V.week), asg: V.plan.asg || {}, locks: V.plan.locks || {} });
const isOff = (pid, d) => { const o = cfg().offdays[pid]; return Array.isArray(o) && o.includes(d); };

// ------------------------------------------------------------------ plan motoru
function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const lvlOk = (want, have) => !!have && (want === 'any' || (want === 'AB' ? have === 'A' || have === 'B' : want === have));
const daysOf = (r) => r.days === 'wd' ? [0, 1, 2, 3, 4] : r.days === 'we' ? [5, 6] : [0, 1, 2, 3, 4, 5, 6];
const slotsOf = (r) => r.slot === 'all' ? SL : [r.slot];
function count(g, a, d, s, pos, lvl) { let n = 0; g.staff.forEach((p) => { const x = a[p.id + '|' + d]; if (x && x.s === s && posMatch(pos, x.p) && lvlOk(lvl, p.pos[x.p])) n++; }); return n; }
const hasPos = (p, rp, lvl) => Object.keys(p.pos).some((k) => posMatch(rp, k) && lvlOk(lvl, p.pos[k]));
function cnt(a, pid) { let n = 0; for (let d = 0; d < 7; d++) if (a[pid + '|' + d]) n++; return n; }
function closings(a, pid) { let n = 0; for (let d = 0; d < 7; d++) { const x = a[pid + '|' + d]; if (x && x.s === 'ka') n++; } return n; }

function attempt(g, rnd) {
  const on = g.rules.filter((r) => r.on);
  const has = (t) => on.some((r) => r.type === t);
  const clopen = has('clopen'), pair = has('pair'), fair = has('fair');
  const maxD = on.filter((r) => r.type === 'maxdays').reduce((m, r) => Math.min(m, r.n), 7);
  const maxRules = on.filter((r) => r.type === 'cover' && r.op === 'max');
  const never = on.filter((r) => r.type === 'person' && r.mode === 'never' && Array.isArray(r.pdays));
  const must = on.filter((r) => r.type === 'person' && r.mode === 'must' && Array.isArray(r.pdays));
  const a = {}, off = {};
  Object.keys(g.locks).forEach((k) => { if (g.locks[k]) { if (g.asg[k]) a[k] = g.asg[k]; else off[k] = true; } });
  // art arda haftalık izin: her kişiye bitişik bir izin bloğu seç
  if (on.some((r) => r.type === 'consecoff')) g.staff.forEach((p) => {
    if (!Object.keys(p.pos).length) return;
    const avail = [0, 1, 2, 3, 4, 5, 6].filter((d) => !g.leave[p.id + '|' + d]);
    const offN = Math.max(0, avail.length - p.target); if (!offN) return;
    const fixed = (g.offd && g.offd[p.id]) || [], opts = [];
    for (let s0 = 0; s0 + offN <= 7; s0++) {
      const blk = []; for (let d = s0; d < s0 + offN; d++) blk.push(d);
      if (blk.some((d) => g.leave[p.id + '|' + d] || a[p.id + '|' + d])) continue;
      if (fixed.some((d) => !blk.includes(d))) continue;
      opts.push(blk);
    }
    if (!opts.length) return;
    opts[Math.floor(rnd() * opts.length)].forEach((d) => { off[p.id + '|' + d] = true; });
  });
  const ok = (p, d, s, pos) => {
    if (!p.pos[pos]) return false;
    if (p.fixed && p.fixed !== s) return false;
    const k = p.id + '|' + d;
    if (a[k] || off[k] || g.leave[k]) return false;
    if (cnt(a, p.id) >= p.target) return false;
    if (g.offd && Array.isArray(g.offd[p.id]) && g.offd[p.id].includes(d)) return false;
    if (clopen) {
      const prev = a[p.id + '|' + (d - 1)], next = a[p.id + '|' + (d + 1)];
      if (s === 'ac' && prev && prev.s === 'ka') return false;
      if (s === 'ka' && next && next.s === 'ac') return false;
    }
    for (const r of maxRules) {
      if (posMatch(r.pos, pos) && slotsOf(r).includes(s) && daysOf(r).includes(d) && lvlOk(r.lvl, p.pos[pos]) && count(g, a, d, s, r.pos, r.lvl) >= r.n) return false;
    }
    if (pair && p.pos[pos] === 'C' && count(g, a, d, s, pos, 'AB') === 0) return false;
    for (const r of never) if (r.pid === p.id && r.pdays.includes(d) && (r.slot === 'all' || r.slot === s)) return false;
    return true;
  };
  // kişiye özel “mutlaka çalışır”
  must.forEach((r) => {
    const p = g.staff.find((x) => x.id === r.pid); if (!p) return;
    r.pdays.forEach((d) => {
      if (a[p.id + '|' + d]) return;
      const slots = (r.slot === 'all' ? SL : [r.slot]).slice().sort(() => rnd() - 0.5);
      for (const s of slots) { const pos = Object.keys(p.pos).find((k) => ok(p, d, s, k)); if (pos) { a[p.id + '|' + d] = { s, p: pos }; return; } }
    });
  });
  const demand = [];
  on.filter((r) => r.type === 'cover' && r.op === 'min').forEach((r) => daysOf(r).forEach((d) => slotsOf(r).forEach((s) => demand.push({ d, s, pos: r.pos, lvl: r.lvl, n: r.n, pr: (r.lvl === 'any' ? 1 : 0) + rnd() * 0.5 }))));
  demand.sort((x, y) => x.pr - y.pr);
  demand.forEach((q) => {
    let guard = 0;
    while (count(g, a, q.d, q.s, q.pos, q.lvl) < q.n && guard++ < 12) {
      let best = null, bs = 1e9;
      g.staff.forEach((p) => {
        const cps = Object.keys(p.pos).filter((k) => posMatch(q.pos, k) && lvlOk(q.lvl, p.pos[k]) && ok(p, q.d, q.s, k));
        if (!cps.length) return;
        const sc = cnt(a, p.id) * 1.6 + (fair && q.s === 'ka' ? closings(a, p.id) * 1.4 : 0) + Object.keys(p.pos).length * 0.4 + rnd() * 2.6;
        if (sc < bs) { bs = sc; best = { p, cp: cps[Math.floor(rnd() * cps.length)] }; }
      });
      if (!best) break;
      a[best.p.id + '|' + q.d] = { s: q.s, p: best.cp };
    }
  });
  // önce deneyimliler: C'ler yanına A/B gelince yerleşebilsin; iki tur
  const rank = (p) => Math.max(...Object.values(p.pos).map((l) => ({ A: 0, B: 1, C: 2 }[l] ?? 1)), 0);
  const fillOrder = g.staff.map((p) => ({ p, k: rank(p) + rnd() * 0.9 })).sort((x, y) => x.k - y.k).map((x) => x.p);
  fillOrder.concat(fillOrder).forEach((p) => {
    let guard = 0;
    while (cnt(a, p.id) < p.target && guard++ < 8) {
      let best = null, bs = 1e9;
      for (let d = 0; d < 7; d++) Object.keys(p.pos).forEach((pos) => SL.forEach((s) => {
        if (!ok(p, d, s, pos)) return;
        const sc = count(g, a, d, s, pos, 'any') * 1.2 + (fair && s === 'ka' ? closings(a, p.id) * 0.8 : 0) + rnd() * 1.4;
        if (sc < bs) { bs = sc; best = { d, s, pos }; }
      }));
      if (!best) break;
      a[p.id + '|' + best.d] = { s: best.s, p: best.pos };
    }
  });
  return a;
}
function generate(g, seed) {
  const rnd = rng(seed); let best = null;
  for (let t = 0; t < 80; t++) {
    const a = attempt(g, rnd), ev = evaluate(Object.assign({}, g, { asg: a }));
    const sc = ev.hard * 1000 + ev.softScore;
    if (!best || sc < best.sc) best = { a, sc };
    if (t > 12 && best.sc < 1000) break;
  }
  return best.a;
}
function ruleText(r) {
  if (r.type === 'person') {
    const p = V.staff.find((x) => x.id === r.pid), nm = p ? p.full_name : 'Silinmiş kişi', dd = r.pdays || [];
    const dt = dd.length === 7 ? 'her gün' : dd.length === 5 && [0, 1, 2, 3, 4].every((x) => dd.includes(x)) ? 'hafta içi' : dd.length === 2 && dd.includes(5) && dd.includes(6) ? 'hafta sonu' : dd.length ? dd.slice().sort().map((x) => DN[x]).join(', ') : '(gün seçilmedi)';
    if (r.mode === 'never') return r.slot === 'all' ? `${nm}: ${dt} çalışmaz` : `${nm}: ${dt} ${SN[r.slot]} vardiyasına yazılmaz`;
    return r.slot === 'all' ? `${nm}: ${dt} mutlaka çalışır` : `${nm}: ${dt} mutlaka ${SN[r.slot]} yapar`;
  }
  if (r.type === 'consecoff') return 'Herkesin haftalık izni art arda olur (izin günleri bölünmez)';
  if (r.type === 'pair') return 'C seviyesi yalnız bırakılmaz: aynı dilim ve pozisyonda yanında A veya B olmalı';
  if (r.type === 'clopen') return 'Kapanış yapan, ertesi gün açılışa yazılmaz';
  if (r.type === 'maxdays') return `Kimse haftada ${r.n} günden fazla çalışmaz (Personel kodlarında daha fazla gün verilen kişi hariç)`;
  if (r.type === 'fair') return 'Kapanışlar kişiler arasında eşit dağıtılır (tercih)';
  const lv = { any: 'kişi', A: 'A seviye', B: 'B seviye', C: 'C seviye', AB: 'A veya B seviye' }[r.lvl];
  const dy = { all: 'her gün', wd: 'hafta içi', we: 'hafta sonu' }[r.days];
  return `${posLabel(r.pos)} · ${r.slot === 'all' ? 'Tüm dilimler' : SN[r.slot]} · ${dy} ${r.op === 'min' ? 'en az' : 'en fazla'} ${r.n} ${lv}`;
}
function evaluate(g) {
  const a = g.asg, list = [], soft = [], badCells = {}, badCov = {}, byRule = {}, dayBad = [0, 0, 0, 0, 0, 0, 0];
  const nm = (pid) => { const p = g.staff.find((x) => x.id === pid); return p ? first(p.name) : '?'; };
  const add = (rid, title, why, cells, cov, d, pos) => { list.push({ title, why, pos, cells: cells || [] }); byRule[rid] = (byRule[rid] || 0) + 1; (cells || []).forEach((k) => { badCells[k] = 1; }); (cov || []).forEach((k) => { badCov[k] = 1; }); if (d !== undefined) dayBad[d]++; };
  const LT = (c) => c === 'rapor' ? 'raporlu' : c === 'gelmedi' ? 'gelmedi' : 'izinli';
  g.rules.filter((r) => r.on).forEach((r) => {
    if (r.type === 'cover') {
      daysOf(r).forEach((d) => slotsOf(r).forEach((s) => {
        const c = count(g, a, d, s, r.pos, r.lvl), lt = r.lvl === 'any' ? 'kişi' : r.lvl === 'AB' ? 'A/B' : r.lvl;
        if (r.op === 'min' && c < r.n) {
          const gone = g.staff.filter((p) => hasPos(p, r.pos, r.lvl) && g.leave[p.id + '|' + d]).map((p) => nm(p.id) + ' ' + LT(g.leave[p.id + '|' + d]));
          add(r.id, `${DN[d]} ${SN[s]} · ${posLabel(r.pos)}: ${lt} ${c}/${r.n}`, gone.length ? `Uygun kişiler: ${gone.join(', ')}. Başka uygun kişi kalmadı.` : 'Uygun kişilerin gün hakkı dolu ya da başka bir kurala takılıyor.', [], [d + '|' + s + '|' + r.pos], d, r.pos);
        }
        if (r.op === 'max' && c > r.n) add(r.id, `${DN[d]} ${SN[s]} · ${posLabel(r.pos)}: ${c} kişi (en fazla ${r.n})`, 'Fazla kişi yazılmış.', [], [d + '|' + s + '|' + r.pos], d, r.pos);
      }));
    }
    if (r.type === 'pair') {
      for (let d = 0; d < 7; d++) SL.forEach((s) => cfg().positions.forEach((pos) => {
        const cs = g.staff.filter((p) => { const x = a[p.id + '|' + d]; return x && x.s === s && x.p === pos && p.pos[pos] === 'C'; });
        if (cs.length && count(g, a, d, s, pos, 'AB') === 0) add(r.id, `${DN[d]} ${SN[s]} · ${pos}: C yalnız`, cs.map((p) => nm(p.id)).join(', ') + ' yanında A veya B yok.', cs.map((p) => p.id + '|' + d), [d + '|' + s + '|' + pos], d, pos);
      }));
    }
    if (r.type === 'consecoff') g.staff.forEach((p) => {
      if (!Object.keys(p.pos).length) return;
      const S = [0, 1, 2, 3, 4, 5, 6].filter((d) => !a[p.id + '|' + d] && !g.leave[p.id + '|' + d]); if (S.length < 2) return;
      for (let d = S[0]; d <= S[S.length - 1]; d++) if (a[p.id + '|' + d]) { add(r.id, `${nm(p.id)}: haftalık izni bölünmüş`, `İzin günleri ${S.map((x) => DN[x]).join(', ')}; art arda olmalı.`, S.map((x) => p.id + '|' + x), [], S[0]); break; }
    });
    if (r.type === 'clopen') g.staff.forEach((p) => { for (let d = 0; d < 6; d++) { const x = a[p.id + '|' + d], y = a[p.id + '|' + (d + 1)]; if (x && y && x.s === 'ka' && y.s === 'ac') add(r.id, `${nm(p.id)}: kapanıştan sonra açılış`, `${DN[d]} kapanış, ${DN[d + 1]} açılış.`, [p.id + '|' + d, p.id + '|' + (d + 1)], [], d + 1); } });
    if (r.type === 'maxdays') g.staff.forEach((p) => { const n = cnt(a, p.id), lim = Math.max(r.n, p.target || 0); if (n > lim) add(r.id, `${nm(p.id)}: ${n} gün`, `Haftalık sınır ${lim} gün.`, [0, 1, 2, 3, 4, 5, 6].filter((d) => a[p.id + '|' + d]).map((d) => p.id + '|' + d), []); });
  });
  g.rules.filter((r) => r.on && r.type === 'person' && Array.isArray(r.pdays)).forEach((r) => {
    const p = g.staff.find((x) => x.id === r.pid); if (!p) return;
    r.pdays.forEach((d) => {
      const k = p.id + '|' + d, x = a[k];
      if (r.mode === 'never' && x && (r.slot === 'all' || x.s === r.slot)) add(r.id, `${nm(p.id)}: ${DN[d]} ${r.slot === 'all' ? 'çalışmamalı' : SN[r.slot] + ' yapmamalı'}`, 'Kişiye özel kural.', [k], [], d);
      if (r.mode === 'must' && (!x || (r.slot !== 'all' && x.s !== r.slot))) add(r.id, `${nm(p.id)}: ${DN[d]} ${r.slot === 'all' ? 'çalışmalı' : SN[r.slot] + ' yapmalı'}`, g.leave[k] ? 'O gün izin/rapor kaydı var.' : 'Gün hakkı ya da başka bir kural engelliyor.', [k], [], d);
    });
  });
  g.staff.forEach((p) => { const o = g.offd && g.offd[p.id]; if (Array.isArray(o)) o.forEach((d) => { const k = p.id + '|' + d; if (a[k]) add('off', `${nm(p.id)}: ${DN[d]} sabit haftalık izni ama vardiyada`, '“Personel kodları”ndaki haftalık izin günü.', [k], [], d); }); });
  g.staff.forEach((p) => { for (let d = 0; d < 7; d++) { const k = p.id + '|' + d; if (a[k] && g.leave[k]) add('leave', `${nm(p.id)}: ${DN[d]} ${LT(g.leave[k])} ama vardiyada`, 'İzin/rapor kaydıyla çakışıyor.', [k], [], d); } });
  let softScore = 0;
  if (g.rules.some((r) => r.on && r.type === 'fair')) {
    const cl = g.staff.filter((p) => !p.fixed && Object.keys(p.pos).length).map((p) => ({ n: closings(a, p.id), p }));
    const avg = cl.reduce((s, x) => s + x.n, 0) / Math.max(1, cl.length);
    cl.forEach((x) => { softScore += (x.n - avg) * (x.n - avg); });
    const hi = cl.filter((x) => x.n >= 4);
    if (hi.length) soft.push({ title: 'Kapanış yükü: ' + hi.map((x) => nm(x.p.id) + ' ' + x.n).join(', '), why: 'Haftada 4+ kapanış. “Değiştir” ile daha dengeli bir kombinasyon arayabilirsin.' });
  }
  return { list, soft, badCells, badCov, byRule, dayBad, hard: list.length, softScore };
}
const breakH = (pid) => { const p = V.staff.find((x) => x.id === pid); const m = p && p.break_allowance_min != null ? p.break_allowance_min : (V.company && V.company.break_allowance_min != null ? V.company.break_allowance_min : 60); return (Number(m) || 0) / 60; };
function cellAdj(pid, d) {
  const iso = addD(V.week, d), x = (V.plan.asg || {})[pid + '|' + d], base = x ? dur(cellH(x, undefined, undefined, pid)) : 0;
  let net = base, gel = false, minus = false, plus = false; const tags = [];
  V.adj.filter((a) => a.user_id === pid && a.day === iso).forEach((a) => {
    const h = Number(a.hours) || 0;
    if (a.kind === 'gelmedi') { net -= base; gel = true; tags.push('Gelmedi'); }
    else if (a.kind === 'eksik') { net -= h; minus = true; tags.push('−' + hNum(h) + ' sa'); }
    else { net += h; plus = true; tags.push('+' + hNum(h) + ' sa ekstra'); }
  });
  net = Math.max(0, net);
  const brk = net > 0 ? breakH(pid) : 0;
  return { base, net, work: Math.max(0, net - brk), baseWork: base > 0 ? Math.max(0, base - breakH(pid)) : 0, brk, tags, gel, minus, plus };
}

// ------------------------------------------------------------------ veri
async function loadBase() {
  const S = C.S;
  const [comp, staff, leaves] = await Promise.all([
    S.sb.from('companies').select('*').eq('id', S.me.company.id).single(),
    S.sb.from('profiles').select('*').eq('company_id', S.me.company.id).order('full_name'),
    S.sb.from('leaves').select('*').eq('company_id', S.me.company.id).gte('day_to', `${+todayIso().slice(0, 4) - 1}-01-01`).order('day_from', { ascending: false })
  ]);
  const err = comp.error || staff.error || leaves.error; if (err) throw err;
  V.company = comp.data; V.staff = staff.data; V.leaves = leaves.data;
  if (!V.week) V.week = monday(todayIso());
  if (!V.cal.ym) V.cal.ym = todayIso().slice(0, 7);
  if (!V.month) V.month = todayIso().slice(0, 7);
  if (!V.cal.pid && planStaff()[0]) V.cal.pid = planStaff()[0].id;
  if (!V.draft.pos) V.draft.pos = cfg().positions[0] || '';
  V.grps = (V.grps || []).filter((id) => grpById(id));
  V.loaded = true;
}
async function reloadLeaves() {
  const { data, error } = await C.S.sb.from('leaves').select('*').eq('company_id', C.S.me.company.id).gte('day_to', `${+todayIso().slice(0, 4) - 1}-01-01`).order('day_from', { ascending: false });
  if (!error) V.leaves = data;
}
async function loadWeek(ws) {
  V.week = ws; V.edit = null;
  const S = C.S;
  const [w, adj] = await Promise.all([
    S.sb.from('shift_weeks').select('*').eq('company_id', S.me.company.id).eq('week_start', ws).maybeSingle(),
    S.sb.from('shift_adjust').select('*').eq('company_id', S.me.company.id).gte('day', ws).lte('day', addD(ws, 6)).order('day')
  ]);
  if (w.error) throw w.error; if (adj.error) throw adj.error;
  V.row = w.data; V.adj = adj.data;
  V.plan = (w.data && w.data.plan && w.data.plan.asg) ? { asg: w.data.plan.asg, locks: w.data.plan.locks || {} } : { asg: {}, locks: {} };
  V.hours = (w.data && w.data.hours && (w.data.hours.ac || w.data.hours.g)) ? w.data.hours : null;
}
function scheduleSave() {
  clearTimeout(V.saveT);
  V.saveT = setTimeout(savePlan, 500);
}
async function savePlan() {
  const S = C.S;
  Object.keys(V.plan.asg || {}).forEach((k) => { const x = V.plan.asg[k]; x.hh = cellH(Object.assign({}, x, { h: null }), undefined, undefined, k.split('|')[0]); });
  const rec = { company_id: S.me.company.id, week_start: V.week, plan: V.plan, hours: weekHours(), updated_at: new Date().toISOString() };
  const { data, error } = await S.sb.from('shift_weeks').upsert(rec, { onConflict: 'company_id,week_start' }).select().single();
  if (error) { C.toast('Plan kaydedilemedi: ' + C.errMsg(error)); return; }
  V.row = data;
  const chip = document.getElementById('v-pubchip'); if (chip) chip.outerHTML = pubChip();
  const pb = document.getElementById('v-pubbtn'); if (pb) pb.textContent = pubLabel();
}
const samePlan = () => V.row && V.row.published_plan && JSON.stringify(V.row.published_plan) === JSON.stringify(V.plan) && JSON.stringify(V.row.published_hours || {}) === JSON.stringify(weekHours());
function pubChip() {
  const cls = !V.row || !V.row.published_plan ? 'st-off' : samePlan() ? 'st-working' : 'st-break';
  const t = !V.row || !V.row.published_plan ? 'Taslak · çalışanlar görmüyor' : samePlan() ? 'Yayında · çalışanlar görüyor' : 'Yayında · yayınlanmamış değişiklik var';
  return `<span class="chip ${cls}" id="v-pubchip"><i></i>${t}</span>`;
}
const pubLabel = () => !V.row || !V.row.published_plan ? 'Yayınla' : samePlan() ? 'Yayınlandı' : 'Değişiklikleri yayınla';

// ------------------------------------------------------------------ yönetici ekranı
async function adminTab(box) {
  box.innerHTML = '<p class="muted">Vardiya yükleniyor…</p>';
  try {
    if (!V.loaded) await loadBase();
    if (V._weekLoaded !== V.week) { await loadWeek(V.week); V._weekLoaded = V.week; }
    if (V.sub === 'puan') await loadMonth();
    draw();
  } catch (e) {
    box.innerHTML = `<div class="err">${esc(C.errMsg(e))}${/shift_|levels|column|relation/i.test(String(e && e.message)) ? '<br><b>Veritabanı güncellemesi yapılmamış olabilir.</b> supabase/update_vardiya.sql dosyasını SQL Editor’de çalıştır.' : ''}</div>`;
  }
}
function draw() {
  const box = document.getElementById('admin-main'); if (!box || C.S.tab !== 'shift') return;
  const y = window.scrollY;
  const subs = [['plan', 'Haftalık plan'], ['rules', 'Kurallar'], ['staff', 'Personel kodları'], ['leave', 'İzin · Rapor · Gelmedi'], ['puan', 'Aylık puantaj']];
  const body = V.sub === 'plan' ? planHtml() : V.sub === 'rules' ? rulesHtml() : V.sub === 'staff' ? staffHtml() : V.sub === 'leave' ? leaveHtml() : puanHtml();
  box.innerHTML = `<div class="row between" style="flex-wrap:wrap"><div class="col" style="gap:4px"><h1 class="h1">Vardiya</h1><span class="small muted">Kuralları yaz, planı sistem kursun; beğenmezsen değiştir ya da elle düzelt.</span></div></div>
    <nav class="vsub" aria-label="Vardiya bölümleri">${subs.map(([k, t]) => `<button class="${V.sub === k ? 'on' : ''}" data-vx="sub" data-a="${k}" aria-current="${V.sub === k ? 'page' : 'false'}">${t}</button>`).join('')}</nav>
    ${body}`;
  window.scrollTo(0, y);
}

// ---- grup seçici (plan ve puantaj)
function grpChips() {
  const G0 = cfg().groups, sel = V.grps || [];
  const chips = [['all', 'Tüm gruplar', !sel.length]].concat(G0.map((g) => [g.id, g.name, sel.includes(g.id)]));
  return `<div class="row" role="group" aria-label="Grup seçimi" style="flex-wrap:wrap;gap:6px;align-items:center"><span class="small muted" style="font-weight:600">Grup:</span>${chips.map(([k, t, on]) => `<button class="btn sm ${on ? '' : 'line'}" data-vx="grp" data-a="${esc(k)}" aria-pressed="${on}">${on && k !== 'all' ? '✓ ' : ''}${esc(t)}</button>`).join('')}${G0.length < 2 ? '<button class="btn sm ghost" data-vx="sub" data-a="staff">+ Grup oluştur</button><span class="xs muted">Şu an tek grup var. “Personel kodları → Gruplar”dan Mutfak, Bar gibi gruplar aç.</span>' : '<span class="xs muted">Birden fazla grup seçebilirsin.</span>'}</div>`;
}
const violInGroup = (v, grp) => !grp || (v.pos ? ((String(v.pos).startsWith('g:') && grp.ids.includes(v.pos.slice(2))) || grp.positions.includes(v.pos)) : v.cells.some((k) => { const p = V.staff.find((x) => x.id === k.split('|')[0]); return p && inGroupStaff(p, grp, V.plan.asg); }));

// ---- yazıyla komut: “Batuhan’ı çarşamba 12.00’ye al”, “Sude’nin iznini bir gün sonraya kaydır” …
const TRL = (x) => String(x || '').toLocaleLowerCase('tr');
const DAYW = [['pazartesi', 0], ['pzt', 0], ['pts', 0], ['salı', 1], ['sali', 1], ['çarşamba', 2], ['carsamba', 2], ['çarsamba', 2], ['carşamba', 2], ['çarş', 2], ['perşembe', 3], ['persembe', 3], ['perş', 3], ['cumartesi', 5], ['cmt', 5], ['ctesi', 5], ['cuma', 4], ['pazar', 6], ['sal', 1], ['çar', 2], ['per', 3], ['cum', 4], ['paz', 6]];
const SUFX = ['nın', 'nin', 'nun', 'nün', 'yla', 'yle', 'ya', 'ye', 'yı', 'yi', 'yu', 'yü', 'ın', 'in', 'un', 'ün', 'ı', 'i', 'u', 'ü', 'a', 'e', 'la', 'le', 'dan', 'den', 'tan', 'ten', 'da', 'de', 'ta', 'te'];
const NUMW = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6 };
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
function dayOfWord(w) {
  const base = w.split("'")[0];
  for (const [k, d] of DAYW) if (base === k || (base.startsWith(k) && base.length - k.length <= 3 && k.length >= 3)) return d;
  return null;
}
function variants(w) {
  const b = w.split("'")[0], out = [b];
  SUFX.forEach((s) => { if (b.length - s.length >= 3 && b.endsWith(s)) out.push(b.slice(0, -s.length)); });
  return out;
}
function findPeople(sent) {
  const staff = V.staff.filter((p) => p.active), low = TRL(sent), found = [];
  staff.forEach((p) => { const full = TRL(p.full_name); const i = low.indexOf(full); if (full.includes(' ') && i >= 0) found.push({ p, at: i }); });
  const words = low.split(/\s+/); let at = 0;
  words.forEach((w) => {
    const pos = low.indexOf(w, at); at = pos + w.length;
    if (w.length < 3 || dayOfWord(w) !== null) return;
    const vs = variants(w);
    let best = null, bd = 9;
    staff.forEach((p) => {
      const fn = TRL(first(p.full_name));
      vs.forEach((v) => { const dd = v === fn ? 0 : (v.length >= 4 && fn.length >= 4 ? lev(v, fn) : 9); if (dd < bd) { bd = dd; best = p; } });
    });
    if (best && bd <= 1 && !found.some((f) => f.p.id === best.id)) {
      const amb = staff.filter((p) => TRL(first(p.full_name)) === TRL(first(best.full_name))).length > 1;
      found.push({ p: best, at: pos, amb });
    }
  });
  return found.sort((x, y) => x.at - y.at);
}
const toMin = (t) => { const q = t.split(':'); return +q[0] * 60 + +q[1]; };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return p2(Math.floor(m / 60)) + ':' + p2(m % 60); };
function parseCommands(text) {
  const prot = String(text).replace(/(\d{1,2})[.:](\d{2})/g, (_, h, m) => `${p2(+h)}:${m}`).replace(/[’`´]/g, "'");
  const sents = prot.split(/[\n!?;]+|\.(?=\s|$)/).map((x) => x.trim()).filter(Boolean);
  const out = [];
  const today = todayIso(), ti = diffD(V.week, today);
  sents.forEach((sent) => {
    const low = TRL(sent), words = low.replace(/[,()]/g, ' ').split(/\s+/).filter(Boolean);
    const ppl = findPeople(sent), person = ppl[0] && ppl[0].p;
    const days = []; words.forEach((w) => { const d = dayOfWord(w); if (d !== null && !days.includes(d)) days.push(d); });
    if (/\byarın/.test(low) && ti + 1 >= 0 && ti + 1 <= 6) days.push(ti + 1);
    if (/\bbugün/.test(low) && ti >= 0 && ti <= 6) days.push(ti);
    const times = (prot.match(/\b\d{2}:\d{2}\b/g) || []).filter((t) => sent.includes(t));
    const tm = low.match(/\bsaat\s*(\d{1,2})\b/) || low.match(/\b(\d{1,2})'(?:e|a|ye|ya|de|da|te|ta|den|dan)\b/);
    if (!times.length && tm && +tm[1] <= 24) times.push(p2(+tm[1]) + ':00');
    const slot = /açılış|acilis|sabah/.test(low) ? 'ac' : /öğle|ogle|ara vardiya/.test(low) ? 'og' : /kapanış|kapanis|akşam|aksam|gece/.test(low) ? 'ka' : null;
    const numM = low.match(/\b(\d)\s*gün/) || low.match(/\b(bir|iki|üç|dört|beş|altı)\s*gün/);
    const k = numM ? (NUMW[numM[1]] || +numM[1]) : 1;
    const ambNote = ppl.some((x) => x.amb) ? ' (aynı isimde birden fazla kişi var; tam adını yaz)' : '';
    const A = { sent, desc: '', err: '', run: null };
    const lmap = leaveMapWeek(V.week);
    if (/(art ?arda|ard ?arda|ardarda|arka arkaya|bitişik|ayırma|bölme|bölünme)/.test(low) && (!person || /herkes|kimse/.test(low))) {
      const has = cfg().rules.find((r) => r.type === 'consecoff');
      A.desc = has && has.on ? 'Kural zaten açık: herkesin haftalık izni art arda' : 'Kural eklenecek: herkesin haftalık izni art arda olur (izin günleri bölünmez)';
      A.rule = true; A.run = async () => saveCfg({ rules: has ? cfg().rules.map((r) => r.type === 'consecoff' ? Object.assign({}, r, { on: true }) : r) : cfg().rules.concat([{ id: 'r' + Date.now().toString(36), type: 'consecoff', on: true }]) });
    } else if (!person) {
      A.err = 'Kimden bahsettiğini bulamadım. Çalışanın adını yaz (örn. “Batuhan”).';
    } else if (/(değiş|takas)/.test(low) && ppl.length >= 2) {
      const q = ppl[1].p; if (!days.length) A.err = 'Hangi gün? (örn. “perşembe”)';
      else {
        A.desc = `${person.full_name} ↔ ${q.full_name}: ${days.map((d) => DN[d]).join(', ')} vardiyaları yer değiştirecek`;
        A.run = () => days.forEach((d) => { const a = person.id + '|' + d, b = q.id + '|' + d, xa = V.plan.asg[a], xb = V.plan.asg[b];
          const fit = (x, who) => { if (!x) return null; const lv = who.levels || {}; if (lv[x.p]) return Object.assign({}, x); const g0 = groupOf(x.p), same = Object.keys(lv).find((k) => g0 && g0.positions.includes(k)); return Object.assign({}, x, { p: same || Object.keys(lv)[0] || x.p }); };
          const na = fit(xb, person), nb = fit(xa, q);
          if (na) V.plan.asg[a] = na; else delete V.plan.asg[a]; if (nb) V.plan.asg[b] = nb; else delete V.plan.asg[b];
          V.plan.locks[a] = true; V.plan.locks[b] = true; });
      }
    } else if (/izi?n/.test(low) && /(kaydır|kaydir|ertele|sonraya|ileri|öne|one al|geri|önceye|onceye)/.test(low)) {
      const dir = /(öne|one al|geri|önceye|onceye)/.test(low) ? -1 : 1, step = dir * k;
      const offs = DN.map((_, d) => d).filter((d) => !V.plan.asg[person.id + '|' + d] && !lmap[person.id + '|' + d]);
      if (!Object.keys(V.plan.asg).length) A.err = 'Bu hafta için plan yok; önce planı oluştur.';
      else if (!offs.length) A.err = `${person.full_name} bu hafta hiç haftalık izinli değil.`;
      else {
        const to = offs.map((d) => d + step);
        if (to.some((d) => d < 0 || d > 6)) A.err = `${person.full_name}: izin (${offs.map((d) => DN[d]).join(', ')}) ${Math.abs(step)} gün ${dir > 0 ? 'sonraya' : 'öne'} kayınca hafta dışına çıkıyor.`;
        else if (to.some((d) => lmap[person.id + '|' + d])) A.err = `${person.full_name}: kaydırılacak günde izin/rapor kaydı var.`;
        else {
          A.desc = `${person.full_name}: haftalık izin ${offs.map((d) => DN[d]).join(', ')} → ${to.map((d) => DN[d]).join(', ')}`;
          A.run = () => { const ord = offs.slice().sort((x, y) => step > 0 ? y - x : x - y); ord.forEach((d) => { const a = person.id + '|' + d, b = person.id + '|' + (d + step), xa = V.plan.asg[a], xb = V.plan.asg[b];
            if (xb) V.plan.asg[a] = xb; else delete V.plan.asg[a]; if (xa) V.plan.asg[b] = xa; else delete V.plan.asg[b]; V.plan.locks[a] = true; V.plan.locks[b] = true; }); };
        }
      }
    } else if (/\b(her|hep|sürekli|daima)\b/.test(low) && days.length && /(izin|çalışma|calisma)/.test(low)) {
      const cur = cfg().offdays[person.id] || [], next = cur.concat(days.filter((d) => !cur.includes(d))).sort();
      A.desc = `${person.full_name}: sabit haftalık izin günleri ${next.map((d) => DN[d]).join(', ')} olacak (her hafta)`;
      A.rule = true; A.run = async () => saveCfg({ offdays: Object.assign({}, cfg().offdays, { [person.id]: next }) });
    } else if (days.length && /(izin|çalışmasın|calismasin|çalışmayacak|boşalt|bosalt|çıkar|cikar|\bsil)/.test(low)) {
      A.desc = `${person.full_name}: ${days.map((d) => DN[d]).join(', ')} haftalık izin (vardiya kaldırılacak)`;
      A.run = () => days.forEach((d) => { delete V.plan.asg[person.id + '|' + d]; V.plan.locks[person.id + '|' + d] = true; });
    } else if (days.length && (times.length || slot || /(?:^|\s)(al|koy|yaz|ver|getir|ekle|çalışsın|calissin)(?=\s|$|[.,!?])/.test(low))) {
      const pos = Object.keys(person.levels || {});
      if (!pos.length) A.err = `${person.full_name} kişisinin pozisyonu yok; önce “Personel kodları”ndan ver.`;
      else {
        const parts = [];
        const runs = days.map((d) => {
          const k0 = person.id + '|' + d, ex = V.plan.asg[k0], ps = ex && pos.includes(ex.p) ? ex.p : pos[0], H = hoursPos(ps);
          let s = slot; if (!s && times.length) s = SL.slice().sort((x, y) => Math.abs(toMin(H[x][0]) - toMin(times[0])) - Math.abs(toMin(H[y][0]) - toMin(times[0])))[0]; if (!s) s = ex ? ex.s : 'og';
          let h = null;
          if (times.length >= 2) h = [times[0], times[1]];
          else if (times.length === 1) h = [times[0], fromMin(toMin(times[0]) + shiftMin(person.id, H[s]))];
          if (h && h[0] === H[s][0] && h[1] === H[s][1]) h = null;
          const hh = h || H[s];
          parts.push(`${DN[d]} ${SN[s]} ${hh[0]}–${hh[1]}${pos.length > 1 ? ' · ' + ps : ''}${lmap[k0] ? ' (dikkat: o gün izin/rapor kaydı var)' : ''}`);
          return () => { V.plan.asg[k0] = h ? { s, p: ps, h } : { s, p: ps }; V.plan.locks[k0] = true; };
        });
        A.desc = `${person.full_name}: ${parts.join(', ')}`;
        A.run = () => runs.forEach((f) => f());
      }
    } else if (!days.length) {
      A.err = 'Hangi gün? Gün adını yaz (örn. “çarşamba”).';
    } else {
      A.err = 'Ne yapılacağını anlayamadım. Saat (12.00), dilim (açılış/öğlen/kapanış), “izin” ya da “kaydır” gibi bir ifade ekle.';
    }
    if (A.desc && ambNote) A.desc += ambNote;
    out.push(A);
  });
  return out;
}
function cmdHtml() {
  const C0 = V.cmd;
  return `<section class="card col" style="gap:10px" aria-label="Yazıyla komut">
    <div class="col" style="gap:2px"><h2 class="h2">Yaz, sistem yapsın</h2><span class="xs muted">Örnekler: “Batuhan’ı çarşamba 12.00’ye al” · “Sude’nin iznini bir gün sonraya kaydır” · “Ahmet cuma izinli” · “Elif ile Mert perşembe değişsin” · “Ayşe her pazartesi izinli” · “Herkesin izni art arda olsun”. Her cümleyi nokta ya da yeni satırla ayır.</span></div>
    <form class="col" data-vf="cmd" style="gap:8px"><textarea class="inp" name="t" rows="2" placeholder="Örn. Batuhan’ı çarşamba 12.00’ye al. Sude’nin iznini bir gün sonraya kaydır." style="height:auto;min-height:64px;padding:10px 12px;resize:vertical;font:inherit">${esc((C0 && C0.text) || '')}</textarea>
      <div class="row" style="gap:8px"><button class="btn" type="submit">Anla</button>${C0 ? '<button class="btn line" type="button" data-vx="cmdClear">Temizle</button>' : ''}</div></form>
    ${C0 ? `<div class="col" style="gap:6px">${C0.actions.map((a) => `<div class="alert ${a.err ? '' : 'w'}" style="${a.err ? '' : 'background:#F0FDFA;border-color:#99F6E4'}"><i style="${a.err ? '' : 'background:#0F766E'}"></i><div class="col" style="gap:2px"><span class="xs muted">“${esc(a.sent)}”</span><b class="small">${esc(a.err || a.desc)}</b></div></div>`).join('')}
      ${C0.actions.some((a) => a.run) ? `<div class="row" style="gap:8px"><button class="btn teal" data-vx="cmdApply">Uygula (${C0.actions.filter((a) => a.run).length})</button><span class="xs muted">Plandaki değişen hücreler kilitlenir.</span></div>` : ''}</div>` : ''}
  </section>`;
}

// ---- haftalık plan
function planHtml() {
  const g = G(), ev = evaluate(g), a = g.asg, today = todayIso(), grp = selGroup(), groups = shownGroups();
  const gIdx = (p) => { const k = Object.keys(p.levels || {})[0]; const gg = k ? groupOf(k) : null; return gg ? cfg().groups.indexOf(gg) : 99; };
  const staff = planStaff().filter((p) => inGroupStaff(p, grp, a)).sort((x, y) => gIdx(x) - gIdx(y) || x.full_name.localeCompare(y.full_name, 'tr'));
  const empty = !Object.keys(a).length;
  const noPos = planStaff().filter((p) => !Object.keys(p.levels || {}).length);
  const dayH = [0, 0, 0, 0, 0, 0, 0], dayP = [0, 0, 0, 0, 0, 0, 0];
  let last = null, weekH = 0; const overList = [];
  const rows = staff.map((p) => {
    const pos = Object.keys(p.levels || {}), multi = pos.length > 1, gg = pos[0] ? groupOf(pos[0]) : null, head0 = gg ? gg.name : (pos[0] ? 'Grupsuz pozisyon' : 'Pozisyonu yok');
    let head = '';
    if (head0 !== last) {
      last = head0;
      const gcnt = gg ? staff.filter((q) => { const k0 = Object.keys(q.levels || {})[0]; return k0 && groupOf(k0) === gg; }).length : 0;
      head = `<tr><td colspan="9" class="vgrp"><div class="row between" style="flex-wrap:wrap;gap:8px"><span class="row" style="gap:8px"><i class="vgdot"></i>${esc(head0.toLocaleUpperCase('tr'))}${gg ? `<span class="xs muted" style="font-weight:500;letter-spacing:0">${gcnt} kişi</span>` : ''}${pos[0] ? '' : ' · “Personel kodları”ndan pozisyon ver'}</span>${gg ? `<button class="btn sm teal" data-vx="regenGrp" data-a="${esc(gg.id)}">↻ ${esc(gg.name)} vardiyasını üret</button>` : ''}</div></td></tr>`;
    }
    let hrs = 0, planH = 0, gross = 0;
    const cells = DN.map((dn, d) => {
      const k = p.id + '|' + d, x = a[k], lv = g.leave[k], aj = cellAdj(p.id, d), sel = V.edit === k;
      const other = !!(grp && x && !grp.positions.includes(x.p));
      hrs += aj.work; planH += aj.baseWork; gross += aj.net; dayH[d] += aj.work; if (aj.net > 0) dayP[d]++;
      let top, sub, cls;
      if (x) { const hh = cellH(x, undefined, undefined, p.id); top = SN[x.s]; sub = `${hh[0]}–${hh[1]}${x.h ? ' ✎' : ''}` + (multi || other ? ' · ' + x.p : ''); cls = 's-' + x.s + (other ? ' other' : ''); }
      else if (lv) { top = LK[lv][0]; sub = 'Planlanamaz'; cls = LK[lv][1] + ' dashed'; }
      else { top = aj.plus ? 'Ekstra' : 'Haftalık izin'; sub = aj.plus ? 'Vardiya dışı' : isOff(p.id, d) ? 'Sabit izin günü' : (V.plan.locks[k] ? 'Elle verildi' : '+ vardiya ver'); cls = 's-off' + (isOff(p.id, d) && !aj.plus ? ' fixoff' : ''); }
      const tag = aj.tags.length ? `<span class="adjtag ${aj.gel || (aj.minus && !aj.plus) ? 'neg' : 'pos'}">${esc(aj.tags.join(' · '))}</span>` : '';
      return `<td><button class="vc ${cls}${ev.badCells[k] ? ' bad' : ''}${sel ? ' sel' : ''}${addD(V.week, d) === today ? ' today' : ''}" data-vx="cell" data-a="${k}" aria-label="${esc(p.full_name)}, ${dn}: ${esc(top)}${V.plan.locks[k] ? ', kilitli' : ''}. Değiştirmek için dokun.">
        <span class="row between" style="width:100%;gap:4px"><b>${esc(top)}</b>${V.plan.locks[k] ? '<svg class="ic" style="width:13px;height:13px" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : ''}</span><span>${esc(sub)}</span>${tag}</button></td>`;
    }).join('');
    weekH += hrs;
    const n = cnt(a, p.id), tgt = p.target_days ?? 5;
    return `${head}<tr><th scope="row" class="vname"><b>${esc(p.full_name)}</b><span class="row" style="gap:4px;flex-wrap:wrap">${pos.map((ps) => `<span class="lv lv-${esc(p.levels[ps])}">${esc(ps)} · ${esc(p.levels[ps])}</span>`).join('')}${p.fixed_slot ? `<span class="lv lv-x">Sabit: ${SN[p.fixed_slot]}</span>` : ''}</span></th>${cells}
      ${(() => { const lim = cfg().weekly_limit; if (lim && hrs > lim + 0.01) overList.push({ title: `${p.full_name}: ${hNum(hrs)} sa (haftalık sınır ${lim})`, why: `${hNum(hrs - lim)} saat fazla. Bir günü kısalt ya da günlük saatini düşür.` }); return ''; })()}<td class="vtot"${cfg().weekly_limit && hrs > cfg().weekly_limit + 0.01 ? ' style="background:#FEE2E2"' : ''}><b class="num"${cfg().weekly_limit && hrs > cfg().weekly_limit + 0.01 ? ' style="color:#B91C1C"' : ''}>${hNum(hrs)} sa</b><span class="xs" style="color:${n < tgt ? 'var(--orange)' : 'var(--muted)'};font-weight:600">${n}/${tgt} gün${Math.abs(hrs - planH) > 0.01 ? ' · plan ' + hNum(planH) : ''}</span>${gross ? `<span class="xs muted">mola dahil ${hNum(gross)}</span>` : ''}</td></tr>`;
  }).join('');
  const lockCount = Object.values(V.plan.locks || {}).filter(Boolean).length;
  const ed = V.edit ? editHtml(g, ev) : '';
  const covRow = (label, key, s, match) => `<tr><th scope="row" style="white-space:nowrap">${esc(label)}</th>${DN.map((dn, d) => {
    const lv = g.staff.filter((p) => { const x = a[p.id + '|' + d]; return x && x.s === s && match(x.p); }).map((p) => p.pos[a[p.id + '|' + d].p]).sort();
    return `<td><span class="covc${ev.badCov[d + '|' + s + '|' + key] ? ' bad' : ''}">${lv.length ? lv.length + ' · ' + lv.join(' ') : '0'}</span></td>`;
  }).join('')}</tr>`;
  const cov = groups.map((gg) => `<tr><td colspan="8" class="vgrp">${esc(gg.name.toLocaleUpperCase('tr'))}</td></tr>`
    + SL.map((s) => covRow(`${gg.name} toplam · ${SN[s]}`, 'g:' + gg.id, s, (xp) => gg.positions.includes(xp))).join('')
    + gg.positions.map((pos) => SL.map((s) => covRow(`${pos} · ${SN[s]}`, pos, s, (xp) => xp === pos)).join('')).join('')).join('');
  const viol = ev.list.filter((v) => violInGroup(v, grp)).concat(overList.map((o) => Object.assign({ cells: [] }, o)));
  const hoursBar = groups.map((gg) => { const H = hoursFor(gg.id, V.hours); return `<div class="row small" style="flex-wrap:wrap;gap:8px"><b>${cfg().groups.length > 1 ? esc(gg.name) + ' saatleri:' : 'Bu haftanın saatleri:'}</b>${SL.map((s) => `<span class="lv s-${s}" style="font-size:13px;padding:5px 10px">${SN[s]} ${range(H, s)}</span>`).join('')}</div>`
    + (V.editHours ? `<div class="card row" style="flex-wrap:wrap;gap:18px">${SL.map((s) => `<div class="row" style="gap:8px"><b class="small" style="min-width:60px">${SN[s]}</b><input class="inp" type="time" value="${H[s][0]}" data-vc="hour" data-g="${esc(gg.id)}" data-a="${s}" data-b="0" aria-label="${esc(gg.name)} ${SN[s]} başlangıç" style="height:42px;width:120px"><span>–</span><input class="inp" type="time" value="${H[s][1]}" data-vc="hour" data-g="${esc(gg.id)}" data-a="${s}" data-b="1" aria-label="${esc(gg.name)} ${SN[s]} bitiş" style="height:42px;width:120px"></div>`).join('')}</div>` : ''); }).join('');
  return `
    <div class="card row between" style="flex-wrap:wrap;gap:12px">
      <div class="row" style="flex-wrap:wrap">
        <div class="row" style="gap:4px"><button class="iconbtn" data-vx="week" data-a="-7" aria-label="Önceki hafta">${C.I.back}</button><b style="font-size:17px;padding:0 8px">${weekLabel(V.week)}</b><button class="iconbtn" data-vx="week" data-a="7" aria-label="Sonraki hafta" style="transform:scaleX(-1)">${C.I.back}</button></div>
        ${pubChip()}
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        ${lockCount ? `<button class="btn sm line" data-vx="clearLocks">Kilitleri kaldır (${lockCount})</button>` : ''}
        <button class="btn sm teal" data-vx="regen">${grp ? (empty ? esc(grp.name) + ' planını oluştur' : esc(grp.name) + ' için değiştir') : (empty ? 'Planı oluştur' : 'Değiştir')}</button>
        <button class="btn sm line" data-vx="planPdf" ${empty ? 'disabled' : ''}>PDF indir</button>
        <button class="btn sm" data-vx="publish" id="v-pubbtn" ${empty ? 'disabled' : ''}>${pubLabel()}</button>
      </div>
    </div>
    ${cmdHtml()}
    ${grpChips()}
    ${grp ? `<span class="xs muted">Sadece “${esc(grp.name)}” grubu gösteriliyor. “Değiştir” yalnızca bu grubun vardiyalarını yeniden dağıtır; diğer gruplar olduğu gibi kalır.</span>` : ''}
    ${hoursBar}
    <div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn sm line" data-vx="toggleHours">${V.editHours ? 'Bitti' : 'Bu haftanın saatlerini düzenle'}</button>${V.editHours ? '<label class="row small" style="gap:6px"><input type="checkbox" data-vc="hoursDefault"> Sonraki haftalar için de varsayılan yap</label>' : ''}</div>
    ${noPos.length && !grp ? `<div class="alert w"><i></i><span class="small"><b>${noPos.length} kişinin pozisyonu yok:</b> ${esc(noPos.map((p) => p.full_name).join(', '))}. Plana dahil olmaları için “Personel kodları” bölümünden pozisyon ve seviye ver.</span></div>` : ''}
    <div class="split">
      <div class="main col" style="gap:16px">
        ${ed}
        ${!staff.length ? `<div class="card muted">${grp ? 'Bu grupta pozisyonu olan çalışan yok. “Personel kodları”ndan pozisyon ver.' : 'Henüz plana alınacak çalışan yok.'}</div>` : ''}
        <section class="card" style="padding:0" aria-label="Haftalık vardiya planı">
          <div class="tbl-wrap"><table class="tbl vgrid" style="min-width:960px">
            <thead><tr><th scope="col" style="padding-left:16px;width:170px">Çalışan</th>${DN.map((dn, d) => `<th scope="col"><span class="col" style="gap:1px"><b style="color:var(--ink)">${dn} ${dShort(addD(V.week, d))}</b>${empty ? '' : (() => { const nb = viol.filter((v) => ev.list.indexOf(v) >= 0 && (v.cells.some((k) => k.endsWith('|' + d)) || v.title.startsWith(dn + ' '))).length; return `<span class="xs" style="font-weight:700;color:${nb ? '#B91C1C' : 'var(--green)'}">${nb ? nb + ' sorun' : 'Tamam'}</span>`; })()}</span></th>`).join('')}<th scope="col" style="text-align:right;padding-right:16px;background:var(--bg);color:var(--ink)">Çalışma saati<br><span class="xs muted" style="font-weight:500">mola hariç</span></th></tr></thead>
            <tbody>${rows}
              <tr class="vsum"><th scope="row" style="padding-left:16px">Günlük toplam<br><span class="xs muted" style="font-weight:500">mola hariç</span></th>${dayH.map((h, d) => `<td><b class="num">${hNum(h)} sa</b><br><span class="xs muted">${dayP[d]} kişi</span></td>`).join('')}<td class="vtot" style="background:var(--line)"><b class="num" style="font-size:17px">${hNum(weekH)} sa</b></td></tr>
            </tbody></table></div>
          <div class="row xs" style="flex-wrap:wrap;gap:12px;padding:12px 16px;border-top:1px solid var(--soft)"><span class="lv s-ac">Açılış</span><span class="lv s-og">Öğlen</span><span class="lv s-ka">Kapanış</span><span class="lv l-yillik">İzin / rapor</span><span><b style="color:#DC2626">Kırmızı çerçeve</b> = kural bozuk</span><span>Hücreye dokun → elle değiştir, kilitle, gelmedi/eksik/ekstra yaz</span><span><b>Basılı tut ve sürükle</b> → aynı kişinin iki gününü yer değiştir</span></div>
        </section>
        ${empty ? '' : `<section class="card" style="padding:0" aria-label="Dilim kapsaması"><div style="padding:16px 16px 4px"><h2 class="h2">Dilim kapsaması</h2><span class="small muted">Her dilimde hangi seviyeden kaç kişi var. Kırmızı = bir kural sağlanmıyor.</span></div>
          <div class="tbl-wrap"><table class="tbl vcov" style="min-width:860px"><tbody>${cov}</tbody></table></div></section>`}
      </div>
      <aside class="side">
        ${empty ? `<section class="card col"><h2 class="h2">Bu hafta için plan yok</h2><span class="small muted">“Planı oluştur”a bas; sistem kurallara göre kişileri dağıtsın. Sonra istediğin kadar “Değiştir”e basabilir ya da hücreleri elle düzeltebilirsin.</span></section>` : `
        <section class="card col" style="gap:6px;background:${viol.length ? '#FEF2F2' : '#F0FDF4'}"><h2 class="h2">${viol.length ? viol.length + ' yerde kural sağlanamadı' : 'Tüm kurallar sağlandı'}${grp ? ' · ' + esc(grp.name) : ''}</h2><span class="small">${viol.length ? 'Plan yine de oluşturuldu. Kırmızı hücreye dokunup elle düzelt ya da “Değiştir” ile yeni kombinasyon dene.' : 'Plan yayınlanmaya hazır.'}</span></section>
        ${viol.length || ev.soft.length ? `<section class="card col" style="gap:8px"><h2 class="h2">Sağlanamayanlar</h2>${viol.map((v) => `<div class="alert"><i></i><div class="col" style="gap:2px"><b class="small">${esc(v.title)}</b><span class="xs">${esc(v.why)}</span></div></div>`).join('')}${ev.soft.map((v) => `<div class="alert w"><i></i><div class="col" style="gap:2px"><b class="small">${esc(v.title)}</b><span class="xs">${esc(v.why)}</span></div></div>`).join('')}</section>` : ''}`}
        <section class="card col" style="gap:8px"><h2 class="h2">Plan dışı kayıtlar</h2><span class="xs muted">Eklemek için plandaki hücreye dokun. Saatler toplamdan otomatik düşer/eklenir.</span>
          ${V.adj.map((x) => { const p = V.staff.find((s) => s.id === x.user_id); const d = diffD(V.week, x.day); const neg = x.kind !== 'ekstra'; const aj = cellAdj(x.user_id, d);
            return `<div class="row" style="gap:10px;padding:8px 10px;border-radius:12px;background:var(--bg)"><span class="adjtag ${neg ? 'neg' : 'pos'}" style="min-width:58px;text-align:center">${x.kind === 'gelmedi' ? '−' + hNum(aj.base) : (neg ? '−' : '+') + hNum(x.hours)} sa</span><span class="col grow" style="gap:0"><b class="small">${esc(p ? p.full_name : '')} · ${DN[d]} ${dShort(x.day)}</b><span class="xs muted">${x.kind === 'gelmedi' ? 'Gelmedi' : x.kind === 'eksik' ? 'Eksik saat' : 'Ekstra çalışma'}${x.note ? ' · ' + esc(x.note) : ''}</span></span><button class="btn sm ghost" data-vx="delAdj" data-a="${x.id}" aria-label="Kaydı sil">Sil</button></div>`; }).join('') || '<span class="small muted">Bu hafta kayıt yok.</span>'}
        </section>
      </aside>
    </div>`;
}
function editHtml(g, ev) {
  const [pid, ds] = V.edit.split('|'), d = +ds, p = V.staff.find((x) => x.id === pid); if (!p) return '';
  const k = V.edit, x = V.plan.asg[k], lv = g.leave[k], pos = Object.keys(p.levels || {});
  const opt = (label, sel, val) => `<button class="btn sm ${sel ? '' : 'line'}" data-vx="setCell" data-a="${esc(val)}" aria-pressed="${sel}">${esc(label)}</button>`;
  const opts = [opt('Haftalık izin', !x, '')].concat(pos.flatMap((ps) => SL.map((s) => opt(`${SN[s]} ${range(hoursPos(ps), s)}${pos.length > 1 ? ' · ' + ps : ''}`, !!x && x.s === s && x.p === ps, s + '|' + ps)))).join('');
  const mine = V.adj.filter((a) => a.user_id === pid && a.day === addD(V.week, d));
  const warn = lv ? `Bu gün “${LK[lv][0]}” kaydı var. Vardiya atarsan kural ihlali olarak işaretlenir.` : isOff(pid, d) ? 'Bu gün kişinin sabit haftalık izin günü. Vardiya verirsen uyarı olarak işaretlenir.' : p.fixed_slot ? `Sabit vardiyası: ${SN[p.fixed_slot]}. Otomatik planda hep bu dilim verilir.` : '';
  const A = V.adjDraft;
  return `<section class="card col" style="border:2px solid var(--ink);gap:12px" aria-label="Hücre düzenleme">
    <div class="row between" style="flex-wrap:wrap"><div class="col" style="gap:2px"><b style="font-size:16px">${esc(p.full_name)} · ${DN[d]} ${dLong(addD(V.week, d))}</b><span class="small muted">${pos.map((ps) => ps + ' ' + p.levels[ps]).join(', ') || 'Pozisyon yok'} · bu hafta ${cnt(V.plan.asg, pid)}/${p.target_days ?? 5} gün</span></div>
      <div class="row" style="gap:8px"><button class="btn sm line" data-vx="toggleLock">${V.plan.locks[k] ? 'Kilidi aç' : 'Kilitle'}</button><button class="btn sm ghost" data-vx="closeEdit">Kapat</button></div></div>
    ${warn ? `<div class="alert w"><i></i><span class="small">${esc(warn)}</span></div>` : ''}
    ${pos.length ? `<div class="row" style="flex-wrap:wrap;gap:8px">${opts}</div><span class="xs muted">Elle yaptığın seçim otomatik kilitlenir; “Değiştir”e bastığında bu hücre korunur.</span>` : '<span class="small muted">Bu kişiye önce “Personel kodları”ndan pozisyon ver.</span>'}
    ${pos.length && cfg().templates.length ? `<div class="col" style="gap:6px"><b class="small">Saat kalıbı <span class="muted" style="font-weight:500">· dokun, vardiya o saatle verilsin</span></b><div class="row" style="flex-wrap:wrap;gap:6px">${cfg().templates.map((t, i) => { const ps = x && pos.includes(x.p) ? x.p : pos[0], e = t.end || mm2(hm2(t.start) + shiftMin(pid, hoursPos(ps)[nearSlot(t.start, ps)])); const on = x && x.h && x.h[0] === t.start && x.h[1] === e; return `<button class="btn sm ${on ? '' : 'line'}" data-vx="useTpl" data-a="${i}" aria-pressed="${!!on}">${esc(t.name ? t.name + ' · ' : '')}${t.start}–${e}</button>`; }).join('')}</div></div>` : ''}
    ${x ? (() => { const hh = cellH(x, undefined, undefined, pid), def = cellH(Object.assign({}, x, { h: null }), undefined, undefined, pid), nd = netDaily(pid); return `<div class="col" style="gap:8px;border-top:1px solid var(--line);padding-top:12px"><b class="small">Bu vardiyanın saati <span class="muted" style="font-weight:500">· girişi seç, çıkış ${nd ? 'otomatik (' + hNum(nd) + ' sa + ' + Math.round(breakH(pid) * 60) + ' dk mola)' : 'kalıp süresine göre'} ayarlanır</span></b>
      <div class="row" style="flex-wrap:wrap;gap:8px;align-items:center"><input class="inp" type="time" value="${hh[0]}" data-vc="cellH" data-b="0" aria-label="Başlangıç saati" style="height:44px;width:120px"><span>–</span><input class="inp" type="time" value="${hh[1]}" data-vc="cellH" data-b="1" aria-label="Bitiş saati" style="height:44px;width:120px"><span class="small muted">${hNum(dur(hh))} saat · net ${hNum(Math.max(0, dur(hh) - breakH(pid)))}</span>
      ${x.h ? `<button class="btn sm line" data-vx="cellHReset">Varsayılana dön (${def[0]}–${def[1]})</button>` : `<span class="xs muted">Varsayılan: ${def[0]}–${def[1]}</span>`}</div></div>`; })() : ''}
    <div class="col" style="gap:10px;border-top:1px solid var(--line);padding-top:12px">
      <b class="small">Plan dışı kayıt <span class="muted" style="font-weight:500">· gelmedi, eksik saat ya da ekstra çalışma</span></b>
      ${mine.map((m) => `<div class="row between small" style="padding:8px 10px;border-radius:10px;background:var(--bg)"><b>${m.kind === 'gelmedi' ? 'Gelmedi' : m.kind === 'eksik' ? 'Eksik ' + hNum(m.hours) + ' sa' : 'Ekstra ' + hNum(m.hours) + ' sa'}${m.note ? ' · ' + esc(m.note) : ''}</b><button class="btn sm line" data-vx="delAdj" data-a="${m.id}">Sil</button></div>`).join('')}
      <form class="row" data-vf="adj" style="flex-wrap:wrap;gap:10px;align-items:flex-end">
        <label class="f">Tür<select class="inp" name="kind" data-vc="adjKind" style="height:44px"><option value="eksik" ${A.kind === 'eksik' ? 'selected' : ''}>Eksik saat (geç geldi / erken çıktı)</option><option value="gelmedi" ${A.kind === 'gelmedi' ? 'selected' : ''}>Gelmedi (tüm vardiya düşer)</option><option value="ekstra" ${A.kind === 'ekstra' ? 'selected' : ''}>Ekstra çalıştı (vardiya dışı)</option></select></label>
        ${A.kind !== 'gelmedi' ? `<label class="f">Saat<input class="inp" type="number" name="hours" min="0.5" max="16" step="0.5" value="${esc(A.hours)}" style="height:44px;width:96px"></label>` : ''}
        <label class="f grow" style="min-width:160px">Not<input class="inp" name="note" placeholder="Örn. 2 saat erken çıktı" style="height:44px"></label>
        <button class="btn" type="submit" style="min-height:44px">Kaydet</button>
      </form>
    </div>
  </section>`;
}

// ---- kurallar
function ruleGroup(r) {
  if (r.type !== 'cover') return null;
  if (String(r.pos).startsWith('g:')) return grpById(r.pos.slice(2)) || null;
  return groupOf(r.pos) || null;
}
function rulesHtml() {
  const R = cfg().rules, D = V.draft, ev = Object.keys(V.plan.asg || {}).length ? evaluate(G()) : null, groups = cfg().groups;
  const sel = (name, val, opts) => `<select class="inp" data-vc="draft" data-a="${name}" style="height:44px">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const badge = { consecoff: ['İzin düzeni', 's-off'], cover: ['Kapsama', 's-ka'], pair: ['Eşleşme', 's-ac'], clopen: ['Kişi sınırı', 's-off'], maxdays: ['Kişi sınırı', 's-off'], fair: ['Tercih', 's-og'], person: ['Kişiye özel', 'l-izin'] };
  const card = (r) => {
    const nb = ev ? ev.byRule[r.id] || 0 : 0, editing = V.editRule === r.id;
    return `<div class="row between vrule${r.on ? '' : ' off'}" style="flex-wrap:wrap${editing ? ';border:2px solid var(--ink)' : ''}">
      <div class="col grow" style="gap:6px;min-width:220px"><span class="row" style="gap:6px;flex-wrap:wrap"><span class="lv ${badge[r.type][1]}">${badge[r.type][0]}</span><span class="xs" style="font-weight:600;color:${!r.on ? 'var(--muted)' : nb ? '#B91C1C' : 'var(--green)'}">${editing ? 'Düzenleniyor…' : !r.on ? 'Kapalı' : r.type === 'fair' ? 'Puanlamada kullanılır' : !ev ? '' : nb ? 'Bu haftaki planda ' + nb + ' yerde bozuk' : 'Bu haftaki planda sağlanıyor'}</span></span><b class="small" style="line-height:1.4">${esc(ruleText(r))}</b></div>
      ${V.ruleConfirm === r.id
        ? `<div class="row" style="gap:6px"><span class="small" style="color:#991B1B;font-weight:600">Silinsin mi?</span><button class="btn sm" style="background:#B91C1C" data-vx="ruleDelYes" data-a="${esc(r.id)}">Sil</button><button class="btn sm line" data-vx="ruleDelNo">Vazgeç</button></div>`
        : `<div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ${r.on ? 'teal' : 'line'}" data-vx="ruleToggle" data-a="${esc(r.id)}" aria-pressed="${r.on}">${r.on ? 'Açık' : 'Kapalı'}</button><button class="btn sm line" data-vx="ruleEdit" data-a="${esc(r.id)}">Düzenle</button><button class="btn sm line" data-vx="ruleDel" data-a="${esc(r.id)}" style="color:#B91C1C">Sil</button></div>`}</div>`;
  };
  const sections = groups.map((gg) => ({ title: gg.name, sub: 'Bu grubun pozisyonları için kurallar', list: R.filter((r) => ruleGroup(r) === gg), gid: gg.id }))
    .concat([{ title: 'Kişiye özel', sub: 'Belirli bir çalışan için: o gün çalışmaz, o dilime yazılmaz ya da mutlaka çalışır', list: R.filter((r) => r.type === 'person'), person: true }])
    .concat([{ title: 'Herkes için', sub: 'Tüm gruplarda geçerli kişi kuralları', list: R.filter((r) => r.type !== 'cover' && r.type !== 'person'), general: true }])
    .concat(R.some((r) => r.type === 'cover' && !ruleGroup(r)) ? [{ title: 'Pozisyonu silinmiş kurallar', sub: 'Pozisyonu artık olmadığı için çalışmaz; düzenle ya da sil', list: R.filter((r) => r.type === 'cover' && !ruleGroup(r)) }] : []);
  const posOpts = groups.map((gg) => `<optgroup label="${esc(gg.name)}"><option value="g:${esc(gg.id)}" ${D.pos === 'g:' + gg.id ? 'selected' : ''}>${esc(gg.name)} — tüm grup</option>${gg.positions.map((p) => `<option value="${esc(p)}" ${D.pos === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>`).join('') + (loosePositions().length ? `<optgroup label="Grupsuz">${loosePositions().map((p) => `<option value="${esc(p)}" ${D.pos === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>` : '');
  const edit = V.editRule && R.find((r) => r.id === V.editRule);
  return `<div class="split">
    <div class="main col" style="gap:16px">
      ${sections.map((sec) => `<section class="card col" style="gap:10px"><div class="row between" style="flex-wrap:wrap"><div class="col" style="gap:2px"><h2 class="h2">${esc(sec.title)}</h2><span class="xs muted">${esc(sec.sub)}</span></div><span class="small muted">${sec.list.filter((r) => r.on).length} aktif · ${sec.list.length} kural</span></div>
        ${sec.list.map(card).join('') || '<span class="small muted">Kural yok.</span>'}
        ${sec.gid ? `<button class="btn sm line" style="align-self:flex-start" data-vx="ruleNewFor" data-a="${esc(sec.gid)}">+ ${esc(sec.title)} için kural ekle</button>` : ''}${sec.person ? '<button class="btn sm line" style="align-self:flex-start" data-vx="ruleNewPerson">+ Kişiye özel kural ekle</button>' : ''}${sec.general ? '<button class="btn sm line" style="align-self:flex-start" data-vx="ruleNewGeneral">+ Herkes için kural ekle</button>' : ''}</section>`).join('')}
      ${(V.company.shift_config || {}).rules ? '' : '<span class="xs muted">Bunlar örnek kurallar. Değiştirdiğin anda şirketine kaydedilir.</span>'}
    </div>
    <aside class="side"><section class="card col" id="v-rulebuilder" style="gap:12px${edit ? ';border:2px solid var(--ink)' : ''}"><h2 class="h2">${edit ? 'Kuralı düzenle' : 'Kural ekle'}</h2>
      <label class="f">Kural türü${sel('type', D.type, [['cover', 'Kişi sayısı / seviye şartı'], ['pair', 'C seviyesi yalnız kalmasın'], ['clopen', 'Kapanıştan sonra açılış yok'], ['maxdays', 'Haftalık gün sınırı'], ['fair', 'Kapanışları eşit dağıt'], ['consecoff', 'Haftalık izinler art arda'], ['person', 'Kişiye özel']])}</label>
      ${D.type === 'person' ? `<div class="col" style="gap:12px">
        <label class="f">Çalışan<select class="inp" data-vc="draft" data-a="pid" style="height:44px"><option value="">Seç…</option>${planStaff().map((p) => `<option value="${p.id}" ${D.pid === p.id ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></label>
        <div class="formgrid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
          <label class="f">Ne olsun${sel('mode', D.mode || 'never', [['never', 'Çalışmaz / yazılmaz'], ['must', 'Mutlaka çalışır']])}</label>
          <label class="f">Dilim${sel('slot', D.slot, [['all', 'Hepsi'], ['ac', 'Açılış'], ['og', 'Öğlen'], ['ka', 'Kapanış']])}</label>
        </div>
        <div class="col" style="gap:6px"><span class="f" style="margin:0">Günler</span><div class="row" style="flex-wrap:wrap;gap:6px">${DN.map((dn, d) => { const on = (D.pdays || []).includes(d); return `<button class="btn sm ${on ? '' : 'line'}" data-vx="draftDay" data-a="${d}" aria-pressed="${on}" style="min-width:52px">${dn}</button>`; }).join('')}</div>
          <div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn sm ghost" data-vx="draftDays" data-a="all">Her gün</button><button class="btn sm ghost" data-vx="draftDays" data-a="wd">Hafta içi</button><button class="btn sm ghost" data-vx="draftDays" data-a="we">Hafta sonu</button><button class="btn sm ghost" data-vx="draftDays" data-a="none">Temizle</button></div></div>
      </div>` : ''}
      ${D.type === 'cover' ? `<div class="formgrid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <label class="f" style="grid-column:1/-1">Grup / pozisyon<select class="inp" data-vc="draft" data-a="pos" style="height:44px">${posOpts || '<option value="">Önce pozisyon ekle</option>'}</select></label>
        <label class="f">Dilim${sel('slot', D.slot, [['ac', 'Açılış'], ['og', 'Öğlen'], ['ka', 'Kapanış'], ['all', 'Tüm dilimler']])}</label>
        <label class="f">Günler${sel('days', D.days, [['all', 'Her gün'], ['wd', 'Hafta içi'], ['we', 'Hafta sonu']])}</label>
        <label class="f">Şart${sel('op', D.op, [['min', 'En az'], ['max', 'En fazla']])}</label>
        <label class="f">Kişi sayısı${sel('n', D.n, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, n]))}</label>
        <label class="f" style="grid-column:1/-1">Seviye${sel('lvl', D.lvl, [['any', 'Herhangi'], ['A', 'A (deneyimli)'], ['B', 'B (az deneyimli)'], ['C', 'C (öğrenen)'], ['AB', 'A veya B']])}</label></div>` : ''}
      ${D.type === 'maxdays' ? `<label class="f">En fazla gün${sel('n', D.n, [3, 4, 5, 6].map((n) => [n, n]))}</label>` : ''}
      <div class="col" style="gap:4px;padding:12px 14px;border-radius:12px;background:var(--bg)"><span class="xs muted" style="font-weight:600">Önizleme</span><b class="small" style="line-height:1.4">${esc(ruleText(D))}</b></div>
      <div class="row" style="gap:8px"><button class="btn grow" data-vx="ruleAdd">${edit ? 'Değişikliği kaydet' : 'Kuralı ekle'}</button>${edit ? '<button class="btn line" data-vx="ruleEditCancel">Vazgeç</button>' : ''}</div>
      <span class="xs muted" style="line-height:1.45">“Tüm grup” seçersen o gruptaki herhangi bir pozisyon sayılır (örn. Mutfak · Açılış en az 2 kişi). “A” tam olarak A demek; “A veya B” ikisinden birini kabul eder.</span>
    </section></aside></div>`;
}

// ---- personel kodları
function staffHtml() {
  const groups = cfg().groups, grp = selGroup();
  const chip = (x) => V.posConfirm === x
    ? `<span class="row vposchip" style="border-color:#DC2626;background:#FEF2F2"><b class="small">${esc(x)} silinsin mi?</b><button class="btn sm" style="background:#B91C1C" data-vx="posRemoveYes" data-a="${esc(x)}">Sil</button><button class="btn sm line" data-vx="posRemoveNo">Vazgeç</button></span>`
    : `<span class="row vposchip"><b class="small">${esc(x)}</b><button class="xbtn" data-vx="posRemove" data-a="${esc(x)}" aria-label="${esc(x)} pozisyonunu sil">×</button></span>`;
  const ALL = allPositions();
  const gcard = (gg) => `<div class="vgcard">
      <div class="row between" style="flex-wrap:wrap;gap:8px">
        <label class="f grow" style="min-width:160px;margin:0">Grup adı<input class="inp" value="${esc(gg.name)}" data-vc="grpName" data-a="${esc(gg.id)}" style="height:44px;font-weight:700;font-size:16px"></label>
        ${V.grpConfirm === gg.id
          ? `<span class="row" style="gap:6px;flex-wrap:wrap"><span class="small" style="color:#991B1B;font-weight:600">Grup silinsin mi?</span><button class="btn sm" style="background:#B91C1C" data-vx="grpDelYes" data-a="${esc(gg.id)}">Sil</button><button class="btn sm line" data-vx="grpDelNo">Vazgeç</button></span>`
          : `<button class="btn sm line" data-vx="grpDel" data-a="${esc(gg.id)}" style="color:#B91C1C;align-self:flex-end">Grubu sil</button>`}
      </div>
      <div class="col" style="gap:6px"><span class="xs muted" style="font-weight:600">Bu gruptaki pozisyonlar · tikle</span>
        <div class="vticks">${ALL.map((x) => { const on = gg.positions.includes(x), og = on ? null : groupOf(x);
          return `<button class="vtick${on ? ' on' : ''}" data-vx="posTick" data-a="${esc(gg.id)}" data-b="${esc(x)}" role="checkbox" aria-checked="${on}"><i aria-hidden="true">${on ? '✓' : ''}</i><span>${esc(x)}</span>${og ? `<small>${esc(og.name)}’da</small>` : ''}</button>`; }).join('') || '<span class="small muted">Henüz pozisyon yok. Aşağıdan ekle.</span>'}</div>
      </div>
      <div class="col" style="gap:6px"><span class="xs muted" style="font-weight:600">Varsayılan vardiya saatleri</span>
        ${SL.map((s) => `<div class="row" style="gap:6px"><span class="lv s-${s}" style="min-width:60px;justify-content:center;flex-shrink:0">${SN[s]}</span><input class="inp" type="time" value="${gg.hours[s][0]}" data-vc="ghour" data-g="${esc(gg.id)}" data-a="${s}" data-b="0" aria-label="${esc(gg.name)} ${SN[s]} başlangıç" style="height:40px;flex:1;min-width:0;max-width:130px"><span>–</span><input class="inp" type="time" value="${gg.hours[s][1]}" data-vc="ghour" data-g="${esc(gg.id)}" data-a="${s}" data-b="1" aria-label="${esc(gg.name)} ${SN[s]} bitiş" style="height:40px;flex:1;min-width:0;max-width:130px"></div>`).join('')}
      </div>
    </div>`;
  const posWarn = () => { const x = V.posConfirm; if (!x) return ''; const u = V.staff.filter((p) => p.levels && p.levels[x]).length, r = cfg().rules.filter((q) => q.pos === x).length; return `<span class="small" style="color:#991B1B">${u || r ? `“${esc(x)}” silinince ${u ? u + ' kişiden bu pozisyon kaldırılır' : ''}${u && r ? ' ve ' : ''}${r ? r + ' kural silinir' : ''}.` : `“${esc(x)}” kimseye verilmemiş, kuralda da yok.`}</span>`; };
  const loose = loosePositions();
  const rows = V.staff.filter((p) => p.active && inGroupStaff(p, grp)).map((p) => {
    const lv = p.levels || {}, have = Object.keys(lv);
    const addOpts = groups.map((gg) => { const can = gg.positions.filter((x) => !have.includes(x)); return can.length ? `<optgroup label="${esc(gg.name)}">${can.map((x) => `<option>${esc(x)}</option>`).join('')}</optgroup>` : ''; }).join('') + (() => { const can = loose.filter((x) => !have.includes(x)); return can.length ? `<optgroup label="Grupsuz">${can.map((x) => `<option>${esc(x)}</option>`).join('')}</optgroup>` : ''; })();
    return `<tr><td style="padding-left:20px"><b>${esc(p.full_name)}</b>${p.tracked ? '' : '<br><span class="xs muted">Takip dışı · planda yok</span>'}</td>
      <td><div class="row" style="flex-wrap:wrap;gap:8px">${have.map((ps) => `<span class="row vposchip"><span class="small">${esc(ps)}</span><select class="inp" data-vc="lvl" data-a="${p.id}" data-b="${esc(ps)}" aria-label="${esc(p.full_name)} ${esc(ps)} seviyesi" style="height:34px;width:58px;font-weight:700;padding:0 6px">${['A', 'B', 'C'].map((l) => `<option ${lv[ps] === l ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="xbtn" data-vx="posDel" data-a="${p.id}" data-b="${esc(ps)}" aria-label="${esc(p.full_name)}: ${esc(ps)} pozisyonunu kaldır">×</button></span>`).join('')}
        ${addOpts ? `<select class="inp" data-vc="posAdd" data-a="${p.id}" aria-label="Pozisyon ekle" style="height:34px;width:auto"><option value="">+ Pozisyon ekle</option>${addOpts}</select>` : ''}</div></td>
      <td><select class="inp" data-vc="target" data-a="${p.id}" aria-label="Haftada kaç gün çalışır" style="height:38px;width:auto">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${(p.target_days ?? 5) === n ? 'selected' : ''}>${n} gün${n < 7 ? ' · ' + (7 - n) + ' izin' : ''}</option>`).join('')}</select></td>
      <td>${(() => { const cur = cfg().daily[p.id], lim = cfg().weekly_limit, t = p.target_days ?? 5, auto = lim && t ? Math.floor(lim * 60 / t / 5) * 5 / 60 : 0; return `<select class="inp" data-vc="daily" data-a="${p.id}" aria-label="Günde kaç saat çalışır" style="height:38px;width:auto"><option value="" ${!cur ? 'selected' : ''}>${auto ? `Otomatik · ${hNum(auto)} sa` : 'Kalıp kadar'}</option><option value="slot" ${cur === 'slot' ? 'selected' : ''}>Kalıp kadar</option>${[4, 5, 6, 7, 7.5, 8, 8.5, 9, 9.5, 10, 11].map((h) => `<option value="${h}" ${Number(cur) === h ? 'selected' : ''}>${hNum(h)} saat</option>`).join('')}</select>${lim && t && Number(cur) * t > lim + 0.01 ? `<br><span class="xs" style="color:#B91C1C;font-weight:600">${t} × ${hNum(Number(cur))} = ${hNum(t * Number(cur))} sa > ${lim}</span>` : ''}`; })()}</td>
      <td>${(() => { const def = V.company && V.company.break_allowance_min != null ? V.company.break_allowance_min : 60, cur = p.break_allowance_min; const opts = [0, 15, 20, 30, 45, 60, 75, 90, 120]; return `<select class="inp" data-vc="brk" data-a="${p.id}" aria-label="Günlük mola" style="height:38px;width:auto"><option value="" ${cur == null ? 'selected' : ''}>Şirket: ${def} dk</option>${opts.concat(cur != null && !opts.includes(cur) ? [cur] : []).map((m) => `<option value="${m}" ${cur != null && +cur === m ? 'selected' : ''}>${m ? m + ' dk' : 'Molasız'}</option>`).join('')}</select>`; })()}</td>
      <td><div class="voff" role="group" aria-label="${esc(p.full_name)} haftalık izin günleri">${DN.map((dn, d) => { const on = isOff(p.id, d); return `<button class="${on ? 'on' : ''}" data-vx="offDay" data-a="${p.id}" data-b="${d}" aria-pressed="${on}" title="${dn}">${dn.slice(0, 2)}</button>`; }).join('')}</div></td>
      <td><select class="inp" data-vc="fixed" data-a="${p.id}" aria-label="Sabit vardiya" style="height:38px;width:auto"><option value="">Yok (döner)</option>${SL.map((s) => `<option value="${s}" ${p.fixed_slot === s ? 'selected' : ''}>Hep ${SN[s]}</option>`).join('')}</select></td>
      <td style="text-align:right;padding-right:20px"><button class="btn sm line" data-vx="openCal" data-a="${p.id}">Gelmedi / rapor işaretle</button></td></tr>`;
  }).join('');
  const C0 = cfg();
  return `<section class="card col" style="gap:12px">
      <div class="col" style="gap:2px"><h2 class="h2">Çalışma süresi ve saat kalıpları</h2><span class="small muted">Günlük saati “Otomatik” olan kişide: haftalık süre ÷ çalışma günü. Örn. 45 saat, 6 gün → 7,5 sa; 5 gün → 9 sa. Vardiya = bu süre + kişinin molası.</span></div>
      <label class="row small" style="gap:8px;font-weight:600;flex-wrap:wrap">Haftalık çalışma süresi (mola hariç)<select class="inp" data-vc="wlimit" style="height:44px;width:auto">${[0, 30, 35, 40, 42, 45, 48, 50, 55, 60].map((h) => `<option value="${h}" ${C0.weekly_limit === h ? 'selected' : ''}>${h ? h + ' saat' : 'Sınır yok'}</option>`).join('')}</select><span class="xs muted" style="font-weight:500">Planda bu süreyi aşan kişi kırmızı uyarı alır.</span></label>
      <div class="col" style="gap:6px"><span class="xs muted" style="font-weight:600">Saat kalıpları · vardiyaya dokununca tek tıkla seçilir</span>
        <div class="row" style="flex-wrap:wrap;gap:8px">${C0.templates.map((t, i) => `<span class="row vposchip"><b class="small">${esc(t.name ? t.name + ' · ' : '')}${t.start}${t.end ? '–' + t.end : ' → otomatik'}</b><button class="xbtn" data-vx="tplDel" data-a="${i}" aria-label="Kalıbı sil">×</button></span>`).join('') || '<span class="small muted">Henüz kalıp yok.</span>'}</div>
        <form class="row" data-vf="tplNew" style="gap:6px;flex-wrap:wrap;align-items:flex-end"><label class="f" style="margin:0">Giriş<input class="inp" type="time" name="start" required style="height:44px;width:120px"></label><label class="f" style="margin:0">Çıkış (boş = otomatik)<input class="inp" type="time" name="end" style="height:44px;width:120px"></label><label class="f" style="margin:0">Ad (isteğe bağlı)<input class="inp" name="name" placeholder="Örn. Ara vardiya" style="height:44px;width:160px"></label><button class="btn sm" type="submit" style="min-height:44px">Kalıp ekle</button></form>
      </div>
    </section>
    <section class="card col" style="gap:12px">
      <div class="row between" style="flex-wrap:wrap;gap:10px"><div class="col" style="gap:2px"><h2 class="h2">Gruplar ve pozisyonlar</h2><span class="small muted">Örn. Mutfak: Aşçı, Pastacı · Bar: Barista, Kasa. Her grubun kendi saatleri, kuralları ve planı olur.</span></div>
        <form class="row" data-vf="grpNew" style="gap:6px"><input class="inp" name="name" placeholder="Yeni grup (örn. Mutfak)" aria-label="Yeni grup adı" style="height:44px;width:210px"><button class="btn sm" type="submit" style="min-height:44px">Grup ekle</button></form></div>
      <div class="vgroups">${groups.map(gcard).join('') || '<span class="small muted">Grup yok. Sağ üstten ekle.</span>'}</div>
      <span class="xs muted">Bir pozisyon tek bir grupta olur. Başka gruptaki bir pozisyonu tiklersen bu gruba taşınır; kişilerdeki seviyeler ve kurallar korunur.</span>
      ${loose.length ? `<div class="alert w"><i></i><span class="small"><b>Grubu olmayan pozisyonlar:</b> ${esc(loose.join(', '))}. Bir grupta tikle.</span></div>` : ''}
    </section>
    <section class="card col" style="gap:10px"><div class="col" style="gap:2px"><h2 class="h2">Pozisyon listesi</h2><span class="small muted">Gruplarda tiklenecek pozisyonlar. Listede olmayan yeni bir görev için buraya bir kez yaz.</span></div>
      <div class="row" style="flex-wrap:wrap;gap:8px">${allPositions().map(chip).join('') || '<span class="small muted">Pozisyon yok.</span>'}</div>
      ${posWarn()}
      <form class="row" data-vf="posNew" style="gap:6px;flex-wrap:wrap"><input class="inp" name="name" placeholder="Yeni pozisyon (örn. Pastacı)" aria-label="Yeni pozisyon adı" style="height:44px;width:240px"><button class="btn sm" type="submit" style="min-height:44px">Ekle</button></form>
    </section>
    ${grpChips()}
    <section class="card" style="padding:0"><div style="padding:16px 20px 6px"><h2 class="h2">Personel kodları${grp ? ' · ' + esc(grp.name) : ''}</h2><span class="small muted">A deneyimli · B az deneyimli · C öğrenen. Birden fazla pozisyonda çalışana her pozisyon için ayrı seviye ver. Değişiklikler anında kaydedilir.</span></div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:1320px"><thead><tr><th style="padding-left:20px">Çalışan</th><th>Pozisyon ve seviye</th><th>Haftada<br>çalışma günü</th><th>Günde çalışma<br><span style="font-weight:500">(mola hariç)</span></th><th>Günlük<br>mola</th><th>Haftalık izin günleri</th><th>Sabit vardiya</th><th><span class="sr">İşlem</span></th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="muted" style="padding:20px">Bu grupta pozisyonu olan çalışan yok.</td></tr>'}</tbody></table></div></section>
    <p class="small muted" style="margin:0">Yeni çalışanlar kayıt olunca burada görünür. “Çalışanlar” sekmesinde mola takibi kapalı olanlar plana alınmaz.</p>`;
}

// ---- izin / rapor / gelmedi takvimi
function leaveHtml() {
  const c = V.cal, P = V.staff.filter((p) => p.active), person = P.find((p) => p.id === c.pid) || P[0];
  if (!person) return '<div class="card muted">Çalışan yok.</div>';
  const Y = +c.ym.slice(0, 4), M = +c.ym.slice(5, 7), n = +monthLast(c.ym).slice(8), f = wdOf(c.ym + '-01'), today = todayIso(), hol = holidays(Y);
  const mine = V.leaves.filter((l) => l.user_id === person.id);
  const stats = { gelmedi: 0, rapor: 0, yillik: 0, izin: 0 };
  let cells = '';
  for (let b = 0; b < f; b++) cells += '<span aria-hidden="true"></span>';
  for (let d = 1; d <= n; d++) {
    const iso = `${c.ym}-${p2(d)}`, rec = mine.find((l) => iso >= l.day_from && iso <= l.day_to), code = rec ? lcode(rec.kind) : null, h = hol[iso];
    if (code) stats[code]++;
    const sel = c.sel.includes(iso);
    cells += `<button class="cald ${code ? LK[code][1] : h ? 'hol' : ''}${sel ? ' sel' : ''}${iso === today ? ' today' : ''}" data-vx="calDay" data-a="${iso}" aria-pressed="${sel}" aria-label="${d} ${MN[M - 1]}${rec ? ', ' + esc(rec.kind) : ''}"><b>${d}</b><span>${rec ? esc(LK[code][0]) : h ? (h.half ? 'Arife' : 'Tatil') : iso === today ? 'Bugün' : ''}</span></button>`;
  }
  const s = c.sel.slice().sort();
  const yUsed = V.leaves.filter((l) => l.user_id === person.id && lcode(l.kind) === 'yillik').reduce((t, l) => {
    const a = l.day_from > `${Y}-01-01` ? l.day_from : `${Y}-01-01`, b = l.day_to < `${Y}-12-31` ? l.day_to : `${Y}-12-31`; return t + (a <= b ? diffD(a, b) + 1 : 0);
  }, 0);
  const act = (kind, label, dot) => `<button class="btn line vact" data-vx="calMark" data-a="${kind}" ${s.length ? '' : 'disabled'}><i style="background:${dot}"></i>${label}</button>`;
  const list = V.leaves.filter((l) => l.day_to >= addD(today, -60)).slice(0, 60);
  return `<section class="card" style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">
      <div class="col" style="flex:999 1 480px;min-width:0;gap:14px">
        <div class="col" style="gap:2px"><h2 class="h2">Takvimden işaretle</h2><span class="small muted">Personeli seç, günlere dokun, sonra ne olduğunu işaretle. Geçmiş ve ileri tarih seçilebilir.</span></div>
        <div class="row between" style="flex-wrap:wrap">
          <label class="row small" style="gap:8px;font-weight:600">Personel<select class="inp" data-vc="calPid" style="height:44px;width:auto;min-width:200px">${P.map((p) => `<option value="${p.id}" ${p.id === person.id ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></label>
          <div class="row" style="gap:4px"><button class="iconbtn" data-vx="calMonth" data-a="-1" aria-label="Önceki ay">${C.I.back}</button><b style="min-width:130px;text-align:center">${MN[M - 1]} ${Y}</b><button class="iconbtn" data-vx="calMonth" data-a="1" aria-label="Sonraki ay" style="transform:scaleX(-1)">${C.I.back}</button></div>
        </div>
        <div class="calg">${DN.map((x) => `<span class="calh">${x}</span>`).join('')}${cells}</div>
      </div>
      <div class="col" style="flex:1 1 260px;min-width:0;gap:12px">
        <div class="col" style="gap:4px;padding:12px 14px;border-radius:14px;background:var(--bg)"><span class="xs muted" style="font-weight:600">Seçili günler</span><b style="line-height:1.4">${s.length ? esc(first(person.full_name)) + ' · ' + s.map((x) => +x.slice(8)).join(', ') + ' ' + MN[M - 1] : 'Takvimden gün seç (birden fazla seçebilirsin)'}</b>${s.length ? '<button class="btn sm line" data-vx="calClear" style="align-self:flex-start">Seçimi temizle</button>' : ''}</div>
        <label class="f">Not (isteğe bağlı)<input class="inp" data-vc="calNote" value="${esc(c.note)}" placeholder="Örn. haber vermedi / doktor raporu" style="height:44px"></label>
        ${act('Gelmedi', 'Gelmedi olarak işaretle', '#DC2626')}${act('Raporlu', 'Raporlu olarak işaretle', '#9333EA')}${act('Yıllık izin', 'Yıllık izin olarak işaretle', '#2563EB')}${act('', 'İşareti kaldır', '#D5D8DF')}
        <div class="formgrid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">${[['Gelmedi', stats.gelmedi], ['Raporlu', stats.rapor], ['Yıllık', stats.yillik]].map(([l, v]) => `<div class="col" style="gap:2px;padding:10px;border:1px solid var(--line);border-radius:12px"><span class="xs muted" style="font-weight:600">${l} · bu ay</span><b class="num" style="font-size:20px">${v}</b></div>`).join('')}</div>
        <span class="xs muted">${esc(first(person.full_name))} bu yıl ${yUsed} gün yıllık izin kullandı. İşaretler plana ve aylık puantaja otomatik işlenir.</span>
      </div>
    </section>
    <section class="card" style="padding:0"><h2 class="h2" style="padding:16px 20px 6px">Son kayıtlar</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th style="padding-left:20px">Çalışan</th><th>Tarih</th><th>Tür</th><th>Not</th><th></th></tr></thead>
      <tbody>${list.map((l) => { const p = V.staff.find((x) => x.id === l.user_id); const code = lcode(l.kind); return `<tr><td style="padding-left:20px"><b>${esc(p ? p.full_name : '')}</b></td><td class="num">${dShort(l.day_from)}${l.day_to !== l.day_from ? ' – ' + dShort(l.day_to) : ''} ${l.day_to.slice(0, 4)}</td><td><span class="lv ${LK[code][1]}">${esc(l.kind)}</span></td><td class="small">${esc(l.note || '')}</td><td style="text-align:right;padding-right:20px"><button class="btn sm ghost" data-vx="leaveDel" data-a="${l.id}">Sil</button></td></tr>`; }).join('') || '<tr><td colspan="5" class="muted" style="padding:20px">Kayıt yok.</td></tr>'}</tbody></table></div></section>`;
}
async function calMark(kind) {
  const S = C.S, pid = V.cal.pid, sel = V.cal.sel.slice().sort(); if (!sel.length) return;
  const sb = S.sb;
  try {
    for (const iso of sel) {
      for (const l of V.leaves.filter((x) => x.user_id === pid && iso >= x.day_from && iso <= x.day_to)) {
        if (l.day_from === iso && l.day_to === iso) { const r = await sb.from('leaves').delete().eq('id', l.id); if (r.error) throw r.error; }
        else if (l.day_from === iso) { const r = await sb.from('leaves').update({ day_from: addD(iso, 1) }).eq('id', l.id); if (r.error) throw r.error; }
        else if (l.day_to === iso) { const r = await sb.from('leaves').update({ day_to: addD(iso, -1) }).eq('id', l.id); if (r.error) throw r.error; }
        else {
          let r = await sb.from('leaves').update({ day_to: addD(iso, -1) }).eq('id', l.id); if (r.error) throw r.error;
          r = await sb.from('leaves').insert({ company_id: l.company_id, user_id: pid, day_from: addD(iso, 1), day_to: l.day_to, kind: l.kind, note: l.note }); if (r.error) throw r.error;
        }
        await reloadLeaves();
      }
    }
    if (kind) {
      const runs = []; sel.forEach((iso) => { const r = runs[runs.length - 1]; if (r && addD(r[1], 1) === iso) r[1] = iso; else runs.push([iso, iso]); });
      const { error } = await sb.from('leaves').insert(runs.map(([a, b]) => ({ company_id: S.me.company.id, user_id: pid, day_from: a, day_to: b, kind, note: V.cal.note || null })));
      if (error) throw error;
    }
    await reloadLeaves();
    const p = V.staff.find((x) => x.id === pid);
    C.toast(`${first(p && p.full_name)} · ${sel.length} gün ${kind ? kind.toLocaleLowerCase('tr') + ' olarak işaretlendi' : 'temizlendi'}`);
    V.cal.sel = []; V.cal.note = ''; V._weekLoaded = null;
  } catch (e) { C.toast(C.errMsg(e)); await reloadLeaves(); }
  draw();
}

// ---- aylık puantaj
async function loadMonth() {
  const S = C.S, ym = V.month, from = ym + '-01', to = monthLast(ym);
  const [rep, weeks, adj] = await Promise.all([
    S.sb.rpc('team_report', { p_from: from, p_to: to }),
    S.sb.from('shift_weeks').select('week_start,published_plan,plan').eq('company_id', S.me.company.id).gte('week_start', addD(from, -6)).lte('week_start', to),
    S.sb.from('shift_adjust').select('*').eq('company_id', S.me.company.id).gte('day', from).lte('day', to)
  ]);
  const err = rep.error || weeks.error || adj.error; if (err) throw err;
  V.puan = { ym, rep: rep.data, weeks: weeks.data, adj: adj.data };
}
function puanData() {
  const P = V.puan, ym = P.ym, Y = +ym.slice(0, 4), n = +monthLast(ym).slice(8), today = todayIso(), hol = holidays(Y);
  const planned = {};
  P.weeks.forEach((w) => { const pl = w.published_plan || w.plan || {}; Object.keys(pl.asg || {}).forEach((k) => { const [uid, d] = k.split('|'); planned[uid + '|' + addD(w.week_start, +d)] = true; }); });
  const byU = {}; P.rep.forEach((r) => { (byU[r.user_id] = byU[r.user_id] || { name: r.full_name, days: {} }).days[r.day] = r; });
  const T = { ok: 0, bay: 0, gel: 0, yil: 0, rap: 0, izin: 0, off: 0 };
  const grp = selGroup();
  const rows = Object.keys(byU).map((uid) => ({ uid, name: byU[uid].name })).filter(({ uid }) => { if (!grp) return true; const sp = V.staff.find((x) => x.id === uid); return !!sp && inGroupStaff(sp, grp); }).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(({ uid, name }) => {
    const t = { ok: 0, bay: 0, gel: 0, yil: 0, rap: 0, izin: 0, off: 0 }, cells = [];
    for (let d = 1; d <= n; d++) {
      const iso = `${ym}-${p2(d)}`, r = byU[uid].days[iso] || {}, h = hol[iso];
      const A = P.adj.filter((x) => x.user_id === uid && x.day === iso);
      let c;
      if (r.leave_kind) { const k = lcode(r.leave_kind); c = k === 'yillik' ? 'yil' : k === 'rapor' ? 'rap' : k === 'gelmedi' ? 'gel' : 'izin'; }
      else if (A.some((x) => x.kind === 'gelmedi')) c = 'gel';
      else if (r.first_in || A.some((x) => x.kind === 'ekstra')) c = h && h.pay2x ? 'bay' : 'ok';
      else if (iso > today) c = planned[uid + '|' + iso] ? 'plan' : 'fut';
      else if (planned[uid + '|' + iso] && iso < today) c = 'gel';
      else if (iso === today) c = planned[uid + '|' + iso] ? 'plan' : 'off';
      else c = 'off';
      if (t[c] !== undefined) { t[c]++; T[c]++; }
      cells.push({ c, iso, h });
    }
    return { uid, name, cells, t };
  });
  return { rows, T, n, hol, Y };
}
const PC = { ok: ['✓', 'Geldi'], bay: ['2×', 'Bayramda çalıştı (çift yevmiye)'], gel: ['X', 'Gelmedi'], yil: ['Y', 'Yıllık izin'], rap: ['R', 'Raporlu'], izin: ['İ', 'Diğer izin'], off: ['–', 'Hafta izni / çalışmadı'], plan: ['·', 'Planlı (gelecek)'], fut: ['', ''] };
function puanTable(D, print) {
  const ym = V.puan.ym;
  const head = Array.from({ length: D.n }, (_, i) => { const iso = `${ym}-${p2(i + 1)}`, h = D.hol[iso], wd = wdOf(iso); return `<th scope="col" class="pd${h && h.pay2x ? ' hol2' : h ? ' hol' : ''}${wd >= 5 ? ' we' : ''}" title="${h ? esc(h.name) : ''}"><span>${i + 1}</span><small>${h ? (h.pay2x ? '2×' : 'Tatil') : DN[wd].slice(0, 2)}</small></th>`; }).join('');
  return `<table class="tbl vpuan${print ? ' print' : ''}"><thead><tr><th scope="col" class="pn">Çalışan</th>${head}<th scope="col" class="pt" style="color:var(--green)">Geldi</th><th scope="col" class="pt hol2">Bayram 2×</th><th scope="col" class="pt" style="color:var(--red)">Gelmedi</th><th scope="col" class="pt" style="color:var(--blue)">Yıllık</th><th scope="col" class="pt" style="color:#6B21A8">Rapor</th><th scope="col" class="pt">Diğer izin</th><th scope="col" class="pt">H. izni</th></tr></thead>
    <tbody>${D.rows.map((r) => `<tr><th scope="row" class="pn">${esc(r.name)}</th>${r.cells.map((x) => `<td class="pd"><span class="pc p-${x.c}" title="${x.iso}: ${esc(PC[x.c][1])}">${PC[x.c][0]}</span></td>`).join('')}
      <td class="pt"><b>${r.t.ok + r.t.bay}</b></td><td class="pt hol2"><b>${r.t.bay || '—'}</b></td><td class="pt" style="color:var(--red)"><b>${r.t.gel || '—'}</b></td><td class="pt">${r.t.yil || '—'}</td><td class="pt">${r.t.rap || '—'}</td><td class="pt">${r.t.izin || '—'}</td><td class="pt muted">${r.t.off}</td></tr>`).join('') || `<tr><td colspan="${D.n + 8}" class="muted" style="padding:20px">Bu ay kayıt yok.</td></tr>`}
      <tr class="vsum"><th scope="row" class="pn">Toplam</th><td colspan="${D.n}"></td><td class="pt"><b>${D.T.ok + D.T.bay}</b></td><td class="pt hol2"><b>${D.T.bay}</b></td><td class="pt" style="color:var(--red)"><b>${D.T.gel}</b></td><td class="pt"><b>${D.T.yil}</b></td><td class="pt"><b>${D.T.rap}</b></td><td class="pt"><b>${D.T.izin}</b></td><td class="pt"><b>${D.T.off}</b></td></tr>
    </tbody></table>`;
}
function puanHtml() {
  if (!V.puan || V.puan.ym !== V.month) return '<p class="muted">Yükleniyor…</p>';
  const D = puanData(), ym = V.puan.ym, M = +ym.slice(5, 7), hm = Object.values(D.hol).filter((h) => h.iso.startsWith(ym));
  const yearH = Object.values(D.hol).sort((a, b) => a.iso.localeCompare(b.iso));
  return `<div class="card row between" style="flex-wrap:wrap;gap:12px">
      <div class="col" style="gap:2px"><h2 class="h2">Aylık puantaj · ${MN[M - 1]} ${D.Y}${selGroup() ? ' · ' + esc(selGroup().name) : ''}</h2><span class="small muted">Maaş için gün gün durum. “Geldi” QR giriş kaydından gelir; planlı olup giriş yapmayan otomatik “Gelmedi” sayılır.</span>
        <span class="small" style="font-weight:600;color:#78350F">${hm.length ? 'Bu ay: ' + hm.map((h) => dShort(h.iso) + ' ' + esc(h.name) + (h.pay2x ? ' (çift yevmiye)' : ' (normal yevmiye)')).join(' · ') : 'Bu ay resmi tatil yok.'}</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><input class="inp" type="month" value="${ym}" data-vc="month" aria-label="Ay" style="height:44px;width:auto"><button class="btn" data-vx="puanPdf">PDF indir</button></div>
    </div>
    ${grpChips()}
    <div class="tiles">${[['ok', 'Geldi', D.T.ok + D.T.bay], ['bay', 'Bayramda çalışma (2×)', D.T.bay], ['gel', 'Gelmedi', D.T.gel], ['yil', 'Yıllık izin', D.T.yil], ['rap', 'Raporlu', D.T.rap]].map(([c, l, v]) => `<div class="tile" style="cursor:default"><span class="l"><span class="pc p-${c}">${PC[c][0]}</span>${l}</span><span class="n num">${v}</span><span class="xs muted">gün, tüm çalışanlar</span></div>`).join('')}</div>
    <section class="card" style="padding:0"><div class="tbl-wrap">${puanTable(D)}</div>
      <div class="row xs" style="flex-wrap:wrap;gap:12px;padding:12px 16px;border-top:1px solid var(--soft)">${['ok', 'bay', 'gel', 'yil', 'rap', 'izin', 'off', 'plan'].map((c) => `<span class="row" style="gap:6px"><span class="pc p-${c}">${PC[c][0]}</span>${PC[c][1]}</span>`).join('')}</div></section>
    <section class="card col" style="gap:8px"><div class="row between" style="flex-wrap:wrap"><h2 class="h2">Resmi tatiller ${D.Y} · yevmiye</h2><span class="small muted">Bu günlerde çalışan puantajda “2×” olur. 15 Temmuz ve arifeler normal yevmiye.</span></div>
      <div class="vhol">${yearH.map((h) => `<div class="row between${h.iso.startsWith(ym) ? ' cur' : ''}"><span class="row" style="gap:10px"><b class="small num" style="min-width:70px">${dShort(h.iso)} ${DN[wdOf(h.iso)]}</b><span class="small">${esc(h.name)}${h.half ? ' · yarım gün' : ''}</span></span><span class="row" style="gap:6px">${h.extra ? `<button class="btn sm ghost" data-vx="holDel" data-a="${h.iso}">Sil</button>` : ''}<button class="btn sm ${h.pay2x ? 'hol2b' : 'line'}" data-vx="holToggle" data-a="${h.iso}" aria-pressed="${h.pay2x}">${h.pay2x ? 'Çift yevmiye' : 'Normal'}</button></span></div>`).join('')}</div>
      <form class="row" data-vf="holAdd" style="flex-wrap:wrap;gap:8px;margin-top:6px"><input class="inp" type="date" name="iso" required aria-label="Tarih" style="height:40px;width:auto"><input class="inp" name="name" required placeholder="Tatil adı" aria-label="Tatil adı" style="height:40px;width:220px"><button class="btn sm" type="submit">Tatil ekle</button></form>
    </section>`;
}

// ------------------------------------------------------------------ PDF: önizleme, indir, paylaş
const PDF_LIBS = ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];
const loadJs = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[data-src="${src}"][data-ok]`)) return res();
  const s = document.createElement('script'); s.src = src; s.dataset.src = src;
  s.onload = () => { s.dataset.ok = '1'; res(); }; s.onerror = () => { s.remove(); rej(new Error('PDF aracı yüklenemedi. İnternet bağlantını kontrol et.')); };
  document.head.appendChild(s);
});
let PV = null; // { name, title, landscape, blob, err, busy }
async function buildPdf() {
  for (const u of PDF_LIBS) await loadJs(u);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: PV.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 8;
  const pages = [...document.querySelectorAll('#vprint .vpage')];
  // ekran genişliğinden bağımsız: her sayfayı A4 oranında sabit genişlikte, görünmez bir alanda çiz
  const PW = PV.landscape ? 1120 : 760;
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-20000px;top:0;width:${PW}px;background:#fff;z-index:-1`;
  box.className = 'vsheet' + (PV.landscape ? ' land' : ''); document.body.appendChild(box);
  try {
  for (let i = 0; i < pages.length; i++) {
    box.innerHTML = ''; const cl = pages[i].cloneNode(true); cl.style.width = PW + 'px'; cl.style.minWidth = PW + 'px'; cl.style.borderTop = '0'; cl.style.paddingTop = '0'; box.appendChild(cl);
    const cv = await window.html2canvas(cl, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: PW + 40, width: PW });
    let w = W - 2 * M, h = cv.height * w / cv.width;
    if (h > H - 2 * M) { h = H - 2 * M; w = cv.width * h / cv.height; }
    if (i) pdf.addPage();
    pdf.addImage(cv.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, M, w, h);
  }
  } finally { box.remove(); }
  return pdf.output('blob');
}
function pvButtons() {
  const bar = document.querySelector('#vprint .pv-bar'); if (!bar || !PV) return;
  const ready = !!PV.blob, canShare = ready && !!(navigator.canShare && navigator.canShare({ files: [new File([PV.blob], PV.name, { type: 'application/pdf' })] }));
  bar.querySelector('[data-vp="dl"]').disabled = !ready;
  const sh = bar.querySelector('[data-vp="share"]'); sh.disabled = !ready; sh.style.display = !ready || canShare ? '' : 'none';
  const st = document.querySelector('#vprint .pv-state');
  st.textContent = PV.err ? PV.err : ready ? `${PV.pages} sayfa hazır · ${PV.name}` : 'PDF hazırlanıyor…';
  st.style.color = PV.err ? '#B91C1C' : '';
}
async function pvDownload() {
  if (!PV || !PV.blob) return;
  const url = URL.createObjectURL(PV.blob), a = document.createElement('a');
  a.href = url; a.download = PV.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  C.toast('PDF indirildi');
}
async function pvShare() {
  if (!PV || !PV.blob) return;
  const file = new File([PV.blob], PV.name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: PV.title }); } catch (e) { if (e && e.name !== 'AbortError') C.toast('Paylaşılamadı: ' + (e.message || e.name)); }
  } else { await pvDownload(); C.toast('Bu cihaz dosya paylaşmayı desteklemiyor; PDF indirildi'); }
}
// pages: [{ sub, html }] — her öğe ayrı sayfa
function openPrint(title, pages, landscape, fileName) {
  closePrint();
  if (typeof pages === 'string') pages = [{ sub: '', html: pages }];
  const st = document.createElement('style'); st.id = 'vprint-page';
  st.textContent = `@media print{@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}}`;
  document.head.appendChild(st);
  const made = new Date(C.now()).toLocaleString('tr-TR', { timeZone: C.tz(), dateStyle: 'short', timeStyle: 'short' });
  const ov = document.createElement('div'); ov.id = 'vprint';
  ov.innerHTML = `<div class="pv-bar noprint" style="max-width:1100px;flex-wrap:wrap;gap:8px"><button class="btn ghost" data-vp="close">${C.I.back} Kapat</button>
      <span class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" data-vp="dl" disabled>⇩ İndir</button><button class="btn teal" data-vp="share" disabled>Paylaş</button><button class="btn line" data-vp="print">Yazdır</button></span></div>
    <p class="pv-hint noprint pv-state">PDF hazırlanıyor…</p>
    <div class="vsheet${landscape ? ' land' : ''}">${pages.map((pg) => `<div class="vpage"><div class="vsh-head"><div><span class="xs muted" style="font-weight:600;letter-spacing:.4px">${esc(String(C.S.me.company.name).toLocaleUpperCase('tr'))}</span><h1>${esc(title)}</h1>${pg.sub ? `<div class="vsh-sub">${esc(pg.sub)}</div>` : ''}</div><span class="xs muted">Oluşturma: ${made}</span></div>${pg.html}
      <div class="vsh-sign"><span>Hazırlayan · İmza</span><span>Onaylayan · İmza</span></div></div>`).join('')}</div>`;
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vp]'); if (!b || b.disabled) return;
    if (b.dataset.vp === 'close') closePrint(); else if (b.dataset.vp === 'dl') pvDownload(); else if (b.dataset.vp === 'share') pvShare(); else window.print();
  });
  document.body.appendChild(ov);
  const slug = (x) => String(x).toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  PV = { title, landscape, name: (fileName || slug(title)) + '.pdf', blob: null, err: '', pages: pages.length };
  const me = PV;
  pvButtons();
  setTimeout(() => buildPdf().then((b) => { if (PV === me) { me.blob = b; pvButtons(); } }).catch((e) => { if (PV === me) { me.err = e.message || String(e); pvButtons(); } }), 50);
}
function closePrint() { PV = null; document.getElementById('vprint')?.remove(); document.getElementById('vprint-page')?.remove(); }
// kişinin ait olduğu grup: ilk pozisyonunun grubu
const homeGroup = (p) => { const k = Object.keys(p.levels || {})[0]; return k ? groupOf(k) : null; };
function planPdf() {
  const g = G(), a = g.asg, sel = selGroup(), draft = !V.row || !V.row.published_plan || !samePlan();
  const people = planStaff().filter((p) => Object.keys(p.levels || {}).length || DN.some((_, d) => a[p.id + '|' + d]));
  const sections = shownGroups().map((gg) => ({ gg, staff: people.filter((p) => homeGroup(p) === gg) }));
  if (!sel) { const rest = people.filter((p) => !homeGroup(p)); if (rest.length) sections.push({ gg: null, staff: rest }); }
  const pages = sections.filter((s) => s.staff.length).map(({ gg, staff }) => {
    const dayH = [0, 0, 0, 0, 0, 0, 0]; let tot = 0;
    const rows = staff.sort((x, y) => x.full_name.localeCompare(y.full_name, 'tr')).map((p) => {
      let h = 0; const multi = Object.keys(p.levels || {}).length > 1;
      const cells = DN.map((_, d) => {
        const k = p.id + '|' + d, x = a[k], lv = g.leave[k], aj = cellAdj(p.id, d); h += aj.work; dayH[d] += aj.work;
        const tag = aj.tags.length ? ` <i>(${esc(aj.tags.join(', '))})</i>` : '';
        if (x) return `<td><span class="lv s-${x.s}">${SN[x.s]} ${cellH(x, undefined, undefined, p.id).join('–')}${multi || (gg && !gg.positions.includes(x.p)) ? ' · ' + esc(x.p) : ''}</span>${tag}</td>`;
        if (lv) return `<td><span class="lv ${LK[lv][1]}">${LK[lv][0]}</span></td>`;
        return `<td class="muted">Haftalık izin${tag}</td>`;
      }).join('');
      tot += h;
      return `<tr><th scope="row">${esc(p.full_name)}<br><span class="xs muted" style="font-weight:500">${esc(Object.keys(p.levels || {}).map((k) => k + ' ' + p.levels[k]).join(', '))}</span></th>${cells}<td class="r"><b>${hNum(h)} sa</b></td></tr>`;
    }).join('');
    const H = gg ? hoursFor(gg.id, V.hours) : null;
    return { sub: (gg ? gg.name : 'Grubu olmayanlar') + ` · ${staff.length} kişi`, html: `<p class="xs" style="margin:0 0 8px">${H ? SL.map((s) => `${SN[s]} ${range(H, s)}`).join(' · ') + ' · ' : ''}Saat sütunu mola düşülmüş net çalışma süresidir.</p>
      <table class="vpt"><thead><tr><th>Çalışan</th>${DN.map((dn, d) => `<th>${dn} ${dShort(addD(V.week, d))}</th>`).join('')}<th class="r">Saat</th></tr></thead><tbody>${rows}
      <tr class="sum"><th>Toplam</th>${dayH.map((h) => `<td>${hNum(h)} sa</td>`).join('')}<td class="r">${hNum(tot)} sa</td></tr></tbody></table>` };
  });
  if (!pages.length) return C.toast('PDF için planda kimse yok');
  openPrint(`Haftalık Vardiya Planı · ${weekLabel(V.week)}${draft ? ' · TASLAK' : ''}`, pages, true, `vardiya-${V.week}${sel ? '-' + sel.name : ''}`.replace(/\s+/g, '-'));
}
function puanPdf() {
  const D = puanData(), M = +V.puan.ym.slice(5, 7), hm = Object.values(D.hol).filter((h) => h.iso.startsWith(V.puan.ym));
  const legend = `<p class="xs" style="margin:0 0 8px">${['ok', 'bay', 'gel', 'yil', 'rap', 'izin', 'off'].map((c) => `<b>${PC[c][0]}</b> ${PC[c][1]}`).join(' · ')}${hm.length ? ' — Resmi tatil: ' + hm.map((h) => dShort(h.iso) + ' ' + esc(h.name) + (h.pay2x ? ' (2×)' : '')).join(', ') : ''}</p>`;
  const hgOf = (uid) => { const p = V.staff.find((x) => x.id === uid); return p ? homeGroup(p) : null; };
  const groups = shownGroups().map((gg) => ({ name: gg.name, rows: D.rows.filter((r) => hgOf(r.uid) === gg) }));
  if (!selGroup()) { const rest = D.rows.filter((r) => !hgOf(r.uid)); if (rest.length) groups.push({ name: 'Grubu olmayanlar', rows: rest }); }
  const pages = groups.filter((x) => x.rows.length).map((x) => {
    const T = { ok: 0, bay: 0, gel: 0, yil: 0, rap: 0, izin: 0, off: 0 }; x.rows.forEach((r) => Object.keys(T).forEach((k) => { T[k] += r.t[k] || 0; }));
    return { sub: `${x.name} · ${x.rows.length} kişi`, html: legend + puanTable(Object.assign({}, D, { rows: x.rows, T }), true) };
  });
  openPrint(`Aylık Puantaj · ${MN[M - 1]} ${D.Y}`, pages.length ? pages : [{ sub: '', html: legend + puanTable(D, true) }], true, `puantaj-${V.puan.ym}`);
}

// ------------------------------------------------------------------ çalışan: Vardiyam
let empCache = null;
function empBody() { return `<h1 class="h1">Vardiyam</h1><div class="col" id="v-emp" style="gap:14px"><p class="muted small">Yükleniyor…</p></div>`; }
async function empFetch() {
  const S = C.S, ws = monday(todayIso());
  const [sh, comp, lv, adj] = await Promise.all([
    S.sb.rpc('my_shifts', { p_from: ws, p_to: addD(ws, 13) }),
    S.sb.from('companies').select('shift_config').eq('id', S.me.company.id).single(),
    S.sb.from('leaves').select('*').eq('user_id', S.me.user_id).gte('day_to', ws).lte('day_from', addD(ws, 13)),
    S.sb.from('shift_adjust').select('*').eq('user_id', S.me.user_id).gte('day', ws).lte('day', addD(ws, 13))
  ]);
  if (sh.error) throw sh.error;
  empCache = { at: Date.now(), brk: (Number(S.me.allowance_sec) || 3600) / 3600, ws, weeks: sh.data || [], cfg: (comp.data && comp.data.shift_config) || {}, leaves: lv.data || [], adj: adj.data || [] };
  return empCache;
}
function empWeek(E, ws) {
  const w = E.weeks.find((x) => x.week_start === ws), uid = C.S.me.user_id, today = todayIso();
  const CE = cfgFrom(E.cfg), Hx = (p) => hoursPos(p, w ? w.hours : null, CE);
  let n = 0, hrs = 0;
  const days = DN.map((dn, d) => {
    const iso = addD(ws, d), x = w && w.plan && w.plan.asg ? w.plan.asg[uid + '|' + d] : null;
    const l = E.leaves.find((q) => iso >= q.day_from && iso <= q.day_to), code = l ? lcode(l.kind) : null;
    if (x) { n++; hrs += Math.max(0, dur(pubH(x, w ? w.hours : null, CE)) - E.brk); }
    const cls = code ? LK[code][1] : x ? 's-' + x.s : 's-off';
    return `<div class="row" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--soft)"><div class="col" style="gap:0;width:44px;align-items:center"><span class="xs muted" style="font-weight:600">${dn}</span><b style="font-size:18px">${+iso.slice(8)}</b></div>
      <div class="row between grow ${cls}" style="padding:10px 12px;border-radius:12px;${iso === today ? 'outline:2px solid var(--ink);' : ''}"><span class="col" style="gap:1px"><b class="small">${code ? esc(l.kind) : x ? SN[x.s] : 'Haftalık izin'}</b><span class="xs">${x ? esc(x.p) : code ? '' : 'Çalışmıyorsun'}</span></span><b class="num small">${x ? pubH(x, w ? w.hours : null, CE).join('–') : ''}</b></div></div>`;
  }).join('');
  return { w, html: days, n, hrs };
}
async function empLoad() {
  const box = document.getElementById('v-emp'); if (!box) return;
  try {
    const E = await empFetch();
    const parts = [E.ws, addD(E.ws, 7)].map((ws, i) => {
      const r = empWeek(E, ws);
      if (!r.w) return `<section class="card col" style="gap:6px"><div class="row between"><h2 class="h2">${i ? 'Gelecek hafta' : 'Bu hafta'}</h2><span class="small muted">${weekLabel(ws)}</span></div><span class="small muted">Plan henüz yayınlanmadı. Yayınlanınca bildirim gelir.</span></section>`;
      return `<section class="card" style="padding:12px 16px"><div class="row between" style="padding:4px 0 6px"><h2 class="h2">${i ? 'Gelecek hafta' : 'Bu hafta'}</h2><span class="small muted">${weekLabel(ws)}</span></div>${r.html}
        <div class="row between small" style="padding:10px 0 2px"><span class="muted">Toplam</span><b>${r.n} gün · ${hNum(r.hrs)} saat <span class="xs muted" style="font-weight:500">(mola hariç)</span></b></div>
        <button class="btn line" style="width:100%;margin-top:8px" data-vx="empPdf" data-a="${ws}">Haftalık planı PDF indir</button></section>`;
    }).join('');
    box.innerHTML = parts;
  } catch (e) {
    box.innerHTML = `<div class="err">${esc(C.errMsg(e))}</div>`;
  }
}
async function empToday() {
  const box = document.getElementById('v-today'); if (!box) return;
  try {
    const E = empCache && empCache.ws === monday(todayIso()) && Date.now() - empCache.at < 120000 ? empCache : await empFetch();
    const today = todayIso(), ws = monday(today), d = wdOf(today), w = E.weeks.find((x) => x.week_start === ws);
    const x = w && w.plan && w.plan.asg ? w.plan.asg[C.S.me.user_id + '|' + d] : null;
    const CE = cfgFrom(E.cfg), me = C.S.me.user_id, xh = x ? pubH(x, w ? w.hours : null, CE) : null;
    let next = null;
    for (let k = 1; k <= 13 && !next; k++) { const iso = addD(today, k), ww = E.weeks.find((q) => q.week_start === monday(iso)), y = ww && ww.plan && ww.plan.asg ? ww.plan.asg[C.S.me.user_id + '|' + wdOf(iso)] : null; if (y) next = { iso, y, hh: pubH(y, ww.hours, CE) }; }
    if (!w && !next) { box.innerHTML = ''; return; }
    box.innerHTML = `<button class="card row between" data-act="empView" data-v="shift" style="border:0;width:100%;text-align:left;cursor:pointer;font:inherit"><div class="col" style="gap:2px"><span class="xs muted" style="font-weight:600">Bugünkü vardiyan</span><b style="font-size:18px">${x ? `${SN[x.s]} · ${xh.join('–')}` : 'Bugün vardiyan yok'}</b>${next ? `<span class="xs muted">Sonraki: ${DN[wdOf(next.iso)]} ${dShort(next.iso)} · ${SN[next.y.s]} ${next.hh.join('–')}</span>` : ''}</div><span class="small" style="color:var(--teal);font-weight:600">Vardiyam ›</span></button>`;
  } catch (_) { box.innerHTML = ''; }
}
function empPdf(ws) {
  if (!empCache) return;
  const r = empWeek(empCache, ws);
  openPrint(`${C.S.me.full_name} · Vardiya ${weekLabel(ws)}`, [{ sub: '', html: `<div style="max-width:520px">${r.html}<p class="small"><b>Toplam: ${r.n} gün · ${hNum(r.hrs)} saat (mola hariç)</b></p></div>` }], false, `vardiyam-${ws}`);
}

// ------------------------------------------------------------------ olaylar
const act = {
  sub: async (a) => { V.sub = a; V.edit = null; if (a === 'puan') { draw(); try { await loadMonth(); } catch (e) { C.toast(C.errMsg(e)); } } if (a === 'plan' && V._weekLoaded !== V.week) { await loadWeek(V.week); V._weekLoaded = V.week; } draw(); },
  week: async (a) => { clearTimeout(V.saveT); if (V.saveT) await savePlan(); V.saveT = null; await loadWeek(addD(V.week, +a)); V._weekLoaded = V.week; V.editHours = false; draw(); },
  cell: (a) => { V.edit = V.edit === a ? null : a; V.adjDraft = { kind: 'eksik', hours: '2', note: '' }; draw(); if (V.edit) document.querySelector('[aria-label="Hücre düzenleme"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  closeEdit: () => { V.edit = null; draw(); },
  setCell: (a) => {
    const k = V.edit; if (!k) return;
    if (a) { const [s, p] = a.split('|'); V.plan.asg[k] = { s, p }; } else delete V.plan.asg[k];
    V.plan.locks[k] = true; V.edit = null; scheduleSave(); draw();
  },
  useTpl: (i) => {
    const t = cfg().templates[+i], k = V.edit; if (!t || !k) return;
    const pid = k.split('|')[0], p = V.staff.find((q) => q.id === pid), pos = Object.keys((p && p.levels) || {}); if (!pos.length) return;
    const x = V.plan.asg[k], ps = x && pos.includes(x.p) ? x.p : pos[0], s = nearSlot(t.start, ps);
    const h = [t.start, t.end || mm2(hm2(t.start) + shiftMin(pid, hoursPos(ps)[s]))];
    V.plan.asg[k] = { s, p: ps, h }; V.plan.locks[k] = true; V.edit = null; scheduleSave(); draw();
    C.toast(`${first(p.full_name)}: ${SN[s]} ${h[0]}–${h[1]}`);
  },
  tplDel: async (i) => { if (await saveCfg({ templates: cfg().templates.filter((_, j) => j !== +i) })) draw(); },
  cellHReset: () => { const k = V.edit, x = k && V.plan.asg[k]; if (!x) return; const y = Object.assign({}, x); delete y.h; V.plan.asg[k] = y; scheduleSave(); draw(); },
  toggleLock: () => { const k = V.edit; V.plan.locks[k] = !V.plan.locks[k]; if (!V.plan.locks[k]) delete V.plan.locks[k]; scheduleSave(); draw(); },
  clearLocks: () => { V.plan.locks = {}; scheduleSave(); C.toast('Tüm kilitler kaldırıldı'); draw(); },
  regenGrp: (a) => { const saved = V.grps; V.grps = [a]; try { act.regen(); } finally { V.grps = saved; } draw(); },
  grp: (a) => { if (a === 'all') V.grps = []; else V.grps = V.grps.includes(a) ? V.grps.filter((x) => x !== a) : V.grps.concat([a]); V.edit = null; V.posConfirm = null; draw(); },
  regen: () => {
    let g = G(); const grp = selGroup();
    if (grp) {
      const inG = (pos) => grp.positions.includes(pos), locks = Object.assign({}, g.locks), asg = {};
      Object.keys(g.asg).forEach((k) => { const x = g.asg[k]; if (!inG(x.p)) { locks[k] = true; asg[k] = x; } else if (g.locks[k]) asg[k] = x; });
      g = Object.assign({}, g, { asg, locks, staff: g.staff.map((p) => Object.assign({}, p, { pos: Object.fromEntries(Object.entries(p.pos).filter(([k]) => inG(k))) })), rules: g.rules.filter((r) => r.type !== 'cover' || (ruleGroup(r) && grp.ids.includes(ruleGroup(r).id))) });
    }
    if (!g.staff.some((p) => Object.keys(p.pos).length)) { C.toast(grp ? `“${grp.name}” grubunda pozisyonu olan çalışan yok.` : 'Önce “Personel kodları”ndan çalışanlara pozisyon ve seviye ver.'); return; }
    const lk = Object.values(V.plan.locks).filter(Boolean).length;
    V.plan.asg = generate(g, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    V.edit = null; scheduleSave(); draw();
    C.toast((grp ? `${grp.name}: yeni kombinasyon` : 'Yeni kombinasyon oluşturuldu') + (lk ? ` · ${lk} kilitli hücre korundu` : ''));
  },
  toggleHours: () => { V.editHours = !V.editHours; draw(); },
  publish: async () => {
    if (V.row && V.row.published_plan && samePlan()) return;
    clearTimeout(V.saveT); await savePlan();
    const { data, error } = await C.S.sb.rpc('publish_shift_week', { p_week: V.week });
    if (error) return C.toast(C.errMsg(error));
    await loadWeek(V.week); draw();
    C.toast(`Plan yayınlandı · ${data.notified} çalışana bildirim gitti`);
  },
  planPdf: () => planPdf(),
  delAdj: async (a) => { const { error } = await C.S.sb.from('shift_adjust').delete().eq('id', a); if (error) return C.toast(C.errMsg(error)); V.adj = V.adj.filter((x) => String(x.id) !== String(a)); C.toast('Kayıt silindi'); draw(); },
  ruleToggle: async (a) => { if (await saveCfg({ rules: cfg().rules.map((r) => r.id === a ? Object.assign({}, r, { on: !r.on }) : r) })) draw(); },
  ruleDel: (a) => { V.ruleConfirm = a; draw(); },
  ruleDelNo: () => { V.ruleConfirm = null; draw(); },
  ruleDelYes: async (a) => { V.ruleConfirm = null; if (V.editRule === a) V.editRule = null; if (await saveCfg({ rules: cfg().rules.filter((r) => r.id !== a) })) C.toast('Kural silindi'); draw(); },
  ruleEdit: (a) => {
    const r = cfg().rules.find((x) => x.id === a); if (!r) return;
    V.editRule = a; V.ruleConfirm = null;
    V.draft = Object.assign({ type: 'cover', pos: cfg().positions[0] || '', slot: 'og', days: 'all', op: 'min', n: 1, lvl: 'any', pid: '', mode: 'never', pdays: [] }, r.type === 'cover' ? { type: 'cover', pos: r.pos, slot: r.slot, days: r.days, op: r.op, n: r.n, lvl: r.lvl } : r.type === 'person' ? { type: 'person', pid: r.pid, mode: r.mode, slot: r.slot, pdays: (r.pdays || []).slice() } : { type: r.type, n: r.n || 5 });
    draw(); document.getElementById('v-rulebuilder')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  },
  ruleEditCancel: () => { V.editRule = null; draw(); },
  ruleNewGeneral: () => { V.editRule = null; const has = (t) => cfg().rules.some((r) => r.type === t); const t = ['consecoff', 'clopen', 'pair', 'fair'].find((x) => !has(x)) || 'maxdays'; V.draft = Object.assign({}, V.draft, { type: t, n: 5 }); draw(); document.getElementById('v-rulebuilder')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  cmdClear: () => { V.cmd = null; draw(); },
  cmdApply: async () => {
    const C0 = V.cmd; if (!C0) return;
    let planCh = 0, ruleCh = 0;
    for (const a of C0.actions.filter((x) => x.run)) { if (a.rule) { await a.run(); ruleCh++; } else { a.run(); planCh++; } }
    if (planCh) scheduleSave();
    V.cmd = null; V.edit = null; draw();
    C.toast(`${planCh + ruleCh} değişiklik uygulandı`);
  },
  ruleNewPerson: () => { V.editRule = null; V.draft = { type: 'person', pid: '', mode: 'never', slot: 'all', pdays: [], pos: cfg().positions[0] || '', days: 'all', op: 'min', n: 1, lvl: 'any' }; draw(); document.getElementById('v-rulebuilder')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  draftDay: (a) => { const d = +a, s = V.draft.pdays || []; V.draft.pdays = s.includes(d) ? s.filter((x) => x !== d) : s.concat([d]).sort(); draw(); },
  draftDays: (a) => { V.draft.pdays = a === 'all' ? [0, 1, 2, 3, 4, 5, 6] : a === 'wd' ? [0, 1, 2, 3, 4] : a === 'we' ? [5, 6] : []; draw(); },
  ruleNewFor: (a) => { V.editRule = null; V.draft = { type: 'cover', pos: 'g:' + a, slot: 'og', days: 'all', op: 'min', n: 1, lvl: 'any' }; draw(); document.getElementById('v-rulebuilder')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
  ruleAdd: async () => {
    const D = V.draft, editId = V.editRule && cfg().rules.some((r) => r.id === V.editRule) ? V.editRule : null;
    const posOk = String(D.pos).startsWith('g:') ? !!grpById(D.pos.slice(2)) : allPositions().includes(D.pos);
    if (D.type === 'cover' && !posOk) return C.toast('Önce “Personel kodları”ndan bir grup / pozisyon ekle');
    if (D.type === 'person' && !D.pid) return C.toast('Çalışanı seç');
    if (D.type === 'person' && !(D.pdays || []).length) return C.toast('En az bir gün seç');
    if (!['cover', 'maxdays', 'person'].includes(D.type) && cfg().rules.some((r) => r.type === D.type && r.id !== editId)) return C.toast('Bu kural zaten listede var');
    const body = D.type === 'person' ? { type: 'person', pid: D.pid, mode: D.mode || 'never', slot: D.slot || 'all', pdays: D.pdays.slice().sort() } : D.type === 'cover' ? { type: 'cover', pos: D.pos, slot: D.slot, days: D.days, op: D.op, n: +D.n, lvl: D.lvl } : D.type === 'maxdays' ? { type: 'maxdays', n: +D.n } : { type: D.type };
    const rules = editId ? cfg().rules.map((r) => r.id === editId ? Object.assign({ id: r.id, on: r.on }, body) : r) : cfg().rules.concat([Object.assign({ id: 'r' + Date.now().toString(36), on: true }, body)]);
    if (await saveCfg({ rules })) { C.toast(editId ? 'Kural güncellendi' : 'Kural eklendi. Yeni plan için “Değiştir”e bas.'); V.editRule = null; draw(); }
  },
  posDel: async (a, b) => { const p = V.staff.find((x) => x.id === a); const lv = Object.assign({}, p.levels); delete lv[b]; await saveProfile(a, { levels: lv }); },
  posRemove: (a) => { V.posConfirm = a; draw(); },
  posRemoveNo: () => { V.posConfirm = null; draw(); },
  posRemoveYes: async (a) => {
    V.posConfirm = null;
    for (const p of V.staff.filter((x) => x.levels && x.levels[a])) {
      const lv = Object.assign({}, p.levels); delete lv[a];
      const { error } = await C.S.sb.from('profiles').update({ levels: lv }).eq('id', p.id);
      if (error) { C.toast(C.errMsg(error)); draw(); return; }
      p.levels = lv;
    }
    if (await saveGroups(cfg().groups.map((g) => Object.assign({}, g, { positions: g.positions.filter((x) => x !== a) })), { rules: cfg().rules.filter((r) => r.pos !== a), loose_positions: cfg().loose.filter((x) => x !== a) })) C.toast(`“${a}” silindi`);
    if (V.draft.pos === a) V.draft.pos = cfg().positions[0] || '';
    draw();
  },
  offDay: async (pid, ds) => {
    const d = +ds, cur = (cfg().offdays[pid] || []).slice(), on = cur.includes(d);
    const next = on ? cur.filter((x) => x !== d) : cur.concat([d]).sort();
    const off = Object.assign({}, cfg().offdays, { [pid]: next }); if (!next.length) delete off[pid];
    const p = V.staff.find((x) => x.id === pid);
    if (await saveCfg({ offdays: off })) { C.toast(`${first(p && p.full_name)}: ${next.length ? next.map((x) => DN[x]).join(', ') + ' haftalık izin' : 'sabit izin günü yok'}`); draw(); }
  },
  posTick: async (gid, pos) => {
    const tgt = grpById(gid); if (!tgt) return;
    const on = tgt.positions.includes(pos), from = on ? null : groupOf(pos);
    const groups = cfg().groups.map((g) => Object.assign({}, g, { positions: g.id === gid ? (on ? g.positions.filter((x) => x !== pos) : g.positions.concat([pos])) : g.positions.filter((x) => x !== pos) }));
    const loose = on ? cfg().loose.concat([pos]) : cfg().loose.filter((x) => x !== pos);
    if (await saveGroups(groups, { loose_positions: loose })) { C.toast(on ? `“${pos}” ${tgt.name} grubundan çıkarıldı` : from ? `“${pos}”, ${from.name} grubundan ${tgt.name} grubuna taşındı` : `“${pos}” ${tgt.name} grubuna eklendi`); draw(); }
  },
  grpDel: (a) => { V.grpConfirm = a; draw(); },
  grpDelNo: () => { V.grpConfirm = null; draw(); },
  grpDelYes: async (a) => {
    V.grpConfirm = null; const gg = grpById(a); if (!gg) return draw();
    if (await saveGroups(cfg().groups.filter((g) => g.id !== a), { rules: cfg().rules.filter((r) => r.pos !== 'g:' + a), loose_positions: cfg().loose.concat(gg.positions) })) C.toast(`“${gg.name}” grubu silindi; pozisyonları grupsuz kaldı`);
    V.grps = V.grps.filter((x) => x !== a);
    draw();
  },
  openCal: (a) => { V.cal.pid = a; V.cal.sel = []; V.sub = 'leave'; draw(); },
  calDay: (a) => { const s = V.cal.sel; V.cal.sel = s.includes(a) ? s.filter((x) => x !== a) : s.concat([a]); draw(); },
  calClear: () => { V.cal.sel = []; draw(); },
  calMonth: (a) => { let y = +V.cal.ym.slice(0, 4), m = +V.cal.ym.slice(5, 7) + +a; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } V.cal.ym = `${y}-${p2(m)}`; V.cal.sel = []; draw(); },
  calMark: (a) => calMark(a),
  leaveDel: async (a) => { const { error } = await C.S.sb.from('leaves').delete().eq('id', a); if (error) return C.toast(C.errMsg(error)); await reloadLeaves(); V._weekLoaded = null; C.toast('Kayıt silindi'); draw(); },
  puanPdf: () => puanPdf(),
  holToggle: async (a) => { const h = holidays(+a.slice(0, 4))[a]; const hp = Object.assign({}, cfg().holiday_pay, { [a]: !h.pay2x }); if (await saveCfg({ holiday_pay: hp })) draw(); },
  holDel: async (a) => { if (await saveCfg({ holiday_extra: cfg().holiday_extra.filter((h) => h.iso !== a) })) draw(); },
  empPdf: (a) => empPdf(a)
};
async function saveProfile(id, patch) {
  const { error } = await C.S.sb.from('profiles').update(patch).eq('id', id);
  if (error) { C.toast(C.errMsg(error)); return false; }
  Object.assign(V.staff.find((x) => x.id === id), patch); C.toast('Kaydedildi'); draw(); return true;
}
const change = {
  hour: (el) => { const wh = weekHours(), H = wh.g[el.dataset.g]; if (!H) return; H[el.dataset.a][+el.dataset.b] = el.value || H[el.dataset.a][+el.dataset.b]; V.hours = wh; scheduleSave(); draw(); },
  hoursDefault: async (el) => { if (!el.checked) return; const wh = weekHours(); if (await saveGroups(cfg().groups.map((g) => Object.assign({}, g, { hours: wh.g[g.id] || g.hours })))) C.toast('Bu saatler sonraki haftalar için varsayılan yapıldı'); },
  ghour: async (el) => { const groups = cfg().groups.map((g) => { if (g.id !== el.dataset.g) return g; const H = JSON.parse(JSON.stringify(g.hours)); H[el.dataset.a][+el.dataset.b] = el.value || H[el.dataset.a][+el.dataset.b]; return Object.assign({}, g, { hours: H }); }); if (await saveGroups(groups)) { C.toast('Varsayılan saat kaydedildi'); draw(); } },
  grpName: async (el) => { const n = el.value.trim(); if (!n) { draw(); return; } if (await saveGroups(cfg().groups.map((g) => g.id === el.dataset.a ? Object.assign({}, g, { name: n }) : g))) { C.toast('Grup adı kaydedildi'); draw(); } },
  cellH: (el) => {
    const k = V.edit, x = k && V.plan.asg[k]; if (!x || !el.value) return;
    const pid = k.split('|')[0], cur = cellH(x, undefined, undefined, pid).slice();
    let h = cur, s = x.s;
    if (+el.dataset.b === 0) { // giriş değişti: çıkış otomatik, dilim en yakın kalıba
      s = nearSlot(el.value, x.p);
      const len = shiftMin(pid, hoursPos(x.p)[s]);
      h = [el.value, mm2(hm2(el.value) + len)];
    } else h = [cur[0], el.value];
    V.plan.asg[k] = Object.assign({}, x, { s, h }); V.plan.locks[k] = true; scheduleSave(); draw();
    C.toast(`${SN[s]} ${h[0]}–${h[1]} olarak kaydedildi`);
  },
  adjKind: (el) => { V.adjDraft.kind = el.value; draw(); },
  draft: (el) => { V.draft[el.dataset.a] = el.value; if (el.dataset.a === 'type' && el.value === 'maxdays') V.draft.n = 5; if (el.dataset.a === 'type' && el.value === 'person') { V.draft.slot = 'all'; V.draft.mode = V.draft.mode || 'never'; V.draft.pdays = V.draft.pdays || []; } if (el.dataset.a === 'type' && el.value === 'cover' && V.draft.slot === 'all') V.draft.slot = 'og'; draw(); },
  lvl: (el) => { const p = V.staff.find((x) => x.id === el.dataset.a); saveProfile(p.id, { levels: Object.assign({}, p.levels, { [el.dataset.b]: el.value }) }); },
  posAdd: (el) => { if (!el.value) return; const p = V.staff.find((x) => x.id === el.dataset.a); saveProfile(p.id, { levels: Object.assign({}, p.levels, { [el.value]: 'B' }) }); },
  target: (el) => saveProfile(el.dataset.a, { target_days: +el.value }),
  brk: async (el) => {
    const v = el.value === '' ? null : Number(el.value), p = V.staff.find((x) => x.id === el.dataset.a);
    if (await saveProfile(el.dataset.a, { break_allowance_min: v })) C.toast(`${first(p && p.full_name)}: günlük mola ${v == null ? 'şirket varsayılanı' : v ? v + ' dk' : 'yok'} · mola uygulamasında da geçerli`);
  },
  daily: async (el) => {
    const d = Object.assign({}, cfg().daily); if (el.value === 'slot') d[el.dataset.a] = 'slot'; else if (el.value) d[el.dataset.a] = Number(el.value); else delete d[el.dataset.a];
    if (await saveCfg({ daily: d })) {
      const p = V.staff.find((x) => x.id === el.dataset.a), mb = Math.round(breakH(el.dataset.a) * 60), nd = netDaily(el.dataset.a);
      C.toast(nd ? `${first(p && p.full_name)}: günde ${hNum(nd)} sa + ${mb} dk mola → vardiya ${hNum(nd + mb / 60)} sa` : `${first(p && p.full_name)}: vardiya kalıbı kadar`); draw();
    }
  },
  wlimit: async (el) => { if (await saveCfg({ weekly_limit: Number(el.value) })) { C.toast(Number(el.value) ? `Haftalık çalışma süresi ${el.value} saat` : 'Haftalık sınır kaldırıldı'); draw(); } },
  fixed: (el) => saveProfile(el.dataset.a, { fixed_slot: el.value || null }),
  calPid: (el) => { V.cal.pid = el.value; V.cal.sel = []; draw(); },
  calNote: (el) => { V.cal.note = el.value; },
  month: async (el) => { if (!/^\d{4}-\d{2}$/.test(el.value)) return; V.month = el.value; V.puan = null; draw(); try { await loadMonth(); } catch (e) { C.toast(C.errMsg(e)); } draw(); }
};
const submit = {
  cmd: (f) => {
    const t = String(f.t || '').trim(); if (!t) return;
    if (V.sub !== 'plan') V.sub = 'plan';
    V.cmd = { text: t, actions: parseCommands(t) }; draw();
  },
  adj: async (f) => {
    const k = V.edit; if (!k) return;
    const [pid, d] = k.split('|'), x = V.plan.asg[k], kind = f.kind || V.adjDraft.kind;
    const h = Number(String(f.hours || '0').replace(',', '.'));
    if (kind !== 'gelmedi' && !(h > 0 && h <= 16)) return C.toast('Saati 0,5 ile 16 arasında yaz');
    if (kind === 'gelmedi' && !x) return C.toast('Bu gün vardiyası yok; “Gelmedi” yazılamaz');
    const { data, error } = await C.S.sb.from('shift_adjust').insert({ company_id: C.S.me.company.id, user_id: pid, day: addD(V.week, +d), kind, hours: kind === 'gelmedi' ? 0 : h, note: f.note || null }).select().single();
    if (error) return C.toast(C.errMsg(error));
    V.adj.push(data); C.toast('Kayıt eklendi; saat toplamı güncellendi'); draw();
  },
  posNew: async (f) => {
    const n = String(f.name || '').trim(); if (!n) return;
    if (allPositions().some((x) => x.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) return C.toast('Bu pozisyon zaten listede');
    if (await saveGroups(cfg().groups, { loose_positions: cfg().loose.concat([n]) })) { C.toast(`“${n}” eklendi. Şimdi bir grupta tikle.`); draw(); }
  },
  tplNew: async (f) => {
    if (!f.start) return;
    if (cfg().templates.some((t) => t.start === f.start && (t.end || '') === (f.end || ''))) return C.toast('Bu kalıp zaten var');
    const t = { start: f.start }; if (f.end) t.end = f.end; if (String(f.name || '').trim()) t.name = String(f.name).trim();
    if (await saveCfg({ templates: cfg().templates.concat([t]).sort((a, b) => a.start.localeCompare(b.start)) })) { C.toast('Saat kalıbı eklendi'); draw(); }
  },
  grpNew: async (f) => {
    const n = String(f.name || '').trim(); if (!n) return;
    if (cfg().groups.some((g) => g.name.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) return C.toast('Bu isimde grup var');
    const base = cfg().groups[0];
    if (await saveGroups(cfg().groups.concat([{ id: 'g' + Date.now().toString(36), name: n, positions: [], hours: JSON.parse(JSON.stringify(base ? base.hours : DEF_HOURS)) }]))) { C.toast('Grup eklendi; şimdi pozisyonlarını ekle'); draw(); }
  },
  holAdd: async (f) => {
    if (!f.iso || !String(f.name || '').trim()) return;
    if (await saveCfg({ holiday_extra: cfg().holiday_extra.filter((h) => h.iso !== f.iso).concat([{ iso: f.iso, name: String(f.name).trim() }]) })) { C.toast('Tatil eklendi'); draw(); }
  }
};
// ---- vardiya hücrelerini sürükleyerek yer değiştirme (dokunmatik: basılı tut; fare: tut-sürükle)
function swapCells(a, b) {
  const [pa, da] = a.split('|'), [pb, db] = b.split('|');
  if (pa !== pb) { C.toast('Sadece aynı kişinin günleri yer değiştirebilir'); return; }
  const lm = leaveMapWeek(V.week);
  if (lm[a] || lm[b]) { C.toast('İzin / rapor günü sürüklenemez'); return; }
  const xa = V.plan.asg[a], xb = V.plan.asg[b];
  if (!xa && !xb) return;
  if (xb) V.plan.asg[a] = xb; else delete V.plan.asg[a];
  if (xa) V.plan.asg[b] = xa; else delete V.plan.asg[b];
  V.plan.locks[a] = true; V.plan.locks[b] = true; V.edit = null;
  scheduleSave(); draw();
  const p = V.staff.find((x) => x.id === pa);
  C.toast(`${first(p && p.full_name)}: ${DN[+da]} ↔ ${DN[+db]} yer değiştirdi`);
}
function wireDrag() {
  let D = null;
  const cellAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.closest('.vc[data-vx="cell"]'); };
  const start = (el, x, y, touch) => {
    if (!el || el.classList.contains('dashed')) return;
    D = { src: el.dataset.a, el, x, y, on: false, tgt: null, ghost: null };
    if (touch) D.timer = setTimeout(activate, 300);
  };
  const activate = () => {
    if (!D) return; D.on = true; D.el.classList.add('dragging');
    const r = D.el.getBoundingClientRect(), g = D.el.cloneNode(true);
    g.className += ' vghost'; g.style.width = r.width + 'px'; g.style.left = (D.x - r.width / 2) + 'px'; g.style.top = (D.y - 30) + 'px';
    document.body.appendChild(g); D.ghost = g; document.body.classList.add('vdragging');
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
  };
  const move = (x, y, e) => {
    if (!D) return;
    if (!D.on) { if (Math.hypot(x - D.x, y - D.y) > 8) { if (D.timer) { clearTimeout(D.timer); D = null; return; } activate(); } else return; }
    if (e.cancelable) e.preventDefault();
    D.ghost.style.left = (x - D.ghost.offsetWidth / 2) + 'px'; D.ghost.style.top = (y - 30) + 'px';
    const t = cellAt(x, y), ok = t && t !== D.el && t.dataset.a.split('|')[0] === D.src.split('|')[0];
    if (D.tgt && D.tgt !== t) D.tgt.classList.remove('droptgt', 'dropno');
    D.tgt = t && t !== D.el ? t : null;
    if (D.tgt) D.tgt.classList.add(ok ? 'droptgt' : 'dropno');
  };
  const end = () => {
    if (!D) return; clearTimeout(D.timer);
    const d = D; D = null;
    if (!d.on) return;
    d.el.classList.remove('dragging'); if (d.ghost) d.ghost.remove(); document.body.classList.remove('vdragging');
    if (d.tgt) d.tgt.classList.remove('droptgt', 'dropno');
    V._noClick = Date.now();
    if (d.tgt) swapCells(d.src, d.tgt.dataset.a);
  };
  document.addEventListener('touchstart', (e) => { const t = e.touches[0], el = e.target.closest && e.target.closest('.vc[data-vx="cell"]'); if (el && e.touches.length === 1) start(el, t.clientX, t.clientY, true); }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (!D) return; const t = e.touches[0]; move(t.clientX, t.clientY, e); }, { passive: false });
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  document.addEventListener('mousedown', (e) => { if (e.button !== 0) return; const el = e.target.closest && e.target.closest('.vc[data-vx="cell"]'); if (el) start(el, e.clientX, e.clientY, false); });
  document.addEventListener('mousemove', (e) => { if (D) move(e.clientX, e.clientY, e); });
  document.addEventListener('mouseup', end);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('.vc[data-vx="cell"]')) e.preventDefault(); });
}
function wire() {
  wireDrag();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vx]'); if (!b || b.disabled) return;
    if (b.dataset.vx === 'cell' && Date.now() - (V._noClick || 0) < 450) { e.preventDefault(); return; }
    const fn = act[b.dataset.vx]; if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(b.dataset.a, b.dataset.b)).catch((err) => C.toast(C.errMsg(err)));
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-vc]'); if (!el) return;
    const fn = change[el.dataset.vc]; if (fn) Promise.resolve(fn(el)).catch((err) => C.toast(C.errMsg(err)));
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-vf]'); if (!f) return;
    e.preventDefault(); e.stopPropagation();
    const fn = submit[f.dataset.vf]; if (fn) Promise.resolve(fn(Object.fromEntries(new FormData(f)))).catch((err) => C.toast(C.errMsg(err)));
  }, true);
}

window.QRV = {
  init(ctx) { C = ctx; wire(); },
  adminTab, empBody, empLoad, empToday,
  reset() { Object.assign(V, { loaded: false, row: null, _weekLoaded: null, week: null, puan: null }); empCache = null; },
  _test: { netDaily, shiftMin, cellH, cellAdj, parseCommands, generate, evaluate, attempt, holidays, monday, addD, wdOf, lcode, ruleText, cfg, cfgFrom, V, puanData, hoursPos, weekHours }
};
})();
