CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE meeting_proposals (
  id uuid PRIMARY KEY, token_hash char(64) NOT NULL,
  name varchar(120) NOT NULL, email varchar(254) NOT NULL, topic varchar(1000) NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, time_zone text NOT NULL,
  consent_version varchar(80) NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  consumed_at timestamptz, meeting_id uuid, CHECK (ends_at > starts_at)
);
CREATE TABLE meetings (
  id uuid PRIMARY KEY, proposal_id uuid NOT NULL UNIQUE REFERENCES meeting_proposals(id),
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED','CONFIRMED','CANCELLED','FAILED')),
  name varchar(120) NOT NULL, email varchar(254) NOT NULL, topic varchar(1000) NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, time_zone text NOT NULL,
  token_hash char(64) NOT NULL, consent_version varchar(80) NOT NULL, consented_at timestamptz NOT NULL,
  idempotency_hash char(64) NOT NULL UNIQUE, request_hash char(64) NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  reserved_start timestamptz, reserved_end timestamptz,
  approved_by uuid REFERENCES auth_users(id), external_event_id text,
  calendar_lease_id uuid, calendar_lease_until timestamptz,
  calendar_cancelled_at timestamptz, failure_code text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at), CHECK ((reserved_start IS NULL) = (reserved_end IS NULL)),
  CHECK (status NOT IN ('APPROVED','CONFIRMED') OR (reserved_start IS NOT NULL AND reserved_end > reserved_start)),
  EXCLUDE USING gist (tstzrange(reserved_start, reserved_end, '[)') WITH &&) WHERE (reserved_start IS NOT NULL)
);
ALTER TABLE meeting_proposals ADD CONSTRAINT meeting_proposals_meeting_fk FOREIGN KEY (meeting_id) REFERENCES meetings(id);
CREATE INDEX meetings_admin_cursor ON meetings(created_at DESC,id DESC);
CREATE INDEX meetings_retention ON meetings(updated_at) WHERE status IN ('REJECTED','CANCELLED','FAILED');
CREATE INDEX meeting_proposals_expiration ON meeting_proposals(expires_at);
CREATE TABLE meeting_audit (
  id uuid PRIMARY KEY, meeting_id uuid NOT NULL REFERENCES meetings(id), actor_id uuid REFERENCES auth_users(id),
  action text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL
);
CREATE TABLE meeting_outbox (
  id uuid PRIMARY KEY, meeting_id uuid NOT NULL REFERENCES meetings(id),
  kind text NOT NULL CHECK (kind IN ('CALENDAR_CREATE','CALENDAR_CANCEL','NOTIFY_REQUESTED','NOTIFY_APPROVED','NOTIFY_REJECTED','NOTIFY_CONFIRMED','NOTIFY_CANCELLED','NOTIFY_FAILED','NOTIFY_REMINDER')),
  version integer NOT NULL, available_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0,
  leased_by uuid, locked_until timestamptz, processed_at timestamptz, last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(meeting_id,kind,version)
);
CREATE INDEX meeting_outbox_pending ON meeting_outbox(available_at,created_at) WHERE processed_at IS NULL;
