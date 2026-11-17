-- Migration: Add occupants and occupant_documents tables for simplified check-in with actual persons count and multiple ID uploads

CREATE TABLE IF NOT EXISTS occupants (
  id               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hotel_id         INT UNSIGNED      NOT NULL,
  stay_id          INT UNSIGNED      NOT NULL,
  occupant_number  INT UNSIGNED      NOT NULL DEFAULT 1,
  name             VARCHAR(150)      NULL,
  is_primary       TINYINT(1)        NOT NULL DEFAULT 0,
  guest_id         INT UNSIGNED      NULL,
  created_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_occupants_stay (hotel_id, stay_id),
  KEY ix_occupants_guest (guest_id),
  CONSTRAINT fk_occupants_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  CONSTRAINT fk_occupants_stay  FOREIGN KEY (stay_id)  REFERENCES stays(id)  ON DELETE CASCADE,
  CONSTRAINT fk_occupants_guest FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS occupant_documents (
  id                INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  hotel_id          INT UNSIGNED      NOT NULL,
  occupant_id       INT UNSIGNED      NOT NULL,
  file_path         VARCHAR(255)      NOT NULL,
  original_filename VARCHAR(255)      NOT NULL,
  mime_type         VARCHAR(100)      NOT NULL,
  file_size         INT UNSIGNED      NOT NULL,
  uploaded_at       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_occupant_documents_occupant (occupant_id),
  KEY ix_occupant_documents_hotel (hotel_id),
  CONSTRAINT fk_occupant_documents_hotel    FOREIGN KEY (hotel_id)    REFERENCES hotels(id)    ON DELETE CASCADE,
  CONSTRAINT fk_occupant_documents_occupant FOREIGN KEY (occupant_id) REFERENCES occupants(id) ON DELETE CASCADE
) ENGINE=InnoDB;
