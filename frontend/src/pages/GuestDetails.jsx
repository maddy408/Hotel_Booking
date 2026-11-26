import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGuest, useDeleteGuest } from '../api/guests';
import { useUploadIdImage, useDeleteIdImage, fetchIdImageBlobUrl } from '../api/idImage';
import { fetchOccupantDocumentBlob, useDeleteOccupantDocument } from '../api/occupantDocuments';
import GuestEditSheet from '../components/sheets/GuestEditSheet.jsx';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import StayDetailSheet from '../components/sheets/StayDetailSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fd, inr } from '../lib/format';

export default function GuestDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const guestId = Number(id);
  const { data: guest, isLoading, isError, error, refetch } = useGuest(guestId);
  const uploadIdImage = useUploadIdImage();
  const deleteIdImage = useDeleteIdImage();
  const deleteGuest = useDeleteGuest();
  const deleteOccupantDoc = useDeleteOccupantDocument();
  const toast = useToast();

  const fileInputRef = useRef(null);
  const [photoBlobUrl, setPhotoBlobUrl] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [activeTab, setActiveTab] = useState('personal');
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [guestId]);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleViewIdPhoto = async () => {
    try {
      if (photoBlobUrl) {
        window.open(photoBlobUrl, '_blank');
        return;
      }
      const url = await fetchIdImageBlobUrl(guestId);
      setPhotoBlobUrl(url);
      window.open(url, '_blank');
    } catch (err) {
      toast(err.message || 'Could not view ID photo.');
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await uploadIdImage.mutateAsync({ guestId, file });
      toast('Guest ID photo uploaded successfully.');
      setPhotoBlobUrl(null);
      refetch();
    } catch (err) {
      toast(err.message || 'Photo upload failed.');
    }
  };

  const handleViewDoc = async (docId) => {
    try {
      const { blobUrl } = await fetchOccupantDocumentBlob(docId);
      window.open(blobUrl, '_blank');
    } catch (err) {
      toast(err.message || 'Could not view document.');
    }
  };

  const handleDownloadDoc = async (docId, filename) => {
    try {
      const { blobUrl } = await fetchOccupantDocumentBlob(docId);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast(err.message || 'Could not download document.');
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await deleteOccupantDoc.mutateAsync({ docId });
      toast('Document removed.');
      refetch();
    } catch (err) {
      toast(err.message || 'Could not remove document.');
    }
  };

  const handleDeleteGuest = async () => {
    if (!window.confirm(`Are you sure you want to delete ${guest.name}? This action cannot be undone.`)) return;
    setDeleteError(null);
    try {
      await deleteGuest.mutateAsync(guestId);
      toast(`Guest ${guest.name} deleted.`);
      navigate('/guests');
    } catch (err) {
      toast(err.message || 'Cannot delete guest.');
      setDeleteError({
        message: err.message || 'Cannot delete guest.',
        code: err.code || null,
        bookingId: err.fields?.bookingId || null,
        bookingCode: err.fields?.bookingCode || null,
        stayId: err.fields?.stayId || null,
        roomNo: err.fields?.roomNo || null,
      });
    }
  };

  const handleDeleteIdPhoto = async () => {
    if (!window.confirm(`Are you sure you want to delete the ID document photo for ${guest.name}?`)) return;
    try {
      await deleteIdImage.mutateAsync({ guestId });
      toast('ID photo deleted.');
      setPhotoBlobUrl(null);
      refetch();
    } catch (err) {
      toast(err.message || 'Failed to delete ID photo.');
    }
  };

  if (isLoading) {
    return (
      <div className="panel" style={{ width: '100%', maxWidth: '100%', margin: 0 }}>
        <div className="sb">
          <div className="skel" style={{ height: 38, width: 140, marginBottom: 16 }} />
          <div className="skel" style={{ height: 80, marginBottom: 16 }} />
          <div className="skel" style={{ height: 90, marginBottom: 16 }} />
          <div className="skel" style={{ height: 260 }} />
        </div>
      </div>
    );
  }

  if (isError || !guest) {
    return (
      <div className="panel" style={{ width: '100%', maxWidth: '100%', margin: 0 }}>
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="btn sm"
            onClick={() => navigate('/guests')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            ← Back to Guests
          </button>
        </div>
        <div className="empty">
          {error?.message || 'Guest not found or could not be loaded.'}
          <div style={{ marginTop: 12 }}>
            <button className="btn sm" type="button" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const bookings = guest.bookings || [];
  const stays = guest.stays || [];
  const payments = guest.payments || [];

  // Documents aggregated from master profile, stays, occupants, and bookings
  const documents = (() => {
    const list = [...(guest.documents || [])];
    const seenIds = new Set(list.map((d) => d.id));
    for (const st of stays) {
      for (const d of st.documents || []) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          list.push({ ...d, related_label: d.related_label || `Stay #${st.id} (Room ${st.room_no})` });
        }
      }
      for (const occ of st.occupants || []) {
        for (const d of occ.documents || []) {
          if (!seenIds.has(d.id)) {
            seenIds.add(d.id);
            list.push({
              ...d,
              occupant_name: occ.name,
              is_primary: occ.is_primary,
              related_label: d.related_label || `Stay #${st.id} (Room ${st.room_no})`,
            });
          }
        }
      }
    }
    for (const bk of bookings) {
      for (const d of bk.documents || []) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          list.push({ ...d, related_label: d.related_label || `Booking ${bk.booking_code || '#' + bk.id}` });
        }
      }
    }
    return list;
  })();

  const referrals = guest.referrals || guest.referred_guests || [];
  const referredBy = guest.referred_by || guest.referredBy || null;

  // Compact Summary calculated from actual backend records
  const outstandingBalance = guest.summary?.outstandingBalance ?? guest.payment_summary?.outstandingBalance ?? 0;

  const summary = guest.summary || {
    totalVisits: guest.visits || stays.filter((s) => s.status !== 'cancelled').length,
    referralsMade: referrals.length,
    currentStayStatus: guest.now ? (guest.now.type === 'in_house' ? 'In-House' : 'Upcoming Booking') : 'Not Staying',
    currentRoomNo: guest.now?.type === 'in_house' ? guest.now.roomNo : null,
    outstandingBalance,
  };

  const currentStayStatusText = guest.now?.type === 'in_house'
    ? `Room ${guest.now.roomNo} · In-House`
    : guest.now?.type === 'booked'
      ? `Room ${guest.now.roomNo} · Booked (${fd(guest.now.bookingDate)})`
      : 'Not Staying';

  // Financial calculations preserving existing logic
  const paymentSummary = guest.payment_summary || {
    totalPaid: payments.filter((p) => p.status === 'successful' && p.type !== 'refund').reduce((acc, p) => acc + Number(p.amount), 0) -
      payments.filter((p) => p.status === 'successful' && p.type === 'refund').reduce((acc, p) => acc + Number(p.amount), 0),
    advanceTotal: payments.filter((p) => p.status === 'successful' && p.type === 'advance').reduce((acc, p) => acc + Number(p.amount), 0),
    additionalTotal: payments.filter((p) => p.status === 'successful' && (p.type === 'balance' || p.type === 'extra')).reduce((acc, p) => acc + Number(p.amount), 0),
    refundTotal: payments.filter((p) => p.status === 'successful' && p.type === 'refund').reduce((acc, p) => acc + Number(p.amount), 0),
    totalRoomCharges: stays.reduce((acc, s) => acc + (Number(s.rate || 0) * Number(s.nights || 1)), 0),
    totalGst: stays.reduce((acc, s) => acc + Math.round((Number(s.rate || 0) * Number(s.nights || 1) * 0.05) * 100) / 100, 0),
    outstandingBalance,
  };

  const totalDocumentsCount = documents.length + (guest.hasIdImage ? 1 : 0);

  const tabs = [
    { key: 'personal', label: 'Personal Information' },
    { key: 'bookings', label: 'Bookings', count: bookings.length },
    { key: 'stays', label: 'Stays & Occupants', count: stays.length },
    { key: 'documents', label: 'Documents', count: totalDocumentsCount },
    { key: 'payments', label: 'Payments', count: payments.length },
  ];

  return (
    <div
      className="panel"
      style={{
        width: '100%',
        maxWidth: '100%',
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        boxSizing: 'border-box',
      }}
    >
      {/* Top Navigation Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <button
          type="button"
          className="btn sm"
          onClick={() => navigate('/guests')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}
        >
          ← Back to Guests
        </button>
        {guest.now?.type === 'in_house' && (
          <button
            type="button"
            className="btn sm blue"
            onClick={() => setSheet({ type: 'checkout', stayId: guest.now.stayId })}
          >
            Room {guest.now.roomNo} · Open Bill
          </button>
        )}
      </div>

      {/* 1. Guest Profile Header (Compact & User-Friendly) */}
      <div
        style={{
          background: 'var(--color-surface, #ffffff)',
          border: '1px solid var(--color-card-border, #EAE4EF)',
          borderRadius: 10,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          boxShadow: '0 1px 4px rgba(112, 38, 95, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: 'var(--color-primary, #70265F)',
              color: '#ffffff',
              fontSize: 18,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {guest.name ? guest.name.charAt(0) : 'G'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, color: 'var(--color-heading, #30223D)', fontWeight: 700 }}>
                {guest.name}
              </h2>
              <span
                className="mono"
                style={{
                  fontSize: 11.5,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: 'var(--color-surface-secondary, #F1EAF8)',
                  color: 'var(--color-primary-dark, #542047)',
                  fontWeight: 600,
                }}
              >
                Guest ID: #{guest.id}
              </span>
              {guest.now?.type === 'in_house' ? (
                <span className="tag s-occupied" style={{ fontSize: 11.5 }}>
                  In Room {guest.now.roomNo}
                </span>
              ) : guest.now?.type === 'booked' ? (
                <span className="tag s-booked" style={{ fontSize: 11.5 }}>
                  Booked for {fd(guest.now.bookingDate)}
                </span>
              ) : (
                <span className="tag" style={{ fontSize: 11.5, background: '#f1f5f9', color: '#64748b' }}>
                  Not Currently Staying
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--color-text-secondary, #81748C)' }}>
              <div>
                <b>Mobile:</b> <span className="mono" style={{ color: 'var(--color-text-primary, #30223D)', fontWeight: 600 }}>{guest.phone}</span>
              </div>
              {guest.email && (
                <div>
                  <b>Email:</b> <span className="mono" style={{ color: 'var(--color-text-primary, #30223D)' }}>{guest.email}</span>
                </div>
              )}
              {guest.city && (
                <div>
                  <b>City:</b> <span style={{ color: 'var(--color-text-primary, #30223D)' }}>{guest.city}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn sm"
            style={{ borderColor: 'var(--color-primary, #70265F)', color: 'var(--color-primary, #70265F)', fontWeight: 600 }}
            onClick={() => setSheet({ type: 'edit', id: guest.id })}
          >
            ✏️ Edit Profile
          </button>
          <button
            type="button"
            className="btn sm dark"
            style={{ fontWeight: 600 }}
            onClick={() => setSheet({ type: 'newBooking', guest })}
          >
            + New Booking
          </button>
          <button
            type="button"
            className="btn sm red"
            style={{ fontWeight: 600 }}
            disabled={deleteGuest.isPending}
            onClick={handleDeleteGuest}
          >
            {deleteGuest.isPending ? 'Deleting…' : '🗑️ Delete Guest'}
          </button>
        </div>
      </div>

      {/* Deletion Error Notification Banner */}
      {deleteError && (
        <div
          role="alert"
          style={{
            background: 'var(--red-subtle, #fef2f2)',
            border: '1px solid var(--red-border, #fecaca)',
            color: 'var(--red-text, #991b1b)',
            padding: '12px 16px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span>⚠️</span>
            <span>{deleteError.message}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {deleteError.bookingId && (
              <button
                type="button"
                className="btn sm"
                style={{
                  background: 'var(--red, #dc2626)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 6,
                }}
                onClick={() => {
                  setSheet({ type: 'booking', id: Number(deleteError.bookingId) });
                  setDeleteError(null);
                }}
              >
                View Booking {deleteError.bookingCode ? `(${deleteError.bookingCode})` : ''}
              </button>
            )}
            <button
              type="button"
              className="btn sm ghost"
              style={{ cursor: 'pointer', border: 'none', background: 'transparent', fontSize: 16 }}
              onClick={() => setDeleteError(null)}
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 2. Compact Summary (Only Important Summary Metrics, No Empty Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        <div style={{ padding: '12px 16px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
            Total Visits
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary, #70265F)', marginTop: 4 }}>
            {summary.totalVisits ?? guest.visits ?? 0}
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
            Referrals Made
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-secondary, #87377D)', marginTop: 4 }}>
            {summary.referralsMade ?? referrals.length}
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
            Current Room / Status
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #30223D)', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentStayStatusText}
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600, letterSpacing: '0.03em' }}>
            Outstanding Balance
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: summary.outstandingBalance > 0 ? '#b91c1c' : 'var(--color-text-primary, #30223D)',
              marginTop: 4,
            }}
          >
            {inr(summary.outstandingBalance || 0)}
          </div>
        </div>
      </div>

      {/* Referral History – Always Near the Top */}
      <div
        style={{
          background: 'var(--color-surface, #ffffff)',
          border: '1px solid var(--color-border, #EAE4EF)',
          borderRadius: 10,
          padding: '16px 20px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (!referredBy && referrals.length === 0) ? 0 : 12, flexWrap: 'wrap', gap: 6 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
              Referral Information
            </h3>
            <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
              Referral relationship and guests registered through this member
            </span>
          </div>
        </div>

        {!referredBy && referrals.length === 0 ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 6,
              background: 'var(--color-surface-secondary, #FAF6FD)',
              border: '1px solid var(--color-border-subtle, #F3EEF7)',
              fontSize: 12.5,
              color: 'var(--color-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            <span>ℹ️</span>
            <span>No referral history for this guest (Direct walk-in / registration with no guests referred yet).</span>
          </div>
        ) : (
          <>
            {/* Referred By Row */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--color-surface-secondary, #FAF6FD)',
                border: '1px solid var(--color-border-subtle, #F3EEF7)',
                marginBottom: 14,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: 'var(--color-muted)', fontWeight: 600 }}>Referred By:</span>
              {referredBy ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="link"
                    style={{
                      fontWeight: 700,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--color-primary, #70265F)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: 'inherit',
                    }}
                    onClick={() => navigate(`/guests/${referredBy.id}`)}
                    title="Open referrer guest details"
                  >
                    {referredBy.name}
                  </button>
                  <span className="mono" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {referredBy.phone}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    (Guest #{referredBy.id})
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ fontSize: 11, padding: '2px 8px', height: 'auto', marginLeft: 4 }}
                    onClick={() => navigate(`/guests/${referredBy.id}`)}
                  >
                    View Profile
                  </button>
                </div>
              ) : (
                <span className="muted" style={{ fontStyle: 'normal' }}>
                  None (Direct registration / Walk-in / Social Media)
                </span>
              )}
            </div>

            {/* People Referred List */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-heading)', marginBottom: 8 }}>
                People Referred by This Guest ({referrals.length})
              </div>

              {referrals.length > 0 ? (
                <div className="tw" style={{ overflowX: 'auto' }}>
                  <table className="data" style={{ width: '100%', fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th>Referred Guest Name</th>
                        <th>Mobile Number</th>
                        <th>Related Booking ID</th>
                        <th>Room</th>
                        <th>Booking Date</th>
                        <th>Check-In Date</th>
                        <th>Booking / Stay Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((rg, idx) => (
                        <tr
                          key={`${rg.guest_id}-${rg.reservation_id || idx}`}
                          onClick={() => navigate(`/guests/${rg.guest_id}`)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>
                            <button
                              type="button"
                              className="link"
                              style={{
                                fontWeight: 700,
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: 'var(--color-primary, #70265F)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: 'inherit',
                                textDecoration: 'underline',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/guests/${rg.guest_id}`);
                              }}
                              title="Open guest details"
                            >
                              {rg.guest_name || rg.name}
                            </button>
                          </td>
                          <td className="mono">{rg.guest_phone || rg.phone}</td>
                          <td>
                            {rg.booking_code ? (
                              <button
                                type="button"
                                className="link"
                                style={{
                                  fontWeight: 600,
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  color: 'var(--color-primary, #70265F)',
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                  fontSize: 'inherit',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (rg.reservation_id) {
                                    setSheet({ type: 'booking', id: rg.reservation_id });
                                  }
                                }}
                                title="Open booking details"
                              >
                                {rg.booking_code}
                              </button>
                            ) : rg.reservation_id ? (
                              <span className="mono">#{rg.reservation_id}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {rg.room_no ? `Room ${rg.room_no}` : <span className="muted">—</span>}
                          </td>
                          <td>{rg.booking_date ? fd(rg.booking_date.split(' ')[0]) : '—'}</td>
                          <td>{rg.check_in_date ? fd(rg.check_in_date.split(' ')[0]) : '—'}</td>
                          <td>
                            <span className={`tag s-${rg.status}`} style={{ fontSize: 11, textTransform: 'capitalize' }}>
                              {rg.status === 'in_house' ? 'In-House' : rg.status === 'checked_out' ? 'Checked Out' : rg.status === 'checked_in' ? 'Checked In' : rg.status === 'no_show' ? 'No Show' : rg.status || '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn sm"
                              style={{ fontSize: 11, padding: '2px 8px', height: 'auto' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/guests/${rg.guest_id}`);
                              }}
                            >
                              View Profile
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>
                  No guests referred yet.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Tab Navigation Bar */}
      <div
        className="seg"
        role="tablist"
        aria-label="Guest Details Sections"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          borderBottom: '2px solid var(--color-border, #EAE4EF)',
          paddingBottom: 2,
        }}
      >
        {tabs.map((t) => {
          const isSelected = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              className={isSelected ? 'active' : ''}
              onClick={() => setActiveTab(t.key)}
              style={{
                borderRadius: '8px 8px 0 0',
                padding: '9px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
                background: isSelected ? 'var(--color-primary, #70265F)' : 'var(--color-surface, #ffffff)',
                color: isSelected ? '#ffffff' : 'var(--color-text, #30223D)',
                border: isSelected ? '1px solid var(--color-primary, #70265F)' : '1px solid var(--color-border, #EAE4EF)',
                borderBottom: isSelected ? '2px solid var(--color-primary, #70265F)' : 'none',
              }}
            >
              <span>{t.label}</span>
              {typeof t.count === 'number' && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 700,
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--color-surface-secondary, #F1EAF8)',
                    color: isSelected ? '#ffffff' : 'var(--color-primary, #70265F)',
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1 – Personal Information */}
      {activeTab === 'personal' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #EAE4EF)',
            borderRadius: 10,
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 14.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
              Personal Information
            </h3>
            <button
              type="button"
              className="btn sm"
              style={{ fontSize: 12, padding: '3px 12px', height: 'auto', fontWeight: 600 }}
              onClick={() => setSheet({ type: 'edit', id: guest.id })}
            >
              ✏️ Edit Profile
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px 24px',
              fontSize: 13,
            }}
          >
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Full Name</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{guest.name}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Mobile Number</span>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{guest.phone}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Email Address</span>
              <span className="mono" style={{ color: 'var(--color-text-primary)' }}>{guest.email || '—'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Gender</span>
              <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{guest.gender || '—'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>City</span>
              <span style={{ color: 'var(--color-text-primary)' }}>{guest.city || '—'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Complete Address</span>
              <span style={{ color: 'var(--color-text-primary)' }}>{guest.address || '—'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>ID Proof Type</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{guest.idProofType || 'Not Provided'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Masked ID Number</span>
              <span className="mono" style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {guest.idProofMasked || '—'}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Nationality / Residency</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {guest.isForeign ? `Foreign (${guest.nationality || 'Unspecified'})` : 'Indian Resident'}
              </span>
            </div>
            {guest.isForeign && guest.visaExpiry && (
              <div>
                <span style={{ color: 'var(--color-muted)', fontSize: 11.5, display: 'block', marginBottom: 2 }}>Visa Expiry</span>
                <span className="mono" style={{ color: 'var(--color-text-primary)' }}>{fd(guest.visaExpiry)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2 – Bookings */}
      {activeTab === 'bookings' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #EAE4EF)',
            borderRadius: 10,
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
                Reservations & Bookings ({bookings.length})
              </h3>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                All room reservations recorded for this guest
              </span>
            </div>
            <button
              type="button"
              className="btn sm dark"
              style={{ fontSize: 11.5 }}
              onClick={() => setSheet({ type: 'newBooking', guest })}
            >
              + New Booking
            </button>
          </div>

          {bookings.length > 0 ? (
            <div className="tw" style={{ overflowX: 'auto' }}>
              <table className="data" style={{ width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Booking ID</th>
                    <th>Room</th>
                    <th>Check-In</th>
                    <th>Check-Out</th>
                    <th>Persons</th>
                    <th>Booking Source</th>
                    <th>Booking Status</th>
                    <th className="r">Advance Paid</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => {
                    const isReference = !!b.referred_by_guest_id || (b.booking_source && (b.booking_source.includes('Reference') || b.booking_source.includes('Existing')));
                    const referrerDisplay = isReference
                      ? (b.referred_by_guest_name
                          ? `${b.referred_by_guest_name} (#${b.referred_by_guest_id})`
                          : (b.referred_by_guest_id ? `Guest #${b.referred_by_guest_id}` : 'Existing Member'))
                      : (b.booking_source === 'Other' || b.other_source)
                        ? (b.other_source || 'Other Source')
                        : '—';

                    return (
                      <tr
                        key={b.id}
                        onClick={() => setSheet({ type: 'booking', id: b.id })}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <button
                            type="button"
                            className="link"
                            style={{
                              fontWeight: 700,
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              color: 'var(--color-primary, #70265F)',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              fontSize: 'inherit',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSheet({ type: 'booking', id: b.id });
                            }}
                            title="Open booking details"
                          >
                            {b.booking_code || `#${b.id}`}
                          </button>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          Room {b.room_no} {b.room_type ? `(${b.room_type})` : ''}
                        </td>
                        <td>{fd(b.check_in_date)}</td>
                        <td>{fd(b.check_out_date)}</td>
                        <td>
                          {b.persons} {Number(b.persons) === 1 ? 'person' : 'persons'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className="tag" style={{ fontSize: 11, background: '#f8fafc', color: '#334155' }}>
                              {b.booking_source || 'Social Media'}
                            </span>
                            {isReference && (
                              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                Ref: {referrerDisplay}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`tag s-${b.status}`} style={{ fontSize: 11 }}>
                            {b.status}
                          </span>
                        </td>
                        <td className="r mono" style={{ fontWeight: 600 }}>
                          {inr(b.advance_amount)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn sm"
                            style={{ fontSize: 11, padding: '2px 8px', height: 'auto' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSheet({ type: 'booking', id: b.id });
                            }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13, padding: '12px 0' }}>
              No bookings found for this guest.
            </div>
          )}
        </div>
      )}

      {/* Tab 3 – Stays & Occupants */}
      {activeTab === 'stays' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #EAE4EF)',
            borderRadius: 10,
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
                Stay History & Occupant Details ({stays.length})
              </h3>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Historical and active stays with confirmed occupants
              </span>
            </div>
          </div>

          {stays.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {stays.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--color-border, #EAE4EF)',
                    borderRadius: 10,
                    padding: '16px 18px',
                    background: 'var(--color-surface, #ffffff)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  {/* Stay Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="link"
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: 'var(--color-primary, #70265F)',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                        onClick={() => setSheet({ type: 'stay', id: s.id })}
                        title="Open stay details"
                      >
                        Stay #{s.id}
                      </button>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>Room {s.room_no}</span>
                      <span className="muted" style={{ fontSize: 12.5 }}>({s.room_type || 'Standard'})</span>
                      {s.booking_code && (
                        <span className="tag" style={{ fontSize: 11, background: '#f1f5f9', color: '#475569' }}>
                          Linked {s.booking_code}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`tag s-${s.status}`} style={{ fontSize: 11.5 }}>
                        {s.status === 'in_house' ? 'In-House' : s.status}
                      </span>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontSize: 11.5, padding: '3px 10px', height: 'auto' }}
                        onClick={() => setSheet({ type: 'stay', id: s.id })}
                      >
                        View Stay
                      </button>
                    </div>
                  </div>

                  {/* Stay Metadata Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '8px 14px',
                      fontSize: 12.5,
                      color: 'var(--color-text-secondary)',
                      paddingBottom: 12,
                      borderBottom: '1px solid var(--color-border-subtle, #F3EEF7)',
                    }}
                  >
                    <div>
                      <b>Room Number:</b>{' '}
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Room {s.room_no}</span>
                    </div>
                    <div>
                      <b>Room Type:</b>{' '}
                      <span style={{ color: 'var(--color-text-primary)' }}>{s.room_type || 'Standard'}</span>
                    </div>
                    <div>
                      <b>Actual Check-in:</b>{' '}
                      <span className="mono" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{fd(s.check_in_date)}</span>
                    </div>
                    <div>
                      <b>Planned Checkout:</b>{' '}
                      <span className="mono" style={{ color: 'var(--color-text-primary)' }}>{fd(s.checkout_planned)}</span>
                    </div>
                    <div>
                      <b>Actual Checkout:</b>{' '}
                      <span className="mono" style={{ color: s.checkout_actual ? 'var(--color-text-primary)' : 'var(--color-muted)' }}>
                        {s.checkout_actual ? fd(s.checkout_actual) : '— (Active)'}
                      </span>
                    </div>
                    <div>
                      <b>Actual Persons Count:</b>{' '}
                      <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                        {s.persons} {s.persons === 1 ? 'person' : 'persons'}
                      </span>
                    </div>
                  </div>

                  {/* Occupants belonging to this stay */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-primary-dark, #542047)' }}>
                        👥 Room Occupants ({s.occupants?.length || s.persons} confirmed):
                      </div>
                    </div>

                    {s.occupants && s.occupants.length > 0 ? (
                      <div className="tw" style={{ overflowX: 'auto' }}>
                        <table className="data" style={{ width: '100%', fontSize: 12, background: 'var(--color-surface-secondary, #FAF6FD)', borderRadius: 6 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 80 }}>Occupant #</th>
                              <th>Occupant Name</th>
                              <th>Role</th>
                              <th>Gender</th>
                              <th>Phone Number</th>
                              <th>ID Documents</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.occupants.map((occ, oIdx) => (
                              <tr key={occ.id || oIdx}>
                                <td style={{ fontWeight: 600 }}>#{occ.occupant_number || oIdx + 1}</td>
                                <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                  {occ.name || (occ.is_primary ? guest.name : `Occupant ${oIdx + 1}`)}
                                </td>
                                <td>
                                  {occ.is_primary ? (
                                    <span className="tag" style={{ fontSize: 10.5, background: 'var(--color-primary, #70265F)', color: '#ffffff', fontWeight: 600 }}>
                                      Primary Guest
                                    </span>
                                  ) : (
                                    <span className="tag" style={{ fontSize: 10.5, background: '#f1f5f9', color: '#475569' }}>
                                      Occupant
                                    </span>
                                  )}
                                </td>
                                <td>{occ.gender || '—'}</td>
                                <td className="mono">{occ.phone || '—'}</td>
                                <td>
                                  {occ.documents && occ.documents.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {occ.documents.map((d) => (
                                        <button
                                          key={d.id}
                                          type="button"
                                          className="link"
                                          style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            color: 'var(--color-primary, #70265F)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: 11.5,
                                            textDecoration: 'underline',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                          }}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewDoc(d.id);
                                          }}
                                          title="View document"
                                        >
                                          📄 {d.original_filename}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="muted" style={{ fontSize: 11.5 }}>—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: 'var(--color-muted)', padding: '6px 0' }}>
                        Primary registered guest: <b>{guest.name}</b> ({s.persons} {s.persons === 1 ? 'person' : 'persons'} confirmed from stay records)
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13, padding: '12px 0' }}>
              No stays found for this guest.
            </div>
          )}
        </div>
      )}

      {/* Tab 4 – Documents */}
      {activeTab === 'documents' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #EAE4EF)',
            borderRadius: 10,
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
                ID Proof Documents ({totalDocumentsCount})
              </h3>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Uploaded ID proofs belonging to primary guest and room occupants
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handlePhotoUpload}
              />
              <button
                type="button"
                className="btn sm"
                style={{ fontSize: 11.5 }}
                disabled={uploadIdImage.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {guest.hasIdImage ? '🔄 Replace ID Photo' : '📷 Upload ID Photo'}
              </button>
            </div>
          </div>

          {/* Master Profile ID Photo if present */}
          {guest.hasIdImage && (
            <div
              style={{
                marginBottom: 14,
                padding: '12px 16px',
                borderRadius: 8,
                background: 'var(--color-surface-secondary, #F1EAF8)',
                border: '1px solid var(--color-border, #EAE4EF)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>🪪</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-text-primary)' }}>
                    Guest Profile ID Photo
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    Owner: <b>{guest.name}</b> (Primary) · {guest.idProofType} verification photo
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn sm"
                  style={{ fontSize: 11.5 }}
                  onClick={handleViewIdPhoto}
                >
                  View Photo
                </button>
                <button
                  type="button"
                  className="btn sm red"
                  style={{ fontSize: 11.5 }}
                  disabled={deleteIdImage.isPending}
                  onClick={handleDeleteIdPhoto}
                >
                  {deleteIdImage.isPending ? 'Deleting…' : 'Delete Photo'}
                </button>
              </div>
            </div>
          )}

          {/* Uploaded Documents List */}
          {documents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {documents.map((doc) => {
                const isPdf = doc.original_filename?.toLowerCase().endsWith('.pdf') || doc.mime_type?.includes('pdf');
                return (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid var(--color-border, #EAE4EF)',
                      background: 'var(--color-surface, #ffffff)',
                      fontSize: 12.5,
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 7px',
                          borderRadius: 4,
                          background: isPdf ? '#fee2e2' : '#e0e7ff',
                          color: isPdf ? '#991b1b' : '#3730a3',
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {doc.document_type || (isPdf ? 'PDF Document' : 'ID Proof')}
                      </span>
                      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.original_filename}>
                        {doc.original_filename}
                      </span>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
                        Owner: <b>{doc.occupant_name || guest.name}</b> {doc.is_primary ? '(Primary)' : ''}
                      </span>
                      {doc.related_label && (
                        <span className="tag" style={{ fontSize: 11, background: '#f1f5f9', color: '#475569' }}>
                          {doc.related_label}
                        </span>
                      )}
                      <span className="muted" style={{ fontSize: 11.5 }}>
                        ({formatFileSize(doc.file_size)} · Uploaded: {doc.uploaded_at ? fd(doc.uploaded_at.split(' ')[0]) : '—'})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontSize: 11.5, padding: '3px 10px', height: 'auto' }}
                        onClick={() => handleViewDoc(doc.id)}
                      >
                        View / Preview
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontSize: 11.5, padding: '3px 10px', height: 'auto' }}
                        onClick={() => handleDownloadDoc(doc.id, doc.original_filename)}
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ fontSize: 11.5, padding: '3px 10px', height: 'auto', color: '#b91c1c' }}
                        onClick={() => handleDeleteDoc(doc.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : !guest.hasIdImage ? (
            <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>
              No ID proof documents uploaded for this guest.
            </div>
          ) : null}
        </div>
      )}

      {/* Tab 5 – Payments */}
      {activeTab === 'payments' && (
        <div
          style={{
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid var(--color-border, #EAE4EF)',
            borderRadius: 10,
            padding: '18px 20px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-primary, #70265F)' }}>
                Payment & Financial Breakdown ({payments.length})
              </h3>
              <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Total charges, taxes, payments, refunds, and outstanding balance
              </span>
            </div>
          </div>

          {/* Financial Breakdown Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ padding: '12px 14px', background: 'var(--color-surface-secondary, #FAF6FD)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600 }}>Total Room Charges</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary, #30223D)', marginTop: 4 }}>
                {inr(paymentSummary.totalRoomCharges || 0)}
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--color-surface-secondary, #FAF6FD)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600 }}>GST</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary, #30223D)', marginTop: 4 }}>
                {inr(paymentSummary.totalGst || 0)}
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--color-surface-secondary, #FAF6FD)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600 }}>Advance Payments</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-primary, #70265F)', marginTop: 4 }}>
                {inr(paymentSummary.advanceTotal || 0)}
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--color-surface-secondary, #FAF6FD)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600 }}>Additional Payments</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary, #30223D)', marginTop: 4 }}>
                {inr(paymentSummary.additionalTotal || 0)}
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--color-surface-secondary, #FAF6FD)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600 }}>Refunds</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: paymentSummary.refundTotal > 0 ? '#b91c1c' : 'var(--color-muted)', marginTop: 4 }}>
                {inr(paymentSummary.refundTotal || 0)}
              </div>
            </div>

            <div style={{ padding: '12px 14px', background: 'var(--color-surface-secondary, #FAF6FD)', border: '1px solid var(--color-border, #EAE4EF)', borderRadius: 8 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-muted)', fontWeight: 600 }}>Outstanding Balance</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: paymentSummary.outstandingBalance > 0 ? '#b91c1c' : 'var(--color-text-primary, #30223D)', marginTop: 4 }}>
                {inr(paymentSummary.outstandingBalance || 0)}
              </div>
            </div>
          </div>

          {/* Payments Table */}
          {payments.length > 0 ? (
            <div className="tw" style={{ overflowX: 'auto' }}>
              <table className="data" style={{ width: '100%', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th>Related Booking / Stay</th>
                    <th>Payment Date</th>
                    <th>Payment Type</th>
                    <th>Payment Method</th>
                    <th className="r">Amount</th>
                    <th>Status</th>
                    <th>Refund Details / Note</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const isRefund = p.type === 'refund';
                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                          {p.reference || (p.booking_code ? `Booking ${p.booking_code}` : `Stay #${p.stay_id || p.id}`)}
                        </td>
                        <td className="mono">{p.created_at ? fd(p.created_at.split(' ')[0]) : '—'}</td>
                        <td>
                          <span
                            className="tag"
                            style={{
                              fontSize: 11,
                              textTransform: 'capitalize',
                              background: isRefund ? '#fee2e2' : p.type === 'advance' ? '#e0e7ff' : '#dcfce7',
                              color: isRefund ? '#991b1b' : p.type === 'advance' ? '#3730a3' : '#166534',
                              fontWeight: 600,
                            }}
                          >
                            {p.type}
                          </span>
                        </td>
                        <td className="mono" style={{ textTransform: 'uppercase' }}>
                          {p.method}
                        </td>
                        <td
                          className="r mono"
                          style={{
                            fontWeight: 700,
                            color: isRefund ? '#b91c1c' : 'var(--color-text-primary)',
                          }}
                        >
                          {isRefund ? `-${inr(p.amount)}` : inr(p.amount)}
                        </td>
                        <td>
                          <span style={{ color: p.status === 'successful' ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 500 }}>
                            ● {p.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                          {p.reason || p.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13, padding: '12px 0' }}>
              No payment records found for this guest.
            </div>
          )}
        </div>
      )}

      {/* Sheets / Modals for Detail Views and Editing */}
      {sheet?.type === 'edit' && (
        <GuestEditSheet
          guestId={sheet.id}
          onClose={() => setSheet(null)}
          onSaved={() => refetch()}
          onDeleted={() => {
            setSheet(null);
            navigate('/guests');
          }}
          onViewBooking={(bookingId) => setSheet({ type: 'booking', id: Number(bookingId) })}
        />
      )}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.id}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'stay' && (
        <StayDetailSheet
          stayId={sheet.id}
          onClose={() => setSheet(null)}
          onCheckout={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}
      {sheet?.type === 'checkout' && (
        <CheckoutSheet
          stayId={sheet.stayId}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}
      {sheet?.type === 'newBooking' && (
        <NewBookingSheet
          presetGuest={sheet.guest}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
