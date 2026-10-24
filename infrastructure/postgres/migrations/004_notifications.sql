CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY,
  outbox_id uuid NOT NULL REFERENCES meeting_outbox(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('smtp', 'telegram')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  lease_token uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outbox_id, channel)
);
CREATE INDEX notification_deliveries_retry_idx ON notification_deliveries(next_attempt_at) WHERE status IN ('PENDING', 'SENDING');
