-- retainer pause
--
-- A retainer can be paused without ending it. Team Bainbridge stopped at the
-- end of July 2026, and because the backlog sizes a month with no job at all
-- by the client's monthly volume, every month since read as four videos owed
-- that nobody is paying for.
--
-- retainer_paused_from is the first month NOT owed, stored as the 1st of that
-- month. The content backlog stops counting there. Clear it to resume.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS retainer_paused_from DATE;
