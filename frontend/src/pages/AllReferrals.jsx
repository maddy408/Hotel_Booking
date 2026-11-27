import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAllReferrals } from '../api/guests';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import StayDetailSheet from '../components/sheets/StayDetailSheet.jsx';
import { fd, formatActualCheckIn, formatDateTime } from '../lib/format';

export default function AllReferrals() {
  const navigate = useNavigate();

  // Search & filter states
  const [search, setSearch] = useState('');
  const [referrerSearch, setReferrerSearch] = useState('');
  const [referredSearch, setReferredSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'existing_member' | 'other'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateType, setDateType] = useState('booking'); // 'booking' | 'check_in'

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Active sheet (e.g. BookingDetailSheet)
  const [sheet, setSheet] = useState(null);

  const { data, isLoading, isError, error, refetch } = useAllReferrals();

  const summary = data?.summary || {
    total_referral_bookings: 0,
    unique_referred_guests: 0,
    arrived_referred_guests: 0,
    upcoming_referral_bookings: 0,
  };

  const rawItems = data?.items || [];

  // Filter items in memory for instantaneous filtering
  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      // 1. General search (matches referrer name/phone, referred guest name/phone, booking code, room no)
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesGeneral =
          (item.referrer_name && item.referrer_name.toLowerCase().includes(q)) ||
          (item.referrer_phone && item.referrer_phone.toLowerCase().includes(q)) ||
          (item.referred_guest_name && item.referred_guest_name.toLowerCase().includes(q)) ||
          (item.referred_guest_phone && item.referred_guest_phone.toLowerCase().includes(q)) ||
          (item.booking_code && item.booking_code.toLowerCase().includes(q)) ||
          (item.room_no && String(item.room_no).includes(q));

        if (!matchesGeneral) return false;
      }

      // 2. Referrer search
      if (referrerSearch.trim()) {
        const qRef = referrerSearch.toLowerCase().trim();
        const matchesRef =
          (item.referrer_name && item.referrer_name.toLowerCase().includes(qRef)) ||
          (item.referrer_phone && item.referrer_phone.toLowerCase().includes(qRef));

        if (!matchesRef) return false;
      }

      // 3. Referred guest search
      if (referredSearch.trim()) {
        const qReferred = referredSearch.toLowerCase().trim();
        const matchesReferred =
          (item.referred_guest_name && item.referred_guest_name.toLowerCase().includes(qReferred)) ||
          (item.referred_guest_phone && item.referred_guest_phone.toLowerCase().includes(qReferred));

        if (!matchesReferred) return false;
      }

      // 4. Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'arrived') {
          if (!item.has_arrived) return false;
        } else if (statusFilter === 'upcoming') {
          if (item.status_code !== 'upcoming' && item.status_code !== 'confirmed') return false;
        } else if (item.status_code !== statusFilter && item.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // 5. Referral Type filter
      if (typeFilter !== 'all') {
        const itemType = item.referral_type || (item.referrer_id ? 'existing_member' : 'other');
        if (itemType !== typeFilter) return false;
      }

      // 6. Date filter
      if (dateFrom || dateTo) {
        const targetRaw = dateType === 'check_in' ? item.scheduled_check_in : item.booking_date;
        const targetDate = targetRaw ? targetRaw.substring(0, 10) : '';

        if (dateFrom && targetDate < dateFrom) return false;
        if (dateTo && targetDate > dateTo) return false;
      }

      return true;
    });
  }, [rawItems, search, referrerSearch, referredSearch, statusFilter, typeFilter, dateFrom, dateTo, dateType]);

  // Pagination calculation
  const totalItems = filteredItems.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

  const resetFilters = () => {
    setSearch('');
    setReferrerSearch('');
    setReferredSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setDateFrom('');
    setDateTo('');
    setDateType('booking');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    referrerSearch.trim() !== '' ||
    referredSearch.trim() !== '' ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    dateFrom !== '' ||
    dateTo !== '';


  const getStatusBadge = (item) => {
    const code = item.status_code;
    if (code === 'in_house') {
      return <span className="tag s-occupied">In-House</span>;
    }
    if (code === 'checked_out') {
      return (
        <span
          className="tag"
          style={{
            background: 'var(--color-surface-secondary, #F1EAF8)',
            color: 'var(--color-primary, #70265F)',
            borderColor: 'var(--color-border, #EAE4EF)',
          }}
        >
          Checked Out
        </span>
      );
    }
    if (code === 'confirmed') {
      return (
        <span
          className="tag"
          style={{
            background: '#e0f2fe',
            color: '#0369a1',
            borderColor: '#bae6fd',
          }}
        >
          Confirmed
        </span>
      );
    }
    if (code === 'upcoming') {
      return <span className="tag s-booked">Upcoming</span>;
    }
    if (code === 'no_show') {
      return (
        <span
          className="tag"
          style={{
            background: '#fee2e2',
            color: '#991b1b',
            borderColor: '#fecaca',
          }}
        >
          No-Show
        </span>
      );
    }
    if (code === 'cancelled') {
      return (
        <span
          className="tag"
          style={{
            background: '#f3f4f6',
            color: '#6b7280',
            borderColor: '#e5e7eb',
          }}
        >
          Cancelled
        </span>
      );
    }
    return <span className="tag">{item.status || '—'}</span>;
  };

  return (
    <div className="panel" style={{ maxWidth: '100%' }}>
      {/* 1. Header & Navigation */}
      <div
        className="ph"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => navigate('/guests')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Return to Guests Register"
            >
              ← Back to Guests
            </button>
            <h2 style={{ margin: 0 }}>
              All Referrals Register{' '}
              <span className="muted mono" style={{ fontSize: 15 }}>
                {rawItems.length}
              </span>
            </h2>
          </div>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 12.5,
              color: 'var(--color-muted, #71717A)',
            }}
          >
            Track which guest referred whom, whether the referred guest arrived, and related booking and stay details.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn sm"
            onClick={() => refetch()}
            title="Refresh latest data from database"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* 2. Referral Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
          padding: '16px 20px',
          background: 'var(--color-surface, #ffffff)',
          borderBottom: '1px solid var(--color-border, #EAE4EF)',
        }}
      >
        {/* Total Referral Bookings */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 8,
            border: '1px solid var(--color-border, #EAE4EF)',
            background: 'var(--color-surface-secondary, #FBF9FC)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted, #71717A)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Referral Bookings
            </span>
            <span style={{ fontSize: 16 }}>📋</span>
          </div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-primary, #70265F)' }}>
            {summary.total_referral_bookings}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--color-muted, #71717A)' }}>
            Total reference bookings saved
          </span>
        </div>

        {/* Unique Referred Guests */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 8,
            border: '1px solid var(--color-border, #EAE4EF)',
            background: 'var(--color-surface-secondary, #FBF9FC)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted, #71717A)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Unique Referred Guests
            </span>
            <span style={{ fontSize: 16 }}>👥</span>
          </div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: '#0f766e' }}>
            {summary.unique_referred_guests}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--color-muted, #71717A)' }}>
            Distinct referred individuals
          </span>
        </div>

        {/* Referred Guests Who Arrived */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 8,
            border: '1px solid var(--color-border, #EAE4EF)',
            background: 'var(--color-surface-secondary, #FBF9FC)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted, #71717A)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Referred Guests Arrived
            </span>
            <span style={{ fontSize: 16 }}>🏨</span>
          </div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-success-text, #166534)' }}>
            {summary.arrived_referred_guests}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--color-muted, #71717A)' }}>
            Unique guests with confirmed check-in
          </span>
        </div>

        {/* Upcoming Referred Bookings */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 8,
            border: '1px solid var(--color-border, #EAE4EF)',
            background: 'var(--color-surface-secondary, #FBF9FC)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-muted, #71717A)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upcoming Referred Bookings
            </span>
            <span style={{ fontSize: 16 }}>📅</span>
          </div>
          <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: '#b45309' }}>
            {summary.upcoming_referral_bookings}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--color-muted, #71717A)' }}>
            Pending arrival / scheduled visits
          </span>
        </div>
      </div>

      {/* 3. Filters Bar */}
      <div
        style={{
          padding: '14px 20px',
          background: 'var(--color-surface, #ffffff)',
          borderBottom: '1px solid var(--color-border, #EAE4EF)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* General Search */}
          <div style={{ flex: '1 1 240px', minWidth: '220px' }}>
            <input
              type="search"
              placeholder="🔍 Search name, phone, booking ID, room..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', fontSize: 13 }}
              aria-label="Search all referrals"
            />
          </div>

          {/* Search by Referrer */}
          <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <input
              type="search"
              placeholder="Referrer name/mobile"
              value={referrerSearch}
              onChange={(e) => {
                setReferrerSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', fontSize: 12.5 }}
              aria-label="Search referrer name or mobile"
            />
          </div>

          {/* Search by Referred Guest */}
          <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <input
              type="search"
              placeholder="Referred guest name/mobile"
              value={referredSearch}
              onChange={(e) => {
                setReferredSearch(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', fontSize: 12.5 }}
              aria-label="Search referred guest name or mobile"
            />
          </div>

          {/* Status Filter */}
          <div style={{ minWidth: '140px' }}>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', fontSize: 12.5, height: '36px' }}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses</option>
              <option value="upcoming">Upcoming</option>
              <option value="confirmed">Confirmed</option>
              <option value="in_house">In-House</option>
              <option value="checked_out">Checked Out</option>
              <option value="no_show">No-Show</option>
              <option value="cancelled">Cancelled</option>
              <option value="arrived">Arrived (In-House / Checked Out)</option>
            </select>
          </div>

          {/* Referral Type Filter */}
          <div style={{ minWidth: '140px' }}>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: '100%', fontSize: 12.5, height: '36px' }}
              aria-label="Filter by referral type"
            >
              <option value="all">All Types</option>
              <option value="existing_member">Existing Member</option>
              <option value="other">Other Person</option>
            </select>
          </div>
        </div>

        {/* Date Filters Row */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--color-muted)' }}>Date:</span>
            <select
              value={dateType}
              onChange={(e) => {
                setDateType(e.target.value);
                setCurrentPage(1);
              }}
              style={{ fontSize: 12, height: '30px', padding: '2px 8px' }}
              aria-label="Select date filter type"
            >
              <option value="booking">Booking Date</option>
              <option value="check_in">Scheduled Check-In</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--color-muted)' }}>From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              style={{ fontSize: 12, height: '30px', padding: '2px 8px' }}
              aria-label="Filter from date"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--color-muted)' }}>To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              style={{ fontSize: 12, height: '30px', padding: '2px 8px' }}
              aria-label="Filter to date"
            />
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn sm"
              onClick={resetFilters}
              style={{ fontSize: 11.5, height: '30px' }}
            >
              Reset Filters
            </button>
          )}

          <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-muted)' }}>
            Showing <b>{filteredItems.length}</b> of <b>{rawItems.length}</b> referral bookings
          </div>
        </div>
      </div>

      {/* 4. Referral Register Table */}
      {isLoading ? (
        <div className="sb">
          <div className="skel" style={{ height: 200 }} />
        </div>
      ) : isError ? (
        <div className="empty">
          Could not load referrals: {error.message}
          <div style={{ marginTop: 10 }}>
            <button className="btn sm" type="button" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="tw" style={{ overflowX: 'auto' }}>
          <table className="data" style={{ width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th>Referrer Name</th>
                <th>Referrer Mobile</th>
                <th style={{ textAlign: 'center', width: '30px' }}></th>
                <th>Referred Guest Name</th>
                <th>Referred Guest Mobile</th>
                <th>Booking ID</th>
                <th>Booking Date</th>
                <th>Room</th>
                <th>Scheduled Check-In</th>
                <th>Scheduled Check-Out</th>
                <th>Actual Check-In</th>
                <th>Actual Check-Out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.length > 0 ? (
                paginatedItems.map((item, idx) => (
                  <tr key={item.reservation_id ? `res-${item.reservation_id}` : (item.stay_id ? `stay-${item.stay_id}` : idx)}>
                    {/* Referrer Name */}
                    <td>
                      {item.referrer_id ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                            }}
                            onClick={() => navigate(`/guests/${item.referrer_id}`)}
                            title={`Open referrer profile for ${item.referrer_name}`}
                          >
                            {item.referrer_name || '—'}
                          </button>
                          <span
                            className="tag sm"
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              borderColor: '#bfdbfe',
                            }}
                          >
                            Member
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-heading, #1f2937)' }}>
                            {item.referrer_name || '—'}
                          </span>
                          <span
                            className="tag sm"
                            style={{
                              fontSize: 10,
                              padding: '1px 5px',
                              background: '#f8fafc',
                              color: '#475569',
                              borderColor: '#e2e8f0',
                            }}
                          >
                            Other
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Referrer Mobile */}
                    <td className="mono">{item.referrer_phone || '—'}</td>

                    {/* Arrow showing who referred whom */}
                    <td style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: 14 }}>
                      ➔
                    </td>

                    {/* Referred Guest Name */}
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
                        }}
                        onClick={() => navigate(`/guests/${item.referred_guest_id}`)}
                        title={`Open referred guest profile for ${item.referred_guest_name}`}
                      >
                        {item.referred_guest_name || '—'}
                      </button>
                    </td>

                    {/* Referred Guest Mobile */}
                    <td className="mono">{item.referred_guest_phone || '—'}</td>

                    {/* Booking ID */}
                    <td>
                      <button
                        type="button"
                        className="link mono"
                        style={{
                          fontWeight: 700,
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'var(--color-primary, #70265F)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: 12.5,
                        }}
                        onClick={() => {
                          if (item.reservation_id) {
                            setSheet({ type: 'booking', id: item.reservation_id });
                          } else if (item.stay_id) {
                            setSheet({ type: 'stay', id: item.stay_id });
                          }
                        }}
                        title={item.reservation_id ? `Open details for booking ${item.booking_code}` : `Open details for stay #${item.stay_id}`}
                      >
                        {item.booking_code || (item.reservation_id ? `#${item.reservation_id}` : `Stay #${item.stay_id}`)}
                      </button>
                    </td>

                    {/* Booking Date */}
                    <td>{item.booking_date ? fd(item.booking_date.split(' ')[0]) : '—'}</td>

                    {/* Room Number */}
                    <td style={{ fontWeight: 600 }}>
                      {item.room_no ? `Room ${item.room_no}` : <span className="muted">—</span>}
                    </td>

                    {/* Scheduled Check-In */}
                    <td>{item.scheduled_check_in ? fd(item.scheduled_check_in) : '—'}</td>

                    {/* Scheduled Check-Out */}
                    <td>{item.scheduled_check_out ? fd(item.scheduled_check_out) : '—'}</td>

                    {/* Actual Check-In */}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatActualCheckIn(item.actual_check_in) !== 'Not checked in' ? (
                        <span style={{ color: 'var(--color-success-text, #166534)', fontWeight: 500 }}>
                          {formatActualCheckIn(item.actual_check_in)}
                        </span>
                      ) : (
                        <span className="muted">Not checked in</span>
                      )}
                    </td>

                    {/* Actual Check-Out */}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {item.actual_check_out && formatDateTime(item.actual_check_out) !== '—' ? (
                        <span style={{ color: 'var(--color-primary, #70265F)', fontWeight: 500 }}>
                          {formatDateTime(item.actual_check_out)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>

                    {/* Booking / Stay Status */}
                    <td>{getStatusBadge(item)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={13} className="empty" style={{ padding: '28px 20px', textAlign: 'center' }}>
                    {hasActiveFilters ? 'No referral bookings match your search criteria.' : 'No referral bookings found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Pagination Footer */}
      {totalPages > 1 && (
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border, #EAE4EF)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 12.5,
          }}
        >
          <span className="muted">
            Page {safePage} of {totalPages} ({totalItems} items)
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Slide-over sheets */}
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
        />
      )}
    </div>
  );
}
