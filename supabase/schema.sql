-- =====================================================================
-- QR Mola Takip — Supabase veritabanı kurulumu (sadece mola)
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run
-- Tekrar çalıştırılabilir (fonksiyonları günceller, tabloları silmez).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- TABLOLAR
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  invite_code         text not null unique,
  timezone            text not null default 'Europe/Istanbul',
  shift_start         time not null default '09:00',
  shift_end           time not null default '18:00',
  late_tolerance_min  int  not null default 10 check (late_tolerance_min between 0 and 240),
  break_allowance_min int  not null default 60 check (break_allowance_min between 0 and 600),
  absent_after        time not null default '09:30',
  work_days           int[] not null default '{1,2,3,4,5,6}',  -- 1=Pazartesi ... 7=Pazar
  allow_static_qr     boolean not null default false,
  created_at          timestamptz not null default now()
);

-- Gizli anahtarlar: kimse doğrudan okuyamaz, sadece sunucu fonksiyonları kullanır
create table if not exists public.company_secrets (
  company_id  uuid primary key references public.companies(id) on delete cascade,
  qr_secret   text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  kiosk_key   text not null default encode(extensions.gen_random_bytes(16), 'hex'),
  static_code text not null default encode(extensions.gen_random_bytes(10), 'hex')
);

create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  full_name           text not null,
  contact             text,
  role                text not null default 'employee' check (role in ('admin','employee')),
  active              boolean not null default true,
  break_allowance_min int check (break_allowance_min between 0 and 600), -- boşsa şirket ayarı
  tracked             boolean not null default true, -- mesai/mola takibi yapılsın mı
  created_at          timestamptz not null default now()
);
alter table public.profiles add column if not exists tracked boolean not null default true;
create index if not exists profiles_company_idx on public.profiles(company_id);

create table if not exists public.events (
  id         bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('in','break_start','break_end','out')),
  at         timestamptz not null default now(),
  source     text not null default 'qr' check (source in ('qr','manual')),
  note       text,
  created_by uuid
);
create index if not exists events_user_at_idx on public.events(user_id, at);
create index if not exists events_company_at_idx on public.events(company_id, at);

create table if not exists public.leaves (
  id         bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day_from   date not null,
  day_to     date not null,
  kind       text not null default 'Yıllık izin',
  note       text,
  created_at timestamptz not null default now(),
  check (day_to >= day_from)
);
create index if not exists leaves_user_idx on public.leaves(user_id, day_from, day_to);

create table if not exists public.notifications (
  id         bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade, -- alıcı
  kind       text not null,
  title      text not null,
  body       text,
  ref_user   uuid,
  ref_at     timestamptz,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_dedupe_idx on public.notifications(kind, ref_user, ref_at);

-- ---------------------------------------------------------------------
-- YARDIMCI FONKSİYONLAR
-- ---------------------------------------------------------------------
create or replace function public.my_company() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active), false)
$$;

-- Bir kullanıcının belirli bir gündeki hareketlerinden süreleri hesaplar
create or replace function public._day_calc(p_user uuid, p_from timestamptz, p_to timestamptz, p_now timestamptz)
returns table(status text, first_in timestamptz, worked_sec int, break_sec int, break_since timestamptz, breaks int)
language plpgsql stable security definer set search_path = public as $$
declare
  e record; st text := 'off'; ws timestamptz; bs timestamptz;
  w numeric := 0; b numeric := 0; fi timestamptz; n int := 0;
begin
  for e in select ev.kind, ev.at from events ev
           where ev.user_id = p_user and ev.at >= p_from and ev.at < p_to
           order by ev.at, ev.id loop
    if e.kind = 'in' then
      if st in ('off','done') then st := 'working'; ws := e.at; fi := coalesce(fi, e.at); end if;
    elsif e.kind = 'break_start' then
      if st = 'working' then w := w + extract(epoch from e.at - ws); end if;
      if st <> 'break' then st := 'break'; bs := e.at; n := n + 1; end if;
    elsif e.kind = 'break_end' then
      if st = 'break' then b := b + extract(epoch from e.at - bs); st := 'working'; ws := e.at; end if;
    elsif e.kind = 'out' then
      if st = 'working' then w := w + extract(epoch from e.at - ws);
      elsif st = 'break' then b := b + extract(epoch from e.at - bs); end if;
      if st <> 'off' then st := 'done'; end if;
    end if;
  end loop;
  if st = 'working' then w := w + greatest(0, extract(epoch from least(p_now, p_to) - ws));
  elsif st = 'break' then b := b + greatest(0, extract(epoch from least(p_now, p_to) - bs)); end if;
  return query select st, fi, w::int, b::int, (case when st = 'break' then bs end), n;
end $$;

-- Bir kullanıcının bir günlük özeti (durum, gecikme, izin dahil)
create or replace function public._user_day(p_user uuid, p_day date)
returns table(day date, status text, first_in timestamptz, worked_sec int, break_sec int,
              allowance_sec int, break_since timestamptz, breaks int,
              late_min int, is_late boolean, leave_kind text, is_workday boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  p profiles; c companies; f timestamptz; r record; lk text; lt int := 0; wd boolean; st text; loc timestamp;
begin
  select * into p from profiles where id = p_user;
  select * into c from companies where id = p.company_id;
  f := p_day::timestamp at time zone c.timezone;
  select * into r from _day_calc(p_user, f, f + interval '1 day', now());
  select l.kind into lk from leaves l where l.user_id = p_user and p_day between l.day_from and l.day_to limit 1;
  wd := extract(isodow from p_day)::int = any(c.work_days);
  if r.first_in is not null then
    lt := greatest(0, floor(extract(epoch from r.first_in - ((p_day + c.shift_start) at time zone c.timezone)) / 60))::int;
  end if;
  loc := now() at time zone c.timezone;
  st := r.status;
  -- durumlar: off (giriş yok), working (içeride), break (molada), done (çıkış yaptı)
  return query select p_day, st, r.first_in, r.worked_sec, r.break_sec,
    coalesce(p.break_allowance_min, c.break_allowance_min) * 60,
    r.break_since, r.breaks, lt, (r.first_in is not null and wd and lt > c.late_tolerance_min), lk, wd;
end $$;

create or replace function public._local_today(p_company uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from companies where id = p_company
$$;

-- Tekrarsız bildirim: aynı olay için ikinci kez göndermez
create or replace function public._alert(p_company uuid, p_kind text, p_ref_user uuid, p_ref_at timestamptz,
  p_title text, p_body text, p_admin_title text, p_admin_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from notifications where kind = p_kind and ref_user = p_ref_user and ref_at = p_ref_at) then
    return;
  end if;
  if p_title is not null then
    insert into notifications(company_id, user_id, kind, title, body, ref_user, ref_at)
    values (p_company, p_ref_user, p_kind, p_title, p_body, p_ref_user, p_ref_at);
  end if;
  insert into notifications(company_id, user_id, kind, title, body, ref_user, ref_at)
  select p_company, a.id, p_kind, p_admin_title, p_admin_body, p_ref_user, p_ref_at
  from profiles a where a.company_id = p_company and a.role = 'admin' and a.active and a.id <> p_ref_user;
end $$;

-- Fazla mola kontrolü (her dakika otomatik + yönetici paneli açıkken)
create or replace function public.check_alerts(p_company uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare pr record; d record; c companies; n int := 0; today date;
begin
  for pr in select p.id, p.full_name, p.company_id from profiles p
            where p.active and p.tracked and (p_company is null or p.company_id = p_company) loop
    select * into c from companies where id = pr.company_id;
    today := (now() at time zone c.timezone)::date;
    select * into d from _user_day(pr.id, today);
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

-- ---------------------------------------------------------------------
-- KAYIT
-- ---------------------------------------------------------------------
create or replace function public.create_company(p_company text, p_full_name text, p_contact text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare cid uuid; code text;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'Bu hesap zaten bir şirkete bağlı'; end if;
  if coalesce(trim(p_company), '') = '' or coalesce(trim(p_full_name), '') = '' then raise exception 'Şirket adı ve ad soyad gerekli'; end if;
  loop
    code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from companies where invite_code = code);
  end loop;
  insert into companies(name, invite_code) values (trim(p_company), code) returning id into cid;
  insert into company_secrets(company_id) values (cid);
  insert into profiles(id, company_id, full_name, contact, role, tracked) values (auth.uid(), cid, trim(p_full_name), p_contact, 'admin', false);
  return json_build_object('company_id', cid, 'invite_code', code);
end $$;

create or replace function public.join_company(p_code text, p_full_name text, p_contact text)
returns json language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'Bu hesap zaten bir şirkete bağlı'; end if;
  select id into cid from companies where invite_code = upper(trim(p_code));
  if cid is null then raise exception 'Davet kodu bulunamadı'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Ad soyad gerekli'; end if;
  insert into profiles(id, company_id, full_name, contact, role) values (auth.uid(), cid, trim(p_full_name), p_contact, 'employee');
  return json_build_object('company_id', cid);
end $$;

-- ---------------------------------------------------------------------
-- ÇALIŞAN
-- ---------------------------------------------------------------------
create or replace function public.my_status()
returns json language plpgsql security definer set search_path = public as $$
declare p profiles; c companies; d record; today date; f timestamptz;
begin
  select * into p from profiles where id = auth.uid();
  if not found then return null; end if;
  select * into c from companies where id = p.company_id;
  today := (now() at time zone c.timezone)::date;
  f := today::timestamp at time zone c.timezone;
  select * into d from _user_day(p.id, today);
  return json_build_object(
    'user_id', p.id, 'full_name', p.full_name, 'role', p.role, 'active', p.active,
    'company', json_build_object('id', c.id, 'name', c.name, 'shift_start', c.shift_start, 'shift_end', c.shift_end,
                                 'late_tolerance_min', c.late_tolerance_min, 'timezone', c.timezone),
    'today', today, 'server_now', now(),
    'status', d.status, 'first_in', d.first_in, 'worked_sec', d.worked_sec, 'break_sec', d.break_sec,
    'allowance_sec', d.allowance_sec, 'break_since', d.break_since, 'breaks', d.breaks,
    'late_min', d.late_min, 'is_late', d.is_late, 'leave_kind', d.leave_kind,
    'events', (select coalesce(json_agg(json_build_object('kind', e.kind, 'at', e.at, 'source', e.source) order by e.at, e.id), '[]'::json)
               from events e where e.user_id = p.id and e.at >= f and e.at < f + interval '1 day'),
    'unread', (select count(*) from notifications n where n.user_id = p.id and n.read_at is null)
  );
end $$;

-- QR okutma: kodu doğrular, işlemi kaydeder
create or replace function public.scan(p_token text, p_action text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  p profiles; c companies; s company_secrets; parts text[]; win bigint; cur bigint; ok boolean := false;
  d record; today date; d2 record;
begin
  select * into p from profiles where id = auth.uid() and active;
  if not found then raise exception 'Hesabın aktif değil veya şirkete bağlı değil'; end if;
  select * into c from companies where id = p.company_id;
  select * into s from company_secrets where company_id = c.id;
  parts := string_to_array(coalesce(p_token, ''), '.');
  if parts[1] = 'K' and parts[2] = c.id::text and parts[3] ~ '^\d{1,12}$' then
    win := parts[3]::bigint;
    cur := floor(extract(epoch from now()) / 30)::bigint;
    if win between cur - 3 and cur + 1 then
      ok := parts[4] = left(encode(hmac(c.id::text || '.' || win::text, s.qr_secret, 'sha256'), 'hex'), 20);
    end if;
  elsif parts[1] = 'S' and parts[2] = c.id::text and c.allow_static_qr then
    ok := parts[3] = s.static_code;
  end if;
  if not ok then
    if parts[1] = 'K' and parts[2] = c.id::text then
      raise exception 'QR kodun süresi dolmuş. Kapıdaki ekranda görünen güncel kodu okut.';
    end if;
    raise exception 'Geçersiz QR kod. Şirketinin kapıdaki QR kodunu okut.';
  end if;

  today := (now() at time zone c.timezone)::date;
  select * into d from _user_day(p.id, today);
  if p_action not in ('in','break_start','break_end','out') then raise exception 'Geçersiz işlem';
  elsif p_action = 'in' and d.status in ('working','break') then raise exception 'Zaten giriş yapmışsın';
  elsif p_action = 'break_start' and d.status = 'break' then raise exception 'Zaten moladasın';
  elsif p_action = 'break_end' and d.status <> 'break' then raise exception 'Şu an molada değilsin';
  elsif p_action = 'out' and d.status not in ('working','break') then raise exception 'Önce giriş yapmalısın';
  end if;

  insert into events(company_id, user_id, kind, source) values (c.id, p.id, p_action, 'qr');

  select * into d2 from _user_day(p.id, today);
  if p_action in ('break_end','out') and d.status = 'break' and d2.break_sec > d2.allowance_sec then
    perform _alert(c.id, 'overdue', p.id, d.break_since,
      'Mola hakkını aştın',
      'Bugün mola hakkını ' || ceil((d2.break_sec - d2.allowance_sec) / 60.0)::int || ' dk aştın.',
      'Fazla mola: ' || p.full_name,
      p.full_name || ' günlük mola hakkını ' || ceil((d2.break_sec - d2.allowance_sec) / 60.0)::int || ' dk aştı.');
  end if;
  return my_status();
end $$;

drop function if exists public.my_history(int);
create or replace function public.my_history(p_days int default 14)
returns table(day date, status text, first_in timestamptz, worked_sec int, break_sec int, allowance_sec int, late_min int, is_late boolean, leave_kind text, breaks int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare today date; i int;
begin
  if my_company() is null then return; end if;
  today := _local_today(my_company());
  for i in 0 .. least(greatest(p_days, 1), 62) - 1 loop
    return query select u.day, u.status, u.first_in, u.worked_sec, u.break_sec, u.allowance_sec, u.late_min, u.is_late, u.leave_kind, u.breaks
      from _user_day(auth.uid(), today - i) u;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- YÖNETİCİ
-- ---------------------------------------------------------------------
drop function if exists public.team_today();
create or replace function public.team_today()
returns table(user_id uuid, full_name text, contact text, role text, status text, first_in timestamptz,
              worked_sec int, break_sec int, allowance_sec int, break_since timestamptz, breaks int,
              late_min int, is_late boolean, leave_kind text, last_event_at timestamptz, server_now timestamptz,
              last_out timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare cid uuid; today date; tz text;
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  cid := my_company();
  perform check_alerts(cid);
  today := _local_today(cid);
  select timezone into tz from companies where id = cid;
  return query
    select p.id, p.full_name, p.contact, p.role, u.status, u.first_in, u.worked_sec, u.break_sec, u.allowance_sec,
           u.break_since, u.breaks, u.late_min, u.is_late, u.leave_kind,
           (select max(e.at) from events e where e.user_id = p.id), now(),
           (select max(e.at) from events e where e.user_id = p.id and e.kind = 'out'
              and e.at >= (today::timestamp at time zone tz))
    from profiles p cross join lateral _user_day(p.id, today) u
    where p.company_id = cid and p.active and p.tracked
    order by p.full_name;
end $$;

drop function if exists public.team_report(date, date);
create or replace function public.team_report(p_from date, p_to date)
returns table(user_id uuid, full_name text, day date, status text, first_in timestamptz, last_out timestamptz,
              worked_sec int, break_sec int, allowance_sec int, late_min int, is_late boolean, leave_kind text, breaks int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare cid uuid; tz text;
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  if p_to < p_from or p_to - p_from > 92 then raise exception 'En fazla 93 günlük aralık seçebilirsin'; end if;
  cid := my_company();
  select timezone into tz from companies where id = cid;
  return query
    select p.id, p.full_name, u.day, u.status, u.first_in,
           (select max(e.at) from events e where e.user_id = p.id and e.kind = 'out'
              and e.at >= (u.day::timestamp at time zone tz) and e.at < ((u.day + 1)::timestamp at time zone tz)),
           u.worked_sec, u.break_sec, u.allowance_sec, u.late_min, u.is_late, u.leave_kind, u.breaks
    from profiles p
    cross join generate_series(p_from, p_to, interval '1 day') g(d)
    cross join lateral _user_day(p.id, g.d::date) u
    where p.company_id = cid and p.tracked
    order by u.day desc, p.full_name;
end $$;

create or replace function public.send_warning(p_user uuid, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  cid := my_company();
  if not exists (select 1 from profiles where id = p_user and company_id = cid) then raise exception 'Çalışan bulunamadı'; end if;
  insert into notifications(company_id, user_id, kind, title, body, ref_user)
  values (cid, p_user, 'warning', 'Yöneticinden uyarı', coalesce(nullif(trim(p_body), ''), 'Lütfen mola ve mesai saatlerine dikkat et.'), auth.uid());
end $$;

create or replace function public.admin_add_event(p_user uuid, p_kind text, p_at timestamptz, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  cid := my_company();
  if not exists (select 1 from profiles where id = p_user and company_id = cid) then raise exception 'Çalışan bulunamadı'; end if;
  if p_kind not in ('in','break_start','break_end','out') then raise exception 'Geçersiz işlem'; end if;
  insert into events(company_id, user_id, kind, at, source, note, created_by)
  values (cid, p_user, p_kind, coalesce(p_at, now()), 'manual', p_note, auth.uid());
end $$;

create or replace function public.admin_secrets()
returns json language plpgsql security definer set search_path = public as $$
declare s company_secrets;
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  select * into s from company_secrets where company_id = my_company();
  return json_build_object('company_id', s.company_id, 'kiosk_key', s.kiosk_key, 'static_token', 'S.' || s.company_id || '.' || s.static_code);
end $$;

create or replace function public.rotate_secrets()
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  update company_secrets set kiosk_key = encode(gen_random_bytes(16), 'hex'),
                             static_code = encode(gen_random_bytes(10), 'hex'),
                             qr_secret = encode(gen_random_bytes(24), 'hex')
  where company_id = my_company();
end $$;

-- ---------------------------------------------------------------------
-- KAPI EKRANI (kiosk): giriş yapmadan, gizli anahtarla 30 sn'de bir değişen QR üretir
-- ---------------------------------------------------------------------
create or replace function public.kiosk_token(p_company uuid, p_key text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s company_secrets; win bigint; ep numeric; nm text;
begin
  select * into s from company_secrets where company_id = p_company;
  if not found or s.kiosk_key <> coalesce(p_key, '') then raise exception 'Kapı ekranı bağlantısı geçersiz'; end if;
  select name into nm from companies where id = p_company;
  ep := extract(epoch from now());
  win := floor(ep / 30)::bigint;
  return json_build_object(
    'company', nm,
    'token', 'K.' || p_company || '.' || win || '.' || left(encode(hmac(p_company::text || '.' || win::text, s.qr_secret, 'sha256'), 'hex'), 20),
    'expires_in', 30 - (ep - win * 30),
    'server_now', now());
end $$;

-- ---------------------------------------------------------------------
-- GÜVENLİK (RLS)
-- ---------------------------------------------------------------------
alter table public.companies       enable row level security;
alter table public.company_secrets enable row level security;
alter table public.profiles        enable row level security;
alter table public.events          enable row level security;
alter table public.leaves          enable row level security;
alter table public.notifications   enable row level security;

revoke all on public.company_secrets from anon, authenticated;
revoke all on public.companies, public.profiles, public.events, public.leaves, public.notifications from anon;
grant select, update on public.companies to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.events to authenticated;
grant select, insert, update, delete on public.leaves to authenticated;
grant select, update on public.notifications to authenticated;
grant usage, select on sequence public.leaves_id_seq to authenticated;

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated using (id = my_company());
drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (id = my_company() and is_admin()) with check (id = my_company() and is_admin());

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (company_id = my_company() and is_admin()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (company_id = my_company() and is_admin()) with check (company_id = my_company());

drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (user_id = auth.uid() or (company_id = my_company() and is_admin()));

drop policy if exists leaves_select on public.leaves;
create policy leaves_select on public.leaves for select to authenticated
  using (user_id = auth.uid() or (company_id = my_company() and is_admin()));
drop policy if exists leaves_write on public.leaves;
create policy leaves_write on public.leaves for all to authenticated
  using (company_id = my_company() and is_admin())
  with check (company_id = my_company() and is_admin()
              and exists (select 1 from profiles x where x.id = user_id and x.company_id = my_company()));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- İç fonksiyonlar dışarıdan çağrılamaz
revoke execute on function public._day_calc(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public._user_day(uuid, date) from public, anon, authenticated;
revoke execute on function public._local_today(uuid) from public, anon, authenticated;
revoke execute on function public._alert(uuid, text, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.check_alerts(uuid) from public, anon, authenticated;

revoke execute on function public.create_company(text, text, text) from public, anon;
revoke execute on function public.join_company(text, text, text) from public, anon;
revoke execute on function public.my_status() from public, anon;
revoke execute on function public.scan(text, text) from public, anon;
revoke execute on function public.my_history(int) from public, anon;
revoke execute on function public.team_today() from public, anon;
revoke execute on function public.team_report(date, date) from public, anon;
revoke execute on function public.send_warning(uuid, text) from public, anon;
revoke execute on function public.admin_add_event(uuid, text, timestamptz, text) from public, anon;
revoke execute on function public.admin_secrets() from public, anon;
revoke execute on function public.rotate_secrets() from public, anon;

grant usage on schema public to anon, authenticated;
grant execute on function public.my_company() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.create_company(text, text, text) to authenticated;
grant execute on function public.join_company(text, text, text) to authenticated;
grant execute on function public.my_status() to authenticated;
grant execute on function public.scan(text, text) to authenticated;
grant execute on function public.my_history(int) to authenticated;
grant execute on function public.team_today() to authenticated;
grant execute on function public.team_report(date, date) to authenticated;
grant execute on function public.send_warning(uuid, text) to authenticated;
grant execute on function public.admin_add_event(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_secrets() to authenticated;
grant execute on function public.rotate_secrets() to authenticated;
grant execute on function public.kiosk_token(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- HER DAKİKA OTOMATİK KONTROL (fazla mola / gelmeyen uyarıları)
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'qr-mola-alerts';
  perform cron.schedule('qr-mola-alerts', '* * * * *', 'select public.check_alerts()');
exception when others then
  raise notice 'Otomatik kontrol kurulamadı (%). Uyarılar yönetici paneli açıkken yine oluşur.', sqlerrm;
end $$;
-- QR Mola Takip: davet kodsuz kayıt
-- Yeni kayıt olan kişi tek şirkete otomatik "çalışan" olarak eklenir.
-- Hiç şirket yoksa ilk kayıt olan yönetici olur.
create or replace function public.join_default(p_full_name text, p_contact text)
returns json language plpgsql security definer set search_path = public, extensions as $fn$
declare n int; cid uuid;
begin
  if auth.uid() is null then raise exception 'Önce giriş yapmalısın'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then raise exception 'Bu hesap zaten bir şirkete bağlı'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Ad soyad gerekli'; end if;
  select count(*) into n from companies;
  if n = 0 then
    return create_company('Şirketim', p_full_name, p_contact);
  elsif n > 1 then
    raise exception 'Davet kodu gerekli';
  end if;
  select id into cid from companies limit 1;
  insert into profiles(id, company_id, full_name, contact, role) values (auth.uid(), cid, trim(p_full_name), p_contact, 'employee');
  return json_build_object('company_id', cid);
end $fn$;

revoke execute on function public.join_default(text, text) from public, anon;
grant execute on function public.join_default(text, text) to authenticated;
