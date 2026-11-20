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
  cal: { pid: null, ym: null, sel: [], note: '' }, month: null, puan: null
};
const cfg = () => {
  const c = (V.company && V.company.shift_config) || {};
  return {
    positions: Array.isArray(c.positions) && c.positions.length ? c.positions : DEF_POS,
    rules: Array.isArray(c.rules) ? c.rules : DEF_RULES,
    hours: c.hours || DEF_HOURS,
    holiday_pay: c.holiday_pay || {},
    holiday_extra: Array.isArray(c.holiday_extra) ? c.holiday_extra : []
  };
};
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
const hoursNow = () => V.hours || cfg().hours;
function leaveMapWeek(ws) {
  const m = {};
  V.leaves.forEach((l) => { for (let d = 0; d < 7; d++) { const iso = addD(ws, d); if (iso >= l.day_from && iso <= l.day_to) m[l.user_id + '|' + d] = lcode(l.kind); } });
  return m;
}
const G = () => ({ staff: staffG(), rules: cfg().rules, leave: leaveMapWeek(V.week), asg: V.plan.asg || {}, locks: V.plan.locks || {} });

// ------------------------------------------------------------------ plan motoru
function rng(seed) { let t = seed >>> 0; return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
const lvlOk = (want, have) => !!have && (want === 'any' || (want === 'AB' ? have === 'A' || have === 'B' : want === have));
const daysOf = (r) => r.days === 'wd' ? [0, 1, 2, 3, 4] : r.days === 'we' ? [5, 6] : [0, 1, 2, 3, 4, 5, 6];
const slotsOf = (r) => r.slot === 'all' ? SL : [r.slot];
function count(g, a, d, s, pos, lvl) { let n = 0; g.staff.forEach((p) => { const x = a[p.id + '|' + d]; if (x && x.s === s && x.p === pos && lvlOk(lvl, p.pos[pos])) n++; }); return n; }
function cnt(a, pid) { let n = 0; for (let d = 0; d < 7; d++) if (a[pid + '|' + d]) n++; return n; }
function closings(a, pid) { let n = 0; for (let d = 0; d < 7; d++) { const x = a[pid + '|' + d]; if (x && x.s === 'ka') n++; } return n; }

function attempt(g, rnd) {
  const on = g.rules.filter((r) => r.on);
  const has = (t) => on.some((r) => r.type === t);
  const clopen = has('clopen'), pair = has('pair'), fair = has('fair');
  const maxD = on.filter((r) => r.type === 'maxdays').reduce((m, r) => Math.min(m, r.n), 7);
  const maxRules = on.filter((r) => r.type === 'cover' && r.op === 'max');
  const a = {}, off = {};
  Object.keys(g.locks).forEach((k) => { if (g.locks[k]) { if (g.asg[k]) a[k] = g.asg[k]; else off[k] = true; } });
  const ok = (p, d, s, pos) => {
    if (!p.pos[pos]) return false;
    if (p.fixed && p.fixed !== s) return false;
    const k = p.id + '|' + d;
    if (a[k] || off[k] || g.leave[k]) return false;
    if (cnt(a, p.id) >= Math.min(p.target, maxD)) return false;
    if (clopen) {
      const prev = a[p.id + '|' + (d - 1)], next = a[p.id + '|' + (d + 1)];
      if (s === 'ac' && prev && prev.s === 'ka') return false;
      if (s === 'ka' && next && next.s === 'ac') return false;
    }
    for (const r of maxRules) {
      if (r.pos === pos && slotsOf(r).includes(s) && daysOf(r).includes(d) && lvlOk(r.lvl, p.pos[pos]) && count(g, a, d, s, pos, r.lvl) >= r.n) return false;
    }
    if (pair && p.pos[pos] === 'C' && count(g, a, d, s, pos, 'AB') === 0) return false;
    return true;
  };
  const demand = [];
  on.filter((r) => r.type === 'cover' && r.op === 'min').forEach((r) => daysOf(r).forEach((d) => slotsOf(r).forEach((s) => demand.push({ d, s, pos: r.pos, lvl: r.lvl, n: r.n, pr: (r.lvl === 'any' ? 1 : 0) + rnd() * 0.5 }))));
  demand.sort((x, y) => x.pr - y.pr);
  demand.forEach((q) => {
    let guard = 0;
    while (count(g, a, q.d, q.s, q.pos, q.lvl) < q.n && guard++ < 12) {
      let best = null, bs = 1e9;
      g.staff.forEach((p) => {
        if (!lvlOk(q.lvl, p.pos[q.pos]) || !ok(p, q.d, q.s, q.pos)) return;
        const sc = cnt(a, p.id) * 1.6 + (fair && q.s === 'ka' ? closings(a, p.id) * 1.4 : 0) + Object.keys(p.pos).length * 0.4 + rnd() * 2.6;
        if (sc < bs) { bs = sc; best = p; }
      });
      if (!best) break;
      a[best.id + '|' + q.d] = { s: q.s, p: q.pos };
    }
  });
  // önce deneyimliler: C'ler yanına A/B gelince yerleşebilsin; iki tur
  const rank = (p) => Math.max(...Object.values(p.pos).map((l) => ({ A: 0, B: 1, C: 2 }[l] ?? 1)), 0);
  const fillOrder = g.staff.map((p) => ({ p, k: rank(p) + rnd() * 0.9 })).sort((x, y) => x.k - y.k).map((x) => x.p);
  fillOrder.concat(fillOrder).forEach((p) => {
    let guard = 0;
    while (cnt(a, p.id) < Math.min(p.target, maxD) && guard++ < 8) {
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
  if (r.type === 'pair') return 'C seviyesi yalnız bırakılmaz: aynı dilim ve pozisyonda yanında A veya B olmalı';
  if (r.type === 'clopen') return 'Kapanış yapan, ertesi gün açılışa yazılmaz';
  if (r.type === 'maxdays') return `Kimse haftada ${r.n} günden fazla çalışmaz`;
  if (r.type === 'fair') return 'Kapanışlar kişiler arasında eşit dağıtılır (tercih)';
  const lv = { any: 'kişi', A: 'A seviye', B: 'B seviye', C: 'C seviye', AB: 'A veya B seviye' }[r.lvl];
  const dy = { all: 'her gün', wd: 'hafta içi', we: 'hafta sonu' }[r.days];
  return `${r.pos} · ${r.slot === 'all' ? 'Tüm dilimler' : SN[r.slot]} · ${dy} ${r.op === 'min' ? 'en az' : 'en fazla'} ${r.n} ${lv}`;
}
function evaluate(g) {
  const a = g.asg, list = [], soft = [], badCells = {}, badCov = {}, byRule = {}, dayBad = [0, 0, 0, 0, 0, 0, 0];
  const nm = (pid) => { const p = g.staff.find((x) => x.id === pid); return p ? first(p.name) : '?'; };
  const add = (rid, title, why, cells, cov, d) => { list.push({ title, why }); byRule[rid] = (byRule[rid] || 0) + 1; (cells || []).forEach((k) => { badCells[k] = 1; }); (cov || []).forEach((k) => { badCov[k] = 1; }); if (d !== undefined) dayBad[d]++; };
  const LT = (c) => c === 'rapor' ? 'raporlu' : c === 'gelmedi' ? 'gelmedi' : 'izinli';
  g.rules.filter((r) => r.on).forEach((r) => {
    if (r.type === 'cover') {
      daysOf(r).forEach((d) => slotsOf(r).forEach((s) => {
        const c = count(g, a, d, s, r.pos, r.lvl), lt = r.lvl === 'any' ? 'kişi' : r.lvl === 'AB' ? 'A/B' : r.lvl;
        if (r.op === 'min' && c < r.n) {
          const gone = g.staff.filter((p) => lvlOk(r.lvl, p.pos[r.pos]) && g.leave[p.id + '|' + d]).map((p) => nm(p.id) + ' ' + LT(g.leave[p.id + '|' + d]));
          add(r.id, `${DN[d]} ${SN[s]} · ${r.pos}: ${lt} ${c}/${r.n}`, gone.length ? `Uygun kişiler: ${gone.join(', ')}. Başka uygun kişi kalmadı.` : 'Uygun kişilerin gün hakkı dolu ya da başka bir kurala takılıyor.', [], [d + '|' + s + '|' + r.pos], d);
        }
        if (r.op === 'max' && c > r.n) add(r.id, `${DN[d]} ${SN[s]} · ${r.pos}: ${c} kişi (en fazla ${r.n})`, 'Fazla kişi yazılmış.', [], [d + '|' + s + '|' + r.pos], d);
      }));
    }
    if (r.type === 'pair') {
      for (let d = 0; d < 7; d++) SL.forEach((s) => cfg().positions.forEach((pos) => {
        const cs = g.staff.filter((p) => { const x = a[p.id + '|' + d]; return x && x.s === s && x.p === pos && p.pos[pos] === 'C'; });
        if (cs.length && count(g, a, d, s, pos, 'AB') === 0) add(r.id, `${DN[d]} ${SN[s]} · ${pos}: C yalnız`, cs.map((p) => nm(p.id)).join(', ') + ' yanında A veya B yok.', cs.map((p) => p.id + '|' + d), [d + '|' + s + '|' + pos], d);
      }));
    }
    if (r.type === 'clopen') g.staff.forEach((p) => { for (let d = 0; d < 6; d++) { const x = a[p.id + '|' + d], y = a[p.id + '|' + (d + 1)]; if (x && y && x.s === 'ka' && y.s === 'ac') add(r.id, `${nm(p.id)}: kapanıştan sonra açılış`, `${DN[d]} kapanış, ${DN[d + 1]} açılış.`, [p.id + '|' + d, p.id + '|' + (d + 1)], [], d + 1); } });
    if (r.type === 'maxdays') g.staff.forEach((p) => { const n = cnt(a, p.id); if (n > r.n) add(r.id, `${nm(p.id)}: ${n} gün`, `Haftalık sınır ${r.n} gün.`, [0, 1, 2, 3, 4, 5, 6].filter((d) => a[p.id + '|' + d]).map((d) => p.id + '|' + d), []); });
  });
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
function cellAdj(pid, d) {
  const iso = addD(V.week, d), x = (V.plan.asg || {})[pid + '|' + d], base = x ? dur(hoursNow()[x.s]) : 0;
  let net = base, gel = false, minus = false, plus = false; const tags = [];
  V.adj.filter((a) => a.user_id === pid && a.day === iso).forEach((a) => {
    const h = Number(a.hours) || 0;
    if (a.kind === 'gelmedi') { net -= base; gel = true; tags.push('Gelmedi'); }
    else if (a.kind === 'eksik') { net -= h; minus = true; tags.push('−' + hNum(h) + ' sa'); }
    else { net += h; plus = true; tags.push('+' + hNum(h) + ' sa ekstra'); }
  });
  return { base, net: Math.max(0, net), tags, gel, minus, plus };
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
  if (!V.draft.pos) V.draft.pos = cfg().positions[0];
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
  V.hours = (w.data && w.data.hours && w.data.hours.ac) ? w.data.hours : null;
}
function scheduleSave() {
  clearTimeout(V.saveT);
  V.saveT = setTimeout(savePlan, 500);
}
async function savePlan() {
  const S = C.S;
  const rec = { company_id: S.me.company.id, week_start: V.week, plan: V.plan, hours: hoursNow(), updated_at: new Date().toISOString() };
  const { data, error } = await S.sb.from('shift_weeks').upsert(rec, { onConflict: 'company_id,week_start' }).select().single();
  if (error) { C.toast('Plan kaydedilemedi: ' + C.errMsg(error)); return; }
  V.row = data;
  const chip = document.getElementById('v-pubchip'); if (chip) chip.outerHTML = pubChip();
  const pb = document.getElementById('v-pubbtn'); if (pb) pb.textContent = pubLabel();
}
const samePlan = () => V.row && V.row.published_plan && JSON.stringify(V.row.published_plan) === JSON.stringify(V.plan) && JSON.stringify(V.row.published_hours || {}) === JSON.stringify(hoursNow());
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

// ---- haftalık plan
function planHtml() {
  const g = G(), ev = evaluate(g), H = hoursNow(), a = g.asg, today = todayIso();
  const staff = planStaff().slice().sort((x, y) => {
    const px = Object.keys(x.levels || {})[0], py = Object.keys(y.levels || {})[0];
    const ix = px ? cfg().positions.indexOf(px) : 99, iy = py ? cfg().positions.indexOf(py) : 99;
    return (ix < 0 ? 98 : ix) - (iy < 0 ? 98 : iy) || x.full_name.localeCompare(y.full_name, 'tr');
  });
  const empty = !Object.keys(a).length;
  const noPos = staff.filter((p) => !Object.keys(p.levels || {}).length);
  const dayH = [0, 0, 0, 0, 0, 0, 0], dayP = [0, 0, 0, 0, 0, 0, 0];
  let last = null, weekH = 0;
  const rows = staff.map((p) => {
    const pos = Object.keys(p.levels || {}), multi = pos.length > 1, grp = pos[0] || 'Pozisyonu yok';
    let head = '';
    if (grp !== last) { last = grp; head = `<tr><td colspan="9" class="vgrp">${esc(grp.toLocaleUpperCase('tr'))}${pos[0] ? ' EKİBİ' : ' · “Personel kodları”ndan pozisyon ver'}</td></tr>`; }
    let hrs = 0, planH = 0;
    const cells = DN.map((dn, d) => {
      const k = p.id + '|' + d, x = a[k], lv = g.leave[k], aj = cellAdj(p.id, d), sel = V.edit === k;
      hrs += aj.net; planH += aj.base; dayH[d] += aj.net; if (aj.net > 0) dayP[d]++;
      let top, sub, cls;
      if (x) { top = SN[x.s]; sub = range(H, x.s) + (multi ? ' · ' + x.p : ''); cls = 's-' + x.s; }
      else if (lv) { top = LK[lv][0]; sub = 'Planlanamaz'; cls = LK[lv][1] + ' dashed'; }
      else { top = aj.plus ? 'Ekstra' : 'Boş'; sub = aj.plus ? 'Vardiya dışı' : 'Hafta izni'; cls = 's-off'; }
      const tag = aj.tags.length ? `<span class="adjtag ${aj.gel || (aj.minus && !aj.plus) ? 'neg' : 'pos'}">${esc(aj.tags.join(' · '))}</span>` : '';
      return `<td><button class="vc ${cls}${ev.badCells[k] ? ' bad' : ''}${sel ? ' sel' : ''}${addD(V.week, d) === today ? ' today' : ''}" data-vx="cell" data-a="${k}" aria-label="${esc(p.full_name)}, ${dn}: ${esc(top)}${V.plan.locks[k] ? ', kilitli' : ''}. Değiştirmek için dokun.">
        <span class="row between" style="width:100%;gap:4px"><b>${esc(top)}</b>${V.plan.locks[k] ? '<svg class="ic" style="width:13px;height:13px" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>' : ''}</span><span>${esc(sub)}</span>${tag}</button></td>`;
    }).join('');
    weekH += hrs;
    const n = cnt(a, p.id), tgt = p.target_days ?? 5;
    return `${head}<tr><th scope="row" class="vname"><b>${esc(p.full_name)}</b><span class="row" style="gap:4px;flex-wrap:wrap">${pos.map((ps) => `<span class="lv lv-${esc(p.levels[ps])}">${esc(ps)} · ${esc(p.levels[ps])}</span>`).join('')}${p.fixed_slot ? `<span class="lv lv-x">Sabit: ${SN[p.fixed_slot]}</span>` : ''}</span></th>${cells}
      <td class="vtot"><b class="num">${hNum(hrs)} sa</b><span class="xs" style="color:${n < tgt ? 'var(--orange)' : 'var(--muted)'};font-weight:600">${n}/${tgt} gün${Math.abs(hrs - planH) > 0.01 ? ' · plan ' + hNum(planH) : ''}</span></td></tr>`;
  }).join('');
  const lockCount = Object.values(V.plan.locks || {}).filter(Boolean).length;
  const ed = V.edit ? editHtml(g, ev) : '';
  const cov = cfg().positions.map((pos) => SL.map((s) => `<tr><th scope="row" style="white-space:nowrap">${esc(pos)} · ${SN[s]}</th>${DN.map((dn, d) => {
    const lv = g.staff.filter((p) => { const x = a[p.id + '|' + d]; return x && x.s === s && x.p === pos; }).map((p) => p.pos[pos]).sort();
    return `<td><span class="covc${ev.badCov[d + '|' + s + '|' + pos] ? ' bad' : ''}">${lv.length ? lv.length + ' · ' + lv.join(' ') : '0'}</span></td>`;
  }).join('')}</tr>`).join('')).join('');
  return `
    <div class="card row between" style="flex-wrap:wrap;gap:12px">
      <div class="row" style="flex-wrap:wrap">
        <div class="row" style="gap:4px"><button class="iconbtn" data-vx="week" data-a="-7" aria-label="Önceki hafta">${C.I.back}</button><b style="font-size:17px;padding:0 8px">${weekLabel(V.week)}</b><button class="iconbtn" data-vx="week" data-a="7" aria-label="Sonraki hafta" style="transform:scaleX(-1)">${C.I.back}</button></div>
        ${pubChip()}
      </div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        ${lockCount ? `<button class="btn sm line" data-vx="clearLocks">Kilitleri kaldır (${lockCount})</button>` : ''}
        <button class="btn sm teal" data-vx="regen">${empty ? 'Planı oluştur' : 'Değiştir'}</button>
        <button class="btn sm line" data-vx="planPdf" ${empty ? 'disabled' : ''}>PDF indir</button>
        <button class="btn sm" data-vx="publish" id="v-pubbtn" ${empty ? 'disabled' : ''}>${pubLabel()}</button>
      </div>
    </div>
    <div class="row small" style="flex-wrap:wrap;gap:8px"><b>Bu haftanın saatleri:</b>${SL.map((s) => `<span class="lv s-${s}" style="font-size:13px;padding:5px 10px">${SN[s]} ${range(H, s)}</span>`).join('')}<button class="btn sm line" data-vx="toggleHours">${V.editHours ? 'Bitti' : 'Saatleri düzenle'}</button></div>
    ${V.editHours ? `<div class="card row" style="flex-wrap:wrap;gap:18px">${SL.map((s) => `<div class="row" style="gap:8px"><b class="small" style="min-width:60px">${SN[s]}</b><input class="inp" type="time" value="${H[s][0]}" data-vc="hour" data-a="${s}" data-b="0" aria-label="${SN[s]} başlangıç" style="height:42px;width:120px"><span>–</span><input class="inp" type="time" value="${H[s][1]}" data-vc="hour" data-a="${s}" data-b="1" aria-label="${SN[s]} bitiş" style="height:42px;width:120px"></div>`).join('')}<label class="row small" style="gap:6px"><input type="checkbox" data-vc="hoursDefault"> Sonraki haftalar için de varsayılan yap</label></div>` : ''}
    ${noPos.length ? `<div class="alert w"><i></i><span class="small"><b>${noPos.length} kişinin pozisyonu yok:</b> ${esc(noPos.map((p) => p.full_name).join(', '))}. Plana dahil olmaları için “Personel kodları” bölümünden pozisyon ve seviye ver.</span></div>` : ''}
    <div class="split">
      <div class="main col" style="gap:16px">
        ${ed}
        ${empty && !staff.length ? '<div class="card muted">Henüz plana alınacak çalışan yok.</div>' : ''}
        <section class="card" style="padding:0" aria-label="Haftalık vardiya planı">
          <div class="tbl-wrap"><table class="tbl vgrid" style="min-width:960px">
            <thead><tr><th scope="col" style="padding-left:16px;width:170px">Çalışan</th>${DN.map((dn, d) => `<th scope="col"><span class="col" style="gap:1px"><b style="color:var(--ink)">${dn} ${dShort(addD(V.week, d))}</b>${empty ? '' : `<span class="xs" style="font-weight:700;color:${ev.dayBad[d] ? '#B91C1C' : 'var(--green)'}">${ev.dayBad[d] ? ev.dayBad[d] + ' sorun' : 'Tamam'}</span>`}</span></th>`).join('')}<th scope="col" style="text-align:right;padding-right:16px;background:var(--bg);color:var(--ink)">Toplam saat</th></tr></thead>
            <tbody>${rows}
              <tr class="vsum"><th scope="row" style="padding-left:16px">Günlük toplam</th>${dayH.map((h, d) => `<td><b class="num">${hNum(h)} sa</b><br><span class="xs muted">${dayP[d]} kişi</span></td>`).join('')}<td class="vtot" style="background:var(--line)"><b class="num" style="font-size:17px">${hNum(weekH)} sa</b></td></tr>
            </tbody></table></div>
          <div class="row xs" style="flex-wrap:wrap;gap:12px;padding:12px 16px;border-top:1px solid var(--soft)"><span class="lv s-ac">Açılış</span><span class="lv s-og">Öğlen</span><span class="lv s-ka">Kapanış</span><span class="lv l-yillik">İzin / rapor</span><span><b style="color:#DC2626">Kırmızı çerçeve</b> = kural bozuk</span><span>Hücreye dokun → elle değiştir, kilitle, gelmedi/eksik/ekstra yaz</span></div>
        </section>
        ${empty ? '' : `<section class="card" style="padding:0" aria-label="Dilim kapsaması"><div style="padding:16px 16px 4px"><h2 class="h2">Dilim kapsaması</h2><span class="small muted">Her dilimde hangi seviyeden kaç kişi var. Kırmızı = bir kural sağlanmıyor.</span></div>
          <div class="tbl-wrap"><table class="tbl vcov" style="min-width:860px"><tbody>${cov}</tbody></table></div></section>`}
      </div>
      <aside class="side">
        ${empty ? `<section class="card col"><h2 class="h2">Bu hafta için plan yok</h2><span class="small muted">“Planı oluştur”a bas; sistem kurallara göre kişileri dağıtsın. Sonra istediğin kadar “Değiştir”e basabilir ya da hücreleri elle düzeltebilirsin.</span></section>` : `
        <section class="card col" style="gap:6px;background:${ev.hard ? '#FEF2F2' : '#F0FDF4'}"><h2 class="h2">${ev.hard ? ev.hard + ' yerde kural sağlanamadı' : 'Tüm kurallar sağlandı'}</h2><span class="small">${ev.hard ? 'Plan yine de oluşturuldu. Kırmızı hücreye dokunup elle düzelt ya da “Değiştir” ile yeni kombinasyon dene.' : 'Plan yayınlanmaya hazır.'}</span></section>
        ${ev.list.length || ev.soft.length ? `<section class="card col" style="gap:8px"><h2 class="h2">Sağlanamayanlar</h2>${ev.list.map((v) => `<div class="alert"><i></i><div class="col" style="gap:2px"><b class="small">${esc(v.title)}</b><span class="xs">${esc(v.why)}</span></div></div>`).join('')}${ev.soft.map((v) => `<div class="alert w"><i></i><div class="col" style="gap:2px"><b class="small">${esc(v.title)}</b><span class="xs">${esc(v.why)}</span></div></div>`).join('')}</section>` : ''}`}
        <section class="card col" style="gap:8px"><h2 class="h2">Plan dışı kayıtlar</h2><span class="xs muted">Eklemek için plandaki hücreye dokun. Saatler toplamdan otomatik düşer/eklenir.</span>
          ${V.adj.map((x) => { const p = V.staff.find((s) => s.id === x.user_id); const d = diffD(V.week, x.day); const neg = x.kind !== 'ekstra'; const aj = cellAdj(x.user_id, d);
            return `<div class="row" style="gap:10px;padding:8px 10px;border-radius:12px;background:var(--bg)"><span class="adjtag ${neg ? 'neg' : 'pos'}" style="min-width:58px;text-align:center">${x.kind === 'gelmedi' ? '−' + hNum(aj.base) : (neg ? '−' : '+') + hNum(x.hours)} sa</span><span class="col grow" style="gap:0"><b class="small">${esc(p ? p.full_name : '')} · ${DN[d]} ${dShort(x.day)}</b><span class="xs muted">${x.kind === 'gelmedi' ? 'Gelmedi' : x.kind === 'eksik' ? 'Eksik saat' : 'Ekstra çalışma'}${x.note ? ' · ' + esc(x.note) : ''}</span></span><button class="btn sm ghost" data-vx="delAdj" data-a="${x.id}" aria-label="Kaydı sil">Sil</button></div>`; }).join('') || '<span class="small muted">Bu hafta kayıt yok.</span>'}
        </section>
      </aside>
    </div>`;
}
function editHtml(g, ev) {
  const [pid, ds] = V.edit.split('|'), d = +ds, p = V.staff.find((x) => x.id === pid); if (!p) return '';
  const k = V.edit, x = V.plan.asg[k], lv = g.leave[k], H = hoursNow(), pos = Object.keys(p.levels || {});
  const opt = (label, sel, val) => `<button class="btn sm ${sel ? '' : 'line'}" data-vx="setCell" data-a="${esc(val)}" aria-pressed="${sel}">${esc(label)}</button>`;
  const opts = [opt('Boş (hafta izni)', !x, '')].concat(pos.flatMap((ps) => SL.map((s) => opt(`${SN[s]} ${range(H, s)}${pos.length > 1 ? ' · ' + ps : ''}`, !!x && x.s === s && x.p === ps, s + '|' + ps)))).join('');
  const mine = V.adj.filter((a) => a.user_id === pid && a.day === addD(V.week, d));
  const warn = lv ? `Bu gün “${LK[lv][0]}” kaydı var. Vardiya atarsan kural ihlali olarak işaretlenir.` : p.fixed_slot ? `Sabit vardiyası: ${SN[p.fixed_slot]}. Otomatik planda hep bu dilim verilir.` : '';
  const A = V.adjDraft;
  return `<section class="card col" style="border:2px solid var(--ink);gap:12px" aria-label="Hücre düzenleme">
    <div class="row between" style="flex-wrap:wrap"><div class="col" style="gap:2px"><b style="font-size:16px">${esc(p.full_name)} · ${DN[d]} ${dLong(addD(V.week, d))}</b><span class="small muted">${pos.map((ps) => ps + ' ' + p.levels[ps]).join(', ') || 'Pozisyon yok'} · bu hafta ${cnt(V.plan.asg, pid)}/${p.target_days ?? 5} gün</span></div>
      <div class="row" style="gap:8px"><button class="btn sm line" data-vx="toggleLock">${V.plan.locks[k] ? 'Kilidi aç' : 'Kilitle'}</button><button class="btn sm ghost" data-vx="closeEdit">Kapat</button></div></div>
    ${warn ? `<div class="alert w"><i></i><span class="small">${esc(warn)}</span></div>` : ''}
    ${pos.length ? `<div class="row" style="flex-wrap:wrap;gap:8px">${opts}</div><span class="xs muted">Elle yaptığın seçim otomatik kilitlenir; “Değiştir”e bastığında bu hücre korunur.</span>` : '<span class="small muted">Bu kişiye önce “Personel kodları”ndan pozisyon ver.</span>'}
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
function rulesHtml() {
  const R = cfg().rules, D = V.draft, ev = Object.keys(V.plan.asg || {}).length ? evaluate(G()) : null;
  const sel = (name, val, opts) => `<select class="inp" data-vc="draft" data-a="${name}" style="height:44px">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const badge = { cover: ['Kapsama', 's-ka'], pair: ['Eşleşme', 's-ac'], clopen: ['Kişi sınırı', 's-off'], maxdays: ['Kişi sınırı', 's-off'], fair: ['Tercih', 's-og'] };
  return `<div class="split">
    <section class="main card col" style="gap:10px"><div class="row between"><h2 class="h2">Kurallar</h2><span class="small muted">${R.filter((r) => r.on).length} aktif · ${R.length} toplam</span></div>
      ${R.map((r) => { const nb = ev ? ev.byRule[r.id] || 0 : 0; return `<div class="row between vrule${r.on ? '' : ' off'}" style="flex-wrap:wrap">
        <div class="col grow" style="gap:6px;min-width:220px"><span class="row" style="gap:6px;flex-wrap:wrap"><span class="lv ${badge[r.type][1]}">${badge[r.type][0]}</span><span class="xs" style="font-weight:600;color:${!r.on ? 'var(--muted)' : nb ? '#B91C1C' : 'var(--green)'}">${!r.on ? 'Kapalı' : r.type === 'fair' ? 'Puanlamada kullanılır' : !ev ? '' : nb ? 'Bu haftaki planda ' + nb + ' yerde bozuk' : 'Bu haftaki planda sağlanıyor'}</span></span><b class="small" style="line-height:1.4">${esc(ruleText(r))}</b></div>
        <div class="row" style="gap:8px"><button class="btn sm ${r.on ? 'teal' : 'line'}" data-vx="ruleToggle" data-a="${esc(r.id)}" aria-pressed="${r.on}">${r.on ? 'Açık' : 'Kapalı'}</button><button class="btn sm ghost" data-vx="ruleDel" data-a="${esc(r.id)}">Sil</button></div></div>`; }).join('') || '<span class="muted small">Kural yok. Sağdan ekle.</span>'}
      ${(V.company.shift_config || {}).rules ? '' : '<span class="xs muted">Bunlar örnek kurallar. Değiştirdiğin anda şirketine kaydedilir.</span>'}
    </section>
    <aside class="side"><section class="card col" style="gap:12px"><h2 class="h2">Kural ekle</h2>
      <label class="f">Kural türü${sel('type', D.type, [['cover', 'Kişi sayısı / seviye şartı'], ['pair', 'C seviyesi yalnız kalmasın'], ['clopen', 'Kapanıştan sonra açılış yok'], ['maxdays', 'Haftalık gün sınırı'], ['fair', 'Kapanışları eşit dağıt']])}</label>
      ${D.type === 'cover' ? `<div class="formgrid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <label class="f">Pozisyon${sel('pos', D.pos, cfg().positions.map((p) => [p, p]))}</label>
        <label class="f">Dilim${sel('slot', D.slot, [['ac', 'Açılış'], ['og', 'Öğlen'], ['ka', 'Kapanış'], ['all', 'Tüm dilimler']])}</label>
        <label class="f">Günler${sel('days', D.days, [['all', 'Her gün'], ['wd', 'Hafta içi'], ['we', 'Hafta sonu']])}</label>
        <label class="f">Şart${sel('op', D.op, [['min', 'En az'], ['max', 'En fazla']])}</label>
        <label class="f">Kişi sayısı${sel('n', D.n, [1, 2, 3, 4, 5, 6].map((n) => [n, n]))}</label>
        <label class="f">Seviye${sel('lvl', D.lvl, [['any', 'Herhangi'], ['A', 'A (deneyimli)'], ['B', 'B (az deneyimli)'], ['C', 'C (öğrenen)'], ['AB', 'A veya B']])}</label></div>` : ''}
      ${D.type === 'maxdays' ? `<label class="f">En fazla gün${sel('n', D.n, [3, 4, 5, 6].map((n) => [n, n]))}</label>` : ''}
      <div class="col" style="gap:4px;padding:12px 14px;border-radius:12px;background:var(--bg)"><span class="xs muted" style="font-weight:600">Önizleme</span><b class="small" style="line-height:1.4">${esc(ruleText(D))}</b></div>
      <button class="btn" data-vx="ruleAdd">Kuralı ekle</button>
      <span class="xs muted" style="line-height:1.45">“A” tam olarak A demek; “A veya B” ikisinden birini kabul eder. Yeni kural plan ekranında hemen kontrol edilir; yeni plan için “Değiştir”e bas.</span>
    </section></aside></div>`;
}

// ---- personel kodları
function staffHtml() {
  const P = cfg().positions;
  const rows = V.staff.filter((p) => p.active).map((p) => {
    const lv = p.levels || {}, have = Object.keys(lv), can = P.filter((x) => !have.includes(x));
    return `<tr><td style="padding-left:20px"><b>${esc(p.full_name)}</b>${p.tracked ? '' : '<br><span class="xs muted">Takip dışı · planda yok</span>'}</td>
      <td><div class="row" style="flex-wrap:wrap;gap:8px">${have.map((ps) => `<span class="row vposchip"><span class="small">${esc(ps)}</span><select class="inp" data-vc="lvl" data-a="${p.id}" data-b="${esc(ps)}" aria-label="${esc(p.full_name)} ${esc(ps)} seviyesi" style="height:34px;width:58px;font-weight:700;padding:0 6px">${['A', 'B', 'C'].map((l) => `<option ${lv[ps] === l ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="xbtn" data-vx="posDel" data-a="${p.id}" data-b="${esc(ps)}" aria-label="${esc(ps)} pozisyonunu kaldır">×</button></span>`).join('')}
        ${can.length ? `<select class="inp" data-vc="posAdd" data-a="${p.id}" aria-label="Pozisyon ekle" style="height:34px;width:auto"><option value="">+ Pozisyon ekle</option>${can.map((x) => `<option>${esc(x)}</option>`).join('')}</select>` : ''}</div></td>
      <td><select class="inp" data-vc="target" data-a="${p.id}" aria-label="Haftalık gün" style="height:38px;width:auto">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}" ${(p.target_days ?? 5) === n ? 'selected' : ''}>${n} gün</option>`).join('')}</select></td>
      <td><select class="inp" data-vc="fixed" data-a="${p.id}" aria-label="Sabit vardiya" style="height:38px;width:auto"><option value="">Yok (döner)</option>${SL.map((s) => `<option value="${s}" ${p.fixed_slot === s ? 'selected' : ''}>Hep ${SN[s]}</option>`).join('')}</select></td>
      <td style="text-align:right;padding-right:20px"><button class="btn sm line" data-vx="openCal" data-a="${p.id}">Gelmedi / rapor işaretle</button></td></tr>`;
  }).join('');
  return `<section class="card col" style="gap:10px"><h2 class="h2">Pozisyonlar</h2><span class="small muted">İşletmendeki görevler. Kurallar ve personel kodları bu listeyi kullanır.</span>
      <div class="row" style="flex-wrap:wrap;gap:8px">${P.map((x) => `<span class="row vposchip"><b class="small">${esc(x)}</b><button class="xbtn" data-vx="posRemove" data-a="${esc(x)}" aria-label="${esc(x)} pozisyonunu sil">×</button></span>`).join('')}
        <form class="row" data-vf="posNew" style="gap:6px"><input class="inp" name="name" placeholder="Yeni pozisyon (örn. Garson)" aria-label="Yeni pozisyon adı" style="height:38px;width:220px"><button class="btn sm" type="submit">Ekle</button></form></div></section>
    <section class="card" style="padding:0"><div style="padding:16px 20px 6px"><h2 class="h2">Personel kodları</h2><span class="small muted">A deneyimli · B az deneyimli · C öğrenen. Birden fazla pozisyonda çalışana her pozisyon için ayrı seviye ver. Değişiklikler anında kaydedilir.</span></div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:900px"><thead><tr><th style="padding-left:20px">Çalışan</th><th>Pozisyon ve seviye</th><th>Haftalık gün</th><th>Sabit vardiya</th><th><span class="sr">İşlem</span></th></tr></thead><tbody>${rows}</tbody></table></div></section>
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
  const rows = Object.keys(byU).map((uid) => ({ uid, name: byU[uid].name })).sort((a, b) => a.name.localeCompare(b.name, 'tr')).map(({ uid, name }) => {
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
      <div class="col" style="gap:2px"><h2 class="h2">Aylık puantaj · ${MN[M - 1]} ${D.Y}</h2><span class="small muted">Maaş için gün gün durum. “Geldi” QR giriş kaydından gelir; planlı olup giriş yapmayan otomatik “Gelmedi” sayılır.</span>
        <span class="small" style="font-weight:600;color:#78350F">${hm.length ? 'Bu ay: ' + hm.map((h) => dShort(h.iso) + ' ' + esc(h.name) + (h.pay2x ? ' (çift yevmiye)' : ' (normal yevmiye)')).join(' · ') : 'Bu ay resmi tatil yok.'}</span></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><input class="inp" type="month" value="${ym}" data-vc="month" aria-label="Ay" style="height:44px;width:auto"><button class="btn" data-vx="puanPdf">PDF indir</button></div>
    </div>
    <div class="tiles">${[['ok', 'Geldi', D.T.ok + D.T.bay], ['bay', 'Bayramda çalışma (2×)', D.T.bay], ['gel', 'Gelmedi', D.T.gel], ['yil', 'Yıllık izin', D.T.yil], ['rap', 'Raporlu', D.T.rap]].map(([c, l, v]) => `<div class="tile" style="cursor:default"><span class="l"><span class="pc p-${c}">${PC[c][0]}</span>${l}</span><span class="n num">${v}</span><span class="xs muted">gün, tüm çalışanlar</span></div>`).join('')}</div>
    <section class="card" style="padding:0"><div class="tbl-wrap">${puanTable(D)}</div>
      <div class="row xs" style="flex-wrap:wrap;gap:12px;padding:12px 16px;border-top:1px solid var(--soft)">${['ok', 'bay', 'gel', 'yil', 'rap', 'izin', 'off', 'plan'].map((c) => `<span class="row" style="gap:6px"><span class="pc p-${c}">${PC[c][0]}</span>${PC[c][1]}</span>`).join('')}</div></section>
    <section class="card col" style="gap:8px"><div class="row between" style="flex-wrap:wrap"><h2 class="h2">Resmi tatiller ${D.Y} · yevmiye</h2><span class="small muted">Bu günlerde çalışan puantajda “2×” olur. 15 Temmuz ve arifeler normal yevmiye.</span></div>
      <div class="vhol">${yearH.map((h) => `<div class="row between${h.iso.startsWith(ym) ? ' cur' : ''}"><span class="row" style="gap:10px"><b class="small num" style="min-width:70px">${dShort(h.iso)} ${DN[wdOf(h.iso)]}</b><span class="small">${esc(h.name)}${h.half ? ' · yarım gün' : ''}</span></span><span class="row" style="gap:6px">${h.extra ? `<button class="btn sm ghost" data-vx="holDel" data-a="${h.iso}">Sil</button>` : ''}<button class="btn sm ${h.pay2x ? 'hol2b' : 'line'}" data-vx="holToggle" data-a="${h.iso}" aria-pressed="${h.pay2x}">${h.pay2x ? 'Çift yevmiye' : 'Normal'}</button></span></div>`).join('')}</div>
      <form class="row" data-vf="holAdd" style="flex-wrap:wrap;gap:8px;margin-top:6px"><input class="inp" type="date" name="iso" required aria-label="Tarih" style="height:40px;width:auto"><input class="inp" name="name" required placeholder="Tatil adı" aria-label="Tatil adı" style="height:40px;width:220px"><button class="btn sm" type="submit">Tatil ekle</button></form>
    </section>`;
}

// ------------------------------------------------------------------ yazdırma (PDF)
function openPrint(title, sheet, landscape) {
  closePrint();
  const st = document.createElement('style'); st.id = 'vprint-page';
  st.textContent = `@media print{@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}}`;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.id = 'vprint';
  ov.innerHTML = `<div class="pv-bar noprint" style="max-width:1100px"><button class="btn ghost" data-vp="close">${C.I.back} Kapat</button><button class="btn" data-vp="print">Yazdır / PDF</button></div>
    <p class="pv-hint noprint">PDF için yazdırma ekranında “PDF olarak kaydet”i seç. iPhone’da: önizlemeyi iki parmakla büyüt → Paylaş → “Dosyalara Kaydet”.</p>
    <div class="vsheet${landscape ? ' land' : ''}"><div class="vsh-head"><div><span class="xs muted" style="font-weight:600;letter-spacing:.4px">${esc(String(C.S.me.company.name).toLocaleUpperCase('tr'))}</span><h1>${esc(title)}</h1></div><span class="xs muted">Oluşturma: ${new Date(C.now()).toLocaleString('tr-TR', { timeZone: C.tz(), dateStyle: 'short', timeStyle: 'short' })}</span></div>${sheet}
    <div class="vsh-sign"><span>Hazırlayan · İmza</span><span>Onaylayan · İmza</span></div></div>`;
  ov.addEventListener('click', (e) => { const b = e.target.closest('[data-vp]'); if (!b) return; if (b.dataset.vp === 'close') closePrint(); else window.print(); });
  document.body.appendChild(ov);
}
function closePrint() { document.getElementById('vprint')?.remove(); document.getElementById('vprint-page')?.remove(); }
function planPdf() {
  const g = G(), H = hoursNow(), a = g.asg;
  const staff = planStaff().filter((p) => Object.keys(p.levels || {}).length || DN.some((_, d) => a[p.id + '|' + d])).sort((x, y) => x.full_name.localeCompare(y.full_name, 'tr'));
  const dayH = [0, 0, 0, 0, 0, 0, 0]; let tot = 0;
  const rows = staff.map((p) => {
    let h = 0; const multi = Object.keys(p.levels || {}).length > 1;
    const cells = DN.map((_, d) => {
      const k = p.id + '|' + d, x = a[k], lv = g.leave[k], aj = cellAdj(p.id, d); h += aj.net; dayH[d] += aj.net;
      const tag = aj.tags.length ? ` <i>(${esc(aj.tags.join(', '))})</i>` : '';
      if (x) return `<td><span class="lv s-${x.s}">${SN[x.s]} ${range(H, x.s)}${multi ? ' ' + esc(x.p) : ''}</span>${tag}</td>`;
      if (lv) return `<td><span class="lv ${LK[lv][1]}">${LK[lv][0]}</span></td>`;
      return `<td class="muted">–${tag}</td>`;
    }).join('');
    tot += h;
    return `<tr><th scope="row">${esc(p.full_name)}</th>${cells}<td class="r"><b>${hNum(h)} sa</b></td></tr>`;
  }).join('');
  const draft = !V.row || !V.row.published_plan || !samePlan();
  openPrint(`Haftalık Vardiya Planı · ${weekLabel(V.week)}${draft ? ' · TASLAK' : ''}`,
    `<p class="xs" style="margin:0 0 8px">${SL.map((s) => `${SN[s]} ${range(H, s)}`).join(' · ')} · Saatler vardiya süresidir (mola dahil).</p>
    <table class="vpt"><thead><tr><th>Çalışan</th>${DN.map((dn, d) => `<th>${dn} ${dShort(addD(V.week, d))}</th>`).join('')}<th class="r">Saat</th></tr></thead><tbody>${rows}
    <tr class="sum"><th>Toplam</th>${dayH.map((h) => `<td>${hNum(h)} sa</td>`).join('')}<td class="r">${hNum(tot)} sa</td></tr></tbody></table>`, true);
}
function puanPdf() {
  const D = puanData(), M = +V.puan.ym.slice(5, 7), hm = Object.values(D.hol).filter((h) => h.iso.startsWith(V.puan.ym));
  openPrint(`Aylık Puantaj · ${MN[M - 1]} ${D.Y}`,
    `<p class="xs" style="margin:0 0 8px">${['ok', 'bay', 'gel', 'yil', 'rap', 'izin', 'off'].map((c) => `<b>${PC[c][0]}</b> ${PC[c][1]}`).join(' · ')}${hm.length ? ' — Resmi tatil: ' + hm.map((h) => dShort(h.iso) + ' ' + esc(h.name) + (h.pay2x ? ' (2×)' : '')).join(', ') : ''}</p>${puanTable(D, true)}`, true);
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
  empCache = { at: Date.now(), ws, weeks: sh.data || [], cfg: (comp.data && comp.data.shift_config) || {}, leaves: lv.data || [], adj: adj.data || [] };
  return empCache;
}
function empWeek(E, ws) {
  const w = E.weeks.find((x) => x.week_start === ws), uid = C.S.me.user_id, today = todayIso();
  const H = (w && w.hours && w.hours.ac) ? w.hours : (E.cfg.hours || DEF_HOURS);
  let n = 0, hrs = 0;
  const days = DN.map((dn, d) => {
    const iso = addD(ws, d), x = w && w.plan && w.plan.asg ? w.plan.asg[uid + '|' + d] : null;
    const l = E.leaves.find((q) => iso >= q.day_from && iso <= q.day_to), code = l ? lcode(l.kind) : null;
    if (x) { n++; hrs += dur(H[x.s]); }
    const cls = code ? LK[code][1] : x ? 's-' + x.s : 's-off';
    return `<div class="row" style="gap:12px;padding:8px 0;border-bottom:1px solid var(--soft)"><div class="col" style="gap:0;width:44px;align-items:center"><span class="xs muted" style="font-weight:600">${dn}</span><b style="font-size:18px">${+iso.slice(8)}</b></div>
      <div class="row between grow ${cls}" style="padding:10px 12px;border-radius:12px;${iso === today ? 'outline:2px solid var(--ink);' : ''}"><span class="col" style="gap:1px"><b class="small">${code ? esc(l.kind) : x ? SN[x.s] : 'Hafta izni'}</b><span class="xs">${x ? esc(x.p) : code ? '' : 'Çalışmıyorsun'}</span></span><b class="num small">${x ? range(H, x.s) : ''}</b></div></div>`;
  }).join('');
  return { w, html: days, n, hrs, H };
}
async function empLoad() {
  const box = document.getElementById('v-emp'); if (!box) return;
  try {
    const E = await empFetch();
    const parts = [E.ws, addD(E.ws, 7)].map((ws, i) => {
      const r = empWeek(E, ws);
      if (!r.w) return `<section class="card col" style="gap:6px"><div class="row between"><h2 class="h2">${i ? 'Gelecek hafta' : 'Bu hafta'}</h2><span class="small muted">${weekLabel(ws)}</span></div><span class="small muted">Plan henüz yayınlanmadı. Yayınlanınca bildirim gelir.</span></section>`;
      return `<section class="card" style="padding:12px 16px"><div class="row between" style="padding:4px 0 6px"><h2 class="h2">${i ? 'Gelecek hafta' : 'Bu hafta'}</h2><span class="small muted">${weekLabel(ws)}</span></div>${r.html}
        <div class="row between small" style="padding:10px 0 2px"><span class="muted">Toplam</span><b>${r.n} gün · ${hNum(r.hrs)} saat</b></div>
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
    const H = (w && w.hours && w.hours.ac) ? w.hours : (E.cfg.hours || DEF_HOURS);
    let next = null;
    for (let k = 1; k <= 13 && !next; k++) { const iso = addD(today, k), ww = E.weeks.find((q) => q.week_start === monday(iso)), y = ww && ww.plan && ww.plan.asg ? ww.plan.asg[C.S.me.user_id + '|' + wdOf(iso)] : null; if (y) next = { iso, y, H: (ww.hours && ww.hours.ac) ? ww.hours : H }; }
    if (!w && !next) { box.innerHTML = ''; return; }
    box.innerHTML = `<button class="card row between" data-act="empView" data-v="shift" style="border:0;width:100%;text-align:left;cursor:pointer;font:inherit"><div class="col" style="gap:2px"><span class="xs muted" style="font-weight:600">Bugünkü vardiyan</span><b style="font-size:18px">${x ? `${SN[x.s]} · ${range(H, x.s)}` : 'Bugün vardiyan yok'}</b>${next ? `<span class="xs muted">Sonraki: ${DN[wdOf(next.iso)]} ${dShort(next.iso)} · ${SN[next.y.s]} ${range(next.H, next.y.s)}</span>` : ''}</div><span class="small" style="color:var(--teal);font-weight:600">Vardiyam ›</span></button>`;
  } catch (_) { box.innerHTML = ''; }
}
function empPdf(ws) {
  if (!empCache) return;
  const r = empWeek(empCache, ws);
  openPrint(`${C.S.me.full_name} · Vardiya ${weekLabel(ws)}`, `<div style="max-width:520px">${r.html}<p class="small"><b>Toplam: ${r.n} gün · ${hNum(r.hrs)} saat</b></p></div>`, false);
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
  toggleLock: () => { const k = V.edit; V.plan.locks[k] = !V.plan.locks[k]; if (!V.plan.locks[k]) delete V.plan.locks[k]; scheduleSave(); draw(); },
  clearLocks: () => { V.plan.locks = {}; scheduleSave(); C.toast('Tüm kilitler kaldırıldı'); draw(); },
  regen: () => {
    const g = G();
    if (!g.staff.some((p) => Object.keys(p.pos).length)) { C.toast('Önce “Personel kodları”ndan çalışanlara pozisyon ve seviye ver.'); return; }
    const lk = Object.values(V.plan.locks).filter(Boolean).length;
    V.plan.asg = generate(g, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    V.edit = null; scheduleSave(); draw();
    C.toast('Yeni kombinasyon oluşturuldu' + (lk ? ` · ${lk} kilitli hücre korundu` : ''));
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
  ruleDel: async (a) => { if (await saveCfg({ rules: cfg().rules.filter((r) => r.id !== a) })) { C.toast('Kural silindi'); draw(); } },
  ruleAdd: async () => {
    const D = V.draft;
    if (!['cover', 'maxdays'].includes(D.type) && cfg().rules.some((r) => r.type === D.type)) return C.toast('Bu kural zaten listede var');
    const r = Object.assign({ id: 'r' + Date.now().toString(36), on: true }, D.type === 'cover' ? { type: 'cover', pos: D.pos, slot: D.slot, days: D.days, op: D.op, n: +D.n, lvl: D.lvl } : D.type === 'maxdays' ? { type: 'maxdays', n: +D.n } : { type: D.type });
    if (await saveCfg({ rules: cfg().rules.concat([r]) })) { C.toast('Kural eklendi. Yeni plan için “Değiştir”e bas.'); draw(); }
  },
  posDel: async (a, b) => { const p = V.staff.find((x) => x.id === a); const lv = Object.assign({}, p.levels); delete lv[b]; await saveProfile(a, { levels: lv }); },
  posRemove: async (a) => {
    const used = V.staff.filter((p) => p.levels && p.levels[a]).length;
    if (used && !confirm(`${a} pozisyonu ${used} kişide tanımlı. Silinsin mi? (Kişilerin bu pozisyon kaydı kalır ama kurallarda kullanılamaz.)`)) return;
    if (await saveCfg({ positions: cfg().positions.filter((x) => x !== a) })) draw();
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
  hour: (el) => { const H = JSON.parse(JSON.stringify(hoursNow())); H[el.dataset.a][+el.dataset.b] = el.value || H[el.dataset.a][+el.dataset.b]; V.hours = H; scheduleSave(); draw(); },
  hoursDefault: async (el) => { if (el.checked && await saveCfg({ hours: hoursNow() })) C.toast('Bu saatler sonraki haftalar için varsayılan yapıldı'); },
  adjKind: (el) => { V.adjDraft.kind = el.value; draw(); },
  draft: (el) => { V.draft[el.dataset.a] = el.value; if (el.dataset.a === 'type' && el.value === 'maxdays') V.draft.n = 5; draw(); },
  lvl: (el) => { const p = V.staff.find((x) => x.id === el.dataset.a); saveProfile(p.id, { levels: Object.assign({}, p.levels, { [el.dataset.b]: el.value }) }); },
  posAdd: (el) => { if (!el.value) return; const p = V.staff.find((x) => x.id === el.dataset.a); saveProfile(p.id, { levels: Object.assign({}, p.levels, { [el.value]: 'B' }) }); },
  target: (el) => saveProfile(el.dataset.a, { target_days: +el.value }),
  fixed: (el) => saveProfile(el.dataset.a, { fixed_slot: el.value || null }),
  calPid: (el) => { V.cal.pid = el.value; V.cal.sel = []; draw(); },
  calNote: (el) => { V.cal.note = el.value; },
  month: async (el) => { if (!/^\d{4}-\d{2}$/.test(el.value)) return; V.month = el.value; V.puan = null; draw(); try { await loadMonth(); } catch (e) { C.toast(C.errMsg(e)); } draw(); }
};
const submit = {
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
    if (cfg().positions.some((x) => x.toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr'))) return C.toast('Bu pozisyon zaten var');
    if (await saveCfg({ positions: cfg().positions.concat([n]) })) { C.toast('Pozisyon eklendi'); draw(); }
  },
  holAdd: async (f) => {
    if (!f.iso || !String(f.name || '').trim()) return;
    if (await saveCfg({ holiday_extra: cfg().holiday_extra.filter((h) => h.iso !== f.iso).concat([{ iso: f.iso, name: String(f.name).trim() }]) })) { C.toast('Tatil eklendi'); draw(); }
  }
};
function wire() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vx]'); if (!b || b.disabled) return;
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
  _test: { generate, evaluate, attempt, holidays, monday, addD, wdOf, lcode, ruleText, cfg, V, puanData }
};
})();
