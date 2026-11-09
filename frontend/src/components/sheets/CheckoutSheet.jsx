import { useState, useMemo } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import RefundSheet from './RefundSheet.jsx';
import {
  useStay,
  useStayBill,
  useAddExtra,
  useRemoveExtra,
  useExtendStay,
  useCheckout,
  useEarlyCheckoutPreview,
  useApplyDiscount,
} from '../../api/stays';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

export default function CheckoutSheet({ stayId, onClose }) {
  const { data: stay, isError: isStayError, error: stayError } = useStay(stayId);
  const { data: rawBill, isError: isBillError, error: billError } = useStayBill(stayId);

  const [actualCheckoutDate, setActualCheckoutDate] = useState(todayIso());
  const [discountVal, setDiscountVal] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  const { data: previewData } = useEarlyCheckoutPreview(stayId, {
    checkoutDate: actualCheckoutDate,
    discount: discountVal !== '' ? Number(discountVal) : undefined,
  });

  const addExtra = useAddExtra();
  const removeExtra = useRemoveExtra();
  const extend = useExtendStay();
  const checkout = useCheckout();
  const applyDiscount = useApplyDiscount();
  const toast = useToast();

  const [xLabel, setXLabel] = useState('Food');
  const [xAmount, setXAmount] = useState('');
  const [pay, setPay] = useState('cash');
  const [refundReason, setRefundReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [completedResult, setCompletedResult] = useState(null);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const bill = previewData?.bill || rawBill;

  if (!stayId || isStayError || isBillError) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Billing Details" onClose={onClose} />
        <div className="sb">
          <div className="panel empty" style={{ margin: 16 }}>
            {stayError?.message || billError?.message || 'Billing details not found for this booking.'}
            <div style={{ marginTop: 12 }}>
              <button className="btn sm" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

  if (!stay || !bill) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Check out" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 140 }} />
        </div>
      </Sheet>
    );
  }

  const isCheckedOut = stay.status === 'checked_out';
  const today = todayIso();
  const isEarly = !isCheckedOut && stay.checkout_planned > actualCheckoutDate;

  const addExtraCharge = async () => {
    const amt = Number(xAmount);
    if (!(amt > 0)) {
      toast('Enter the amount.');
      return;
    }
    await addExtra.mutateAsync({ stayId, label: xLabel, amount: amt, isTaxable: false });
    setXAmount('');
    setConfirming(false);
  };

  const handleApplyDiscount = async () => {
    const num = Number(discountVal);
    if (isNaN(num) || num < 0) {
      toast('Please enter a valid discount amount.');
      return;
    }
    try {
      await applyDiscount.mutateAsync({ stayId, amount: num, reason: discountReason || 'Discretionary discount' });
      toast(`Discount of ${inr(num)} applied.`);
      setShowDiscountInput(false);
    } catch (err) {
      toast(err.message || 'Failed to apply discount.');
    }
  };

  const bal = bill.balance;

  const doCheckout = async () => {
    try {
      const amtToPass = bal > 0 ? bal : 0;
      const result = await checkout.mutateAsync({
        stayId,
        paymentMethod: pay,
        amount: amtToPass,
        actualCheckoutDate,
        discountAmount: discountVal !== '' ? Number(discountVal) : Number(stay.discount_amount || 0),
        discountReason: discountReason || stay.discount_reason,
        refundReason: bal < 0 ? (refundReason || 'Early checkout refund') : null,
      });

      setCompletedResult(result);
      toast(
        `${stay.guest_name.split(' ')[0]} checked out. Bill ${inr(result.bill.total)}. Room ${stay.room_no} sent for cleaning.`
      );
    } catch (err) {
      toast(err.message || 'Checkout failed.');
    }
  };

  return (
    <>
      <Sheet onClose={onClose}>
        <SheetHeader
          status="occupied"
          badge={stay.room_no}
          title={isCheckedOut ? 'Bill Details (Checked Out)' : isEarly ? 'Early Check out' : 'Check out'}
          subtitle={`${stay.room_type_name} · ${isCheckedOut ? 'Settled' : isEarly ? 'Checking out before planned date' : 'Standard checkout'}`}
          onClose={onClose}
        />
        <div className="sb">
          {/* Stay & Timeline Information */}
          <dl className="info">
            <dt>Guest</dt>
            <dd>{stay.guest_name}</dd>
            <dt>Mobile</dt>
            <dd className="mono">{stay.guest_phone}</dd>
            <dt>ID proof</dt>
            <dd>
              {stay.id_proof_type} <span className="mono">{stay.id_proof_last4 ? `••••${stay.id_proof_last4}` : ''}</span>
            </dd>
            <dt>Original Check-in</dt>
            <dd>{fd(stay.check_in_date)}</dd>
            <dt>Original Planned Checkout</dt>
            <dd>{fd(stay.checkout_planned)}</dd>
            <dt>Actual Checkout Date</dt>
            <dd>
              {isCheckedOut ? (
                fd(stay.checkout_actual || today)
              ) : (
                <span style={{ fontWeight: 600 }}>{fd(actualCheckoutDate)} {isEarly && <span style={{ color: 'var(--mnt, #f59e0b)' }}>(Early)</span>}</span>
              )}
            </dd>
            <dt>Actual Nights Stayed</dt>
            <dd>
              <strong>{bill.nights} night{bill.nights > 1 ? 's' : ''}</strong>
              {isEarly && (
                <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                  (Planned: {bill.plannedNights} nights, Unused: {bill.unusedNights})
                </span>
              )}
            </dd>
            <dt>Daily Room Rate</dt>
            <dd className="mono">{inr(stay.rate)}</dd>
            {isCheckedOut && stay.payment_method && (
              <>
                <dt>Payment method</dt>
                <dd><b>{stay.payment_method.toUpperCase()}</b></dd>
              </>
            )}
          </dl>

          {/* Early Checkout Notice & Date Selector */}
          {!isCheckedOut && (
            <div style={{ padding: '8px 12px', borderRadius: 6, background: isEarly ? 'var(--cln-bg, #fef3c7)' : 'var(--color-bg-secondary)', border: `1px solid ${isEarly ? 'var(--cln-border, #fde68a)' : 'var(--color-border)'}`, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong>Checkout Date: </strong>
                <span>{fd(actualCheckoutDate)}</span>
                {isEarly && <span style={{ color: 'var(--cln, #d97706)', marginLeft: 6 }}>· Early checkout recalculation active</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ fontSize: 12 }} className="muted">Change Date:</label>
                <input
                  type="date"
                  style={{ padding: '2px 6px', fontSize: 12 }}
                  value={actualCheckoutDate}
                  min={stay.check_in_date}
                  onChange={(e) => setActualCheckoutDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Comprehensive Bill Breakdown Table */}
          <table className="bill">
            <tbody>
              <tr>
                <td>
                  Actual stay: {bill.nights} night{bill.nights > 1 ? 's' : ''} × {inr(stay.rate)}
                </td>
                <td className="mono">{inr(bill.roomAmount)}</td>
              </tr>
              <tr className="sub">
                <td>Taxes (GST {Math.round(bill.gstRate * 100)}%)</td>
                <td className="mono">{inr(bill.roomGstAmount)}</td>
              </tr>

              {bill.charges && bill.charges.map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.label}{' '}
                    {!isCheckedOut && !completedResult && (
                      <button
                        className="rm"
                        type="button"
                        aria-label="Remove"
                        onClick={() => removeExtra.mutate({ stayId, chargeId: x.id })}
                      >
                        ×
                      </button>
                    )}
                  </td>
                  <td className="mono">{inr(x.amount)}</td>
                </tr>
              ))}

              {Number(bill.earlyCheckoutFee) > 0 && (
                <tr className="sub" style={{ color: 'var(--bad, #ef4444)' }}>
                  <td>Early Checkout Policy Fee</td>
                  <td className="mono">+{inr(bill.earlyCheckoutFee)}</td>
                </tr>
              )}

              {Number(bill.discountAmount) > 0 && (
                <tr className="sub" style={{ color: 'var(--go, #10b981)' }}>
                  <td>Discount Applied {stay.discount_reason ? `(${stay.discount_reason})` : ''}</td>
                  <td className="mono">−{inr(bill.discountAmount)}</td>
                </tr>
              )}

              <tr className="tot">
                <td>Total invoice amount</td>
                <td className="mono">{inr(bill.total)}</td>
              </tr>

              <tr className="sub">
                <td>Advance successfully paid</td>
                <td className="mono">−{inr(bill.advancePaid || 0)}</td>
              </tr>

              {Number(bill.otherPayments) > 0 && (
                <tr className="sub">
                  <td>Other successful payments</td>
                  <td className="mono">−{inr(bill.otherPayments)}</td>
                </tr>
              )}

              {Number(bill.previouslyRefunded) > 0 && (
                <tr className="sub" style={{ color: 'var(--bad, #ef4444)' }}>
                  <td>Previously refunded amount</td>
                  <td className="mono">+{inr(bill.previouslyRefunded)}</td>
                </tr>
              )}

              <tr className="bal">
                <td>
                  {isCheckedOut
                    ? 'Settled'
                    : bal > 0
                      ? 'Outstanding balance (Guest owes)'
                      : bal < 0
                        ? 'Eligible refund amount (Hotel owes)'
                        : 'Balance due'}
                </td>
                <td className="mono" style={{ fontWeight: 800, color: isCheckedOut ? 'inherit' : bal > 0 ? 'var(--bad, #ef4444)' : bal < 0 ? 'var(--go, #10b981)' : 'inherit' }}>
                  {isCheckedOut
                    ? inr(0)
                    : bal === 0
                      ? '₹0 (Fully Paid)'
                      : bal > 0
                        ? inr(bal)
                        : `Refund ${inr(Math.abs(bal))}`}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Discount & Charges Management */}
          {!isCheckedOut && !completedResult && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn sm"
                type="button"
                onClick={() => setShowDiscountInput(!showDiscountInput)}
              >
                {showDiscountInput ? 'Cancel Discount' : 'Add / Adjust Discount'}
              </button>
              <button
                className="btn sm"
                type="button"
                onClick={() => setShowRefundModal(true)}
              >
                Refund Management
              </button>
            </div>
          )}

          {showDiscountInput && !isCheckedOut && (
            <div className="panel" style={{ padding: 12, marginTop: 4 }}>
              <h5 style={{ margin: '0 0 8px', fontSize: 13 }}>Apply Discount to Stay</h5>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div className="f">
                  <label>Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={discountVal}
                    onChange={(e) => setDiscountVal(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label>Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. VIP guest or late check-in compensation"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                  />
                </div>
                <button
                  className="btn sm go"
                  type="button"
                  disabled={applyDiscount.isPending}
                  onClick={handleApplyDiscount}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Checkout Completed Confirmation */}
          {completedResult ? (
            <div style={{ textAlign: 'center', padding: '20px 0', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: 28, marginBottom: 8, color: 'var(--color-success, #16a34a)' }}>✓</div>
              <h3 style={{ margin: '0 0 6px' }}>Check out completed</h3>
              <p className="muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
                Final Invoice: {inr(completedResult.bill?.total || bill.total)} · Room {stay.room_no} marked for cleaning.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <a
                  className="btn dark"
                  href={`/print/invoice/${stayId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Print / View Final Invoice
                </a>
                <button className="btn" type="button" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : isCheckedOut ? (
            <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                className="btn dark"
                href={`/print/invoice/${stayId}`}
                target="_blank"
                rel="noreferrer"
              >
                Print / View Final Invoice
              </a>
              <button className="btn" type="button" onClick={() => setShowRefundModal(true)}>
                Refund Management
              </button>
              <button className="btn" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Add Extra Charges */}
              <div className="f">
                <label>Add extra stay charge</label>
                <div className="addc">
                  <select aria-label="Charge" value={xLabel} onChange={(e) => setXLabel(e.target.value)}>
                    {EXTRAS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    placeholder="₹ amount"
                    aria-label="Amount"
                    value={xAmount}
                    onChange={(e) => setXAmount(e.target.value)}
                  />
                  <button className="btn sm" type="button" disabled={addExtra.isPending} onClick={addExtraCharge}>
                    Add
                  </button>
                </div>
              </div>

              {/* Checkout Action Decision based on Balance */}
              {bal === 0 ? (
                <>
                  <div
                    style={{
                      background: 'var(--color-success-bg, #ecfdf5)',
                      border: '1px solid var(--color-success-border, #a7f3d0)',
                      color: 'var(--color-success-text, #065f46)',
                      padding: '12px 14px',
                      borderRadius: 8,
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>✓</span>
                    <span>Bill is fully paid (₹0 balance). Checkout can be finalized immediately.</span>
                  </div>

                  {confirming ? (
                    <div className="confirm">
                      <b>Bill is fully paid. Complete checkout for Room {stay.room_no}?</b>
                      <span className="muted">Room {stay.room_no} will go for cleaning.</span>
                      <div className="row2">
                        <button className="btn blue" type="button" disabled={checkout.isPending} onClick={doCheckout}>
                          {checkout.isPending ? 'Checking out...' : 'Yes, check out'}
                        </button>
                        <button className="btn" type="button" disabled={checkout.isPending} onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn blue big" type="button" onClick={() => setConfirming(true)}>
                      Complete checkout (Fully paid)
                    </button>
                  )}
                </>
              ) : bal > 0 ? (
                <>
                  <div className="f">
                    <label>Guest pays outstanding balance by</label>
                    <div className="seg">
                      {['cash', 'upi', 'card'].map((p) => (
                        <button key={p} type="button" aria-pressed={pay === p} onClick={() => setPay(p)}>
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {confirming ? (
                    <div className="confirm">
                      <b>Collect {inr(bal)} by {pay.toUpperCase()} to complete checkout?</b>
                      <span className="muted">
                        Full payment of {inr(bal)} is required before checkout. Room {stay.room_no} will go for cleaning.
                      </span>
                      <div className="row2">
                        <button className="btn blue" type="button" disabled={checkout.isPending} onClick={doCheckout}>
                          {checkout.isPending ? 'Processing payment...' : 'Yes, collect & check out'}
                        </button>
                        <button className="btn" type="button" disabled={checkout.isPending} onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn blue big" type="button" onClick={() => setConfirming(true)}>
                      Check out · Collect {inr(bal)}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div
                    style={{
                      background: 'var(--ok-bg, #ecfdf5)',
                      border: '1px solid var(--ok-border, #a7f3d0)',
                      color: 'var(--ok, #065f46)',
                      padding: '12px 14px',
                      borderRadius: 8,
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 12,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>ℹ️</span>
                    <span>
                      Guest is eligible for a refund of <strong>{inr(Math.abs(bal))}</strong> due to advance payment adjustment.
                    </span>
                  </div>

                  <div className="f">
                    <label>Refund payment method</label>
                    <div className="seg">
                      {['upi', 'cash', 'card'].map((p) => (
                        <button key={p} type="button" aria-pressed={pay === p} onClick={() => setPay(p)}>
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="f" style={{ marginBottom: 12 }}>
                    <label>Refund Note / Reason</label>
                    <input
                      type="text"
                      placeholder="e.g. Early checkout refund for unused night(s)"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                  </div>

                  {confirming ? (
                    <div className="confirm">
                      <b>Refund {inr(Math.abs(bal))} by {pay.toUpperCase()} to complete checkout?</b>
                      <span className="muted">Room {stay.room_no} will go for cleaning.</span>
                      <div className="row2">
                        <button className="btn blue" type="button" disabled={checkout.isPending} onClick={doCheckout}>
                          {checkout.isPending ? 'Processing refund...' : 'Yes, refund & check out'}
                        </button>
                        <button className="btn" type="button" disabled={checkout.isPending} onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn blue big" type="button" onClick={() => setConfirming(true)}>
                      Check out · Refund {inr(Math.abs(bal))}
                    </button>
                  )}
                </>
              )}

              <button
                className="btn sm"
                type="button"
                style={{ alignSelf: 'flex-start' }}
                disabled={extend.isPending}
                onClick={async () => {
                  try {
                    await extend.mutateAsync(stayId);
                    toast(`Room ${stay.room_no} extended.`);
                  } catch (err) {
                    toast(err.message);
                  }
                }}
              >
                Guest staying 1 more day
              </button>
            </>
          )}
        </div>
      </Sheet>

      {showRefundModal && (
        <RefundSheet
          stayId={stay.id}
          onClose={() => setShowRefundModal(false)}
          onSuccess={() => setShowRefundModal(false)}
        />
      )}
    </>
  );
}
