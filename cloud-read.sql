-- 可选的只读差量同步接口。现有资料、RLS、录音和写入接口均不改动。
begin;
create or replace function public.lao_sync_index_v1(target_table text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if target_table='lao_dictionary_records' then
  select coalesce(jsonb_agg(jsonb_build_object('owner_id',owner_id,'record_kind',record_kind,'record_id',record_id,'revision',revision) order by record_kind,record_id),'[]'::jsonb) into result from public.lao_dictionary_records where owner_id=uid;
 elsif target_table='lao_learning_records' then
  select coalesce(jsonb_agg(jsonb_build_object('owner_id',owner_id,'record_kind',record_kind,'record_id',record_id,'revision',revision) order by record_kind,record_id),'[]'::jsonb) into result from public.lao_learning_records where owner_id=uid;
 else raise exception 'Invalid sync table'; end if;
 if jsonb_array_length(result)>100000 then raise exception 'Sync index too large'; end if;
 return result;
end;
$$;
create or replace function public.lao_sync_read_v1(target_table text, keys jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if keys is null or jsonb_typeof(keys)<>'array' then raise exception 'Expected keys array'; end if;
 if jsonb_array_length(keys)>100 or octet_length(keys::text)>262144 then raise exception 'Read batch too large'; end if;
 if exists(select 1 from jsonb_array_elements(keys) k where jsonb_typeof(k)<>'object' or jsonb_typeof(k->'record_kind') is distinct from 'string' or jsonb_typeof(k->'record_id') is distinct from 'string' or length(k->>'record_id') not between 1 and 512 or coalesce((k->>'revision')::bigint,0)<1) then raise exception 'Invalid read key'; end if;
 if (select count(*) from jsonb_array_elements(keys))<>(select count(distinct (k->>'record_kind',k->>'record_id')) from jsonb_array_elements(keys) k) then raise exception 'Duplicate read key'; end if;
 if target_table='lao_dictionary_records' then
  select coalesce(jsonb_agg(to_jsonb(r) order by r.record_kind,r.record_id),'[]'::jsonb) into result from public.lao_dictionary_records r join jsonb_array_elements(keys) k on r.record_kind=k->>'record_kind' and r.record_id=k->>'record_id' and r.revision=(k->>'revision')::bigint where r.owner_id=uid;
 elsif target_table='lao_learning_records' then
  select coalesce(jsonb_agg(to_jsonb(r) order by r.record_kind,r.record_id),'[]'::jsonb) into result from public.lao_learning_records r join jsonb_array_elements(keys) k on r.record_kind=k->>'record_kind' and r.record_id=k->>'record_id' and r.revision=(k->>'revision')::bigint where r.owner_id=uid;
 else raise exception 'Invalid sync table'; end if;
 if jsonb_array_length(result)<>jsonb_array_length(keys) then raise exception 'Sync read revision conflict' using errcode='40001'; end if;
 return result;
end;
$$;
revoke all on function public.lao_sync_index_v1(text),public.lao_sync_read_v1(text,jsonb) from public,anon;
grant execute on function public.lao_sync_index_v1(text),public.lao_sync_read_v1(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
