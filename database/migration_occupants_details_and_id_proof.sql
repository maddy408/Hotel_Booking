-- Migration: Add gender and phone to occupants table, make occupant_documents occupant FK SET NULL on delete, and create occupants_documents alias view

ALTER TABLE occupants
  ADD COLUMN gender VARCHAR(20) NULL AFTER name,
  ADD COLUMN phone VARCHAR(30) NULL AFTER gender;

-- Update foreign key constraint to SET NULL on delete so stay documents are never lost if occupants are updated
ALTER TABLE occupant_documents DROP FOREIGN KEY fk_occupant_documents_occupant;
ALTER TABLE occupant_documents ADD CONSTRAINT fk_occupant_documents_occupant FOREIGN KEY (occupant_id) REFERENCES occupants(id) ON DELETE SET NULL;

-- Support occupants_documents name alias
CREATE OR REPLACE VIEW occupants_documents AS SELECT * FROM occupant_documents;
