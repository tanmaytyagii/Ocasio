-- Server-side session payloads are private; only an opaque signed ID leaves the API.
CREATE TABLE app_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX app_sessions_expiry ON app_sessions(expire);
