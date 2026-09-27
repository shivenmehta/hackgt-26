-- Private server-owned planner state. No client-role grants or policies.
create table public.planner_jobs (
 id uuid primary key default gen_random_uuid(), owner_hash text not null,
 request_hash text not null, idempotency_key text not null,
 status text not null default 'queued' check (status in ('queued','running','ready','failed')),
 stage text not null default 'Queued', error text, preferences jsonb not null,
 week_start text not null, snapshot jsonb, plan jsonb,
 version integer not null default 1, images_done boolean not null default false,
 workflow_id text, created_at timestamptz not null default now(),
 unique(owner_hash,idempotency_key)
);
create index planner_jobs_owner_created on public.planner_jobs(owner_hash,created_at desc);
create table public.planner_cache (key text primary key,value jsonb not null,expires_at timestamptz not null);
create index planner_cache_expiry on public.planner_cache(expires_at);
create table public.planner_limits (key text primary key,window_start timestamptz not null,count integer not null);
alter table public.planner_jobs enable row level security;
alter table public.planner_cache enable row level security;
alter table public.planner_limits enable row level security;
revoke all on public.planner_jobs,public.planner_cache,public.planner_limits from anon,authenticated;
grant all on public.planner_jobs,public.planner_cache,public.planner_limits to service_role;
-- Atomic admission combines idempotency and rate limiting before paid work begins.
create function public.planner_admit(p_owner text,p_key text,p_hash text,p_preferences jsonb,p_week text,p_ip text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare existing public.planner_jobs; counter integer; result public.planner_jobs; k text;
begin
 perform pg_advisory_xact_lock(hashtextextended('planner-admission',0));
 select * into existing from public.planner_jobs where owner_hash=p_owner and idempotency_key=p_key;
 if found then
   if existing.request_hash<>p_hash then raise exception 'Idempotency key reused with different preferences'; end if;
   return jsonb_build_object('job',to_jsonb(existing),'created',false);
 end if;
 foreach k in array array['owner:'||p_owner,'ip:'||p_ip,'global'] loop
  insert into public.planner_limits(key,window_start,count) values(k,date_trunc('hour',now()),1)
  on conflict(key) do update set count=case when planner_limits.window_start<date_trunc('hour',now()) then 1 else planner_limits.count+1 end,window_start=date_trunc('hour',now())
  returning count into counter;
  if counter > (case when k='global' then 30 else 5 end) then raise exception 'Planner rate limit reached'; end if;
 end loop;
 if exists(select 1 from public.planner_jobs where owner_hash=p_owner and status in ('queued','running') and created_at>now()-interval '2 hours') then raise exception 'A plan is already running'; end if;
 insert into public.planner_jobs(owner_hash,idempotency_key,request_hash,preferences,week_start) values(p_owner,p_key,p_hash,p_preferences,p_week) returning * into result;
 return jsonb_build_object('job',to_jsonb(result),'created',true);
end $$;
revoke all on function public.planner_admit(text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.planner_admit(text,text,text,jsonb,text,text) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('planner-images','planner-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
