import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useReservation, useCancelReservation } from '../../api/reservations';
import { useRooms } from '../../api/rooms';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';

export default function BookingDetailSheet({ reservationId, onClose, onCheckIn, onEdit }) {
  const { data: reservation } = useReservation(reservationId);
  const { data: roomsData } = useRooms();
  const cancel = useCancelReservation();
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');

  if (!reservation) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="booked" title="Booking" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 120 }} />
        </div>
      </Sheet>
    );
  }

  const today = todayIso();
  const room = roomsData?.rooms.find((r) => r.id === reservation.room_id);
  const isPending = reservation.status === 'pending';
  const canIn = isPending && reservation.check_in_date <= today && room?.status === 'booked';

  const maxRefund = Number(reservation.advance_amount) || 0;

  const doCancel = async () => {
    const amount = Number(refundAmount) || 0;
    if (amount > maxRefund) {
      toast(`Refund cannot exceed the advance paid (${inr(maxRefund)}).`);
      return;
    }
    try {
      await cancel.mutateAsync({ id: reservation.id, reason: 'Cancelled by front desk', refundAmount: amount, refundMethod: 'cash' });
      onClose();
      toast(`Booking ${reservation.booking_code} cancelled. Room ${reservation.room_no} is free on those dates.`);
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="booked" badge={reservation.room_no} title={`Booking ${reservation.booking_code}`} subtitle={`made on ${fd(reservation.created_at?.slice(0, 10) || today)}`} onClose={onClose} />
      <div className="sb">
        <dl className="info">
          <dt>Guest</dt>
          <dd>{reservation.guest_name}</dd>
          <dt>Mobile</dt>
          <dd className="mono">{reservation.guest_phone}</dd>
          <dt>Coming on</dt>
          <dd>
            {fd(reservation.check_in_date)}
            {reservation.check_in_date < today && <span style={{ color: 'var(--mnt)' }}> (not came)</span>}
          </dd>
          <dt>Leaves on</dt>
          <dd>{fd(reservation.check_out_date)}</dd>
          <dt>Persons</dt>
          <dd>{reservation.persons}</dd>
          <dt>Rate</dt>
          <dd className="mono">{inr(reservation.rate)} / day</dd>
          <dt>Advance</dt>
          <dd className="mono">
            {inr(reservation.advance_amount)} ({reservation.advance_method?.toUpperCase()})
          </dd>
        </dl>

        {canIn ? (
          <button className="btn go big" type="button" onClick={() => onCheckIn(reservation)}>
            Guest came · Check in
          </button>
        ) : (
          reservation.check_in_date <= today && (
            <div className="warn">
              Room {reservation.room_no} is {room?.status === 'occupied' ? 'still occupied' : 'not ready yet'}. Make it ready, or change the room.
            </div>
          )
        )}

        {!isPending ? (
          <div className="warn">
            This booking is {reservation.status.replace('_', '-')} and can no longer be changed or cancelled.
          </div>
        ) : cancelling ? (
          <div className="confirm">
            <b>Cancel booking {reservation.booking_code}?</b>
            {Number(reservation.advance_amount) > 0 ? (
              <>
                <span className="muted">Advance paid was {inr(reservation.advance_amount)}. Refund amount, if any:</span>
                <input type="number" min="0" max={maxRefund} step="100" placeholder="0" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
              </>
            ) : (
              <span className="muted">No advance was paid.</span>
            )}
            <div className="row2">
              <button className="btn red" type="button" disabled={cancel.isPending} onClick={doCancel}>
                Yes, cancel
              </button>
              <button className="btn" type="button" onClick={() => setCancelling(false)}>
                No
              </button>
            </div>
          </div>
        ) : (
          <div className="row2">
            <button className="btn" type="button" onClick={() => onEdit(reservation)}>
              Change dates / room
            </button>
            <button className="btn red" type="button" onClick={() => setCancelling(true)}>
              Cancel booking
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
