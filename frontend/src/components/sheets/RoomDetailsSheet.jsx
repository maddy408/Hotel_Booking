import { useState, useMemo } from 'react';
import Sheet from '../Sheet.jsx';
import { useStay, useStayBill } from '../../api/stays';
import { useReservation } from '../../api/reservations';
import { useHousekeepingAction } from '../../api/rooms';
import { fetchOccupantDocumentBlob } from '../../api/occupantDocuments';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';

export default function RoomDetailsSheet({
  room,
  onClose,
  onViewStay,
  onEarlyCheckout,
  onCheckout,
  onViewBooking,
  onCheckIn,
  onPreBook,
}) {
  const toast = useToast();
  const hkAction = useHousekeepingAction();
  const [loadingDocId, setLoadingDocId] = useState(null);
  const [repairNote, setRepairNote] = useState('');
  const [showRepairForm, setShowRepairForm] = useState(false);

  // Expandable sections state for Occupied room
  const [occupantsExpanded, setOccupantsExpanded] = useState(true);
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [paymentHistoryExpanded, setPaymentHistoryExpanded] = useState(false);
  const [otherStayInfoExpanded, setOtherStayInfoExpanded] = useState(false);

  // Queries for occupied or booked rooms
  const stayId = room?.status === 'occupied' ? room?.stayId : null;
  const bookingId = room?.status === 'booked' ? (room?.bookingId || room?.pendingBooking?.id) : null;

  const { data: stay, isLoading: isStayLoading } = useStay(stayId);
  const { data: rawBill } = useStayBill(stayId);
  const { data: reservation, isLoading: isBookingLoading } = useReservation(bookingId);

  const bill = stay?.bill || rawBill;
  const today = todayIso();

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

  const handleHousekeeping = async (action, note) => {
    try {
      await hkAction.mutateAsync({ roomId: room.id, action, note: note?.trim() || undefined });
      toast(
        action === 'ready'
          ? `Room ${room.roomNo} marked ready.`
          : action === 'repair'
            ? `Room ${room.roomNo} sent for repair.`
            : `Room ${room.roomNo} sent for cleaning.`
      );
      onClose();
    } catch (err) {
      toast(err.message || 'Housekeeping update failed.');
    }
  };

  // Compile all stay documents for expandable documents section
  const allStayDocs = useMemo(() => {
    if (!stay) return [];
    const list = [];
    (stay.occupants || []).forEach((occ) => {
      (occ.documents || []).forEach((d) => {
        list.push({
          ...d,
          ownerName: occ.name || (occ.is_primary ? stay.guest_name : `Person ${occ.occupant_number}`),
          ownerNumber: occ.occupant_number,
          isPrimary: !!occ.is_primary,
        });
      });
    });
    (stay.documents || []).filter((d) => !d.occupant_id).forEach((d) => {
      list.push({
        ...d,
        ownerName: 'General Stay Proof',
        ownerNumber: null,
        isPrimary: false,
      });
    });
    return list;
  }, [stay]);

  if (!room) return null;

  // -------------------------------------------------------------------------
  // 1. OCCUPIED ROOM DETAILS
  // -------------------------------------------------------------------------
  if (room.status === 'occupied') {
    if (isStayLoading || !stay) {
      return (
        <Sheet className="sheet-room-details" onClose={onClose}>
          <div className="rd-header s-occupied">
            <div className="rd-header-left">
              <span className="rd-room-badge s-occupied">{room.roomNo}</span>
              <div className="rd-header-text">
                <div className="rd-header-title">
                  <strong>Room {room.roomNo}</strong>
                  <span className="rd-header-sep">·</span>
                  <span className="rd-header-type">{room.roomType?.name || 'Room'}</span>
                </div>
              </div>
            </div>
            <div className="rd-header-right">
              <span className="rd-status-pill s-occupied">Occupied</span>
              <button className="x" type="button" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
          </div>
          <div className="rd-body">
            <div className="skel" style={{ height: 110, borderRadius: 12 }} />
            <div className="skel" style={{ height: 140, borderRadius: 12 }} />
            <div className="skel" style={{ height: 160, borderRadius: 12 }} />
          </div>
        </Sheet>
      );
    }

    const nightsStayed = bill?.nights ?? 1;
    const roomCharges = Number(bill?.roomAmount ?? (Number(stay.rate) * nightsStayed));
    const roomGst = Number(bill?.roomGstAmount ?? 0);
    const extrasGst = Number(bill?.extrasGstAmount ?? 0);
    const totalGst = roomGst + extrasGst;
    const gstRateDisplay = bill?.gstRate ? `${Math.round(bill.gstRate * 100)}%` : '0%';
    const totalInvoice = Number(bill?.total ?? (roomCharges + totalGst));
    const advancePaid = Number(bill?.advancePaid ?? 0);
    const otherPayments = Number(bill?.otherPayments ?? 0);
    const netPaid = Number(bill?.netPaid ?? (advancePaid + otherPayments));
    const balance = Number(bill?.balance ?? (totalInvoice - netPaid));
    const outstandingBalance = Number(bill?.outstandingBalance ?? (balance > 0 ? balance : 0));

    const plannedCheckoutDate = stay?.checkout_planned ? stay.checkout_planned.slice(0, 10) : null;
    const isLate = Boolean(
      (plannedCheckoutDate && today > plannedCheckoutDate) ||
      bill?.isLateCheckout ||
      bill?.checkoutType === 'late'
    );
    const isEarlyEligible = Boolean(
      plannedCheckoutDate && today < plannedCheckoutDate && !isLate
    );

    const actualPersonsCount = Number(stay.persons || 1);
    const personsDisplay = `${actualPersonsCount} ${actualPersonsCount === 1 ? 'Person' : 'Persons'}`;
    const occupantsList = stay.occupants && stay.occupants.length > 0 ? stay.occupants : [];
    const generalStayDocs = (stay.documents || []).filter((d) => !d.occupant_id);

    return (
      <Sheet className="sheet-room-details" onClose={onClose}>
        {/* Compact Sticky Header */}
        <div className="rd-header s-occupied">
          <div className="rd-header-left">
            <span className="rd-room-badge s-occupied">{room.roomNo}</span>
            <div className="rd-header-text">
              <div className="rd-header-title">
                <strong>Room {room.roomNo}</strong>
                <span className="rd-header-sep">·</span>
                <span className="rd-header-type">{stay.room_type_name || room.roomType?.name}</span>
              </div>
            </div>
          </div>
          <div className="rd-header-right">
            <span className="rd-status-pill s-occupied">Occupied</span>
            <span className="rd-persons-pill" title="Current persons staying in this room">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{personsDisplay}</span>
            </span>
            <button className="x" type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Main Content Area */}
        <div className="rd-body">
          {/* Section 1: Guest Details (Two-Column Layout) */}
          <div className="rd-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Guest Details</h4>
            </div>
            <div className="rd-grid-2">
              <div className="rd-field">
                <span className="rd-field-label">Guest Name</span>
                <span className="rd-field-value bold">{stay.guest_name}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Mobile Number</span>
                <span className="rd-field-value mono">{stay.guest_phone}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">ID Proof Type</span>
                <span className="rd-field-value">
                  {stay.id_proof_type || 'Aadhaar'}
                  {stay.id_proof_last4 ? (
                    <span className="mono muted" style={{ marginLeft: 6 }}>
                      ••••{stay.id_proof_last4}
                    </span>
                  ) : null}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Actual Persons Count</span>
                <span className="rd-field-value bold" style={{ color: 'var(--color-primary, #70265F)' }}>
                  {personsDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Stay Details (Compact Two-Column Layout) */}
          <div className="rd-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Stay Details</h4>
            </div>
            <div className="rd-grid-2">
              <div className="rd-field">
                <span className="rd-field-label">Original Check-in Date</span>
                <span className="rd-field-value mono">
                  {fd(stay.original_check_in_date || stay.check_in_date)}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Original Planned Checkout</span>
                <span className="rd-field-value mono">
                  {fd(stay.original_checkout_date || stay.checkout_planned)}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Actual Check-in Date</span>
                <span className="rd-field-value mono">
                  {fd(stay.check_in_date)}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Current Planned Checkout</span>
                <span className="rd-field-value mono">
                  {fd(stay.checkout_planned)}
                  {stay.checkout_time ? (
                    <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>
                      ({stay.checkout_time.slice(0, 5)})
                    </span>
                  ) : null}
                  {isLate && (
                    <span style={{ fontSize: 11, marginLeft: 6, color: 'var(--color-danger, #b43d50)', fontWeight: 700 }}>
                      (Overdue)
                    </span>
                  )}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Actual Nights Stayed</span>
                <span className="rd-field-value bold">
                  {nightsStayed} {nightsStayed > 1 ? 'nights' : 'night'}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Daily Room Rate</span>
                <span className="rd-field-value mono bold">
                  {inr(stay.rate)} / day
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Payment Summary (Compact Section with Prominent Outstanding Balance) */}
          <div className="rd-card rd-payment-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Payment Summary</h4>
              <span className="rd-pill-badge">GST: {gstRateDisplay}</span>
            </div>
            <div className="rd-payment-body">
              <div className="rd-financial-list">
                <div className="rd-fin-row">
                  <span className="rd-fin-label">Room Charges ({nightsStayed} night{nightsStayed > 1 ? 's' : ''} × {inr(stay.rate)})</span>
                  <span className="rd-fin-val mono">{inr(roomCharges)}</span>
                </div>
                <div className="rd-fin-row sub">
                  <span className="rd-fin-label">GST ({gstRateDisplay})</span>
                  <span className="rd-fin-val mono">+{inr(totalGst)}</span>
                </div>
                {bill?.charges?.length > 0 && (
                  <div className="rd-fin-row sub">
                    <span className="rd-fin-label">Extras & Services ({bill.charges.length} item{bill.charges.length > 1 ? 's' : ''})</span>
                    <span className="rd-fin-val mono">+{inr(bill.extrasAmount || 0)}</span>
                  </div>
                )}
                {Number(bill?.earlyCheckoutFee) > 0 && (
                  <div className="rd-fin-row sub" style={{ color: 'var(--color-danger, #b43d50)' }}>
                    <span className="rd-fin-label">Early Checkout Policy Fee</span>
                    <span className="rd-fin-val mono">+{inr(bill.earlyCheckoutFee)}</span>
                  </div>
                )}
                {Number(bill?.discountAmount) > 0 && (
                  <div className="rd-fin-row sub" style={{ color: 'var(--color-success, #218653)' }}>
                    <span className="rd-fin-label">Discount Applied</span>
                    <span className="rd-fin-val mono">−{inr(bill.discountAmount)}</span>
                  </div>
                )}
                <div className="rd-fin-row total-row">
                  <span className="rd-fin-label">Total Invoice Amount</span>
                  <span className="rd-fin-val mono bold">{inr(totalInvoice)}</span>
                </div>
                <div className="rd-fin-row sub">
                  <span className="rd-fin-label">Advance Paid</span>
                  <span className="rd-fin-val mono">−{inr(advancePaid)}</span>
                </div>
                {otherPayments > 0 && (
                  <div className="rd-fin-row sub">
                    <span className="rd-fin-label">Additional Payments</span>
                    <span className="rd-fin-val mono">−{inr(otherPayments)}</span>
                  </div>
                )}
                <div className="rd-fin-row paid-row">
                  <span className="rd-fin-label">Total Amount Paid</span>
                  <span className="rd-fin-val mono bold">−{inr(netPaid)}</span>
                </div>
              </div>

              {/* Prominent Outstanding Balance Box */}
              <div className={`rd-balance-box ${balance > 0 ? 'is-due' : balance < 0 ? 'is-refund' : 'is-settled'}`}>
                <div className="rd-balance-meta">
                  <span className="rd-balance-title">
                    {balance > 0 ? 'Outstanding Balance' : balance < 0 ? 'Eligible Refund' : 'Settlement Status'}
                  </span>
                  <span className="rd-balance-tag">
                    {balance > 0 ? 'Payment Due' : balance < 0 ? 'Refund Due' : 'Paid in Full'}
                  </span>
                </div>
                <div className="rd-balance-figure mono">
                  {balance > 0
                    ? inr(outstandingBalance)
                    : balance < 0
                      ? `Refund ${inr(Math.abs(balance))}`
                      : '₹0.00 (Fully Paid)'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Occupant Details (Expandable / Collapsible Section) */}
          <div className="rd-accordion">
            <button
              type="button"
              className="rd-accordion-btn"
              onClick={() => setOccupantsExpanded(!occupantsExpanded)}
              aria-expanded={occupantsExpanded}
            >
              <div className="rd-accordion-left">
                <span className="rd-card-title" style={{ margin: 0 }}>Occupant Details</span>
                <span className="rd-pill-badge">
                  {occupantsList.length > 0 ? occupantsList.length : actualPersonsCount} {Number(occupantsList.length > 0 ? occupantsList.length : actualPersonsCount) === 1 ? 'Occupant' : 'Occupants'}
                </span>
              </div>
              <span className="rd-accordion-indicator">
                {occupantsExpanded ? '▲ Hide Occupants' : '▼ View Occupants'}
              </span>
            </button>

            {occupantsExpanded && (
              <div className="rd-accordion-content">
                {occupantsList.length === 0 ? (
                  <div className="rd-occupant-item">
                    <div className="rd-occupant-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="rd-occ-num">1</span>
                        <strong>{stay.guest_name}</strong>
                        <span style={{ fontSize: 10, background: 'var(--color-lavender-light)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                          Lead Guest
                        </span>
                      </div>
                      <span className="mono muted">{stay.guest_phone}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {stay.id_proof_type || 'Aadhaar'} {stay.id_proof_last4 ? `••••${stay.id_proof_last4}` : ''} · {personsDisplay} registered for this stay.
                    </div>
                  </div>
                ) : (
                  <div>
                    {occupantsList.map((occ) => (
                      <div key={occ.id || occ.occupant_number} className="rd-occupant-item">
                        <div className="rd-occupant-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span className="rd-occ-num">{occ.occupant_number}</span>
                            <strong>{occ.name || (occ.is_primary ? stay.guest_name : `Person ${occ.occupant_number}`)}</strong>
                            {occ.gender && <span className="muted" style={{ fontSize: 11.5 }}>({occ.gender})</span>}
                            {occ.is_primary === 1 && (
                              <span style={{ fontSize: 10, background: 'var(--color-lavender-light)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                                Lead Guest
                              </span>
                            )}
                          </div>
                          <span className="mono muted">
                            {occ.phone || (occ.is_primary ? stay.guest_phone : '—')}
                          </span>
                        </div>

                        {/* Associated ID Proof Document for this Occupant */}
                        {occ.documents && occ.documents.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {occ.documents.map((doc) => {
                              const isPdf = doc.original_filename?.toLowerCase().endsWith('.pdf');
                              return (
                                <div key={doc.id} className="rd-doc-row">
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                    <span className={`rd-doc-badge ${isPdf ? 'pdf' : 'img'}`}>
                                      {doc.original_filename?.split('.').pop() || 'ID'}
                                    </span>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                      {doc.original_filename}
                                    </span>
                                    {doc.file_size ? (
                                      <span className="muted" style={{ fontSize: 10.5 }}>
                                        ({Math.round(doc.file_size / 1024)} KB)
                                      </span>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    disabled={loadingDocId === doc.id}
                                    onClick={() => handleViewDocument(doc)}
                                    style={{ fontSize: 11, padding: '2px 8px', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    <span>{loadingDocId === doc.id ? 'Opening…' : 'View Document'}</span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="muted" style={{ fontSize: 11, fontStyle: 'italic', marginTop: 2 }}>
                            No ID document attached for this occupant.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 5: ID Proof Documents (Expandable Section) */}
          <div className="rd-accordion">
            <button
              type="button"
              className="rd-accordion-btn"
              onClick={() => setDocsExpanded(!docsExpanded)}
              aria-expanded={docsExpanded}
            >
              <div className="rd-accordion-left">
                <span className="rd-card-title" style={{ margin: 0 }}>ID Proof Documents</span>
                <span className="rd-pill-badge">{allStayDocs.length}</span>
              </div>
              <span className="rd-accordion-indicator">
                {docsExpanded ? '▲ Hide Documents' : '▼ View Documents'}
              </span>
            </button>

            {docsExpanded && (
              <div className="rd-accordion-content">
                {allStayDocs.length === 0 ? (
                  <div className="muted" style={{ fontSize: 12, padding: '4px 0' }}>
                    No ID proof documents uploaded for this stay yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {allStayDocs.map((doc) => {
                      const isPdf = doc.original_filename?.toLowerCase().endsWith('.pdf');
                      return (
                        <div key={doc.id} className="rd-doc-row" style={{ background: '#ffffff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                            <span className={`rd-doc-badge ${isPdf ? 'pdf' : 'img'}`}>
                              {doc.original_filename?.split('.').pop() || 'ID'}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240, fontWeight: 600 }}>
                                {doc.original_filename}
                              </span>
                              <span className="muted" style={{ fontSize: 10.5 }}>
                                {doc.ownerName} {doc.file_size ? `· ${Math.round(doc.file_size / 1024)} KB` : ''}
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn sm"
                            disabled={loadingDocId === doc.id}
                            onClick={() => handleViewDocument(doc)}
                            style={{ fontSize: 11, padding: '2px 8px', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            <span>{loadingDocId === doc.id ? 'Opening…' : 'View / Preview'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 6: Payment History (Expandable Section) */}
          <div className="rd-accordion">
            <button
              type="button"
              className="rd-accordion-btn"
              onClick={() => setPaymentHistoryExpanded(!paymentHistoryExpanded)}
              aria-expanded={paymentHistoryExpanded}
            >
              <div className="rd-accordion-left">
                <span className="rd-card-title" style={{ margin: 0 }}>Payment History</span>
                <span className="rd-pill-badge">{inr(netPaid)} Paid</span>
              </div>
              <span className="rd-accordion-indicator">
                {paymentHistoryExpanded ? '▲ Hide History' : '▼ View History'}
              </span>
            </button>

            {paymentHistoryExpanded && (
              <div className="rd-accordion-content">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stay.payments && stay.payments.length > 0 ? (
                    stay.payments.map((p) => (
                      <div key={p.id} className="rd-doc-row" style={{ background: '#ffffff', padding: '6px 10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontSize: 12.5, textTransform: 'capitalize' }}>
                              {p.type || 'Payment'}
                            </strong>
                            <span style={{ fontSize: 10.5, background: 'var(--color-lavender-light)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase' }}>
                              {p.method || 'CASH'}
                            </span>
                            {p.status && (
                              <span style={{ fontSize: 10, color: p.status === 'successful' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                ({p.status})
                              </span>
                            )}
                          </div>
                          {p.created_at && (
                            <span className="muted" style={{ fontSize: 11 }}>
                              {fd(p.created_at)}
                            </span>
                          )}
                        </div>
                        <span className="mono bold" style={{ fontSize: 13, color: 'var(--color-heading)' }}>
                          {inr(p.amount)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="rd-doc-row" style={{ background: '#ffffff', padding: '6px 10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontSize: 12.5 }}>Advance Payment</strong>
                            {stay.advance_method && (
                              <span style={{ fontSize: 10.5, background: 'var(--color-lavender-light)', color: 'var(--color-primary)', padding: '1px 5px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase' }}>
                                {stay.advance_method}
                              </span>
                            )}
                          </div>
                          <span className="muted" style={{ fontSize: 11 }}>
                            Collected at check-in · {fd(stay.check_in_date)}
                          </span>
                        </div>
                        <span className="mono bold" style={{ fontSize: 13, color: 'var(--color-success, #218653)' }}>
                          {inr(advancePaid)}
                        </span>
                      </div>
                      {otherPayments > 0 && (
                        <div className="rd-doc-row" style={{ background: '#ffffff', padding: '6px 10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <strong style={{ fontSize: 12.5 }}>Additional Payments</strong>
                            <span className="muted" style={{ fontSize: 11 }}>
                              Interim settlement / room service payments
                            </span>
                          </div>
                          <span className="mono bold" style={{ fontSize: 13 }}>
                            {inr(otherPayments)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 4px 2px', fontSize: 12, borderTop: '1px dashed var(--color-border)' }}>
                    <span>Total Net Paid:</span>
                    <strong className="mono">{inr(netPaid)}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 7: Other Stay Information (Expandable Section) */}
          <div className="rd-accordion">
            <button
              type="button"
              className="rd-accordion-btn"
              onClick={() => setOtherStayInfoExpanded(!otherStayInfoExpanded)}
              aria-expanded={otherStayInfoExpanded}
            >
              <div className="rd-accordion-left">
                <span className="rd-card-title" style={{ margin: 0 }}>Other Stay Information</span>
              </div>
              <span className="rd-accordion-indicator">
                {otherStayInfoExpanded ? '▲ Hide Info' : '▼ View Info'}
              </span>
            </button>

            {otherStayInfoExpanded && (
              <div className="rd-accordion-content">
                <div className="rd-grid-2">
                  <div className="rd-field">
                    <span className="rd-field-label">Floor</span>
                    <span className="rd-field-value">{room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`}</span>
                  </div>
                  <div className="rd-field">
                    <span className="rd-field-label">Room Type & Code</span>
                    <span className="rd-field-value">{stay.room_type_name} ({room.roomType?.code || '—'})</span>
                  </div>
                  {stay.reservation_id && (
                    <div className="rd-field">
                      <span className="rd-field-label">Originating Reservation</span>
                      <span className="rd-field-value mono">Booking #{stay.reservation_id}</span>
                    </div>
                  )}
                  {stay.referred_by_guest_name && (
                    <div className="rd-field">
                      <span className="rd-field-label">Referred By</span>
                      <span className="rd-field-value">
                        {stay.referred_by_guest_name}
                        {stay.referred_by_guest_phone ? ` (${stay.referred_by_guest_phone})` : ''}
                      </span>
                    </div>
                  )}
                  {bill?.cgstAmount !== undefined && (
                    <div className="rd-field">
                      <span className="rd-field-label">Tax Breakup</span>
                      <span className="rd-field-value mono" style={{ fontSize: 12 }}>
                        CGST: {inr(bill.cgstAmount || 0)} · SGST: {inr(bill.sgstAmount || 0)}
                        {Number(bill.igstAmount) > 0 ? ` · IGST: ${inr(bill.igstAmount)}` : ''}
                      </span>
                    </div>
                  )}
                  {room.note && (
                    <div className="rd-field" style={{ gridColumn: '1 / -1' }}>
                      <span className="rd-field-label">Room Note</span>
                      <span className="rd-field-value">{room.note}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="rd-footer">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn dark"
            type="button"
            onClick={() => {
              onClose();
              onViewStay?.(stay.id);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>View Stay</span>
          </button>
          {isEarlyEligible && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                onClose();
                onEarlyCheckout?.(stay.id);
              }}
              style={{
                color: 'var(--color-warning-text, #b77920)',
                borderColor: 'var(--color-warning-border, #f7ddb8)',
                background: 'var(--color-warning-bg, #fff3e4)',
                fontWeight: 600,
              }}
            >
              Early Check Out
            </button>
          )}
          <button
            className="btn blue"
            type="button"
            onClick={() => {
              onClose();
              onCheckout?.(stay.id);
            }}
            style={{ fontWeight: 700 }}
          >
            {isLate ? 'Late Check Out' : 'Check Out'}
          </button>
        </div>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------------
  // 2. BOOKED ROOM DETAILS
  // -------------------------------------------------------------------------
  if (room.status === 'booked') {
    if (isBookingLoading || !reservation) {
      return (
        <Sheet className="sheet-room-details" onClose={onClose}>
          <div className="rd-header s-booked">
            <div className="rd-header-left">
              <span className="rd-room-badge s-booked">{room.roomNo}</span>
              <div className="rd-header-text">
                <div className="rd-header-title">
                  <strong>Room {room.roomNo}</strong>
                  <span className="rd-header-sep">·</span>
                  <span className="rd-header-type">{room.roomType?.name || 'Room'}</span>
                </div>
              </div>
            </div>
            <div className="rd-header-right">
              <span className="rd-status-pill s-booked">Booked</span>
              <button className="x" type="button" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
          </div>
          <div className="rd-body">
            <div className="skel" style={{ height: 120, borderRadius: 12 }} />
            <div className="skel" style={{ height: 160, borderRadius: 12 }} />
          </div>
        </Sheet>
      );
    }

    const canCheckIn =
      reservation.status === 'pending' &&
      reservation.check_in_date <= today &&
      room.housekeepingStatus === 'ok';

    const bookedPersonsCount = Number(reservation.persons || room.persons || 1);
    const bookedPersonsDisplay = `${bookedPersonsCount} ${bookedPersonsCount === 1 ? 'Person' : 'Persons'}`;

    return (
      <Sheet className="sheet-room-details" onClose={onClose}>
        {/* Compact Sticky Header */}
        <div className="rd-header s-booked">
          <div className="rd-header-left">
            <span className="rd-room-badge s-booked">{room.roomNo}</span>
            <div className="rd-header-text">
              <div className="rd-header-title">
                <strong>Room {room.roomNo}</strong>
                <span className="rd-header-sep">·</span>
                <span className="rd-header-type">{room.roomType?.name || 'Room'}</span>
              </div>
            </div>
          </div>
          <div className="rd-header-right">
            <span className="rd-status-pill s-booked">Booked</span>
            <span className="rd-persons-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{bookedPersonsDisplay}</span>
            </span>
            <button className="x" type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Main Content Area */}
        <div className="rd-body">
          {/* Section 1: Guest Information (Two-Column Layout) */}
          <div className="rd-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Guest Details</h4>
            </div>
            <div className="rd-grid-2">
              <div className="rd-field">
                <span className="rd-field-label">Guest Name</span>
                <span className="rd-field-value bold">{reservation.guest_name}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Mobile Number</span>
                <span className="rd-field-value mono">{reservation.guest_phone}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Email Address</span>
                <span className="rd-field-value">{reservation.guest_email || '—'}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Persons Count</span>
                <span className="rd-field-value bold" style={{ color: 'var(--color-primary, #70265F)' }}>
                  {bookedPersonsDisplay}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Booking Dates & Tariff (Two-Column Layout) */}
          <div className="rd-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Booking Details</h4>
              <span className="rd-pill-badge mono">{reservation.booking_code}</span>
            </div>
            <div className="rd-grid-2">
              <div className="rd-field">
                <span className="rd-field-label">Check-in Date</span>
                <span className="rd-field-value mono">
                  {fd(reservation.check_in_date)}
                  {reservation.check_in_date <= today && (
                    <span style={{ color: 'var(--color-success, #218653)', fontWeight: 600, marginLeft: 4 }}>
                      (Due Today)
                    </span>
                  )}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Check-out Date</span>
                <span className="rd-field-value mono">{fd(reservation.check_out_date)}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Planned Check-out Time</span>
                <span className="rd-field-value">{reservation.check_out_time || '12:00 PM'}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Daily Room Rate</span>
                <span className="rd-field-value mono bold">{inr(reservation.rate)} / day</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Booking Status</span>
                <span className="rd-field-value bold" style={{ color: 'var(--color-warning-text, #b77920)', textTransform: 'uppercase' }}>
                  {reservation.status}
                </span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Room Readiness</span>
                <span className="rd-field-value">
                  {room.housekeepingStatus === 'ok' ? (
                    <span style={{ color: 'var(--color-success, #218653)', fontWeight: 600 }}>Ready for arrival</span>
                  ) : room.housekeepingStatus === 'repair' ? (
                    <span style={{ color: 'var(--color-danger, #b43d50)', fontWeight: 600 }}>Under repair ({room.note || 'maintenance'})</span>
                  ) : (
                    <span style={{ color: 'var(--color-cleaning-text, #7853a2)', fontWeight: 600 }}>Cleaning in progress</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Payment & Advance Summary (Compact Financial Section) */}
          <div className="rd-card rd-payment-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Payment & Advance Status</h4>
            </div>
            <div className="rd-payment-body">
              <div className="rd-grid-2">
                <div className="rd-field">
                  <span className="rd-field-label">Advance Paid</span>
                  <span className="rd-field-value mono bold" style={{ color: Number(reservation.advance_paid) > 0 ? 'var(--color-success, #218653)' : 'var(--color-danger, #b43d50)' }}>
                    {Number(reservation.advance_paid) > 0 ? inr(reservation.advance_paid) : 'No advance collected'}
                  </span>
                </div>
                <div className="rd-field">
                  <span className="rd-field-label">Advance Method</span>
                  <span className="rd-field-value" style={{ textTransform: 'uppercase' }}>
                    {reservation.advance_method || '—'}
                  </span>
                </div>
              </div>

              {/* Outstanding / Advance Status Banner */}
              <div className={`rd-balance-box ${Number(reservation.advance_paid) > 0 ? 'is-settled' : 'is-due'}`}>
                <div className="rd-balance-meta">
                  <span className="rd-balance-title">Advance Collection</span>
                  <span className="rd-balance-tag">
                    {Number(reservation.advance_paid) > 0 ? 'Advance Confirmed' : 'Payment Required Before Check-In'}
                  </span>
                </div>
                <div className="rd-balance-figure mono">
                  {Number(reservation.advance_paid) > 0 ? inr(reservation.advance_paid) : '₹0.00'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Booking Source & Notes (Expandable Section) */}
          {(reservation.booking_source || reservation.notes) && (
            <div className="rd-card">
              <div className="rd-card-header">
                <h4 className="rd-card-title">Source & Notes</h4>
              </div>
              <div className="rd-grid-2">
                <div className="rd-field">
                  <span className="rd-field-label">Booking Source</span>
                  <span className="rd-field-value">{reservation.booking_source || 'Social Media'}</span>
                </div>
                {reservation.referred_by_guest_name && (
                  <div className="rd-field">
                    <span className="rd-field-label">Referred By</span>
                    <span className="rd-field-value">
                      {reservation.referred_by_guest_name}
                      {reservation.referred_by_guest_phone ? ` (${reservation.referred_by_guest_phone})` : ''}
                    </span>
                  </div>
                )}
                {reservation.other_source && (
                  <div className="rd-field">
                    <span className="rd-field-label">Source Person</span>
                    <span className="rd-field-value">{reservation.other_source}</span>
                  </div>
                )}
                {reservation.notes && (
                  <div className="rd-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="rd-field-label">Special Notes</span>
                    <span className="rd-field-value">{reservation.notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="rd-footer">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn dark"
            type="button"
            onClick={() => {
              onClose();
              onViewBooking?.(reservation.id);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>View Booking</span>
          </button>
          {canCheckIn && (
            <button
              className="btn go"
              type="button"
              onClick={() => {
                onClose();
                onCheckIn?.(reservation);
              }}
              style={{ fontWeight: 700 }}
            >
              Guest Came · Check In
            </button>
          )}
        </div>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------------
  // 3. READY ROOM DETAILS
  // -------------------------------------------------------------------------
  if (room.status === 'free') {
    return (
      <Sheet className="sheet-room-details" onClose={onClose}>
        {/* Compact Sticky Header */}
        <div className="rd-header s-free">
          <div className="rd-header-left">
            <span className="rd-room-badge s-free">{room.roomNo}</span>
            <div className="rd-header-text">
              <div className="rd-header-title">
                <strong>Room {room.roomNo}</strong>
                <span className="rd-header-sep">·</span>
                <span className="rd-header-type">{room.roomType?.name}</span>
              </div>
            </div>
          </div>
          <div className="rd-header-right">
            <span className="rd-status-pill s-free">Available</span>
            <span className="rd-persons-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>0 Persons</span>
            </span>
            <button className="x" type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Main Content Area */}
        <div className="rd-body">
          <div className="rd-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Room Information</h4>
              <span className="rd-pill-badge" style={{ color: 'var(--color-success, #218653)', background: 'var(--color-success-bg, #e9f6ef)', borderColor: 'var(--color-success-border, #c2e5d2)' }}>
                Ready to Give
              </span>
            </div>
            <div className="rd-grid-2">
              <div className="rd-field">
                <span className="rd-field-label">Room Number</span>
                <span className="rd-field-value bold">Room {room.roomNo}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Floor</span>
                <span className="rd-field-value">{room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Room Type</span>
                <span className="rd-field-value">{room.roomType?.name} ({room.roomType?.code || '—'})</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Daily Tariff Rate</span>
                <span className="rd-field-value mono bold">{inr(room.roomType?.rate || 0)} / night</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Max Capacity</span>
                <span className="rd-field-value">{room.roomType?.maxPersons || 2} Persons max</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Current Guests</span>
                <span className="rd-field-value muted">None (Vacant)</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Next Scheduled Booking</span>
                <span className="rd-field-value mono">
                  {room.nextBookingDate ? fd(room.nextBookingDate) : 'No upcoming bookings'}
                </span>
              </div>
              {room.note && (
                <div className="rd-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="rd-field-label">Room Note</span>
                  <span className="rd-field-value">{room.note}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky Action Footer */}
        <div className="rd-footer">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="btn dark"
            type="button"
            onClick={() => {
              onClose();
              onPreBook?.(room);
            }}
          >
            + Pre-Book for Later
          </button>
          <button
            className="btn go"
            type="button"
            onClick={() => {
              onClose();
              onCheckIn?.(room);
            }}
            style={{ fontWeight: 700 }}
          >
            + Direct Check-in (Walk-in Guest)
          </button>
        </div>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------------
  // 4. CLEANING ROOM DETAILS
  // -------------------------------------------------------------------------
  if (room.status === 'cleaning') {
    return (
      <Sheet className="sheet-room-details" onClose={onClose}>
        {/* Compact Sticky Header */}
        <div className="rd-header s-cleaning">
          <div className="rd-header-left">
            <span className="rd-room-badge s-cleaning">{room.roomNo}</span>
            <div className="rd-header-text">
              <div className="rd-header-title">
                <strong>Room {room.roomNo}</strong>
                <span className="rd-header-sep">·</span>
                <span className="rd-header-type">{room.roomType?.name}</span>
              </div>
            </div>
          </div>
          <div className="rd-header-right">
            <span className="rd-status-pill s-cleaning">Cleaning</span>
            <span className="rd-persons-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>0 Persons</span>
            </span>
            <button className="x" type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Main Content Area */}
        <div className="rd-body">
          <div className="rd-card">
            <div className="rd-card-header">
              <h4 className="rd-card-title">Housekeeping Status</h4>
              <span className="rd-pill-badge" style={{ color: 'var(--color-cleaning-text, #7853a2)', background: 'var(--color-cleaning-bg, #f1ebfa)', borderColor: 'var(--color-cleaning-border, #dfcff4)' }}>
                In Progress
              </span>
            </div>
            <div className="rd-grid-2">
              <div className="rd-field">
                <span className="rd-field-label">Room Number</span>
                <span className="rd-field-value bold">Room {room.roomNo}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Floor</span>
                <span className="rd-field-value">{room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Room Type</span>
                <span className="rd-field-value">{room.roomType?.name}</span>
              </div>
              <div className="rd-field">
                <span className="rd-field-label">Current Guests</span>
                <span className="rd-field-value muted">None (Vacant)</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '12px 0 0' }}>
              Housekeeping is currently servicing this room. Once finished, mark it ready to make it immediately available for guests.
            </p>
          </div>

          {showRepairForm && (
            <div className="rd-card" style={{ borderColor: 'var(--color-danger-border, #f5c7ce)', background: 'var(--color-danger-bg, #fcebed)' }}>
              <div className="rd-card-header" style={{ borderBottomColor: 'var(--color-danger-border, #f5c7ce)' }}>
                <h4 className="rd-card-title" style={{ color: 'var(--color-danger, #b43d50)' }}>
                  Send Room for Repair
                </h4>
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6, color: 'var(--color-heading)' }}>
                Maintenance or Problem Description:
              </label>
              <input
                type="text"
                placeholder="e.g. Bathroom tap leaking, AC remote broken"
                value={repairNote}
                onChange={(e) => setRepairNote(e.target.value)}
                style={{ width: '100%', marginBottom: 10, background: '#ffffff' }}
              />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="btn sm" type="button" onClick={() => setShowRepairForm(false)}>
                  Cancel
                </button>
                <button
                  className="btn red sm"
                  type="button"
                  disabled={hkAction.isPending}
                  onClick={() => handleHousekeeping('repair', repairNote)}
                >
                  {hkAction.isPending ? 'Sending…' : 'Confirm Send for Repair'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Action Footer */}
        <div className="rd-footer">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
          {!showRepairForm && (
            <button
              className="btn sm"
              type="button"
              onClick={() => setShowRepairForm(true)}
              style={{ color: 'var(--color-danger, #b43d50)' }}
            >
              Found a problem? Send for repair
            </button>
          )}
          <button
            className="btn go"
            type="button"
            disabled={hkAction.isPending}
            onClick={() => handleHousekeeping('ready')}
            style={{ fontWeight: 700 }}
          >
            {hkAction.isPending ? 'Updating…' : 'Mark Room Ready'}
          </button>
        </div>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------------
  // 5. MAINTENANCE / REPAIR ROOM DETAILS
  // -------------------------------------------------------------------------
  return (
    <Sheet className="sheet-room-details" onClose={onClose}>
      {/* Compact Sticky Header */}
      <div className="rd-header s-repair">
        <div className="rd-header-left">
          <span className="rd-room-badge s-repair">{room.roomNo}</span>
          <div className="rd-header-text">
            <div className="rd-header-title">
              <strong>Room {room.roomNo}</strong>
              <span className="rd-header-sep">·</span>
              <span className="rd-header-type">{room.roomType?.name}</span>
            </div>
          </div>
        </div>
        <div className="rd-header-right">
          <span className="rd-status-pill s-repair">Under Repair</span>
          <span className="rd-persons-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>0 Persons</span>
          </span>
          <button className="x" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
      </div>

      {/* Scrollable Main Content Area */}
      <div className="rd-body">
        <div className="rd-card">
          <div className="rd-card-header">
            <h4 className="rd-card-title">Maintenance Details</h4>
            <span className="rd-pill-badge" style={{ color: 'var(--color-danger, #b43d50)', background: 'var(--color-danger-bg, #fcebed)', borderColor: 'var(--color-danger-border, #f5c7ce)' }}>
              Out of Order
            </span>
          </div>
          <div className="rd-grid-2">
            <div className="rd-field">
              <span className="rd-field-label">Room Number</span>
              <span className="rd-field-value bold">Room {room.roomNo}</span>
            </div>
            <div className="rd-field">
              <span className="rd-field-label">Floor</span>
              <span className="rd-field-value">{room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`}</span>
            </div>
            <div className="rd-field">
              <span className="rd-field-label">Room Type</span>
              <span className="rd-field-value">{room.roomType?.name}</span>
            </div>
            <div className="rd-field">
              <span className="rd-field-label">Current Guests</span>
              <span className="rd-field-value muted">None (Vacant)</span>
            </div>
            <div className="rd-field" style={{ gridColumn: '1 / -1' }}>
              <span className="rd-field-label">Reported Problem / Note</span>
              <span className="rd-field-value bold" style={{ color: 'var(--color-danger, #b43d50)' }}>
                {room.note || 'Maintenance in progress'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="rd-footer">
        <button className="btn" type="button" onClick={onClose}>
          Close
        </button>
        <button
          className="btn go"
          type="button"
          disabled={hkAction.isPending}
          onClick={() => handleHousekeeping('cleaning')}
          style={{ fontWeight: 700 }}
        >
          {hkAction.isPending ? 'Updating…' : 'Repair Done · Send for Cleaning'}
        </button>
      </div>
    </Sheet>
  );
}
