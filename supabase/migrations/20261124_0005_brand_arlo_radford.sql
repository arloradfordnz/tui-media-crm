-- ── Brand: 'personal' becomes 'arlo_radford' ────────────────────────────────
-- Arlo trades under two names: Tui Media (social content, events) and Arlo
-- Radford (weddings, testimonials, brand films, commercial). The column has
-- existed since migration_video_ads.sql with 'personal' as the second option;
-- it is now named for the brand the client actually sees.
--
-- Only what the client sees changes (portal, emails, PDFs, proposal pages via
-- lib/brand.ts). Legally it is one party, and invoices still come from the
-- Tui Media Xero account.

update clients set brand = 'arlo_radford' where brand = 'personal';
update jobs    set brand = 'arlo_radford' where brand = 'personal';

-- Anything else (there was nothing else live) reads as the default brand.
update clients set brand = 'tui_media' where brand is null or brand not in ('tui_media', 'arlo_radford');

-- jobs.brand is an override: null means "use the client's brand". Until now it
-- was filled with 'tui_media' by default on every insert, which would pin every
-- job to Tui Media and stop a client's brand switch reaching that job's
-- documents. Nothing ever set it on purpose (no form or tool writes it), so
-- every existing value is that default and is cleared.
alter table jobs alter column brand drop default;
update jobs set brand = null where brand = 'tui_media';

alter table clients drop constraint if exists clients_brand_check;
alter table clients add  constraint clients_brand_check check (brand in ('tui_media', 'arlo_radford'));
alter table jobs    drop constraint if exists jobs_brand_check;
alter table jobs    add  constraint jobs_brand_check    check (brand is null or brand in ('tui_media', 'arlo_radford'));
