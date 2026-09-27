-- Remove hourly admission caps; retain idempotency and active-job protection.
-- p_ip remains for compatibility with existing callers.
create or replace function public.planner_admit(p_owner text,p_key text,p_hash text,p_preferences jsonb,p_week text,p_ip text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare existing public.planner_jobs; result public.planner_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended('planner-admission',0));
 select * into existing from public.planner_jobs where owner_hash=p_owner and idempotency_key=p_key;
 if found then
   if existing.request_hash<>p_hash then raise exception 'Idempotency key reused with different preferences'; end if;
   return jsonb_build_object('job',to_jsonb(existing),'created',false);
 end if;
 if exists(select 1 from public.planner_jobs where owner_hash=p_owner and status in ('queued','running') and created_at>now()-interval '2 hours') then raise exception 'A plan is already running'; end if;
 insert into public.planner_jobs(owner_hash,idempotency_key,request_hash,preferences,week_start) values(p_owner,p_key,p_hash,p_preferences,p_week) returning * into result;
 return jsonb_build_object('job',to_jsonb(result),'created',true);
end $$;
