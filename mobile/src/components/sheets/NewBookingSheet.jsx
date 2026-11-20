import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Input, Segmented, Stepper } from '../ui/Field.jsx';
import ReferredBySelect from '../ReferredBySelect.jsx';
import { useFreeRooms, useCreateReservation, useUpdateReservation } from '../../api/reservations';
import { useGuestLookup } from '../../api/guests';
import { useRoomTypes, useRooms } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../ToastContext.jsx';
import { addDaysIso, estimateGstRate, formatGstBreakup, fd, formatCheckoutHour, inr, nightsBetween, todayIso } from '../../lib/format';
import { BADGE_THEME, getCardDisplay } from '../../lib/roomAvailability.js';
import { colors, fonts, radii } from '../../theme/theme';

export default function NewBookingSheet({ editReservation, presetGuest, onClose }) {
  const isEdit = !!editReservation;
  const { data: roomTypes } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const { data: settings } = useSettings();
  const create = useCreateReservation();
  const update = useUpdateReservation();
  const toast = useToast();

  const [phone, setPhone] = useState(isEdit ? editReservation.guest_phone || '' : presetGuest?.phone || '');
  const [name, setName] = useState(isEdit ? editReservation.guest_name || '' : presetGuest?.name || '');
  const [checkIn, setCheckIn] = useState(isEdit ? (editReservation.check_in_date < todayIso() ? todayIso() : editReservation.check_in_date) : addDaysIso(todayIso(), 1));
  const [days, setDays] = useState(isEdit ? nightsBetween(editReservation.check_in_date, editReservation.check_out_date) : 1);
  const [persons, setPersons] = useState(isEdit ? Number(editReservation.persons) || 1 : 2);
  const [typeFilter, setTypeFilter] = useState('all');
  const [roomId, setRoomId] = useState(isEdit ? editReservation.room_id : null);
  const [rate, setRate] = useState(isEdit ? String(editReservation.rate) : '');
  const [advance, setAdvance] = useState(isEdit ? String(editReservation.advance_amount ?? editReservation.advance_paid ?? 0) : '');
  const [pay, setPay] = useState(isEdit ? editReservation.advance_method || 'cash' : 'cash');
  const [notes, setNotes] = useState(isEdit ? editReservation.notes || '' : '');
  const [rateTouched, setRateTouched] = useState(isEdit);
  const [matchedGuestId, setMatchedGuestId] = useState(null);

  const [bookingSource, setBookingSource] = useState(
    editReservation?.booking_source
      ? (editReservation.booking_source.includes('Reference') ? 'Reference – Existing Member' : editReservation.booking_source)
      : 'Social Media'
  );
  const [referredByGuestId, setReferredByGuestId] = useState(editReservation?.referred_by_guest_id ? Number(editReservation.referred_by_guest_id) : null);
  const [otherSource, setOtherSource] = useState(editReservation?.other_source || '');
  const [sourceError, setSourceError] = useState('');

  const handleSourceChange = (newSource) => {
    setBookingSource(newSource);
    setSourceError('');
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
    } else if (!isEdit) {
      setMatchedGuestId(null);
    }
  }, [lookup, isEdit]);

  useEffect(() => {
    if (freeRooms && roomId && !freeRooms.some((r) => r.id === roomId && r.is_bookable !== false)) setRoomId(null);
  }, [freeRooms, roomId]);

  const totalBookable = freeRooms?.filter((r) => r.is_bookable !== false).length || 0;
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

  const selectedRoom = (freeRooms && freeRooms.find((r) => r.id === roomId)) || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === roomId));
  const roomMaxPersons = selectedRoom?.max_persons ?? selectedRoom?.roomType?.maxPersons ?? 2;
  const [serverPersonsError, setServerPersonsError] = useState('');
  const isPersonsExceeded = roomMaxPersons != null && Number(persons) > Number(roomMaxPersons);
  const personsError = isPersonsExceeded ? `This room allows a maximum of ${roomMaxPersons} persons.` : serverPersonsError;

  const onSubmit = async () => {
    if (!roomId) { toast('Pick a room.'); return; }
    if (isPersonsExceeded) return;
    const chosenRoom = freeRooms?.find((r) => r.id === roomId);
    if (freeRooms && (!chosenRoom || chosenRoom.is_bookable === false)) {
      toast(chosenRoom?.selection_blocked_reason || `Room ${chosenRoom?.room_no} is not available for these dates.`);
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone || '')) { toast('Enter a valid 10-digit mobile number.'); return; }
    if (!name.trim()) { toast('Guest name is required.'); return; }
    if (!(Number(rate) >= 1)) { toast('Enter the rate per day.'); return; }
    if (bookingSource === 'Reference – Existing Member' && (!referredByGuestId || referredByGuestId <= 0)) {
      setSourceError('Please select an existing member as reference.');
      return;
    }
    if (bookingSource === 'Other' && !otherSource.trim()) {
      setSourceError('Please enter person name for reference.');
      return;
    }
    try {
      const checkOutDate = addDaysIso(checkIn, Number(days));
      const sourcePayload = {
        bookingSource,
        referredByGuestId: bookingSource === 'Reference – Existing Member' ? referredByGuestId : null,
        otherSource: bookingSource === 'Other' ? otherSource.trim() : null,
      };
      if (isEdit) {
        await update.mutateAsync({
          id: editReservation.id, roomId, checkIn, checkOut: checkOutDate,
          persons: Number(persons) || Number(editReservation?.persons) || 1, rate: Number(rate),
          advanceAmount: Number(advance) || 0, advanceMethod: pay,
          name: name.trim(), phone: phone.replace(/\D/g, ''), notes: notes ? notes.trim() : null,
          ...sourcePayload,
        });
        toast(`Booking ${editReservation.booking_code} updated.`);
      } else {
        const result = await create.mutateAsync({
          roomId, phone: phone.replace(/\D/g, ''), name: name.trim(), checkIn, checkOut: checkOutDate,
          persons: Number(persons) || 1, rate: Number(rate), advanceAmount: Number(advance) || 0,
          advanceMethod: pay, notes: notes ? notes.trim() : null, ...sourcePayload,
        });
        toast(`Booking ${result.booking_code} saved. Room ${result.room_no} on ${fd(result.check_in_date)}.`);
      }
      onClose();
    } catch (err) {
      if (err.fields?.persons || err.message?.includes('allows a maximum of')) {
        setServerPersonsError(err.fields?.persons || err.message);
        return;
      }
      toast(err.message);
    }
  };

  const isPending = create.isPending || update.isPending;
  const isFormDirty = isEdit
    ? Boolean(phone !== (editReservation.guest_phone || '') || name !== (editReservation.guest_name || '') || Number(advance) !== Number(editReservation.advance_paid || 0))
    : Boolean(phone.trim() || name.trim() || Number(advance) > 0);

  return (
    <Sheet onClose={onClose} hasUnsavedChanges={isFormDirty}>
      <SheetHeader
        status="booked"
        badge={isEdit ? editReservation.booking_code : 'NEW'}
        title={isEdit ? 'Change booking' : 'New booking'}
        subtitle={isEdit ? 'Update reservation details' : 'Phone call or walk-in booking'}
        onClose={onClose}
        hasUnsavedChanges={isFormDirty}
      />
      <View style={styles.body}>
        <View>
          <Text style={styles.label}>Mobile number *</Text>
          <Input keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} />
          {matchedGuestId && !isEdit ? <Text style={styles.found}>Old guest found. Name filled in.</Text> : null}
        </View>
        <View>
          <Text style={styles.label}>Guest name *</Text>
          <Input value={name} onChangeText={setName} />
        </View>
        <View>
          <Text style={styles.label}>Booking source</Text>
          <Segmented options={['Social Media', 'Reference – Existing Member', 'Other']} value={bookingSource} onChange={handleSourceChange} />
        </View>
        {bookingSource === 'Reference – Existing Member' && (
          <View>
            <Text style={styles.label}>Referred By *</Text>
            <ReferredBySelect value={referredByGuestId} onChange={(id) => { setReferredByGuestId(id); setSourceError(''); }} excludeGuestId={matchedGuestId || editReservation?.guest_id} hasError={!!sourceError} />
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
        <View>
          <Text style={styles.label}>Booking notes</Text>
          <Input placeholder="e.g. Late check-in, ground floor preferred" value={notes} onChangeText={setNotes} />
        </View>
        <View>
          <Text style={styles.label}>Coming on *</Text>
          <Input value={checkIn} onChangeText={setCheckIn} placeholder="YYYY-MM-DD" />
        </View>
        <View>
          <Text style={styles.label}>Days *</Text>
          <Stepper value={Number(days) || 1} min={1} onChange={setDays} />
        </View>
        <View>
          <Text style={styles.label}>Persons *</Text>
          <Stepper value={Number(persons) || 1} min={1} max={roomMaxPersons} onChange={(v) => { setServerPersonsError(''); setPersons(v); }} />
          {personsError ? <Text style={styles.err}>{personsError}</Text> : null}
        </View>
        <View>
          <Text style={styles.label}>Leaves on</Text>
          <Text style={styles.value}>{fd(checkOut)}, {formatCheckoutHour(settings?.settings?.checkout_hour)}</Text>
        </View>
        <View>
          <Text style={styles.label}>Room type</Text>
          <Segmented
            options={[{ value: 'all', label: 'Any' }, ...(roomTypes || []).map((t) => ({ value: String(t.id), label: t.name }))]}
            value={typeFilter} onChange={setTypeFilter}
          />
        </View>
        <View>
          <Text style={styles.label}>Pick a room * · {totalBookable} available</Text>
          <View style={styles.roomGrid}>
            {(freeRooms || []).map((r) => {
              const cardData = getCardDisplay(r, checkIn, checkOut);
              const theme = BADGE_THEME[cardData.badge] || BADGE_THEME.Ready;
              const isSelected = roomId === r.id;
              const isBookable = r.is_bookable !== false;
              return (
                <Pressable
                  key={r.id}
                  disabled={!isBookable}
                  style={[
                    styles.roomCard,
                    { borderColor: isSelected ? colors.primary : theme.border, opacity: isBookable ? 1 : 0.5 },
                    isSelected && { backgroundColor: colors.primary },
                  ]}
                  onPress={() => {
                    setRoomId(r.id);
                    if (!rateTouched) setRate(String(Number(r.type_rate)));
                  }}
                >
                  <Text style={[styles.roomCardNo, isSelected && { color: '#fff' }]}>{r.room_no}</Text>
                  <View style={[styles.roomCardBadge, { backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : theme.bg }]}>
                    <Text style={[styles.roomCardBadgeText, { color: isSelected ? '#fff' : theme.color }]}>{cardData.badge}</Text>
                  </View>
                  <Text style={[styles.roomCardDetail, isSelected && { color: '#fff' }]} numberOfLines={1}>{cardData.detail}</Text>
                </Pressable>
              );
            })}
          </View>
          {!freeRooms?.length ? <Text style={styles.err}>No room free for these dates. Change the date or days.</Text> : null}
        </View>
        <View>
          <Text style={styles.label}>Rate per day (₹) *</Text>
          <Input keyboardType="numeric" value={rate} onChangeText={(v) => { setRate(v); setRateTouched(true); }} placeholder="Pick a room" />
        </View>
        <View>
          <Text style={styles.label}>Advance paid (₹)</Text>
          <Input keyboardType="numeric" value={advance} onChangeText={setAdvance} placeholder="0" />
        </View>
        <View>
          <Text style={styles.label}>Advance paid by</Text>
          <Segmented options={['cash', 'upi', 'card']} value={pay} onChange={setPay} />
        </View>

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

        <Button title={isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Confirm booking'} variant="primary" size="lg" loading={isPending} onPress={onSubmit} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading, marginBottom: 5 },
  value: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.text },
  err: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 4 },
  found: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.success, marginTop: 4 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  roomCard: { width: 92, borderWidth: 1.5, borderRadius: radii.md, padding: 8, alignItems: 'center', gap: 3, backgroundColor: colors.surface },
  roomCardNo: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  roomCardBadge: { borderRadius: radii.xs, paddingHorizontal: 5, paddingVertical: 1 },
  roomCardBadgeText: { fontFamily: fonts.bodyBold, fontSize: 9.5 },
  roomCardDetail: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textSecondary },
  billTable: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10, gap: 4 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between' },
  billLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text },
  billValue: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.text },
  billLabelSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  billValueSub: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  billLabelTot: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  billValueTot: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
});
