-- Wedding enquiries from arloradford.nz.
--
-- event_date: the day the couple (or an event client) asked about, parsed from
-- the form's free-text date. Kept on the client because the job is only an
-- enquiry; shoot_date on the job is for booked work and puts it on the calendar.
--
-- enquiry_reply: the reply drafted when the enquiry came in (date free or not,
-- prices, $500 to hold the date, two times to meet). Today shows it as a Reply
-- link that opens a prefilled email.
alter table clients add column if not exists event_date date;
alter table clients add column if not exists enquiry_reply text;
