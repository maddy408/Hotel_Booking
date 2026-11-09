-- Migration: Daily Operations & Check-in WhatsApp Support
-- Adds check-in WhatsApp template and enabled flag to settings
USE tamarind_court;

ALTER TABLE settings ADD COLUMN whatsapp_checkin_template TEXT NULL AFTER whatsapp_checkout_template;
ALTER TABLE settings ADD COLUMN whatsapp_checkin_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER whatsapp_checkin_template;

