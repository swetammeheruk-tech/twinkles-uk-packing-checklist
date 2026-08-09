create table if not exists public.packing_checklists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Twinkle UK Packing Checklist',
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.packing_checklists enable row level security;

create policy "Users can read their own checklists"
  on public.packing_checklists
  for select
  using (auth.uid() = owner_id);

create policy "Users can create their own checklists"
  on public.packing_checklists
  for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own checklists"
  on public.packing_checklists
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Users can delete their own checklists"
  on public.packing_checklists
  for delete
  using (auth.uid() = owner_id);

create index if not exists packing_checklists_owner_updated_idx
  on public.packing_checklists (owner_id, updated_at desc);
