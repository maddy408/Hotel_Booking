import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { FormErrorBanner, FormField, FieldError, Input, Segmented, Stepper } from '../ui/Field.jsx';
import ReferredBySelect from '../ReferredBySelect.jsx';
import { useFreeRooms, useCreateReservation, useUpdateReservation, useUploadReservationDocuments } from '../../api/reservations';
import { useGuestLookup } from '../../api/guests';
import { useRoomTypes, useRooms } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../ToastContext.jsx';
import { addDaysIso, estimateGstRate, formatGstBreakup, fd, formatCheckoutHour, inr, nightsBetween, todayIso } from '../../lib/format';
import { BADGE_THEME, getCardDisplay, isRoomBookable } from '../../lib/roomAvailability.js';
import { api } from '../../lib/apiClient';
import { useFormValidation, isValidDate, isValidPhone, validatePhone, handlePhoneInputChange, getRoomConfiguredRate } from '../../lib/validation';
import { colors, fonts, radii } from '../../theme/theme';

export default function NewBookingSheet({ editReservation, presetGuest, preSelectedRoom, initialCheckIn, onClose }) {
  const isEdit = Boolean(editReservation?.id || editReservation?.booking_code);
  const initialRoomId = preSelectedRoom?.id || editReservation?.room_id || null;
  const { data: roomTypes } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const { data: settings } = useSettings();
  const create = useCreateReservation();
  const update = useUpdateReservation();
  const uploadResDocs = useUploadReservationDocuments();
  const toast = useToast();
  const scrollRef = useRef(null);
  const [selectedDocs, setSelectedDocs] = useState([]);

  const {
    errors,
    formError,
    clearError,
    setError,
    registerInput,
    registerContainer,
    registerLayout,
    handleBackendError,
    validate,
  } = useFormValidation({
    scrollRef,
    fieldOrder: [
      'phone',
      'name',
      'sourceError',
      'checkIn',
      'days',
      'persons',
      'roomId',
      'rate',
      'advance',
    ],
  });

  const [phone, setPhone] = useState(isEdit ? editReservation.guest_phone || '' : presetGuest?.phone || '');
  const [name, setName] = useState(isEdit ? editReservation.guest_name || '' : presetGuest?.name || '');
  const defaultCheckIn = isEdit
    ? (editReservation.check_in_date < todayIso() ? todayIso() : editReservation.check_in_date)
    : (initialCheckIn || todayIso());
  const [checkIn, setCheckIn] = useState(defaultCheckIn);
  const [days, setDays] = useState(isEdit ? nightsBetween(editReservation.check_in_date, editReservation.check_out_date) : 1);
  const [persons, setPersons] = useState(isEdit ? Number(editReservation.persons) || 1 : 1);
  const [typeFilter, setTypeFilter] = useState('all');
  const [roomId, setRoomId] = useState(initialRoomId);
  const prevRoomIdRef = useRef(initialRoomId);

  const initialTargetRoom = preSelectedRoom
    || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === initialRoomId))
    || null;
  const initialRate = isEdit
    ? String(editReservation.rate ?? '')
    : (initialTargetRoom ? String(getRoomConfiguredRate(initialTargetRoom, roomTypes) || initialTargetRoom.type_rate || initialTargetRoom.roomType?.rate || '') : '');

  const [rate, setRate] = useState(initialRate);
  const [advance, setAdvance] = useState(isEdit ? String(editReservation.advance_amount ?? editReservation.advance_paid ?? 0) : '');
  const [pay, setPay] = useState(isEdit ? editReservation.advance_method || 'cash' : 'cash');
  const [notes, setNotes] = useState(isEdit ? editReservation.notes || '' : '');
  const [rateTouched, setRateTouched] = useState(isEdit);
  const [matchedGuestId, setMatchedGuestId] = useState(null);
  const [inspectedRoomId, setInspectedRoomId] = useState(null);

  const [bookingSource, setBookingSource] = useState(
    editReservation?.booking_source
      ? (editReservation.booking_source.includes('Reference') ? 'Reference – Existing Member' : editReservation.booking_source)
      : 'Social Media'
  );
  const [referredByGuestId, setReferredByGuestId] = useState(editReservation?.referred_by_guest_id ? Number(editReservation.referred_by_guest_id) : null);
  const [otherSource, setOtherSource] = useState(editReservation?.other_source || '');

  const handleSourceChange = (newSource) => {
    setBookingSource(newSource);
    clearError('sourceError');
    if (newSource !== 'Reference – Existing Member') setReferredByGuestId(null);
    if (newSource !== 'Other') setOtherSource('');
  };

  const checkOut = addDaysIso(checkIn || todayIso(), Number(days) || 1);
  const { data: freeRooms } = useFreeRooms({ checkIn, checkOut, roomTypeId: typeFilter, excludeReservationId: editReservation?.id });

  const { data: lookup } = useGuestLookup(!isEdit ? phone : '');
  useEffect(() => {
    if (!isEdit && lookup?.guest) {
      setMatchedGuestId(lookup.guest.id);
      setName(lookup.guest.name);
      clearError('name');
    } else if (!isEdit) {
      setMatchedGuestId(null);
    }
  }, [lookup, isEdit, clearError]);

  const selectableRooms = (freeRooms || []).filter(isRoomBookable);
  const unavailableRooms = (freeRooms || []).filter((r) => !isRoomBookable(r));
  const [showUnavailable, setShowUnavailable] = useState(false);

  useEffect(() => {
    if (freeRooms && roomId && !selectableRooms.some((r) => r.id === roomId)) {
      setRoomId(null);
    }
  }, [freeRooms, roomId, selectableRooms]);

  // Automatically populate and update Room Master rate for pre-book and room changes
  useEffect(() => {
    if (isEdit) {
      if (roomId && prevRoomIdRef.current && prevRoomIdRef.current !== roomId) {
        const room = (freeRooms && freeRooms.find((r) => r.id === roomId))
          || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === roomId))
          || null;
        if (room) {
          const configuredRate = getRoomConfiguredRate(room, roomTypes);
          if (configuredRate > 0) {
            setRate(String(configuredRate));
            clearError('rate');
          }
        }
        prevRoomIdRef.current = roomId;
      }
      return;
    }

    if (roomId) {
      const isRoomChanged = prevRoomIdRef.current !== roomId;
      const room = (freeRooms && freeRooms.find((r) => r.id === roomId))
        || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === roomId))
        || (preSelectedRoom && preSelectedRoom.id === roomId ? preSelectedRoom : null)
        || null;

      if (room) {
        const configuredRate = getRoomConfiguredRate(room, roomTypes);
        if (configuredRate > 0 && (!rate || rate === '0' || isRoomChanged)) {
          setRate(String(configuredRate));
          clearError('rate');
        }
      }
      prevRoomIdRef.current = roomId;
    }
  }, [isEdit, roomId, roomsData, freeRooms, preSelectedRoom, roomTypes, clearError]);

  const readyCount = (freeRooms || []).filter((r) => (r.card_badge || (r.booking_status === 'available_ready' ? 'Ready' : '')) === 'Ready').length;
  const occupiedCount = (freeRooms || []).filter((r) => (r.card_badge || '') === 'Occupied').length;
  const cleaningCount = (freeRooms || []).filter((r) => (r.card_badge || (r.booking_status === 'available_not_ready' ? 'Cleaning' : '')) === 'Cleaning').length;
  const bookedCount = (freeRooms || []).filter((r) => (r.card_badge || (r.booking_status === 'unavailable' ? 'Booked' : '')) === 'Booked').length;
  const repairCount = (freeRooms || []).filter((r) => (r.card_badge || (r.booking_status === 'maintenance' ? 'Repair' : '')) === 'Repair').length;
  const overdueCount = (freeRooms || []).filter((r) => (r.card_badge || '') === 'Overdue').length;

  const totalBookable = selectableRooms.length;
  const rateNum = Number(rate) || 0;
  const gstRate = estimateGstRate(rateNum, settings?.settings);
  const roomAmt = (Number(days) || 1) * rateNum;
  const gstAmt = roomAmt * gstRate;
  const total = roomAmt + gstAmt;

  const origDays = isEdit ? nightsBetween(editReservation.check_in_date, editReservation.check_out_date) : 0;
  const origRate = isEdit ? Number(editReservation.rate) || 0 : 0;
  const origGstRate = isEdit ? estimateGstRate(origRate, settings?.settings) : 0;
  const origTotal = isEdit ? origDays * origRate * (1 + origGstRate) : 0;
  const deltaTotal = isEdit ? total - origTotal : 0;

  const selectedRoom = (freeRooms && freeRooms.find((r) => r.id === roomId))
    || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === roomId))
    || (preSelectedRoom && preSelectedRoom.id === roomId ? preSelectedRoom : null)
    || (isEdit && editReservation?.room_id === roomId ? editReservation : null);

  const displayRoom = (inspectedRoomId && freeRooms?.find((r) => r.id === inspectedRoomId))
    || selectedRoom;
  const displayRoomCardData = displayRoom ? getCardDisplay(displayRoom, checkIn, checkOut) : null;
  const roomMaxPersons = selectedRoom?.max_persons
    ?? selectedRoom?.roomType?.maxPersons
    ?? (preSelectedRoom && preSelectedRoom.id === roomId ? preSelectedRoom?.max_persons : null)
    ?? (isEdit && editReservation?.room_id === roomId ? editReservation?.max_persons : null)
    ?? (selectedRoom || roomId ? 2 : null);

  const isPersonsExceeded = roomMaxPersons != null && Number(persons) > Number(roomMaxPersons);
  const maxPersonsMsg = roomMaxPersons != null
    ? `Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.`
    : '';

  useEffect(() => {
    if (roomId && roomMaxPersons != null && Number(persons) > Number(roomMaxPersons)) {
      setPersons(Number(roomMaxPersons));
    }
  }, [roomId, roomMaxPersons, persons]);

  useEffect(() => {
    if (errors.persons && roomMaxPersons != null && Number(persons) <= Number(roomMaxPersons)) {
      clearError('persons');
    }
  }, [persons, roomMaxPersons, errors.persons, clearError]);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const overSized = result.assets.filter((f) => f.size && f.size > 10 * 1024 * 1024);
      if (overSized.length > 0) {
        toast('Document must be 10 MB or smaller.');
        return;
      }

      const valid = result.assets.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        uri: f.uri,
        name: f.name,
        type: f.mimeType || 'application/octet-stream',
        size: f.size,
      }));
      setSelectedDocs((prev) => [...prev, ...valid]);
    } catch (e) {
      toast('Could not attach file: ' + e.message);
    }
  };

  const removeDoc = (id) => setSelectedDocs((prev) => prev.filter((d) => d.id !== id));

  const onSubmit = async () => {
    const isValid = validate(() => {
      const errs = {};
      const phoneValidation = validatePhone(phone);

      if (!phoneValidation.isValid) {
        errs.phone = phoneValidation.error;
      }

      if (!name.trim()) {
        errs.name = 'Guest name is required.';
      }

      if (bookingSource === 'Reference – Existing Member' && (!referredByGuestId || referredByGuestId <= 0)) {
        errs.sourceError = 'Please select an existing member as reference.';
      }
      if (bookingSource === 'Other' && !otherSource.trim()) {
        errs.sourceError = 'Please enter person name for reference.';
      }

      if (!checkIn || !isValidDate(checkIn)) {
        errs.checkIn = 'Check-in date is required.';
      }

      if (Number(days) < 1) {
        errs.days = 'Number of days must be at least 1.';
      }

      if (isPersonsExceeded) {
        errs.persons = maxPersonsMsg || 'Maximum persons exceeded for selected room.';
      }

      if (!roomId) {
        errs.roomId = 'Please select a room.';
      } else {
        const chosenRoom = freeRooms?.find((r) => r.id === roomId);
        if (freeRooms && (!chosenRoom || !isRoomBookable(chosenRoom))) {
          errs.roomId = chosenRoom?.selection_blocked_reason || `Room ${chosenRoom?.room_no || ''} is not available for these dates.`;
        }
      }

      if (!(Number(rate) >= 1)) {
        errs.rate = 'Daily rate is required.';
      }

      if (advance !== '' && (isNaN(Number(advance)) || Number(advance) < 0)) {
        errs.advance = 'Please enter a valid payment amount.';
      }

      return errs;
    });

    if (!isValid) return;

    try {
      const checkOutDate = addDaysIso(checkIn, Number(days));

      // Revalidate room availability directly against authoritative live backend before submitting
      const params = new URLSearchParams({
        checkIn,
        checkOut: checkOutDate,
        ...(typeFilter && typeFilter !== 'all' ? { roomTypeId: typeFilter } : {}),
        ...(isEdit && editReservation?.id ? { excludeReservationId: editReservation.id } : {}),
      }).toString();

      try {
        const freshRooms = await api.get(`/reservations/free-rooms?${params}`);
        const freshChosen = (freshRooms || []).find((r) => r.id === roomId);
        if (!freshChosen || !isRoomBookable(freshChosen)) {
          const reason = freshChosen?.selection_blocked_reason || `Room ${freshChosen?.room_no || ''} is no longer available for these dates. Please choose another room.`;
          toast(reason);
          setRoomId(null);
          return;
        }
      } catch (freshErr) {
        // If pre-check fails due to network, backend mutation will enforce authoritative validation
      }

      const sourcePayload = {
        bookingSource,
        referredByGuestId: bookingSource === 'Reference – Existing Member' ? referredByGuestId : null,
        otherSource: bookingSource === 'Other' ? otherSource.trim() : null,
      };

      if (isEdit) {
        await update.mutateAsync({
          id: editReservation.id,
          roomId,
          checkIn,
          checkOut: checkOutDate,
          persons: Number(persons) || Number(editReservation?.persons) || 1,
          rate: Number(rate),
          advanceAmount: Number(advance) || 0,
          advanceMethod: pay,
          name: name.trim(),
          phone: phone.replace(/\D/g, ''),
          notes: notes ? notes.trim() : null,
          ...sourcePayload,
        });
        toast(`Booking ${editReservation.booking_code} updated.`);
      } else {
        const result = await create.mutateAsync({
          roomId,
          phone: phone.replace(/\D/g, ''),
          name: name.trim(),
          checkIn,
          checkOut: checkOutDate,
          persons: Number(persons) || 1,
          rate: Number(rate),
          advanceAmount: Number(advance) || 0,
          advanceMethod: pay,
          notes: notes ? notes.trim() : null,
          ...sourcePayload,
        });
        if (selectedDocs.length > 0 && result?.id) {
          try {
            await uploadResDocs.mutateAsync({ reservationId: result.id, files: selectedDocs });
          } catch (_docErr) {
            // Optional upload failure does not break successful reservation creation
          }
        }
        toast(`Booking ${result.booking_code} saved. Room ${result.room_no} on ${fd(result.check_in_date)}.`);
      }
      onClose();
    } catch (err) {
      handleBackendError(err);
      if (err?.message) {
        toast(err.message);
      }
    }
  };

  const isPending = create.isPending || update.isPending;
  const isFormDirty = isEdit
    ? Boolean(phone !== (editReservation.guest_phone || '') || name !== (editReservation.guest_name || '') || Number(advance) !== Number(editReservation.advance_paid || 0))
    : Boolean(phone.trim() || name.trim() || Number(advance) > 0);

  return (
    <Sheet onClose={onClose} hasUnsavedChanges={isFormDirty} scrollRef={scrollRef}>
      <SheetHeader
        status="booked"
        badge={isEdit ? editReservation.booking_code : 'NEW'}
        title={isEdit ? 'Change booking' : 'New booking'}
        subtitle={isEdit ? 'Update reservation details' : 'Phone call or walk-in booking'}
        onClose={onClose}
        hasUnsavedChanges={isFormDirty}
      />
      <View style={styles.body}>
        <FormErrorBanner message={formError} />

        {/* Mobile Number */}
        <FormField
          ref={registerContainer('phone')}
          onLayout={registerLayout('phone')}
          label="Mobile number"
          required
          error={errors.phone}
        >
          <Input
            ref={registerInput('phone')}
            keyboardType="phone-pad"
            maxLength={10}
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
            error={errors.phone}
            placeholder="10-digit mobile (starts with 6-9)"
          />
          {matchedGuestId && !isEdit ? <Text style={styles.found}>Old guest found. Name filled in.</Text> : null}
        </FormField>

        {/* Guest Name */}
        <FormField
          ref={registerContainer('name')}
          onLayout={registerLayout('name')}
          label="Guest name"
          required
          error={errors.name}
        >
          <Input
            ref={registerInput('name')}
            value={name}
            onChangeText={(v) => {
              setName(v);
              clearError('name');
            }}
            error={errors.name}
            placeholder="Guest name"
          />
        </FormField>

        {/* Booking Source */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Booking source</Text>
          <Segmented
            options={['Social Media', 'Reference – Existing Member', 'Other']}
            value={bookingSource}
            onChange={handleSourceChange}
          />
        </View>

        {bookingSource === 'Reference – Existing Member' && (
          <FormField
            ref={registerContainer('sourceError')}
            onLayout={registerLayout('sourceError')}
            label="Referred By"
            required
            error={errors.sourceError}
          >
            <ReferredBySelect
              value={referredByGuestId}
              onChange={(id) => {
                setReferredByGuestId(id);
                clearError('sourceError');
              }}
              excludeGuestId={matchedGuestId || editReservation?.guest_id}
              hasError={Boolean(errors.sourceError)}
            />
          </FormField>
        )}

        {bookingSource === 'Other' && (
          <FormField
            ref={registerContainer('sourceError')}
            onLayout={registerLayout('sourceError')}
            label="Person Name"
            required
            error={errors.sourceError}
          >
            <Input
              ref={registerInput('sourceError')}
              value={otherSource}
              onChangeText={(v) => {
                setOtherSource(v);
                clearError('sourceError');
              }}
              error={errors.sourceError}
              placeholder="Referral contact name"
            />
          </FormField>
        )}

        {/* Booking Notes */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Booking notes</Text>
          <Input
            placeholder="e.g. Late check-in, ground floor preferred"
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Coming On (Check-in Date) */}
        <FormField
          ref={registerContainer('checkIn')}
          onLayout={registerLayout('checkIn')}
          label="Coming on"
          required
          error={errors.checkIn}
        >
          <Input
            ref={registerInput('checkIn')}
            value={checkIn}
            onChangeText={(v) => {
              setCheckIn(v);
              clearError('checkIn');
            }}
            placeholder="YYYY-MM-DD"
            error={errors.checkIn}
          />
        </FormField>

        {/* Days */}
        <FormField
          ref={registerContainer('days')}
          onLayout={registerLayout('days')}
          label="Days"
          required
          error={errors.days}
        >
          <Stepper
            value={Number(days) || 1}
            min={1}
            onChange={(v) => {
              setDays(v);
              clearError('days');
            }}
          />
        </FormField>

        {/* Persons */}
        <FormField
          ref={registerContainer('persons')}
          onLayout={registerLayout('persons')}
          label="Persons"
          required
          error={errors.persons}
        >
          <Stepper
            value={Number(persons) || 1}
            min={1}
            max={roomMaxPersons != null ? Number(roomMaxPersons) : 20}
            onExceedMax={(maxLimit) => {
              toast(`Maximum ${maxLimit} ${Number(maxLimit) === 1 ? 'person' : 'persons'} allowed for this room.`);
            }}
            onChange={(v) => {
              if (roomMaxPersons != null && v > Number(roomMaxPersons)) {
                setPersons(Number(roomMaxPersons));
                toast(`Maximum ${roomMaxPersons} ${Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.`);
              } else {
                clearError('persons');
                setPersons(v);
              }
            }}
          />
          {roomMaxPersons != null && (
            <Text style={[styles.hint, { color: Number(persons) >= Number(roomMaxPersons) ? colors.primary : colors.textSecondary, marginTop: 4 }]}>
              Maximum {roomMaxPersons} {Number(roomMaxPersons) === 1 ? 'person' : 'persons'} allowed for this room.
            </Text>
          )}
        </FormField>

        {/* Leaves on */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Leaves on</Text>
          <Text style={styles.value}>
            {fd(checkOut)}, {formatCheckoutHour(settings?.settings?.checkout_hour)}
          </Text>
        </View>

        {/* Room Type Filter */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Room type</Text>
          <Segmented
            options={[
              { value: 'all', label: 'Any' },
              ...(roomTypes || []).map((t) => ({ value: String(t.id), label: t.name })),
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </View>

        {/* Room Picker */}
        <View
          ref={registerContainer('roomId')}
          onLayout={registerLayout('roomId')}
          style={[styles.fieldWrap, errors.roomId && styles.roomPickerErrorWrap]}
        >
          <Text style={styles.label}>
            Pick a room * · {totalBookable} available
          </Text>

          {/* Status Breakdown Pills */}
          <View style={styles.badgeCountsRow}>
            <View style={styles.badgeCountItem}>
              <View style={[styles.badgeDot, { backgroundColor: BADGE_THEME.Ready.color }]} />
              <Text style={[styles.badgeCountText, { color: BADGE_THEME.Ready.color }]}>Ready ({readyCount})</Text>
            </View>
            <View style={styles.badgeCountItem}>
              <View style={[styles.badgeDot, { backgroundColor: BADGE_THEME.Occupied.color }]} />
              <Text style={[styles.badgeCountText, { color: BADGE_THEME.Occupied.color }]}>Occupied ({occupiedCount})</Text>
            </View>
            <View style={styles.badgeCountItem}>
              <View style={[styles.badgeDot, { backgroundColor: BADGE_THEME.Cleaning.color }]} />
              <Text style={[styles.badgeCountText, { color: BADGE_THEME.Cleaning.color }]}>Cleaning ({cleaningCount})</Text>
            </View>
            <View style={styles.badgeCountItem}>
              <View style={[styles.badgeDot, { backgroundColor: BADGE_THEME.Booked.color }]} />
              <Text style={[styles.badgeCountText, { color: BADGE_THEME.Booked.color }]}>Booked ({bookedCount})</Text>
            </View>
            <View style={styles.badgeCountItem}>
              <View style={[styles.badgeDot, { backgroundColor: BADGE_THEME.Repair.color }]} />
              <Text style={[styles.badgeCountText, { color: BADGE_THEME.Repair.color }]}>Repair ({repairCount})</Text>
            </View>
            {overdueCount > 0 && (
              <View style={styles.badgeCountItem}>
                <View style={[styles.badgeDot, { backgroundColor: BADGE_THEME.Overdue.color }]} />
                <Text style={[styles.badgeCountText, { color: BADGE_THEME.Overdue.color }]}>Overdue ({overdueCount})</Text>
              </View>
            )}
          </View>

          {/* Selectable Room Grid - ONLY genuinely bookable rooms */}
          <View style={styles.roomGrid}>
            {selectableRooms.map((r) => {
              const cardData = getCardDisplay(r, checkIn, checkOut);
              const theme = BADGE_THEME[cardData.badge] || BADGE_THEME.Ready;
              const isSelected = roomId === r.id;
              const isInspected = inspectedRoomId === r.id;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Room ${r.room_no}, ${cardData.badge}, ${cardData.detail}. Tap to select.`}
                  style={[
                    styles.roomCard,
                    {
                      borderColor: isSelected
                        ? colors.primary
                        : isInspected
                        ? colors.primary
                        : theme.border,
                      borderWidth: isSelected || isInspected ? 2 : 1.5,
                    },
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    setInspectedRoomId(r.id);
                    setRoomId(r.id);
                    clearError('roomId');
                    const configuredRate = getRoomConfiguredRate(r, roomTypes);
                    if (configuredRate > 0) {
                      setRate(String(configuredRate));
                      clearError('rate');
                    }
                  }}
                >
                  <Text style={[styles.roomCardNo, isSelected && { color: '#fff' }]}>{r.room_no}</Text>
                  <View style={[styles.roomCardBadge, { backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : theme.bg }]}>
                    <Text style={[styles.roomCardBadgeText, { color: isSelected ? '#fff' : theme.color }]}>
                      {cardData.badge}
                    </Text>
                  </View>
                  <Text style={[styles.roomCardDetail, isSelected && { color: '#fff' }]} numberOfLines={1}>
                    {cardData.detail}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {freeRooms && selectableRooms.length === 0 ? (
            <Text style={styles.err}>No room free for these dates. Change the date or days.</Text>
          ) : null}

          {/* Separate Unavailable Rooms Section */}
          {unavailableRooms.length > 0 && (
            <View style={styles.unavailableSection}>
              <Pressable
                onPress={() => setShowUnavailable((prev) => !prev)}
                style={styles.unavailableToggle}
                accessibilityRole="button"
                accessibilityLabel={`Toggle unavailable rooms, ${unavailableRooms.length} unavailable for selected dates`}
              >
                <Text style={styles.unavailableToggleText}>
                  {showUnavailable ? 'Hide' : 'View'} unavailable rooms ({unavailableRooms.length})
                </Text>
                <Text style={styles.unavailableToggleIcon}>{showUnavailable ? '▲' : '▼'}</Text>
              </Pressable>

              {showUnavailable && (
                <View style={styles.unavailableGrid}>
                  {unavailableRooms.map((r) => {
                    const cardData = getCardDisplay(r, checkIn, checkOut);
                    const theme = BADGE_THEME[cardData.badge] || BADGE_THEME.Repair;
                    const isInspected = inspectedRoomId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Unavailable Room ${r.room_no}, ${cardData.badge}, ${cardData.detail}. Tap to view why unavailable.`}
                        style={[
                          styles.roomCard,
                          styles.roomCardUnavailable,
                          {
                            borderColor: isInspected ? colors.primary : theme.border,
                            borderWidth: isInspected ? 2 : 1.5,
                          },
                        ]}
                        onPress={() => {
                          setInspectedRoomId(r.id);
                          toast(`Room ${r.room_no}: ${cardData.blockedReason || 'Not available for these dates.'}`);
                        }}
                      >
                        <Text style={[styles.roomCardNo, styles.roomCardNoUnavailable]}>{r.room_no}</Text>
                        <View style={[styles.roomCardBadge, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.roomCardBadgeText, { color: theme.color }]}>
                            {cardData.badge}
                          </Text>
                        </View>
                        <Text style={styles.roomCardDetail} numberOfLines={1}>
                          {cardData.detail}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* Room Details & Explanation Panel */}
          {displayRoom && (
            <View
              style={[
                styles.detailsPanel,
                { borderColor: displayRoom.is_bookable !== false ? colors.border : colors.warningBorder },
              ]}
            >
              <View style={styles.detailsHeader}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.detailsRoomNo}>Room {displayRoom.room_no}</Text>
                  <Text style={styles.detailsMeta}>
                    {displayRoom.type_name || displayRoom.roomType?.name || 'Standard'} · ₹{Math.round(displayRoom.type_rate || displayRoom.roomType?.rate || 0).toLocaleString('en-IN')}/day · Max {displayRoom.max_persons || displayRoom.roomType?.maxPersons || 2} persons
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.detailsBadge, { backgroundColor: BADGE_THEME[displayRoomCardData?.badge]?.bg || colors.cardSecondary, borderColor: BADGE_THEME[displayRoomCardData?.badge]?.border || colors.border }]}>
                    <Text style={[styles.detailsBadgeText, { color: BADGE_THEME[displayRoomCardData?.badge]?.color || colors.text }]}>
                      {displayRoomCardData?.badge} · {displayRoomCardData?.detail}
                    </Text>
                  </View>
                  {inspectedRoomId && inspectedRoomId !== roomId && (
                    <Pressable onPress={() => setInspectedRoomId(null)} hitSlop={8}>
                      <Text style={styles.closeDetailsBtn}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <View style={styles.detailsGridItem}>
                  <Text style={styles.detailsGridLabel}>Current Guest: </Text>
                  <Text style={styles.detailsGridValue}>{displayRoom.current_stay?.guest_name || 'None (Vacant)'}</Text>
                </View>
                <View style={styles.detailsGridItem}>
                  <Text style={styles.detailsGridLabel}>Expected Checkout: </Text>
                  <Text style={styles.detailsGridValue}>
                    {displayRoom.current_stay
                      ? `${fd(displayRoom.current_stay.checkout_planned)}${displayRoom.current_stay.checkout_time ? ' (' + formatCheckoutHour(displayRoom.current_stay.checkout_time.split(':')[0]) + ')' : ''}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.detailsGridItem}>
                  <Text style={styles.detailsGridLabel}>Housekeeping: </Text>
                  <Text
                    style={[
                      styles.detailsGridValue,
                      {
                        color:
                          displayRoom.housekeeping_status === 'ok'
                            ? colors.success
                            : displayRoom.housekeeping_status === 'repair'
                            ? colors.danger
                            : colors.cleaning,
                      },
                    ]}
                  >
                    {displayRoom.housekeeping_status === 'ok'
                      ? 'Ready (Clean)'
                      : displayRoom.housekeeping_status === 'repair'
                      ? 'Repair (Maintenance)'
                      : 'Cleaning in progress'}
                  </Text>
                </View>
                <View style={styles.detailsGridItem}>
                  <Text style={styles.detailsGridLabel}>Requested Dates: </Text>
                  <Text style={[styles.detailsGridValue, { color: displayRoom.is_bookable !== false ? colors.success : colors.danger }]}>
                    {displayRoom.is_bookable !== false ? `Available (${fd(checkIn)} – ${fd(checkOut)})` : 'Unavailable for dates'}
                  </Text>
                </View>
                {displayRoom.next_reservation && (
                  <View style={[styles.detailsGridItem, { width: '100%' }]}>
                    <Text style={styles.detailsGridLabel}>Existing Booking: </Text>
                    <Text style={styles.detailsGridValue}>
                      {displayRoom.next_reservation.booking_code} · {displayRoom.next_reservation.guest_name} ({fd(displayRoom.next_reservation.check_in_date)} – {fd(displayRoom.next_reservation.check_out_date)})
                    </Text>
                  </View>
                )}
              </View>

              {displayRoom.is_bookable === false ? (
                <View style={styles.blockedBanner}>
                  <Text style={styles.bannerIcon}>🚫</Text>
                  <Text style={styles.blockedBannerText}>
                    {displayRoomCardData?.blockedReason || displayRoom.selection_blocked_reason || `Room ${displayRoom.room_no} cannot be selected for these dates.`}
                  </Text>
                </View>
              ) : (displayRoom.turnover_notice || displayRoomCardData?.turnoverNotice) ? (
                <View style={styles.turnoverBanner}>
                  <Text style={styles.bannerIcon}>ℹ️</Text>
                  <Text style={styles.turnoverBannerText}>
                    {displayRoom.turnover_notice || displayRoomCardData?.turnoverNotice}
                  </Text>
                </View>
              ) : displayRoom.housekeeping_status === 'cleaning' ? (
                <View style={styles.cleaningBanner}>
                  <Text style={styles.bannerIcon}>⚠️</Text>
                  <Text style={styles.cleaningBannerText}>
                    Room is currently being cleaned. Housekeeping must mark the room Ready before check-in.
                  </Text>
                </View>
              ) : (
                <View style={styles.readyBanner}>
                  <Text style={styles.bannerIcon}>✓</Text>
                  <Text style={styles.readyBannerText}>
                    Room is Available + Ready for check-in on arrival.
                  </Text>
                </View>
              )}
            </View>
          )}

          {errors.roomId ? <FieldError>{errors.roomId}</FieldError> : null}
        </View>

        {/* Rate per day */}
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
            value={rate}
            onChangeText={(v) => {
              setRate(v);
              setRateTouched(true);
              clearError('rate');
            }}
            placeholder="Pick a room"
            error={errors.rate}
          />
        </FormField>

        {/* Advance paid */}
        <FormField
          ref={registerContainer('advance')}
          onLayout={registerLayout('advance')}
          label="Advance paid (₹)"
          error={errors.advance}
        >
          <Input
            ref={registerInput('advance')}
            keyboardType="numeric"
            value={advance}
            onChangeText={(v) => {
              setAdvance(v);
              clearError('advance');
            }}
            placeholder="0"
            error={errors.advance}
          />
        </FormField>

        {/* Advance paid by */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Advance paid by</Text>
          <Segmented options={['cash', 'upi', 'card']} value={pay} onChange={setPay} />
        </View>

        {/* Bill summary table */}
        <View style={styles.billTable}>
          {isEdit && (
            <>
              <View style={styles.billRow}><Text style={styles.billLabelSub}>Original estimated total</Text><Text style={styles.billValueSub}>{inr(origTotal)}</Text></View>
              <View style={styles.billRow}><Text style={styles.billLabel}>New estimated bill with GST</Text><Text style={styles.billValue}>{inr(total)}</Text></View>
              <View style={styles.billRow}><Text style={styles.billLabelSub}>Amount difference</Text><Text style={styles.billValueSub}>{deltaTotal > 0 ? `+${inr(deltaTotal)}` : deltaTotal < 0 ? `−${inr(Math.abs(deltaTotal))}` : 'No change'}</Text></View>
            </>
          )}
          {!isEdit && (
            <>
              <View style={styles.billRow}><Text style={styles.billLabel}>{days || 1} day(s) × {inr(rateNum)}</Text><Text style={styles.billValue}>{inr(roomAmt)}</Text></View>
              <View style={styles.billRow}><Text style={styles.billLabelSub}>GST {Math.round(gstRate * 100)}% ({formatGstBreakup(gstRate)})</Text><Text style={styles.billValueSub}>{inr(gstAmt)}</Text></View>
              <View style={styles.billRow}><Text style={styles.billLabelTot}>Estimated bill with GST</Text><Text style={styles.billValueTot}>{inr(total)}</Text></View>
            </>
          )}
          <View style={styles.billRow}><Text style={styles.billLabelSub}>Advance collected</Text><Text style={styles.billValueSub}>−{inr(Number(advance) || 0)}</Text></View>
          <View style={styles.billRow}><Text style={styles.billLabelTot}>Balance due on arrival</Text><Text style={styles.billValueTot}>{inr(Math.max(0, total - (Number(advance) || 0)))}</Text></View>
        </View>

        {/* Optional ID Document Upload */}
        <View style={styles.docSection}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>ID Proof Documents (Optional)</Text>
            <Button
              title="+ Attach Document"
              variant="outline"
              size="sm"
              onPress={handlePickDocument}
            />
          </View>
          {selectedDocs.map((item) => (
            <View key={item.id} style={styles.docRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.docName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.docMeta}>
                  {item.type === 'application/pdf' ? 'PDF' : 'Scanned ID'} {item.size ? `· ${(item.size / 1024).toFixed(1)} KB` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => removeDoc(item.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove Selected Document"
              >
                <Text style={styles.removeFile}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Button
          title={isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Confirm booking'}
          variant="primary"
          size="lg"
          loading={isPending}
          onPress={onSubmit}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  fieldWrap: { gap: 4, marginBottom: 2 },
  roomPickerErrorWrap: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radii.md,
    padding: 8,
    backgroundColor: '#FFF5F5',
  },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading, marginBottom: 5 },
  value: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.text },
  err: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.danger, marginTop: 4 },
  found: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.success, marginTop: 4 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  roomCard: { width: 92, borderWidth: 1.5, borderRadius: radii.md, padding: 8, alignItems: 'center', gap: 3, backgroundColor: colors.surface },
  roomCardNo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  roomCardBadge: { borderRadius: radii.xs, paddingHorizontal: 5, paddingVertical: 1 },
  roomCardBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9.5 },
  roomCardDetail: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textSecondary },
  roomCardUnavailable: {
    opacity: 0.65,
    borderStyle: 'dashed',
    backgroundColor: colors.cardSecondary,
  },
  roomCardNoUnavailable: {
    color: colors.textSecondary,
  },
  unavailableSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unavailableToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  unavailableToggleText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  unavailableToggleIcon: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  unavailableGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  billTable: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10, gap: 4 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between' },
  billLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text },
  billValue: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.text },
  billLabelSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  billValueSub: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  billLabelTot: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  billValueTot: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
  badgeCountsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 },
  badgeCountItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeDot: { width: 8, height: 8, borderRadius: radii.full },
  badgeCountText: { fontFamily: fonts.bodySemibold, fontSize: 12 },
  detailsPanel: { marginTop: 10, padding: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderRadius: radii.md },
  detailsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  detailsRoomNo: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading },
  detailsMeta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  detailsBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.xs, borderWidth: 1 },
  detailsBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10.5 },
  closeDetailsBtn: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSecondary, paddingHorizontal: 4 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  detailsGridItem: { width: '48%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  detailsGridLabel: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.textSecondary },
  detailsGridValue: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.text },
  blockedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radii.sm, padding: 8, marginTop: 8 },
  blockedBannerText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.danger },
  turnoverBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.infoBg, borderColor: colors.infoBorder, borderWidth: 1, borderRadius: radii.sm, padding: 8, marginTop: 8 },
  turnoverBannerText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.info },
  cleaningBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningBg, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: radii.sm, padding: 8, marginTop: 8 },
  cleaningBannerText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.warning },
  readyBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.successBg, borderColor: colors.successBorder, borderWidth: 1, borderRadius: radii.sm, padding: 8, marginTop: 8 },
  readyBannerText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.success },
  bannerIcon: { fontSize: 14 },
  docSection: { gap: 6, marginVertical: 4 },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: 8 },
  docName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
  docMeta: { fontFamily: fonts.mono, fontSize: 10, color: colors.textSecondary, marginTop: 1 },
  removeFile: { fontSize: 16, color: colors.danger },
});
