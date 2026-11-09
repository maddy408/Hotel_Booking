import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useFreeRooms, useCreateReservation, useUpdateReservation } from '../../api/reservations';
import { useGuestLookup } from '../../api/guests';
import { useRoomTypes, useRooms } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../../context/ToastContext.jsx';
import { addDaysIso, estimateGstRate, fd, formatCheckoutHour, inr, nightsBetween, todayIso } from '../../lib/format';
import { BADGE_THEME, getCardDisplay } from '../../lib/roomAvailability.js';

export default function NewBookingSheet({ editReservation, presetGuest, onClose }) {
  const isEdit = !!editReservation;
  const { data: roomTypes } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const { data: settings } = useSettings();
  const create = useCreateReservation();
  const update = useUpdateReservation();
  const toast = useToast();

  const { register, watch, setValue, handleSubmit, formState: { errors } } = useForm({
    defaultValues: isEdit
      ? {
          phone: editReservation.guest_phone || '',
          name: editReservation.guest_name || '',
          checkIn: editReservation.check_in_date < todayIso() ? todayIso() : editReservation.check_in_date,
          days: nightsBetween(editReservation.check_in_date, editReservation.check_out_date),
          persons: editReservation.persons,
          typeFilter: 'all',
          roomId: editReservation.room_id,
          rate: editReservation.rate,
          advance: editReservation.advance_amount ?? editReservation.advance_paid ?? 0,
          pay: editReservation.advance_method || 'cash',
          notes: editReservation.notes || '',
        }
      : {
          phone: presetGuest?.phone || '',
          name: presetGuest?.name || '',
          checkIn: addDaysIso(todayIso(), 1),
          days: 1,
          persons: 2,
          typeFilter: 'all',
          roomId: null,
          rate: '',
          advance: '',
          pay: 'cash',
          notes: '',
        },
  });

  const phone = watch('phone');
  const checkIn = watch('checkIn');
  const days = watch('days');
  const persons = watch('persons');
  const typeFilter = watch('typeFilter');
  const roomId = watch('roomId');
  const rate = watch('rate');
  const advance = watch('advance');
  const pay = watch('pay');
  const [rateTouched, setRateTouched] = useState(isEdit);
  const [matchedGuestId, setMatchedGuestId] = useState(null);
  const [inspectedRoomId, setInspectedRoomId] = useState(null);

  const checkOut = addDaysIso(checkIn || todayIso(), Number(days) || 1);
  const { data: freeRooms } = useFreeRooms({
    checkIn,
    checkOut,
    roomTypeId: typeFilter,
    excludeReservationId: editReservation?.id,
  });

  const { data: lookup } = useGuestLookup(!isEdit ? phone : '');
  useEffect(() => {
    if (!isEdit && lookup?.guest) {
      setMatchedGuestId(lookup.guest.id);
      setValue('name', lookup.guest.name);
    } else if (!isEdit) {
      setMatchedGuestId(null);
    }
  }, [lookup, isEdit, setValue]);

  useEffect(() => {
    if (freeRooms && roomId && !freeRooms.some((r) => r.id === roomId && r.is_bookable !== false)) {
      setValue('roomId', null);
    }
  }, [freeRooms, roomId, setValue]);

  const readyCount = freeRooms?.filter((r) => (r.card_badge || (r.booking_status === 'available_ready' ? 'Ready' : '')) === 'Ready').length || 0;
  const occupiedCount = freeRooms?.filter((r) => (r.card_badge || '') === 'Occupied').length || 0;
  const cleaningCount = freeRooms?.filter((r) => (r.card_badge || (r.booking_status === 'available_not_ready' ? 'Cleaning' : '')) === 'Cleaning').length || 0;
  const bookedCount = freeRooms?.filter((r) => (r.card_badge || (r.booking_status === 'unavailable' ? 'Booked' : '')) === 'Booked').length || 0;
  const repairCount = freeRooms?.filter((r) => (r.card_badge || (r.booking_status === 'maintenance' ? 'Repair' : '')) === 'Repair').length || 0;
  const overdueCount = freeRooms?.filter((r) => (r.card_badge || '') === 'Overdue').length || 0;

  const totalBookable = freeRooms?.filter((r) => r.is_bookable !== false).length || 0;

  const rateNum = Number(rate) || 0;
  const gstRate = estimateGstRate(rateNum, settings?.settings);
  const total = (Number(days) || 1) * rateNum * (1 + gstRate);

  const origDays = isEdit ? nightsBetween(editReservation.check_in_date, editReservation.check_out_date) : 0;
  const origRate = isEdit ? Number(editReservation.rate) || 0 : 0;
  const origGstRate = isEdit ? estimateGstRate(origRate, settings?.settings) : 0;
  const origTotal = isEdit ? origDays * origRate * (1 + origGstRate) : 0;
  const deltaTotal = isEdit ? total - origTotal : 0;

  const selectedRoom = (freeRooms && freeRooms.find((r) => r.id === roomId))
    || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === roomId))
    || (isEdit && editReservation?.room_id === roomId ? editReservation : null);

  const displayRoom = (inspectedRoomId && freeRooms?.find((r) => r.id === inspectedRoomId))
    || selectedRoom;
  const displayRoomCardData = displayRoom ? getCardDisplay(displayRoom, checkIn, checkOut) : null;

  const roomMaxPersons = selectedRoom?.max_persons
    ?? selectedRoom?.roomType?.maxPersons
    ?? (isEdit && editReservation?.room_id === roomId ? editReservation?.max_persons : null);

  const [serverPersonsError, setServerPersonsError] = useState('');
  const personCount = Number(persons) || 1;
  const isPersonsExceeded = roomMaxPersons != null && personCount > Number(roomMaxPersons);
  const maxPersonsMsg = roomMaxPersons != null ? `This room allows a maximum of ${roomMaxPersons} persons.` : '';
  const personsError = isPersonsExceeded ? maxPersonsMsg : (serverPersonsError || '');

  useEffect(() => {
    if (serverPersonsError && roomMaxPersons != null && personCount <= Number(roomMaxPersons)) {
      setServerPersonsError('');
    }
  }, [personCount, roomMaxPersons, serverPersonsError]);

  const onSubmit = async (values) => {
    if (!values.roomId) {
      toast('Pick a room.');
      return;
    }
    const chosenRoom = freeRooms?.find((r) => r.id === values.roomId);
    if (freeRooms && (!chosenRoom || chosenRoom.is_bookable === false)) {
      if (chosenRoom?.selection_blocked_reason) {
        toast(chosenRoom.selection_blocked_reason);
      } else if (chosenRoom && chosenRoom.booking_status === 'maintenance') {
        toast(`Room ${chosenRoom.room_no} is under maintenance and cannot be booked.`);
      } else if (chosenRoom) {
        toast(`Room ${chosenRoom.room_no} is already booked for these dates.`);
      } else {
        toast('Selected room is not available for these dates.');
      }
      return;
    }
    if (isPersonsExceeded) {
      return;
    }
    try {
      const checkOutDate = addDaysIso(values.checkIn, Number(values.days));
      if (isEdit) {
        await update.mutateAsync({
          id: editReservation.id,
          roomId: values.roomId,
          checkIn: values.checkIn,
          checkOut: checkOutDate,
          persons: Number(values.persons),
          rate: Number(values.rate),
          advanceAmount: Number(values.advance) || 0,
          advanceMethod: values.pay,
          name: values.name.trim(),
          phone: values.phone.replace(/\D/g, ''),
          notes: values.notes ? values.notes.trim() : null,
        });
        toast(`Booking ${editReservation.booking_code} updated.`);
      } else {
        const result = await create.mutateAsync({
          roomId: values.roomId,
          phone: values.phone.replace(/\D/g, ''),
          name: values.name.trim(),
          checkIn: values.checkIn,
          checkOut: checkOutDate,
          persons: Number(values.persons),
          rate: Number(values.rate),
          advanceAmount: Number(values.advance) || 0,
          advanceMethod: values.pay,
          notes: values.notes ? values.notes.trim() : null,
        });
        toast(`Booking ${result.booking_code} saved. Room ${result.room_no} on ${fd(result.check_in_date)}. Tell the guest this number.`);
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

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="booked" badge={isEdit ? editReservation.booking_code : 'NEW'} title={isEdit ? 'Change booking' : 'New booking'} subtitle={isEdit ? 'Update reservation details' : 'Phone call or walk-in booking'} onClose={onClose} />
      <form className="sb" onSubmit={handleSubmit(onSubmit)}>
        <div className="fg">
          <div className={`f full ${errors.phone ? 'bad' : ''}`}>
            <label htmlFor="bk-phone">
              Mobile number <i>*</i>
            </label>
            <input id="bk-phone" type="tel" inputMode="numeric" maxLength={10} placeholder="10 digits" {...register('phone', { required: true, pattern: /^\d{10}$/ })} />
            {errors.phone && <span className="err">Enter a 10-digit mobile number.</span>}
          </div>
          {!isEdit && matchedGuestId && <div className="found f full">Old guest found. Name filled in.</div>}
          <div className={`f full ${errors.name ? 'bad' : ''}`}>
            <label htmlFor="bk-name">
              Guest name <i>*</i>
            </label>
            <input id="bk-name" type="text" placeholder="Full name" {...register('name', { required: true })} />
            {errors.name && <span className="err">Guest name is required.</span>}
          </div>
          <div className="f full">
            <label htmlFor="bk-notes">Booking notes (special requests / reference)</label>
            <input id="bk-notes" type="text" placeholder="e.g. Late check-in, ground floor preferred" {...register('notes')} />
          </div>
          <div className="f">
            <label htmlFor="bk-in">Coming on *</label>
            <input id="bk-in" type="date" min={todayIso()} {...register('checkIn', { required: true })} />
          </div>
          <div className="f">
            <label>Days *</label>
            <div className="step">
              <button type="button" onClick={() => setValue('days', Math.max(1, (Number(days) || 1) - 1))}>
                −
              </button>
              <input type="number" readOnly {...register('days')} />
              <button type="button" onClick={() => setValue('days', (Number(days) || 1) + 1)}>
                +
              </button>
            </div>
          </div>
          <div className={`f ${personsError ? 'bad' : ''}`}>
            <label>Persons *</label>
            <div className="step">
              <button
                type="button"
                onClick={() => {
                  setServerPersonsError('');
                  setValue('persons', Math.max(1, (Number(persons) || 1) - 1));
                }}
              >
                −
              </button>
              <input type="number" readOnly {...register('persons')} />
              <button
                type="button"
                onClick={() => {
                  setServerPersonsError('');
                  setValue('persons', (Number(persons) || 1) + 1);
                }}
              >
                +
              </button>
            </div>
            {personsError && <span className="err">{personsError}</span>}
          </div>
          <div className="f">
            <label>Leaves on</label>
            <input type="text" value={`${fd(checkOut)}, ${formatCheckoutHour(settings?.settings?.checkout_hour)}`} disabled />
          </div>
          <div className="f full">
            <label>Room type</label>
            <div className="seg">
              <button type="button" aria-pressed={typeFilter === 'all'} onClick={() => setValue('typeFilter', 'all')}>
                Any
              </button>
              {roomTypes?.map((t) => (
                <button key={t.id} type="button" aria-pressed={typeFilter === String(t.id)} onClick={() => setValue('typeFilter', String(t.id))}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="f full">
            <label>
              Pick a room <i>*</i> <span className="muted" style={{ fontWeight: 500 }}>· {totalBookable} available for these dates</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, margin: '2px 0 8px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--ok)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />
                Ready ({readyCount})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--occ)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--occ)' }} />
                Occupied ({occupiedCount})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--cln)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cln)' }} />
                Cleaning ({cleaningCount})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--bk)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--bk)' }} />
                Booked ({bookedCount})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--mnt)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mnt)' }} />
                Repair ({repairCount})
              </span>
              {overdueCount > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-danger-text, #ef4444)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-danger-text, #ef4444)' }} />
                  Overdue ({overdueCount})
                </span>
              )}
            </div>
            {freeRooms?.length ? (
              <div className="pks" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {freeRooms.map((r) => {
                  const cardData = getCardDisplay(r, checkIn, checkOut);
                  const badgeText = cardData.badge;
                  const detailText = cardData.detail;
                  const theme = BADGE_THEME[badgeText] || BADGE_THEME.Ready;
                  const isSelected = roomId === r.id;
                  const isInspected = inspectedRoomId === r.id;
                  const isBookable = r.is_bookable !== false;

                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`pk pk-room-card ${isSelected ? 'active' : ''} ${!isBookable ? 'disabled' : ''}`}
                      aria-pressed={isSelected}
                      aria-disabled={!isBookable}
                      aria-label={`Room ${r.room_no}, ${badgeText}, ${detailText}. ${!isBookable ? (cardData.blockedReason || 'Cannot book') : 'Click to select.'}`}
                      title={`Room ${r.room_no} (${r.type_name}) · ${badgeText} · ${detailText}${cardData.blockedReason ? ' · ' + cardData.blockedReason : ''}`}
                      onClick={() => {
                        setInspectedRoomId(r.id);
                        if (isBookable) {
                          setValue('roomId', r.id);
                          if (!rateTouched) setValue('rate', Number(r.type_rate));
                        }
                      }}
                      style={{
                        borderColor: isSelected
                          ? 'var(--color-primary)'
                          : isInspected
                          ? 'var(--color-primary)'
                          : theme.border,
                        boxShadow: isSelected
                          ? '0 0 0 1px var(--color-primary)'
                          : isInspected
                          ? '0 0 0 1.5px var(--color-primary-light, #93c5fd)'
                          : undefined,
                      }}
                    >
                      <span className="pk-info-btn" title="View details">ℹ</span>
                      <span className="pk-num">{r.room_no}</span>
                      <span
                        className="pk-badge"
                        style={{
                          color: isSelected ? 'var(--color-button-text)' : theme.color,
                          background: isSelected ? 'rgba(255, 255, 255, 0.25)' : theme.bg,
                        }}
                      >
                        {badgeText}
                      </span>
                      <span
                        className="pk-detail"
                        style={{
                          color: isSelected ? 'var(--color-button-text)' : undefined,
                        }}
                      >
                        {detailText}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="warn">No room free for these dates. Change the date or days.</div>
            )}

            {/* Room Details Panel / Popover */}
            {displayRoom && (
              <div
                className="room-details-panel"
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  background: 'var(--color-card, #ffffff)',
                  border: `1.5px solid ${displayRoom.is_bookable !== false ? 'var(--color-border)' : 'var(--color-warning-border, #fcd34d)'}`,
                  borderRadius: 8,
                  fontSize: 12.5,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-heading)' }}>
                      Room {displayRoom.room_no}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                      {displayRoom.type_name || displayRoom.roomType?.name || 'Standard'} · ₹{Math.round(displayRoom.type_rate || displayRoom.roomType?.rate || 0).toLocaleString('en-IN')}/day · Max {displayRoom.max_persons || displayRoom.roomType?.maxPersons || 2} persons
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 4,
                        color: BADGE_THEME[displayRoomCardData.badge]?.color || 'inherit',
                        background: BADGE_THEME[displayRoomCardData.badge]?.bg || 'transparent',
                        border: `1px solid ${BADGE_THEME[displayRoomCardData.badge]?.border || 'transparent'}`,
                      }}
                    >
                      {displayRoomCardData.badge} · {displayRoomCardData.detail}
                    </span>
                    {inspectedRoomId && inspectedRoomId !== roomId && (
                      <button
                        type="button"
                        onClick={() => setInspectedRoomId(null)}
                        title="Close details"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-secondary)',
                          fontSize: 14,
                          padding: '0 4px',
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '4px 12px',
                    padding: '7px 9px',
                    background: 'var(--color-lavender-light, #f8fafc)',
                    borderRadius: 6,
                    marginBottom: 7,
                    fontSize: 11.5,
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Current Guest: </span>
                    <strong>{displayRoom.current_stay?.guest_name || 'None (Vacant)'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Expected Checkout: </span>
                    <strong>
                      {displayRoom.current_stay
                        ? `${fd(displayRoom.current_stay.checkout_planned)}${displayRoom.current_stay.checkout_time ? ' (' + formatCheckoutHour(displayRoom.current_stay.checkout_time.split(':')[0]) + ')' : ''}`
                        : '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Housekeeping: </span>
                    <strong
                      style={{
                        color:
                          displayRoom.housekeeping_status === 'ok'
                            ? 'var(--ok)'
                            : displayRoom.housekeeping_status === 'repair'
                            ? 'var(--mnt)'
                            : 'var(--cln)',
                      }}
                    >
                      {displayRoom.housekeeping_status === 'ok'
                        ? 'Ready (Clean)'
                        : displayRoom.housekeeping_status === 'repair'
                        ? 'Repair (Maintenance)'
                        : 'Cleaning in progress'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Requested Dates: </span>
                    <strong style={{ color: displayRoom.is_bookable !== false ? 'var(--ok)' : 'var(--mnt)' }}>
                      {displayRoom.is_bookable !== false ? `Available (${fd(checkIn)} – ${fd(checkOut)})` : 'Unavailable for dates'}
                    </strong>
                  </div>
                  {displayRoom.next_reservation && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Existing Booking: </span>
                      <strong>
                        {displayRoom.next_reservation.booking_code} · {displayRoom.next_reservation.guest_name} ({fd(displayRoom.next_reservation.check_in_date)} – {fd(displayRoom.next_reservation.check_out_date)})
                      </strong>
                    </div>
                  )}
                </div>

                {displayRoom.is_bookable === false ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 9px',
                      background: 'var(--color-danger-bg, #fef2f2)',
                      border: '1px solid var(--color-danger-border, #fca5a5)',
                      borderRadius: 6,
                      color: 'var(--color-danger-text, #b91c1c)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>🚫</span>
                    <span>{displayRoomCardData.blockedReason || displayRoom.selection_blocked_reason || `Room ${displayRoom.room_no} cannot be selected for these dates.`}</span>
                  </div>
                ) : displayRoom.turnover_notice || displayRoomCardData.turnoverNotice ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 9px',
                      background: 'var(--occ-bg)',
                      border: '1px solid var(--occ-border)',
                      borderRadius: 6,
                      color: 'var(--occ)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>ℹ️</span>
                    <span>{displayRoom.turnover_notice || displayRoomCardData.turnoverNotice}</span>
                  </div>
                ) : displayRoom.housekeeping_status === 'cleaning' ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 9px',
                      background: 'var(--cln-bg)',
                      border: '1px solid var(--cln-border)',
                      borderRadius: 6,
                      color: 'var(--cln)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>⚠️</span>
                    <span>Room is currently being cleaned. Housekeeping must mark the room Ready before check-in.</span>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 9px',
                      background: 'var(--ok-bg)',
                      border: '1px solid var(--ok-border)',
                      borderRadius: 6,
                      color: 'var(--ok)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <span>✓</span>
                    <span>Room is Available + Ready for check-in on arrival.</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className={`f ${errors.rate ? 'bad' : ''}`}>
            <label htmlFor="bk-rate">Rate per day (₹) *</label>
            <input
              id="bk-rate"
              type="number"
              min="0"
              step="100"
              placeholder="Pick a room"
              {...register('rate', { required: true, min: 1, onChange: () => setRateTouched(true) })}
            />
          </div>
          <div className="f">
            <label htmlFor="bk-advance">Advance paid (₹)</label>
            <input id="bk-advance" type="number" min="0" step="100" placeholder="0" {...register('advance')} />
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

        <table className="bill">
          <tbody>
            {isEdit && (
              <>
                <tr className="sub">
                  <td>Original booking estimated total</td>
                  <td>{inr(origTotal)}</td>
                </tr>
                <tr>
                  <td>New estimated bill with GST</td>
                  <td>{inr(total)}</td>
                </tr>
                <tr className="sub" style={{ fontWeight: 600, color: deltaTotal > 0 ? 'var(--color-primary)' : deltaTotal < 0 ? 'var(--ok)' : 'inherit' }}>
                  <td>Amount difference</td>
                  <td>{deltaTotal > 0 ? `+${inr(deltaTotal)}` : deltaTotal < 0 ? `−${inr(Math.abs(deltaTotal))}` : 'No change'}</td>
                </tr>
              </>
            )}
            {!isEdit && (
              <tr>
                <td>Estimated bill with GST</td>
                <td>{inr(total)}</td>
              </tr>
            )}
            <tr className="sub">
              <td>Advance collected</td>
              <td>−{inr(Number(advance) || 0)}</td>
            </tr>
            <tr className="bal">
              <td>Balance due on arrival</td>
              <td>{inr(Math.max(0, total - (Number(advance) || 0)))}</td>
            </tr>
          </tbody>
        </table>

        <button className="btn dark big" type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Confirm booking'}
        </button>
      </form>
    </Sheet>
  );
}
