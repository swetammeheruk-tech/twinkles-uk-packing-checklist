create table if not exists public.packing_checklists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  share_key text not null default 'twinkle-main',
  title text not null default 'Twinkle UK Packing Checklist',
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.packing_checklists
  add column if not exists share_key text not null default 'twinkle-main';

with ranked_checklists as (
  select
    id,
    row_number() over (
      partition by share_key
      order by updated_at desc, id desc
    ) as row_number
  from public.packing_checklists
)
delete from public.packing_checklists checklist
using ranked_checklists ranked
where checklist.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists packing_checklists_share_key_idx
  on public.packing_checklists (share_key);

alter table public.packing_checklists enable row level security;

drop policy if exists "Users can read their own checklists" on public.packing_checklists;
drop policy if exists "Users can create their own checklists" on public.packing_checklists;
drop policy if exists "Users can update their own checklists" on public.packing_checklists;
drop policy if exists "Users can delete their own checklists" on public.packing_checklists;
drop policy if exists "Shared checklist can be read by authenticated users" on public.packing_checklists;
drop policy if exists "Shared checklist can be created by authenticated users" on public.packing_checklists;
drop policy if exists "Shared checklist can be updated by authenticated users" on public.packing_checklists;
drop policy if exists "Shared checklist can be deleted by authenticated users" on public.packing_checklists;

create policy "Shared checklist can be read by authenticated users"
  on public.packing_checklists
  for select
  using (share_key = 'twinkle-main' and auth.role() = 'authenticated');

create policy "Shared checklist can be created by authenticated users"
  on public.packing_checklists
  for insert
  with check (share_key = 'twinkle-main' and auth.uid() = owner_id);

create policy "Shared checklist can be updated by authenticated users"
  on public.packing_checklists
  for update
  using (share_key = 'twinkle-main' and auth.role() = 'authenticated')
  with check (share_key = 'twinkle-main');

create policy "Shared checklist can be deleted by authenticated users"
  on public.packing_checklists
  for delete
  using (share_key = 'twinkle-main' and auth.role() = 'authenticated');

create index if not exists packing_checklists_owner_updated_idx
  on public.packing_checklists (owner_id, updated_at desc);

do $$
begin
  alter publication supabase_realtime add table public.packing_checklists;
exception
  when duplicate_object then null;
end $$;
