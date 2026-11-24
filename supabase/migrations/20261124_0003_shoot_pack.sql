-- Shoot-day pack.
--
-- The page for a shoot (/dashboard/shoots/<event id>) gathers the address,
-- contact, brief and recent client emails, and can write a shot list from
-- them. The shot list is saved on the shoot's event so it is there the next
-- morning without asking Claude again, and can be edited by hand.
alter table events add column if not exists shot_list text;
alter table events add column if not exists shot_list_at timestamptz;
