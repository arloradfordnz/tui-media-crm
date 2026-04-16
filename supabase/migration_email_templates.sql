-- Email Templates table
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  type text unique not null,
  subject text not null,
  body text not null,
  updated_at timestamptz default now()
);

-- RLS
alter table email_templates enable row level security;

create policy "Authenticated users can view email templates"
  on email_templates for select
  to authenticated
  using (true);

create policy "Authenticated users can update email templates"
  on email_templates for update
  to authenticated
  using (true);

create policy "Authenticated users can insert email templates"
  on email_templates for insert
  to authenticated
  with check (true);

create policy "Anon users can read email templates"
  on email_templates for select
  to anon
  using (true);

-- Seed default templates
insert into email_templates (type, subject, body) values
  ('welcome', 'Welcome to Tui Media', E'Welcome to Tui Media! We''re excited to have you on board and looking forward to bringing your vision to life.\n\nWe''ll be in touch shortly to discuss your project and next steps. In the meantime, feel free to reach out if you have any questions.'),
  ('proposal', 'Proposal for {{jobName}} — Tui Media', E'We''ve put together a proposal for {{jobName}}. Click below to view the details and let us know if you''d like to proceed.'),
  ('proposal_accepted', 'Proposal accepted — {{jobName}}', E'{{clientName}} has accepted the proposal for {{jobName}}.\n\nThe job has been moved to Booked status.'),
  ('delivery', 'Your video is ready for review — {{jobName}}', E'Your video for {{jobName}} is ready for review. Use the link below to watch it and share your feedback.'),
  ('revision', 'Revision request received — {{jobName}}', E'Your revision request (round {{round}}) for {{jobName}} has been received.\n\nWe''ll get to work on the changes and send you an updated version soon.'),
  ('approval', 'Delivery approved — {{jobName}}', E'Thank you for approving the delivery for {{jobName}}. We''re glad you''re happy with the result.\n\nYour final files will be prepared and delivered shortly.')
on conflict (type) do nothing;
