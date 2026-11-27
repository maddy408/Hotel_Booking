import { useEffect, useState, useRef } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { FieldError, FormErrorBanner, FormField, Input, Segmented, Stepper } from '../ui/Field.jsx';
import ReferredBySelect from '../ReferredBySelect.jsx';
import { useGuestLookup } from '../../api/guests';
import { useDirectCheckIn } from '../../api/stays';
import { useCheckInReservation, useRecordAdvancePayment, useReservationDocuments, useReservations } from '../../api/reservations';
import { useRooms, useHousekeepingAction } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../ToastContext.jsx';
import { addDaysIso, estimateGstRate, formatGstBreakup, fd, formatCheckoutHour, inr, todayIso } from '../../lib/format';
import { useFormValidation, validatePhone, isValidPhone, handlePhoneInputChange, cleanPhone10, getIdProofConfig, handleIdNumberInputChange, validateIdNumber } from '../../lib/validation';
import { colors, fonts, radii } from '../../theme/theme';

const IDS = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport'];
const ADVANCE_REQUIRED_MSG = 'Please enter and collect the advance amount before check-in.';

const MIME_EXT_MAP = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

const getMimeType = (filename, fallback) => {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return MIME_EXT_MAP[ext] || fallback || 'image/jpeg';
};

const sanitizeFileName = (name) => {
  return (name || 'document.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
};

const formatFileUri = (rawUri) => {
  let uri = rawUri || '';
  if (Platform.OS === 'android') {
    if (uri.startsWith('file:/') && !uri.startsWith('file:///')) {
      uri = `file:///${uri.replace(/^file:\/*/, '')}`;
    } else if (!uri.startsWith('file://') && !uri.startsWith('content://')) {
      uri = `file://${uri}`;
    }
  }
  return uri;
};

/**
 * Handles both "free room tapped" direct check-in and "guest came" from a pending
 * booking — ported 1:1 from the web's CheckInSheet.jsx business rules. Only the
 * presentation layer (RN views instead of DOM/form elements, DocumentPicker instead
 * of <input type=file>) differs.
 */
const EMPTY_ARRAY = [];

export default function CheckInSheet({ room, reservation, onClose, triggerAdvanceError = false }) {
  const isFromReservation = !!reservation;
  const { data: settings } = useSettings();
  const toast = useToast();
  const directCheckIn = useDirectCheckIn();
  const checkInFromReservation = useCheckInReservation();
  const recordAdvance = useRecordAdvancePayment();

  const scrollRef = useRef(null);
  const {
    errors,
    formError,
    setFormError,
    setErrors,
    setError,
    clearError,
    registerInput,
    registerContainer,
    registerLayout,
    scrollToFirstError,
  } = useFormValidation({
    scrollRef,
    fieldOrder: [
      'room',
      'persons',
      'phone',
      'name',
      'idNo',
      'source',
      'occupants',
      'documents',
      'days',
      'rate',
      'advance',
    ],
  });

  const initialPaid = Number(reservation?.advance_paid ?? 0);
  const [confirmedAdvance, setConfirmedAdvance] = useState(initialPaid);

  const { data: roomsData } = useRooms();
  const { data: allReservations = [] } = useReservations();
  const hkAction = useHousekeepingAction();
  const currentRoom = room || roomsData?.rooms.find((r) => Number(r.id) === Number(reservation?.room_id));
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
    if (isRoomReady && !isRoomOccupied && serverRoomError) setServerRoomError('');
  }, [isRoomReady, isRoomOccupied, serverRoomError]);

  const roomMaxPersons = room?.roomType?.maxPersons
    ?? room?.roomType?.max_persons
    ?? room?.max_persons
    ?? reservation?.max_persons
    ?? (reservation?.persons ? Math.max(2, Number(reservation.persons)) : 2);

  const [phone, setPhone] = useState(isFromReservation ? cleanPhone10(reservation.guest_phone) : '');
  const [name, setName] = useState(isFromReservation ? reservation.guest_name : '');
  const [idType, setIdType] = useState('Aadhaar');
  const [idNo, setIdNo] = useState('');
  const [city, setCity] = useState('');
  const [days, setDays] = useState(
    isFromReservation ? Math.max(1, Math.round((new Date(reservation.check_out_date) - new Date(reservation.check_in_date)) / 86400000)) : 1
  );
  const [rate, setRate] = useState(isFromReservation ? String(reservation.rate) : String(room?.roomType?.rate ?? 0));
  const [advance, setAdvance] = useState(initialPaid > 0 ? String(initialPaid) : '');
  const [pay, setPay] = useState(isFromReservation ? (reservation.advance_method || 'cash') : 'cash');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const initialPersonsCount = isFromReservation
    ? Math.max(1, Math.min(Number(roomMaxPersons) || 2, Number(reservation.persons) || 1))
    : 1;

  const [occupants, setOccupants] = useState(() => {
    const list = [];
    for (let i = 0; i < initialPersonsCount; i++) {
      if (i === 0) {
        list.push({
          name: isFromReservation ? (reservation.guest_name || '') : '',
          gender: 'Male',
          phone: isFromReservation ? cleanPhone10(reservation.guest_phone) : '',
        });
      } else {
        list.push({ name: '', gender: 'Male', phone: '' });
      }
    }
    return list;
  });
  const [occupantErrors, setOccupantErrors] = useState({});

  useEffect(() => {
    if (!isFromReservation) {
      setOccupants((prev) => {
        if (!prev.length) return [{ name: name || '', gender: '', phone: phone || '' }];
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
      if (next[index]) next[index] = { ...next[index], [field]: value };
      return next;
    });
    if (occupantErrors[index]?.[field]) {
      setOccupantErrors((prev) => {
        const next = { ...prev };
        if (next[index]) next[index] = { ...next[index], [field]: null };
        return next;
      });
    }
    if (!isFromReservation && index === 0) {
      if (field === 'name') setName(value);
      if (field === 'phone') setPhone(value);
    }
  };

  const [serverPersonsError, setServerPersonsError] = useState('');

  const handlePersonsChange = (newCount) => {
    setServerPersonsError('');
    const num = Number(newCount);
    if (isNaN(num) || num < 1 || !Number.isInteger(num)) return;
    if (roomMaxPersons != null && num > Number(roomMaxPersons)) {
      setServerPersonsError(`Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.`);
      return;
    }
    const currentCount = occupants.length;
    if (num === currentCount) return;

    if (num < currentCount) {
      setOccupants((prev) => prev.slice(0, num));
      setOccupantErrors((prev) => {
        const next = { ...prev };
        for (let i = num; i < currentCount; i++) delete next[i];
        return next;
      });
      setSelectedFiles((prev) => prev.map((f) => (f.occupantTarget != null && f.occupantTarget >= num ? { ...f, occupantTarget: num === 1 ? 0 : null } : f)));
      setPreBookingAssignments((prev) => {
        const next = { ...prev };
        for (const docId in next) if (next[docId] != null && next[docId] >= num) next[docId] = num === 1 ? 0 : null;
        return next;
      });
    } else {
      setOccupants((prev) => {
        const next = [...prev];
        while (next.length < num) next.push({ name: '', gender: 'Male', phone: '' });
        return next;
      });
    }
  };

  const personCount = occupants.length;
  const isPersonsExceeded = roomMaxPersons != null && personCount > Number(roomMaxPersons);
  const personsError = isPersonsExceeded ? `Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.` : serverPersonsError;

  const [advanceSubmitted, setAdvanceSubmitted] = useState(triggerAdvanceError);
  const [serverAdvanceError, setServerAdvanceError] = useState('');
  const advNum = advance === '' || advance === null ? 0 : Number(advance);
  const isAdvanceEmptyOrZero = isNaN(advNum) || advNum <= 0;
  const isAdvanceExceeded = isFromReservation
    ? (confirmedAdvance > 0 ? confirmedAdvance > total : advNum > total)
    : advNum > total;

  const advanceError = isAdvanceExceeded
    ? 'Advance cannot exceed the total payable amount.'
    : isFromReservation
      ? (confirmedAdvance <= 0 && isAdvanceEmptyOrZero && (advanceSubmitted || serverAdvanceError || triggerAdvanceError) ? ADVANCE_REQUIRED_MSG : (serverAdvanceError || ''))
      : ((advanceSubmitted && isAdvanceEmptyOrZero) || serverAdvanceError ? (serverAdvanceError || ADVANCE_REQUIRED_MSG) : '');

  const { data: lookup } = useGuestLookup(!isFromReservation ? phone : '');
  const [matchedGuestId, setMatchedGuestId] = useState(null);

  const [bookingSource, setBookingSource] = useState('Social Media');
  const [referredByGuestId, setReferredByGuestId] = useState(null);
  const [otherSource, setOtherSource] = useState('');
  const [sourceError, setSourceError] = useState('');

  const handleSourceChange = (newSource) => {
    setBookingSource(newSource);
    setSourceError('');
    if (newSource !== 'Reference – Existing Member') setReferredByGuestId(null);
    if (newSource !== 'Other') setOtherSource('');
  };

  useEffect(() => {
    if (lookup?.guest) {
      setMatchedGuestId(lookup.guest.id);
      setName(lookup.guest.name);
      if (lookup.guest.idProofType) setIdType(lookup.guest.idProofType);
      if (lookup.guest.city) setCity(lookup.guest.city);
    } else {
      setMatchedGuestId(null);
    }
  }, [lookup]);

  const out = addDaysIso(todayIso(), Number(days) || 1);
  const roomAmt = (Number(days) || 1) * (Number(rate) || 0);
  const gstRate = estimateGstRate(Number(rate) || 0, settings?.settings);
  const gst = roomAmt * gstRate;
  const total = roomAmt + gst;
  const adv = isFromReservation ? confirmedAdvance : (Number(advance) || 0);

  const isIdSaved = Boolean(matchedGuestId && lookup?.guest?.idProofType === idType);
  const idConfig = getIdProofConfig(idType);

  const handleIdTypeChange = (newType) => {
    setIdType(newType);
    setIdNo('');
    clearError('idNo');
  };

  const isLateArrival = isFromReservation && (reservation?.check_in_date < todayIso() || reservation?.check_out_date <= todayIso());
  const lateArrivalConflict = isLateArrival
    ? allReservations.find((r) => r.id !== reservation?.id && Number(r.room_id) === Number(reservation?.room_id || currentRoom?.id) && r.status === 'pending' && r.check_in_date < out && todayIso() < r.check_out_date)
    : null;

  const { data: preBookingDocs = EMPTY_ARRAY } = useReservationDocuments(isFromReservation ? reservation?.id : null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [preBookingAssignments, setPreBookingAssignments] = useState({});

  useEffect(() => {
    if (isFromReservation && preBookingDocs.length > 0) {
      setPreBookingAssignments((prev) => {
        let changed = false;
        const next = { ...prev };
        preBookingDocs.forEach((doc, idx) => {
          if (next[doc.id] === undefined) {
            next[doc.id] = idx < occupants.length ? idx : 0;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [isFromReservation, preBookingDocs, occupants.length]);

  const getOccupantDocumentCount = (occupantIndex) => {
    let count = 0;
    for (const f of selectedFiles) if (f.occupantTarget === occupantIndex) count++;
    if (isFromReservation && preBookingDocs?.length > 0) {
      for (const doc of preBookingDocs) if (preBookingAssignments[doc.id] === occupantIndex) count++;
    }
    return count;
  };

  const allOccupantsHaveIdProof = occupants.length > 0 && occupants.every((_, i) => getOccupantDocumentCount(i) > 0);
  const unassignedFilesCount = occupants.length > 1 ? selectedFiles.filter((f) => f.occupantTarget == null).length : 0;
  const unassignedPreBookingCount = occupants.length > 1 && isFromReservation && preBookingDocs?.length > 0 ? preBookingDocs.filter((d) => preBookingAssignments[d.id] == null).length : 0;
  const allDocumentsAssigned = unassignedFilesCount === 0 && unassignedPreBookingCount === 0;

  const allOccupantsValid = occupants.length > 0 && occupants.every((occ) => {
    const nameOk = !!(occ.name && occ.name.trim());
    const genderOk = !!(occ.gender && ['Male', 'Female', 'Other'].includes(occ.gender));
    const phoneClean = cleanPhone10(occ.phone);
    const phoneOk = phoneClean.length === 10;
    return nameOk && genderOk && phoneOk;
  });

  const isAdvanceValid = isFromReservation
    ? (confirmedAdvance > 0 ? confirmedAdvance <= total : (!isAdvanceEmptyOrZero && advNum <= total))
    : (!isAdvanceEmptyOrZero && advNum <= total && !!pay);
  const isCapacityValid = !isPersonsExceeded && occupants.length >= 1 && (roomMaxPersons == null || occupants.length <= Number(roomMaxPersons));
  const isSourceValid = isFromReservation || (
    (bookingSource !== 'Reference – Existing Member' || (referredByGuestId && referredByGuestId > 0)) &&
    (bookingSource !== 'Other' || !!(otherSource && otherSource.trim()))
  );

  const allMandatoryChecksPassed = isRoomReady && !isRoomOccupied && !isRoomMaintenance && isCapacityValid && allOccupantsValid &&
    allOccupantsHaveIdProof && allDocumentsAssigned && isAdvanceValid && isSourceValid && !lateArrivalConflict;

  const pickDocument = async (occupantTarget) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const assets = result.assets || [];
      const overSized = assets.filter((f) => f.size && f.size > 10 * 1024 * 1024);
      if (overSized.length > 0) {
        const msg = 'Document must be 10 MB or smaller.';
        toast(msg);
        Alert.alert('File Too Large', msg);
      }

      const validAssets = assets.filter((f) => !f.size || f.size <= 10 * 1024 * 1024);
      const valid = validAssets.map((f) => {
        const cleanName = sanitizeFileName(f.name);
        const type = getMimeType(cleanName, f.mimeType);
        const uri = formatFileUri(f.uri);

        return {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          uri,
          name: cleanName,
          type,
          size: f.size,
          occupantTarget: occupantTarget != null ? occupantTarget : (occupants.length === 1 ? 0 : null),
        };
      });

      setSelectedFiles((prev) => [...prev, ...valid]);
    } catch (e) {
      toast('Could not pick file: ' + e.message);
    }
  };

  const removeFile = (id) => setSelectedFiles((prev) => prev.filter((f) => f.id !== id));

  const handleCollectAdvance = async () => {
    const advVal = Number(advance) || 0;
    if (advVal <= 0) {
      setAdvanceSubmitted(true);
      setServerAdvanceError(ADVANCE_REQUIRED_MSG);
      return;
    }
    if (advVal > total) {
      const msg = 'Advance cannot exceed the total payable amount.';
      setAdvanceSubmitted(true);
      setServerAdvanceError(msg);
      setError('advance', msg);
      toast(msg);
      return;
    }
    try {
      const res = await recordAdvance.mutateAsync({ id: reservation.id, amount: advVal, method: pay });
      setConfirmedAdvance(Number(res?.advance_paid ?? advVal));
      setServerAdvanceError('');
      setAdvanceSubmitted(false);
      toast(`Advance payment of ${inr(advVal)} collected successfully.`);
    } catch (err) {
      const msg = err.message || ADVANCE_REQUIRED_MSG;
      setServerAdvanceError(msg);
      setError('advance', msg);
      toast(msg);
    }
  };

  const isPending = directCheckIn.isPending || checkInFromReservation.isPending || recordAdvance.isPending;
  const isSubmittingRef = useRef(false);

  const onSubmit = async () => {
    if (isSubmittingRef.current || isPending) return;

    setAdvanceSubmitted(true);
    setPhoneTouched(true);
    setNameTouched(true);

    const validationErrs = {};

    if (lateArrivalConflict) {
      const msg = `Late arrival conflict: Dates overlap with reservation ${lateArrivalConflict.booking_code}. Reception must resolve before check-in.`;
      validationErrs.room = msg;
    } else if (isRoomOccupied || !isRoomReady) {
      const msg = roomReadinessError || 'Room is not ready for check-in.';
      validationErrs.room = msg;
    }

    if (!isCapacityValid || isPersonsExceeded) {
      const msg = `This room allows a maximum of ${roomMaxPersons} persons.`;
      validationErrs.persons = msg;
    }

    if (!isFromReservation) {
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.isValid) {
        validationErrs.phone = phoneValidation.error;
      }
      if (!name.trim()) {
        validationErrs.name = 'Enter guest name.';
      }
      const idValidation = validateIdNumber(idNo, idType, { isOptional: isIdSaved });
      if (!idValidation.isValid) {
        validationErrs.idNo = idValidation.error;
      }
      if (bookingSource === 'Reference – Existing Member' && (!referredByGuestId || referredByGuestId <= 0)) {
        validationErrs.source = 'Please select an existing member as reference.';
      }
      if (bookingSource === 'Other' && !otherSource.trim()) {
        validationErrs.source = 'Please enter person name for reference.';
      }
      const advVal = advance === '' ? 0 : Number(advance);
      if (isNaN(advVal) || advVal <= 0) {
        validationErrs.advance = ADVANCE_REQUIRED_MSG;
      } else if (advVal > total) {
        validationErrs.advance = 'Advance cannot exceed the total payable amount.';
      }
    } else {
      if (confirmedAdvance <= 0) {
        const advVal = Number(advance) || 0;
        if (advVal <= 0) {
          validationErrs.advance = ADVANCE_REQUIRED_MSG;
        } else if (advVal > total) {
          validationErrs.advance = 'Advance cannot exceed the total payable amount.';
        }
      } else if (confirmedAdvance > total) {
        validationErrs.advance = 'Advance cannot exceed the total payable amount.';
      }
    }

    let hasOccErrors = false;
    const occErrors = {};
    occupants.forEach((occ, idx) => {
      const errs = {};
      if (!(occ.name || '').trim()) { errs.name = 'Name is required.'; hasOccErrors = true; }
      if (!['Male', 'Female', 'Other'].includes((occ.gender || '').trim())) { errs.gender = 'Gender is required.'; hasOccErrors = true; }
      if (!validatePhone(occ.phone).isValid) { errs.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.'; hasOccErrors = true; }
      if (Object.keys(errs).length > 0) occErrors[idx] = errs;
    });
    if (hasOccErrors) {
      setOccupantErrors(occErrors);
      validationErrs.occupants = 'Please enter required details (Name, Gender, 10-digit Phone) for all occupants.';
    }

    if (!allOccupantsHaveIdProof) {
      validationErrs.documents = 'Every occupant must have at least one ID proof document attached before check-in can be confirmed.';
    } else if (!allDocumentsAssigned) {
      validationErrs.documents = 'Please assign all uploaded ID proof documents to an occupant.';
    }

    if (Object.keys(validationErrs).length > 0) {
      if (validationErrs.room) setServerRoomError(validationErrs.room);
      if (validationErrs.persons) setServerPersonsError(validationErrs.persons);
      if (validationErrs.source) setSourceError(validationErrs.source);
      if (validationErrs.advance) setServerAdvanceError(validationErrs.advance);
      setErrors(validationErrs);
      scrollToFirstError(validationErrs);

      const topMsg = validationErrs.room || validationErrs.persons || validationErrs.phone || validationErrs.name || validationErrs.idNo || validationErrs.occupants || validationErrs.documents || validationErrs.advance;
      if (topMsg) toast(topMsg);

      if (!hasOccErrors && !validationErrs.phone && !validationErrs.name && !validationErrs.advance && !validationErrs.room && !validationErrs.persons && !allOccupantsHaveIdProof) {
        Alert.alert(
          'ID Proof Required',
          'Every occupant must have at least one ID proof document attached before check-in can be confirmed.',
          [
            { text: 'Upload ID Proof', onPress: () => pickDocument(0) },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
      return;
    }

    const occPayload = occupants.map((occ, i) => ({
      occupant_number: i + 1,
      name: (occ.name || '').trim(),
      gender: (occ.gender || '').trim(),
      phone: cleanPhone10(occ.phone),
    }));

    if (isFromReservation) {
      if (confirmedAdvance <= 0) {
        const advVal = Number(advance) || 0;
        if (advVal > total) {
          const msg = 'Advance cannot exceed the total payable amount.';
          setServerAdvanceError(msg);
          setErrors((p) => ({ ...p, advance: msg }));
          scrollToFirstError({ advance: msg });
          toast(msg);
          Alert.alert('Advance Payment Failed', msg);
          return;
        }
        if (advVal > 0) {
          try {
            const res = await recordAdvance.mutateAsync({ id: reservation.id, amount: advVal, method: pay });
            setConfirmedAdvance(Number(res?.advance_paid ?? advVal));
            setServerAdvanceError('');
          } catch (err) {
            const msg = err.message || ADVANCE_REQUIRED_MSG;
            setServerAdvanceError(msg);
            setErrors((p) => ({ ...p, advance: msg }));
            scrollToFirstError({ advance: msg });
            toast(msg);
            Alert.alert('Advance Payment Failed', msg);
            return;
          }
        }
      }
    }

    isSubmittingRef.current = true;

    try {
      // Ensure all selected files have properly formatted URIs and MIME types
      const readyFiles = selectedFiles.map((item) => {
        const name = sanitizeFileName(item.name);
        const type = getMimeType(name, item.type);
        const uri = formatFileUri(item.uri);
        return { ...item, uri, name, type };
      });

      if (isFromReservation) {
        if (readyFiles.length > 0) {
          const form = new FormData();
          form.append('id', String(reservation.id));
          form.append('persons', String(occupants.length));
          form.append('occupants', JSON.stringify(occPayload));
          form.append('verifyDocuments', 'true');
          if (Object.keys(preBookingAssignments).length > 0) {
            form.append('preBookingDocAssignments', JSON.stringify(preBookingAssignments));
          }
          readyFiles.forEach((item) => {
            form.append('documents[]', { uri: item.uri, name: item.name, type: item.type });
            form.append('occupantTargets[]', String(item.occupantTarget ?? '0'));
          });
          await checkInFromReservation.mutateAsync({ id: reservation.id, formData: form });
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
        const advVal = advance === '' ? 0 : Number(advance);
        if (readyFiles.length > 0) {
          const form = new FormData();
          form.append('roomId', String(room.id));
          form.append('phone', phone.replace(/\D/g, ''));
          form.append('name', name.trim());
          form.append('idProofType', idType);
          form.append('idProofNumber', idNo ? idNo.trim() : '');
          if (city) form.append('city', city.trim());
          form.append('bookingSource', bookingSource);
          if (bookingSource === 'Reference – Existing Member' && referredByGuestId) {
            form.append('referredByGuestId', String(referredByGuestId));
          }
          if (bookingSource === 'Other' && otherSource) {
            form.append('otherSource', otherSource.trim());
          }
          form.append('persons', String(occupants.length));
          form.append('occupants', JSON.stringify(occPayload));
          form.append('verifyDocuments', 'true');
          form.append('days', String(Number(days) || 1));
          form.append('rate', String(Number(rate) || 0));
          form.append('advanceAmount', String(advVal));
          form.append('advanceMethod', pay);
          readyFiles.forEach((item) => {
            form.append('documents[]', { uri: item.uri, name: item.name, type: item.type });
            form.append('occupantTargets[]', String(item.occupantTarget ?? '0'));
          });
          await directCheckIn.mutateAsync(form);
        } else {
          await directCheckIn.mutateAsync({
            roomId: room.id,
            phone: phone.replace(/\D/g, ''),
            name: name.trim(),
            idProofType: idType,
            idProofNumber: idNo ? idNo.trim() : '',
            city: city ? city.trim() : null,
            bookingSource,
            referredByGuestId: bookingSource === 'Reference – Existing Member' ? referredByGuestId : null,
            otherSource: bookingSource === 'Other' ? otherSource.trim() : null,
            persons: occupants.length,
            occupants: occPayload,
            verifyDocuments: true,
            days: Number(days) || 1,
            rate: Number(rate) || 0,
            advanceAmount: advVal,
            advanceMethod: pay,
          });
        }
        toast(`${name} checked in to Room ${room.roomNo}.`);
      }
      onClose();
    } catch (err) {
      const msg = err.fields?.room || err.fields?.housekeepingStatus || err.fields?.advanceAmount || err.fields?.persons || err.fields?.occupants || err.fields?.documents || err.message || 'Check-in failed. Please verify the details.';
      const backendErrs = {};
      if (err.fields?.room || err.fields?.housekeepingStatus || err.message?.includes('not ready') || err.message?.includes('maintenance') || err.message?.includes('already occupied') || err.message?.includes('Complete the previous checkout')) {
        setServerRoomError(msg);
        backendErrs.room = msg;
      }
      if (err.fields?.advanceAmount || err.message?.includes('advance amount before check-in') || err.message?.includes('Advance payment is required') || err.message?.includes('advance')) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        backendErrs.advance = ADVANCE_REQUIRED_MSG;
      }
      if (err.fields?.persons || err.message?.includes('allows a maximum of') || err.message?.includes('positive whole number')) {
        setServerPersonsError(msg);
        backendErrs.persons = msg;
      }
      if (err.fields?.phone || err.fields?.mobile_number || err.fields?.guest_phone) {
        backendErrs.phone = err.fields.phone || err.fields.mobile_number || err.fields.guest_phone;
      }
      if (err.fields?.name || err.fields?.guest_name) {
        backendErrs.name = err.fields.name || err.fields.guest_name;
      }
      if (err.fields?.documents) {
        backendErrs.documents = err.fields.documents;
      }
      if (err.fields?.occupants) {
        backendErrs.occupants = err.fields.occupants;
      }
      if (Object.keys(backendErrs).length > 0) {
        setErrors(backendErrs);
        scrollToFirstError(backendErrs);
      } else {
        setFormError(msg);
      }
      toast(msg);
      Alert.alert('Check-In Failed', msg);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const buttonTitle = isPending
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
                    : `Confirm Check-In · Room ${roomNo}`;

  const isFormDirty = Boolean(!isFromReservation && (phone.trim() || name.trim() || idNo.trim() || otherSource.trim()));

  return (
    <Sheet onClose={onClose} hasUnsavedChanges={isFormDirty} scrollRef={scrollRef}>
      <SheetHeader
        status={isFromReservation ? 'booked' : 'free'}
        badge={roomNo}
        title={isFromReservation ? 'Pre-Check-In Verification' : 'Direct Check-In'}
        subtitle={isFromReservation ? `${roomTypeName ? roomTypeName + ' · ' : ''}Booking ${reservation.booking_code}` : roomTypeName}
        onClose={onClose}
        hasUnsavedChanges={isFormDirty}
      />
      <View style={styles.body}>
        <FormErrorBanner message={formError} />

        {lateArrivalConflict && (
          <View ref={registerContainer('room')} onLayout={registerLayout('room')} style={[styles.warn, styles.warnDanger]}>
            <Text style={styles.warnTitle}>⚠️ Late Arrival Booking Conflict</Text>
            <Text style={styles.warnText}>
              Checking in today until {fd(out)} conflicts with upcoming reservation {lateArrivalConflict.booking_code}. Check-in is blocked.
            </Text>
          </View>
        )}
        {roomReadinessError ? (
          <View ref={registerContainer('room')} onLayout={registerLayout('room')} style={[styles.warn, isRoomMaintenance && styles.warnDanger]}>
            <Text style={styles.warnText}>Check-in blocked: {roomReadinessError}</Text>
            {isRoomNotReady && currentRoom ? (
              <Button
                title={hkAction.isPending ? 'Updating…' : 'Mark room ready'}
                variant="success" size="sm" loading={hkAction.isPending}
                onPress={async () => {
                  try {
                    await hkAction.mutateAsync({ roomId: currentRoom.id, action: 'ready' });
                    setServerRoomError('');
                    clearError('room');
                    toast(`Room ${roomNo} marked ready.`);
                  } catch (e) { toast(e.message); }
                }}
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
              />
            ) : null}
          </View>
        ) : null}

        {isFromReservation ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              Checking in booking {reservation.booking_code} ({reservation.guest_name} · {reservation.guest_phone})
            </Text>
          </View>
        ) : (
          <>
            <FormField
              ref={registerContainer('phone')}
              onLayout={registerLayout('phone')}
              label="Mobile number"
              required
              error={errors.phone || (phoneTouched && !isValidPhone(phone) ? 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.' : '')}
            >
              <Input
                ref={registerInput('phone')}
                keyboardType="phone-pad"
                maxLength={10}
                placeholder="10 digits (6-9)"
                value={phone}
                onChangeText={(v) => {
                  const res = handlePhoneInputChange(v, phone);
                  setPhone(res.value);
                  if (res.error) {
                    setError('phone', res.error);
                  } else {
                    clearError('phone');
                  }
                }}
                onBlur={() => setPhoneTouched(true)}
                error={Boolean(errors.phone || (phoneTouched && !isValidPhone(phone)))}
              />
              {matchedGuestId ? <Text style={styles.found}>Old guest found. Details filled in.</Text> : null}
            </FormField>

            <FormField
              ref={registerContainer('name')}
              onLayout={registerLayout('name')}
              label="Guest name"
              required
              error={errors.name || (nameTouched && !name.trim() ? 'Enter guest name.' : '')}
            >
              <Input
                ref={registerInput('name')}
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  clearError('name');
                }}
                onBlur={() => setNameTouched(true)}
                error={Boolean(errors.name || (nameTouched && !name.trim()))}
              />
            </FormField>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>ID proof *</Text>
              <Segmented options={IDS} value={idType} onChange={handleIdTypeChange} />
            </View>

            <FormField
              ref={registerContainer('idNo')}
              onLayout={registerLayout('idNo')}
              label={`${idConfig.label} ${!isIdSaved ? '*' : ''}`}
              error={errors.idNo}
            >
              <Input
                ref={registerInput('idNo')}
                value={idNo}
                keyboardType={idConfig.keyboardType}
                maxLength={idConfig.maxLength}
                autoCapitalize={idConfig.autoCapitalize}
                autoCorrect={false}
                style={idType !== 'Aadhaar' ? { textTransform: 'uppercase' } : undefined}
                onChangeText={(v) => {
                  const res = handleIdNumberInputChange(v, idType);
                  setIdNo(res.value);
                  clearError('idNo');
                }}
                placeholder={isIdSaved ? 'Already saved' : idConfig.placeholder}
                error={errors.idNo}
              />
            </FormField>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>From (city)</Text>
              <Input value={city} onChangeText={setCity} />
            </View>

            <View ref={registerContainer('source')} onLayout={registerLayout('source')} style={styles.fieldWrap}>
              <Text style={styles.label}>Booking source</Text>
              <Segmented options={['Social Media', 'Reference – Existing Member', 'Other']} value={bookingSource} onChange={handleSourceChange} />
            </View>

            {bookingSource === 'Reference – Existing Member' && (
              <FormField
                label="Referred By"
                required
                error={sourceError || errors.source}
              >
                <ReferredBySelect
                  value={referredByGuestId}
                  onChange={(id) => {
                    setReferredByGuestId(id);
                    setSourceError('');
                    clearError('source');
                  }}
                  excludeGuestId={matchedGuestId}
                  hasError={Boolean(sourceError || errors.source)}
                />
              </FormField>
            )}

            {bookingSource === 'Other' && (
              <FormField
                label="Person Name"
                required
                error={sourceError || errors.source}
              >
                <Input
                  ref={registerInput('source')}
                  value={otherSource}
                  onChangeText={(v) => {
                    setOtherSource(v);
                    setSourceError('');
                    clearError('source');
                  }}
                  error={sourceError || errors.source}
                />
              </FormField>
            )}
          </>
        )}

        <View ref={registerContainer('persons')} onLayout={registerLayout('persons')}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Actual Persons Count *</Text>
            <Text style={styles.hint}>Max {roomMaxPersons}</Text>
          </View>
          <Stepper
            value={occupants.length}
            min={1}
            max={roomMaxPersons}
            onExceedMax={(maxLimit) => setServerPersonsError(`Maximum ${maxLimit} ${Number(maxLimit) === 1 ? 'person' : 'persons'} allowed for this room.`)}
            onChange={handlePersonsChange}
          />
          {personsError ? (
            <Text style={styles.err}>{personsError}</Text>
          ) : (roomMaxPersons != null && occupants.length >= Number(roomMaxPersons)) ? (
            <Text style={[styles.hint, { color: colors.primary, marginTop: 4 }]}>
              Maximum {roomMaxPersons} {Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.
            </Text>
          ) : null}
        </View>

        <View ref={registerContainer('occupants')} onLayout={registerLayout('occupants')} style={{ gap: 8 }}>
          <View style={styles.rowBetween}>
            <Text style={[styles.label, { fontWeight: '700' }]}>Occupant Details</Text>
            <View style={styles.pillBadge}><Text style={styles.pillBadgeText}>{occupants.length} {occupants.length === 1 ? 'Person' : 'Persons'}</Text></View>
          </View>
          {errors.occupants ? <FieldError>{errors.occupants}</FieldError> : null}
          {occupants.map((occ, idx) => {
            const occErr = occupantErrors[idx] || {};
            const docCount = getOccupantDocumentCount(idx);
            const occFiles = selectedFiles.filter((f) => f.occupantTarget === idx);

            return (
              <View key={idx} style={styles.occCard}>
                <Text style={styles.occHeader}>Person {idx + 1} {idx === 0 ? '(Primary Guest)' : ''}</Text>
                <Input
                  ref={registerInput('occ_name_' + idx)}
                  placeholder="Full name *"
                  value={occ.name}
                  onChangeText={(v) => {
                    handleOccupantFieldChange(idx, 'name', v);
                    clearError('occupants');
                  }}
                  error={occErr.name}
                  style={{ marginBottom: 6 }}
                />
                {occErr.name ? <FieldError style={{ marginBottom: 6 }}>{occErr.name}</FieldError> : null}

                <Text style={[styles.subLabel, { marginBottom: 4 }]}>Gender *</Text>
                <Segmented options={['Male', 'Female', 'Other']} value={occ.gender} onChange={(v) => { handleOccupantFieldChange(idx, 'gender', v); clearError('occupants'); }} style={{ marginBottom: 6 }} error={Boolean(occErr.gender)} />
                {occErr.gender ? <FieldError style={{ marginBottom: 6 }}>{occErr.gender}</FieldError> : null}

                <Input
                  ref={registerInput('occ_phone_' + idx)}
                  placeholder="10-digit mobile *"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={occ.phone}
                  onChangeText={(v) => {
                    const res = handlePhoneInputChange(v, occ.phone || '');
                    handleOccupantFieldChange(idx, 'phone', res.value);
                    setOccupantErrors((prev) => ({
                      ...prev,
                      [idx]: { ...(prev[idx] || {}), phone: res.error || null },
                    }));
                    clearError('occupants');
                  }}
                  error={occErr.phone}
                  style={{ marginBottom: 8 }}
                />
                {occErr.phone ? <FieldError style={{ marginBottom: 8 }}>{occErr.phone}</FieldError> : null}

                {/* Dedicated Document Picker Button and Upload Area */}
                <View ref={idx === 0 ? registerContainer('documents') : undefined} onLayout={idx === 0 ? registerLayout('documents') : undefined} style={styles.uploadSection}>
                  <Text style={styles.subLabel}>ID Proof Document *</Text>
                  <Pressable
                    style={[styles.chooseFileBtn, docCount > 0 ? styles.chooseFileBtnSuccess : styles.chooseFileBtnActive]}
                    onPress={() => pickDocument(idx)}
                    accessibilityRole="button"
                    accessibilityLabel={`Upload ID Document for Person ${idx + 1}`}
                  >
                    <Text style={styles.chooseFileIcon}>📎</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chooseFileTitle}>
                        {docCount > 0 ? `Attach Document (P${idx + 1})` : `Upload ID Document (P${idx + 1})`}
                      </Text>
                      <Text style={styles.chooseFileSubtitle}>PDF, JPEG, PNG, WebP (max 10 MB)</Text>
                    </View>
                  </Pressable>

                  {/* Attached files list for this occupant */}
                  {occFiles.map((file) => (
                    <View key={file.id} style={styles.occFilePill}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.occFileName} numberOfLines={1}>📄 {file.name}</Text>
                        <Text style={styles.occFileMeta}>
                          {file.type === 'application/pdf' ? 'PDF' : 'Scanned ID'} {file.size ? `· ${(file.size / 1024).toFixed(1)} KB` : ''}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => removeFile(file.id)}
                        hitSlop={8}
                        style={styles.occFileDelete}
                        accessibilityRole="button"
                        accessibilityLabel="Remove Selected Document"
                      >
                        <Text style={styles.occFileDeleteText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}

                  <View style={styles.rowBetween}>
                    <Text style={docCount > 0 ? styles.docOk : styles.docMissing}>
                      {docCount > 0 ? `✓ ${docCount} ID document(s) uploaded` : '⚠️ Please upload ID proof document'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {errors.documents ? <FieldError style={{ marginTop: 4 }}>{errors.documents}</FieldError> : null}

        {isFromReservation && preBookingDocs?.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Pre-Booking Documents</Text>
            {preBookingDocs.map((doc) => (
              <View key={doc.id} style={styles.fileRow}>
                <Text style={styles.fileName} numberOfLines={1}>{doc.original_filename}</Text>
                <Segmented
                  options={occupants.map((occ, i) => ({ value: i, label: `P${i + 1}` }))}
                  value={preBookingAssignments[doc.id]}
                  onChange={(v) => setPreBookingAssignments((prev) => ({ ...prev, [doc.id]: v }))}
                />
              </View>
            ))}
          </View>
        )}

        {selectedFiles.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={styles.label}>Selected ID Documents ({selectedFiles.length})</Text>
            {selectedFiles.map((item) => (
              <View key={item.id} style={styles.fileRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.fileMeta}>
                    {item.type === 'application/pdf' ? 'PDF' : 'Scanned ID'} {item.size ? `· ${(item.size / 1024).toFixed(1)} KB` : ''}
                  </Text>
                </View>
                <Segmented
                  options={occupants.map((occ, i) => ({ value: i, label: `P${i + 1}` }))}
                  value={item.occupantTarget}
                  onChange={(v) => setSelectedFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, occupantTarget: v } : f)))}
                />
                <Pressable
                  onPress={() => removeFile(item.id)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove Selected Document"
                >
                  <Text style={styles.removeFile}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View ref={registerContainer('days')} onLayout={registerLayout('days')}>
          <Text style={styles.label}>Days *</Text>
          <Stepper value={Number(days) || 1} min={1} onChange={(v) => setDays(v)} />
        </View>
        <FormField
          ref={registerContainer('rate')}
          onLayout={registerLayout('rate')}
          label="Rate per day (₹)"
          required
          error={errors.rate}
        >
          <Input
            ref={registerInput('rate')}
            keyboardType="numeric"
            value={String(rate)}
            onChangeText={(v) => {
              setRate(v);
              clearError('rate');
            }}
            editable={!isFromReservation}
            error={errors.rate}
          />
        </FormField>

        {isFromReservation && confirmedAdvance > 0 ? (
          <View style={styles.advanceOk}>
            <Text style={styles.advanceOkText}>✓ {inr(confirmedAdvance)} collected ({(reservation.advance_method || pay).toUpperCase()})</Text>
          </View>
        ) : (
          <>
            <FormField
              ref={registerContainer('advance')}
              onLayout={registerLayout('advance')}
              label="Advance amount (₹)"
              required
              error={advanceError || errors.advance}
            >
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Input
                  ref={registerInput('advance')}
                  style={{ flex: 1 }}
                  keyboardType="numeric"
                  placeholder="0"
                  value={advance}
                  onChangeText={(v) => {
                    setAdvance(v);
                    setServerAdvanceError('');
                    clearError('advance');
                  }}
                  error={Boolean(advanceError || errors.advance)}
                />
                {isFromReservation ? (
                  <Button
                    title={recordAdvance.isPending ? 'Collecting…' : 'Collect'}
                    variant="success"
                    loading={recordAdvance.isPending}
                    onPress={handleCollectAdvance}
                  />
                ) : null}
              </View>
            </FormField>
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Advance paid by</Text>
              <Segmented options={['cash', 'upi', 'card']} value={pay} onChange={setPay} />
            </View>
          </>
        )}

        <View style={styles.billTable}>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>{days || 1} day(s) × {inr(rate)}</Text>
            <Text style={styles.billValue}>{inr(roomAmt)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabelSub}>GST {Math.round(gstRate * 100)}% ({formatGstBreakup(gstRate)})</Text>
            <Text style={styles.billValueSub}>{inr(gst)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabelTot}>Total</Text>
            <Text style={styles.billValueTot}>{inr(total)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabelSub}>Advance</Text>
            <Text style={styles.billValueSub}>−{inr(adv)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabelTot}>Balance at check-out</Text>
            <Text style={styles.billValueTot}>{inr(Math.max(0, total - adv))}</Text>
          </View>
        </View>

        <Button
          title={buttonTitle}
          variant="success"
          size="lg"
          loading={isPending}
          disabled={isPending}
          onPress={onSubmit}
        />
        {!allMandatoryChecksPassed && (
          <Text style={styles.hint}>
            {!isAdvanceValid ? '• Please enter and specify advance payment.\n' : ''}
            {!allOccupantsHaveIdProof ? '• Please choose & attach ID proof document.\n' : ''}
            {!allOccupantsValid ? '• Please fill occupant full name, gender & 10-digit mobile.' : ''}
          </Text>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading, marginBottom: 5 },
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, textAlign: 'center' },
  err: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 4 },
  found: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.success, marginTop: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pillBadge: { backgroundColor: colors.secondaryLight, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 },
  pillBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.primary },
  occCard: { backgroundColor: colors.cardSecondary, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 10, gap: 6 },
  occHeader: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading },
  subLabel: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.textSecondary },
  uploadSection: { marginTop: 4, gap: 6 },
  chooseFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#94A3B8',
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chooseFileBtnActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
  },
  chooseFileBtnSuccess: {
    borderColor: colors.success,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  chooseFileIcon: { fontSize: 20 },
  chooseFileTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, flexShrink: 1, flexWrap: 'wrap' },
  chooseFileSubtitle: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, marginTop: 1 },
  occFilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  occFileName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.text, marginRight: 8 },
  occFileMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  occFileDelete: { padding: 4 },
  occFileDeleteText: { fontSize: 13, color: colors.danger, fontWeight: '700' },
  docOk: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.success, flexShrink: 1, flexWrap: 'wrap' },
  docMissing: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.danger, flexShrink: 1, flexWrap: 'wrap' },
  docAction: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: 8 },
  fileName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
  fileMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  removeFile: { fontSize: 16, color: colors.danger },
  warn: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radii.md, padding: 10 },
  warnDanger: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  warnTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.danger, marginBottom: 4 },
  warnText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
  advanceOk: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder, borderRadius: radii.md, padding: 10 },
  advanceOkText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.success },
  billTable: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10, gap: 4 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between' },
  billLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text },
  billValue: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.text },
  billLabelSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  billValueSub: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  billLabelTot: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  billValueTot: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
});
