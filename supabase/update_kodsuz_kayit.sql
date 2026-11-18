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
