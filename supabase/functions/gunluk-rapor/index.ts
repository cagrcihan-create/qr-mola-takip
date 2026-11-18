// QR Mola Takip — günlük fazla mola raporu
// Her sabah 10:00'da çağrılır; önceki gün mola hakkını aşan varsa yöneticilere PDF'li e-posta gönderir.
// Gerekli gizli değerler (Edge Functions > Secrets): RESEND_API_KEY, CRON_SECRET (isteğe bağlı: REPORT_TO)
// Elle deneme: https://<proje>.supabase.co/functions/v1/gunluk-rapor?key=<CRON_SECRET>&test=1
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const APP_URL = "https://cagrcihan-create.github.io/qr-mola-takip/";
const LOGO_URL = APP_URL + "logo.png";
const FONT_R = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf";
const FONT_B = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf";
const FROM = "Mola Takip <onboarding@resend.dev>";
const DEFAULT_TO = "cagrcihan@gmail.com";

// ---- PDF-BUILDER-START
function dkText(sec) { return Math.round(sec / 60) + " dk"; }
function trDate(day) {
  const d = new Date(day + "T12:00:00Z");
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long", timeZone: "UTC" });
}
async function buildPdf(lib, assets, company, day, rows) {
  const { PDFDocument, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(assets.fontkit);
  const fR = await doc.embedFont(assets.fontR, { subset: true });
  const fB = await doc.embedFont(assets.fontB, { subset: true });
  let logo = null;
  if (assets.logo) { try { logo = await doc.embedPng(assets.logo); } catch (_) { logo = null; } }
  const ink = rgb(0.08, 0.086, 0.1), muted = rgb(0.36, 0.38, 0.44), red = rgb(0.72, 0.11, 0.11), line = rgb(0.9, 0.91, 0.93), soft = rgb(0.96, 0.965, 0.973);
  const W = 595.28, H = 841.89, M = 44;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const text = (t, x, yy, size, font, color, opts) => {
    t = String(t ?? "");
    if (opts && opts.right) x = x - font.widthOfTextAtSize(t, size);
    if (opts && opts.center) x = x - font.widthOfTextAtSize(t, size) / 2;
    page.drawText(t, { x, y: yy, size, font, color: color || ink });
  };
  const wrap = (t, font, size, maxW) => {
    const words = String(t).split(" "); const out = []; let cur = "";
    for (const w of words) { const n = cur ? cur + " " + w : w; if (font.widthOfTextAtSize(n, size) > maxW && cur) { out.push(cur); cur = w; } else cur = n; }
    if (cur) out.push(cur); return out;
  };
  // başlık
  if (logo) {
    const lw = 170, lh = lw * logo.height / logo.width;
    page.drawImage(logo, { x: (W - lw) / 2, y: y - lh, width: lw, height: lh });
    y -= lh + 22;
  } else { text(company, W / 2, y - 20, 22, fB, ink, { center: true }); y -= 44; }
  text("FAZLA MOLA RAPORU", W / 2, y - 18, 20, fB, ink, { center: true }); y -= 40;
  text(trDate(day), W / 2, y, 12, fR, muted, { center: true }); y -= 30;
  // özet kutusu
  const totalOver = rows.reduce((a, r) => a + Math.max(0, r.break_sec - r.allowance_sec), 0);
  page.drawRectangle({ x: M, y: y - 46, width: W - 2 * M, height: 52, color: rows.length ? rgb(0.996, 0.886, 0.886) : soft });
  text(rows.length ? `${rows.length} çalışan mola hakkını aştı` : "Bu gün mola hakkını aşan yok", M + 16, y - 16, 14, fB, rows.length ? red : ink);
  text(rows.length ? `Toplam aşım: ${dkText(totalOver)}` : "Deneme raporu", M + 16, y - 34, 11, fR, muted);
  y -= 74;
  // sütunlar
  const cols = [
    { k: "Çalışan", x: M + 8 }, { k: "Giriş", x: M + 190 }, { k: "Çıkış", x: M + 240 },
    { k: "Mola", x: M + 300 }, { k: "Toplam", x: M + 350 }, { k: "Hak", x: M + 415 }, { k: "Aşım", x: W - M - 8, right: true }
  ];
  const header = () => {
    page.drawRectangle({ x: M, y: y - 8, width: W - 2 * M, height: 24, color: soft });
    cols.forEach((c) => text(c.k, c.x, y, 9.5, fB, muted, { right: c.right }));
    y -= 26;
  };
  header();
  for (const r of rows) {
    const ivs = (r.intervals || []).map((i) => `${i.s}–${i.e} (${i.dk} dk)`).join("   ");
    const ivLines = ivs ? wrap("Molalar: " + ivs, fR, 8.5, W - 2 * M - 16) : [];
    const need = 22 + ivLines.length * 12 + 8;
    if (y - need < M + 30) { page = doc.addPage([W, H]); y = H - M; header(); }
    const over = r.break_sec - r.allowance_sec;
    let name = r.full_name; while (fB.widthOfTextAtSize(name, 10.5) > 175 && name.length > 3) name = name.slice(0, -2) + "…";
    text(name, cols[0].x, y, 10.5, fB);
    text(r.first_in || "—", cols[1].x, y, 10.5, fR);
    text(r.last_out || "—", cols[2].x, y, 10.5, fR);
    text(String(r.breaks || 0), cols[3].x, y, 10.5, fR);
    text(dkText(r.break_sec), cols[4].x, y, 10.5, fB, red);
    text(dkText(r.allowance_sec), cols[5].x, y, 10.5, fR);
    text("+" + dkText(over), cols[6].x, y, 10.5, fB, red, { right: true });
    y -= 15;
    for (const l of ivLines) { text(l, M + 8, y, 8.5, fR, muted); y -= 12; }
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.7, color: line });
    y -= 14;
  }
  // altbilgi
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    text(`${company} · Mola Takip otomatik raporu`, M, 26, 8, fR, muted);
    text(`Sayfa ${i + 1}/${pages.length}`, W - M, 26, 8, fR, muted, { right: true });
  });
  return await doc.save();
}
// ---- PDF-BUILDER-END

function yesterday(tz) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Europe/Istanbul" }).format(new Date());
  const d = new Date(today + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function toBase64(bytes) {
  let s = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
async function fetchBytes(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get("CRON_SECRET") || "";
  const key = req.headers.get("x-cron-secret") || url.searchParams.get("key") || "";
  if (!secret || key !== secret) return new Response("Yetkisiz", { status: 401 });
  const test = url.searchParams.get("test") === "1";
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!resendKey) return new Response("RESEND_API_KEY eksik", { status: 500 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: companies, error: cErr } = await sb.rpc("report_companies");
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

  let assets = null;
  const result = [];
  for (const c of companies || []) {
    const day = url.searchParams.get("day") || yesterday(c.timezone);
    const { data: rows, error } = await sb.rpc("report_overdue", { p_company: c.id, p_day: day });
    if (error) { result.push({ company: c.name, day, error: error.message }); continue; }
    if (!rows.length && !test) { result.push({ company: c.name, day, sent: false, reason: "Fazla mola yok" }); continue; }
    // Resend ücretsiz planda sadece hesap sahibinin adresine gönderir: REPORT_TO (varsayılan cagrcihan@gmail.com)
    let to = (Deno.env.get("REPORT_TO") || DEFAULT_TO).split(",").map((x) => x.trim()).filter(Boolean);
    if (!to.length) {
      const { data: emails } = await sb.rpc("report_admin_emails", { p_company: c.id });
      to = (emails || []).map((e) => (typeof e === "string" ? e : Object.values(e)[0])).filter(Boolean);
    }
    if (!to.length) { result.push({ company: c.name, day, sent: false, reason: "Yönetici e-postası yok" }); continue; }

    if (!assets) {
      const [fontR, fontB] = await Promise.all([fetchBytes(FONT_R), fetchBytes(FONT_B)]);
      let logo = null; try { logo = await fetchBytes(LOGO_URL); } catch (_) { logo = null; }
      assets = { fontkit, fontR, fontB, logo };
    }
    const pdf = await buildPdf({ PDFDocument, rgb }, assets, c.name, day, rows);
    const dateTr = trDate(day);
    const html = `<div style="font-family:Arial,sans-serif;color:#14161A">
      <h2 style="margin:0 0 6px">Fazla mola raporu</h2>
      <p style="margin:0 0 14px;color:#5B6170">${esc(c.name)} · ${esc(dateTr)}</p>
      ${rows.length ? `<p style="margin:0 0 10px"><b style="color:#B91C1C">${rows.length} çalışan</b> mola hakkını aştı:</p>
      <ul style="margin:0 0 14px;padding-left:18px">${rows.map((r) => `<li><b>${esc(r.full_name)}</b>: ${dkText(r.break_sec)} mola (hak ${dkText(r.allowance_sec)}, <b style="color:#B91C1C">+${dkText(r.break_sec - r.allowance_sec)}</b>)</li>`).join("")}</ul>`
        : `<p>Bu gün mola hakkını aşan yok. (Deneme raporu)</p>`}
      <p style="margin:0 0 6px">Ayrıntılar ekteki PDF'te.</p>
      <p style="margin:0"><a href="${APP_URL}">Yönetici paneli</a></p></div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM, to,
        subject: `${rows.length ? "Fazla mola: " + rows.length + " kişi" : "Deneme raporu"} · ${dateTr}`,
        html,
        attachments: [{ filename: `fazla-mola-${day}.pdf`, content: toBase64(pdf) }]
      })
    });
    const body = await res.text();
    result.push({ company: c.name, day, to, overdue: rows.length, sent: res.ok, resend: res.ok ? undefined : body });
  }
  return Response.json(result);
});
