-- Opt-in reporting; never store visitor chat text in analytics tables.
ALTER TABLE conversations
  ADD COLUMN reports_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN reports_opted_out boolean NOT NULL DEFAULT false;

CREATE TABLE orbe_conversation_reports (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  window_index integer NOT NULL CHECK (window_index BETWEEN 0 AND 90),
  window_start timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  turns integer NOT NULL DEFAULT 0 CHECK (turns >= 0),
  topics text[] NOT NULL DEFAULT '{}',
  projects text[] NOT NULL DEFAULT '{}',
  intent text NOT NULL DEFAULT 'geral'
    CHECK (intent IN ('geral', 'recrutamento', 'contato')),
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  PRIMARY KEY (conversation_id, window_index)
);
CREATE INDEX orbe_reports_due_idx ON orbe_conversation_reports(next_attempt_at, due_at)
  WHERE sent_at IS NULL;

CREATE TABLE orbe_daily_reports (
  report_day date PRIMARY KEY,
  sent_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  locked_until timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text
);
CREATE INDEX orbe_daily_due_idx ON orbe_daily_reports(next_attempt_at)
  WHERE sent_at IS NULL;
