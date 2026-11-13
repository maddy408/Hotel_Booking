import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useGuestLookup } from '../../api/guests';
import { useDirectCheckIn } from '../../api/stays';
import { useCheckInReservation, useRecordAdvancePayment } from '../../api/reservations';
import { useRooms, useHousekeepingAction } from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { useToast } from '../../context/ToastContext.jsx';
import { addDaysIso, estimateGstRate, fd, formatCheckoutHour, inr, todayIso } from '../../lib/format';

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
    ?? room?.max_persons
    ?? reservation?.max_persons
    ?? 2;

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

  const [serverPersonsError, setServerPersonsError] = useState('');
  const personCount = Number(persons) || 1;
  const isPersonsExceeded = roomMaxPersons != null && personCount > Number(roomMaxPersons);
  const maxPersonsMsg = roomMaxPersons != null ? `This room allows a maximum of ${roomMaxPersons} persons.` : '';
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

    if (isFromReservation) {
      if (confirmedAdvance <= 0) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
    } else {
      const advVal = values.advance === '' || values.advance === null ? 0 : Number(values.advance);
      if (isNaN(advVal) || advVal <= 0) {
        setServerAdvanceError(ADVANCE_REQUIRED_MSG);
        return;
      }
    }

    try {
      if (isFromReservation) {
        await checkInFromReservation.mutateAsync(reservation.id);
        toast(`${reservation.guest_name.split(' ')[0]} checked in to Room ${reservation.room_no}.`);
      } else {
        const advVal = values.advance === '' || values.advance === null ? 0 : Number(values.advance);
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
          advanceAmount: advVal,
          advanceMethod: values.pay,
        });
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
      <SheetHeader status="free" badge={roomNo} title="Check in" subtitle={roomTypeName} onClose={onClose} />
      <form className="sb" onSubmit={handleSubmit(onSubmit)}>
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
                  aria-label="Less"
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
                  aria-label="More"
                >
                  +
                </button>
              </div>
              {personsError && <span className="err">{personsError}</span>}
            </div>
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
                      step="100"
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
            <div className={`f full ${errors.phone ? 'bad' : ''}`}>
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
                {...register('phone', { required: true, pattern: /^[6-9]\d{9}$/ })}
              />
              {errors.phone && <span className="err">Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.</span>}
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
            <div className={`f ${personsError ? 'bad' : ''}`}>
              <label>Persons *</label>
              <div className="step">
                <button
                  type="button"
                  onClick={() => {
                    setServerPersonsError('');
                    setValue('persons', Math.max(1, (Number(persons) || 1) - 1));
                  }}
                  aria-label="Less"
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
                  aria-label="More"
                >
                  +
                </button>
              </div>
              {personsError && <span className="err">{personsError}</span>}
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
            <div className={`f ${advanceError ? 'bad' : ''}`}>
              <label htmlFor="ci-advance">
                Advance paid (₹) <i>*</i>
              </label>
              <input
                id="ci-advance"
                type="number"
                min="0"
                step="100"
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

        <button className="btn go big" type="submit" disabled={isPending || !isRoomReady || isRoomOccupied}>
          {isPending ? 'Checking in…' : isRoomOccupied ? `Room ${roomNo} is occupied` : !isRoomReady ? `Room ${roomNo} not ready for check-in` : `Check in to Room ${roomNo}`}
        </button>
      </form>
    </Sheet>
  );
}
