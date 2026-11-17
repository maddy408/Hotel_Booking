import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Input, Segmented, Stepper } from '../ui/Field.jsx';
import ReferredBySelect from '../ReferredBySelect.jsx';
import { useGuestLookup } from '../../api/guests';
import { useDirectCheckIn } from '../../api/stays';
import { useCheckInReservation, useRecordAdvancePayment, useReservationDocuments, useReservations } from '../../api/reservations';
import { useRooms, useHousekeepingAction } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../ToastContext.jsx';
import { addDaysIso, estimateGstRate, formatGstBreakup, fd, formatCheckoutHour, inr, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

const IDS = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport'];
const ADVANCE_REQUIRED_MSG = 'Please enter and collect the advance amount before check-in.';

/**
 * Handles both "free room tapped" direct check-in and "guest came" from a pending
 * booking — ported 1:1 from the web's CheckInSheet.jsx business rules. Only the
 * presentation layer (RN views instead of DOM/form elements, DocumentPicker instead
 * of <input type=file>) differs.
 */
export default function CheckInSheet({ room, reservation, onClose }) {
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
    if (isRoomReady && !isRoomOccupied && serverRoomError) setServerRoomError('');
  }, [isRoomReady, isRoomOccupied, serverRoomError]);

  const roomMaxPersons = room?.roomType?.maxPersons
    ?? room?.roomType?.max_persons
    ?? room?.max_persons
    ?? reservation?.max_persons
    ?? (reservation?.persons ? Math.max(2, Number(reservation.persons)) : 2);

  const [phone, setPhone] = useState(isFromReservation ? reservation.guest_phone : '');
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
        list.push({ name: isFromReservation ? (reservation.guest_name || '') : '', gender: '', phone: isFromReservation ? (reservation.guest_phone || '') : '' });
      } else {
        list.push({ name: '', gender: '', phone: '' });
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
      setServerPersonsError(`This room allows a maximum of ${roomMaxPersons} persons.`);
      return;
    }
    const currentCount = occupants.length;
    if (num === currentCount) return;

    if (num < currentCount) {
      const removedEntries = occupants.slice(num);
      const hasData = removedEntries.some((o) => (o.name && o.name.trim()) || (o.phone && o.phone.trim()) || (o.gender && o.gender.trim()));
      const doShrink = () => {
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
      };
      if (hasData) {
        Alert.alert(
          'Remove occupant details?',
          `Changing persons count from ${currentCount} to ${num} will remove details for Person ${num + 1}${currentCount > num + 1 ? ` to ${currentCount}` : ''}.`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Proceed', style: 'destructive', onPress: doShrink }]
        );
      } else {
        doShrink();
      }
    } else {
      setOccupants((prev) => {
        const next = [...prev];
        while (next.length < num) next.push({ name: '', gender: '', phone: '' });
        return next;
      });
    }
  };

  const personCount = occupants.length;
  const isPersonsExceeded = roomMaxPersons != null && personCount > Number(roomMaxPersons);
  const personsError = isPersonsExceeded ? `This room allows a maximum of ${roomMaxPersons} persons.` : serverPersonsError;

  const [advanceSubmitted, setAdvanceSubmitted] = useState(false);
  const [serverAdvanceError, setServerAdvanceError] = useState('');
  const advNum = advance === '' || advance === null ? 0 : Number(advance);
  const isAdvanceEmptyOrZero = isNaN(advNum) || advNum <= 0;

  const advanceError = isFromReservation
    ? (confirmedAdvance <= 0 && (advanceSubmitted || serverAdvanceError) ? ADVANCE_REQUIRED_MSG : '')
    : ((advanceSubmitted && isAdvanceEmptyOrZero) || serverAdvanceError ? ADVANCE_REQUIRED_MSG : '');

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

  const isLateArrival = isFromReservation && (reservation?.check_in_date < todayIso() || reservation?.check_out_date <= todayIso());
  const lateArrivalConflict = isLateArrival
    ? allReservations.find((r) => r.id !== reservation?.id && Number(r.room_id) === Number(reservation?.room_id || currentRoom?.id) && r.status === 'pending' && r.check_in_date < out && todayIso() < r.check_out_date)
    : null;

  const { data: preBookingDocs = [] } = useReservationDocuments(isFromReservation ? reservation?.id : null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [preBookingAssignments, setPreBookingAssignments] = useState({});

  useEffect(() => {
    if (isFromReservation && preBookingDocs?.length > 0) {
      setPreBookingAssignments((prev) => {
        const next = { ...prev };
        for (const doc of preBookingDocs) if (next[doc.id] === undefined) next[doc.id] = occupants.length === 1 ? 0 : null;
        return next;
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
    const phoneOk = (occ.phone || '').replace(/\D/g, '').length === 10;
    return nameOk && genderOk && phoneOk;
  });

  const isAdvanceValid = isFromReservation ? confirmedAdvance > 0 : Number(advance) > 0 && !!pay;
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
      const valid = (result.assets || []).map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        uri: f.uri,
        name: f.name || 'document',
        type: f.mimeType || 'application/octet-stream',
        size: f.size,
        occupantTarget: occupantTarget != null ? occupantTarget : (occupants.length === 1 ? 0 : null),
      }));
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
    try {
      const res = await recordAdvance.mutateAsync({ id: reservation.id, amount: advVal, method: pay });
      setConfirmedAdvance(Number(res?.advance_paid ?? advVal));
      setServerAdvanceError('');
      setAdvanceSubmitted(false);
      toast(`Advance payment of ${inr(advVal)} collected successfully.`);
    } catch (err) {
      setServerAdvanceError(ADVANCE_REQUIRED_MSG);
      toast(err.message);
    }
  };

  const onSubmit = async () => {
    setAdvanceSubmitted(true);
    setPhoneTouched(true);
    setNameTouched(true);

    if (isRoomOccupied || !isRoomReady) {
      setServerRoomError(roomReadinessError);
      return;
    }
    if (!isFromReservation && !/^[6-9]\d{9}$/.test(phone || '')) {
      toast('Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
      return;
    }
    if (!isFromReservation && !name.trim()) {
      toast('Enter guest name.');
      return;
    }
    if (isPersonsExceeded) return;

    let hasOccErrors = false;
    const occErrors = {};
    occupants.forEach((occ, idx) => {
      const errs = {};
      if (!(occ.name || '').trim()) { errs.name = 'Name is required.'; hasOccErrors = true; }
      if (!['Male', 'Female', 'Other'].includes((occ.gender || '').trim())) { errs.gender = 'Gender is required.'; hasOccErrors = true; }
      if ((occ.phone || '').replace(/\D/g, '').length !== 10) { errs.phone = '10-digit phone number is required.'; hasOccErrors = true; }
      if (Object.keys(errs).length > 0) occErrors[idx] = errs;
    });
    if (hasOccErrors) {
      setOccupantErrors(occErrors);
      toast('Please enter required details for all occupants.');
      return;
    }
    if (!allOccupantsHaveIdProof || !allDocumentsAssigned) {
      toast('Every occupant must have an ID proof document attached and assigned.');
      return;
    }

    const occPayload = occupants.map((occ, i) => ({ occupant_number: i + 1, name: (occ.name || '').trim(), gender: (occ.gender || '').trim(), phone: (occ.phone || '').trim() }));

    if (isFromReservation) {
      if (confirmedAdvance <= 0) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
    } else {
      if (bookingSource === 'Reference – Existing Member' && (!referredByGuestId || referredByGuestId <= 0)) {
        setSourceError('Please select an existing member as reference.');
        return;
      }
      if (bookingSource === 'Other' && !otherSource.trim()) {
        setSourceError('Please enter person name for reference.');
        return;
      }
      const advVal = advance === '' ? 0 : Number(advance);
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
          if (Object.keys(preBookingAssignments).length > 0) form.append('preBookingDocAssignments', JSON.stringify(preBookingAssignments));
          selectedFiles.forEach((item) => {
            form.append('documents[]', { uri: item.uri, name: item.name, type: item.type });
            form.append('occupantTargets[]', item.occupantTarget ?? '');
          });
          await checkInFromReservation.mutateAsync(form);
        } else {
          await checkInFromReservation.mutateAsync({ id: reservation.id, persons: occupants.length, occupants: occPayload, verifyDocuments: true, preBookingDocAssignments: preBookingAssignments });
        }
        toast(`${reservation.guest_name.split(' ')[0]} checked in to Room ${reservation.room_no}.`);
      } else {
        const advVal = advance === '' ? 0 : Number(advance);
        if (selectedFiles.length > 0) {
          const form = new FormData();
          form.append('roomId', room.id);
          form.append('phone', phone);
          form.append('name', name);
          form.append('idProofType', idType);
          form.append('idProofNumber', idNo);
          if (city) form.append('city', city);
          form.append('bookingSource', bookingSource);
          if (bookingSource === 'Reference – Existing Member' && referredByGuestId) form.append('referredByGuestId', referredByGuestId);
          if (bookingSource === 'Other' && otherSource) form.append('otherSource', otherSource.trim());
          form.append('persons', occupants.length);
          form.append('occupants', JSON.stringify(occPayload));
          form.append('verifyDocuments', 'true');
          form.append('days', Number(days));
          form.append('rate', Number(rate));
          form.append('advanceAmount', advVal);
          form.append('advanceMethod', pay);
          selectedFiles.forEach((item) => {
            form.append('documents[]', { uri: item.uri, name: item.name, type: item.type });
            form.append('occupantTargets[]', item.occupantTarget ?? '');
          });
          await directCheckIn.mutateAsync(form);
        } else {
          await directCheckIn.mutateAsync({
            roomId: room.id, phone, name, idProofType: idType, idProofNumber: idNo, city, bookingSource,
            referredByGuestId: bookingSource === 'Reference – Existing Member' ? referredByGuestId : null,
            otherSource: bookingSource === 'Other' ? otherSource.trim() : null,
            persons: occupants.length, occupants: occPayload, verifyDocuments: true,
            days: Number(days), rate: Number(rate), advanceAmount: advVal, advanceMethod: pay,
          });
        }
        toast(`${name} checked in to Room ${room.roomNo}.`);
      }
      onClose();
    } catch (err) {
      if (err.fields?.room || err.message?.includes('not ready') || err.message?.includes('maintenance') || err.message?.includes('already occupied')) {
        setServerRoomError(err.fields?.room || err.message);
        toast(err.message);
        return;
      }
      if (err.fields?.advanceAmount || err.message?.includes('advance')) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
      if (err.fields?.persons || err.message?.includes('allows a maximum of')) {
        setServerPersonsError(err.fields?.persons || err.message);
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
        subtitle={isFromReservation ? `${roomTypeName ? roomTypeName + ' · ' : ''}Booking ${reservation.booking_code}` : roomTypeName}
        onClose={onClose}
      />
      <View style={styles.body}>
        {lateArrivalConflict && (
          <View style={[styles.warn, styles.warnDanger]}>
            <Text style={styles.warnTitle}>⚠️ Late Arrival Booking Conflict</Text>
            <Text style={styles.warnText}>
              Checking in today until {fd(out)} conflicts with upcoming reservation {lateArrivalConflict.booking_code}. Check-in is blocked.
            </Text>
          </View>
        )}
        {roomReadinessError ? (
          <View style={[styles.warn, isRoomMaintenance && styles.warnDanger]}>
            <Text style={styles.warnText}>Check-in blocked: {roomReadinessError}</Text>
            {isRoomNotReady && currentRoom ? (
              <Button
                title={hkAction.isPending ? 'Updating…' : 'Mark room ready'}
                variant="success" size="sm" loading={hkAction.isPending}
                onPress={async () => {
                  try {
                    await hkAction.mutateAsync({ roomId: currentRoom.id, action: 'ready' });
                    setServerRoomError('');
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
            <View>
              <Text style={styles.label}>Mobile number *</Text>
              <Input keyboardType="phone-pad" maxLength={10} placeholder="10 digits (6-9)" value={phone} onChangeText={setPhone} onBlur={() => setPhoneTouched(true)} />
              {phoneTouched && !/^[6-9]\d{9}$/.test(phone || '') ? <Text style={styles.err}>Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.</Text> : null}
              {matchedGuestId ? <Text style={styles.found}>Old guest found. Details filled in.</Text> : null}
            </View>
            <View>
              <Text style={styles.label}>Guest name *</Text>
              <Input value={name} onChangeText={setName} onBlur={() => setNameTouched(true)} />
              {nameTouched && !name.trim() ? <Text style={styles.err}>Enter guest name.</Text> : null}
            </View>
            <View>
              <Text style={styles.label}>ID proof *</Text>
              <Segmented options={IDS} value={idType} onChange={setIdType} />
            </View>
            <View>
              <Text style={styles.label}>ID number {!matchedGuestId ? '*' : ''}</Text>
              <Input value={idNo} onChangeText={setIdNo} placeholder={matchedGuestId ? 'Already saved' : ''} />
            </View>
            <View>
              <Text style={styles.label}>From (city)</Text>
              <Input value={city} onChangeText={setCity} />
            </View>
            <View>
              <Text style={styles.label}>Booking source</Text>
              <Segmented options={['Social Media', 'Reference – Existing Member', 'Other']} value={bookingSource} onChange={handleSourceChange} />
            </View>
            {bookingSource === 'Reference – Existing Member' && (
              <View>
                <Text style={styles.label}>Referred By *</Text>
                <ReferredBySelect value={referredByGuestId} onChange={(id) => { setReferredByGuestId(id); setSourceError(''); }} excludeGuestId={matchedGuestId} hasError={!!sourceError} />
                {sourceError ? <Text style={styles.err}>{sourceError}</Text> : null}
              </View>
            )}
            {bookingSource === 'Other' && (
              <View>
                <Text style={styles.label}>Person Name *</Text>
                <Input value={otherSource} onChangeText={(v) => { setOtherSource(v); setSourceError(''); }} />
                {sourceError ? <Text style={styles.err}>{sourceError}</Text> : null}
              </View>
            )}
          </>
        )}

        <View>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Actual Persons Count *</Text>
            <Text style={styles.hint}>Max {roomMaxPersons}</Text>
          </View>
          <Stepper value={occupants.length} min={1} max={roomMaxPersons} onChange={handlePersonsChange} />
          {personsError ? <Text style={styles.err}>{personsError}</Text> : null}
        </View>

        <View style={{ gap: 8 }}>
          <View style={styles.rowBetween}>
            <Text style={[styles.label, { fontWeight: '700' }]}>Occupant Details</Text>
            <View style={styles.pillBadge}><Text style={styles.pillBadgeText}>{occupants.length} {occupants.length === 1 ? 'Person' : 'Persons'}</Text></View>
          </View>
          {occupants.map((occ, idx) => {
            const occErr = occupantErrors[idx] || {};
            const docCount = getOccupantDocumentCount(idx);
            return (
              <View key={idx} style={styles.occCard}>
                <Text style={styles.occHeader}>Person {idx + 1} {idx === 0 ? '(Primary Guest)' : ''}</Text>
                <Input placeholder="Full name" value={occ.name} onChangeText={(v) => handleOccupantFieldChange(idx, 'name', v)} error={occErr.name} style={{ marginBottom: 6 }} />
                <Segmented options={['Male', 'Female', 'Other']} value={occ.gender} onChange={(v) => handleOccupantFieldChange(idx, 'gender', v)} style={{ marginBottom: 6 }} />
                <Input placeholder="10-digit mobile" keyboardType="phone-pad" maxLength={10} value={occ.phone} onChangeText={(v) => handleOccupantFieldChange(idx, 'phone', v.replace(/\D/g, '').slice(0, 10))} error={occErr.phone} />
                <View style={styles.rowBetween}>
                  <Text style={docCount > 0 ? styles.docOk : styles.docMissing}>
                    {docCount > 0 ? `✓ ${docCount} ID document(s) attached` : '✗ Missing ID proof document'}
                  </Text>
                  <Pressable onPress={() => pickDocument(idx)}><Text style={styles.docAction}>+ Attach ID</Text></Pressable>
                </View>
              </View>
            );
          })}
        </View>

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
            <Text style={styles.label}>Uploaded ID Documents ({selectedFiles.length})</Text>
            {selectedFiles.map((item) => (
              <View key={item.id} style={styles.fileRow}>
                <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                <Segmented
                  options={occupants.map((occ, i) => ({ value: i, label: `P${i + 1}` }))}
                  value={item.occupantTarget}
                  onChange={(v) => setSelectedFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, occupantTarget: v } : f)))}
                />
                <Pressable onPress={() => removeFile(item.id)} hitSlop={8}><Text style={styles.removeFile}>✕</Text></Pressable>
              </View>
            ))}
          </View>
        )}

        <View>
          <Text style={styles.label}>Days *</Text>
          <Stepper value={Number(days) || 1} min={1} onChange={(v) => setDays(v)} />
        </View>
        <View>
          <Text style={styles.label}>Rate per day (₹) *</Text>
          <Input keyboardType="numeric" value={String(rate)} onChangeText={setRate} editable={!isFromReservation} />
        </View>

        {isFromReservation && confirmedAdvance > 0 ? (
          <View style={styles.advanceOk}>
            <Text style={styles.advanceOkText}>✓ {inr(confirmedAdvance)} collected ({(reservation.advance_method || pay).toUpperCase()})</Text>
          </View>
        ) : (
          <>
            <View>
              <Text style={styles.label}>Advance amount (₹) *</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Input style={{ flex: 1 }} keyboardType="numeric" placeholder="0" value={advance} onChangeText={setAdvance} error={!!advanceError} />
                {isFromReservation ? (
                  <Button title={recordAdvance.isPending ? 'Collecting…' : 'Collect'} variant="success" loading={recordAdvance.isPending} onPress={handleCollectAdvance} />
                ) : null}
              </View>
              {advanceError ? <Text style={styles.err}>{advanceError}</Text> : null}
            </View>
            <View>
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
          title={isPending ? 'Confirming Check-In…' : `Confirm Check-In · Room ${roomNo}`}
          variant="success" size="lg" loading={isPending} disabled={!allMandatoryChecksPassed} onPress={onSubmit}
        />
        {!allMandatoryChecksPassed && (
          <Text style={styles.hint}>Complete all mandatory checks above to enable Confirm Check-In.</Text>
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
  docOk: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.success },
  docMissing: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.danger },
  docAction: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: 8 },
  fileName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
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
