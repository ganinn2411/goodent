-- =====================================================================
-- BARKOD OKUTMA: 1. okutma = aşamayı teslim al, 2. okutma = aşamayı bitir
-- Supabase > SQL Editor > bu dosyanın tamamını yapıştır > Run
-- (schema.sql çalıştırıldıktan sonra)
-- =====================================================================

-- Aşamanın ne zaman teslim alındığı (1. okutma)
alter table case_stages add column if not exists claimed_at timestamptz;

create or replace function public.scan_case(p_case_no bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  c    cases%rowtype;
  s    case_stages%rowtype;
  info jsonb;
  who  text;
begin
  -- giriş yapmış aktif personel mi?
  if me is null or my_role() is null then
    return jsonb_build_object('ok', false, 'code', 'yetki');
  end if;

  select * into c from cases where case_no = p_case_no and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'bulunamadi');
  end if;

  if c.status in ('teslim_edildi', 'iptal') then
    return jsonb_build_object('ok', false, 'code', 'kapali');
  end if;

  -- şu an devam eden aşama
  select * into s from case_stages
   where case_id = c.id and status = 'devam'
   order by seq limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'asama_yok');
  end if;

  -- ekranda gösterilecek iş bilgisi
  select jsonb_build_object(
           'case_no', c.case_no,
           'work_type', c.work_type,
           'patient', p.full_name,
           'doctor', d.full_name,
           'tooth_numbers', c.tooth_numbers,
           'shade', c.shade,
           'due_date', c.due_date::text)
    into info
    from patients p
    left join doctors d on d.id = c.doctor_id
   where p.id = c.patient_id;

  -- aşama başka birine atanmış / onda
  if s.assigned_to is not null and s.assigned_to <> me then
    select full_name into who from profiles where id = s.assigned_to;
    return jsonb_build_object('ok', false, 'code', 'baskasinda', 'who', who);
  end if;

  -- 1. OKUTMA: teslim al
  if s.claimed_at is null or s.assigned_to is null then
    update case_stages
       set assigned_to = me, claimed_at = now()
     where id = s.id;
    return jsonb_build_object('ok', true, 'action', 'alindi',
                              'stage', s.stage, 'case', info);
  end if;

  -- yanlışlıkla art arda okutmayı engelle (15 sn)
  if s.claimed_at > now() - interval '15 seconds' then
    return jsonb_build_object('ok', false, 'code', 'cok_hizli');
  end if;

  -- 2. OKUTMA: aşamayı bitir (trg_advance sonraki aşamayı başlatır)
  update case_stages set status = 'bitti' where id = s.id;

  select * into c from cases where id = c.id;
  if c.status = 'teslim_edildi' then
    return jsonb_build_object('ok', true, 'action', 'bitti', 'delivered', true,
                              'stage', s.stage, 'case', info);
  end if;
  return jsonb_build_object('ok', true, 'action', 'bitti', 'delivered', false,
                            'stage', s.stage, 'next_stage', c.current_stage,
                            'case', info);
end $$;

revoke all on function public.scan_case(bigint) from public;
grant execute on function public.scan_case(bigint) to authenticated;
