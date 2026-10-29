-- Derived topic/intent metadata only. No visitor text, credentials or addresses.
CREATE TABLE conversation_insights (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  intent text NOT NULL CHECK (intent IN (
    'unknown', 'curiosity', 'technical', 'opportunity', 'business', 'meeting'
  )),
  summary varchar(300) NOT NULL,
  topics text[] NOT NULL DEFAULT '{}'::text[],
  turns integer NOT NULL DEFAULT 1 CHECK (turns > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversation_insights_recent_idx
  ON conversation_insights(updated_at DESC, conversation_id DESC);
