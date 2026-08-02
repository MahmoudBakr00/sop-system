-- =====================================================================
-- SOP System — migration 002: full SOP structure
-- (Header/Purpose-Scope/Responsibilities/Tools/Inspection/Safety/
--  Deviation/References/Revision-history)
-- شغّل الملف ده بعد 001_init_schema.sql
-- =====================================================================

-- ---------- sops: أعمدة إضافية ----------
alter table sops
  add column if not exists scope text,                    -- النطاق (المنتجات/المحطات اللي بيتطبق عليها)
  add column if not exists prepared_by text,
  add column if not exists prepared_at date,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at date,
  add column if not exists approved_by text,
  add column if not exists approved_at date,
  add column if not exists safety_notes text,              -- تحذيرات عامة + PPE المطلوب
  add column if not exists deviation_handling text;        -- إجراء التعامل مع الانحرافات/التوقف (Andon)

-- description الموجود قبل كده هنستخدمه كـ "الهدف" (Purpose)

-- ---------- steps: أعمدة إضافية ----------
alter table steps
  add column if not exists responsible_role text
    check (responsible_role in ('operator','supervisor','qc','maintenance','other')),
  add column if not exists spec_value text,                -- Torque / أبعاد / مواصفة فنية
  add column if not exists accept_criteria text,            -- معيار القبول
  add column if not exists reject_criteria text,            -- معيار الرفض
  add column if not exists defect_code text,                 -- كود العيب (ربط بنظام تتبع العيوب)
  add column if not exists ppe_notes text;                   -- ملاحظة سلامة خاصة بالخطوة (اختياري، فوق العام)

-- ---------- الأدوات/المواد/أجهزة القياس (على مستوى الـ SOP كله) ----------
create table if not exists sop_tools (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops(id) on delete cascade,
  order_index int not null default 0,
  category text default 'tool' check (category in ('tool','material','instrument')),
  name text not null,
  spec text,                      -- مواصفة/معايرة مطلوبة (اختياري)
  created_at timestamptz default now()
);

-- ---------- المراجع ----------
create table if not exists sop_references (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops(id) on delete cascade,
  order_index int not null default 0,
  ref_text text not null,         -- مثال: IEC 60335-2-24:2025
  ref_url text,
  created_at timestamptz default now()
);

-- ---------- سجل تعديلات الإصدار (Revision history) ----------
create table if not exists sop_revisions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops(id) on delete cascade,
  revision_no int not null,
  revision_date timestamptz not null default now(),
  changed_by uuid references profiles(id),
  change_summary text,
  created_at timestamptz default now()
);

create index if not exists idx_tools_sop on sop_tools(sop_id);
create index if not exists idx_refs_sop on sop_references(sop_id);
create index if not exists idx_revisions_sop on sop_revisions(sop_id, revision_no desc);

-- =====================================================================
-- Auto revision bump — تستدعيها من الكود بعد أي حفظ ناجح
-- (تزود version في جدول sops وتسجل سطر في sop_revisions)
-- =====================================================================
create or replace function bump_sop_revision(p_sop_id uuid, p_summary text default null)
returns int as $$
declare
  v_new_version int;
  v_user uuid := auth.uid();
  v_role text;
begin
  select role into v_role from profiles where id = v_user;
  if v_role is null or v_role not in ('admin','editor') then
    raise exception 'not authorized to edit this SOP';
  end if;

  update sops
    set version = coalesce(version, 0) + 1,
        updated_by = v_user
  where id = p_sop_id
  returning version into v_new_version;

  insert into sop_revisions (sop_id, revision_no, changed_by, change_summary)
  values (p_sop_id, v_new_version, v_user, coalesce(nullif(p_summary, ''), 'تعديل'));

  return v_new_version;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- RLS للجداول الجديدة
-- =====================================================================
alter table sop_tools enable row level security;
alter table sop_references enable row level security;
alter table sop_revisions enable row level security;

drop policy if exists "tools_read" on sop_tools;
create policy "tools_read" on sop_tools for select using (auth.role() = 'authenticated');
drop policy if exists "tools_write" on sop_tools;
create policy "tools_write" on sop_tools for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);

drop policy if exists "refs_read" on sop_references;
create policy "refs_read" on sop_references for select using (auth.role() = 'authenticated');
drop policy if exists "refs_write" on sop_references;
create policy "refs_write" on sop_references for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);

-- سجل التعديلات: قراءة فقط من الـ client، الإضافة تتم فقط عن طريق bump_sop_revision()
drop policy if exists "revisions_read" on sop_revisions;
create policy "revisions_read" on sop_revisions for select using (auth.role() = 'authenticated');
