/* QR Mola & Mesai Takip — tek sayfa uygulama (çalışan, yönetici, kapı ekranı) */
(() => {
'use strict';

const cfg = window.APP_CONFIG || {};
const app = document.getElementById('app');
const BASE = location.origin + location.pathname;

// ------------------------------------------------------------------ yardımcılar
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fmtMS = (sec) => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
const fmtHM = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 3600)} sa ${Math.floor(sec % 3600 / 60)} dk`; };
const fmtMin = (sec) => `${Math.round(Math.max(0, sec) / 60)} dk`;
const tz = () => (S.me && S.me.company && S.me.company.timezone) || 'Europe/Istanbul';
const tClock = (iso) => iso ? new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: tz() }) : '—';
const tDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' });
const todayLong = () => new Date(now()).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: tz() });
const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toLocaleUpperCase('tr-TR')).join('');
const now = () => Date.now() + S.off;
const errMsg = (e) => { const m = (e && (e.message || e.error_description || e.msg)) || String(e); if (/Invalid login credentials/i.test(m)) return 'E-posta/telefon veya şifre hatalı.'; if (/already registered/i.test(m)) return 'Bu e-posta/telefon zaten kayıtlı. Giriş yap.'; if (/Email not confirmed/i.test(m)) return 'E-posta adresin henüz doğrulanmadı. Gelen kutundaki bağlantıya tıkla.'; if (/Password should be/i.test(m)) return 'Şifre en az 6 karakter olmalı.'; if (/Failed to fetch|NetworkError/i.test(m)) return 'İnternet bağlantısı yok gibi görünüyor.'; return m; };

const I = {
  qr: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>',
  home: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  clock: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  bell: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  user: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  back: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  inn: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/></svg>',
  out: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  cup: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:36px;height:36px"><path d="M20 6L9 17l-5-5"/></svg>',
  warn: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  logo: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="width:26px;height:26px"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 20h4v-3"/></svg>'
};
const ST = { working: 'Çalışıyor', break: 'Molada', leave: 'İzinli', absent: 'Giriş yok', done: 'Çıkış yaptı', not_yet: 'Giriş yok', off: 'Giriş yok' };
const chip = (st, text) => `<span class="chip st-${esc(st)}"><i></i>${esc(text || ST[st] || st)}</span>`;
const KIND = { in: ['Mesai girişi', I.inn, 'var(--green-bg)', 'var(--green)'], break_start: ['Molaya çıktı', I.cup, 'var(--amber-bg)', 'var(--amber)'], break_end: ['Moladan döndü', I.cup, 'var(--amber-bg)', 'var(--amber)'], out: ['Mesai çıkışı', I.out, 'var(--soft)', '#3B414E'] };

let toastT;
function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = msg;
  document.body.appendChild(d); clearTimeout(toastT); toastT = setTimeout(() => d.remove(), 3500);
}

function qrSvg(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(); let p = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${c} ${r}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges" role="img" aria-label="QR kod"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${p}" fill="#000"/></svg>`;
}

function notifyDevice(title, body) {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
  try {
    if (!push.on && 'Notification' in window && Notification.permission === 'granted') {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((r) => r.showNotification(title, { body, icon: 'icon.svg' }));
      } else new Notification(title, { body, icon: 'icon.svg' });
    }
  } catch (_) {}
}

// ------------------------------------------------------------------ telefon bildirimleri (push)
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const push = { supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, on: false, busy: false, syncedFor: null, reg: null };
function b64uBytes(s) {
  const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function swReady() {
  if (push.reg) return push.reg;
  if (!('serviceWorker' in navigator)) return null;
  try { push.reg = await navigator.serviceWorker.register('sw.js'); } catch (_) { push.reg = null; }
  return push.reg;
}
async function currentSub() {
  const reg = await swReady();
  if (!reg || !reg.pushManager) return null;
  try { return await reg.pushManager.getSubscription(); } catch (_) { return null; }
}
async function saveSub(sub) {
  const j = sub.toJSON();
  const { error } = await S.sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_ua: navigator.userAgent });
  if (error) throw error;
}
// Girişten sonra: bu telefon daha önce abone olduysa aboneliği bu hesaba bağla
async function syncPush() {
  if (!S.me || push.syncedFor === S.me.user_id) return;
  push.syncedFor = S.me.user_id;
  const sub = push.supported ? await currentSub() : null;
  push.on = !!sub && Notification.permission === 'granted';
  if (push.on) { try { await saveSub(sub); } catch (_) { /* sonraki açılışta tekrar dener */ } }
}
async function enablePush() {
  if (push.busy) return;
  if (!push.supported) {
    return toast(isIOS && !standalone ? 'Önce Safari’de Paylaş → “Ana Ekrana Ekle” de, sonra uygulamayı ana ekrandan aç.' : 'Bu tarayıcı telefon bildirimlerini desteklemiyor.');
  }
  push.busy = true;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Bildirim izni verilmedi. Telefonun Ayarlar bölümünden açabilirsin.'); return; }
    const reg = await swReady();
    if (!reg) throw new Error('Arka plan çalışanı başlatılamadı');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data, error } = await S.sb.functions.invoke('push-gonder', { body: { action: 'key' } });
      if (error || !data || !data.key) throw new Error('Bildirim sunucusuna ulaşılamadı. Kurulum tamamlanmamış olabilir.');
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(data.key) });
    }
    await saveSub(sub);
    push.on = true; push.syncedFor = S.me && S.me.user_id;
    toast('Bildirimler açıldı. Deneme bildirimi geliyor…');
    S.sb.rpc('push_test');
  } catch (e) { toast(errMsg(e)); }
  finally { push.busy = false; render(); }
}
async function disablePush(silent) {
  const sub = await currentSub();
  if (sub) {
    try { await S.sb.rpc('remove_push_subscription', { p_endpoint: sub.endpoint }); } catch (_) {}
    try { await sub.unsubscribe(); } catch (_) {}
  }
  push.on = false;
  if (!silent) { toast('Bu telefona bildirim gönderilmeyecek.'); render(); }
}
function pushCard(compact) {
  if (push.on) {
    return compact ? '' : `<div class="card row between"><div class="col" style="gap:2px"><b>Telefon bildirimleri</b><span class="small muted">Açık. Uygulama kapalıyken de uyarılar bu telefona gelir.</span></div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="pushTest">Dene</button><button class="btn sm teal" data-act="pushOff" aria-pressed="true">Açık</button></div></div>`;
  }
  let msg = '', btn = '';
  if (!push.supported) msg = isIOS && !standalone ? 'Bildirim almak için: Safari’de Paylaş → “Ana Ekrana Ekle”, sonra uygulamayı ana ekrandaki simgeden aç.' : 'Bu tarayıcı telefon bildirimlerini desteklemiyor.';
  else if (Notification.permission === 'denied') msg = 'Bildirimler engellenmiş. Telefonun Ayarlar → Bildirimler bölümünden bu uygulamaya izin ver.';
  else { msg = 'Mola biterken ve uyarı gelince, uygulama kapalı ve telefon kilitliyken de mesaj gibi bildirim gelir.'; btn = `<button class="btn ${compact ? '' : 'sm '}" data-act="askNotif" ${push.busy ? 'disabled' : ''}>${I.bell} Bildirimleri aç</button>`; }
  if (compact && !btn) return '';
  return `<div class="card col" style="gap:10px"><div class="col" style="gap:2px"><b>Telefon bildirimleri</b><span class="small muted" style="line-height:1.45">${msg}</span></div>${btn ? `<div>${btn}</div>` : ''}</div>`;
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'push' && !document.hidden) poll(true); });
}

// ------------------------------------------------------------------ ses
let actx = null, voiceUnlocked = false;
const soundOn = () => localStorage.getItem('qrm_sound') !== '0';
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    if (!voiceUnlocked && 'speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); voiceUnlocked = true; }
  } catch (_) {}
}
const SND = {
  ok: [[880, 110, 50], [1320, 170, 0]],
  warn: [[660, 220, 140], [660, 220, 0]],
  alarm: [[988, 260, 90], [740, 260, 90], [988, 260, 90], [740, 260, 0]]
};
function beep(kind, force) {
  if (!force && !soundOn()) return;
  try {
    unlockAudio(); if (!actx) return;
    let t = actx.currentTime + 0.02;
    (SND[kind] || SND.ok).forEach(([f, d, g]) => {
      const o = actx.createOscillator(), gn = actx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.5, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + d / 1000);
      o.connect(gn); gn.connect(actx.destination); o.start(t); o.stop(t + d / 1000 + 0.05);
      t += (d + g) / 1000;
    });
  } catch (_) {}
}
function say(text, force) {
  if (!force && !soundOn()) return;
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'tr-TR'; u.rate = 1;
    const v = speechSynthesis.getVoices().find((x) => /^tr/i.test(x.lang)); if (v) u.voice = v;
    speechSynthesis.cancel(); setTimeout(() => speechSynthesis.speak(u), 900);
  } catch (_) {}
}
function alertSound(kind, text) { beep(kind); if (text) say(text); }

// ------------------------------------------------------------------ durum
const S = {
  sb: null, session: null, me: null, fetchedAt: 0, off: 0,
  view: 'home', tab: 'live', filter: 'all', asEmployee: false,
  team: [], teamAt: 0, adminNotifs: [], staff: [], company: null,
  pendingToken: null, result: null, scanner: null, lastUnread: null, marks: {},
  kiosk: null, report: null
};

// ------------------------------------------------------------------ başlangıç
function boot() {
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    app.innerHTML = `<div class="phone"><div class="card col"><h1 class="h1">Kurulum eksik</h1>
      <p class="muted" style="margin:0;line-height:1.5">${!window.supabase ? 'Kütüphaneler yüklenemedi. İnternet bağlantını kontrol et.' : '<b>config.js</b> dosyasına Supabase adresini ve anahtarını yazman gerekiyor. Ayrıntılar README dosyasında.'}</p></div></div>`;
    return;
  }
  S.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  S.sb.auth.onAuthStateChange((ev, session) => {
    const had = !!S.session; S.session = session;
    if ((ev === 'SIGNED_IN' && !had) || ev === 'SIGNED_OUT') { S.me = null; setTimeout(route, 0); }
  });
  window.addEventListener('hashchange', route);
  setInterval(tick, 1000);
  setInterval(poll, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(true); });
  route();
}

async function route() {
  const h = location.hash || '';
  if (h.startsWith('#/kiosk')) return kioskStart(new URLSearchParams(h.split('?')[1] || ''));
  stopKiosk();
  if (h.startsWith('#/kayit')) { authState.tab = 'register'; history.replaceState(null, '', BASE); }
  const m = h.match(/^#\/s\/(.+)$/);
  if (m) { S.pendingToken = decodeURIComponent(m[1]); history.replaceState(null, '', BASE); }
  const { data } = await S.sb.auth.getSession();
  S.session = data.session;
  if (!S.session) return renderAuth();
  if (!S.me) {
    const ok = await loadMe();
    if (ok === 'error') return;
  }
  if (!S.me) return renderOnboard();
  syncPush().then(() => { if (push.on && !S.kiosk) render(); });
  if (S.pendingToken) { const t = S.pendingToken; S.pendingToken = null; return handleToken(t); }
  render();
}

async function loadMe() {
  const { data, error } = await S.sb.rpc('my_status');
  if (error) {
    app.innerHTML = `<div class="phone"><div class="err">${esc(errMsg(error))}</div><button class="btn big" data-act="reload">Tekrar dene</button><button class="btn big ghost" data-act="logout">Çıkış yap</button></div>`;
    return 'error';
  }
  setMe(data);
  return 'ok';
}
function setMe(data) {
  S.me = data || null; S.fetchedAt = Date.now();
  if (data && data.server_now) S.off = new Date(data.server_now).getTime() - Date.now();
}

function render() {
  if (!S.me) return renderOnboard();
  if (S.me.role === 'admin' && !S.asEmployee) return renderAdmin();
  return renderEmployee();
}

// ------------------------------------------------------------------ giriş / kayıt
const authState = { tab: 'login', method: 'email', mode: 'join', msg: '', err: '' };
function phoneToEmail(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '9' + d;
  if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  if (d.length < 10) throw new Error('Geçerli bir telefon numarası yaz.');
  return `${d}@tel.qrmola.app`;
}
function renderAuth() {
  const a = authState, reg = a.tab === 'register';
  app.innerHTML = `<div class="phone" style="gap:22px;padding-top:40px">
    <div class="col" style="gap:14px">
      <div style="width:56px;height:56px;border-radius:16px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center">${I.logo}</div>
      <div><h1 class="h1">${reg ? 'Hesap oluştur' : 'Giriş yap'}</h1>
      <p class="muted" style="margin:6px 0 0;line-height:1.5">Giriş, mola ve çıkışta QR okut, kalan mola süreni gör.</p></div>
    </div>
    <div class="seg" role="tablist" aria-label="Giriş veya kayıt">
      <button type="button" role="tab" aria-selected="${!reg}" class="${!reg ? 'on' : ''}" data-act="authTab" data-v="login">Giriş</button>
      <button type="button" role="tab" aria-selected="${reg}" class="${reg ? 'on' : ''}" data-act="authTab" data-v="register">Kayıt ol</button>
    </div>
    <form class="col" style="gap:14px" data-form="auth" novalidate>
      ${reg ? `<label class="f">Ad soyad<input class="inp" name="full_name" autocomplete="name" required placeholder="Ayşe Yılmaz"></label>` : ''}
      <label class="f">E-posta<input class="inp" name="email" type="email" autocomplete="email" required placeholder="ornek@sirket.com"></label>
      <label class="f">Şifre<input class="inp" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required minlength="6" placeholder="En az 6 karakter"></label>
      ${reg ? `<p class="xs muted" style="margin:0">Kayıt olunca çalışan olarak eklenirsin. Yönetici yetkisini yöneticin verir.</p>` : ''}
      ${a.err ? `<div class="err" role="alert">${esc(a.err)}</div>` : ''}
      ${a.msg ? `<div class="ok" role="status">${esc(a.msg)}</div>` : ''}
      <button class="btn big" type="submit">${reg ? 'Kayıt ol' : 'Giriş yap'}</button>
    </form>
  </div>`;
}
async function submitAuth(form) {
  const a = authState, f = Object.fromEntries(new FormData(form));
  a.err = ''; a.msg = '';
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    const email = a.method === 'phone' ? phoneToEmail(f.phone) : String(f.email || '').trim();
    const contact = a.method === 'phone' ? String(f.phone).trim() : email;
    if (!email || !f.password) throw new Error('Tüm alanları doldur.');
    if (a.tab === 'login') {
      const { error } = await S.sb.auth.signInWithPassword({ email, password: f.password });
      if (error) throw error;
      return;
    }
    if (!String(f.full_name || '').trim()) throw new Error('Ad soyad yaz.');
    localStorage.setItem('qrm_onboard', JSON.stringify({ mode: 'auto', full_name: f.full_name, contact }));
    const { data, error } = await S.sb.auth.signUp({ email, password: f.password, options: { data: { full_name: f.full_name }, emailRedirectTo: BASE } });
    if (error) throw error;
    if (!data.session) { a.tab = 'login'; a.msg = 'Kayıt alındı. E-postana gelen doğrulama bağlantısına tıkla, sonra giriş yap.'; renderAuth(); }
  } catch (e) {
    a.err = errMsg(e); renderAuth();
  }
}

// ------------------------------------------------------------------ şirkete bağlanma
let onboardTried = false;
function renderOnboard(err) {
  const ob = JSON.parse(localStorage.getItem('qrm_onboard') || '{}');
  if (!err && !onboardTried && ob.full_name && (ob.mode === 'auto' || ob.code || ob.company)) { onboardTried = true; return finishOnboard(ob); }
  const mode = ob.mode || 'auto';
  if (mode === 'auto') {
    app.innerHTML = `<div class="phone" style="padding-top:40px">
      <h1 class="h1">Son bir adım</h1>
      <form class="col card" data-form="onboard">
        <label class="f">Ad soyad<input class="inp" name="full_name" value="${esc(ob.full_name || '')}" required></label>
        ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
        <button class="btn big" type="submit">Devam et</button>
      </form>
      <button class="btn ghost" data-act="logout">Farklı hesapla giriş yap</button>
    </div>`;
    return;
  }
  app.innerHTML = `<div class="phone" style="padding-top:40px">
    <h1 class="h1">Son bir adım</h1>
    <p class="muted" style="margin:0">Hesabını bir şirkete bağla.</p>
    <form class="col card" data-form="onboard">
      <div class="seg"><button type="button" class="${mode === 'join' ? 'on' : ''}" data-act="obMode" data-v="join">Çalışanım</button><button type="button" class="${mode === 'create' ? 'on' : ''}" data-act="obMode" data-v="create">Yöneticiyim</button></div>
      <label class="f">Ad soyad<input class="inp" name="full_name" value="${esc(ob.full_name || '')}" required></label>
      ${mode === 'join'
        ? `<label class="f">Şirket davet kodu<input class="inp" name="code" value="${esc(ob.code || '')}" required autocapitalize="characters"></label>`
        : `<label class="f">Şirket / işletme adı<input class="inp" name="company" value="${esc(ob.company || '')}" required></label>`}
      ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
      <button class="btn big" type="submit">Devam et</button>
    </form>
    <button class="btn ghost" data-act="logout">Farklı hesapla giriş yap</button>
  </div>`;
}
async function finishOnboard(ob) {
  app.innerHTML = '<div class="phone"><p class="muted">Hesabın hazırlanıyor…</p></div>';
  const contact = ob.contact || (S.session && S.session.user && S.session.user.email) || null;
  const r = ob.mode === 'create'
    ? await S.sb.rpc('create_company', { p_company: ob.company, p_full_name: ob.full_name, p_contact: contact })
    : ob.mode === 'join'
      ? await S.sb.rpc('join_company', { p_code: ob.code, p_full_name: ob.full_name, p_contact: contact })
      : await S.sb.rpc('join_default', { p_full_name: ob.full_name, p_contact: contact });
  if (r.error) {
    if (ob.mode === 'auto' && /Davet kodu gerekli/.test(r.error.message || '')) ob.mode = 'join';
    localStorage.setItem('qrm_onboard', JSON.stringify(ob)); return renderOnboard(errMsg(r.error));
  }
  localStorage.removeItem('qrm_onboard');
  await loadMe();
  if (S.me && S.me.role === 'admin') { S.tab = 'staff'; toast('Hesabın hazır. Uygulama bağlantısını çalışanlarınla paylaş.'); }
  route();
}

// ------------------------------------------------------------------ çalışan
function live() {
  const m = S.me, dt = (Date.now() - S.fetchedAt) / 1000;
  const worked = m.worked_sec + (m.status === 'working' ? dt : 0);
  const brk = m.break_sec + (m.status === 'break' ? dt : 0);
  const thisBreak = m.status === 'break' && m.break_since ? Math.max(0, (now() - new Date(m.break_since).getTime()) / 1000) : 0;
  const left = m.allowance_sec - brk;
  return { worked, brk, thisBreak, left, startLeft: left + thisBreak };
}

function renderEmployee() {
  const m = S.me;
  if (S.view === 'scan') return renderScanner();
  if (S.view === 'result') return renderResult();
  stopScanner();
  if (S.view === 'home' && m.status === 'break') return renderBreak();
  let body = '';
  if (S.view === 'history') body = renderHistoryBody();
  else if (S.view === 'notifs') body = renderNotifsBody();
  else if (S.view === 'profile') body = renderProfileBody();
  else body = renderHomeBody();
  app.innerHTML = `<div class="phone">${body}<div class="grow"></div>${empNav()}</div>`;
  if (S.view === 'history') loadHistory();
  if (S.view === 'notifs') loadNotifs();
  tick();
}
function empNav() {
  const b = (v, ic, t, badge) => `<button class="${S.view === v ? 'on' : ''}" data-act="empView" data-v="${v}" aria-current="${S.view === v ? 'page' : 'false'}" style="position:relative">${ic}${t}${badge ? `<span class="dot-badge" style="top:0;right:12px">${badge}</span>` : ''}</button>`;
  return `<nav class="bottomnav" aria-label="Alt menü">${b('home', I.home, 'Ana sayfa')}${b('history', I.clock, 'Geçmiş')}${b('notifs', I.bell, 'Bildirimler', S.me.unread || '')}${b('profile', I.user, 'Profil')}</nav>`;
}
function scanLabel(st) {
  if (st === 'break') return 'QR okut · Moladan dön';
  if (st === 'working') return 'QR okut · Mola / Çıkış';
  return 'QR okut · İşe giriş';
}
function inOutCard(m) {
  const ins = (m.events || []).filter((e) => e.kind === 'in'), outs = (m.events || []).filter((e) => e.kind === 'out');
  const firstIn = ins[0], lastOut = m.status === 'done' ? outs[outs.length - 1] : null;
  return `<div class="card row" style="gap:0;padding:0">
    <div class="col grow" style="gap:2px;padding:14px 18px;border-right:1px solid var(--line)"><span class="xs muted">Giriş</span><b class="num" style="font-size:22px">${firstIn ? tClock(firstIn.at) : '—'}</b></div>
    <div class="col grow" style="gap:2px;padding:14px 18px"><span class="xs muted">Çıkış</span><b class="num" style="font-size:22px">${lastOut ? tClock(lastOut.at) : '—'}</b></div>
  </div>`;
}
function renderHomeBody() {
  const m = S.me;
  const evs = (m.events || []).filter((e) => e.kind === 'break_start' || e.kind === 'break_end');
  const rows = []; let open = null;
  evs.forEach((e) => { if (e.kind === 'break_start') open = e; else if (open) { rows.push([open.at, e.at, open.source === 'manual' || e.source === 'manual']); open = null; } });
  const list = rows.map(([a, b, man]) => `<div class="ev"><span class="evi" style="background:var(--amber-bg);color:var(--amber)">${I.cup}</span><span class="grow">${tClock(a)} – ${tClock(b)}${man ? ' <span class="xs muted">(yönetici)</span>' : ''}</span><b class="num">${fmtMin((new Date(b) - new Date(a)) / 1000)}</b></div>`).join('');
  const perm = pushCard(true);
  return `
    <div class="row between">
      <div class="col" style="gap:2px"><span class="small muted">${esc(todayLong())}</span><span style="font-size:22px;font-weight:700">Merhaba, ${esc(String(m.full_name).split(' ')[0])}</span></div>
      ${m.role === 'admin' ? `<button class="btn sm ghost" data-act="toAdmin">Yönetici paneli</button>` : chip(m.status)}
    </div>
    ${m.unread ? `<button class="alert danger" data-act="empView" data-v="notifs" style="border:0;text-align:left;cursor:pointer;width:100%"><span class="dz-ic">${I.warn}</span><div class="col" style="gap:2px"><b>${m.unread} yeni uyarın var</b><span class="small">Görmek için dokun</span></div></button>` : ''}
    <div class="leftcard" id="lv-card">
      <div class="row between small" style="font-weight:600"><span id="lv-leftlabel">Kalan mola süren</span><span style="font-weight:500">Günlük hak ${Math.round(m.allowance_sec / 60)} dk</span></div>
      <span class="big num" id="lv-left">--:--</span>
      <div class="bar"><div id="lv-leftbar" style="width:100%"></div></div>
      <span class="small" id="lv-used"></span>
    </div>
    ${inOutCard(m)}
    <div class="card"><div class="row between" style="margin-bottom:6px"><h2 class="h2">Bugünkü molalar</h2><span class="small muted">${rows.length} mola</span></div>${list || '<p class="muted small" style="margin:6px 0 0">Bugün henüz molaya çıkmadın.</p>'}</div>
    ${perm}
    <div class="grow"></div>
    <button class="btn big" data-act="openScan">${I.qr}${scanLabel(m.status)}</button>`;
}
function renderBreak() {
  const m = S.me;
  app.innerHTML = `<div class="phone">
    <div class="row between">${chip('break', 'Moladasın')}<span class="small muted">Mola başlangıcı ${tClock(m.break_since)}</span></div>
    <div id="lv-alert"></div>
    <div class="col grow" style="justify-content:center;gap:22px">
      <div class="ring">
        <svg width="280" height="280" viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r="124" fill="none" stroke="#E7E9EE" stroke-width="16"/>
          <circle id="lv-ring" cx="140" cy="140" r="124" fill="none" stroke="#0F766E" stroke-width="16" stroke-linecap="round" stroke-dasharray="779.1" stroke-dashoffset="0"/>
        </svg>
        <div class="in">
          <span class="small" style="font-weight:600;letter-spacing:.6px" id="lv-label">KALAN MOLA</span>
          <span class="t num" role="timer" id="lv-left">--:--</span>
          <span class="muted num" id="lv-el"></span>
        </div>
      </div>
      <div class="card row between"><span class="small muted">Molaya çıkarken kalan</span><b class="num" id="lv-startleft"></b></div>
    </div>
    <button class="btn big" data-act="openScan">${I.qr}QR okut · Moladan dön</button>
    ${empNav()}
  </div>`;
  tick();
}
function tickEmployee() {
  const m = S.me; if (!m) return;
  const L = live();
  const el = (id) => document.getElementById(id);
  const over = L.left < 0;
  if (el('lv-left')) el('lv-left').textContent = over ? '+' + fmtMS(-L.left) : fmtMS(L.left);
  if (el('lv-leftbar')) el('lv-leftbar').style.width = Math.max(0, Math.min(100, L.left / Math.max(1, m.allowance_sec) * 100)) + '%';
  if (el('lv-card')) { el('lv-card').classList.toggle('over', over); el('lv-leftlabel').textContent = over ? 'Mola hakkını aştın' : 'Kalan mola süren'; }
  if (el('lv-used')) el('lv-used').textContent = `Bugün ${fmtMin(L.brk)} kullandın · Molaya çıkınca bu süreden geri sayılır`;
  if (el('lv-work')) el('lv-work').textContent = fmtHM(L.worked);
  if (m.status === 'break') {
    const warn = !over && L.left < 300;
    if (el('lv-label')) { el('lv-label').textContent = over ? 'SÜRE AŞILDI' : 'KALAN MOLA'; el('lv-label').style.color = over ? '#B91C1C' : warn ? '#9A3412' : '#0F766E'; }
    if (el('lv-left')) el('lv-left').style.color = over ? '#B91C1C' : '#14161A';
    if (el('lv-el')) el('lv-el').textContent = 'Bu molada geçen ' + fmtMS(L.thisBreak);
    if (el('lv-startleft')) el('lv-startleft').textContent = L.startLeft < 0 ? 'hak dolmuştu' : fmtMS(L.startLeft);
    if (el('lv-ring')) {
      el('lv-ring').setAttribute('stroke-dashoffset', (779.1 * (1 - Math.max(0, Math.min(1, L.left / Math.max(1, m.allowance_sec))))).toFixed(1));
      el('lv-ring').setAttribute('stroke', over ? '#DC2626' : warn ? '#EA580C' : '#0F766E');
    }
    const a = el('lv-alert');
    if (a) {
      const html = over ? `<div class="err" role="alert"><b>Mola hakkın doldu.</b> Yöneticine bildirim gitti, lütfen QR okutup işe dön.</div>`
        : warn ? `<div class="ok" role="status" style="background:var(--orange-bg);color:var(--orange)"><b>Molanın bitmesine 5 dakikadan az kaldı.</b></div>` : '';
      if (a.dataset.h !== html) { a.innerHTML = html; a.dataset.h = html; }
    }
    const key = m.break_since;
    if (warn && !S.marks[key + 'w']) { S.marks[key + 'w'] = 1; notifyDevice('Molan bitiyor', '5 dakikadan az kaldı.'); alertSound('warn', 'Molanın bitmesine beş dakika kaldı.'); }
    if (over && !S.marks[key + 'o']) { S.marks[key + 'o'] = 1; notifyDevice('Mola hakkın doldu', 'Lütfen QR okutup işe dön.'); alertSound('alarm', 'Mola süren doldu. Lütfen işe dön.'); }
    const tenth = Math.floor(L.thisBreak / 600);
    if (!S.marks[key + 'init']) { S.marks[key + 'init'] = 1; S.marks[key + 't' + tenth] = 1; }
    if (tenth >= 1 && !S.marks[key + 't' + tenth]) {
      S.marks[key + 't' + tenth] = 1;
      const passed = tenth * 10, leftMin = Math.floor(Math.abs(L.left) / 60);
      beep('warn');
      say(over ? `Molanın ${passed} dakikası geçti. Mola süreni ${Math.max(1, leftMin)} dakika aştın, lütfen işe dön.`
               : `Molanın ${passed} dakikası geçti. Kalan mola süren ${leftMin} dakika.`);
    }
    if (over && !S.marks[key + 'o5'] && -L.left >= 300) { S.marks[key + 'o5'] = 1; alertSound('alarm', 'Mola süreni beş dakika aştın.'); }
  }
}

// geçmiş, bildirimler, profil
let histCache = null;
function renderHistoryBody() {
  return `<h1 class="h1">Son 14 gün</h1><div class="card" id="hist"><p class="muted small">Yükleniyor…</p></div>`;
}
async function loadHistory() {
  const { data, error } = await S.sb.rpc('my_history', { p_days: 14 });
  const box = document.getElementById('hist'); if (!box) return;
  if (error) { box.innerHTML = `<div class="err">${esc(errMsg(error))}</div>`; return; }
  box.innerHTML = data.map((r) => {
    const over = r.break_sec > r.allowance_sec;
    return `<div class="ev"><span class="grow"><b>${esc(tDate(r.day))}</b><br><span class="xs muted">${r.breaks || 0} mola</span></span>
      <span class="col" style="gap:2px;align-items:flex-end"><b class="num" style="color:${over ? '#B91C1C' : 'inherit'}">${r.break_sec ? fmtMin(r.break_sec) : '—'}</b><span class="xs" style="color:${over ? '#B91C1C' : 'var(--muted)'}">${over ? Math.ceil((r.break_sec - r.allowance_sec) / 60) + ' dk aşım' : 'hak ' + Math.round(r.allowance_sec / 60) + ' dk'}</span></span></div>`;
  }).join('') || '<p class="muted small">Kayıt yok.</p>';
}
function renderNotifsBody() {
  return `<h1 class="h1">Bildirimler</h1><div class="col" id="notifs"><p class="muted small">Yükleniyor…</p></div>`;
}
async function loadNotifs() {
  const { data, error } = await S.sb.from('notifications').select('*').eq('user_id', S.me.user_id).order('created_at', { ascending: false }).limit(50);
  const box = document.getElementById('notifs'); if (!box) return;
  if (error) { box.innerHTML = `<div class="err">${esc(errMsg(error))}</div>`; return; }
  box.innerHTML = data.map((n) => {
    const t = new Date(n.created_at).toLocaleString('tr-TR', { timeZone: tz(), day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (n.kind === 'warning' || n.kind === 'overdue') {
      return `<div class="alert danger" role="alert"><span class="dz-ic">${I.warn}</span><div class="col" style="gap:3px"><b>${esc(n.title)}</b><span class="small">${esc(n.body || '')}</span><span class="xs" style="opacity:.8">${t}${n.read_at ? '' : ' · Yeni'}</span></div></div>`;
    }
    return `<div class="alert i" style="${n.read_at ? 'opacity:.7' : ''}"><i></i><div class="col" style="gap:3px"><b class="small">${esc(n.title)}</b><span class="small">${esc(n.body || '')}</span><span class="xs muted">${t}</span></div></div>`;
  }).join('') || '<p class="muted small">Bildirim yok.</p>';
  if (data.some((n) => !n.read_at)) {
    await S.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', S.me.user_id).is('read_at', null);
    S.me.unread = 0; S.lastUnread = 0;
  }
}
function renderProfileBody() {
  const m = S.me;
  return `<h1 class="h1">Profil</h1>
    <div class="card col"><div class="row"><span class="av" style="width:48px;height:48px;font-size:16px">${esc(initials(m.full_name))}</span><div class="col" style="gap:2px"><b>${esc(m.full_name)}</b><span class="small muted">${esc(m.company.name)} · ${m.role === 'admin' ? 'Yönetici' : 'Çalışan'}</span></div></div>
    <span class="small muted">Günlük mola hakkı: ${Math.round(m.allowance_sec / 60)} dk</span></div>
    <div class="card row between"><div class="col" style="gap:2px"><b>Sesli uyarılar</b><span class="small muted">Mola biterken ve uyarı gelince ses çalar, sesli okur</span></div>
      <div class="row" style="gap:6px"><button class="btn sm ghost" data-act="testSound">Dene</button><button class="btn sm ${soundOn() ? 'teal' : 'line'}" data-act="toggleSound" aria-pressed="${soundOn()}">${soundOn() ? 'Açık' : 'Kapalı'}</button></div></div>
    ${pushCard()}
    ${m.role === 'admin' ? `<button class="btn ghost" data-act="toAdmin">Yönetici paneline geç</button>` : ''}
    <button class="btn ghost" data-act="logout">Çıkış yap</button>
    <p class="xs muted" style="margin:0">İpucu: Telefonda Safari'de Paylaş → “Ana Ekrana Ekle” diyerek uygulama gibi kullanabilirsin.</p>`;
}

// ------------------------------------------------------------------ QR okutma
function renderScanner(err) {
  app.innerHTML = `<div class="scanwrap"><div class="phone" style="gap:20px">
    <div class="row between"><button class="iconbtn" style="background:#23252B;border:0;color:#fff" aria-label="Geri" data-act="closeScan">${I.back}</button><b>QR Okut</b><span style="width:44px"></span></div>
    <div class="col grow" style="justify-content:center;gap:18px">
      <div id="reader"></div>
      <p style="margin:0;text-align:center;color:#B7BCC7;line-height:1.5" class="small">${S.me.status === 'break' ? 'Dönüşte duvardaki QR kodu okut.<br>Geçen süre mola hakkından düşülür.' : S.me.status === 'working' ? 'Duvardaki QR kodu okut, sonra<br>molaya mı çıkış mı seç.' : 'İşe başlarken duvardaki QR kodu okut.'}</p>
      ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
    </div>
  </div></div>`;
  startScanner();
}
async function startScanner() {
  await stopScanner();
  if (!window.Html5Qrcode) return renderScanner('Tarayıcı yüklenemedi.');
  try {
    S.scanner = new Html5Qrcode('reader', { verbose: false });
    await S.scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } },
      (text) => { stopScanner(); handleToken(text); }, () => {});
  } catch (e) {
    const r = document.getElementById('reader');
    if (r) r.outerHTML = `<div class="err" role="alert">Kameraya erişilemedi. Tarayıcı ayarlarından kamera iznini aç ve sayfayı yenile.<br><span class="xs">Alternatif: telefonun kendi kamerasıyla kapıdaki QR kodu okut, açılan bağlantı işlemi yapar.</span></div>`;
  }
}
async function stopScanner() {
  const s = S.scanner; S.scanner = null;
  if (s) { try { if (s.isScanning) await s.stop(); s.clear(); } catch (_) {} }
}
function extractToken(text) {
  text = String(text || '').trim();
  const i = text.indexOf('#/s/');
  return i >= 0 ? decodeURIComponent(text.slice(i + 4)) : text;
}
async function handleToken(text) {
  const token = extractToken(text);
  if (!S.me) return route();
  await refreshMe();
  const st = S.me.status;
  if (st === 'break') return doScan(token, 'break_end');
  if (st !== 'working') return doScan(token, 'in');
  S.view = 'choose'; S.chooseToken = token;
  const L = live();
  app.innerHTML = `<div class="phone" style="justify-content:flex-end">
    <div class="col grow" style="justify-content:center;align-items:center;text-align:center;gap:12px">
      <span style="width:64px;height:64px;border-radius:32px;background:var(--green-bg);color:var(--green);display:flex;align-items:center;justify-content:center">${I.check}</span>
      <h1 class="h1">Kod okundu</h1><p class="muted" style="margin:0">Ne yapmak istiyorsun?</p>
    </div>
    <button class="btn big" data-act="doScan" data-v="break_start" style="justify-content:space-between"><span>Molaya çık</span><span class="small" style="font-weight:500;color:#C9CDD6">${L.left > 0 ? fmtMS(L.left) + ' hakkın var' : 'hakkın doldu'}</span></button>
    <button class="btn big ghost" data-act="doScan" data-v="out">Çıkış yap (gün bitti)</button>
    <button class="btn ghost" data-act="empView" data-v="home">Vazgeç</button>
  </div>`;
}
async function doScan(token, action) {
  const before = S.me ? live() : null;
  app.innerHTML = '<div class="phone" style="justify-content:center;align-items:center"><p class="muted">Kaydediliyor…</p></div>';
  const { data, error } = await S.sb.rpc('scan', { p_token: token, p_action: action });
  if (error) {
    beep('warn');
    S.view = 'result'; S.result = { error: errMsg(error) }; return renderEmployee();
  }
  setMe(data);
  S.chooseToken = null;
  beep('ok');
  say({ in: 'Hoş geldin. Giriş kaydedildi.', break_start: 'Mola başladı. İyi molalar.', break_end: 'Moladan dönüşün kaydedildi.', out: 'Çıkış kaydedildi. Görüşmek üzere.' }[action] || '');
  if (action === 'break_start') { S.view = 'home'; toast('Mola başladı. Geri sayım çalışıyor.'); return renderEmployee(); }
  const after = live();
  S.result = { action, before, after, at: new Date(now()).toISOString() };
  S.view = 'result';
  renderEmployee();
}
function renderResult() {
  const r = S.result || {};
  if (r.error) {
    app.innerHTML = `<div class="phone" style="justify-content:center;gap:16px"><div class="err" role="alert" style="font-size:15px">${esc(r.error)}</div>
      <button class="btn big" data-act="openScan">${I.qr}Tekrar okut</button><button class="btn big ghost" data-act="empView" data-v="home">Ana sayfa</button></div>`;
    return;
  }
  let title, body, note = '';
  if (r.action === 'in') {
    title = 'İşe giriş kaydedildi';
    body = `<div class="row between"><span class="muted">Giriş saati</span><b class="num" style="font-size:24px">${tClock(r.at)}</b></div>
      <div class="row between"><span class="muted">Bugünkü mola hakkın</span><b class="num">${fmtMS(r.after.left)}</b></div>`;
    note = 'İyi çalışmalar!';
  } else if (r.action === 'out') {
    title = 'Çıkış kaydedildi';
    body = `<div class="row between"><span class="muted">Çıkış saati</span><b class="num" style="font-size:24px">${tClock(r.at)}</b></div>
      <div class="row between"><span class="muted">Bugün toplam mola</span><b class="num" style="color:${r.after.left < 0 ? '#B91C1C' : 'inherit'}">${fmtMin(r.after.brk)}</b></div>`;
    note = 'Görüşmek üzere!';
  } else {
    const used = r.before ? r.before.thisBreak : 0;
    title = 'Moladan dönüşün kaydedildi';
    body = `<div class="row between"><span class="muted">Molaya çıkarken kalan</span><b class="num">${r.before && r.before.startLeft < 0 ? 'hak dolmuştu' : fmtMS(r.before ? r.before.startLeft : 0)}</b></div>
      <div class="row between"><span class="muted">Bu molada geçen</span><b class="num" style="color:#B45309">−${fmtMS(used)}</b></div>
      <div style="height:1px;background:var(--line)"></div>
      <div class="row between"><b>Kalan mola hakkın</b><b class="num" style="font-size:28px;color:${r.after.left < 0 ? '#B91C1C' : 'var(--teal)'}">${r.after.left < 0 ? '+' + fmtMS(-r.after.left) + ' aşım' : fmtMS(r.after.left)}</b></div>`;
    note = 'Sonraki molanda geri sayım bu süreden başlar.';
  }
  app.innerHTML = `<div class="phone" style="background:#fff">
    <div class="col grow" style="justify-content:center;align-items:center;text-align:center;gap:18px">
      <span style="width:72px;height:72px;border-radius:36px;background:var(--green-bg);color:var(--green);display:flex;align-items:center;justify-content:center">${I.check}</span>
      <h1 class="h1">${title}</h1>
      <div class="card col" style="width:100%;background:var(--bg);text-align:left;gap:12px">${body}</div>
      <p class="small muted" style="margin:0">${note}</p>
    </div>
    <button class="btn big" data-act="empView" data-v="home">Ana sayfaya dön</button>
  </div>`;
}
async function refreshMe() {
  const { data, error } = await S.sb.rpc('my_status');
  if (!error && data) setMe(data);
}

// ------------------------------------------------------------------ yönetici
function teamLive(r) {
  const dt = (Date.now() - S.teamAt) / 1000;
  const brk = r.break_sec + (r.status === 'break' ? dt : 0);
  const worked = r.worked_sec + (r.status === 'working' ? dt : 0);
  const thisBreak = r.status === 'break' && r.break_since ? Math.max(0, (now() - new Date(r.break_since).getTime()) / 1000) : 0;
  return { brk, worked, thisBreak, over: brk > r.allowance_sec, left: r.allowance_sec - brk };
}
function renderAdmin() {
  stopScanner();
  const tabs = [['live', 'Canlı durum'], ['reports', 'Raporlar'], ['staff', 'Çalışanlar'], ['settings', 'Ayarlar']];
  const unread = S.adminNotifs.filter((n) => !n.read_at).length;
  app.innerHTML = `
  <header class="top"><div class="wrap row between" style="flex-wrap:wrap">
    <div class="row"><div style="width:40px;height:40px;border-radius:12px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center">${I.logo}</div>
      <div class="col" style="gap:0"><b>Mola Takip</b><span class="small muted">${esc(S.me.company.name)}</span></div></div>
    <nav class="tabs" aria-label="Yönetici menüsü">${tabs.map(([k, t]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}" aria-current="${S.tab === k ? 'page' : 'false'}">${t}</button>`).join('')}</nav>
    <div class="row">
      <button class="iconbtn" data-act="tab" data-v="live" aria-label="Uyarılar, ${unread} okunmamış">${I.bell}${unread ? `<span class="dot-badge">${unread}</span>` : ''}</button>
      <button class="btn sm ${soundOn() ? 'teal' : 'ghost'}" data-act="toggleSound" aria-pressed="${soundOn()}" title="Uyarı gelince sesli bildir">Ses: ${soundOn() ? 'Açık' : 'Kapalı'}</button>
      <button class="btn sm ghost" data-act="toEmployee">Kendi molam</button>
      <button class="btn sm ghost" data-act="logout">Çıkış</button>
    </div>
  </div></header>
  <main class="wrap col" style="gap:20px;padding-top:20px;padding-bottom:40px" id="admin-main"></main>`;
  renderAdminTab();
}
function renderAdminTab() {
  const box = document.getElementById('admin-main'); if (!box) return;
  if (S.tab === 'live') { box.innerHTML = liveHtml(); loadTeam(); }
  else if (S.tab === 'reports') { box.innerHTML = reportsHtml(); }
  else if (S.tab === 'staff') { box.innerHTML = '<p class="muted">Yükleniyor…</p>'; loadStaff(); }
  else if (S.tab === 'settings') { box.innerHTML = '<p class="muted">Yükleniyor…</p>'; loadSettings(); }
}

// canlı durum
function liveHtml() {
  // sadece bugün molaya çıkmış olanlar (o gün çalışıyordur)
  const team = S.team.filter((r) => r.first_in || (r.breaks || 0) > 0 || r.status === 'break').map((r) => ({ r, L: teamLive(r) }));
  const cnt = (f) => team.filter(f).length;
  const allowMin = team[0] ? Math.round(team[0].r.allowance_sec / 60) : null;
  const defs = [
    ['in', 'Şu an çalışıyor', '#16A34A', (x) => x.r.status === 'working' || x.r.status === 'break', 'Giriş yapmış, çıkmamış'],
    ['break', 'Şu an molada', '#D97706', (x) => x.r.status === 'break', 'Geri sayım çalışıyor'],
    ['done', 'Çıkış yaptı', '#6B7280', (x) => x.r.status === 'done', 'Bugün işi bitenler'],
    ['over', 'Fazla mola', '#B91C1C', (x) => x.L.over, 'Bugün hakkını aşan']
  ];
  const f = defs.find((d) => d[0] === S.filter);
  const ord = { break: 0, working: 1, off: 2, done: 3 };
  const rows = team.filter((x) => !f || f[3](x)).sort((a, b) => (ord[a.r.status] ?? 2) - (ord[b.r.status] ?? 2) || String(a.r.first_in || '').localeCompare(String(b.r.first_in || '')));
  return `
    <div class="row between" style="flex-wrap:wrap">
      <div class="col" style="gap:4px"><h1 class="h1">Bugün</h1><span class="small muted">${esc(todayLong())}${allowMin !== null ? ` · Günlük mola hakkı ${allowMin} dk` : ''}</span></div>
      <span class="row small muted" style="gap:8px"><span style="width:8px;height:8px;border-radius:4px;background:#16A34A"></span>Canlı · <b class="num" id="lv-clock" style="color:var(--ink)"></b></span>
    </div>
    <div class="tiles">${defs.map((d) => `<button class="tile ${S.filter === d[0] ? 'on' : ''}" data-act="filter" data-v="${d[0]}" aria-pressed="${S.filter === d[0]}"><span class="l"><i style="background:${d[2]}"></i>${d[1]}</span><span class="n num">${cnt(d[3])}</span><span class="xs muted">${d[4]}</span></button>`).join('')}</div>
    <div class="split">
      <section class="main card" style="padding:0" aria-label="Çalışanlar">
        <div class="row between" style="padding:16px 20px 8px;flex-wrap:wrap"><h2 class="h2">Çalışanlar · ${f ? f[1] : 'Tümü'} (${rows.length})</h2>
          ${f ? '<button class="btn sm ghost" data-act="filter" data-v="all">Filtreyi kaldır</button>' : ''}</div>
        <div class="tbl-wrap"><table class="tbl" style="min-width:820px">
          <thead><tr><th scope="col" style="padding-left:20px">Çalışan</th><th scope="col">Durum</th><th scope="col">Giriş</th><th scope="col">Çıkış</th><th scope="col">Bugünkü mola</th><th scope="col">Kalan hak</th><th scope="col">Mola sayısı</th><th scope="col" style="text-align:right;padding-right:20px">İşlem</th></tr></thead>
          <tbody>${rows.map(({ r, L }) => {
            const pct = Math.min(100, L.brk / Math.max(1, r.allowance_sec) * 100);
            return `<tr>
              <td style="padding-left:20px"><div class="row" style="gap:10px"><span class="av">${esc(initials(r.full_name))}</span><div class="col" style="gap:0"><b>${esc(r.full_name)}</b><span class="xs muted">${esc(r.contact || '')}</span></div></div></td>
              <td>${r.status === 'break' ? `<span class="chip st-break"><i></i>Molada · <span class="num" data-live="since" data-since="${esc(r.break_since)}"></span></span>` : chip(r.status)}</td>
              <td class="num">${r.first_in ? tClock(r.first_in) : '—'}</td>
              <td class="num">${r.status === 'done' && r.last_out ? tClock(r.last_out) : '—'}</td>
              <td style="white-space:nowrap"><div class="row" style="gap:8px;flex-wrap:nowrap"><span class="mbar"><div data-live="mbar" data-u="${r.user_id}" style="width:${pct}%;background:${L.over ? '#DC2626' : L.left < 300 ? '#EA580C' : '#0F766E'}"></div></span><span class="num" data-live="brk" data-u="${r.user_id}" style="${L.over ? 'color:#B91C1C;font-weight:700' : ''}">${fmtMin(L.brk)}</span><span class="xs muted">/ ${Math.round(r.allowance_sec / 60)}</span></div></td>
              <td class="num" style="white-space:nowrap" data-live="leftlbl" data-u="${r.user_id}" style="${L.over ? 'color:#B91C1C;font-weight:700' : ''}">${L.left < 0 ? 'Aşım +' + Math.ceil(-L.left / 60) + ' dk' : fmtMS(L.left)}</td>
              <td class="num">${r.breaks || 0}</td>
              <td style="text-align:right;padding-right:20px;white-space:nowrap">
                <button class="btn sm ${L.over ? '' : 'ghost'}" data-act="warn" data-u="${r.user_id}">Uyar</button>
                <button class="btn sm ghost" data-act="manual" data-u="${r.user_id}">Düzelt</button>
              </td></tr>`;
          }).join('') || `<tr><td colspan="8" style="padding:24px 20px" class="muted">${team.length ? 'Bu filtrede kimse yok.' : (S.team.length ? 'Bugün henüz giriş yapan yok.' : 'Henüz çalışan yok. “Çalışanlar” sekmesindeki bağlantıyı paylaş.')}</td></tr>`}</tbody>
        </table></div>
      </section>
      <aside class="side">
        <section class="card col" aria-label="Uyarılar"><div class="row between"><h2 class="h2">Uyarılar</h2>${S.adminNotifs.some((n) => !n.read_at) ? '<button class="btn sm ghost" data-act="readAll">Okundu yap</button>' : ''}</div>
          ${S.adminNotifs.slice(0, 15).map((n) => `<div class="alert ${n.kind === 'overdue' ? '' : 'i'}" style="${n.read_at ? 'opacity:.65' : ''}"><i></i><div class="col" style="gap:2px"><b class="small">${esc(n.title)}</b><span class="small">${esc(n.body || '')}</span><span class="xs muted">${new Date(n.created_at).toLocaleString('tr-TR', { timeZone: tz(), hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</span></div></div>`).join('') || '<span class="small muted">Uyarı yok. Biri mola hakkını aşınca burada görünür.</span>'}
        </section>
      </aside>
    </div>`;
}
async function loadTeam(silent) {
  const [t, n] = await Promise.all([
    S.sb.rpc('team_today'),
    S.sb.from('notifications').select('*').eq('user_id', S.me.user_id).order('created_at', { ascending: false }).limit(30)
  ]);
  if (t.error) { if (!silent) toast(errMsg(t.error)); return; }
  const prevIds = new Set(S.adminNotifs.map((x) => x.id));
  const hadAny = S.adminNotifs.length > 0 || S.teamAt > 0;
  S.team = t.data || []; S.teamAt = Date.now();
  if (S.team[0] && S.team[0].server_now) S.off = new Date(S.team[0].server_now).getTime() - Date.now();
  if (!n.error) {
    if (hadAny) {
      const fresh = n.data.filter((x) => !prevIds.has(x.id) && !x.read_at);
      fresh.forEach((x) => notifyDevice(x.title, x.body || ''));
      if (fresh.length) alertSound('alarm', fresh[0].title);
    }
    S.adminNotifs = n.data;
  }
  if (S.tab === 'live' && document.getElementById('admin-main') && !document.querySelector('.modal-bg')) {
    const y = window.scrollY;
    document.getElementById('admin-main').innerHTML = liveHtml();
    window.scrollTo(0, y);
    const bell = document.querySelector('[aria-label^="Uyarılar,"]');
    const u = S.adminNotifs.filter((x) => !x.read_at).length;
    if (bell) { bell.setAttribute('aria-label', `Uyarılar, ${u} okunmamış`); bell.innerHTML = I.bell + (u ? `<span class="dot-badge">${u}</span>` : ''); }
    tick();
  }
}
function tickAdmin() {
  const c = document.getElementById('lv-clock');
  if (c) c.textContent = new Date(now()).toLocaleTimeString('tr-TR', { timeZone: tz() });
  document.querySelectorAll('[data-live="since"]').forEach((e) => { e.textContent = fmtMS((now() - new Date(e.dataset.since).getTime()) / 1000); });
  const byId = Object.fromEntries(S.team.map((r) => [r.user_id, r]));
  document.querySelectorAll('[data-live="brk"],[data-live="work"],[data-live="mbar"],[data-live="leftlbl"]').forEach((e) => {
    const r = byId[e.dataset.u]; if (!r) return; const L = teamLive(r);
    if (e.dataset.live === 'brk') { e.textContent = fmtMin(L.brk); e.style.color = L.over ? '#B91C1C' : ''; e.style.fontWeight = L.over ? '700' : ''; }
    else if (e.dataset.live === 'work') e.textContent = fmtHM(L.worked);
    else if (e.dataset.live === 'mbar') { e.style.width = Math.min(100, L.brk / Math.max(1, r.allowance_sec) * 100) + '%'; e.style.background = L.over ? '#DC2626' : L.left < 300 ? '#EA580C' : '#0F766E'; }
    else { e.textContent = L.left < 0 ? 'Aşım +' + Math.ceil(-L.left / 60) + ' dk' : fmtMS(L.left); e.style.color = L.over ? '#B91C1C' : ''; e.style.fontWeight = L.over ? '700' : ''; }
  });
}

// modal
function modal(html, onSubmit) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal" role="dialog" aria-modal="true">${html}<div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Vazgeç</button><button type="submit" class="btn">Kaydet</button></div></form>`;
  document.body.appendChild(bg);
  const form = bg.querySelector('form');
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.hasAttribute('data-close')) close(); });
  form.addEventListener('submit', async (e) => { e.preventDefault(); const b = form.querySelector('[type=submit]'); b.disabled = true; const ok = await onSubmit(Object.fromEntries(new FormData(form))); b.disabled = false; if (ok !== false) close(); });
  const first = form.querySelector('input,textarea,select'); if (first) first.focus();
}
function warnModal(uid) {
  const r = S.team.find((x) => x.user_id === uid) || S.staff.find((x) => x.id === uid) || {}; const L = r.status ? teamLive(r) : null;
  const def = L && L.over ? 'Günlük mola hakkını aştın, lütfen işe dön.' : 'Lütfen mola sürelerine dikkat et.';
  modal(`<h2 class="h2">${esc(r.full_name || '')} — uyarı gönder</h2><label class="f">Mesaj<textarea class="inp" name="body" rows="3" style="height:auto;padding:12px">${esc(def)}</textarea></label><span class="xs muted">Çalışanın uygulamasında bildirim olarak görünür.</span>`, async (f) => {
    const { error } = await S.sb.rpc('send_warning', { p_user: uid, p_body: f.body });
    if (error) { toast(errMsg(error)); return false; }
    toast('Uyarı gönderildi');
  });
}
function manualModal(uid) {
  const r = S.team.find((x) => x.user_id === uid) || {};
  const t = new Date(now()); const v = `${pad(t.getHours())}:${pad(t.getMinutes())}`;
  modal(`<h2 class="h2">${esc(r.full_name || '')} — elle kayıt ekle</h2>
    <span class="small muted">QR okutmayı unutan çalışan için bugüne kayıt ekler.</span>
    <label class="f">İşlem<select class="inp" name="kind">${[['in', 'İşe giriş'], ['break_start', 'Molaya çıkış'], ['break_end', 'Moladan dönüş'], ['out', 'Çıkış']].map(([v, t]) => `<option value="${v}" ${(r.status === 'break' ? 'break_end' : r.status === 'working' ? 'out' : 'in') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">Saat<input class="inp" type="time" name="time" value="${v}" required></label>
    <label class="f">Not<input class="inp" name="note" placeholder="Örn. QR okutmayı unuttu"></label>`, async (f) => {
    const [h, m] = String(f.time).split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0);
    const { error } = await S.sb.rpc('admin_add_event', { p_user: uid, p_kind: f.kind, p_at: d.toISOString(), p_note: f.note || null });
    if (error) { toast(errMsg(error)); return false; }
    toast('Kayıt eklendi'); loadTeam();
  });
}

// raporlar
function isoDay(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function reportsHtml() {
  const t = new Date(now()); const f = new Date(t); f.setDate(t.getDate() - 6);
  return `<div class="row between" style="flex-wrap:wrap"><h1 class="h1">Raporlar</h1></div>
    <form class="card formgrid" data-form="report">
      <label class="f">Başlangıç<input class="inp" type="date" name="from" value="${S.report ? S.report.from : isoDay(f)}" required></label>
      <label class="f">Bitiş<input class="inp" type="date" name="to" value="${S.report ? S.report.to : isoDay(t)}" required></label>
      <button class="btn" type="submit" style="height:50px">Raporu getir</button>
      <button class="btn line" type="button" data-act="csv" style="height:50px" ${S.report && S.report.rows ? '' : 'disabled'}>Excel'e aktar (CSV)</button>
    </form>
    <div id="report-out">${S.report && S.report.rows ? reportTables(S.report.rows) : '<p class="muted">Tarih aralığı seçip raporu getir.</p>'}</div>`;
}
function reportTables(rows) {
  const by = {};
  rows.forEach((r) => {
    const p = by[r.user_id] || (by[r.user_id] = { name: r.full_name, brk: 0, n: 0, days: 0, overDays: 0, overMin: 0 });
    p.brk += r.break_sec; p.n += r.breaks || 0; if (r.first_in || r.break_sec) p.days++;
    if (r.break_sec > r.allowance_sec) { p.overDays++; p.overMin += (r.break_sec - r.allowance_sec) / 60; }
  });
  const sum = Object.values(by).filter((p) => p.n > 0 || p.brk > 0).sort((a, b) => b.overMin - a.overMin || a.name.localeCompare(b.name, 'tr'));
  const det = rows.filter((r) => r.first_in || r.break_sec || r.breaks);
  return `<section class="card" style="padding:0"><h2 class="h2" style="padding:16px 20px 6px">Özet</h2><div class="tbl-wrap"><table class="tbl" style="min-width:600px">
    <thead><tr><th style="padding-left:20px">Çalışan</th><th>Çalıştığı gün</th><th>Mola sayısı</th><th>Toplam mola</th><th>Günlük ortalama</th><th>Fazla mola</th></tr></thead>
    <tbody>${sum.length ? '' : '<tr><td colspan="6" class="muted" style="padding:20px">Bu aralıkta mola kaydı yok.</td></tr>'}${sum.map((p) => `<tr><td style="padding-left:20px"><b>${esc(p.name)}</b></td><td class="num">${p.days}</td><td class="num">${p.n}</td><td class="num">${fmtHM(p.brk)}</td><td class="num">${p.days ? fmtMin(p.brk / p.days) : '—'}</td>
      <td class="num" style="${p.overDays ? 'color:#B91C1C;font-weight:700' : ''}">${p.overDays ? `${p.overDays} gün · toplam ${Math.round(p.overMin)} dk` : '—'}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="card" style="padding:0;margin-top:20px"><h2 class="h2" style="padding:16px 20px 6px">Günlük detay</h2><div class="tbl-wrap"><table class="tbl" style="min-width:720px">
    <thead><tr><th style="padding-left:20px">Tarih</th><th>Çalışan</th><th>Giriş</th><th>Çıkış</th><th>Mola sayısı</th><th>Toplam mola</th><th>Hak</th><th>Aşım</th></tr></thead>
    <tbody>${det.map((r) => { const over = r.break_sec > r.allowance_sec; return `<tr><td style="padding-left:20px" class="num">${esc(tDate(r.day))}</td><td>${esc(r.full_name)}</td><td class="num">${r.first_in ? tClock(r.first_in) : '—'}</td><td class="num">${r.last_out ? tClock(r.last_out) : '—'}</td><td class="num">${r.breaks || 0}</td>
      <td class="num" style="${over ? 'color:#B91C1C;font-weight:700' : ''}">${fmtMin(r.break_sec)}</td><td class="num">${Math.round(r.allowance_sec / 60)} dk</td><td class="num" style="${over ? 'color:#B91C1C;font-weight:700' : ''}">${over ? Math.ceil((r.break_sec - r.allowance_sec) / 60) + ' dk' : '—'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted" style="padding:20px">Bu aralıkta kayıt yok.</td></tr>'}</tbody></table></div></section>`;
}
async function runReport(f) {
  const out = document.getElementById('report-out'); out.innerHTML = '<p class="muted">Hazırlanıyor…</p>';
  const { data, error } = await S.sb.rpc('team_report', { p_from: f.from, p_to: f.to });
  if (error) { out.innerHTML = `<div class="err">${esc(errMsg(error))}</div>`; return; }
  S.report = { from: f.from, to: f.to, rows: data };
  document.getElementById('admin-main').innerHTML = reportsHtml();
}
function downloadCsv() {
  if (!S.report || !S.report.rows) return;
  const head = ['Tarih', 'Çalışan', 'Giriş', 'Çıkış', 'Mola sayısı', 'Toplam mola (dk)', 'Mola hakkı (dk)', 'Aşım (dk)'];
  const lines = [head].concat(S.report.rows.filter((r) => r.first_in || r.break_sec || r.breaks).map((r) => [r.day, r.full_name, r.first_in ? tClock(r.first_in) : '', r.last_out ? tClock(r.last_out) : '', r.breaks || 0,
    Math.round(r.break_sec / 60), Math.round(r.allowance_sec / 60), Math.max(0, Math.ceil((r.break_sec - r.allowance_sec) / 60))]));
  const csv = '\ufeff' + lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `mola-raporu_${S.report.from}_${S.report.to}.csv`; document.body.appendChild(a); a.click(); a.remove();
}
async function loadStaffList() {
  const { data, error } = await S.sb.from('profiles').select('*').eq('company_id', S.me.company.id).order('full_name');
  if (error) throw error; S.staff = data; return data;
}
async function loadLeaves() {
  try {
    await loadStaffList();
    const { data, error } = await S.sb.from('leaves').select('*').eq('company_id', S.me.company.id).gte('day_to', isoDay(new Date(now() - 30 * 864e5))).order('day_from', { ascending: false });
    if (error) throw error;
    const names = Object.fromEntries(S.staff.map((p) => [p.id, p.full_name]));
    const t = isoDay(new Date(now()));
    document.getElementById('admin-main').innerHTML = `<h1 class="h1">İzinler</h1>
      <form class="card formgrid" data-form="leave">
        <label class="f">Çalışan<select class="inp" name="user_id" required>${S.staff.filter((p) => p.active).map((p) => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('')}</select></label>
        <label class="f">Başlangıç<input class="inp" type="date" name="day_from" value="${t}" required></label>
        <label class="f">Bitiş<input class="inp" type="date" name="day_to" value="${t}" required></label>
        <label class="f">Tür<select class="inp" name="kind"><option>Yıllık izin</option><option>Sağlık raporu</option><option>Mazeret izni</option><option>Ücretsiz izin</option><option>Resmî tatil</option></select></label>
        <label class="f">Not<input class="inp" name="note" placeholder="İsteğe bağlı"></label>
        <button class="btn" type="submit" style="height:50px">İzin ekle</button>
      </form>
      <section class="card" style="padding:0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th style="padding-left:20px">Çalışan</th><th>Tarih</th><th>Tür</th><th>Not</th><th></th></tr></thead>
      <tbody>${data.map((l) => `<tr><td style="padding-left:20px"><b>${esc(names[l.user_id] || '')}</b></td><td class="num">${esc(tDate(l.day_from))}${l.day_to !== l.day_from ? ' – ' + esc(tDate(l.day_to)) : ''}</td><td>${chip('leave', l.kind)}</td><td class="small">${esc(l.note || '')}</td><td style="text-align:right;padding-right:20px"><button class="btn sm ghost" data-act="delLeave" data-v="${l.id}">Sil</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted" style="padding:20px">Kayıtlı izin yok.</td></tr>'}</tbody></table></div></section>`;
  } catch (e) { document.getElementById('admin-main').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
}

// çalışanlar
async function loadStaff() {
  try {
    await loadStaffList();
    const c = S.me.company;
    const { data: comp } = await S.sb.from('companies').select('*').eq('id', c.id).single();
    S.company = comp;
    const inviteText = `${comp.name} mola takip uygulaması:\n${BASE}#/kayit\nBağlantıyı aç, “Kayıt ol”a dokun ve e-postanla kayıt ol.`;
    document.getElementById('admin-main').innerHTML = `<h1 class="h1">Çalışanlar</h1>
      <section class="card row between" style="flex-wrap:wrap;gap:16px">
        <div class="col" style="gap:4px;max-width:560px"><span class="small muted">Uygulama bağlantısı</span><b style="font-size:17px;word-break:break-all">${esc(BASE)}#/kayit</b>
        <span class="small muted">Çalışanlar bu bağlantıdan e-postasıyla kayıt olur ve otomatik olarak <b>çalışan</b> olarak aşağıdaki listeye eklenir. Birini yönetici yapmak için “Rol”ü değiştirip Kaydet'e bas.</span></div>
        <div class="row" style="flex-wrap:wrap"><button class="btn" data-act="share" data-v="${esc(inviteText)}">Bağlantıyı paylaş</button><button class="btn line" data-act="copy" data-v="${esc(inviteText)}">Kopyala</button></div>
      </section>
      <section class="card" style="padding:0"><div class="tbl-wrap"><table class="tbl" style="min-width:820px"><thead><tr><th style="padding-left:20px">Ad soyad</th><th>İletişim</th><th>Rol</th><th>Takip</th><th>Aktif</th><th>Özel mola hakkı (dk)</th><th></th></tr></thead>
      <tbody>${S.staff.map((p) => `<tr data-row="${p.id}">
        <td style="padding-left:20px"><input class="inp" name="full_name" value="${esc(p.full_name)}" aria-label="Ad soyad" style="height:40px;min-width:160px"></td>
        <td class="small">${esc(p.contact || '')}</td>
        <td><select class="inp" name="role" aria-label="Rol" style="height:40px;width:auto"><option value="employee" ${p.role === 'employee' ? 'selected' : ''}>Çalışan</option><option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Yönetici</option></select></td>
        <td><label class="row small" style="gap:6px"><input type="checkbox" name="tracked" ${p.tracked ? 'checked' : ''}> Mola takibi</label></td>
        <td><label class="row small" style="gap:6px"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} ${p.id === S.me.user_id ? 'disabled' : ''}> Aktif</label></td>
        <td><input class="inp" type="number" min="0" max="600" name="break_allowance_min" value="${p.break_allowance_min ?? ''}" placeholder="Şirket: ${comp.break_allowance_min}" aria-label="Özel mola hakkı" style="height:40px;width:130px"></td>
        <td style="text-align:right;padding-right:20px"><button class="btn sm" data-act="saveStaff" data-v="${p.id}">Kaydet</button></td></tr>`).join('')}</tbody></table></div></section>
      <p class="small muted" style="margin:0">“Mola takibi” kapalı olanlar (örneğin yöneticiler) canlı ekranda ve raporlarda görünmez. Özel mola hakkı boşsa şirketin günlük mola hakkı geçerlidir. Pasif yapılan çalışan QR okutamaz.<br><b>Çalışan</b> sadece kendi molasını görür; <b>Yönetici</b> tüm paneli görür ve ayarları değiştirebilir.</p>`;
  } catch (e) { document.getElementById('admin-main').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
}
async function saveStaff(id) {
  const tr = document.querySelector(`[data-row="${id}"]`); if (!tr) return;
  const g = (n) => tr.querySelector(`[name="${n}"]`);
  const allow = g('break_allowance_min').value.trim();
  const patch = { full_name: g('full_name').value.trim(), role: g('role').value, tracked: g('tracked').checked, break_allowance_min: allow === '' ? null : Number(allow) };
  if (id !== S.me.user_id) patch.active = g('active').checked;
  if (id === S.me.user_id && patch.role !== 'admin') return toast('Kendi yönetici yetkini kaldıramazsın.');
  const { error } = await S.sb.from('profiles').update(patch).eq('id', id);
  if (error) return toast(errMsg(error));
  toast('Kaydedildi');
  if (id === S.me.user_id) await refreshMe();
}

// ayarlar
async function loadSettings() {
  try {
    const [{ data: comp, error }, sec] = await Promise.all([S.sb.from('companies').select('*').eq('id', S.me.company.id).single(), S.sb.rpc('admin_secrets')]);
    if (error) throw error; if (sec.error) throw sec.error;
    S.company = comp;
    const kioskUrl = `${BASE}#/kiosk?c=${encodeURIComponent(sec.data.company_id)}&k=${encodeURIComponent(sec.data.kiosk_key)}`;
    const staticUrl = `${BASE}#/s/${encodeURIComponent(sec.data.static_token)}`;
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const t5 = (v) => String(v).slice(0, 5);
    document.getElementById('admin-main').innerHTML = `<h1 class="h1">Ayarlar</h1>
      ${pushCard()}
      <form class="card col" data-form="settings" style="gap:16px">
        <h2 class="h2">Mola kuralları</h2>
        <div class="formgrid">
          <label class="f">Şirket adı<input class="inp" name="name" value="${esc(comp.name)}" required></label>
          <label class="f">Günlük mola hakkı (dakika)<input class="inp" type="number" min="1" max="600" name="break_allowance_min" value="${comp.break_allowance_min}" required></label>
        </div>
        <p class="small muted" style="margin:0">Her çalışanın günlük toplam mola süresi. Gün içinde birden fazla molaya bölebilir; her molada kalan süreden geri sayılır. Gece yarısı sıfırlanır. Belirli bir çalışana farklı süre vermek için “Çalışanlar” sekmesindeki “Özel mola hakkı”nı kullan.</p>
        <div><button class="btn" type="submit">Kaydet</button></div>
      </form>
      <section class="card col" style="gap:12px">
        <h2 class="h2">Kapı QR ekranı (önerilen)</h2>
        <p class="small muted" style="margin:0;line-height:1.5">Girişe koyacağın tablet veya eski bir telefonda bu bağlantıyı aç. QR kod 30 saniyede bir değişir; fotoğrafı çekilip evden okutulamaz. Bu bağlantıyı çalışanlarla paylaşma.</p>
        <div class="row" style="flex-wrap:wrap"><a class="btn" href="${esc(kioskUrl)}" target="_blank" rel="noopener">Kapı ekranını aç</a><button class="btn line" data-act="copy" data-v="${esc(kioskUrl)}">Bağlantıyı kopyala</button></div>
      </section>
      <section class="card col" style="gap:12px">
        <h2 class="h2">Sabit (yazdırılabilir) QR</h2>
        <p class="small muted" style="margin:0;line-height:1.5">Tablet koyamıyorsan duvara asılacak sabit bir QR kullanabilirsin. Daha az güvenli: fotoğrafı çekilirse başka yerden de okutulabilir.</p>
        <label class="row small" style="gap:8px"><input type="checkbox" data-act="toggleStatic" ${comp.allow_static_qr ? 'checked' : ''}> Sabit QR ile okutmaya izin ver</label>
        ${comp.allow_static_qr ? `<div id="print-area" data-qr="${esc(staticUrl)}" data-name="${esc(comp.name)}" class="col" style="align-items:center;gap:10px;padding:20px 16px;border:1px dashed #D5D8DF;border-radius:16px;text-align:center">
            <img src="logo.png" alt="${esc(comp.name)} logosu" style="max-width:200px;max-height:110px;object-fit:contain" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:this.alt.replace(' logosu',''),style:'font-size:22px;letter-spacing:1px'}))">
            <b style="font-size:30px;letter-spacing:4px">MOLA QR</b>
            <div style="width:240px">${qrSvg(staticUrl)}</div>
            <span class="small">Giriş · Mola · Dönüş · Çıkış için<br>uygulamadan <b>QR okut</b>'a dokunup okutun</span></div>
          <div><button class="btn line" data-act="printQr">Yazdır / PDF indir</button><span class="xs muted" style="margin-left:10px">PDF için yazıcı olarak “PDF olarak kaydet”i seç</span></div>` : ''}
      </section>
      <section class="card col" style="gap:12px">
        <h2 class="h2">Güvenlik</h2>
        <p class="small muted" style="margin:0">Kapı ekranı bağlantısı veya sabit QR başkasının eline geçtiyse yenile. Eski bağlantı ve QR çalışmaz hale gelir.</p>
        <div><button class="btn line" data-act="rotate">QR ve kapı bağlantısını yenile</button></div>
      </section>`;
  } catch (e) { document.getElementById('admin-main').innerHTML = `<div class="err">${esc(errMsg(e))}</div>`; }
}

// ------------------------------------------------------------------ kapı ekranı
function stopKiosk() { if (S.kiosk) { clearTimeout(S.kiosk.t); clearInterval(S.kiosk.c); try { S.kiosk.lock && S.kiosk.lock.release(); } catch (_) {} S.kiosk = null; } }
async function kioskStart(q) {
  stopKiosk();
  const c = q.get('c'), k = q.get('k');
  S.kiosk = { c, k, exp: 30, at: Date.now() };
  app.innerHTML = `<div class="kiosk"><h1 id="k-name" style="margin:0;font-size:clamp(22px,4vmin,40px)">QR yükleniyor…</h1><div class="qr" id="k-qr"></div><div class="kbar"><div id="k-bar" style="width:100%"></div></div><div class="clock num" id="k-clock"></div><p style="margin:0;color:#B7BCC7;font-size:clamp(14px,2.4vmin,22px)">Giriş, mola ve çıkış için uygulamadan okutun</p></div>`;
  try { if (navigator.wakeLock) S.kiosk.lock = await navigator.wakeLock.request('screen'); } catch (_) {}
  const clock = () => {
    const e = document.getElementById('k-clock'); if (!e || !S.kiosk) return;
    e.textContent = new Date(now()).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Istanbul' });
    const left = Math.max(0, S.kiosk.exp - (Date.now() - S.kiosk.at) / 1000);
    const b = document.getElementById('k-bar'); if (b) b.style.width = (left / 30 * 100) + '%';
  };
  S.kiosk.c = setInterval(clock, 1000);
  const load = async () => {
    if (!S.kiosk) return;
    const { data, error } = await S.sb.rpc('kiosk_token', { p_company: c, p_key: k });
    if (!S.kiosk) return;
    if (error) {
      document.getElementById('k-name').textContent = errMsg(error);
      S.kiosk.t = setTimeout(load, 10000); return;
    }
    S.off = new Date(data.server_now).getTime() - Date.now();
    S.kiosk.exp = data.expires_in; S.kiosk.at = Date.now();
    document.getElementById('k-name').textContent = data.company;
    document.getElementById('k-qr').innerHTML = qrSvg(`${BASE}#/s/${encodeURIComponent(data.token)}`);
    clock();
    S.kiosk.t = setTimeout(load, Math.max(1000, data.expires_in * 1000 + 300));
  };
  load();
}

// ------------------------------------------------------------------ zamanlayıcılar
function tick() {
  if (!S.me || S.kiosk) return;
  if (S.me.role === 'admin' && !S.asEmployee) tickAdmin(); else tickEmployee();
}
let polling = false;
async function poll(force) {
  if (polling || !S.me || S.kiosk || document.hidden) return;
  polling = true;
  try {
    if (S.me.role === 'admin' && !S.asEmployee) { if (S.tab === 'live') await loadTeam(true); }
    else if (['home', 'history', 'notifs', 'profile'].includes(S.view)) {
      const prevStatus = S.me.status, prevUnread = S.lastUnread;
      await refreshMe();
      if (prevUnread !== null && S.me.unread > prevUnread) {
        const { data } = await S.sb.from('notifications').select('*').eq('user_id', S.me.user_id).is('read_at', null).order('created_at', { ascending: false }).limit(S.me.unread - prevUnread);
        (data || []).forEach((n) => notifyDevice(n.title, n.body || ''));
        if ((data || []).length) alertSound('alarm', (data[0].kind === 'warning' ? 'Yöneticinden uyarı var. ' : '') + (data[0].body || data[0].title));
      }
      S.lastUnread = S.me.unread;
      if (prevStatus !== S.me.status || force) renderEmployee();
      else { const nav = document.querySelector('.bottomnav'); if (nav) nav.outerHTML = empNav(); }
    }
  } finally { polling = false; }
}

// ------------------------------------------------------------------ olaylar
const actions = {
  reload: () => location.reload(),
  logout: async () => { await stopScanner(); if (push.on) await disablePush(true); push.syncedFor = null; S.asEmployee = false; S.view = 'home'; await S.sb.auth.signOut(); },
  authTab: (b) => { authState.tab = b.dataset.v; authState.err = ''; authState.msg = ''; renderAuth(); },
  authMethod: (b) => { authState.method = b.dataset.v; renderAuth(); },
  authMode: (b) => { authState.mode = b.dataset.v; renderAuth(); },
  obMode: (b) => { const ob = JSON.parse(localStorage.getItem('qrm_onboard') || '{}'); ob.mode = b.dataset.v; localStorage.setItem('qrm_onboard', JSON.stringify(ob)); onboardTried = true; renderOnboard(); },
  empView: (b) => { S.view = b.dataset.v; S.result = null; renderEmployee(); },
  openScan: () => { S.view = 'scan'; renderEmployee(); },
  closeScan: async () => { await stopScanner(); S.view = 'home'; renderEmployee(); },
  doScan: (b) => doScan(S.chooseToken, b.dataset.v),
  askNotif: () => enablePush(),
  pushOff: () => disablePush(),
  pushTest: async () => { const { error } = await S.sb.rpc('push_test'); toast(error ? errMsg(error) : 'Deneme bildirimi gönderildi'); },
  toAdmin: () => { S.asEmployee = false; S.view = 'home'; render(); },
  toEmployee: () => { S.asEmployee = true; S.view = 'home'; refreshMe().then(render); },
  tab: (b) => { S.tab = b.dataset.v; renderAdmin(); },
  filter: (b) => { S.filter = S.filter === b.dataset.v ? 'all' : b.dataset.v; document.getElementById('admin-main').innerHTML = liveHtml(); tick(); },
  warn: (b) => warnModal(b.dataset.u),
  manual: (b) => manualModal(b.dataset.u),
  readAll: async () => { await S.sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', S.me.user_id).is('read_at', null); await loadTeam(); renderAdmin(); },
  csv: downloadCsv,
  toggleSound: () => { localStorage.setItem('qrm_sound', soundOn() ? '0' : '1'); if (soundOn()) { beep('ok'); say('Sesli uyarılar açık.'); } render(); },
  testSound: () => { beep('alarm', true); say('Molanın bitmesine beş dakika kaldı.', true); },
  delLeave: async (b) => { const { error } = await S.sb.from('leaves').delete().eq('id', b.dataset.v); if (error) return toast(errMsg(error)); toast('İzin silindi'); loadLeaves(); },
  saveStaff: (b) => saveStaff(b.dataset.v),
  copy: async (b) => { try { await navigator.clipboard.writeText(b.dataset.v); toast('Kopyalandı'); } catch (_) { toast('Kopyalanamadı'); } },
  share: async (b) => { if (navigator.share) { try { await navigator.share({ text: b.dataset.v }); } catch (_) {} } else actions.copy(b); },
  toggleStatic: async (b) => { const { error } = await S.sb.from('companies').update({ allow_static_qr: b.checked }).eq('id', S.me.company.id); if (error) toast(errMsg(error)); loadSettings(); },
  printQr: () => {
    const a = document.getElementById('print-area'); if (!a) return;
    document.getElementById('print-ov')?.remove();
    const ov = document.createElement('div'); ov.id = 'print-ov';
    ov.innerHTML = `<div class="pv-bar noprint">
        <button class="btn ghost" data-pv="close">${I.back} Kapat</button>
        <button class="btn" data-pv="print">Yazdır / PDF</button>
      </div>
      <p class="pv-hint noprint">PDF için yazdırma ekranında yazıcı olarak “PDF olarak kaydet”i seç. iPhone'da: Yazdır ekranında önizlemeyi iki parmakla büyütüp Paylaş → “Dosyalara Kaydet”.</p>
      <div class="pv-sheet">
        <div class="pv-top">
          <img class="pv-logo" src="logo.png" alt="${esc(a.dataset.name)}" onerror="this.outerHTML='<div class=&quot;pv-name&quot;>${esc(a.dataset.name)}</div>'">
          <div class="pv-title">MOLA QR</div>
        </div>
        <div class="pv-qr">${qrSvg(a.dataset.qr)}</div>
        <div class="pv-bottom">
          <div class="pv-steps"><span>Giriş</span><span>Mola</span><span>Dönüş</span><span>Çıkış</span></div>
          <p>Uygulamada <b>QR okut</b>'a dokunun ve bu kodu okutun.</p>
        </div>
      </div>`;
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pv]'); if (!b) return;
      if (b.dataset.pv === 'close') { ov.remove(); document.body.classList.remove('printing-qr'); } else window.print();
    });
    document.body.appendChild(ov);
    document.body.classList.add('printing-qr');
  },
  rotate: async () => { if (!confirm('Kapı ekranı bağlantısı ve sabit QR yenilensin mi? Kapı ekranını yeni bağlantıyla tekrar açman gerekecek.')) return; const { error } = await S.sb.rpc('rotate_secrets'); if (error) return toast(errMsg(error)); toast('Yenilendi'); loadSettings(); }
};
app.addEventListener('click', (e) => {
  unlockAudio();
  const b = e.target.closest('[data-act]'); if (!b || !app.contains(b)) return;
  const fn = actions[b.dataset.act]; if (!fn) return;
  if (b.tagName !== 'INPUT') e.preventDefault();
  fn(b, e);
});
app.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]'); if (!form) return;
  e.preventDefault();
  const k = form.dataset.form, f = Object.fromEntries(new FormData(form));
  if (k === 'auth') return submitAuth(form);
  if (k === 'onboard') { const ob = JSON.parse(localStorage.getItem('qrm_onboard') || '{}'); return finishOnboard({ ...ob, ...f, mode: ob.mode || 'auto' }); }
  if (k === 'report') return runReport(f);
  if (k === 'leave') {
    if (f.day_to < f.day_from) return toast('Bitiş tarihi başlangıçtan önce olamaz');
    const { error } = await S.sb.from('leaves').insert({ company_id: S.me.company.id, user_id: f.user_id, day_from: f.day_from, day_to: f.day_to, kind: f.kind, note: f.note || null });
    if (error) return toast(errMsg(error)); toast('İzin eklendi'); return loadLeaves();
  }
  if (k === 'settings') {
    const { error } = await S.sb.from('companies').update({ name: f.name, break_allowance_min: Number(f.break_allowance_min) }).eq('id', S.me.company.id);
    if (error) return toast(errMsg(error));
    toast('Ayarlar kaydedildi'); await refreshMe(); loadSettings(); return;
  }
});

boot();
})();
