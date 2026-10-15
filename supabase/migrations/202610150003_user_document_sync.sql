-- Run once after migrations 001 and 002. Existing app RPC responses stay compatible.
-- The old table is retained as an inaccessible backup until migration is verified.
begin;

drop function public.merge_rainflix_sync(jsonb);
alter table public.rainflix_sync rename to rainflix_sync_legacy;
alter table public.rainflix_sync_legacy rename constraint rainflix_sync_pkey to rainflix_sync_legacy_pkey;
revoke all on public.rainflix_sync_legacy from public, anon, authenticated;

create table public.rainflix_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  records jsonb not null default '{}'::jsonb check (jsonb_typeof(records) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.rainflix_sync enable row level security;
revoke all on public.rainflix_sync from public, anon, authenticated;
grant select, insert, update, delete on public.rainflix_sync to authenticated;
create policy "Users own their sync document" on public.rainflix_sync
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into public.rainflix_sync(user_id, records)
select legacy.user_id, jsonb_object_agg(legacy.record_key, jsonb_build_object(
  'record_key', legacy.record_key, 'value', legacy.value,
  'deleted', legacy.deleted, 'changed_at', legacy.changed_at
))
from public.rainflix_sync_legacy legacy group by legacy.user_id;

create function public.merge_rainflix_sync(changes jsonb)
returns table(user_id uuid, record_key text, value jsonb, deleted boolean, changed_at bigint)
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  document jsonb;
  item jsonb;
  item_key text;
  revision bigint;
begin
  if owner_id is null then raise exception 'Authentication required'; end if;
  if changes is null or jsonb_typeof(changes) <> 'array'
     or jsonb_array_length(changes) > 5000 or octet_length(changes::text) > 4194304 then
    raise exception 'Invalid sync batch';
  end if;
  insert into public.rainflix_sync(user_id) values(owner_id)
    on conflict on constraint rainflix_sync_pkey do nothing;
  -- Serialize concurrent devices, then merge individual edits inside the one row.
  select profile.records into document from public.rainflix_sync profile
    where profile.user_id = owner_id for update;
  for item in select jsonb_array_elements(changes) loop
    item_key := item->>'record_key';
    revision := (item->>'changed_at')::bigint;
    if item_key ~ '^(list|recent|watched|progress|settings|addons)/'
       and length(item_key) <= 512 and revision > 0
       and revision <= extract(epoch from now()) * 1000 + 300000
       and revision > coalesce((document->item_key->>'changed_at')::bigint, 0) then
      document := jsonb_set(document, array[item_key], jsonb_build_object(
        'record_key', item_key, 'value', item->'value',
        'deleted', coalesce((item->>'deleted')::boolean, false), 'changed_at', revision
      ), true);
    end if;
  end loop;
  update public.rainflix_sync profile set records = document, updated_at = now()
    where profile.user_id = owner_id and profile.records is distinct from document;
  -- Keep the old wire format so installed clients can upgrade independently.
  return query select owner_id, entry.key, entry.value->'value',
    coalesce((entry.value->>'deleted')::boolean, false),
    (entry.value->>'changed_at')::bigint
    from jsonb_each(document) entry;
end;
$$;
revoke all on function public.merge_rainflix_sync(jsonb) from public, anon;
grant execute on function public.merge_rainflix_sync(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
