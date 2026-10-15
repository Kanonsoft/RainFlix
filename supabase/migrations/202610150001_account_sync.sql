-- Run once in the RainFlix project's SQL Editor. No service-role key is used by the app.
create table if not exists public.rainflix_sync (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_key text not null check (length(record_key) <= 512),
  value jsonb,
  deleted boolean not null default false,
  changed_at bigint not null,
  primary key (user_id, record_key)
);
alter table public.rainflix_sync enable row level security;
revoke all on public.rainflix_sync from anon, authenticated;
grant select, insert, update, delete on public.rainflix_sync to authenticated;
create policy "Users own their sync records" on public.rainflix_sync
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.merge_rainflix_sync(changes jsonb)
returns setof public.rainflix_sync
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 5000
     or octet_length(changes::text) > 4194304 then
    raise exception 'Invalid sync batch';
  end if;
  insert into public.rainflix_sync(user_id, record_key, value, deleted, changed_at)
  select auth.uid(), item->>'record_key', item->'value',
    coalesce((item->>'deleted')::boolean, false), (item->>'changed_at')::bigint
  from jsonb_array_elements(changes) item
  where item->>'record_key' ~ '^(list|recent|watched|progress|settings)/'
    and (item->>'changed_at')::bigint > 0
    and (item->>'changed_at')::bigint <= extract(epoch from now()) * 1000 + 300000
  order by item->>'record_key'
  on conflict (user_id, record_key) do update
    set value = excluded.value, deleted = excluded.deleted, changed_at = excluded.changed_at
    where excluded.changed_at > public.rainflix_sync.changed_at;
  return query select * from public.rainflix_sync where user_id = auth.uid();
end;
$$;
revoke all on function public.merge_rainflix_sync(jsonb) from public, anon;
grant execute on function public.merge_rainflix_sync(jsonb) to authenticated;
