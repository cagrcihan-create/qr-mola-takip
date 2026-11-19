// QR Mola Takip — telefon bildirimi (Web Push) gönderir.
// Veritabanına yeni bildirim yazılınca tetikleyici bu fonksiyonu { id } ile çağırır;
// fonksiyon o bildirimi alıcının kayıtlı telefonlarına gönderir.
// Uygulama { action: "key" } ile sunucunun herkese açık anahtarını alır.
// Kurulum: Edge Functions > Deploy a new function > adı: push-gonder > bu dosyayı yapıştır.
// Ayarlardan "Verify JWT" / "Enforce JWT" KAPALI olmalı. Gizli değer gerekmez:
// gönderim anahtarı ilk çalışmada otomatik oluşturulur ve veritabanında saklanır.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const APP_URL = "https://cagrcihan-create.github.io/qr-mola-takip/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Mola uyarıları beklemez; yönetici mesajları ve diğerleri biraz daha uzun bekleyebilir.
const URGENT = new Set(["soon", "overdue", "warning"]);

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

type Server = { app: webpush.ApplicationServer; publicKey: string };
let serverP: Promise<Server> | null = null;

async function loadServer(): Promise<Server> {
  let { data, error } = await sb.from("push_keys").select("keys").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) {
    const fresh = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }));
    // Aynı anda iki çağrı gelirse ilk yazılan kalır
    const ins = await sb.from("push_keys").upsert({ id: 1, keys: fresh }, { onConflict: "id", ignoreDuplicates: true });
    if (ins.error) throw ins.error;
    ({ data, error } = await sb.from("push_keys").select("keys").eq("id", 1).single());
    if (error) throw error;
  }
  const vapidKeys = await webpush.importVapidKeys(data!.keys);
  const app = await webpush.ApplicationServer.new({ contactInformation: APP_URL, vapidKeys });
  return { app, publicKey: await webpush.exportApplicationServerKey(vapidKeys) };
}
function server(): Promise<Server> {
  if (!serverP) serverP = loadServer().catch((e) => { serverP = null; throw e; });
  return serverP;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST gerekli" }, 405);
  let body: { action?: string; id?: number } = {};
  try { body = await req.json(); } catch (_) { /* boş gövde */ }

  try {
    if (body.action === "key") return json({ key: (await server()).publicKey });

    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return json({ error: "id gerekli" }, 400);

    // Bildirimi "gönderildi" diye işaretleyerek al: aynı bildirim ikinci kez gönderilmez,
    // eski bildirimler de dışarıdan tekrar tetiklenemez.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: rows, error } = await sb.from("notifications")
      .update({ pushed_at: new Date().toISOString() })
      .eq("id", id).is("pushed_at", null).gt("created_at", since)
      .select("id, user_id, kind, title, body");
    if (error) throw error;
    const n = rows?.[0];
    if (!n) return json({ sent: 0, reason: "yok veya zaten gönderildi" });

    const [{ data: subs, error: e2 }, { count }] = await Promise.all([
      sb.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", n.user_id),
      sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", n.user_id).is("read_at", null),
    ]);
    if (e2) throw e2;
    if (!subs?.length) return json({ sent: 0, reason: "kayıtlı telefon yok" });

    const { app } = await server();
    const payload = JSON.stringify({
      title: n.title,
      body: n.body || "",
      tag: `${n.kind}-${n.id}`,
      kind: n.kind,
      badge: count ?? 0,
      url: APP_URL,
    });
    const urgent = URGENT.has(n.kind);
    let sent = 0;
    const gone: number[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
          .pushTextMessage(payload, {
            urgency: urgent ? webpush.Urgency.High : webpush.Urgency.Normal,
            ttl: urgent ? 30 * 60 : 12 * 60 * 60,
          });
        sent++;
      } catch (e) {
        const status = e instanceof webpush.PushMessageError ? e.response.status : 0;
        // 404/410: telefon aboneliği bitmiş (uygulama silinmiş, izin kaldırılmış)
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error("push hatası", status, String(e));
      }
    }));
    if (gone.length) await sb.from("push_subscriptions").delete().in("id", gone);
    return json({ sent, removed: gone.length });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
