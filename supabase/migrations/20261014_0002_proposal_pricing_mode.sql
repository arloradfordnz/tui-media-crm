-- proposal pricing mode
--
-- A proposal's price lines were always added into one total. Some deals are the
-- opposite: the client picks ONE package (2 videos a month for $300, or 4 for
-- $500) and can pick again next month, so there is no total to show or to
-- carry onto the job.
--
--   total    lines add up to total_value (the old behaviour, still the default)
--   options  lines are alternatives; total_value is the cheapest as a "from"
--            figure and is never written to the job on acceptance
--
-- price_suffix is what follows each amount, e.g. "a month".

alter table proposals add column if not exists pricing_mode text not null default 'total'
  check (pricing_mode in ('total', 'options'));
alter table proposals add column if not exists price_suffix text;
