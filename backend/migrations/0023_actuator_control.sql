-- Commands remain disabled until a site-specific safety policy and the
-- equipment command/ACK protocol have been configured and verified.
CREATE TABLE actuator_control_configs (
  device_id uuid PRIMARY KEY REFERENCES devices(id) ON DELETE RESTRICT,
  desired_mode text NOT NULL DEFAULT 'manual'
    CHECK (desired_mode IN ('auto','manual')),
  auto_rule_label text,
  emergency_latched boolean NOT NULL DEFAULT false,
  command_enabled boolean NOT NULL DEFAULT false,
  safety_description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE actuator_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  requested_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('manual','auto')),
  command text NOT NULL CHECK (command IN
    ('turn_on','turn_off','set_manual','set_auto','auto_on','auto_off')),
  status text NOT NULL CHECK (status IN
    ('requested','sent','acknowledged','completed','failed','timeout','blocked')),
  safety_result text,
  safety_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  failure_reason text
);
CREATE INDEX actuator_commands_device_time_idx
  ON actuator_commands (device_id,requested_at DESC);

CREATE TABLE actuator_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,
  command_id uuid REFERENCES actuator_commands(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  pond_id uuid NOT NULL REFERENCES ponds(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  command text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('auto','manual','manual_override')),
  result text NOT NULL CHECK (result IN ('succeeded','failed','blocked')),
  reason text
);
CREATE INDEX actuator_logs_pond_time_idx
  ON actuator_logs (pond_id,at DESC,id DESC);
