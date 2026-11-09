import { useState, useMemo } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useReservationRefundSummary, useProcessReservationRefund } from '../../api/reservations';
import { useStayRefundSummary, useProcessStayRefund } from '../../api/stays';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { inr, fd, todayIso } from '../../lib/format';

export default function RefundSheet({ reservationId, stayId, onClose, onSuccess }) {
  const { user } = useAuth();
  const toast = useToast();

  const isRes = !!reservationId;
  const resQuery = useReservationRefundSummary(reservationId);
  const stayQuery = useStayRefundSummary(stayId);

  const data = isRes ? resQuery.data : stayQuery.data;
  const isLoading = isRes ? resQuery.isLoading : stayQuery.isLoading;

  const processResRefund = useProcessReservationRefund();
  const processStayRefund = useProcessStayRefund();
  const mutation = isRes ? processResRefund : processStayRefund;

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [reason, setReason] = useState('');
  const [parentPaymentId, setParentPaymentId] = useState('');
  const [status, setStatus] = useState('successful');
  const [confirming, setConfirming] = useState(false);

  const eligibleRefund = useMemo(() => {
    if (!data) return 0;
    return isRes
      ? Number(data.finalEligibleRefund || 0)
      : Number(data.finalEligibleRefundAmount || 0);
  }, [data, isRes]);

  if (isLoading || !data) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="booked" title="Process Refund" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 160 }} />
        </div>
      </Sheet>
    );
  }

  const reservation = data.reservation;
  const stay = data.stay;
  const title = isRes
    ? `Refund for Booking ${reservation?.booking_code || ''}`
    : `Refund for Room ${stay?.room_no || ''} Stay`;

  const successfulPayments = data.successfulPayments || [];
  const pendingPayments = data.pendingPayments || [];
  const failedPayments = data.failedPayments || [];
  const refundHistory = data.refundHistory || [];

  const handleFullRefund = () => {
    setAmount(String(eligibleRefund));
  };

  const selectedPayment = parentPaymentId
    ? successfulPayments.find((p) => String(p.id) === String(parentPaymentId))
    : null;
  const maxForSelected = selectedPayment
    ? Math.min(eligibleRefund, Number(selectedPayment.refundable_balance ?? selectedPayment.amount))
    : eligibleRefund;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const numAmt = Number(amount);
    if (!numAmt || numAmt <= 0) {
      toast('Please enter a valid refund amount.');
      return;
    }
    if (status === 'successful' && numAmt > eligibleRefund) {
      toast(`Refund amount cannot exceed eligible balance of ${inr(eligibleRefund)}.`);
      return;
    }
    if (selectedPayment && status === 'successful' && numAmt > maxForSelected) {
      toast(`Refund amount cannot exceed remaining balance of ${inr(maxForSelected)} on payment #${selectedPayment.id}.`);
      return;
    }

    try {
      const payload = {
        amount: numAmt,
        method,
        reason: reason || (isRes ? 'Cancellation refund' : 'Early checkout refund'),
        parentPaymentId: parentPaymentId ? Number(parentPaymentId) : null,
        status,
      };

      if (isRes) {
        await processResRefund.mutateAsync({ id: reservationId, ...payload });
      } else {
        await processStayRefund.mutateAsync({ stayId, ...payload });
      }

      toast(`Refund of ${inr(numAmt)} recorded with status "${status.toUpperCase()}".`);
      setConfirming(false);
      setAmount('');
      setReason('');
      if (onSuccess) onSuccess();
    } catch (err) {
      toast(err.message || 'Refund processing failed.');
    }
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        status="booked"
        badge={isRes ? reservation?.room_no : stay?.room_no}
        title={title}
        subtitle={`Processed by ${user?.name || 'Authorized Staff'} on ${fd(todayIso())}`}
        onClose={onClose}
      />
      <div className="sb" style={{ gap: 16 }}>
        {/* Financial Highlights */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          <div className="panel" style={{ padding: '10px 12px' }}>
            <span className="muted" style={{ fontSize: 11 }}>Successful Payments</span>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
              {inr(data.totalSuccessfulPaid || data.totalSuccessfulPayments || 0)}
            </div>
          </div>
          {isRes && (
            <div className="panel" style={{ padding: '10px 12px' }}>
              <span className="muted" style={{ fontSize: 11 }}>Cancellation Fee</span>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: 'var(--mnt, #f59e0b)' }}>
                {inr(data.cancellationFee || 0)}
              </div>
            </div>
          )}
          <div className="panel" style={{ padding: '10px 12px' }}>
            <span className="muted" style={{ fontSize: 11 }}>Previously Refunded</span>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: 'var(--bad, #ef4444)' }}>
              {inr(data.totalRefunded || data.previouslyRefundedAmount || 0)}
            </div>
          </div>
          <div className="panel" style={{ padding: '10px 12px', background: eligibleRefund > 0 ? 'var(--ok-bg, #ecfdf5)' : undefined, borderColor: eligibleRefund > 0 ? 'var(--ok-border, #a7f3d0)' : undefined }}>
            <span className="muted" style={{ fontSize: 11 }}>Eligible Refund</span>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: eligibleRefund > 0 ? 'var(--ok, #10b981)' : 'inherit' }}>
              {inr(eligibleRefund)}
            </div>
          </div>
        </div>

        {/* Original Successful Payments Table */}
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }} className="muted">
            Original Payments Available for Refund
          </h4>
          {successfulPayments.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>No successful payments on record to refund.</p>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Ref #</th>
                    <th style={{ padding: '6px 8px' }}>Type</th>
                    <th style={{ padding: '6px 8px' }}>Method</th>
                    <th style={{ padding: '6px 8px' }}>Paid</th>
                    <th style={{ padding: '6px 8px' }}>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {successfulPayments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>#{p.id}</td>
                      <td style={{ padding: '6px 8px', textTransform: 'capitalize' }}>{p.type}</td>
                      <td style={{ padding: '6px 8px', textTransform: 'uppercase' }}>{p.method}</td>
                      <td style={{ padding: '6px 8px' }}>{inr(p.amount)}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--ok, #10b981)' }}>
                        {inr(p.refundable_balance ?? p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Separate display for Pending or Failed Payments if any */}
        {(pendingPayments.length > 0 || failedPayments.length > 0) && (
          <div style={{ padding: 10, borderRadius: 6, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: 12 }}>
            <strong style={{ color: 'var(--mnt, #f59e0b)' }}>⚠️ Non-Refundable Transactions:</strong>
            {pendingPayments.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>Pending ({pendingPayments.length}): </strong>
                {pendingPayments.map((p) => `#${p.id} (${inr(p.amount)} via ${p.method.toUpperCase()})`).join(', ')}
                <span className="muted"> — pending transactions must succeed before refunding.</span>
              </div>
            )}
            {failedPayments.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>Failed ({failedPayments.length}): </strong>
                {failedPayments.map((p) => `#${p.id} (${inr(p.amount)})`).join(', ')}
                <span className="muted"> — failed payments cannot be refunded.</span>
              </div>
            )}
          </div>
        )}

        {/* Refund Processing Form */}
        {eligibleRefund > 0 ? (
          <div className="panel" style={{ padding: 14 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 14 }}>Process New Refund</h4>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn sm" type="button" onClick={handleFullRefund}>
                Full Refund ({inr(eligibleRefund)})
              </button>
              <button
                className="btn sm"
                type="button"
                onClick={() => setAmount(String(Math.round(eligibleRefund / 2)))}
              >
                50% Partial ({inr(Math.round(eligibleRefund / 2))})
              </button>
            </div>

            <div className="f" style={{ marginBottom: 10 }}>
              <label>Refund Amount (₹)</label>
              <input
                type="number"
                min="1"
                max={maxForSelected}
                step="1"
                placeholder={`Max ${maxForSelected}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="f" style={{ marginBottom: 10 }}>
              <label>Refund Payment Method</label>
              <div className="seg">
                {['upi', 'cash', 'card'].map((m) => (
                  <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}>
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="f" style={{ marginBottom: 10 }}>
              <label>Refund Against Original Payment</label>
              <select value={parentPaymentId} onChange={(e) => setParentPaymentId(e.target.value)}>
                <option value="">Auto-select (Earliest available)</option>
                {successfulPayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    Payment #{p.id} ({p.method.toUpperCase()} - {inr(p.amount)}, remaining {inr(p.refundable_balance ?? p.amount)})
                  </option>
                ))}
              </select>
            </div>

            <div className="f" style={{ marginBottom: 10 }}>
              <label>Refund Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="successful">Successful (Completed & confirmed)</option>
                <option value="pending">Pending (Manual bank/UPI processing)</option>
                <option value="failed">Failed (Gateway or bank rejection)</option>
              </select>
            </div>

            <div className="f" style={{ marginBottom: 12 }}>
              <label>Refund Reason / Note</label>
              <input
                type="text"
                placeholder="e.g. Cancellation refund requested by guest"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {confirming ? (
              <div className="confirm">
                <b>Confirm refund of {inr(Number(amount) || 0)} by {method.toUpperCase()}?</b>
                <span className="muted">
                  Status: <strong>{status.toUpperCase()}</strong>. Authorized by {user?.name || 'Staff'}.
                </span>
                <div className="row2" style={{ marginTop: 8 }}>
                  <button
                    className="btn blue"
                    type="button"
                    disabled={mutation.isPending}
                    onClick={handleSubmit}
                  >
                    {mutation.isPending ? 'Processing...' : 'Yes, record refund'}
                  </button>
                  <button className="btn" type="button" onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn blue big"
                type="button"
                disabled={!Number(amount) || Number(amount) <= 0}
                onClick={() => setConfirming(true)}
              >
                Record {inr(Number(amount) || 0)} Refund
              </button>
            )}
          </div>
        ) : (
          <div className="warn" style={{ margin: 0 }}>
            No remaining eligible refund balance. All eligible payments have already been settled or refunded.
          </div>
        )}

        {/* Past Refund Records History */}
        {refundHistory.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }} className="muted">
              Refund History ({refundHistory.length})
            </h4>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Date</th>
                    <th style={{ padding: '6px 8px' }}>Amount</th>
                    <th style={{ padding: '6px 8px' }}>Method</th>
                    <th style={{ padding: '6px 8px' }}>Status</th>
                    <th style={{ padding: '6px 8px' }}>Processed By</th>
                    <th style={{ padding: '6px 8px' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {refundHistory.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px' }}>{fd(r.created_at?.slice(0, 10))}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{inr(r.amount)}</td>
                      <td style={{ padding: '6px 8px', textTransform: 'uppercase' }}>{r.method}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              r.status === 'successful'
                                ? 'var(--ok-bg, #ecfdf5)'
                                : r.status === 'pending'
                                  ? 'var(--cln-bg, #fef3c7)'
                                  : 'var(--bad-bg, #fee2e2)',
                            color:
                              r.status === 'successful'
                                ? 'var(--ok, #10b981)'
                                : r.status === 'pending'
                                  ? 'var(--cln, #d97706)'
                                  : 'var(--bad, #ef4444)',
                          }}
                        >
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px' }}>{r.processed_by_name || 'Staff'}</td>
                      <td style={{ padding: '6px 8px' }} className="muted">{r.reason || r.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button className="btn" type="button" onClick={onClose} style={{ alignSelf: 'flex-start' }}>
          Close
        </button>
      </div>
    </Sheet>
  );
}

