-- Tamarind Court: Prevent duplicate active stays for the same room
-- Adds a virtual generated column active_room_id that is room_id when status = 'in_house', else NULL
-- Since UNIQUE constraints in MySQL allow multiple NULLs, this enforces at most one 'in_house' stay per room.
USE tamarind_court;

ALTER TABLE stays
  ADD COLUMN active_room_id INT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status = 'in_house' THEN room_id ELSE NULL END) VIRTUAL,
  ADD UNIQUE KEY uq_stays_active_room (active_room_id);

