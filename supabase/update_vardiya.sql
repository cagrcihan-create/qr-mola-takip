-- =====================================================================
-- QR Mola Takip — VARDİYA SİSTEMİ güncellemesi
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run
-- Tekrar çalıştırılabilir; mevcut verileri silmez.
-- =====================================================================

-- Şirket: pozisyonlar, kurallar, resmi tatiller (tek JSON alanında)
alter table public.companies add column if not exists shift_config jsonb not null default '{}'::jsonb;

-- Personel: pozisyon/seviye (ör. {"Barista":"A","Kasa":"B"}), haftalık gün hedefi, sabit dilim
alter table public.profiles add column if not exists levels jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists target_days int not null default 5;
alter table public.profiles add column if not exists fixed_slot text;
do $c$ begin
  alter table public.profiles add constraint profiles_target_days_chk check (target_days between 0 and 7);
exception when duplicate_object then null; end $c$;
do $c$ begin
  alter table public.profiles add constraint profiles_fixed_slot_chk check (fixed_slot is null or fixed_slot in ('ac','og','ka'));
exception when duplicate_object then null; end $c$;

-- Haftalık plan: taslak (plan) ve çalışanların gördüğü yayınlanmış hali (published_plan)
create table if not exists public.shift_weeks (
  company_id      uuid not null references public.companies(id) on delete cascade,
  week_start      date not null,                 -- haftanın pazartesisi
  plan            jsonb not null default '{}'::jsonb,
  hours           jsonb not null default '{}'::jsonb,
  published_plan  jsonb,
  published_hours jsonb,
  published_at    timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (company_id, week_start)
);
do $c$ begin
  alter table public.shift_weeks add constraint shift_weeks_monday_chk check (extract(isodow from week_start) = 1);
exception when duplicate_object then null; end $c$;

-- Plan dışı kayıtlar: gelmedi / eksik saat / ekstra çalışma
create table if not exists public.shift_adjust (
  id         bigserial primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('gelmedi','eksik','ekstra')),
  hours      numeric(4,1) not null default 0 check (hours >= 0 and hours <= 16),
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists shift_adjust_company_day_idx on public.shift_adjust(company_id, day);

-- ---------------------------------------------------------------------
-- GÜVENLİK
-- ---------------------------------------------------------------------
alter table public.shift_weeks  enable row level security;
alter table public.shift_adjust enable row level security;
revoke all on public.shift_weeks, public.shift_adjust from anon;
grant select, insert, update, delete on public.shift_weeks  to authenticated;
grant select, insert, update, delete on public.shift_adjust to authenticated;
grant usage, select on sequence public.shift_adjust_id_seq to authenticated;

-- Taslak plan sadece yöneticiye açık; çalışan yayınlanmış planı my_shifts() ile görür
drop policy if exists shift_weeks_admin on public.shift_weeks;
create policy shift_weeks_admin on public.shift_weeks for all to authenticated
  using (company_id = my_company() and is_admin())
  with check (company_id = my_company() and is_admin());

drop policy if exists shift_adjust_select on public.shift_adjust;
create policy shift_adjust_select on public.shift_adjust for select to authenticated
  using (user_id = auth.uid() or (company_id = my_company() and is_admin()));
drop policy if exists shift_adjust_write on public.shift_adjust;
create policy shift_adjust_write on public.shift_adjust for all to authenticated
  using (company_id = my_company() and is_admin())
  with check (company_id = my_company() and is_admin()
              and exists (select 1 from profiles x where x.id = user_id and x.company_id = my_company()));

-- ---------------------------------------------------------------------
-- FONKSİYONLAR
-- ---------------------------------------------------------------------
-- Çalışan: yayınlanmış haftalık planlar (taslak görünmez)
create or replace function public.my_shifts(p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
declare cid uuid;
begin
  cid := my_company();
  if cid is null then raise exception 'Şirkete bağlı değilsin'; end if;
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Geçersiz tarih aralığı'; end if;
  return (select coalesce(json_agg(json_build_object(
            'week_start', w.week_start, 'plan', w.published_plan, 'hours', w.published_hours,
            'published_at', w.published_at) order by w.week_start), '[]'::json)
          from shift_weeks w
          where w.company_id = cid and w.published_plan is not null
            and w.week_start between p_from - 6 and p_to);
end $$;

-- Yönetici: planı yayınla ve çalışanlara bildirim gönder
create or replace function public.publish_shift_week(p_week date)
returns json language plpgsql security definer set search_path = public as $$
declare cid uuid; w shift_weeks; first boolean; n int := 0; lbl text;
begin
  if not is_admin() then raise exception 'Yetkin yok'; end if;
  cid := my_company();
  select * into w from shift_weeks where company_id = cid and week_start = p_week;
  if not found then raise exception 'Önce planı oluştur'; end if;
  first := w.published_plan is null;
  update shift_weeks set published_plan = plan, published_hours = hours, published_at = now(), updated_at = now()
   where company_id = cid and week_start = p_week;
  lbl := to_char(p_week, 'DD.MM') || '–' || to_char(p_week + 6, 'DD.MM.YYYY');
  insert into notifications(company_id, user_id, kind, title, body)
  select cid, p.id, 'shift',
         case when first then 'Vardiya planı yayınlandı' else 'Vardiya planı güncellendi' end,
         lbl || ' haftasının planı hazır. “Vardiyam” sekmesinden görebilirsin.'
    from profiles p
   where p.company_id = cid and p.active and p.tracked and p.id <> auth.uid();
  get diagnostics n = row_count;
  return json_build_object('notified', n, 'published_at', now());
end $$;

revoke execute on function public.my_shifts(date, date) from public, anon;
revoke execute on function public.publish_shift_week(date) from public, anon;
grant execute on function public.my_shifts(date, date) to authenticated;
grant execute on function public.publish_shift_week(date) to authenticated;
