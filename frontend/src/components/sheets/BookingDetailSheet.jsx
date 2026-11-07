import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import RefundSheet from './RefundSheet.jsx';
import { useReservation, useCancelReservation, useNoShowReservation, useCancellationPreview } from '../../api/reservations';
import { useRooms, useHousekeepingAction } from '../../api/rooms';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';

export default function BookingDetailSheet({ reservationId, onClose, onCheckIn, onEdit }) {
  const { data: reservation } = useReservation(reservationId);
  const { data: preview } = useCancellationPreview(reservationId);
  const { data: roomsData } = useRooms();
  const cancel = useCancelReservation();
  const noShow = useNoShowReservation();
  const hkAction = useHousekeepingAction();
  const toast = useToast();

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundNow, setRefundNow] = useState(false);
  const [refundMethod, setRefundMethod] = useState('upi');
  const [showRefundSheet, setShowRefundSheet] = useState(false);

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
  const hkStatus = room?.housekeepingStatus || room?.housekeeping_status || reservation?.housekeeping_status || 'ok';
  const isOccupied = room?.status === 'occupied';
  const isMaintenance = hkStatus === 'repair';
  const isReady = hkStatus === 'ok';
  const isNotReady = !isReady && !isMaintenance;
  const isPending = reservation.status === 'pending';
  const isCancelled = reservation.status === 'cancelled';
  const canIn = isPending && reservation.check_in_date <= today && !isOccupied && !isMaintenance && isReady;

  const handleMarkReady = async () => {
    try {
      await hkAction.mutateAsync({ roomId: reservation.room_id, action: 'ready' });
      toast(`Room ${reservation.room_no} marked ready.`);
    } catch (err) {
      toast(err.message);
    }
  };

  const doCancel = async () => {
    try {
      const fee = preview ? preview.cancellationFee : 0;
      const refundable = preview ? preview.refundableAmount : 0;
      const refAmt = refundNow ? refundable : 0;

      await cancel.mutateAsync({
        id: reservation.id,
        reason: cancelReason || 'Cancelled by guest / front desk',
        cancellationFee: fee,
        refundAmount: refAmt,
        refundMethod,
        processRefund: refundNow,
      });

      toast(`Booking ${reservation.booking_code} cancelled. Room ${reservation.room_no} is free for those dates.`);
      setCancelling(false);
      onClose();
    } catch (err) {
      toast(err.message || 'Failed to cancel booking.');
    }
  };

  const isPastArrival = reservation.check_in_date < today;

  const doNoShow = async () => {
    try {
      await noShow.mutateAsync(reservation.id);
      onClose();
      toast(`Booking ${reservation.booking_code} marked as no-show. Room ${reservation.room_no} is free.`);
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <>
      <Sheet onClose={onClose}>
        <SheetHeader
          status={isCancelled ? 'cancelled' : 'booked'}
          badge={reservation.room_no}
          title={`Booking ${reservation.booking_code}`}
          subtitle={`Status: ${reservation.status.toUpperCase()} · Made on ${fd(reservation.created_at?.slice(0, 10) || today)}`}
          onClose={onClose}
        />
        <div className="sb">
          <dl className="info">
            <dt>Guest</dt>
            <dd>{reservation.guest_name}</dd>
            <dt>Mobile</dt>
            <dd className="mono">{reservation.guest_phone}</dd>
            <dt>Coming on</dt>
            <dd>
              {fd(reservation.check_in_date)}
              {isPending && reservation.check_in_date < today && <span style={{ color: 'var(--mnt)' }}> (not arrived)</span>}
            </dd>
            <dt>Leaves on</dt>
            <dd>{fd(reservation.check_out_date)}</dd>
            <dt>Persons</dt>
            <dd>{reservation.persons}</dd>
            <dt>Daily Rate</dt>
            <dd className="mono">{inr(reservation.rate)} / day</dd>
            <dt>Advance Paid</dt>
            <dd className="mono">
              {Number(reservation.advance_paid) > 0 ? (
                <span style={{ color: 'var(--go, #10b981)', fontWeight: 700 }}>{inr(reservation.advance_paid)} (PAID)</span>
              ) : (
                <span style={{ color: 'var(--bad, #ef4444)' }}>No payment collected yet</span>
              )}
            </dd>
            {isCancelled && (
              <>
                <dt>Cancelled on</dt>
                <dd>{fd(reservation.cancelled_at?.slice(0, 10) || today)}</dd>
                <dt>Cancellation Fee</dt>
                <dd className="mono">{inr(reservation.cancellation_fee || 0)}</dd>
                <dt>Refundable Amount</dt>
                <dd className="mono" style={{ color: 'var(--go, #10b981)', fontWeight: 700 }}>
                  {inr(reservation.refundable_amount || 0)}
                </dd>
                {reservation.cancel_reason && (
                  <>
                    <dt>Reason</dt>
                    <dd>{reservation.cancel_reason}</dd>
                  </>
                )}
                {reservation.cancelled_by_name && (
                  <>
                    <dt>Cancelled by</dt>
                    <dd>{reservation.cancelled_by_name}</dd>
                  </>
                )}
              </>
            )}
          </dl>

          {/* Cancellation History & Refund Action if already Cancelled */}
          {isCancelled && Number(reservation.refundable_amount) > 0 && (
            <div style={{ marginTop: 8, padding: 12, background: 'var(--ok-bg, #ecfdf5)', border: '1px solid var(--ok-border, #a7f3d0)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, color: 'var(--ok, #10b981)', marginBottom: 4 }}>
                Refund Eligible: {inr(reservation.refundable_amount)}
              </div>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: 12 }}>
                You can process full or partial refunds against the original payments.
              </p>
              <button className="btn blue sm" type="button" onClick={() => setShowRefundSheet(true)}>
                Manage / Process Refund
              </button>
            </div>
          )}

          {/* Room status / readiness indicator */}
          {isPending && (
            <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, background: isMaintenance ? 'var(--mnt-bg)' : isNotReady ? 'var(--cln-bg)' : isOccupied ? 'var(--occ-bg)' : 'var(--ok-bg)', border: `1px solid ${isMaintenance ? 'var(--mnt-border)' : isNotReady ? 'var(--cln-border)' : isOccupied ? 'var(--occ-border)' : 'var(--ok-border)'}` }}>
              <div>
                <strong style={{ color: isMaintenance ? 'var(--mnt)' : isNotReady ? 'var(--cln)' : isOccupied ? 'var(--occ)' : 'var(--ok)' }}>
                  Room {reservation.room_no}:
                </strong>{' '}
                {isOccupied ? 'Currently occupied by another guest.' : isMaintenance ? `Under maintenance (${room?.note || 'repairs in progress'}).` : isNotReady ? 'Not ready (cleaning in progress).' : 'Ready for check-in.'}
              </div>
              {isNotReady && (
                <button className="btn go sm" type="button" disabled={hkAction.isPending} onClick={handleMarkReady}>
                  {hkAction.isPending ? 'Updating…' : 'Mark ready'}
                </button>
              )}
            </div>
          )}

          {canIn && (
            <button className="btn go big" type="button" onClick={() => onCheckIn(reservation)}>
              Guest came · Check in
            </button>
          )}

          {isPending && !canIn && reservation.check_in_date <= today && (
            <div className="warn" style={{ color: isMaintenance ? 'var(--mnt)' : undefined, borderColor: isMaintenance ? 'var(--mnt-border)' : undefined, background: isMaintenance ? 'var(--mnt-bg)' : undefined }}>
              {isOccupied
                ? `Room ${reservation.room_no} is still occupied. Wait for checkout or change the room.`
                : isMaintenance
                  ? `Room ${reservation.room_no} is under maintenance. Check-in is blocked until maintenance is completed.`
                  : `Room ${reservation.room_no} is not ready (cleaning in progress). Mark ready before check-in.`}
            </div>
          )}

          {/* Cancellation Flow */}
          {cancelling ? (
            <div className="confirm" style={{ textAlign: 'left', padding: 14 }}>
              <b style={{ fontSize: 15, display: 'block', marginBottom: 8 }}>
                Cancel booking {reservation.booking_code}?
              </b>

              {preview ? (
                <div style={{ background: 'var(--color-bg-secondary)', padding: 10, borderRadius: 6, fontSize: 12.5, marginBottom: 12, border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="muted">Successful Advance Paid:</span>
                    <strong>{inr(preview.eligiblePaid)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="muted">Cancellation Policy:</span>
                    <span>{preview.policyRule}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span className="muted">Cancellation Fee:</span>
                    <strong style={{ color: preview.cancellationFee > 0 ? 'var(--bad, #ef4444)' : 'inherit' }}>
                      −{inr(preview.cancellationFee)}
                    </strong>
                  </div>
                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13.5 }}>
                    <span>Refundable Amount:</span>
                    <span style={{ color: 'var(--ok, #10b981)' }}>{inr(preview.refundableAmount)}</span>
                  </div>

                  {preview.pendingPayments && preview.pendingPayments.length > 0 && (
                    <div style={{ marginTop: 6, color: 'var(--mnt, #f59e0b)', fontSize: 11.5 }}>
                      ⚠️ {preview.pendingPayments.length} pending payment(s) excluded from refundable balance.
                    </div>
                  )}
                </div>
              ) : (
                <div className="skel" style={{ height: 60, marginBottom: 10 }} />
              )}

              <div className="f" style={{ marginBottom: 10 }}>
                <label>Cancellation Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Guest called to cancel due to travel change"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              {preview && preview.refundableAmount > 0 && (
                <div style={{ marginBottom: 12, padding: 8, background: 'var(--color-bg-primary)', borderRadius: 6, border: '1px solid var(--color-border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={refundNow}
                      onChange={(e) => setRefundNow(e.target.checked)}
                    />
                    Process refund of {inr(preview.refundableAmount)} immediately
                  </label>
                  {refundNow && (
                    <div style={{ marginTop: 8 }}>
                      <span className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Refund Method:</span>
                      <div className="seg">
                        {['upi', 'cash', 'card'].map((m) => (
                          <button key={m} type="button" aria-pressed={refundMethod === m} onClick={() => setRefundMethod(m)}>
                            {m.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="row2">
                <button className="btn red" type="button" disabled={cancel.isPending} onClick={doCancel}>
                  {cancel.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
                <button className="btn" type="button" onClick={() => setCancelling(false)}>
                  Go Back
                </button>
              </div>
            </div>
          ) : isPending ? (
            <div className="row2" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn" type="button" onClick={() => onEdit(reservation)}>
                Change dates / room
              </button>
              {isPastArrival && (
                <button className="btn" type="button" disabled={noShow.isPending} onClick={doNoShow}>
                  Mark no-show
                </button>
              )}
              <button className="btn red" type="button" onClick={() => setCancelling(true)}>
                Cancel booking
              </button>
            </div>
          ) : null}
        </div>
      </Sheet>

      {showRefundSheet && (
        <RefundSheet
          reservationId={reservation.id}
          onClose={() => setShowRefundSheet(false)}
          onSuccess={() => setShowRefundSheet(false)}
        />
      )}
    </>
  );
}
