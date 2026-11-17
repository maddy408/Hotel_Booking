import { useState, useRef } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useStay, useStayBill, useAddExtra, useRemoveExtra } from '../../api/stays';
import { fetchOccupantDocumentBlob, useUploadStayDocuments } from '../../api/occupantDocuments';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr } from '../../lib/format';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

export default function StayDetailSheet({ stayId, onClose, onCheckout, onEarlyCheckout }) {
  const { data: stay, isLoading: isStayLoading } = useStay(stayId);
  const { data: rawBill } = useStayBill(stayId);

  const addExtra = useAddExtra();
  const removeExtra = useRemoveExtra();
  const uploadDocs = useUploadStayDocuments();
  const toast = useToast();

  const [xLabel, setXLabel] = useState('Food');
  const [xAmount, setXAmount] = useState('');
  const [loadingDocId, setLoadingDocId] = useState(null);
  const fileInputRef = useRef(null);

  const bill = stay?.bill || rawBill;

  const handleViewDocument = async (doc) => {
    try {
      setLoadingDocId(doc.id);
      const { blobUrl, mime, filename } = await fetchOccupantDocumentBlob(doc.id);
      if (mime?.startsWith('image/') || mime === 'application/pdf') {
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

  const handleUploadDoc = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      await uploadDocs.mutateAsync({ stayId, files });
      toast('Document uploaded successfully.');
    } catch (err) {
      toast(err.message || 'Upload failed.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddExtra = async () => {
    const amt = Number(xAmount);
    if (!(amt > 0)) {
      toast('Enter extra charge amount.');
      return;
    }
    try {
      await addExtra.mutateAsync({ stayId, label: xLabel, amount: amt, isTaxable: true });
      setXAmount('');
      toast(`Added ${xLabel} charge.`);
    } catch (err) {
      toast(err.message || 'Failed to add charge.');
    }
  };

  if (isStayLoading || !stay) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Stay Details" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 140 }} />
          <div className="skel" style={{ height: 180, marginTop: 12 }} />
        </div>
      </Sheet>
    );
  }

  const nightsStayed = bill?.nights ?? 1;

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        status="occupied"
        badge={stay.room_no}
        title={`Stay Details · Room ${stay.room_no}`}
        subtitle={`${stay.guest_name} · ${stay.room_type_name}`}
        onClose={onClose}
      />
      <div className="sb">
        {/* Actions bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <a
            className="btn dark sm"
            href={`/print/invoice/${stay.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            <span>Print Invoice Preview</span>
          </a>

          <button
            className="btn sm"
            type="button"
            onClick={() => {
              onClose();
              onEarlyCheckout?.(stay.id);
            }}
            style={{ color: 'var(--cln, #d97706)', borderColor: 'var(--cln-border, #fde68a)', background: 'var(--cln-bg, #fef3c7)', fontWeight: 600 }}
          >
            Early Check Out
          </button>

          <button
            className="btn blue sm"
            type="button"
            onClick={() => {
              onClose();
              onCheckout?.(stay.id);
            }}
            style={{ fontWeight: 700 }}
          >
            Check Out
          </button>
        </div>

        {/* Stay & Guest Information */}
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
            Stay Overview
          </h4>
          <dl className="info">
            <dt>Lead Guest</dt>
            <dd><strong>{stay.guest_name}</strong></dd>

            <dt>Mobile Number</dt>
            <dd className="mono">{stay.guest_phone}</dd>

            <dt>ID Proof</dt>
            <dd>
              {stay.id_proof_type || 'Aadhaar'} {stay.id_proof_last4 ? `••••${stay.id_proof_last4}` : ''}
            </dd>

            <dt>Actual Persons</dt>
            <dd>{stay.persons} {Number(stay.persons) === 1 ? 'Person' : 'Persons'}</dd>

            <dt>Original Check-in</dt>
            <dd>{fd(stay.original_check_in_date || stay.check_in_date)}</dd>

            <dt>Original Planned Checkout</dt>
            <dd>{fd(stay.original_checkout_date || stay.checkout_planned)}</dd>

            <dt>Actual Check-in</dt>
            <dd>{fd(stay.check_in_date)}</dd>

            <dt>Current Planned Checkout</dt>
            <dd>{fd(stay.checkout_planned)}</dd>

            <dt>Nights Stayed</dt>
            <dd><strong>{nightsStayed} night{nightsStayed > 1 ? 's' : ''}</strong></dd>

            <dt>Daily Tariff</dt>
            <dd className="mono">{inr(stay.rate)}</dd>

            {(!stay.booking_source || stay.booking_source === 'Social Media') && (
              <>
                <dt>Booking Source</dt>
                <dd>Social Media</dd>
              </>
            )}
            {(stay.booking_source === 'Reference – Existing Member' || stay.booking_source === 'Reference' || (stay.booking_source && stay.booking_source.startsWith('Reference'))) && (
              <>
                <dt>Booking Source</dt>
                <dd>Reference</dd>
                <dt>Referred By</dt>
                <dd>{stay.referred_by_guest_name || '—'}</dd>
                <dt>Referrer's Mobile Number</dt>
                <dd className="mono">{stay.referred_by_guest_phone || '—'}</dd>
              </>
            )}
            {stay.booking_source === 'Other' && (
              <>
                <dt>Booking Source</dt>
                <dd>Other</dd>
                <dt>Person Name</dt>
                <dd>{stay.other_source || '—'}</dd>
              </>
            )}
          </dl>
        </div>

        {/* Occupants & ID Documents */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
              Occupants ({stay.occupants?.length || stay.persons})
            </h4>
            <div>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display: 'none' }} onChange={handleUploadDoc} />
              <button
                type="button"
                className="btn sm"
                disabled={uploadDocs.isPending}
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 11.5, padding: '2px 8px' }}
              >
                {uploadDocs.isPending ? 'Uploading…' : '+ Add Document'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(stay.occupants || []).map((occ) => (
              <div key={occ.id || occ.occupant_number} style={{ padding: '8px 10px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-primary, #70265F)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {occ.occupant_number}
                    </span>
                    <strong>{occ.name || (occ.is_primary ? stay.guest_name : `Person ${occ.occupant_number}`)}</strong>
                    {occ.gender && <span className="muted" style={{ fontSize: 11 }}>({occ.gender})</span>}
                  </div>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {occ.phone || (occ.is_primary ? stay.guest_phone : '—')}
                  </span>
                </div>

                {occ.documents?.length > 0 && (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {occ.documents.map((doc) => (
                      <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 6px', background: 'var(--color-bg-secondary)', borderRadius: 4, fontSize: 11.5 }}>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                          {doc.original_filename}
                        </span>
                        <button
                          type="button"
                          className="btn sm"
                          disabled={loadingDocId === doc.id}
                          onClick={() => handleViewDocument(doc)}
                          style={{ fontSize: 10.5, padding: '1px 6px', height: 'auto' }}
                        >
                          {loadingDocId === doc.id ? 'Loading…' : 'View'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Extras & Services Management */}
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
            Extra Charges & Services
          </h4>
          <div className="addc" style={{ marginBottom: 8 }}>
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
            <button className="btn sm" type="button" disabled={addExtra.isPending} onClick={handleAddExtra}>
              Add
            </button>
          </div>

          {bill?.charges?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {bill.charges.map((ch) => (
                <div key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: 'var(--color-surface)', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}>
                  <span>{ch.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono">{inr(ch.amount)}</span>
                    <button
                      className="rm"
                      type="button"
                      aria-label="Remove"
                      onClick={() => removeExtra.mutate({ stayId: stay.id, chargeId: ch.id })}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>
              No extra charges added yet.
            </span>
          )}
        </div>

        {/* Billing Breakdown */}
        {bill && (
          <div style={{ marginBottom: 14 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
              Billing Summary
            </h4>
            <table className="bill">
              <tbody>
                <tr>
                  <td>Room charges ({nightsStayed} night{nightsStayed > 1 ? 's' : ''})</td>
                  <td className="mono">{inr(bill.roomAmount)}</td>
                </tr>
                <tr className="sub">
                  <td>Room GST ({Math.round(bill.gstRate * 100)}%)</td>
                  <td className="mono">{inr(bill.roomGstAmount)}</td>
                </tr>
                {Number(bill.extrasAmount) > 0 && (
                  <tr>
                    <td>Extras & Services</td>
                    <td className="mono">+{inr(bill.extrasAmount)}</td>
                  </tr>
                )}
                {Number(bill.extrasGstAmount) > 0 && (
                  <tr className="sub">
                    <td>Extras GST</td>
                    <td className="mono">+{inr(bill.extrasGstAmount)}</td>
                  </tr>
                )}
                <tr className="tot">
                  <td>Total invoice amount</td>
                  <td className="mono">{inr(bill.total)}</td>
                </tr>
                <tr className="sub">
                  <td>Advance paid</td>
                  <td className="mono">−{inr(bill.advancePaid || 0)}</td>
                </tr>
                {Number(bill.otherPayments) > 0 && (
                  <tr className="sub">
                    <td>Additional payments</td>
                    <td className="mono">−{inr(bill.otherPayments)}</td>
                  </tr>
                )}
                <tr className="bal">
                  <td>{bill.balance > 0 ? 'Outstanding Balance' : bill.balance < 0 ? 'Eligible Refund' : 'Settlement'}</td>
                  <td className="mono" style={{ fontWeight: 800, color: bill.balance > 0 ? 'var(--bad, #ef4444)' : 'var(--go, #10b981)' }}>
                    {bill.balance > 0 ? inr(bill.balance) : bill.balance < 0 ? `Refund ${inr(Math.abs(bill.balance))}` : '₹0.00 (Fully Paid)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn blue"
            type="button"
            onClick={() => {
              onClose();
              onCheckout?.(stay.id);
            }}
          >
            Check Out
          </button>
        </div>
      </div>
    </Sheet>
  );
}
