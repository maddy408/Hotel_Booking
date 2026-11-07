import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useFreeRooms, useCreateReservation, useUpdateReservation } from '../../api/reservations';
import { useGuestLookup } from '../../api/guests';
import { useRoomTypes, useRooms } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../../context/ToastContext.jsx';
import { addDaysIso, estimateGstRate, fd, inr, nightsBetween, todayIso } from '../../lib/format';

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
          phone: editReservation.guest_phone,
          name: editReservation.guest_name,
          checkIn: editReservation.check_in_date < todayIso() ? todayIso() : editReservation.check_in_date,
          days: nightsBetween(editReservation.check_in_date, editReservation.check_out_date),
          persons: editReservation.persons,
          typeFilter: 'all',
          roomId: editReservation.room_id,
          rate: editReservation.rate,
          advance: editReservation.advance_amount,
          pay: editReservation.advance_method,
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

  const availableReadyRooms = freeRooms?.filter((r) => r.booking_status === 'available_ready') || [];
  const availableNotReadyRooms = freeRooms?.filter((r) => r.booking_status === 'available_not_ready') || [];
  const unavailableRooms = freeRooms?.filter((r) => r.booking_status === 'unavailable') || [];
  const maintenanceRooms = freeRooms?.filter((r) => r.booking_status === 'maintenance') || [];
  const totalBookable = availableReadyRooms.length + availableNotReadyRooms.length;

  const rateNum = Number(rate) || 0;
  const gstRate = estimateGstRate(rateNum, settings?.settings);
  const total = (Number(days) || 1) * rateNum * (1 + gstRate);

  const selectedRoom = (freeRooms && freeRooms.find((r) => r.id === roomId))
    || (roomsData?.rooms && roomsData.rooms.find((r) => r.id === roomId))
    || (isEdit && editReservation?.room_id === roomId ? editReservation : null);

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
      if (chosenRoom && chosenRoom.booking_status === 'maintenance') {
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
        });
        toast('Booking updated.');
      } else {
        const result = await create.mutateAsync({
          roomId: values.roomId,
          phone: values.phone,
          name: values.name,
          checkIn: values.checkIn,
          checkOut: checkOutDate,
          persons: Number(values.persons),
          rate: Number(values.rate),
          advanceAmount: Number(values.advance) || 0,
          advanceMethod: values.pay,
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
      <SheetHeader status="booked" badge={isEdit ? editReservation.booking_code : 'NEW'} title={isEdit ? 'Change booking' : 'New booking'} subtitle="Phone call or walk-in booking" onClose={onClose} />
      <form className="sb" onSubmit={handleSubmit(onSubmit)}>
        <div className="fg">
          {!isEdit && (
            <>
              <div className={`f full ${errors.phone ? 'bad' : ''}`}>
                <label htmlFor="bk-phone">
                  Mobile number <i>*</i>
                </label>
                <input id="bk-phone" type="tel" inputMode="numeric" maxLength={10} placeholder="10 digits" {...register('phone', { required: true, pattern: /^\d{10}$/ })} />
                {errors.phone && <span className="err">Enter a 10-digit mobile number.</span>}
              </div>
              {matchedGuestId && <div className="found f full">Old guest found. Name filled in.</div>}
            </>
          )}
          <div className={`f full ${errors.name ? 'bad' : ''}`}>
            <label htmlFor="bk-name">
              Guest name <i>*</i>
            </label>
            <input id="bk-name" type="text" disabled={isEdit} {...register('name', { required: true })} />
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
            <input type="text" value={`${fd(checkOut)}, 12 noon`}  />
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
                Available + Ready ({availableReadyRooms.length})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--cln)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--cln)' }} />
                Available + Not Ready ({availableNotReadyRooms.length})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--muted)' }} />
                Unavailable ({unavailableRooms.length})
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--mnt)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mnt)' }} />
                Maintenance ({maintenanceRooms.length})
              </span>
            </div>
            {freeRooms?.length ? (
              <div className="pks" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {freeRooms.map((r) => {
                  const isReady = r.booking_status === 'available_ready';
                  const isNotReady = r.booking_status === 'available_not_ready';
                  const isMnt = r.booking_status === 'maintenance';
                  const isSelected = roomId === r.id;
                  const disabled = !r.is_bookable;

                  const badgeText = isReady ? 'Ready' : isNotReady ? 'Not Ready' : isMnt ? 'Maint' : 'Booked';
                  const badgeColor = isReady ? 'var(--ok)' : isNotReady ? 'var(--cln)' : isMnt ? 'var(--mnt)' : 'var(--muted)';
                  const badgeBg = isReady ? 'var(--ok-bg)' : isNotReady ? 'var(--cln-bg)' : isMnt ? 'var(--mnt-bg)' : 'var(--color-navigation)';

                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`pk ${isSelected ? 'active' : ''}`}
                      disabled={disabled}
                      aria-pressed={isSelected}
                      title={`${r.room_no} (${r.type_name}): ${r.status_label || (disabled ? 'Cannot book' : 'Available')}`}
                      onClick={() => {
                        setValue('roomId', r.id);
                        if (!rateTouched) setValue('rate', Number(r.type_rate));
                      }}
                      style={{
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        minWidth: 58,
                        padding: '6px 8px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.5 : 1,
                        borderColor: isSelected ? 'var(--color-primary)' : isNotReady ? 'var(--cln-border)' : isMnt ? 'var(--mnt-border)' : undefined,
                        background: isSelected ? 'var(--color-primary)' : isNotReady ? 'var(--color-card)' : undefined,
                      }}
                    >
                      <span style={{ fontWeight: 700, color: isSelected ? 'var(--color-button-text)' : 'inherit' }}>{r.room_no}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 4px',
                          borderRadius: 3,
                          lineHeight: 1.1,
                          color: isSelected ? 'var(--color-button-text)' : badgeColor,
                          background: isSelected ? 'rgba(255,255,255,0.25)' : badgeBg,
                        }}
                      >
                        {badgeText}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="warn">No room free for these dates. Change the date or days.</div>
            )}
            {selectedRoom && selectedRoom.booking_status === 'available_not_ready' && (
              <div className="warn" style={{ marginTop: 10, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>
                  ⚠️ <b>Room {selectedRoom.room_no} ({selectedRoom.type_name || selectedRoom.roomType?.name || 'Standard'})</b> is <strong>Available</strong> for these dates, but currently <strong>Not Ready ({selectedRoom.housekeeping_status === 'cleaning' ? 'Cleaning' : 'Dirty'})</strong>. You can book it now, but housekeeping must mark the room Ready before check-in.
                </span>
              </div>
            )}
            {selectedRoom && selectedRoom.booking_status === 'available_ready' && (
              <div style={{ marginTop: 10, padding: '6px 12px', background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: 6, fontSize: 13, color: 'var(--ok)' }}>
                ✓ <b>Room {selectedRoom.room_no}</b> is <strong>Available + Ready</strong> for check-in on arrival.
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
            <tr>
              <td>Estimated bill with GST</td>
              <td>{inr(total)}</td>
            </tr>
            <tr className="sub">
              <td>Advance</td>
              <td>−{inr(Number(advance) || 0)}</td>
            </tr>
            <tr className="bal">
              <td>Balance on arrival</td>
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
