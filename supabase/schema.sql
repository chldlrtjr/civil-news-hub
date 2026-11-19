-- Supabase SQL Editor에서 한 번 실행. 사용자마다 북마크 1행, 본인 행만 읽고 쓸 수 있음(RLS)
create table if not exists public.user_saved (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  ids        jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_saved enable row level security;

grant select, insert, update, delete on public.user_saved to authenticated;

drop policy if exists "본인 북마크만" on public.user_saved;
create policy "본인 북마크만" on public.user_saved
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 2026-11-19 마이페이지 진행 카드 (한 번 실행)
alter table public.user_saved add column if not exists tracked jsonb not null default '[]'::jsonb;
