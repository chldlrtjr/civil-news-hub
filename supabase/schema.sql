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

-- 2026-11-24 보안 경고 정리: 새 표에 RLS를 자동으로 켜는 이벤트 트리거 함수는 API(rpc)로 부를 필요가 없어요
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2026-11-24 마이페이지 "계정 삭제": 로그인한 본인 계정만 지워요. auth.users를 지우면 user_saved·세션·연동 정보가 함께 지워져요(on delete cascade)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 2026-11-25 검수 반영 (한 번 실행): 쓰지 않는 표 권한 회수(TRUNCATE 는 RLS 를 건너뛰어요) + 한 사람 행 크기 상한 256KB (지금 가장 큰 행 약 1KB)
revoke truncate, references, trigger on public.user_saved from anon, authenticated;
alter table public.user_saved drop constraint if exists user_saved_size;
alter table public.user_saved add constraint user_saved_size check (pg_column_size(ids) + pg_column_size(tracked) < 262144);
