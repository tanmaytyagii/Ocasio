CREATE TABLE coverage_markets (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  mode text NOT NULL DEFAULT 'research' CHECK (mode = 'research'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Coverage records describe intended markets, never live service inventory.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  topic text NOT NULL,
  operation_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}',
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON outbox_events (available_at, created_at) WHERE state='pending';

CREATE TABLE job_receipts (
  event_id uuid PRIMARY KEY REFERENCES outbox_events(id),
  handler text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
