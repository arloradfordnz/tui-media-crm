-- application fields as bands
--
-- The enquiry form on tuimedia.nz stopped asking for money as free text and
-- now offers bands ("$1k to $5k"), and gained "What are you after?". The
-- numeric customer_value and ad_spend_budget stay, because the new-job form
-- and Insights read them, but a band cannot be recovered from a number, so the
-- answer as given is kept alongside.

alter table clients add column if not exists interest            text;
alter table clients add column if not exists customer_value_band text;
alter table clients add column if not exists ad_spend_band       text;
