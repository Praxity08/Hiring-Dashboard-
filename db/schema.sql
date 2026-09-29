-- Kargo Hiring Desk schema (Neon Postgres). Safe to re-run.
create table if not exists candidates (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cv_files (
  candidate_id text primary key references candidates(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  content bytea not null,
  uploaded_at timestamptz not null default now()
);

create index if not exists candidates_updated_at_idx on candidates (updated_at desc);
