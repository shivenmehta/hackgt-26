alter table public.planner_jobs drop constraint planner_jobs_status_check;
alter table public.planner_jobs add constraint planner_jobs_status_check check(status in ('queued','running','ready','failed','cancelled'));
