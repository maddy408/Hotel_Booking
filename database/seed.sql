-- Tamarind Court Front Desk â€” seed data (local/dev only)
-- Mirrors the prototype's sample data: 1 hotel, 4 room types, 40 rooms,
-- 19 guests, 5 finished stays (bills), 13 in-house stays, 5 bookings.
-- Run after schema.sql. Default login password for every seeded user: Welcome@123

SET NAMES utf8mb4;
USE tamarind_court;

SET @today := CURDATE();
SET @fy := CASE WHEN MONTH(@today) >= 4
  THEN CONCAT(YEAR(@today), '-', RIGHT(YEAR(@today) + 1, 2))
  ELSE CONCAT(YEAR(@today) - 1, '-', RIGHT(YEAR(@today), 2)) END;

-- ---------------------------------------------------------------------------
-- hotel + settings
-- ---------------------------------------------------------------------------
INSERT INTO hotels (id, name, place, address, gstin, phone, email)
VALUES (1, 'Tamarind Court', 'Madurai', '12 Tallakulam Main Road, Madurai, Tamil Nadu', '33AAAAA0000A1Z5', '9800000000', 'frontdesk@tamarindcourt.example');

INSERT INTO settings (hotel_id, gst_slab1_max_rate, gst_slab1_gst_rate, gst_slab2_max_rate, gst_slab2_gst_rate, gst_slab3_gst_rate, tax_extras, checkout_hour, currency, financial_year_start_month, invoice_prefix, booking_prefix, timezone, whatsapp_checkout_template)
VALUES (1, 1000.00, 0.0000, 7500.00, 0.0500, 0.1800, 0, 12, 'INR', 4, 'INV', 'BK', 'Asia/Kolkata', 'Dear {guest_name}, thank you for choosing {hotel_name}. Your checkout for Room {room_no} is scheduled for today by {checkout_time}. Please visit the front desk for bill settlement. Have a pleasant journey! Call {hotel_phone} for assistance.');

-- ---------------------------------------------------------------------------
-- roles + users (password for all: Welcome@123)
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, code, name) VALUES
  (1, 'admin', 'Administrator'),
  (2, 'manager', 'Manager'),
  (3, 'receptionist', 'Receptionist'),
  (4, 'housekeeping', 'Housekeeping');

INSERT INTO users (hotel_id, role_id, name, username, email, phone, password_hash) VALUES
  (1, 1, 'Admin',              'admin',        'admin@tamarindcourt.example',        '9800000001', '$2y$10$S8.3Cu8TzmrOE44g/9UaEehdKvtezirZVIm2.CM6hyVq/WPAd6hAe'),
  (1, 2, 'Meena Krishnan',     'manager',      'manager@tamarindcourt.example',      '9800000002', '$2y$10$S8.3Cu8TzmrOE44g/9UaEehdKvtezirZVIm2.CM6hyVq/WPAd6hAe'),
  (1, 3, 'Ravi Shankar',       'receptionist', 'receptionist@tamarindcourt.example', '9800000003', '$2y$10$S8.3Cu8TzmrOE44g/9UaEehdKvtezirZVIm2.CM6hyVq/WPAd6hAe'),
  (1, 4, 'Housekeeping Staff', 'housekeeping', 'housekeeping@tamarindcourt.example', '9800000004', '$2y$10$S8.3Cu8TzmrOE44g/9UaEehdKvtezirZVIm2.CM6hyVq/WPAd6hAe');

-- ---------------------------------------------------------------------------
-- room types
-- ---------------------------------------------------------------------------
INSERT INTO room_types (hotel_id, code, name, rate, max_persons) VALUES
  (1, 'STD', 'Standard', 2200.00, 2),
  (1, 'DLX', 'Deluxe',   3500.00, 2),
  (1, 'FAM', 'Family',   4800.00, 4),
  (1, 'STE', 'Suite',    8500.00, 3);

-- ---------------------------------------------------------------------------
-- rooms â€” 4 floors x 10 rooms. Positions 1-5 STD, 6-8 DLX, 9 FAM, 10 STE.
-- ---------------------------------------------------------------------------
INSERT INTO rooms (hotel_id, room_no, floor, room_type_id, housekeeping_status, note)
SELECT 1, f.floor * 100 + p.pos, f.floor,
       (SELECT id FROM room_types WHERE hotel_id = 1 AND code = CASE WHEN p.pos <= 5 THEN 'STD' WHEN p.pos <= 8 THEN 'DLX' WHEN p.pos = 9 THEN 'FAM' ELSE 'STE' END),
       CASE WHEN f.floor * 100 + p.pos IN (105, 202, 306) THEN 'cleaning'
            WHEN f.floor * 100 + p.pos = 407 THEN 'repair'
            ELSE 'ok' END,
       CASE WHEN f.floor * 100 + p.pos = 407 THEN 'AC not cooling. Technician coming at 4 pm.' ELSE NULL END
FROM (SELECT 1 AS floor UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) f
CROSS JOIN (SELECT 1 AS pos UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
            UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) p
ORDER BY f.floor, p.pos;

-- ---------------------------------------------------------------------------
-- guests (inserted in this exact order so gi 0..18 == id 1..19)
-- ---------------------------------------------------------------------------
INSERT INTO guests (hotel_id, name, phone, id_proof_type, id_proof_last4, city) VALUES
  (1, 'Karthik Ramasamy',   '9843011872', 'Aadhaar',          '4821', 'Chennai'),       -- 1
  (1, 'Priya Sundaram',     '9443320591', 'Aadhaar',          '7310', 'Coimbatore'),    -- 2
  (1, 'Arjun Mehta',        '9820155410', 'Driving Licence',  '2290', 'Mumbai'),        -- 3
  (1, 'Lakshmi Narayanan',  '9994703168', 'Aadhaar',          '6604', 'Madurai'),       -- 4
  (1, 'Fatima Begum',       '9003177825', 'Voter ID',         '1187', 'Trichy'),        -- 5
  (1, 'Daniel Joseph',      '9447061239', 'Passport',         '5532', 'Kochi'),         -- 6
  (1, 'Meera Iyer',         '9845032716', 'Aadhaar',          '9045', 'Bengaluru'),     -- 7
  (1, 'Suresh Pandian',     '9787740213', 'Aadhaar',          '3378', 'Tirunelveli'),   -- 8
  (1, 'Ananya Rao',         '9989015824', 'Passport',         '8812', 'Hyderabad'),     -- 9
  (1, 'Vikram Singh',       '9811047790', 'Driving Licence',  '4436', 'Delhi'),         -- 10
  (1, 'Kavitha Murugan',    '9600982145', 'Aadhaar',          '2059', 'Salem'),         -- 11
  (1, 'Rahul Verma',        '9822063391', 'Aadhaar',          '7781', 'Pune'),          -- 12
  (1, 'Divya Krishnan',     '9444018267', 'Aadhaar',          '6123', 'Chennai'),       -- 13
  (1, 'Nithya Balaji',      '9894522671', 'Aadhaar',          '5190', 'Madurai'),       -- 14
  (1, 'Imran Khan',         '9962048817', 'Driving Licence',  '6675', 'Vellore'),       -- 15
  (1, 'Rajesh Kannan',      '9842267310', 'Aadhaar',          '3391', 'Theni'),         -- 16
  (1, 'Sangeetha Vel',      '9790145528', 'Aadhaar',          '8076', 'Sivakasi'),      -- 17
  (1, 'Mohamed Ali',        '9443871204', 'Voter ID',         '2614', 'Ramanathapuram'),-- 18
  (1, 'Gowri Shankar',      '9367720195', 'Aadhaar',          '4470', 'Karaikudi');     -- 19

-- ---------------------------------------------------------------------------
-- finished stays (bills) â€” status checked_out
-- ---------------------------------------------------------------------------
-- #1 Room 204, Karthik Ramasamy, 12->10 days ago, 2 nights, STD, extra Food 860
INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status, payment_method)
VALUES (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=204), (SELECT id FROM guests WHERE phone='9843011872'),
        2, 2200.00, DATE_ADD(@today, INTERVAL -12 DAY), DATE_ADD(@today, INTERVAL -10 DAY), DATE_ADD(@today, INTERVAL -10 DAY), 'checked_out', 'upi');
SET @s1 := LAST_INSERT_ID();
INSERT INTO stay_charges (stay_id, label, amount, is_taxable) VALUES (@s1, 'Food', 860.00, 0);
INSERT INTO payments (hotel_id, stay_id, type, amount, method) VALUES (1, @s1, 'advance', 2200.00, 'upi'), (1, @s1, 'balance', 3280.00, 'upi');
INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, sequence_no, room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount, total_amount, advance_paid, balance_amount)
VALUES (1, @s1, CONCAT('INV-', @fy, '-0001'), @fy, 1, 4400.00, 0.0500, 220.00, 860.00, 0.00, 110.00, 110.00, 5480.00, 2200.00, 0.00);

-- #2 Room 309, Lakshmi Narayanan, 8->6 days ago, 2 nights, FAM, no extras
INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status, payment_method)
VALUES (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=309), (SELECT id FROM guests WHERE phone='9994703168'),
        4, 4800.00, DATE_ADD(@today, INTERVAL -8 DAY), DATE_ADD(@today, INTERVAL -6 DAY), DATE_ADD(@today, INTERVAL -6 DAY), 'checked_out', 'upi');
SET @s2 := LAST_INSERT_ID();
INSERT INTO payments (hotel_id, stay_id, type, amount, method) VALUES (1, @s2, 'advance', 4800.00, 'upi'), (1, @s2, 'balance', 5280.00, 'upi');
INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, sequence_no, room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount, total_amount, advance_paid, balance_amount)
VALUES (1, @s2, CONCAT('INV-', @fy, '-0002'), @fy, 2, 9600.00, 0.0500, 480.00, 0.00, 0.00, 240.00, 240.00, 10080.00, 4800.00, 0.00);

-- #3 Room 110, Meera Iyer, 5->3 days ago, 2 nights, STE, extra Laundry 240
INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status, payment_method)
VALUES (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=110), (SELECT id FROM guests WHERE phone='9845032716'),
        2, 8500.00, DATE_ADD(@today, INTERVAL -5 DAY), DATE_ADD(@today, INTERVAL -3 DAY), DATE_ADD(@today, INTERVAL -3 DAY), 'checked_out', 'upi');
SET @s3 := LAST_INSERT_ID();
INSERT INTO stay_charges (stay_id, label, amount, is_taxable) VALUES (@s3, 'Laundry', 240.00, 0);
INSERT INTO payments (hotel_id, stay_id, type, amount, method) VALUES (1, @s3, 'advance', 8500.00, 'upi'), (1, @s3, 'balance', 11800.00, 'upi');
INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, sequence_no, room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount, total_amount, advance_paid, balance_amount)
VALUES (1, @s3, CONCAT('INV-', @fy, '-0003'), @fy, 3, 17000.00, 0.1800, 3060.00, 240.00, 0.00, 1530.00, 1530.00, 20300.00, 8500.00, 0.00);

-- #4 Room 105, Nithya Balaji, 2->0 days ago, 2 nights, STD, extra Food 420
INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status, payment_method)
VALUES (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=105), (SELECT id FROM guests WHERE phone='9894522671'),
        1, 2200.00, DATE_ADD(@today, INTERVAL -2 DAY), @today, @today, 'checked_out', 'upi');
SET @s4 := LAST_INSERT_ID();
INSERT INTO stay_charges (stay_id, label, amount, is_taxable) VALUES (@s4, 'Food', 420.00, 0);
INSERT INTO payments (hotel_id, stay_id, type, amount, method) VALUES (1, @s4, 'advance', 2200.00, 'upi'), (1, @s4, 'balance', 2840.00, 'upi');
INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, sequence_no, room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount, total_amount, advance_paid, balance_amount)
VALUES (1, @s4, CONCAT('INV-', @fy, '-0004'), @fy, 4, 4400.00, 0.0500, 220.00, 420.00, 0.00, 110.00, 110.00, 5040.00, 2200.00, 0.00);

-- #5 Room 202, Imran Khan, 1->0 days ago, 1 night, STD, no extras
INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, checkout_actual, status, payment_method)
VALUES (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=202), (SELECT id FROM guests WHERE phone='9962048817'),
        2, 2200.00, DATE_ADD(@today, INTERVAL -1 DAY), @today, @today, 'checked_out', 'upi');
SET @s5 := LAST_INSERT_ID();
INSERT INTO payments (hotel_id, stay_id, type, amount, method) VALUES (1, @s5, 'advance', 2200.00, 'upi'), (1, @s5, 'balance', 110.00, 'upi');
INSERT INTO invoices (hotel_id, stay_id, invoice_number, financial_year, sequence_no, room_amount, gst_rate, room_gst_amount, extras_amount, extras_gst_amount, cgst_amount, sgst_amount, total_amount, advance_paid, balance_amount)
VALUES (1, @s5, CONCAT('INV-', @fy, '-0005'), @fy, 5, 2200.00, 0.0500, 110.00, 0.00, 0.00, 55.00, 55.00, 2310.00, 2200.00, 0.00);

-- ---------------------------------------------------------------------------
-- in-house stays (status in_house) â€” 13 rooms currently occupied
-- ---------------------------------------------------------------------------
INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status, payment_method) VALUES
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=102), (SELECT id FROM guests WHERE phone='9843011872'), 2, 2200.00, DATE_ADD(@today, INTERVAL -2 DAY), DATE_ADD(@today, INTERVAL 1 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=104), (SELECT id FROM guests WHERE phone='9443320591'), 1, 2200.00, DATE_ADD(@today, INTERVAL -1 DAY), @today,                            'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=106), (SELECT id FROM guests WHERE phone='9820155410'), 2, 3500.00, DATE_ADD(@today, INTERVAL -3 DAY), @today,                            'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=109), (SELECT id FROM guests WHERE phone='9994703168'), 4, 4800.00, DATE_ADD(@today, INTERVAL -1 DAY), DATE_ADD(@today, INTERVAL 2 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=110), (SELECT id FROM guests WHERE phone='9003177825'), 3, 8500.00, DATE_ADD(@today, INTERVAL -2 DAY), DATE_ADD(@today, INTERVAL 2 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=203), (SELECT id FROM guests WHERE phone='9447061239'), 2, 2200.00, DATE_ADD(@today, INTERVAL -4 DAY), DATE_ADD(@today, INTERVAL 1 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=207), (SELECT id FROM guests WHERE phone='9845032716'), 2, 3500.00, @today,                            DATE_ADD(@today, INTERVAL 3 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=208), (SELECT id FROM guests WHERE phone='9787740213'), 2, 3500.00, DATE_ADD(@today, INTERVAL -1 DAY), @today,                            'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=301), (SELECT id FROM guests WHERE phone='9989015824'), 1, 2200.00, DATE_ADD(@today, INTERVAL -2 DAY), DATE_ADD(@today, INTERVAL 3 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=305), (SELECT id FROM guests WHERE phone='9811047790'), 1, 2200.00, DATE_ADD(@today, INTERVAL -1 DAY), DATE_ADD(@today, INTERVAL 1 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=310), (SELECT id FROM guests WHERE phone='9600982145'), 2, 8500.00, DATE_ADD(@today, INTERVAL -3 DAY), DATE_ADD(@today, INTERVAL 2 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=402), (SELECT id FROM guests WHERE phone='9822063391'), 2, 2200.00, DATE_ADD(@today, INTERVAL -1 DAY), DATE_ADD(@today, INTERVAL 4 DAY), 'in_house', 'cash'),
  (1, (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=406), (SELECT id FROM guests WHERE phone='9444018267'), 2, 3500.00, DATE_ADD(@today, INTERVAL -2 DAY), DATE_ADD(@today, INTERVAL 1 DAY), 'in_house', 'cash');

-- extras for the in-house stays that had them in the prototype
INSERT INTO stay_charges (stay_id, label, amount, is_taxable)
SELECT id, 'Food', 640.00, 0 FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=102) AND status='in_house';
INSERT INTO stay_charges (stay_id, label, amount, is_taxable)
SELECT id, 'Laundry', 180.00, 0 FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=104) AND status='in_house';
INSERT INTO stay_charges (stay_id, label, amount, is_taxable)
SELECT id, 'Food', 1420.00, 0 FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=106) AND status='in_house';
INSERT INTO stay_charges (stay_id, label, amount, is_taxable)
SELECT id, 'Taxi', 900.00, 0 FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=203) AND status='in_house';
INSERT INTO stay_charges (stay_id, label, amount, is_taxable)
SELECT id, 'Food', 520.00, 0 FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=208) AND status='in_house';
INSERT INTO stay_charges (stay_id, label, amount, is_taxable)
SELECT id, 'Laundry', 310.00, 0 FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=406) AND status='in_house';

-- advance payments for in-house stays (room 110 was overpaid 17000; room 208 had 0 advance)
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 2200.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=102) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 2200.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=104) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 3500.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=106) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 4800.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=109) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 17000.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=110) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 2200.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=203) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 3500.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=207) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 0.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=208) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 2200.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=301) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 2200.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=305) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 8500.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=310) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 2200.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=402) AND status='in_house';
INSERT INTO payments (hotel_id, stay_id, type, amount, method)
SELECT 1, id, 'advance', 3500.00, 'cash' FROM stays WHERE room_id=(SELECT id FROM rooms WHERE hotel_id=1 AND room_no=406) AND status='in_house';

-- ---------------------------------------------------------------------------
-- bookings (pending reservations)
-- ---------------------------------------------------------------------------
INSERT INTO reservations (hotel_id, booking_code, room_id, guest_id, check_in_date, check_out_date, persons, rate, advance_amount, advance_method, status) VALUES
  (1, 'BK-1001', (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=103), (SELECT id FROM guests WHERE phone='9842267310'), @today,                          DATE_ADD(@today, INTERVAL 2 DAY), 2, 2200.00, 1000.00, 'cash', 'pending'),
  (1, 'BK-1002', (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=209), (SELECT id FROM guests WHERE phone='9790145528'), @today,                          DATE_ADD(@today, INTERVAL 1 DAY), 4, 4800.00, 0.00,    'cash', 'pending'),
  (1, 'BK-1003', (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=108), (SELECT id FROM guests WHERE phone='9443871204'), DATE_ADD(@today, INTERVAL 1 DAY), DATE_ADD(@today, INTERVAL 3 DAY), 2, 3500.00, 2000.00, 'cash', 'pending'),
  (1, 'BK-1004', (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=302), (SELECT id FROM guests WHERE phone='9367720195'), DATE_ADD(@today, INTERVAL 3 DAY), DATE_ADD(@today, INTERVAL 5 DAY), 1, 2200.00, 500.00,  'cash', 'pending'),
  (1, 'BK-1005', (SELECT id FROM rooms WHERE hotel_id=1 AND room_no=110), (SELECT id FROM guests WHERE phone='9845032716'), DATE_ADD(@today, INTERVAL 4 DAY), DATE_ADD(@today, INTERVAL 6 DAY), 2, 8500.00, 5000.00, 'cash', 'pending');

INSERT INTO payments (hotel_id, reservation_id, type, amount, method)
SELECT 1, id, 'advance', advance_amount, advance_method FROM reservations WHERE advance_amount > 0;
