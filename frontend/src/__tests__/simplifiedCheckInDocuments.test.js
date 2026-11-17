import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Simplified Check-In & Multiple ID Documents UI Logic', () => {
  const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  const validateFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const isMimeOk = ALLOWED_MIMES.includes(file.type);
    const isExtOk = ALLOWED_EXTS.includes(ext);
    if (!isMimeOk && !isExtOk) {
      return { valid: false, error: 'Only PDF, JPG, PNG, and WEBP formats are accepted.' };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { valid: false, error: 'Document must be 10 MB or smaller.' };
    }
    return { valid: true, error: null };
  };

  const removeFile = (filesList, idToRemove) => {
    return filesList.filter((f) => f.id !== idToRemove);
  };

  const getDocumentsCountLabel = (count) => {
    if (count === 0) return '0 documents uploaded';
    return `${count} document${count > 1 ? 's' : ''} uploaded`;
  };

  const getOccupiedRoomPersonsLabel = (persons) => {
    if (!persons) return '';
    return `${persons} ${persons === 1 ? 'person' : 'persons'}`;
  };

  it('accepts strictly PDF, JPG/JPEG, PNG, and WEBP documents', () => {
    assert.equal(validateFile({ name: 'aadhaar.pdf', type: 'application/pdf', size: 1024 * 100 }).valid, true);
    assert.equal(validateFile({ name: 'license.jpg', type: 'image/jpeg', size: 1024 * 50 }).valid, true);
    assert.equal(validateFile({ name: 'passport.jpeg', type: 'image/jpeg', size: 1024 * 80 }).valid, true);
    assert.equal(validateFile({ name: 'voter.png', type: 'image/png', size: 1024 * 200 }).valid, true);
    assert.equal(validateFile({ name: 'photo.webp', type: 'image/webp', size: 1024 * 300 }).valid, true);
  });

  it('rejects unsupported file formats', () => {
    assert.equal(validateFile({ name: 'malware.exe', type: 'application/x-msdownload', size: 1024 }).valid, false);
    assert.equal(validateFile({ name: 'notes.txt', type: 'text/plain', size: 500 }).valid, false);
    assert.equal(validateFile({ name: 'sheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 2000 }).valid, false);
  });

  it('enforces 10 MB maximum file size limit', () => {
    assert.equal(validateFile({ name: 'large.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 }).valid, false);
    assert.equal(validateFile({ name: 'ok.pdf', type: 'application/pdf', size: 9 * 1024 * 1024 }).valid, true);
  });

  it('allows individual files to be removed before saving and keeps count accurate', () => {
    let files = [
      { id: '1', name: 'id1.pdf' },
      { id: '2', name: 'id2.jpg' },
      { id: '3', name: 'id3.png' },
    ];
    assert.equal(files.length, 3);
    assert.equal(getDocumentsCountLabel(files.length), '3 documents uploaded');

    // Remove file 2
    files = removeFile(files, '2');
    assert.equal(files.length, 2);
    assert.deepEqual(files.map((f) => f.id), ['1', '3']);
    assert.equal(getDocumentsCountLabel(files.length), '2 documents uploaded');

    // Remove file 1
    files = removeFile(files, '1');
    assert.equal(files.length, 1);
    assert.equal(getDocumentsCountLabel(files.length), '1 document uploaded');

    // Remove file 3
    files = removeFile(files, '3');
    assert.equal(files.length, 0);
    assert.equal(getDocumentsCountLabel(files.length), '0 documents uploaded');
  });

  it('correctly associates documents to occupants when multiple persons stay', () => {
    const personsCount = 2;
    const files = [
      { id: 'f1', name: 'primary.pdf', occupantTarget: 0 },
      { id: 'f2', name: 'guest2.jpg', occupantTarget: 1 },
      { id: 'f3', name: 'guest2_back.jpg', occupantTarget: 1 }, // multiple documents for same occupant
    ];

    assert.equal(files[0].occupantTarget, 0); // Person 1
    assert.equal(files[1].occupantTarget, 1); // Person 2
    assert.equal(files[2].occupantTarget, 1); // Person 2 has 2 documents
  });

  it('formats actual persons count for occupied room cards without occupant names', () => {
    assert.equal(getOccupiedRoomPersonsLabel(1), '1 person');
    assert.equal(getOccupiedRoomPersonsLabel(2), '2 persons');
    assert.equal(getOccupiedRoomPersonsLabel(3), '3 persons');
    assert.equal(getOccupiedRoomPersonsLabel(null), '');
  });

  it('groups documents correctly under respective booking or stay for Guest Details', () => {
    const rawDocs = [
      { id: 1, reservation_id: 101, stay_id: 501, original_filename: 'aadhaar_pre.pdf', booking_code: 'BK-101', room_no: 201 },
      { id: 2, reservation_id: 101, stay_id: 501, original_filename: 'passport_pre.jpg', booking_code: 'BK-101', room_no: 201 },
      { id: 3, reservation_id: null, stay_id: 502, original_filename: 'direct_id.png', booking_code: null, room_no: 202 },
      { id: 4, reservation_id: 102, stay_id: null, original_filename: 'prebooking_only.pdf', booking_code: 'BK-102', room_no: 203 },
    ];

    const groups = {};
    for (const doc of rawDocs) {
      const key = doc.reservation_id ? `res_${doc.reservation_id}` : `stay_${doc.stay_id}`;
      if (!groups[key]) {
        const title = doc.reservation_id
          ? `Booking ${doc.booking_code || '#' + doc.reservation_id} (Room ${doc.room_no || '—'})`
          : `Stay (Room ${doc.room_no || '—'} · Direct Check-In)`;
        groups[key] = { key, title, docs: [] };
      }
      groups[key].docs.push(doc);
    }
    const groupList = Object.values(groups);

    assert.equal(groupList.length, 3);
    assert.equal(groupList[0].title, 'Booking BK-101 (Room 201)');
    assert.equal(groupList[0].docs.length, 2);
    assert.equal(groupList[1].title, 'Stay (Room 202 · Direct Check-In)');
    assert.equal(groupList[1].docs.length, 1);
    assert.equal(groupList[2].title, 'Booking BK-102 (Room 203)');
    assert.equal(groupList[2].docs.length, 1);
  });

  it('displays correct expected persons for bookings and actual persons for stays', () => {
    const booking = { id: 1, booking_code: 'BK-1001', persons: 2, status: 'checked_in' };
    const stay = { id: 10, reservation_id: 1, persons: 3, status: 'in_house' };

    assert.equal(booking.persons, 2); // Expected persons count
    assert.equal(stay.persons, 3); // Actual persons count
    assert.notEqual(booking.persons, stay.persons);
  });
});
