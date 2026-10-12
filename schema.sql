-- =====================================================================
-- GOODENT LABORATUVAR - VERİTABANI ŞEMASI (Supabase / PostgreSQL)
-- Kurulum: Supabase > SQL Editor > bu dosyanın tamamını yapıştır > Run
-- Garantiler:
--   1) Hiçbir kayıt gerçekten silinmez (soft delete: deleted_at)
--   2) Her ekleme/güncelleme/silme audit_log tablosuna yazılır (kim, ne zaman, eski/yeni değer)
--   3) Rol bazlı erişim (RLS): personel sadece yetkili olduğu veriyi görür
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUM'lar ----------
create type user_role as enum ('admin','receptionist','designer','technician','ceramist','qc','accountant');
create type stage_code as enum ('kabul','tasarim','uretim','porselen','kalite','prova','sevkiyat','teslim');
create type stage_status as enum ('bekliyor','devam','bitti','atlandi');
create type case_status as enum ('acik','laboratuvarda','provada','teslim_edildi','iptal');
create type account_type as enum ('musteri','tedarikci');
create type tx_type as enum ('satis_faturasi','alis_faturasi','tahsilat','odeme','gider');
create type currency_code as enum ('TL','EUR','USD');

-- ---------- Ortak: updated_at ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- PERSONEL ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  role user_role not null default 'technician',
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- CARİ HESAPLAR (klinik / tedarikçi) ----------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  type account_type not null,
  name text not null,
  phone text,
  address text,
  logo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  deleted_at timestamptz
);

-- ---------- DOKTORLAR ----------
create table doctors (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id),   -- bağlı olduğu klinik
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- HASTALAR ----------
create table patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- İŞLER (ana tablo) ----------
create sequence case_no_seq start 1000;

create table cases (
  id uuid primary key default gen_random_uuid(),
  case_no bigint not null unique default nextval('case_no_seq'),
  doctor_id uuid not null references doctors(id),
  account_id uuid references accounts(id),
  patient_id uuid not null references patients(id),
  work_type text not null,            -- Zirkon, Rezin, Veneer, Geçici Protez, Gece Plağı...
  tooth_numbers text,                 -- ör. "11,12,21"
  shade text,                         -- renk
  delivery_type text,                 -- Prova / Final
  status case_status not null default 'acik',
  current_stage stage_code not null default 'kabul',
  received_at timestamptz not null default now(),
  due_date date,
  delivered_at timestamptz,
  price numeric(12,2) default 0,
  currency currency_code default 'TL',
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on cases(status) where deleted_at is null;
create index on cases(due_date) where deleted_at is null;
create index on cases(doctor_id);

-- ---------- İŞ AŞAMALARI (kim ne iş yapıyor) ----------
create table case_stages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  stage stage_code not null,
  seq int not null,
  assigned_to uuid references profiles(id),
  status stage_status not null default 'bekliyor',
  started_at timestamptz,
  finished_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (case_id, stage)
);
create index on case_stages(assigned_to, status);

-- Yeni iş açılınca 8 aşamayı otomatik oluştur
create or replace function create_default_stages() returns trigger language plpgsql as $$
declare s stage_code; i int := 0;
begin
  foreach s in array enum_range(null::stage_code) loop
    i := i + 1;
    insert into case_stages(case_id, stage, seq, status, started_at)
    values (new.id, s, i,
            case when i = 1 then 'devam'::stage_status else 'bekliyor' end,
            case when i = 1 then now() end);
  end loop;
  return new;
end $$;
create trigger trg_case_stages after insert on cases
for each row execute function create_default_stages();

-- Aşama bitince: işin güncel aşamasını ilerlet, sonrakini başlat
create or replace function advance_stage() returns trigger language plpgsql as $$
declare nxt case_stages%rowtype;
begin
  if new.status = 'devam' and old.status = 'bekliyor' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.status in ('bitti','atlandi') and old.status not in ('bitti','atlandi') then
    new.finished_at := now();
    select * into nxt from case_stages
      where case_id = new.case_id and seq > new.seq and status = 'bekliyor'
      order by seq limit 1;
    if found then
      update case_stages set status='devam', started_at=now() where id = nxt.id;
      update cases set current_stage = nxt.stage,
        status = case when nxt.stage = 'prova' then 'provada'
                      when nxt.stage = 'kabul' then 'acik'
                      else 'laboratuvarda' end
      where id = new.case_id;
    else
      update cases set status='teslim_edildi', delivered_at=now() where id = new.case_id;
    end if;
  end if;
  return new;
end $$;
create trigger trg_advance before update on case_stages
for each row execute function advance_stage();

-- ---------- İŞ DOSYALARI (tarama, foto, STL) ----------
create table case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  storage_path text not null,         -- Supabase Storage yolu
  file_name text,
  kind text,                          -- olcu, foto, stl, pdf
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- RANDEVULAR ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  doctor_id uuid references doctors(id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------- STOK ----------
create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text,                      -- Zirkon blok, Implant Ti-Base, Cement...
  unit text default 'adet',
  min_level numeric default 0,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items(id),
  qty numeric not null,               -- giriş (+) / çıkış (-)
  invoice_no text,
  account_id uuid references accounts(id),
  case_id uuid references cases(id),
  moved_at timestamptz not null default now(),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create view stock_levels as
  select i.id, i.name, i.brand, i.min_level,
         coalesce(sum(m.qty),0) as qty,
         coalesce(sum(m.qty),0) <= i.min_level as low
  from inventory_items i
  left join stock_movements m on m.item_id = i.id
  where i.deleted_at is null
  group by i.id;

-- ---------- KASA & İŞLEMLER ----------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  type tx_type not null,
  account_id uuid references accounts(id),
  case_id uuid references cases(id),
  amount numeric(14,2) not null check (amount >= 0),
  currency currency_code not null default 'TL',
  tx_date date not null default current_date,
  description text,
  pdf_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on transactions(account_id, tx_date);

-- Cari bakiye: pozitif = bize borçlu
create view account_balances as
  select a.id, a.name, a.type, t.currency,
    sum(case t.type
          when 'satis_faturasi' then t.amount
          when 'tahsilat' then -t.amount
          when 'alis_faturasi' then -t.amount
          when 'odeme' then t.amount
          else 0 end) as balance
  from accounts a join transactions t on t.account_id = a.id and t.deleted_at is null
  group by a.id, a.name, a.type, t.currency;

-- =====================================================================
-- DENETİM KAYDI (AUDIT LOG) - her değişiklik kalıcı kaydedilir
-- =====================================================================
create table audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  action text not null,               -- INSERT / UPDATE / DELETE
  old_data jsonb,
  new_data jsonb,
  user_id uuid default auth.uid(),
  at timestamptz not null default now()
);

create or replace function audit_trigger() returns trigger language plpgsql security definer as $$
begin
  insert into audit_log(table_name,row_id,action,old_data,new_data)
  values (tg_table_name,
          coalesce((case when tg_op='DELETE' then old.id else new.id end)::text,''),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Gerçek silmeyi engelle
create or replace function block_hard_delete() returns trigger language plpgsql as $$
begin
  raise exception 'Kayıtlar silinemez. deleted_at alanını doldurun (soft delete).';
end $$;

-- Tüm tablolara uygula
do $$
declare t text;
begin
  foreach t in array array['profiles','accounts','doctors','patients','cases','case_stages',
    'case_files','appointments','inventory_items','stock_movements','transactions']
  loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on %1$s
                    for each row execute function audit_trigger()', t);
    execute format('create trigger trg_nodelete_%1$s before delete on %1$s
                    for each row execute function block_hard_delete()', t);
    execute format('alter table %1$s enable row level security', t);
  end loop;
  foreach t in array array['profiles','accounts','doctors','patients','cases','case_stages',
    'appointments','inventory_items','transactions']
  loop
    execute format('create trigger trg_upd_%1$s before update on %1$s
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- audit_log değiştirilemez / silinemez
alter table audit_log enable row level security;
create or replace function audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log değiştirilemez'; end $$;
create trigger trg_audit_immutable before update or delete on audit_log
for each row execute function audit_immutable();

-- =====================================================================
-- YETKİ (RLS)
-- =====================================================================
create or replace function my_role() returns user_role
language sql stable security definer as $$
  select role from profiles where id = auth.uid() and active and deleted_at is null $$;

create or replace function is_admin() returns boolean
language sql stable as $$ select coalesce(my_role() = 'admin', false) $$;

-- Giriş yapmış aktif personel işlerle ilgili tabloları okuyabilir/yazabilir
do $$
declare t text;
begin
  foreach t in array array['accounts','doctors','patients','cases','case_stages','case_files',
    'appointments','inventory_items','stock_movements']
  loop
    if t not in ('case_stages','stock_movements') then
      execute format('create policy p_read_%1$s on %1$s for select using (my_role() is not null and deleted_at is null)', t);
    end if;
    execute format('create policy p_write_%1$s on %1$s for all using (my_role() is not null) with check (my_role() is not null)', t);
  end loop;
end $$;

create policy p_read_case_stages on case_stages for select using (my_role() is not null);
create policy p_read_stock_movements on stock_movements for select using (my_role() is not null);

-- Kasa: sadece admin ve muhasebe
create policy p_tx_all on transactions for all
  using (my_role() in ('admin','accountant'))
  with check (my_role() in ('admin','accountant'));

-- Personel: herkes kendini görür, admin hepsini yönetir
create policy p_prof_read on profiles for select using (my_role() is not null);
create policy p_prof_admin on profiles for all using (is_admin()) with check (is_admin());

-- Audit: sadece admin okur
create policy p_audit_read on audit_log for select using (is_admin());

-- Yeni kullanıcı kaydolunca profil aç
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          case when (select count(*) from public.profiles) = 0
               then 'admin'::public.user_role else 'technician'::public.user_role end);
  return new;
end $$;
alter function public.audit_trigger() set search_path = public;
alter function public.my_role() set search_path = public;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();
-- NOT: İlk kayıt olan kullanıcı otomatik admin olur.
