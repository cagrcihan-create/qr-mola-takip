# QR Mola Takip

Çalışanlar **molaya çıkarken ve dönerken QR okutur**. Uygulama:

- Yöneticinin belirlediği **günlük mola hakkını** gösterir; molaya çıkınca kalan süreden **geri sayım** başlar, dönüşte geçen süre hakkından düşülür.
- Son 5 dakikada ve süre bitince çalışanı uyarır; hak aşılınca **yöneticiye de uyarı** gider.
- Yönetici canlı olarak görür: **kim şu an molada (süresiyle), kim ne kadar kullandı, kim fazla mola yaptı**.
- Raporlar (tarih aralığı, Excel'e aktarma), çalışana özel mola hakkı, elle düzeltme.
- Duvara asılacak yazdırılabilir **MOLA QR** veya tablette 30 saniyede bir değişen QR.

Teknik: tek sayfa web uygulaması (telefonda "Ana ekrana ekle" ile uygulama gibi çalışır), veriler **Supabase**'te.

---

## Kurulum (yaklaşık 10 dakika)

### 1) Supabase hesabı ve proje

1. <https://supabase.com> adresinde **yeni bir hesap** aç (mevcut hesabından ayrı bir e-posta veya GitHub hesabıyla girebilirsin).
2. **New project** → isim: `qr-mola`, bölge: **Central EU (Frankfurt)**, bir veritabanı şifresi belirle → **Create**.
3. Proje hazır olunca sol menüden **SQL Editor** → **New query**.
4. Bu depodaki [`supabase/schema.sql`](supabase/schema.sql) dosyasının **tamamını** kopyalayıp yapıştır → **Run**. "Success" görmelisin.

### 2) Giriş ayarları

1. **Authentication → Sign In / Providers → Email**: **"Confirm email"** seçeneğini **kapat** → Save.
   (Telefonla kayıt SMS doğrulaması kullanmaz; bu ayar kapalı olmazsa telefonla kayıt olanlar giriş yapamaz.)
2. **Authentication → URL Configuration → Site URL**: uygulamanın adresini yaz (aşağıdaki 4. adımdaki GitHub Pages adresi).

### 3) Bağlantı bilgilerini uygulamaya yaz

1. Supabase'te **Project Settings → API** (veya üstteki **Connect** düğmesi). Şunları kopyala:
   - **Project URL** (örn. `https://abcdxyz.supabase.co`)
   - **anon public** anahtarı (veya `sb_publishable_...` ile başlayan anahtar)
2. GitHub'da bu depoda `config.js` dosyasını aç → kalem simgesi (Edit) → iki değeri tırnakların içine yapıştır → **Commit changes**.

> Bu iki değerin herkese açık olması sorun değildir; veriler veritabanındaki güvenlik kurallarıyla (RLS) korunur. **service_role** anahtarını asla buraya yazma.

### 4) Yayın (GitHub Pages)

Depo ayarlarında **Settings → Pages → Source: Deploy from a branch → main / (root)** seçili olmalı. Birkaç dakika sonra uygulama şu adreste açılır:

`https://<github-kullanıcı-adın>.github.io/qr-mola-takip/`

---

## İlk kullanım

1. Uygulamayı aç → **Kayıt ol** → **Yöneticiyim** → şirket adını yaz.
2. **Çalışanlar** sekmesindeki **davet kodunu** çalışanlarla paylaş ("Davet mesajını paylaş" düğmesi WhatsApp vb. ile gönderir).
3. Çalışanlar uygulamayı açar → **Kayıt ol** → e-posta **veya** telefon → **Çalışanım** → davet kodu.
4. **Ayarlar** → mesai saatleri, geç kalma toleransı, günlük mola hakkı, "gelmedi" sayılma saati, çalışma günleri.
5. **Ayarlar → Kapı ekranını aç**: bu bağlantıyı girişe koyacağın tablette/eski telefonda aç (şarjda ve ekranı açık kalsın). Bağlantıyı çalışanlarla paylaşma.

### Çalışan nasıl kullanır?

| Ne zaman | Ne yapar |
|---|---|
| Gelince | Uygulamada **QR okut** → kapıdaki kodu okutur → mesai başlar |
| Molaya çıkarken | **QR okut** → **Molaya çık** → geri sayım başlar (örn. 35:00 → 34:59…) |
| Moladan dönünce | **QR okut** → geçen süre mola hakkından düşer, kalan süre gösterilir |
| Çıkarken | **QR okut** → **Mesaiyi bitir** |

Telefonun kendi kamerasıyla okutmak da çalışır (QR bir bağlantıdır), ama en sorunsuzu uygulamadaki **QR okut** düğmesidir.

---

## Uyarılar nasıl çalışır?

- **Çalışan**: mola ekranında son 5 dakikada turuncu, süre bitince kırmızı uyarı + titreşim; bildirim izni verdiyse telefon bildirimi (uygulama/sekme açıkken).
- **Yönetici**: fazla mola, geç gelme ve gelmeyen çalışan uyarıları panelde ve zil simgesinde görünür; panel açıkken tarayıcı bildirimi gelir. Veritabanı her dakika otomatik kontrol yapar (`pg_cron`), bu yüzden uyarılar panel kapalıyken de kaydedilir.
- Yönetici bir çalışana **Uyar** düğmesiyle mesaj gönderebilir; çalışan bunu Bildirimler'de görür.

## Bilinen sınırlar / sonraki adımlar

- Telefonla kayıtta **SMS doğrulaması yok** (numara + şifre ile giriş). SMS doğrulaması için Supabase'e bir SMS sağlayıcısı (Twilio vb.) bağlanabilir.
- Uygulama tamamen kapalıyken telefona anlık bildirim (push) yok; bunun için Web Push eklenebilir.
- Gece yarısını geçen vardiyalar (gece vardiyası) her gün ayrı hesaplanır.
- Supabase ücretsiz planında proje 1 hafta hiç kullanılmazsa duraklatılır; panelden tek tıkla tekrar açılır.

## Dosyalar

- `index.html`, `app.js`, `style.css` — uygulama
- `config.js` — Supabase bağlantı bilgileri
- `supabase/schema.sql` — veritabanı tabloları, güvenlik kuralları ve hesaplama fonksiyonları


---

## Vardiya sistemi

**Kurulum (bir kez):** Supabase **SQL Editor** → New query → [`supabase/update_vardiya.sql`](supabase/update_vardiya.sql) dosyasının tamamını yapıştır → **Run**. Mevcut veriler silinmez.

Yönetici panelinde **Vardiya** sekmesi:

| Bölüm | Ne yapar |
|---|---|
| **Haftalık plan** | “Planı oluştur / Değiştir” kurallara göre kişileri dağıtır. Hücreye dokunup elle değiştir (otomatik kilitlenir), gelmedi / eksik saat / ekstra çalışma yaz. En sağda kişinin haftalık net saati, altta günlük toplamlar. **Yayınla** ile çalışanlar görür ve bildirim alır. **PDF indir** A4 yatay çıktı verir. |
| **Kurallar** | Gruplara ayrılmış liste; her kural açılıp kapatılır, **düzenlenir**, **silinir**. “Barista · Açılış · her gün en az 1 A” ya da “Mutfak (tüm grup) · Açılış en az 2 kişi”; C yalnız kalmasın, kapanıştan sonra açılış yok, haftalık gün sınırı, kapanışları eşit dağıt. |
| **Personel kodları** | **Gruplar** (örn. Mutfak: Aşçı, Pastacı · Bar: Barista, Kasa); her grubun kendi varsayılan vardiya saatleri. Planda grup seçip sadece o grubu “Değiştir”, PDF’ini al. Pozisyonlar sınırsız, kişi başına pozisyon + seviye (A deneyimli, B az deneyimli, C öğrenen), haftalık gün, sabit vardiya. |
| **İzin · Rapor · Gelmedi** | Personeli seç → takvimde günlere dokun → Gelmedi / Raporlu / Yıllık izin. Geçmiş ve ileri tarih. |
| **Aylık puantaj** | Gün gün ✓ geldi, 2× bayramda çalıştı, X gelmedi, Y yıllık, R raporlu. “Geldi” QR girişinden gelir; planlı olup girişi olmayan otomatik “Gelmedi” sayılır. Resmi tatil listesi ve çift yevmiye ayarı (15 Temmuz ve arifeler normal). PDF çıktısı. |

**Yaz, sistem yapsın** (Haftalık plan’ın üstünde): “Batuhan’ı çarşamba 12.00’ye al”, “Sude’nin iznini bir gün sonraya kaydır”, “Ahmet cuma izinli”, “Elif ile Mert perşembe değişsin”, “Ayşe her pazartesi izinli”, “Herkesin izni art arda olsun”. Önce ne anlaşıldığı gösterilir, “Uygula” ile plana işlenir. Bu bir yapay zekâ değil; isim, gün, saat, dilim ve “izin / kaydır / değiş” gibi kelimeleri tanır.

Çalışan uygulamasında **Vardiyam** sekmesi: bu hafta ve gelecek haftanın yayınlanmış planı, toplam saat, PDF. Ana sayfada “Bugünkü vardiyan” kartı.
