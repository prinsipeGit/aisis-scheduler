create table public.programs (
  id text primary key,
  code text not null,
  name text not null,
  version_year int not null,
  blocks jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.catalogs (
  term text primary key,
  exported_at timestamptz not null,
  sections jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create table public.community_ratings (
  id bigint generated always as identity primary key,
  name text not null,
  rating numeric not null check (rating >= 0 and rating <= 5),
  course_code text,
  note text,
  as_of date,
  unique nulls not distinct (name, course_code)
);
alter table public.programs enable row level security;
alter table public.catalogs enable row level security;
alter table public.community_ratings enable row level security;
create policy "public read" on public.programs for select to anon, authenticated using (true);
create policy "public read" on public.catalogs for select to anon, authenticated using (true);
create policy "public read" on public.community_ratings for select to anon, authenticated using (true);
