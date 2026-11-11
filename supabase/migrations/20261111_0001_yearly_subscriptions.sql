-- Yearly subscriptions
--
-- The list only knew monthly bills: an amount per month and a day of the
-- month. A domain renews once a year, so a subscription now has a period.
--
-- A yearly one renews on a month and a day. Both are optional together: a
-- subscription can be added before Arlo has told Tui when it renews, and the
-- panel then shows it as "Yearly" with no date until he does.
--
-- The amount stays "NZD per period, as charged", so a yearly one holds the
-- yearly figure. The panel counts a twelfth of it in the monthly total.

alter table subscriptions add column if not exists period text not null default 'month';
alter table subscriptions add column if not exists renew_month smallint;
alter table subscriptions alter column day drop not null;

alter table subscriptions add constraint subscriptions_period_check check (period in ('month', 'year'));
alter table subscriptions add constraint subscriptions_renew_month_check check (renew_month is null or renew_month between 1 and 12);
alter table subscriptions add constraint subscriptions_renewal_check check (
  (period = 'month' and day is not null and renew_month is null)
  or (period = 'year' and ((day is null) = (renew_month is null)))
);

-- Affordable Domains, NZD 115.95 a year. No renewal date given yet.
insert into subscriptions (name, amount, period, note)
select 'Affordable Domains', 115.95, 'year', 'Domain renewal'
where not exists (select 1 from subscriptions where name = 'Affordable Domains');
