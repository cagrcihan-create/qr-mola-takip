-- QR Mola Takip: sadece mola güncellemesi

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
  -- sadece mola takibi: molada değilse 'off' (işte)
  if st in ('working','done') then st := 'off'; end if;
  return query select p_day, st, r.first_in, r.worked_sec, r.break_sec,
    coalesce(p.break_allowance_min, c.break_allowance_min) * 60,
    r.break_since, r.breaks, lt, (r.first_in is not null and wd and lt > c.late_tolerance_min), lk, wd;
end $$;

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
  if p_action not in ('break_start','break_end') then raise exception 'Geçersiz işlem';
  elsif p_action = 'break_start' and d.status = 'break' then raise exception 'Zaten moladasın';
  elsif p_action = 'break_end' and d.status <> 'break' then raise exception 'Şu an molada değilsin';
  end if;

  insert into events(company_id, user_id, kind, source) values (c.id, p.id, p_action, 'qr');

  select * into d2 from _user_day(p.id, today);
  if p_action = 'break_end' and d.status = 'break' and d2.break_sec > d2.allowance_sec then
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

revoke execute on function public._day_calc(uuid, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public._user_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.check_alerts(uuid) from public, anon, authenticated;
revoke execute on function public.my_history(int) from public, anon;
revoke execute on function public.team_report(date, date) from public, anon;
grant execute on function public.scan(text, text) to authenticated;
grant execute on function public.my_history(int) to authenticated;
grant execute on function public.team_report(date, date) to authenticated;
