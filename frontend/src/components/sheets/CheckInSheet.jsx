import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import ReferredBySelect from '../ReferredBySelect.jsx';
import { useGuestLookup } from '../../api/guests';
import { useDirectCheckIn } from '../../api/stays';
import { useCheckInReservation, useRecordAdvancePayment, useReservationDocuments, useReservations } from '../../api/reservations';
import { useRooms, useHousekeepingAction } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../../context/ToastContext.jsx';
import { fetchOccupantDocumentBlob } from '../../api/occupantDocuments';
import { addDaysIso, estimateGstRate, formatGstBreakup, fd, formatCheckoutHour, inr, todayIso } from '../../lib/format';
import { validatePhone, isValidPhone, handlePhoneInputChange, cleanPhone10 } from '../../lib/validation.js';

const IDS = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport'];
const ADVANCE_REQUIRED_MSG = 'Please enter and collect the advance amount before check-in.';

/**
 * Handles both "free room tapped" direct check-in and "guest came" from a pending
 * booking (reservation prop set) — the latter always checks in as of today, per the
 * business rule, regardless of the booking's original arrival date.
 */
export default function CheckInSheet({ room, reservation, onClose, triggerAdvanceError = false }) {
  const isFromReservation = !!reservation;
  const { data: settings } = useSettings();
  const toast = useToast();
  const directCheckIn = useDirectCheckIn();
  const checkInFromReservation = useCheckInReservation();
  const recordAdvance = useRecordAdvancePayment();

  const initialPaid = Number(reservation?.advance_paid ?? 0);
  const [confirmedAdvance, setConfirmedAdvance] = useState(initialPaid);

  const { data: roomsData } = useRooms();
  const { data: allReservations = [] } = useReservations();
  const hkAction = useHousekeepingAction();
  const currentRoom = room || roomsData?.rooms.find((r) => r.id === reservation?.room_id);
  const isRoomOccupied = currentRoom?.status === 'occupied';
  const hkStatus = currentRoom?.housekeepingStatus || currentRoom?.housekeeping_status || reservation?.housekeeping_status || 'ok';
  const isRoomReady = hkStatus === 'ok';
  const isRoomMaintenance = hkStatus === 'repair';
  const isRoomNotReady = !isRoomReady && !isRoomMaintenance;
  const [serverRoomError, setServerRoomError] = useState('');

  const roomNo = room?.roomNo ?? reservation?.room_no;
  const roomTypeName = room?.roomType?.name ?? reservation?.room_type_name ?? '';

  const roomReadinessError = serverRoomError || (
    isRoomOccupied
      ? `Room ${roomNo} is already occupied by another active stay. Complete the previous checkout before assigning this room.`
      : isRoomMaintenance
        ? `Room ${roomNo} is under maintenance. Check-in is blocked until repairs are completed.`
        : isRoomNotReady
          ? `Room ${roomNo} is not ready (cleaning in progress). Check-in is blocked until housekeeping marks the room ready.`
          : ''
  );

  useEffect(() => {
    if (isRoomReady && !isRoomOccupied && serverRoomError) {
      setServerRoomError('');
    }
  }, [isRoomReady, isRoomOccupied, serverRoomError]);

  const roomMaxPersons = room?.roomType?.maxPersons
    ?? room?.roomType?.max_persons
    ?? room?.max_persons
    ?? reservation?.max_persons
    ?? (reservation?.persons ? Math.max(2, Number(reservation.persons)) : 2);

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: isFromReservation
      ? {
          phone: reservation.guest_phone,
          name: reservation.guest_name,
          idType: 'Aadhaar',
          idNo: '',
          city: '',
          persons: reservation.persons,
          days: Math.max(1, Math.round((new Date(reservation.check_out_date) - new Date(reservation.check_in_date)) / 86400000)),
          rate: reservation.rate,
          advance: initialPaid > 0 ? initialPaid : '',
          pay: reservation.advance_method || 'cash',
        }
      : {
          phone: '',
          name: '',
          idType: 'Aadhaar',
          idNo: '',
          city: '',
          persons: 1,
          days: 1,
          rate: room?.roomType?.rate ?? 0,
          advance: '',
          pay: 'cash',
        },
  });

  const phone = watch('phone');
  const name = watch('name');
  const days = watch('days');
  const rate = watch('rate');
  const advance = watch('advance');
  const persons = watch('persons');
  const pay = watch('pay');
  const [phoneError, setPhoneError] = useState('');

  const onPhoneChange = (e) => {
    const res = handlePhoneInputChange(e.target.value, phone || '');
    setValue('phone', res.value, { shouldValidate: true });
    setPhoneError(res.error);
  };

  const initialPersonsCount = isFromReservation
    ? Math.max(1, Math.min(Number(roomMaxPersons) || 2, Number(reservation.persons) || 1))
    : 1;

  const [occupants, setOccupants] = useState(() => {
    const list = [];
    for (let i = 0; i < initialPersonsCount; i++) {
      if (i === 0) {
        list.push({
          name: isFromReservation ? (reservation.guest_name || '') : '',
          gender: '',
          phone: isFromReservation ? (reservation.guest_phone || '') : '',
        });
      } else {
        list.push({ name: '', gender: '', phone: '' });
      }
    }
    return list;
  });

  const [occupantErrors, setOccupantErrors] = useState({});

  // Keep direct check-in primary guest fields and occupant 1 synced
  useEffect(() => {
    if (!isFromReservation) {
      setOccupants((prev) => {
        if (!prev.length) {
          return [{ name: name || '', gender: '', phone: phone || '' }];
        }
        const first = prev[0];
        if (first.name !== (name || '') || first.phone !== (phone || '')) {
          const next = [...prev];
          next[0] = { ...first, name: name || '', phone: phone || '' };
          return next;
        }
        return prev;
      });
    }
  }, [name, phone, isFromReservation]);

  const handleOccupantFieldChange = (index, field, value) => {
    setOccupants((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], [field]: value };
      }
      return next;
    });

    if (occupantErrors[index]?.[field]) {
      setOccupantErrors((prev) => {
        const next = { ...prev };
        if (next[index]) {
          next[index] = { ...next[index], [field]: null };
        }
        return next;
      });
    }

    if (!isFromReservation && index === 0) {
      if (field === 'name') setValue('name', value);
      if (field === 'phone') setValue('phone', value);
    }
  };

  const handlePersonsChange = (newCount) => {
    setServerPersonsError('');
    const num = Number(newCount);

    if (isNaN(num) || num < 1 || !Number.isInteger(num)) {
      setServerPersonsError('Actual persons count must be a positive whole number.');
      return;
    }

    if (roomMaxPersons != null && num > Number(roomMaxPersons)) {
      setServerPersonsError(`Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.`);
      return;
    }

    const currentCount = occupants.length;
    if (num === currentCount) return;

    if (num < currentCount) {
      setOccupants((prev) => prev.slice(0, num));
      setValue('persons', num);
      setOccupantErrors((prev) => {
        const next = { ...prev };
        for (let i = num; i < currentCount; i++) {
          delete next[i];
        }
        return next;
      });
      setSelectedFiles((prev) =>
        prev.map((f) => (f.occupantTarget != null && f.occupantTarget >= num ? { ...f, occupantTarget: num === 1 ? 0 : null } : f))
      );
      setPreBookingAssignments((prev) => {
        const next = { ...prev };
        for (const docId in next) {
          if (next[docId] != null && next[docId] >= num) {
            next[docId] = num === 1 ? 0 : null;
          }
        }
        return next;
      });
    } else {
      setOccupants((prev) => {
        const next = [...prev];
        while (next.length < num) {
          next.push({ name: '', gender: '', phone: '' });
        }
        return next;
      });
      setValue('persons', num);
    }
  };

  const [serverPersonsError, setServerPersonsError] = useState('');
  const personCount = occupants.length;
  const isPersonsExceeded = roomMaxPersons != null && personCount > Number(roomMaxPersons);
  const maxPersonsMsg = roomMaxPersons != null ? `Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.` : '';
  const personsError = isPersonsExceeded ? maxPersonsMsg : (serverPersonsError || '');

  const [advanceSubmitted, setAdvanceSubmitted] = useState(triggerAdvanceError);
  const [serverAdvanceError, setServerAdvanceError] = useState('');

  const advNum = advance === '' || advance === null ? 0 : Number(advance);
  const isAdvanceEmptyOrZero = isNaN(advNum) || advNum <= 0;

  // Advance validation:
  // For reservations: must have confirmed successful payment recorded in DB.
  // Typing an amount does NOT clear the error; only successful payment clears it.
  // For direct check-in: advance amount must be > 0 and successfully collected on check-in.
  const advanceError = isFromReservation
    ? (confirmedAdvance <= 0 && (advanceSubmitted || serverAdvanceError || triggerAdvanceError) ? ADVANCE_REQUIRED_MSG : '')
    : ((advanceSubmitted && isAdvanceEmptyOrZero) || serverAdvanceError ? ADVANCE_REQUIRED_MSG : '');

  useEffect(() => {
    if (serverPersonsError && roomMaxPersons != null && personCount <= Number(roomMaxPersons)) {
      setServerPersonsError('');
    }
  }, [personCount, roomMaxPersons, serverPersonsError]);

  const { data: lookup } = useGuestLookup(!isFromReservation ? phone : '');
  const [matchedGuestId, setMatchedGuestId] = useState(null);

  const [bookingSource, setBookingSource] = useState('Social Media');
  const [referredByGuestId, setReferredByGuestId] = useState(null);
  const [otherSource, setOtherSource] = useState('');
  const [sourceError, setSourceError] = useState('');

  const handleSourceChange = (newSource) => {
    setBookingSource(newSource);
    setSourceError('');
    if (newSource !== 'Reference – Existing Member') {
      setReferredByGuestId(null);
    }
    if (newSource !== 'Other') {
      setOtherSource('');
    }
  };

  useEffect(() => {
    if (lookup?.guest) {
      setMatchedGuestId(lookup.guest.id);
      setValue('name', lookup.guest.name);
      if (lookup.guest.idProofType) setValue('idType', lookup.guest.idProofType);
      if (lookup.guest.city) setValue('city', lookup.guest.city);
    } else {
      setMatchedGuestId(null);
    }
  }, [lookup, setValue]);

  const out = addDaysIso(todayIso(), Number(days) || 1);
  const roomAmt = (Number(days) || 1) * (Number(rate) || 0);
  const gstRate = estimateGstRate(Number(rate) || 0, settings?.settings);
  const gst = roomAmt * gstRate;
  const total = roomAmt + gst;
  const adv = isFromReservation ? confirmedAdvance : (Number(advance) || 0);

  const isLateArrival = isFromReservation && (reservation?.check_in_date < todayIso() || reservation?.check_out_date <= todayIso());
  const lateArrivalConflict = isLateArrival
    ? allReservations.find((r) =>
        r.id !== reservation?.id &&
        Number(r.room_id) === Number(reservation?.room_id || currentRoom?.id) &&
        r.status === 'pending' &&
        r.check_in_date < out &&
        todayIso() < r.check_out_date
      )
    : null;

  const { data: preBookingDocs = [] } = useReservationDocuments(isFromReservation ? reservation?.id : null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [preBookingAssignments, setPreBookingAssignments] = useState({});

  useEffect(() => {
    if (isFromReservation && preBookingDocs?.length > 0) {
      setPreBookingAssignments((prev) => {
        const next = { ...prev };
        for (const doc of preBookingDocs) {
          if (next[doc.id] === undefined) {
            next[doc.id] = occupants.length === 1 ? 0 : null;
          }
        }
        return next;
      });
    }
  }, [isFromReservation, preBookingDocs, occupants.length]);

  const getOccupantDocumentCount = (occupantIndex) => {
    let count = 0;
    for (const f of selectedFiles) {
      if (f.occupantTarget === occupantIndex) {
        count++;
      }
    }
    if (isFromReservation && preBookingDocs?.length > 0) {
      for (const doc of preBookingDocs) {
        if (preBookingAssignments[doc.id] === occupantIndex) {
          count++;
        }
      }
    }
    return count;
  };

  const allOccupantsHaveIdProof =
    occupants.length > 0 &&
    occupants.every((_, i) => getOccupantDocumentCount(i) > 0);

  const unassignedFilesCount = occupants.length > 1
    ? selectedFiles.filter((f) => f.occupantTarget == null).length
    : 0;

  const unassignedPreBookingCount = occupants.length > 1 && isFromReservation && preBookingDocs?.length > 0
    ? preBookingDocs.filter((d) => preBookingAssignments[d.id] == null).length
    : 0;

  const allDocumentsAssigned = unassignedFilesCount === 0 && unassignedPreBookingCount === 0;

  const allOccupantsValid =
    occupants.length > 0 &&
    occupants.every((occ) => {
      const nameOk = !!(occ.name && occ.name.trim() !== '');
      const genderOk = !!(occ.gender && ['Male', 'Female', 'Other'].includes(occ.gender));
      const phoneClean = (occ.phone || '').replace(/\D/g, '');
      const phoneOk = phoneClean.length === 10;
      return nameOk && genderOk && phoneOk;
    });

  const isAdvanceValid = isFromReservation
    ? confirmedAdvance > 0
    : Number(advance) > 0 && !!pay;

  const isCapacityValid =
    !isPersonsExceeded &&
    occupants.length >= 1 &&
    (roomMaxPersons == null || occupants.length <= Number(roomMaxPersons));

  const isSourceValid = isFromReservation || (
    (bookingSource !== 'Reference – Existing Member' || (referredByGuestId && referredByGuestId > 0)) &&
    (bookingSource !== 'Other' || !!(otherSource && otherSource.trim()))
  );

  const allMandatoryChecksPassed =
    isRoomReady &&
    !isRoomOccupied &&
    !isRoomMaintenance &&
    isCapacityValid &&
    allOccupantsValid &&
    allOccupantsHaveIdProof &&
    allDocumentsAssigned &&
    isAdvanceValid &&
    isSourceValid &&
    !lateArrivalConflict;

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
    const valid = [];
    let hasInvalid = false;

    for (const f of files) {
      const ext = f.name.split('.').pop().toLowerCase();
      const isMimeOk = allowedMimes.includes(f.type);
      const isExtOk = allowedExts.includes(ext);

      if (!isMimeOk && !isExtOk) {
        hasInvalid = true;
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast(`File "${f.name}" exceeds 10 MB limit.`);
        continue;
      }
      valid.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type || ext,
        occupantTarget: occupants.length === 1 ? 0 : null,
      });
    }

    if (hasInvalid) {
      toast('Some files were skipped. Only PDF, JPG, PNG, and WEBP formats are accepted.');
    }

    if (valid.length > 0) {
      setSelectedFiles((prev) => [...prev, ...valid]);
    }
    e.target.value = '';
  };

  const removeFile = (idToRemove) => {
    setSelectedFiles((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const renderActualPersonsCountField = () => (
    <div className={`f full ${personsError ? 'bad' : ''}`} style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>
          Actual Persons Count <i>*</i>
        </label>
        {roomMaxPersons != null && (
          <span className="muted" style={{ fontSize: 11.5 }}>
            Room Capacity: Max {roomMaxPersons} {Number(roomMaxPersons) === 1 ? 'person' : 'persons'}
          </span>
        )}
      </div>
      <div className="step" style={{ width: '100%', maxWidth: 200 }}>
        <button
          type="button"
          onClick={() => {
            if (occupants.length > 1) {
              handlePersonsChange(occupants.length - 1);
            }
          }}
          disabled={occupants.length <= 1}
          aria-label="Decrease persons count"
        >
          −
        </button>
        <input
          type="number"
          min="1"
          max={roomMaxPersons}
          step="1"
          inputMode="numeric"
          value={occupants.length}
          onKeyDown={(e) => {
            if (['-', '+', '.', 'e', 'E'].includes(e.key)) {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            if (raw === '') return;
            const val = parseInt(raw, 10);
            if (!isNaN(val)) {
              if (roomMaxPersons != null && val > Number(roomMaxPersons)) {
                setServerPersonsError(`Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.`);
                handlePersonsChange(Number(roomMaxPersons));
              } else {
                handlePersonsChange(val);
              }
            }
          }}
          onBlur={(e) => {
            const val = parseInt(e.target.value, 10);
            if (isNaN(val) || val < 1) {
              handlePersonsChange(1);
            } else if (roomMaxPersons != null && val > Number(roomMaxPersons)) {
              handlePersonsChange(Number(roomMaxPersons));
            }
          }}
          style={{ textAlign: 'center', fontWeight: 600 }}
        />
        <button
          type="button"
          onClick={() => {
            if (roomMaxPersons == null || occupants.length < Number(roomMaxPersons)) {
              handlePersonsChange(occupants.length + 1);
            } else {
              setServerPersonsError(`Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.`);
            }
          }}
          disabled={roomMaxPersons != null && occupants.length >= Number(roomMaxPersons)}
          aria-label="Increase persons count"
        >
          +
        </button>
      </div>
      {personsError ? (
        <span className="err" style={{ display: 'block', marginTop: 4 }}>{personsError}</span>
      ) : (roomMaxPersons != null && occupants.length >= Number(roomMaxPersons)) ? (
        <span className="muted" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
          Maximum {roomMaxPersons} {Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.
        </span>
      ) : null}
    </div>
  );

  const renderOccupantDetailsSection = () => (
    <div className="f full" style={{ marginTop: 4, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ margin: 0, fontWeight: 700, fontSize: 13, color: 'var(--color-heading, #30223D)' }}>
          Occupant Details
        </label>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            padding: '2px 8px',
            borderRadius: 12,
            background: 'var(--color-lavender-light, #F1EAF8)',
            color: 'var(--color-primary, #70265F)',
            border: '1px solid var(--color-lavender-border, #EAE4EF)',
          }}
        >
          {occupants.length} {occupants.length === 1 ? 'Person' : 'Persons'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {occupants.map((occ, idx) => {
          const occErr = occupantErrors[idx] || {};
          const isPrimary = idx === 0;

          return (
            <div
              key={idx}
              style={{
                background: 'var(--color-card-secondary, #FAF6FD)',
                border: `1px solid ${Object.keys(occErr).length > 0 ? 'var(--color-danger, #ef4444)' : 'var(--color-lavender-border, #EAE4EF)'}`,
                borderRadius: 8,
                padding: '8px 12px',
                transition: 'border-color 0.2s',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  paddingBottom: 4,
                  borderBottom: '1px solid var(--color-lavender-border, #EAE4EF)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--color-primary, #70265F)',
                      color: '#ffffff',
                      fontSize: 10.5,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {idx + 1}
                  </span>
                  <strong style={{ fontSize: 12.5, color: 'var(--color-heading, #30223D)' }}>
                    Person {idx + 1} {isPrimary ? '(Primary Guest)' : ''}
                  </strong>
                </div>
                {isPrimary && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-primary, #70265F)', background: 'var(--color-lavender-light, #F1EAF8)', padding: '1px 6px', borderRadius: 4 }}>
                    Lead
                  </span>
                )}
              </div>

              {/* Name in a full-width row */}
              <div className={`f full ${occErr.name ? 'bad' : ''}`} style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 11.5, marginBottom: 2 }}>
                  Name <i>*</i>
                </label>
                <input
                  type="text"
                  placeholder={isPrimary ? 'Primary guest full name' : `Person ${idx + 1} full name`}
                  value={occ.name || ''}
                  onChange={(e) => handleOccupantFieldChange(idx, 'name', e.target.value)}
                  style={{ width: '100%', fontSize: 12.5, padding: '5px 8px' }}
                />
                {occErr.name && <span className="err" style={{ fontSize: 11 }}>{occErr.name}</span>}
              </div>

              {/* Gender and Phone Number side by side */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 8,
                }}
              >
                <div className={`f ${occErr.gender ? 'bad' : ''}`} style={{ margin: 0 }}>
                  <label style={{ fontSize: 11.5, marginBottom: 2 }}>
                    Gender <i>*</i>
                  </label>
                  <select
                    value={occ.gender || ''}
                    onChange={(e) => handleOccupantFieldChange(idx, 'gender', e.target.value)}
                    style={{ fontSize: 12.5, padding: '5px 6px' }}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                  {occErr.gender && <span className="err" style={{ fontSize: 11 }}>{occErr.gender}</span>}
                </div>

                <div className={`f ${occErr.phone ? 'bad' : ''}`} style={{ margin: 0 }}>
                  <label style={{ fontSize: 11.5, marginBottom: 2 }}>
                    Phone Number <i>*</i>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile"
                    value={occ.phone || ''}
                    onChange={(e) => {
                      const res = handlePhoneInputChange(e.target.value, occ.phone || '');
                      handleOccupantFieldChange(idx, 'phone', res.value);
                      setOccupantErrors((prev) => ({
                        ...prev,
                        [idx]: { ...(prev[idx] || {}), phone: res.error || null },
                      }));
                    }}
                    style={{ fontSize: 12.5, padding: '5px 8px' }}
                  />
                  {occErr.phone && <span className="err" style={{ fontSize: 11 }}>{occErr.phone}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderGuestIdProofDocsSection = (idPrefix) => (
    <div className="f full" style={{ marginTop: 2, marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Guest ID Proof Documents</label>
        <span className="muted" style={{ fontSize: 12 }}>
          {isFromReservation && preBookingDocs?.length > 0
            ? `${preBookingDocs.length} pre-booking + ${selectedFiles.length} new`
            : (selectedFiles.length === 0
                ? '0 documents uploaded'
                : `${selectedFiles.length} document${selectedFiles.length > 1 ? 's' : ''} uploaded`)}
        </span>
      </div>

      {isFromReservation && preBookingDocs?.length > 0 && (
        <div style={{ marginBottom: 10, padding: '10px 12px', background: 'var(--color-bg-secondary, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-heading)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📎</span> Previously Uploaded (Pre-Booking):
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534' }}>
              Attached ({preBookingDocs.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {preBookingDocs.map((doc) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '5px 8px', background: 'var(--color-surface, #ffffff)', borderRadius: 4, border: '1px solid var(--border, #e2e8f0)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: doc.original_filename?.toLowerCase().endsWith('.pdf') ? '#fee2e2' : '#e0e7ff', color: doc.original_filename?.toLowerCase().endsWith('.pdf') ? '#991b1b' : '#3730a3', textTransform: 'uppercase' }}>
                    {doc.original_filename?.split('.').pop() || 'FILE'}
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={doc.original_filename}>
                    {doc.original_filename}
                  </span>
                  <span className="muted" style={{ fontSize: 11 }}>({formatFileSize(doc.file_size)})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    value={preBookingAssignments[doc.id] ?? ''}
                    onChange={(e) => {
                      const newTarget = e.target.value === '' ? null : Number(e.target.value);
                      setPreBookingAssignments((prev) => ({ ...prev, [doc.id]: newTarget }));
                    }}
                    style={{
                      fontSize: 11.5,
                      padding: '3px 6px',
                      borderRadius: 4,
                      maxWidth: 160,
                      border: preBookingAssignments[doc.id] == null && occupants.length > 1 ? '1px solid #ef4444' : '1px solid var(--border)',
                    }}
                    aria-label="Assign to occupant"
                  >
                    {occupants.length > 1 && <option value="">Select Occupant *</option>}
                    {occupants.map((occ, i) => (
                      <option key={i} value={i}>
                        Person {i + 1} {occ.name ? `(${occ.name})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ fontSize: 11, padding: '2px 8px', height: 'auto', minWidth: 'auto' }}
                    onClick={async () => {
                      try {
                        const { blobUrl } = await fetchOccupantDocumentBlob(doc.id);
                        window.open(blobUrl, '_blank');
                      } catch (err) {
                        toast(err.message || 'Could not load document preview.');
                      }
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Select which occupant each pre-booking document belongs to. You can also upload additional files below.
          </div>
        </div>
      )}

      <div
        style={{
          border: '1.5px dashed var(--color-card-border, #cbd5e1)',
          borderRadius: 8,
          padding: '12px 14px',
          background: 'var(--color-surface, #ffffff)',
          textAlign: 'center',
        }}
      >
        <input
          id={`ci-files-${idPrefix}`}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <label
          htmlFor={`ci-files-${idPrefix}`}
          className="btn sm"
          style={{
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontWeight: 500,
          }}
        >
          <span>📁</span> Select ID Proof Files
        </label>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
          Accepted formats: PDF, JPG, PNG, WEBP (multiple files allowed)
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {selectedFiles.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--border, #e2e8f0)',
                borderRadius: 6,
                fontSize: 12.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    background: item.name.toLowerCase().endsWith('.pdf') ? '#fee2e2' : '#e0e7ff',
                    color: item.name.toLowerCase().endsWith('.pdf') ? '#991b1b' : '#3730a3',
                    fontWeight: 700,
                    fontSize: 10,
                    padding: '2px 5px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                  }}
                >
                  {item.name.split('.').pop()}
                </span>
                <span
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 180,
                  }}
                  title={item.name}
                >
                  {item.name}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>
                  ({formatFileSize(item.size)})
                </span>
              </div>

              <select
                value={item.occupantTarget ?? ''}
                onChange={(e) => {
                  const newTarget = e.target.value === '' ? null : Number(e.target.value);
                  setSelectedFiles((prev) =>
                    prev.map((f) => (f.id === item.id ? { ...f, occupantTarget: newTarget } : f))
                  );
                }}
                style={{
                  fontSize: 11.5,
                  padding: '3px 6px',
                  marginRight: 8,
                  borderRadius: 4,
                  maxWidth: 170,
                  border: item.occupantTarget == null && occupants.length > 1 ? '1px solid #ef4444' : '1px solid var(--border)',
                }}
                aria-label="Assign to occupant"
              >
                {occupants.length > 1 && <option value="">Select Occupant *</option>}
                {occupants.map((occ, i) => (
                  <option key={i} value={i}>
                    Person {i + 1} {occ.name ? `(${occ.name})` : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => removeFile(item.id)}
                className="btn sm text-danger"
                style={{
                  padding: '2px 6px',
                  minWidth: 'auto',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  color: '#ef4444',
                }}
                title="Remove file"
                aria-label={`Remove ${item.name}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ID Proof Verification Checklist */}
      <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--color-card-secondary, #FAF6FD)', borderRadius: 8, border: '1px solid var(--color-lavender-border, #EAE4EF)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Occupant ID Proof Verification Status</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: allOccupantsHaveIdProof ? '#166534' : '#dc2626' }}>
            {occupants.filter((_, i) => getOccupantDocumentCount(i) > 0).length} of {occupants.length} Verified
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {occupants.map((occ, i) => {
            const count = getOccupantDocumentCount(i);
            const hasDoc = count > 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span>
                  <strong>Person {i + 1}</strong> {occ.name ? `(${occ.name})` : ''}:
                </span>
                {hasDoc ? (
                  <span style={{ color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    ✓ {count} ID document{count > 1 ? 's' : ''} attached
                  </span>
                ) : (
                  <span style={{ color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    ✗ Missing ID proof document (Required)
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!allOccupantsHaveIdProof && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
            Every occupant must have at least one valid ID proof document attached before check-in can be confirmed.
          </div>
        )}
      </div>
    </div>
  );

  const handleCollectAdvance = async () => {
    const advVal = Number(advance) || 0;
    if (advVal <= 0) {
      setAdvanceSubmitted(true);
      setServerAdvanceError(ADVANCE_REQUIRED_MSG);
      return;
    }
    try {
      const res = await recordAdvance.mutateAsync({
        id: reservation.id,
        amount: advVal,
        method: pay,
      });
      const paid = Number(res?.advance_paid ?? advVal);
      setConfirmedAdvance(paid);
      setServerAdvanceError('');
      setAdvanceSubmitted(false);
      toast(`Advance payment of ${inr(advVal)} collected successfully.`);
    } catch (err) {
      if (err.fields?.advanceAmount || err.message?.includes('advance') || err.message?.includes('Advance')) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
      } else {
        toast(err.message);
      }
    }
  };

  const onSubmit = async (values) => {
    setAdvanceSubmitted(true);
    if (isRoomOccupied || !isRoomReady) {
      setServerRoomError(roomReadinessError);
      return;
    }
    if (isPersonsExceeded) {
      return;
    }

    // Validate occupant details
    let hasOccErrors = false;
    const occErrors = {};
    occupants.forEach((occ, idx) => {
      const errs = {};
      const trimmedName = (occ.name || '').trim();
      if (!trimmedName) {
        errs.name = 'Name is required.';
        hasOccErrors = true;
      }
      const trimmedGender = (occ.gender || '').trim();
      if (!trimmedGender || !['Male', 'Female', 'Other'].includes(trimmedGender)) {
        errs.gender = 'Gender is required.';
        hasOccErrors = true;
      }
      const occPhoneValidation = validatePhone(occ.phone);
      if (!occPhoneValidation.isValid) {
        errs.phone = occPhoneValidation.error;
        hasOccErrors = true;
      }
      if (Object.keys(errs).length > 0) {
        occErrors[idx] = errs;
      }
    });

    if (hasOccErrors) {
      setOccupantErrors(occErrors);
      toast('Please enter required details for all occupants.');
      return;
    }

    const occPayload = occupants.map((occ, i) => ({
      occupant_number: i + 1,
      name: (occ.name || '').trim(),
      gender: (occ.gender || '').trim(),
      phone: (occ.phone || '').trim(),
    }));

    if (isFromReservation) {
      if (confirmedAdvance <= 0) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
    } else {
      const phoneValidation = validatePhone(values.phone);
      if (!phoneValidation.isValid) {
        setPhoneError(phoneValidation.error);
        return;
      }
      if (bookingSource === 'Reference – Existing Member' && (!referredByGuestId || referredByGuestId <= 0)) {
        setSourceError('Please select an existing member as reference.');
        return;
      }
      if (bookingSource === 'Other' && !otherSource.trim()) {
        setSourceError('Please enter person name for reference.');
        return;
      }
      const advVal = values.advance === '' || values.advance === null ? 0 : Number(values.advance);
      if (isNaN(advVal) || advVal <= 0) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
    }

    try {
      if (isFromReservation) {
        if (selectedFiles.length > 0) {
          const form = new FormData();
          form.append('id', reservation.id);
          form.append('persons', occupants.length);
          form.append('occupants', JSON.stringify(occPayload));
          form.append('verifyDocuments', 'true');
          if (Object.keys(preBookingAssignments).length > 0) {
            form.append('preBookingDocAssignments', JSON.stringify(preBookingAssignments));
          }
          selectedFiles.forEach((item) => {
            form.append('documents[]', item.file);
            form.append('occupantTargets[]', item.occupantTarget ?? '');
          });
          await checkInFromReservation.mutateAsync(form);
        } else {
          await checkInFromReservation.mutateAsync({
            id: reservation.id,
            persons: occupants.length,
            occupants: occPayload,
            verifyDocuments: true,
            preBookingDocAssignments: preBookingAssignments,
          });
        }
        toast(`${reservation.guest_name.split(' ')[0]} checked in to Room ${reservation.room_no}.`);
      } else {
        const advVal = values.advance === '' || values.advance === null ? 0 : Number(values.advance);
        if (selectedFiles.length > 0) {
          const form = new FormData();
          form.append('roomId', room.id);
          form.append('phone', values.phone);
          form.append('name', values.name);
          form.append('idProofType', values.idType);
          form.append('idProofNumber', values.idNo);
          if (values.city) form.append('city', values.city);
          form.append('bookingSource', bookingSource);
          if (bookingSource === 'Reference – Existing Member' && referredByGuestId) {
            form.append('referredByGuestId', referredByGuestId);
          }
          if (bookingSource === 'Other' && otherSource) {
            form.append('otherSource', otherSource.trim());
          }
          form.append('persons', occupants.length);
          form.append('occupants', JSON.stringify(occPayload));
          form.append('verifyDocuments', 'true');
          form.append('days', Number(values.days));
          form.append('rate', Number(values.rate));
          form.append('advanceAmount', advVal);
          form.append('advanceMethod', values.pay);
          selectedFiles.forEach((item) => {
            form.append('documents[]', item.file);
            form.append('occupantTargets[]', item.occupantTarget ?? '');
          });
          await directCheckIn.mutateAsync(form);
        } else {
          await directCheckIn.mutateAsync({
            roomId: room.id,
            phone: values.phone,
            name: values.name,
            idProofType: values.idType,
            idProofNumber: values.idNo,
            city: values.city,
            bookingSource,
            referredByGuestId: bookingSource === 'Reference – Existing Member' ? referredByGuestId : null,
            otherSource: bookingSource === 'Other' ? otherSource.trim() : null,
            persons: occupants.length,
            occupants: occPayload,
            verifyDocuments: true,
            days: Number(values.days),
            rate: Number(values.rate),
            advanceAmount: advVal,
            advanceMethod: values.pay,
          });
        }
        toast(`${values.name} checked in to Room ${room.roomNo}.`);
      }
      onClose();
    } catch (err) {
      if (err.fields?.room || err.fields?.housekeepingStatus || err.message?.includes('not ready') || err.message?.includes('maintenance') || err.message?.includes('already occupied') || err.message?.includes('Complete the previous checkout')) {
        setServerRoomError(err.fields?.room || err.fields?.housekeepingStatus || err.message);
        toast(err.message);
        return;
      }
      if (err.fields?.advanceAmount || err.message?.includes('advance amount before check-in') || err.message?.includes('Advance payment is required') || err.message?.includes('advance')) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
      if (err.fields?.persons || err.message?.includes('allows a maximum of') || err.message?.includes('positive whole number')) {
        setServerPersonsError(err.fields?.persons || err.message);
        return;
      }
      if (err.fields?.occupants || err.message?.includes('Occupant') || err.message?.includes('occupant')) {
        toast(err.fields?.occupants || err.message);
        return;
      }
      toast(err.message);
    }
  };

  const isPending = directCheckIn.isPending || checkInFromReservation.isPending || recordAdvance.isPending;

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        status={isFromReservation ? 'booked' : 'free'}
        badge={roomNo}
        title={isFromReservation ? 'Pre-Check-In Verification' : 'Direct Check-In'}
        subtitle={
          isFromReservation
            ? (roomTypeName ? `${roomTypeName} · Booking ${reservation.booking_code}` : `Booking ${reservation.booking_code}`)
            : roomTypeName
        }
        onClose={onClose}
      />
      <form className="sb" onSubmit={handleSubmit(onSubmit)}>
        {lateArrivalConflict && (
          <div className="f full" style={{ marginBottom: 12 }}>
            <div
              className="warn"
              style={{
                margin: 0,
                borderColor: 'var(--color-danger, #ef4444)',
                background: '#fef2f2',
                color: '#991b1b',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4 }}>
                ⚠️ Late Arrival Booking Conflict Detected
              </strong>
              <div>
                Guest <b>{reservation.guest_name}</b> arrived late. Checking in today until <b>{fd(out)}</b> conflicts with upcoming reservation <b>{lateArrivalConflict.booking_code}</b> ({lateArrivalConflict.guest_name || 'Next Guest'} · {fd(lateArrivalConflict.check_in_date)} to {fd(lateArrivalConflict.check_out_date)}).
              </div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Check-in is blocked. Reception must resolve booking dates or reassign rooms before checking in.
              </div>
            </div>
          </div>
        )}
        {roomReadinessError && (
          <div className="f full" style={{ marginBottom: 12 }}>
            <div
              className="warn"
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                color: isRoomMaintenance ? 'var(--mnt)' : undefined,
                borderColor: isRoomMaintenance ? 'var(--mnt-border)' : undefined,
                background: isRoomMaintenance ? 'var(--mnt-bg)' : undefined,
              }}
            >
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong>Check-in blocked:</strong> {roomReadinessError}
              </div>
              {isRoomNotReady && currentRoom && (
                <button
                  type="button"
                  className="btn go sm"
                  disabled={hkAction.isPending}
                  onClick={async () => {
                    try {
                      await hkAction.mutateAsync({ roomId: currentRoom.id, action: 'ready' });
                      setServerRoomError('');
                      toast(`Room ${roomNo} marked ready.`);
                    } catch (e) {
                      toast(e.message);
                    }
                  }}
                >
                  {hkAction.isPending ? 'Updating…' : 'Mark room ready'}
                </button>
              )}
            </div>
          </div>
        )}
        {isFromReservation ? (
          <div className="fg">
            <div className="f full">
              <div className="warn" style={{ margin: 0 }}>
                Checking in booking <b>{reservation.booking_code}</b> ({reservation.guest_name} · {reservation.guest_phone})
                {reservation.booking_source && (
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    Source: <b>{reservation.booking_source}</b>
                    {reservation.booking_source === 'Reference – Existing Member' && reservation.referred_by_guest_name && (
                      <span> · Referred by <b>{reservation.referred_by_guest_name}</b> ({reservation.referred_by_guest_phone})</span>
                    )}
                    {reservation.booking_source === 'Other' && reservation.other_source && (
                      <span> · Person: <b>{reservation.other_source}</b></span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {renderActualPersonsCountField()}
            {renderOccupantDetailsSection()}
            {renderGuestIdProofDocsSection('res')}
            <div className="f">
              <label htmlFor="ci-rate-res">Rate per day (₹)</label>
              <input id="ci-rate-res" type="number" readOnly value={rate} />
            </div>
            {confirmedAdvance > 0 ? (
              <div className="f full">
                <label>Advance payment</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  <b style={{ color: 'var(--go, #10b981)' }}>✓ {inr(confirmedAdvance)} collected</b>
                  <span className="muted">({(reservation.advance_method || pay || 'cash').toUpperCase()})</span>
                </div>
              </div>
            ) : (
              <>
                <div className={`f full ${advanceError ? 'bad' : ''}`}>
                  <label htmlFor="ci-advance">
                    Advance amount (₹) <i>*</i>
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      id="ci-advance"
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Enter advance amount"
                      style={{ flex: 1 }}
                      {...register('advance')}
                    />
                    <button
                      type="button"
                      className="btn go"
                      disabled={recordAdvance.isPending}
                      onClick={handleCollectAdvance}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {recordAdvance.isPending ? 'Collecting…' : 'Collect advance'}
                    </button>
                  </div>
                  {advanceError && <span className="err">{advanceError}</span>}
                </div>
                <div className="f full">
                  <label>Advance paid by</label>
                  <div className="seg">
                    {['cash', 'upi', 'card'].map((p) => (
                      <button key={p} type="button" aria-pressed={pay === p} onClick={() => setValue('pay', p)}>
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="fg">
            <div className={`f full ${errors.phone || phoneError ? 'bad' : ''}`}>
              <label htmlFor="ci-phone">
                Mobile number <i>*</i>
              </label>
              <input
                id="ci-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10 digits (6-9)"
                autoComplete="off"
                value={phone || ''}
                onChange={onPhoneChange}
              />
              {(phoneError || errors.phone) && <span className="err">{phoneError || 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.'}</span>}
            </div>
            {matchedGuestId && <div className="found f full">Old guest found. Details filled in.</div>}
            <div className={`f full ${errors.name ? 'bad' : ''}`}>
              <label htmlFor="ci-name">
                Guest name <i>*</i>
              </label>
              <input id="ci-name" type="text" {...register('name', { required: true })} />
              {errors.name && <span className="err">Enter guest name.</span>}
            </div>
            <div className="f">
              <label htmlFor="ci-idType">ID proof *</label>
              <select id="ci-idType" {...register('idType')}>
                {IDS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className={`f ${errors.idNo ? 'bad' : ''}`}>
              <label htmlFor="ci-idNo">ID number {!matchedGuestId && <i>*</i>}</label>
              <input
                id="ci-idNo"
                type="text"
                placeholder={matchedGuestId ? 'Already saved' : ''}
                {...register('idNo', { validate: (v) => !!matchedGuestId || (v || '').replace(/\s/g, '').length >= 4 })}
              />
              {errors.idNo && <span className="err">Enter ID number.</span>}
            </div>
            <div className="f">
              <label htmlFor="ci-city">From (city)</label>
              <input id="ci-city" type="text" {...register('city')} />
            </div>
            <div className="f full">
              <label htmlFor="ci-source">Booking source</label>
              <select
                id="ci-source"
                value={bookingSource}
                onChange={(e) => handleSourceChange(e.target.value)}
              >
                <option value="Social Media">Social Media</option>
                <option value="Reference – Existing Member">Reference – Existing Member</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {bookingSource === 'Reference – Existing Member' && (
              <div className={`f full ${sourceError ? 'bad' : ''}`}>
                <label htmlFor="ci-referred-by">
                  Referred By <i>*</i>
                </label>
                <ReferredBySelect
                  id="ci-referred-by"
                  value={referredByGuestId}
                  onChange={(id) => {
                    setReferredByGuestId(id);
                    if (sourceError) setSourceError('');
                  }}
                  excludeGuestId={matchedGuestId}
                  hasError={!!sourceError}
                />
                {sourceError && <span className="err">{sourceError}</span>}
              </div>
            )}
            {bookingSource === 'Other' && (
              <div className={`f full ${sourceError ? 'bad' : ''}`}>
                <label htmlFor="ci-other-source">
                  Person Name <i>*</i>
                </label>
                <input
                  id="ci-other-source"
                  type="text"
                  placeholder="Enter person name"
                  value={otherSource}
                  onChange={(e) => {
                    setOtherSource(e.target.value);
                    if (sourceError) setSourceError('');
                  }}
                />
                {sourceError && <span className="err">{sourceError}</span>}
              </div>
            )}
            {renderActualPersonsCountField()}
            {renderOccupantDetailsSection()}
            {renderGuestIdProofDocsSection('dir')}
            <div className="f">
              <label>Days *</label>
              <div className="step">
                <button
                  type="button"
                  onClick={() => setValue('days', Math.max(1, (Number(days) || 1) - 1), { shouldValidate: true })}
                  disabled={(Number(days) || 1) <= 1}
                  aria-label="Less"
                >
                  −
                </button>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  onKeyDown={(e) => {
                    if (['-', '+', '.', 'e', 'E'].includes(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  {...register('days', {
                    min: 1,
                    onChange: (e) => {
                      const raw = e.target.value.replace(/[^0-9]/g, '');
                      if (raw === '') return;
                      const val = parseInt(raw, 10);
                      if (!isNaN(val) && val >= 1) {
                        setValue('days', val, { shouldValidate: true });
                      }
                    },
                    onBlur: (e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isNaN(val) || val < 1) {
                        setValue('days', 1, { shouldValidate: true });
                      } else {
                        setValue('days', val, { shouldValidate: true });
                      }
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setValue('days', (Number(days) || 1) + 1, { shouldValidate: true })}
                  aria-label="More"
                >
                  +
                </button>
              </div>
            </div>
            <div className="f">
              <label htmlFor="ci-rate">Rate per day (₹) *</label>
              <input id="ci-rate" type="number" min="0" step="any" {...register('rate', { required: true, min: 1 })} />
            </div>
            <div className={`f ${advanceError ? 'bad' : ''}`}>
              <label htmlFor="ci-advance">
                Advance paid (₹) <i>*</i>
              </label>
              <input
                id="ci-advance"
                type="number"
                min="0"
                step="any"
                placeholder="0"
                {...register('advance')}
              />
              {advanceError && <span className="err">{advanceError}</span>}
            </div>
            <div className="f full">
              <label>Advance paid by</label>
              <div className="seg">
                {['cash', 'upi', 'card'].map((p) => (
                  <button key={p} type="button" aria-pressed={pay === p} onClick={() => setValue('pay', p)}>
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <table className="bill">
          <tbody>
            <tr>
              <td>
                {days || 1} day{(Number(days) || 1) > 1 ? 's' : ''} × {inr(rate)} <span className="muted">(leaves {fd(out)}, {formatCheckoutHour(settings?.settings?.checkout_hour)})</span>
              </td>
              <td>{inr(roomAmt)}</td>
            </tr>
            <tr className="sub">
              <td>GST {Math.round(gstRate * 100)}% <span className="muted" style={{ fontSize: 12 }}>({formatGstBreakup(gstRate)})</span></td>
              <td>{inr(gst)}</td>
            </tr>
            <tr className="tot">
              <td>Total</td>
              <td>{inr(total)}</td>
            </tr>
            <tr className="sub">
              <td>Advance</td>
              <td>−{inr(adv)}</td>
            </tr>
            <tr className="bal">
              <td>Balance at check-out</td>
              <td>{inr(Math.max(0, total - adv))}</td>
            </tr>
          </tbody>
        </table>

        <button
          className="btn go big"
          type="submit"
          disabled={isPending || !allMandatoryChecksPassed}
        >
          {isPending
            ? 'Confirming Check-In…'
            : isRoomOccupied
              ? `Room ${roomNo} is occupied`
              : !isRoomReady
                ? `Room ${roomNo} not ready for check-in`
                : lateArrivalConflict
                  ? 'Check-In Blocked · Date Conflict'
                  : !isCapacityValid
                    ? 'Check-In Blocked · Room Capacity Exceeded'
                    : !allOccupantsValid
                      ? 'Confirm Check-In · Complete Occupant Details'
                      : !allOccupantsHaveIdProof
                        ? 'Confirm Check-In · Upload ID Proofs'
                        : !allDocumentsAssigned
                          ? 'Confirm Check-In · Assign All Documents'
                          : !isAdvanceValid
                            ? 'Confirm Check-In · Advance Required'
                            : `Confirm Check-In · Room ${roomNo}`}
        </button>
        {!allMandatoryChecksPassed && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--color-muted, #64748b)', textAlign: 'center' }}>
            Complete all mandatory checks above to enable Confirm Check-In
            {(!allOccupantsValid || !allOccupantsHaveIdProof || !allDocumentsAssigned) && ' (occupant details & ID proofs required)'}
            {!isAdvanceValid && ' (advance payment required)'}
            {lateArrivalConflict && ' (resolve date conflict)'}.
          </div>
        )}
      </form>
    </Sheet>
  );
}
