-- Keep farm names unique within a company and record the administrator who last changed a farm.
CREATE UNIQUE INDEX farms_company_name_unique ON farms (company_id, lower(name));
ALTER TABLE farms ADD COLUMN updated_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT;
