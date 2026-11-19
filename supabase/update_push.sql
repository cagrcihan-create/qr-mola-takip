-- QR Mola Takip: telefon bildirimleri (Web Push)
-- Uygulama kapalıyken ve telefon kilitliyken de mola uyarıları telefona bildirim olarak gelir.
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run
-- Tekrar çalıştırılabilir; hiçbir kayıt silinmez.
-- Bu dosyadan sonra "push-gonder" fonksiyonunu kurmayı unutma (README > Telefon bildirimleri).

create extension if not exists pg_net;

-- Hangi telefona bildirim gideceği (her cihaz bir satır)
create table if not exists public.push_subscriptions (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
-- Doğrudan erişim yok; aşağıdaki fonksiyonlar ve sunucu kullanır.
revoke all on public.push_subscriptions from anon, authenticated;

-- Bildirim gönderen sunucunun anahtarı (fonksiyon ilk çalışmada kendisi oluşturur)
create table if not exists public.push_keys (
  id         int primary key default 1 check (id = 1),
  keys       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;

-- Aynı bildirimin iki kez gönderilmemesi için
alter table public.notifications add column if not exists pushed_at timestamptz;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert on public.push_keys to service_role;
grant select, update on public.notifications to service_role;

-- Uygulamanın kullandığı fonksiyonlar
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Giriş gerekli'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' then raise exception 'Geçersiz abonelik'; end if;
  -- Aynı telefon başka bir hesapla kullanılmışsa abonelik yeni hesaba geçer
  insert into push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_ua, 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end $$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- "Dene" düğmesi: kendine okunmuş bir deneme bildirimi yazar, tetikleyici telefona gönderir
create or replace function public.push_test()
returns void language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then raise exception 'Giriş gerekli'; end if;
  insert into notifications(company_id, user_id, kind, title, body, ref_user, read_at)
  values (p.company_id, p.id, 'test', 'Bildirimler açık ✅', 'Mola uyarıları bu telefona böyle gelecek.', p.id, now());
end $$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.remove_push_subscription(text) from public, anon;
revoke execute on function public.push_test() from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.push_test() to authenticated;

-- Yeni bildirim yazılınca (fazla mola, 5 dk kaldı, yönetici uyarısı...) telefona gönder
create or replace function public._push_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from push_subscriptions where user_id = new.user_id) then
    perform net.http_post(
      url := 'https://gchmcoyvejbtaehnbkgi.supabase.co/functions/v1/push-gonder',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('id', new.id)
    );
  end if;
  return new;
exception when others then
  return new; -- bildirim gönderilemese de kayıt yazılsın
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public._push_notify();

-- Mola kontrolü (her dakika): mola bitmeden 5 dk önce çalışana haber ver + hak aşılınca uyar
create or replace function public.check_alerts(p_company uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare pr record; d record; n int := 0; today date; left_min int;
begin
  for pr in select p.id, p.full_name, p.company_id from profiles p
            where p.active and p.tracked and (p_company is null or p.company_id = p_company) loop
    today := _local_today(pr.company_id);
    select * into d from _user_day(pr.id, today);
    if d.status = 'break' and d.allowance_sec > 0
       and d.break_sec >= d.allowance_sec - 300 and d.break_sec < d.allowance_sec
       and not exists (select 1 from notifications where kind = 'soon' and ref_user = pr.id and ref_at = d.break_since) then
      left_min := ceil((d.allowance_sec - d.break_sec) / 60.0)::int;
      insert into notifications(company_id, user_id, kind, title, body, ref_user, ref_at)
      values (pr.company_id, pr.id, 'soon', 'Molanın bitmesine ' || left_min || ' dk kaldı',
              'Dönüşte QR okutmayı unutma.', pr.id, d.break_since);
    end if;
    if d.status = 'break' and d.break_sec > d.allowance_sec then
      perform _alert(pr.company_id, 'overdue', pr.id, d.break_since,
        'Mola hakkın doldu',
        'Günlük mola hakkını aştın. Lütfen QR okutup işe dön.',
        'Fazla mola: ' || pr.full_name,
        pr.full_name || ' günlük mola hakkını aştı ve hâlâ molada.');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
