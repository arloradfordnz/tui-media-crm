-- Fix email_logs.client_id / job_id foreign keys so deleting a client or job
-- doesn't fail because of historical email logs. Without this, deleting a
-- client throws: "update or delete on table \"clients\" violates foreign key
-- constraint \"email_logs_client_id_fkey\" on table \"email_logs\"".
--
-- Also add UPDATE/DELETE RLS policies so app-level cleanup works without
-- needing the service-role key.

-- 1. Replace the client_id FK with ON DELETE SET NULL
alter table email_logs drop constraint if exists email_logs_client_id_fkey;
alter table email_logs
  add constraint email_logs_client_id_fkey
  foreign key (client_id) references clients(id) on delete set null;

-- 2. Same for job_id (same issue would bite when deleting jobs)
alter table email_logs drop constraint if exists email_logs_job_id_fkey;
alter table email_logs
  add constraint email_logs_job_id_fkey
  foreign key (job_id) references jobs(id) on delete set null;

-- 3. Authenticated users can update/delete email logs (needed so the admin
--    dashboard can null refs during cleanup without the service-role key).
drop policy if exists "Authenticated users can update email logs" on email_logs;
create policy "Authenticated users can update email logs"
  on email_logs for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete email logs" on email_logs;
create policy "Authenticated users can delete email logs"
  on email_logs for delete
  to authenticated
  using (true);
