-- =====================================================================
-- SOP System — schema
-- =====================================================================

-- ---------- profiles (role: admin / editor / viewer) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at timestamptz default now()
);

-- ينشئ بروفايل تلقائي لكل مستخدم جديد (role الافتراضي viewer، غيّره يدويًا من الداشبورد لأول admin)
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'viewer');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- ---------- sops ----------
create table if not exists sops (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  title text not null,           -- الاسم بالإنجليزي
  title_ar text,                 -- الاسم بالعربي
  product_line text,
  station text,
  description text,
  version int default 1,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sops_updated_at on sops;
create trigger trg_sops_updated_at
before update on sops
for each row execute function set_updated_at();

-- ---------- stages ----------
create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references sops(id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  title_ar text,
  description text,
  created_at timestamptz default now()
);

-- ---------- steps ----------
create table if not exists steps (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  order_index int not null default 0,
  title text not null,
  title_ar text,
  description text,
  requirements jsonb not null default '[]'::jsonb,   -- array of strings
  video_url text,                                     -- رابط خارجي (YouTube/Drive)
  is_critical boolean default false,
  created_at timestamptz default now()
);

-- ---------- step_images ----------
create table if not exists step_images (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references steps(id) on delete cascade,
  order_index int not null default 0,
  image_url text not null,
  caption text,
  created_at timestamptz default now()
);

create index if not exists idx_stages_sop on stages(sop_id);
create index if not exists idx_steps_stage on steps(stage_id);
create index if not exists idx_images_step on step_images(step_id);

-- =====================================================================
-- Storage bucket للصور
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('sop-images', 'sop-images', true)
on conflict (id) do nothing;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table profiles enable row level security;
alter table sops enable row level security;
alter table stages enable row level security;
alter table steps enable row level security;
alter table step_images enable row level security;

-- profiles: كل مستخدم مسجل يقدر يقرأ كل البروفايلات (عشان أسماء المُنشئين تظهر)، ويعدّل بروفايله بس
drop policy if exists "profiles_read" on profiles;
create policy "profiles_read" on profiles for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_update_self" on profiles;
create policy "profiles_update_self" on profiles for update using (auth.uid() = id);

-- قراءة مفتوحة لأي مستخدم مسجل
drop policy if exists "sops_read" on sops;
create policy "sops_read" on sops for select using (auth.role() = 'authenticated');
drop policy if exists "stages_read" on stages;
create policy "stages_read" on stages for select using (auth.role() = 'authenticated');
drop policy if exists "steps_read" on steps;
create policy "steps_read" on steps for select using (auth.role() = 'authenticated');
drop policy if exists "images_read" on step_images;
create policy "images_read" on step_images for select using (auth.role() = 'authenticated');

-- كتابة/تعديل/حذف: admin أو editor بس
drop policy if exists "sops_write" on sops;
create policy "sops_write" on sops for insert with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);
drop policy if exists "sops_update" on sops;
create policy "sops_update" on sops for update using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);
drop policy if exists "sops_delete" on sops;
create policy "sops_delete" on sops for delete using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "stages_write" on stages;
create policy "stages_write" on stages for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);

drop policy if exists "steps_write" on steps;
create policy "steps_write" on steps for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);

drop policy if exists "images_write" on step_images;
create policy "images_write" on step_images for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
) with check (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);

-- Storage policies
drop policy if exists "sop_images_public_read" on storage.objects;
create policy "sop_images_public_read"
on storage.objects for select
using (bucket_id = 'sop-images');

drop policy if exists "sop_images_write" on storage.objects;
create policy "sop_images_write"
on storage.objects for insert
with check (
  bucket_id = 'sop-images'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);

drop policy if exists "sop_images_delete" on storage.objects;
create policy "sop_images_delete"
on storage.objects for delete
using (
  bucket_id = 'sop-images'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin','editor'))
);


-- =====================================================================
-- بعد التشغيل: حوّل أول مستخدم لـ admin يدويًا من SQL editor:
-- update profiles set role = 'admin' where id = '<USER_UUID>';
-- =====================================================================
