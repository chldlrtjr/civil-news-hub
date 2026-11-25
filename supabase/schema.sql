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

-- 2026-11-26 남용 방지 (코디네이터 승인 뒤 한 번 실행)
-- 근거: 사이트 전체 항목이 약 375개(뉴스 281·공모전 34·채용 23·알바 32·SW 3), 진행 카드로 넣을 수 있는 공모전·채용은 57개,
--       카드 1장 약 350~600바이트, 삭제 표시 약 70바이트, 북마크 id 는 20자 이하.
--       그래서 북마크 1000개·진행 카드 200개(삭제 표시 포함)면 넉넉하고, 그 최대치가 약 120KB 라 행 상한을 256KB → 128KB 로 내림.
--       프런트(static/tracker_core.js MAX_SAVED·MAX_TRACKED·MAX_TRACKED_BYTES)가 올리기 전에 같은 상한으로 잘라요.
-- (1) 먼저 확인: 새 제약을 어기는 기존 행 (0행이어야 아래를 적용할 수 있어요. 남아 있으면 ADD CONSTRAINT 가 오류로 멈춰요)
select user_id, jsonb_typeof(ids) as ids_type, jsonb_typeof(tracked) as tracked_type,
       case when jsonb_typeof(ids) = 'array' then jsonb_array_length(ids) end as ids_n,
       case when jsonb_typeof(tracked) = 'array' then jsonb_array_length(tracked) end as tracked_n,
       pg_column_size(ids) + pg_column_size(tracked) as bytes
from public.user_saved
where jsonb_typeof(ids) <> 'array' or jsonb_typeof(tracked) <> 'array'
   or (case when jsonb_typeof(ids) = 'array' then jsonb_array_length(ids) else 0 end) > 1000
   or (case when jsonb_typeof(tracked) = 'array' then jsonb_array_length(tracked) else 0 end) > 200
   or pg_column_size(ids) + pg_column_size(tracked) >= 131072;
-- (2) 적용: anon·PUBLIC 은 표 권한 전부 회수, authenticated 는 앱이 쓰는 것만(select + upsert = insert·update. 계정 삭제는 위 함수가 cascade 로 처리)
revoke all on public.user_saved from anon, public;
revoke all on public.user_saved from authenticated;
grant select, insert, update on public.user_saved to authenticated;
-- jsonb_array_length 는 배열이 아니면 오류라 case 로 먼저 모양을 확인해요(AND 는 계산 순서가 보장되지 않음)
alter table public.user_saved drop constraint if exists user_saved_shape;
alter table public.user_saved add constraint user_saved_shape check (
  case when jsonb_typeof(ids) = 'array' then jsonb_array_length(ids) <= 1000 else false end
  and case when jsonb_typeof(tracked) = 'array' then jsonb_array_length(tracked) <= 200 else false end);
alter table public.user_saved drop constraint if exists user_saved_size;
alter table public.user_saved add constraint user_saved_size check (pg_column_size(ids) + pg_column_size(tracked) < 131072);
-- (3) 되돌리기 (필요할 때만 주석을 풀어 실행)
-- alter table public.user_saved drop constraint if exists user_saved_shape;
-- alter table public.user_saved drop constraint if exists user_saved_size;
-- alter table public.user_saved add constraint user_saved_size check (pg_column_size(ids) + pg_column_size(tracked) < 262144);
-- grant select, insert, update, delete on public.user_saved to authenticated;
-- grant select, insert, update, delete on public.user_saved to anon;  -- 이전 상태(Supabase 기본 권한) 복원: 보안상 권하지 않음
