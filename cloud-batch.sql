-- 可选加速接口：在现有 Supabase SQL Editor 执行一次。
-- 先有 supabase-init.sql 和 learning-cloud.sql；本脚本不清空、不迁移资料。
-- 每批最多 100 条，一批内若任何版本不符，整批回滚。
begin;
create or replace function public.lao_sync_batch_v1(target_table text, changes jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 uid uuid := auth.uid(); item jsonb; expected bigint; result jsonb := '[]'::jsonb;
 dictionary_row public.lao_dictionary_records%rowtype;
 learning_row public.lao_learning_records%rowtype;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if target_table not in ('lao_dictionary_records','lao_learning_records') or target_table is null then raise exception 'Invalid sync table'; end if;
 if changes is null or jsonb_typeof(changes)<>'array' then raise exception 'Expected changes array'; end if;
 if jsonb_array_length(changes)>100 or octet_length(changes::text)>2097152 then raise exception 'Batch too large'; end if;
 if (select count(*) from jsonb_array_elements(changes)) <>
    (select count(distinct (v->>'record_kind',v->>'record_id')) from jsonb_array_elements(changes) as e(v)) then raise exception 'Duplicate batch identity'; end if;
 -- Deterministic locking order reduces deadlocks between two updated devices.
 for item in select v from jsonb_array_elements(changes) as e(v) order by v->>'record_kind',v->>'record_id' loop
  if jsonb_typeof(item)<>'object' or not (item ? 'expected_revision')
     or jsonb_typeof(item->'payload') is distinct from 'object'
     or jsonb_typeof(item->'record_kind') is distinct from 'string'
     or jsonb_typeof(item->'record_id') is distinct from 'string'
     or length(item->>'record_id') not between 1 and 512 then raise exception 'Invalid batch record'; end if;
  expected := (item->>'expected_revision')::bigint;
  if expected is not null and expected<1 then raise exception 'Invalid revision'; end if;
  if target_table='lao_dictionary_records' then
   if jsonb_typeof(item->'deleted') is distinct from 'boolean' then raise exception 'Expected deletion marker'; end if;
   if expected is null then
    insert into public.lao_dictionary_records(owner_id,record_kind,record_id,payload,deleted)
    values(uid,item->>'record_kind',item->>'record_id',item->'payload',(item->>'deleted')::boolean) returning * into dictionary_row;
   else
    update public.lao_dictionary_records set payload=item->'payload',deleted=(item->>'deleted')::boolean
    where owner_id=uid and record_kind=item->>'record_kind' and record_id=item->>'record_id' and revision=expected returning * into dictionary_row;
    if not found then raise exception 'Sync revision conflict' using errcode='40001'; end if;
   end if;
   result := result || jsonb_build_array(to_jsonb(dictionary_row));
  else
   if item->'payload'->>'id' is distinct from item->>'record_id' then raise exception 'Learning identity mismatch'; end if;
   if expected is null then
    insert into public.lao_learning_records(owner_id,record_kind,record_id,payload)
    values(uid,item->>'record_kind',item->>'record_id',item->'payload') returning * into learning_row;
   else
    update public.lao_learning_records set payload=item->'payload'
    where owner_id=uid and record_kind=item->>'record_kind' and record_id=item->>'record_id' and revision=expected returning * into learning_row;
    if not found then raise exception 'Sync revision conflict' using errcode='40001'; end if;
   end if;
   result := result || jsonb_build_array(to_jsonb(learning_row));
  end if;
 end loop;
 return result;
end;
$$;
revoke all on function public.lao_sync_batch_v1(text,jsonb) from public,anon;
grant execute on function public.lao_sync_batch_v1(text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
