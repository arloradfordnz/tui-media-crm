-- Index the columns every query in the app actually filters and joins on.
--
-- ── Be honest about what this does and does not buy ───────────────────────
-- Today: close to nothing. The largest table in this database is a few hundred
-- rows, and Postgres will sequentially scan a table that size faster than it
-- can consult an index. Nobody will feel this change. It is NOT the reason the
-- app got faster tonight — that is the region move in vercel.json, which took
-- every query from a trans-Pacific round trip to a same-datacentre one.
--
-- So why do it:
--
--  1. Postgres does not index foreign keys for you. Every `client_id`,
--     `job_id` and `deliverable_id` in this schema was unindexed, which also
--     makes ON DELETE CASCADE expensive: deleting one client makes the planner
--     seq-scan every child table looking for rows to remove, and this schema
--     cascades four levels deep (clients → jobs → deliverables →
--     delivery_files).
--
--  2. activities, email_logs and notifications are append-only. They only ever
--     grow, and they are already the three biggest tables here. The cost of
--     not having these indexes rises every day; the cost of having them, at
--     this size, is a few kilobytes.
--
-- Composite ordering follows the queries that exist today: the equality column
-- first, then whatever the query orders by, so the index can satisfy both.
-- Partial indexes where the query only ever asks about one value, because an
-- index of the rows you actually look at is smaller than one of every row.
--
-- Plain CREATE INDEX, not CONCURRENTLY: the runner puts each migration in a
-- transaction (CONCURRENTLY cannot run in one), and locking tables this size
-- is measured in microseconds.

-- ── jobs: the list, the client record, the attention model ────────────────
create index if not exists jobs_client_id_idx      on jobs (client_id);
create index if not exists jobs_status_idx         on jobs (status);
create index if not exists jobs_shoot_date_idx     on jobs (shoot_date desc nulls last);
create index if not exists jobs_updated_at_idx     on jobs (updated_at);

-- ── job children: all keyed off job_id ────────────────────────────────────
create index if not exists job_tasks_job_id_idx        on job_tasks (job_id);
create index if not exists job_tasks_due_open_idx      on job_tasks (due_date) where completed = false;
create index if not exists deliverables_job_id_idx     on deliverables (job_id);
create index if not exists delivery_files_deliverable_idx on delivery_files (deliverable_id);
create index if not exists revisions_job_id_idx        on revisions (job_id);
create index if not exists revisions_deliverable_idx   on revisions (deliverable_id);
create index if not exists proposals_job_id_idx        on proposals (job_id);
-- The attention model asks for sent-and-unanswered proposals and nothing else.
create index if not exists proposals_awaiting_idx      on proposals (sent_at) where status = 'sent' and responded_at is null;

-- ── clients: the list filters on these, the attention model on the pair ───
create index if not exists clients_status_idx          on clients (status);
create index if not exists clients_category_idx        on clients (client_category);
create index if not exists clients_stage_updated_idx   on clients (pipeline_stage, updated_at);

-- ── the append-only logs, newest-first in every query that reads them ─────
create index if not exists activities_client_created_idx on activities (client_id, created_at desc);
create index if not exists activities_job_created_idx    on activities (job_id, created_at desc);
create index if not exists notifications_unread_idx      on notifications (created_at desc) where read = false;
create index if not exists notifications_created_idx     on notifications (created_at desc);

-- ── everything else that carries a foreign key ────────────────────────────
create index if not exists documents_client_updated_idx on documents (client_id, updated_at desc);
create index if not exists events_date_idx              on events (date);
create index if not exists events_job_id_idx            on events (job_id);
create index if not exists files_client_id_idx          on files (client_id);
create index if not exists todos_open_idx               on todos (sort_order, created_at) where completed = false;
create index if not exists todos_job_idx                on todos (linked_job_id);
create index if not exists todos_client_idx             on todos (linked_client_id);
create index if not exists template_tasks_template_idx        on template_tasks (template_id);
create index if not exists template_deliverables_template_idx on template_deliverables (template_id);

-- Fresh statistics so the planner actually knows these exist.
analyze;
