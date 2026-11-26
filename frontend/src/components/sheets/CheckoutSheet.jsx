import { useState, useMemo, useRef, useEffect } from 'react';
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
import { fetchOccupantDocumentBlob, useUploadStayDocuments } from '../../api/occupantDocuments';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

export default function CheckoutSheet({ stayId, onClose, initialMode }) {
  const { data: stay, isError: isStayError, error: stayError } = useStay(stayId);
  const { data: rawBill, isError: isBillError, error: billError } = useStayBill(stayId);

  const [actualCheckoutDate, setActualCheckoutDate] = useState(todayIso());
  const [dateOverridden, setDateOverridden] = useState(false);
  const [discountVal, setDiscountVal] = useState('');
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'
  const [discountReason, setDiscountReason] = useState('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  // Synchronize checkout date with initialMode once stay data is loaded
  useEffect(() => {
    if (!dateOverridden && stay) {
      if (initialMode === 'checkout' && stay.checkout_planned && todayIso() < stay.checkout_planned) {
        setActualCheckoutDate(stay.checkout_planned);
      } else if (todayIso() >= stay.check_in_date) {
        setActualCheckoutDate(todayIso());
      } else {
        setActualCheckoutDate(stay.check_in_date);
      }
    }
  }, [stay, initialMode, dateOverridden]);

  const isDateInvalid = !actualCheckoutDate || (stay && actualCheckoutDate < stay.check_in_date);

  const checkoutType = useMemo(() => {
    if (!stay?.checkout_planned || !actualCheckoutDate) return 'normal';
    if (actualCheckoutDate < stay.checkout_planned) return 'early';
    if (actualCheckoutDate > stay.checkout_planned) return 'late';
    return 'normal';
  }, [actualCheckoutDate, stay?.checkout_planned]);

  const totalBefore = rawBill
    ? Number(rawBill.roomAmount || 0) +
      Number(rawBill.roomGstAmount || 0) +
      Number(rawBill.extrasAmount || 0) +
      Number(rawBill.extrasGstAmount || 0) +
      Number(rawBill.earlyCheckoutFee || 0)
    : 0;

  const effectiveDiscount = discountVal !== ''
    ? (discountType === 'percent'
        ? Math.round((totalBefore * (Number(discountVal) / 100)) * 100) / 100
        : Number(discountVal))
    : (stay?.discount_amount != null ? Number(stay.discount_amount) : undefined);

  const { data: previewData } = useEarlyCheckoutPreview(
    stayId,
    {
      checkoutDate: actualCheckoutDate,
      discount: effectiveDiscount,
    },
    { enabled: !!stayId && !isDateInvalid }
  );

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState(null);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const uploadDocs = useUploadStayDocuments();
  const postUploadInputRef = useRef(null);
  const [loadingDocId, setLoadingDocId] = useState(null);

  const handleViewDocument = async (doc) => {
    try {
      setLoadingDocId(doc.id);
      const { blobUrl, mime, filename } = await fetchOccupantDocumentBlob(doc.id);
      if (mime.startsWith('image/') || mime === 'application/pdf') {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      } else {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename || doc.original_filename || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (e) {
      toast(e.message || 'Could not load document.');
    } finally {
      setLoadingDocId(null);
    }
  };

  const handlePostCheckInUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      await uploadDocs.mutateAsync({ stayId, files });
      toast('ID proof document uploaded successfully.');
    } catch (err) {
      toast(err.message || 'Failed to upload document.');
    } finally {
      e.target.value = '';
    }
  };

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
  const isEarly = !isCheckedOut && checkoutType === 'early';
  const isLate = !isCheckedOut && checkoutType === 'late';
  const isNormal = !isCheckedOut && checkoutType === 'normal';

  const addExtraCharge = async () => {
    const amt = Number(xAmount);
    if (!(amt > 0)) {
      toast('Enter the amount.');
      return;
    }
    await addExtra.mutateAsync({ stayId, label: xLabel, amount: amt, isTaxable: true });
    setXAmount('');
    setConfirming(false);
  };

  const handleApplyDiscount = async () => {
    const rawNum = Number(discountVal);
    if (isNaN(rawNum) || rawNum < 0 || discountVal.toString().trim() === '') {
      toast('Please enter a valid discount amount.');
      return;
    }
    let calculatedAmount = rawNum;
    if (discountType === 'percent') {
      if (rawNum > 100) {
        toast('Discount percentage cannot exceed 100%.');
        return;
      }
      calculatedAmount = Math.round((totalBefore * (rawNum / 100)) * 100) / 100;
    } else {
      if (rawNum > totalBefore) {
        toast('Discount cannot exceed the payable amount.');
        return;
      }
    }
    try {
      await applyDiscount.mutateAsync({ stayId, amount: calculatedAmount, reason: discountReason || 'Discretionary discount' });
      toast(`Discount of ${inr(calculatedAmount)} applied.`);
      setShowDiscountInput(false);
    } catch (err) {
      toast(err.message || 'Failed to apply discount.');
    }
  };

  const bal = bill.balance;

  const doCheckout = async () => {
    if (isSubmitting || checkout.isPending) return;
    if (isDateInvalid) {
      toast(
        !actualCheckoutDate
          ? 'Please select a valid checkout date.'
          : `Actual checkout date cannot be earlier than check-in date (${fd(stay.check_in_date)}).`
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const effDiscount = discountVal !== ''
        ? (discountType === 'percent'
            ? Math.round((totalBefore * (Number(discountVal) / 100)) * 100) / 100
            : Number(discountVal))
        : Number(stay.discount_amount || 0);

      if (effDiscount > totalBefore) {
        toast('Discount cannot exceed the payable amount.');
        setIsSubmitting(false);
        return;
      }

      const amtToPass = bal > 0 ? bal : 0;
      const defaultRefundReason = isEarly
        ? 'Early checkout refund for unused night(s)'
        : isLate
          ? 'Late checkout overpayment refund'
          : 'Checkout refund';
      const result = await checkout.mutateAsync({
        stayId,
        paymentMethod: pay,
        amount: amtToPass,
        actualCheckoutDate,
        checkoutType,
        discountAmount: effDiscount,
        discountReason: discountReason || stay.discount_reason,
        refundReason: bal < 0 ? (refundReason || defaultRefundReason) : null,
      });

      setCompletedResult(result);
      toast(
        `${stay.guest_name.split(' ')[0]} checked out. Bill ${inr(result.bill.total)}. Room ${stay.room_no} sent for cleaning.`
      );
    } catch (err) {
      toast(err.message || 'Checkout failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCheckoutBusy = checkout.isPending || isSubmitting;

  return (
    <>
      <Sheet onClose={onClose}>
        <SheetHeader
          status="occupied"
          badge={stay.room_no}
          title={
            isCheckedOut
              ? 'Bill Details (Checked Out)'
              : isEarly
                ? 'Early Check out'
                : isLate
                  ? 'Late Check out'
                  : 'Check out'
          }
          subtitle={`${stay.room_type_name} · ${
            isCheckedOut
              ? 'Settled'
              : isEarly
                ? `Checking out before planned date (${fd(stay.checkout_planned)})`
                : isLate
                  ? `Extended stay beyond planned date (${fd(stay.checkout_planned)})`
                  : 'Standard checkout'
          }`}
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
            <dt>Persons</dt>
            <dd>{stay.persons} {stay.persons === 1 ? 'person' : 'persons'}</dd>
            <dt>Original Check-in</dt>
            <dd>{fd(stay.check_in_date)}</dd>
            <dt>Original Planned Checkout</dt>
            <dd>{fd(stay.checkout_planned)}</dd>
            <dt>Actual Checkout Date</dt>
            <dd>
              {isCheckedOut ? (
                fd(stay.checkout_actual || today)
              ) : (
                <span style={{ fontWeight: 600 }}>
                  {actualCheckoutDate ? fd(actualCheckoutDate) : '—'}{' '}
                  {isEarly && <span style={{ color: 'var(--mnt, #f59e0b)' }}>(Early Checkout)</span>}
                  {isLate && <span style={{ color: 'var(--color-primary, #70265F)' }}>(Late Checkout / Extended Stay)</span>}
                  {isNormal && <span className="muted" style={{ fontWeight: 500 }}>(Scheduled Checkout)</span>}
                </span>
              )}
            </dd>
            <dt>Actual Nights Stayed</dt>
            <dd>
              <strong>{bill.nights} night{bill.nights > 1 ? 's' : ''}</strong>
              {isEarly && (
                <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                  (Planned: {bill.plannedNights} nights, Unused: {bill.unusedNights ?? Math.max(0, (bill.plannedNights || 1) - (bill.nights || 1))})
                </span>
              )}
              {isLate && (
                <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--color-primary, #70265F)', fontWeight: 600 }}>
                  (Planned: {bill.plannedNights} nights, Additional: {bill.additionalNights ?? Math.max(0, (bill.nights || 1) - (bill.plannedNights || 1))})
                </span>
              )}
              {isNormal && (
                <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                  (Planned: {bill.plannedNights} nights)
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

          {/* Individual Occupants Details Section */}
          {stay.occupants?.length > 0 && (
            <div style={{ marginTop: 10, marginBottom: 12, padding: '10px 12px', background: 'var(--color-card-secondary, #FAF6FD)', borderRadius: 8, border: '1px solid var(--color-lavender-border, #EAE4EF)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-primary, #70265F)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Occupants</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: 'var(--color-lavender-light, #F1EAF8)' }}>
                  {stay.occupants.length} {stay.occupants.length === 1 ? 'Person' : 'Persons'}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stay.occupants.map((occ) => (
                  <div key={occ.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 8px', background: 'var(--color-surface, #ffffff)', borderRadius: 5, border: '1px solid var(--border, #e2e8f0)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-primary, #70265F)', color: '#ffffff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {occ.occupant_number}
                      </span>
                      <strong style={{ color: 'var(--color-heading)' }}>{occ.name || '—'}</strong>
                      {occ.gender && <span className="muted" style={{ fontSize: 11.5 }}>({occ.gender})</span>}
                      {occ.is_primary === 1 && (
                        <span style={{ fontSize: 10, background: 'var(--color-lavender-light, #F1EAF8)', color: 'var(--color-primary, #70265F)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
                          Lead
                        </span>
                      )}
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-secondary, #64748b)' }}>{occ.phone || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Guest ID Proof Documents Section */}
          <div style={{ marginTop: 10, marginBottom: 14, padding: '10px 12px', background: 'var(--color-bg-secondary, #f8fafc)', borderRadius: 8, border: '1px solid var(--color-border, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: (stay.documents?.length ? 8 : 4) }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-heading)' }}>
                  Guest ID Proof Documents
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  ({stay.documents?.length || 0})
                </span>
              </div>
              <div>
                <input
                  ref={postUploadInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={handlePostCheckInUpload}
                />
                <button
                  type="button"
                  className="btn sm"
                  disabled={uploadDocs.isPending}
                  onClick={() => postUploadInputRef.current?.click()}
                  style={{ fontSize: 12, padding: '3px 8px' }}
                >
                  {uploadDocs.isPending ? 'Uploading…' : '+ Add Document'}
                </button>
              </div>
            </div>

            {(!stay.documents || stay.documents.length === 0) ? (
              <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>
                No ID proof documents uploaded yet for this stay.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stay.documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'var(--color-surface, #ffffff)',
                      border: '1px solid var(--border, #e2e8f0)',
                      borderRadius: 6,
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          background: doc.original_filename?.toLowerCase().endsWith('.pdf') || doc.mime_type === 'application/pdf' ? '#fee2e2' : '#e0e7ff',
                          color: doc.original_filename?.toLowerCase().endsWith('.pdf') || doc.mime_type === 'application/pdf' ? '#991b1b' : '#3730a3',
                          fontWeight: 700,
                          fontSize: 10,
                          padding: '2px 5px',
                          borderRadius: 4,
                          textTransform: 'uppercase',
                        }}
                      >
                        {doc.original_filename?.split('.').pop() || 'DOC'}
                      </span>
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: 180,
                          fontWeight: 500,
                        }}
                        title={doc.original_filename}
                      >
                        {doc.original_filename}
                      </span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {doc.occupant_number ? `(Person ${doc.occupant_number})` : ''} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={loadingDocId === doc.id}
                        onClick={() => handleViewDocument(doc)}
                        style={{ fontSize: 11.5, padding: '2px 8px' }}
                      >
                        {loadingDocId === doc.id ? 'Loading…' : 'View'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Checkout Notice & Date Selector */}
          {!isCheckedOut && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 6,
                background: isDateInvalid ? '#fef2f2' : isEarly ? 'var(--cln-bg, #fef3c7)' : isLate ? 'var(--color-lavender-light, #f1eaf8)' : 'var(--color-bg-secondary, #f8fafc)',
                border: `1px solid ${isDateInvalid ? '#fecaca' : isEarly ? 'var(--cln-border, #fde68a)' : isLate ? 'var(--color-lavender-border, #eae4ef)' : 'var(--color-border, #e2e8f0)'}`,
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>Checkout Date: </strong>
                  <span>{actualCheckoutDate ? fd(actualCheckoutDate) : '—'}</span>
                  {isEarly && (
                    <span style={{ color: 'var(--cln, #d97706)', marginLeft: 6, fontWeight: 600 }}>
                      · Early checkout recalculation active ({bill.unusedNights ?? Math.max(0, (bill.plannedNights || 1) - (bill.nights || 1))} unused night{(bill.unusedNights ?? Math.max(0, (bill.plannedNights || 1) - (bill.nights || 1))) !== 1 ? 's' : ''})
                    </span>
                  )}
                  {isLate && (
                    <span style={{ color: 'var(--color-primary, #70265F)', marginLeft: 6, fontWeight: 600 }}>
                      · Extended stay recalculation active (+{bill.additionalNights ?? Math.max(0, (bill.nights || 1) - (bill.plannedNights || 1))} additional night{(bill.additionalNights ?? Math.max(0, (bill.nights || 1) - (bill.plannedNights || 1))) !== 1 ? 's' : ''})
                    </span>
                  )}
                  {isNormal && (
                    <span className="muted" style={{ marginLeft: 6 }}>
                      · Scheduled checkout date
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 12 }} className="muted">Change Date:</label>
                  <input
                    type="date"
                    style={{ padding: '2px 6px', fontSize: 12 }}
                    value={actualCheckoutDate}
                    min={stay.check_in_date}
                    onChange={(e) => {
                      setDateOverridden(true);
                      setActualCheckoutDate(e.target.value);
                    }}
                  />
                </div>
              </div>
              {isDateInvalid && (
                <div
                  style={{
                    color: 'var(--bad, #ef4444)',
                    background: '#ffffff',
                    border: '1px solid #fecaca',
                    borderRadius: 4,
                    padding: '6px 10px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 500,
                  }}
                >
                  <span>⚠️</span>
                  <span>
                    {!actualCheckoutDate
                      ? 'Please select a valid checkout date.'
                      : `Invalid date selection: Actual checkout date cannot be earlier than check-in date (${fd(stay.check_in_date)}).`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Comprehensive Bill Breakdown Table */}
          <table className="bill">
            <tbody>
              <tr>
                <td>
                  Actual stay: {bill.nights} night{bill.nights > 1 ? 's' : ''} × {inr(stay.rate)}
                  {isLate && (
                    <span style={{ fontSize: 11, color: 'var(--color-primary, #70265F)', marginLeft: 6, fontWeight: 600 }}>
                      (+{bill.additionalNights ?? Math.max(0, (bill.nights || 1) - (bill.plannedNights || 1))} extended)
                    </span>
                  )}
                  {isEarly && (
                    <span style={{ fontSize: 11, color: 'var(--mnt, #f59e0b)', marginLeft: 6, fontWeight: 600 }}>
                      ({bill.unusedNights ?? Math.max(0, (bill.plannedNights || 1) - (bill.nights || 1))} unused)
                    </span>
                  )}
                </td>
                <td className="mono">{inr(bill.roomAmount)}</td>
              </tr>
              <tr className="sub">
                <td>Room GST ({Math.round((bill.gstRate || 0) * 100)}%)</td>
                <td className="mono">{inr(bill.roomGstAmount)}</td>
              </tr>
              {Number(bill.extrasGstAmount) > 0 && (
                <tr className="sub">
                  <td>Extras GST</td>
                  <td className="mono">+{inr(bill.extrasGstAmount)}</td>
                </tr>
              )}
              {((bill.cgstAmount > 0 || bill.sgstAmount > 0 || bill.igstAmount > 0)) && (
                <tr className="sub" style={{ fontSize: 12, color: 'var(--muted, #64748b)' }}>
                  <td style={{ paddingLeft: 12 }}>
                    {bill.isInterState
                      ? `Tax breakup: IGST (${inr(bill.igstAmount)})`
                      : `Tax breakup: CGST (${inr(bill.cgstAmount)}) + SGST (${inr(bill.sgstAmount)})`}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    Total Tax: {inr(Number(bill.roomGstAmount || 0) + Number(bill.extrasGstAmount || 0))}
                  </td>
                </tr>
              )}

              {bill.charges && bill.charges.map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.label}{' '}
                    {x.gst_rate > 0 && (
                      <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
                        ({Math.round(x.gst_rate * 100)}% GST)
                      </span>
                    )}{' '}
                    {!isCheckedOut && !completedResult && (
                      <button
                        className="rm"
                        type="button"
                        aria-label="Remove"
                        onClick={() => {
                          if (!window.confirm(`Are you sure you want to remove extra charge "${x.label}"?`)) return;
                          removeExtra.mutate({ stayId, chargeId: x.id });
                        }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                  <td className="mono">{inr(x.amount)}</td>
                </tr>
              ))}

              {Number(bill.earlyCheckoutFee) > 0 && (isEarly || isCheckedOut) && (
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h5 style={{ margin: 0, fontSize: 13 }}>Apply Discount to Stay</h5>
                <button
                  type="button"
                  className="btn sm"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => {
                    setDiscountType('percent');
                    setDiscountVal('100');
                    setDiscountReason('100% Full discount');
                  }}
                >
                  100% Full Discount
                </button>
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Discount Type</label>
                <div className="seg">
                  <button
                    type="button"
                    className={discountType === 'fixed' ? 'active' : ''}
                    aria-pressed={discountType === 'fixed'}
                    onClick={() => setDiscountType('fixed')}
                  >
                    Fixed (₹)
                  </button>
                  <button
                    type="button"
                    className={discountType === 'percent' ? 'active' : ''}
                    aria-pressed={discountType === 'percent'}
                    onClick={() => setDiscountType('percent')}
                  >
                    Percentage (%)
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div className="f">
                  <label>{discountType === 'percent' ? 'Percentage (%)' : 'Amount (₹)'}</label>
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percent' ? 100 : totalBefore}
                    placeholder={discountType === 'percent' ? 'e.g. 10' : '0'}
                    value={discountVal}
                    onChange={(e) => setDiscountVal(e.target.value)}
                  />
                  {discountType === 'percent' && Number(discountVal) > 0 && !isNaN(Number(discountVal)) && (
                    <span style={{ fontSize: 11.5, color: 'var(--color-primary, #70265F)', marginTop: 2, display: 'block' }}>
                      = {inr(Math.round((totalBefore * (Number(discountVal) / 100)) * 100) / 100)} off {inr(totalBefore)}
                    </span>
                  )}
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
                        <button className="btn blue" type="button" disabled={isCheckoutBusy || isDateInvalid} onClick={doCheckout}>
                          {isCheckoutBusy ? 'Checking out...' : 'Yes, check out'}
                        </button>
                        <button className="btn" type="button" disabled={isCheckoutBusy} onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn blue big" type="button" disabled={isCheckoutBusy || isDateInvalid} onClick={() => setConfirming(true)}>
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
                        <button className="btn blue" type="button" disabled={isCheckoutBusy || isDateInvalid} onClick={doCheckout}>
                          {isCheckoutBusy ? 'Processing payment...' : 'Yes, collect & check out'}
                        </button>
                        <button className="btn" type="button" disabled={isCheckoutBusy} onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn blue big" type="button" disabled={isCheckoutBusy || isDateInvalid} onClick={() => setConfirming(true)}>
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
                      placeholder={
                        isEarly
                          ? 'e.g. Early checkout refund for unused night(s)'
                          : isLate
                            ? 'e.g. Refund for excess advance on late checkout'
                            : 'e.g. Refund for excess advance payment'
                      }
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                  </div>

                  {confirming ? (
                    <div className="confirm">
                      <b>Refund {inr(Math.abs(bal))} by {pay.toUpperCase()} to complete checkout?</b>
                      <span className="muted">Room {stay.room_no} will go for cleaning.</span>
                      <div className="row2">
                        <button className="btn blue" type="button" disabled={isCheckoutBusy || isDateInvalid} onClick={doCheckout}>
                          {isCheckoutBusy ? 'Processing refund...' : 'Yes, refund & check out'}
                        </button>
                        <button className="btn" type="button" disabled={isCheckoutBusy} onClick={() => setConfirming(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn blue big" type="button" disabled={isCheckoutBusy || isDateInvalid} onClick={() => setConfirming(true)}>
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
