CREATE TABLE saved_ports (
  user_id text NOT NULL,
  port_id text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, port_id)
);
