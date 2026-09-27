create table public.bridge_community_events (
 id text primary key, payload jsonb not null, starts double precision not null,
 ends double precision not null, token_hash text not null, cancelled boolean not null default false,
 request_hash text unique, body_hash text not null
);
create index bridge_community_events_time on public.bridge_community_events(ends,starts);
alter table public.bridge_community_events enable row level security;
revoke all on public.bridge_community_events from anon, authenticated;
grant all on public.bridge_community_events to service_role;
create function public.bridge_create_event(p_id text,p_payload jsonb,p_starts double precision,p_ends double precision,p_token_hash text,p_request_hash text,p_body_hash text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare previous public.bridge_community_events;
begin
 if p_request_hash is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_request_hash,0));
  select * into previous from public.bridge_community_events where request_hash=p_request_hash;
  if found then
   if previous.body_hash<>p_body_hash then raise exception 'Submission ID reused'; end if;
   return previous.payload;
  end if;
 end if;
 insert into public.bridge_community_events(id,payload,starts,ends,token_hash,request_hash,body_hash)
 values(p_id,p_payload,p_starts,p_ends,p_token_hash,p_request_hash,p_body_hash);
 return p_payload;
end $$;
revoke all on function public.bridge_create_event(text,jsonb,double precision,double precision,text,text,text) from public,anon,authenticated;
grant execute on function public.bridge_create_event(text,jsonb,double precision,double precision,text,text,text) to service_role;
