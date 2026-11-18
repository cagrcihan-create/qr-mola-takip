-- QR Mola Takip: giriş/çıkış + davet kodsuz kayıt güncellemesi
alter table public.companies enable row level security;
alter table public.company_secrets enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.leaves enable row level security;
alter table public.notifications enable row level security;

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

revoke execute on function public._user_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.team_today() from public, anon;
grant execute on function public.scan(text, text) to authenticated;
grant execute on function public.team_today() to authenticated;

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
