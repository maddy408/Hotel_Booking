import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useGuestLookup } from '../../api/guests';
import { useDirectCheckIn } from '../../api/stays';
import { useCheckInReservation } from '../../api/reservations';
import { useSettings } from '../../api/settings';
import { useToast } from '../../context/ToastContext.jsx';
import { addDaysIso, estimateGstRate, fd, inr, todayIso } from '../../lib/format';

const IDS = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport'];

/**
 * Handles both "free room tapped" direct check-in and "guest came" from a pending
 * booking (reservation prop set) — the latter always checks in as of today, per the
 * business rule, regardless of the booking's original arrival date.
 */
export default function CheckInSheet({ room, reservation, onClose }) {
  const isFromReservation = !!reservation;
  const { data: settings } = useSettings();
  const toast = useToast();
  const directCheckIn = useDirectCheckIn();
  const checkInFromReservation = useCheckInReservation();

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
          advance: reservation.advance_amount,
          pay: 'cash',
        }
      : {
          phone: '',
          name: '',
          idType: 'Aadhaar',
          idNo: '',
          city: '',
          persons: 2,
          days: 1,
          rate: room.roomType.rate,
          advance: '',
          pay: 'cash',
        },
  });

  const phone = watch('phone');
  const days = watch('days');
  const rate = watch('rate');
  const advance = watch('advance');
  const persons = watch('persons');
  const pay = watch('pay');

  const { data: lookup } = useGuestLookup(!isFromReservation ? phone : '');
  const [matchedGuestId, setMatchedGuestId] = useState(null);

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
  const adv = Number(advance) || 0;

  const onSubmit = async (values) => {
    try {
      if (isFromReservation) {
        await checkInFromReservation.mutateAsync(reservation.id);
        toast(`${reservation.guest_name.split(' ')[0]} checked in to Room ${reservation.room_no}.`);
      } else {
        await directCheckIn.mutateAsync({
          roomId: room.id,
          phone: values.phone,
          name: values.name,
          idProofType: values.idType,
          idProofNumber: values.idNo,
          city: values.city,
          persons: Number(values.persons),
          days: Number(values.days),
          rate: Number(values.rate),
          advanceAmount: Number(values.advance) || 0,
          advanceMethod: values.pay,
        });
        toast(`${values.name} checked in to Room ${room.roomNo}.`);
      }
      onClose();
    } catch (err) {
      toast(err.message);
    }
  };

  const roomNo = room?.roomNo ?? reservation?.room_no;
  const roomTypeName = room?.roomType?.name ?? '';
  const isPending = directCheckIn.isPending || checkInFromReservation.isPending;

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="free" badge={roomNo} title="Check in" subtitle={roomTypeName} onClose={onClose} />
      <form className="sb" onSubmit={handleSubmit(onSubmit)}>
        {isFromReservation ? (
          <div className="warn">
            Checking in booking {reservation.booking_code}. Advance already paid is included.
          </div>
        ) : (
          <div className="fg">
            <div className={`f full ${errors.phone ? 'bad' : ''}`}>
              <label htmlFor="ci-phone">
                Mobile number <i>*</i>
              </label>
              <input
                id="ci-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10 digits"
                autoComplete="off"
                {...register('phone', { required: true, pattern: /^\d{10}$/ })}
              />
              {errors.phone && <span className="err">Enter a 10-digit mobile number.</span>}
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
            <div className="f">
              <label>Persons *</label>
              <div className="step">
                <button type="button" onClick={() => setValue('persons', Math.max(1, (Number(persons) || 1) - 1))} aria-label="Less">
                  −
                </button>
                <input type="number" readOnly {...register('persons')} />
                <button type="button" onClick={() => setValue('persons', (Number(persons) || 1) + 1)} aria-label="More">
                  +
                </button>
              </div>
            </div>
            <div className="f">
              <label>Days *</label>
              <div className="step">
                <button type="button" onClick={() => setValue('days', Math.max(1, (Number(days) || 1) - 1))} aria-label="Less">
                  −
                </button>
                <input type="number" readOnly {...register('days')} />
                <button type="button" onClick={() => setValue('days', (Number(days) || 1) + 1)} aria-label="More">
                  +
                </button>
              </div>
            </div>
            <div className="f">
              <label htmlFor="ci-rate">Rate per day (₹) *</label>
              <input id="ci-rate" type="number" min="0" step="100" {...register('rate', { required: true, min: 1 })} />
            </div>
            <div className="f">
              <label htmlFor="ci-advance">Advance paid (₹)</label>
              <input id="ci-advance" type="number" min="0" step="100" placeholder="0" {...register('advance')} />
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
                {days || 1} day{(Number(days) || 1) > 1 ? 's' : ''} × {inr(rate)} <span className="muted">(leaves {fd(out)}, 12 noon)</span>
              </td>
              <td>{inr(roomAmt)}</td>
            </tr>
            <tr className="sub">
              <td>GST {Math.round(gstRate * 100)}%</td>
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

        <button className="btn go big" type="submit" disabled={isPending}>
          {isPending ? 'Checking in…' : `Check in to Room ${roomNo}`}
        </button>
      </form>
    </Sheet>
  );
}
