-- The retainer target: how many videos a retainer client is owed each
-- calendar month, however many shoots that takes.
--
-- `shoots_per_month` already existed, but it answers a different question —
-- how often Arlo goes out to film, for booking the shoot calendar — and nothing
-- stored the actual number of videos promised. The content backlog
-- (lib/content-backlog.ts) had to guess it from whichever month-named job was
-- most recently set up, so a month scoped light (three videos instead of four,
-- say because one was combined or deferred) quietly became the new "typical"
-- for every month after it, including ones that don't exist yet.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS videos_per_month integer;

-- Team Bainbridge's actual retainer is four videos a month. July only had
-- three deliverables set up (one combined into another job), and with no
-- stored target the backlog picked that up as the new normal. Set explicitly
-- so it stops drifting off whatever month happened to run last.
UPDATE clients SET videos_per_month = 4 WHERE name = 'Team Bainbridge';
