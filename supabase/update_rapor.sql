-- QR Mola Takip: her sabah 10:00'da önceki günün fazla mola raporu (PDF, e-posta)

-- Şirket listesi (sadece sunucu kullanır)
create or replace function public.report_companies(out id uuid, out name text, out timezone text)
returns setof record
language sql security definer set search_path = public as $$
  select c.id, c.name, c.timezone from companies c order by c.created_at
$$;

-- Bir günün fazla mola yapanları ve mola aralıkları
create or replace function public.report_overdue(p_company uuid, p_day date,
  out full_name text, out first_in text, out last_out text, out breaks int,
  out break_sec int, out allowance_sec int, out intervals json)
returns setof record
language plpgsql security definer set search_path = public as $$
declare
  pr record; d record; tz text; ds timestamptz; de timestamptz;
begin
  select c.timezone into tz from companies c where c.id = p_company;
  ds := p_day::timestamp at time zone tz;
  de := (p_day + 1)::timestamp at time zone tz;
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

-- Raporun gideceği yönetici e-postaları
create or replace function public.report_admin_emails(p_company uuid)
returns setof text
language sql security definer set search_path = public, auth as $$
  select u.email::text from auth.users u join public.profiles p on p.id = u.id
  where p.company_id = p_company and p.role = 'admin' and p.active
    and u.email is not null and u.email not like '%@tel.qrmola.app'
$$;

revoke execute on function public.report_companies() from public, anon, authenticated;
revoke execute on function public.report_overdue(uuid, date) from public, anon, authenticated;
revoke execute on function public.report_admin_emails(uuid) from public, anon, authenticated;
grant execute on function public.report_companies() to service_role;
grant execute on function public.report_overdue(uuid, date) to service_role;
grant execute on function public.report_admin_emails(uuid) to service_role;
grant usage on schema public to service_role;
grant execute on function public._user_day(uuid, date) to service_role;
grant execute on function public._day_calc(uuid, timestamptz, timestamptz, timestamptz) to service_role;

-- Her gün 10:00 (Türkiye saati = 07:00 UTC) rapor fonksiyonunu çağır
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'gunluk-mola-raporu';
select cron.schedule('gunluk-mola-raporu', '0 7 * * *', $c$
  select net.http_post(
    url := 'https://gchmcoyvejbtaehnbkgi.supabase.co/functions/v1/gunluk-rapor',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'BURAYA_CRON_SECRET'),
    body := '{}'::jsonb
  )
$c$);
