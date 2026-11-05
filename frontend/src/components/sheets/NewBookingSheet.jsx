import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useFreeRooms, useCreateReservation, useUpdateReservation } from '../../api/reservations';
import { useGuestLookup } from '../../api/guests';
import { useRoomTypes } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../../context/ToastContext.jsx';
import { addDaysIso, estimateGstRate, fd, inr, nightsBetween, todayIso } from '../../lib/format';

export default function NewBookingSheet({ editReservation, presetGuest, onClose }) {
  const isEdit = !!editReservation;
  const { data: roomTypes } = useRoomTypes();
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
    if (freeRooms && roomId && !freeRooms.some((r) => r.id === roomId)) {
      setValue('roomId', null);
    }
  }, [freeRooms, roomId, setValue]);

  const rateNum = Number(rate) || 0;
  const gstRate = estimateGstRate(rateNum, settings?.settings);
  const total = (Number(days) || 1) * rateNum * (1 + gstRate);

  const onSubmit = async (values) => {
    if (!values.roomId) {
      toast('Pick a room.');
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
          <div className="f">
            <label>Persons *</label>
            <div className="step">
              <button type="button" onClick={() => setValue('persons', Math.max(1, (Number(persons) || 1) - 1))}>
                −
              </button>
              <input type="number" readOnly {...register('persons')} />
              <button type="button" onClick={() => setValue('persons', (Number(persons) || 1) + 1)}>
                +
              </button>
            </div>
          </div>
          <div className="f">
            <label>Leaves on</label>
            <input type="text" value={`${fd(checkOut)}, 12 noon`} disabled />
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
              Pick a room <i>*</i> <span className="muted" style={{ fontWeight: 500 }}>· {freeRooms?.length ?? 0} free for these dates</span>
            </label>
            {freeRooms?.length ? (
              <div className="pks">
                {freeRooms.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="pk"
                    aria-pressed={roomId === r.id}
                    title={r.type_name}
                    onClick={() => {
                      setValue('roomId', r.id);
                      if (!rateTouched) setValue('rate', Number(r.type_rate));
                    }}
                  >
                    {r.room_no}
                  </button>
                ))}
              </div>
            ) : (
              <div className="warn">No room free for these dates. Change the date or days.</div>
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
