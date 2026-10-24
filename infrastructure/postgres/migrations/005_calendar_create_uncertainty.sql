ALTER TABLE meetings
  ADD COLUMN calendar_create_uncertain boolean NOT NULL DEFAULT false;

-- Previous API/worker versions may already have attempted an external create.
-- Preserve uncertainty for active reservations without verified event identity.
UPDATE meetings
SET calendar_create_uncertain = true
WHERE reserved_start IS NOT NULL
  AND external_event_id IS NULL
  AND status IN ('APPROVED', 'FAILED', 'CANCELLED');
