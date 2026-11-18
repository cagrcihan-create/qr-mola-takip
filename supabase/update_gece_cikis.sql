-- QR Mola Takip: iş günü 02:05'te başlar + gece 02:05 otomatik çıkış

create or replace function public._day_offset() returns interval
language sql as $$ select interval '2 hours 5 minutes' $$;

create or replace function public._local_today(p_company uuid) returns date
language sql security definer set search_path = public as $$
  select ((now() at time zone timezone) - _day_offset())::date from companies where id = p_company
$$;

create or replace function public._user_day(p_user uuid, p_day date,
  out day date, out status text, out first_in timestamptz, out worked_sec int, out break_sec int,
  out allowance_sec int, out break_since timestamptz, out breaks int,
  out late_min int, out is_late boolean, out leave_kind text, out is_workday boolean)
returns setof record
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  p profiles; c companies; f timestamptz; r record; lk text; lt int := 0; wd boolean; st text; loc timestamp;
begin
  select * into p from profiles where id = p_user;
  select * into c from companies where id = p.company_id;
  f := (p_day::timestamp + _day_offset()) at time zone c.timezone;
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

create or replace function public.check_alerts(p_company uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare pr record; d record; c companies; n int := 0; today date;
begin
  for pr in select p.id, p.full_name, p.company_id from profiles p
            where p.active and p.tracked and (p_company is null or p.company_id = p_company) loop
    select * into c from companies where id = pr.company_id;
    today := _local_today(pr.company_id);
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

create or replace function public.my_status()
returns json language plpgsql security definer set search_path = public as $$
declare p profiles; c companies; d record; today date; f timestamptz;
begin
  select * into p from profiles where id = auth.uid();
  if not found then return null; end if;
  select * into c from companies where id = p.company_id;
  today := _local_today(c.id);
  f := (today::timestamp + _day_offset()) at time zone c.timezone;
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

  today := _local_today(c.id);
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

create or replace function public.team_today(
  out user_id uuid, out full_name text, out contact text, out role text, out status text, out first_in timestamptz,
  out worked_sec int, out break_sec int, out allowance_sec int, out break_since timestamptz, out breaks int,
  out late_min int, out is_late boolean, out leave_kind text, out last_event_at timestamptz, out server_now timestamptz,
  out last_out timestamptz)
returns setof record
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
              and e.at >= ((today::timestamp + _day_offset()) at time zone tz))
    from profiles p cross join lateral _user_day(p.id, today) u
    where p.company_id = cid and p.active and p.tracked
    order by p.full_name;
end $$;

create or replace function public.team_report(p_from date, p_to date,
  out user_id uuid, out full_name text, out day date, out status text, out first_in timestamptz, out last_out timestamptz,
  out worked_sec int, out break_sec int, out allowance_sec int, out late_min int, out is_late boolean, out leave_kind text, out breaks int)
returns setof record
language plpgsql security definer set search_path = public as $$
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
              and e.at >= ((u.day::timestamp + _day_offset()) at time zone tz)
              and e.at < (((u.day + 1)::timestamp + _day_offset()) at time zone tz)),
           u.worked_sec, u.break_sec, u.allowance_sec, u.late_min, u.is_late, u.leave_kind, u.breaks
    from profiles p
    cross join generate_series(p_from, p_to, interval '1 day') g(d)
    cross join lateral _user_day(p.id, g.d::date) u
    where p.company_id = cid and p.tracked
    order by u.day desc, p.full_name;
end $$;

create or replace function public.report_overdue(p_company uuid, p_day date,
  out full_name text, out first_in text, out last_out text, out breaks int,
  out break_sec int, out allowance_sec int, out intervals json)
returns setof record
language plpgsql security definer set search_path = public as $$
declare
  pr record; d record; tz text; ds timestamptz; de timestamptz;
begin
  select c.timezone into tz from companies c where c.id = p_company;
  ds := (p_day::timestamp + _day_offset()) at time zone tz;
  de := ((p_day + 1)::timestamp + _day_offset()) at time zone tz;
  for pr in select p.id, p.full_name from profiles p
            where p.company_id = p_company and p.tracked order by p.full_name loop
    select * into d from _user_day(pr.id, p_day);
    if d.break_sec > d.allowance_sec then
      full_name := pr.full_name;
      first_in := to_char(d.first_in at time zone tz, 'HH24:MI');
      last_out := (select to_char(max(e.at) at time zone tz, 'HH24:MI') from events e
                    where e.user_id = pr.id and e.kind = 'out' and e.at >= ds and e.at < de);
      breaks := d.breaks;
      break_sec := d.break_sec;
      allowance_sec := d.allowance_sec;
      select coalesce(json_agg(json_build_object(
               's', to_char(q.s at time zone tz, 'HH24:MI'),
               'e', coalesce(to_char(q.e at time zone tz, 'HH24:MI'), '—'),
               'dk', round(extract(epoch from coalesce(q.e, least(now(), de)) - q.s) / 60)::int
             ) order by q.s), '[]'::json)
        into intervals
        from (select ev.at as s,
                     (select min(x.at) from events x
                       where x.user_id = pr.id and x.at > ev.at and x.at < de
                         and x.kind in ('break_end','out')) as e
                from events ev
               where ev.user_id = pr.id and ev.kind = 'break_start' and ev.at >= ds and ev.at < de) q;
      return next;
    end if;
  end loop;
end $$;

create or replace function public.auto_checkout()
returns int language plpgsql security definer set search_path = public as $$
declare pr record; d record; c companies; yday date; de timestamptz; n int := 0;
begin
  for pr in select p.id, p.full_name, p.company_id from profiles p where p.active loop
    select * into c from companies where id = pr.company_id;
    yday := _local_today(c.id) - 1;
    select * into d from _user_day(pr.id, yday);
    if d.status in ('working','break') then
      de := ((yday + 1)::timestamp + _day_offset()) at time zone c.timezone;
      insert into events(company_id, user_id, kind, at, source, note)
      values (c.id, pr.id, 'out', de - interval '1 second', 'manual', 'Otomatik çıkış (02:05)');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public._local_today(uuid) from public, anon, authenticated;
revoke execute on function public._user_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.check_alerts(uuid) from public, anon, authenticated;
revoke execute on function public.auto_checkout() from public, anon, authenticated;
revoke execute on function public.team_report(date, date) from public, anon;
grant execute on function public.team_report(date, date) to authenticated;
grant execute on function public.my_status() to authenticated;
grant execute on function public.scan(text, text) to authenticated;
grant execute on function public.team_today() to authenticated;
grant execute on function public.report_overdue(uuid, date) to service_role;
grant execute on function public._local_today(uuid) to service_role;
grant execute on function public._day_offset() to service_role, authenticated;

-- Her gece 02:05 (Türkiye = 23:05 UTC) çıkış yapmayanlara otomatik çıkış
select cron.unschedule(jobid) from cron.job where jobname = 'gece-otomatik-cikis';
select cron.schedule('gece-otomatik-cikis', '5 23 * * *', 'select public.auto_checkout()');

