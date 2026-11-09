import { useState, useMemo } from 'react';
import { useTodayCheckouts } from '../api/todayCheckouts';
import WhatsAppSheet from '../components/sheets/WhatsAppSheet.jsx';
import CheckInWhatsAppSheet from '../components/sheets/CheckInWhatsAppSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import CheckInSheet from '../components/sheets/CheckInSheet.jsx';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import GuestProfileSheet from '../components/sheets/GuestProfileSheet.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { fdWithYear } from '../lib/format';

export default function TodayCheckouts() {
  const { data, isLoading, isError, error, refetch } = useTodayCheckouts();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState(() => {
    try {
      return sessionStorage.getItem('daily_ops_tab') || 'checkins';
    } catch {
      return 'checkins';
    }
  });

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem('daily_ops_tab', tab);
    } catch {
      // ignore
    }
    setStatusFilter('all');
  };

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'checked_in' / 'checked_out'
  const [activeSheet, setActiveSheet] = useState(null);

  const handleBill = (item) => {
    if (!item?.stay_id) {
      toast('Billing details not available for this booking.');
      return;
    }

    if (item.checkout_status === 'checked_out' || item.invoice_number) {
      window.open(`/print/invoice/${item.stay_id}`, '_blank', 'noopener,noreferrer');
    } else {
      setActiveSheet({
        type: 'checkout',
        payload: item.stay_id,
      });
    }
  };

  const hotel = data?.hotel;
  const timezone = data?.timezone || 'Asia/Kolkata';
  const today = data?.today;
  const checkoutTimeStandard = data?.checkout_time_standard || '12:00 PM';

  const checkoutStats = data?.checkouts_stats || data?.stats || { total: 0, pending: 0, completed: 0, checked_out: 0 };
  const checkinStats = data?.checkins_stats || { total: 0, pending: 0, completed: 0, checked_in: 0 };

  const whatsappCheckoutTemplate = data?.whatsapp_checkout_template || data?.whatsapp_template;
  const whatsappCheckinTemplate = data?.whatsapp_checkin_template;
  const whatsappCheckinEnabled = data?.whatsapp_checkin_enabled !== false;

  const filteredCheckins = useMemo(() => {
    const list = data?.checkins || [];
    return list.filter((item) => {
      if (statusFilter !== 'all' && item.checkin_status !== statusFilter) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        String(item.room_no).includes(q) ||
        (item.guest_name && item.guest_name.toLowerCase().includes(q)) ||
        (item.guest_phone && item.guest_phone.includes(q)) ||
        (item.booking_code && item.booking_code.toLowerCase().includes(q))
      );
    });
  }, [data?.checkins, statusFilter, search]);

  const filteredCheckouts = useMemo(() => {
    const list = data?.checkouts || [];
    return list.filter((item) => {
      if (statusFilter !== 'all' && item.checkout_status !== statusFilter) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        String(item.room_no).includes(q) ||
        (item.guest_name && item.guest_name.toLowerCase().includes(q)) ||
        (item.guest_phone && item.guest_phone.includes(q)) ||
        (item.booking_code && item.booking_code.toLowerCase().includes(q))
      );
    });
  }, [data?.checkouts, statusFilter, search]);

  if (isLoading) {
    return (
      <div className="panel">
        <div className="ph">
          <h2>Daily Operations</h2>
        </div>
        <div className="sb">
          <div className="skel" style={{ height: 60 }} />
          <div className="skel" style={{ height: 60 }} />
          <div className="skel" style={{ height: 200 }} />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="panel empty">
        Could not load Daily Operations: {error?.message || 'Unknown error'}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm" type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .do-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 14px;
          margin-bottom: 14px;
        }
        .do-summary-card {
          background: var(--color-card);
          border: 1.5px solid var(--color-border);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(56, 38, 79, 0.04);
          outline: none;
        }
        .do-summary-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(128, 44, 98, 0.15);
        }
        .do-summary-card.active-tab-card {
          border-color: var(--color-primary);
          background: linear-gradient(180deg, #FFFFFF 0%, var(--color-pink-light) 100%);
          box-shadow: 0 0 0 1px var(--color-primary), 0 4px 12px rgba(128, 44, 98, 0.12);
        }
        .do-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .do-card-title {
          font-weight: 700;
          font-size: 15px;
          color: var(--color-heading);
        }
        .do-card-badge {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .do-card-badge.checkin {
          background: var(--color-lavender-light);
          color: var(--color-heading);
        }
        .do-card-badge.checkout {
          background: var(--color-pink-light);
          color: var(--color-heading);
        }
        .do-card-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .do-metric {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .do-metric-label {
          font-size: 12px;
          color: var(--color-muted);
        }
        .do-metric-val {
          font-size: 20px;
          font-weight: 700;
          line-height: 1;
        }
        .tc-actions {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          justify-content: flex-end;
        }
        .tc-icon-btn {
          width: 32px;
          height: 32px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1.5px solid var(--color-border);
          background: var(--color-card);
          color: var(--color-heading);
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
          text-decoration: none;
          box-sizing: border-box;
          outline: none;
        }
        .tc-icon-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: var(--shadow-subtle, 0 2px 4px rgba(0,0,0,0.06));
        }
        .tc-icon-btn:focus-visible {
          box-shadow: 0 0 0 2px var(--color-background), 0 0 0 4px var(--color-focus);
        }
        .tc-icon-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .tc-icon-whatsapp {
          background: #25D366;
          border-color: #1EBE5D;
          color: #FFFFFF;
        }
        .tc-icon-whatsapp:hover:not(:disabled) {
          background: #1EBE5D;
          border-color: #169E4A;
          color: #FFFFFF;
        }
        .tc-icon-whatsapp:disabled {
          background: var(--color-card);
          border-color: var(--color-border);
          color: var(--color-muted);
        }
        .tc-icon-bill {
          background: var(--color-card);
          border-color: var(--color-border);
          color: var(--color-heading);
        }
        .tc-icon-bill:hover {
          background: var(--color-lavender-light);
          border-color: var(--color-secondary);
          color: var(--color-heading);
        }
        .tc-icon-checkout {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: var(--color-button-text);
        }
        .tc-icon-checkout:hover {
          background: var(--color-primary-hover);
          border-color: var(--color-primary-hover);
          color: var(--color-button-text);
        }
        .tc-icon-checkin {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: var(--color-button-text);
        }
        .tc-icon-checkin:hover:not(:disabled) {
          background: var(--color-primary-hover);
          border-color: var(--color-primary-hover);
          color: var(--color-button-text);
        }
        .tc-icon-booking {
          background: var(--color-card);
          border-color: var(--color-border);
          color: var(--color-heading);
        }
        .tc-icon-booking:hover:not(:disabled) {
          background: var(--color-lavender-light);
          border-color: var(--color-secondary);
          color: var(--color-heading);
        }
      `}</style>

      {/* 2. Daily Operations Page Header */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph">
          <div>
            <h2>Daily Operations</h2>
            <small className="muted">
              {today ? fdWithYear(today) : 'Today'} · Timezone: <b>{timezone}</b> · Standard checkout: <b>{checkoutTimeStandard}</b>
            </small>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="search"
              placeholder="Search room, guest or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 'min(280px, 100%)' }}
              aria-label="Search daily operations"
            />
          </div>
        </div>
      </div>

      {/* 3. Summary Cards */}
      <div className="do-summary-grid">
        {/* Today's Check-ins */}
        <div
          className={`do-summary-card ${activeTab === 'checkins' ? 'active-tab-card' : ''}`}
          onClick={() => handleTabChange('checkins')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleTabChange('checkins');
          }}
          title="Click to switch to Check-ins view"
        >
          <div className="do-card-header">
            <span className="do-card-title">Today&apos;s Check-ins</span>
            <span className="do-card-badge checkin">Arrivals</span>
          </div>
          <div className="do-card-metrics">
            <div className="do-metric">
              <span className="do-metric-label">Expected</span>
              <span className="do-metric-val mono">{checkinStats.total}</span>
            </div>
            <div className="do-metric">
              <span className="do-metric-label">Pending</span>
              <span
                className="do-metric-val mono"
                style={{ color: checkinStats.pending > 0 ? 'var(--color-primary)' : 'inherit' }}
              >
                {checkinStats.pending}
              </span>
            </div>
            <div className="do-metric">
              <span className="do-metric-label">Checked-in</span>
              <span className="do-metric-val mono" style={{ color: 'var(--color-success-text, #236B43)' }}>
                {checkinStats.checked_in ?? checkinStats.completed}
              </span>
            </div>
          </div>
        </div>

        {/* Today's Check-outs */}
        <div
          className={`do-summary-card ${activeTab === 'checkouts' ? 'active-tab-card' : ''}`}
          onClick={() => handleTabChange('checkouts')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleTabChange('checkouts');
          }}
          title="Click to switch to Check-outs view"
        >
          <div className="do-card-header">
            <span className="do-card-title">Today&apos;s Check-outs</span>
            <span className="do-card-badge checkout">Departures</span>
          </div>
          <div className="do-card-metrics">
            <div className="do-metric">
              <span className="do-metric-label">Expected</span>
              <span className="do-metric-val mono">{checkoutStats.total}</span>
            </div>
            <div className="do-metric">
              <span className="do-metric-label">Pending</span>
              <span
                className="do-metric-val mono"
                style={{ color: checkoutStats.pending > 0 ? 'var(--color-primary)' : 'inherit' }}
              >
                {checkoutStats.pending}
              </span>
            </div>
            <div className="do-metric">
              <span className="do-metric-label">Completed</span>
              <span className="do-metric-val mono" style={{ color: 'var(--color-success-text, #236B43)' }}>
                {checkoutStats.completed ?? checkoutStats.checked_out}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Check-ins and Check-outs Tabs & Table Panel */}
      <div className="panel">
        <div className="ph" style={{ borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap', gap: 10 }}>
          {/* Main Tabs */}
          <div className="seg" role="tablist" aria-label="Daily Operations Selection">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'checkins'}
              aria-pressed={activeTab === 'checkins'}
              className={activeTab === 'checkins' ? 'active' : ''}
              onClick={() => handleTabChange('checkins')}
            >
              Check-ins ({checkinStats.total})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'checkouts'}
              aria-pressed={activeTab === 'checkouts'}
              className={activeTab === 'checkouts' ? 'active' : ''}
              onClick={() => handleTabChange('checkouts')}
            >
              Check-outs ({checkoutStats.total})
            </button>
          </div>

          {/* Status Sub-Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="seg" role="tablist" aria-label="Status Filter">
              <button
                type="button"
                role="tab"
                aria-pressed={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              >
                All ({activeTab === 'checkins' ? checkinStats.total : checkoutStats.total})
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={statusFilter === 'pending'}
                onClick={() => setStatusFilter('pending')}
              >
                Pending ({activeTab === 'checkins' ? checkinStats.pending : checkoutStats.pending})
              </button>
              <button
                type="button"
                role="tab"
                aria-pressed={statusFilter === (activeTab === 'checkins' ? 'checked_in' : 'checked_out')}
                onClick={() => setStatusFilter(activeTab === 'checkins' ? 'checked_in' : 'checked_out')}
              >
                {activeTab === 'checkins'
                  ? `Checked-in (${checkinStats.checked_in ?? checkinStats.completed})`
                  : `Checked Out (${checkoutStats.completed ?? checkoutStats.checked_out})`}
              </button>
              {activeTab === 'checkins' && (checkinStats.checked_out ?? 0) > 0 && (
                <button
                  type="button"
                  role="tab"
                  aria-pressed={statusFilter === 'checked_out'}
                  onClick={() => setStatusFilter('checked_out')}
                >
                  Checked Out ({checkinStats.checked_out})
                </button>
              )}
            </div>

            <span className="muted" style={{ fontSize: 13 }}>
              Showing {activeTab === 'checkins' ? filteredCheckins.length : filteredCheckouts.length} of{' '}
              {activeTab === 'checkins' ? checkinStats.total : checkoutStats.total}
            </span>
          </div>
        </div>

        {/* 5. Check-ins Tab Table */}
        {activeTab === 'checkins' && (
          <div className="tw">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Room</th>
                  <th>Guest</th>
                  <th>Mobile</th>
                  <th>Check-in</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCheckins.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-muted)' }}
                    >
                      No check-ins found for today matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCheckins.map((item) => {
                    const isCheckedIn = item.checkin_status === 'checked_in';
                    const isCheckedOut = item.checkin_status === 'checked_out';
                    const isEligible = item.is_eligible_whatsapp && whatsappCheckinEnabled;

                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="rtag" style={{ marginRight: 6 }}>
                            {item.room_no}
                          </span>
                          <small className="muted">{item.room_type_name}</small>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="link-btn"
                            style={{
                              background: 'none',
                              border: 0,
                              padding: 0,
                              font: 'inherit',
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: 'var(--color-text)',
                              textAlign: 'left',
                            }}
                            onClick={() => {
                              if (item.reservation_id) {
                                setActiveSheet({ type: 'booking', payload: item.reservation_id });
                              } else {
                                setActiveSheet({ type: 'guest', payload: item.guest_id });
                              }
                            }}
                            title="View details"
                          >
                            {item.guest_name}
                          </button>
                          {item.guest_city && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {item.guest_city}
                            </div>
                          )}
                        </td>
                        <td className="mono">
                          {item.guest_phone || <span className="muted">—</span>}
                        </td>
                        <td>
                          <b>
                            {item.check_in_date ? fdWithYear(item.check_in_date) : today ? fdWithYear(today) : ''},{' '}
                            {item.check_in_time}
                          </b>
                          {isCheckedIn && (
                            <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
                              (Actual)
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`tag ${isCheckedIn ? 's-occupied' : isCheckedOut ? 's-cleaning' : 's-booked'}`}>
                            {item.checkin_status_label}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div className="tc-actions">
                            {/* 1. WhatsApp Icon Action */}
                            <button
                              type="button"
                              className="tc-icon-btn tc-icon-whatsapp"
                              disabled={!isEligible}
                              title={
                                !whatsappCheckinEnabled
                                  ? 'WhatsApp (Check-in template disabled in Settings)'
                                  : isEligible
                                  ? 'WhatsApp'
                                  : 'WhatsApp (No valid mobile number)'
                              }
                              aria-label="WhatsApp"
                              onClick={() =>
                                setActiveSheet({
                                  type: 'whatsapp_checkin',
                                  payload: item,
                                raid: item,
                                })
                              }
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.076-1.109-.057-.27-.087-.604-.202-1.026-.384-1.785-.772-2.951-2.593-3.04-2.712-.089-.12-1.006-1.336-1.006-2.55 0-1.213.636-1.81.862-2.057.226-.247.492-.308.656-.308.164 0 .329.002.473.01.152.008.356-.058.556.423.206.494.7 1.706.762 1.83.061.123.102.268.02.43-.082.164-.123.266-.246.411-.123.144-.26.322-.37.432-.124.123-.253.256-.109.503.144.246.638 1.054 1.368 1.705.94.838 1.733 1.098 1.98 1.22.246.124.39.103.534-.062.144-.164.617-.719.781-.966.164-.246.328-.205.553-.123.226.082 1.437.678 1.684.801.246.124.41.185.472.288.061.103.061.597-.083 1.002z" />
                              </svg>
                            </button>

                            {/* 2. Booking / Details Icon Action */}
                            <button
                              type="button"
                              className="tc-icon-btn tc-icon-booking"
                              title={item.reservation_id ? 'View Booking Details' : 'View Guest Profile'}
                              aria-label={item.reservation_id ? 'View Booking Details' : 'View Guest Profile'}
                              onClick={() => {
                                if (item.reservation_id) {
                                  setActiveSheet({ type: 'booking', payload: item.reservation_id });
                                } else {
                                  setActiveSheet({ type: 'guest', payload: item.guest_id });
                                }
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                            </button>

                            {/* 3. Check-in or Invoice Icon Action */}
                            {item.checkin_status === 'pending' ? (
                              <button
                                type="button"
                                className="tc-icon-btn tc-icon-checkin"
                                title="Check in"
                                aria-label="Check in"
                                onClick={() =>
                                  setActiveSheet({
                                    type: 'checkin',
                                    reservation: item,
                                    triggerAdvanceError: Number(item.advance_paid ?? item.advance_amount ?? 0) <= 0,
                                  })
                                }
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                  <polyline points="10 17 15 12 10 7" />
                                  <line x1="15" y1="12" x2="3" y2="12" />
                                </svg>
                              </button>
                            ) : isCheckedOut ? (
                              <a
                                href={`/print/invoice/${item.stay_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="tc-icon-btn tc-icon-bill"
                                title={`Invoice ${item.invoice_number || ''}`}
                                aria-label={`Print invoice for stay ${item.stay_id}`}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <polyline points="10 9 9 9 8 9" />
                                </svg>
                              </a>
                            ) : (
                              <span
                                className="tc-icon-btn"
                                title="Currently Checked-in"
                                aria-label="Currently Checked-in"
                                style={{ opacity: 0.65, cursor: 'default' }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. Check-outs Tab Table (Preserving Existing Checkouts Functionality) */}
        {activeTab === 'checkouts' && (
          <div className="tw">
            <table className="data">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Room</th>
                  <th>Guest</th>
                  <th>Mobile</th>
                  <th>Check-out</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right', width: '130px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCheckouts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-muted)' }}
                    >
                      No checkouts found for today matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCheckouts.map((item) => {
                    const isCheckedOut = item.checkout_status === 'checked_out';
                    const isEligible = item.is_eligible_whatsapp;

                    return (
                      <tr key={item.id}>
                        <td>
                          <span className="rtag" style={{ marginRight: 6 }}>
                            {item.room_no}
                          </span>
                          <small className="muted">{item.room_type_name}</small>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="link-btn"
                            style={{
                              background: 'none',
                              border: 0,
                              padding: 0,
                              font: 'inherit',
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: 'var(--color-text)',
                              textAlign: 'left',
                            }}
                            onClick={() => setActiveSheet({ type: 'guest', payload: item.guest_id })}
                            title="View guest profile"
                          >
                            {item.guest_name}
                          </button>
                          {item.guest_city && (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {item.guest_city}
                            </div>
                          )}
                        </td>
                        <td className="mono">
                          {item.guest_phone || <span className="muted">—</span>}
                        </td>
                        <td>
                          <b>
                            {item.checkout_planned || item.checkout_actual
                              ? fdWithYear(item.checkout_planned || item.checkout_actual)
                              : today
                              ? fdWithYear(today)
                              : ''}
                            , {item.checkout_time}
                          </b>
                          {isCheckedOut && (
                            <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
                              (Actual)
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`tag ${isCheckedOut ? 's-occupied' : 's-booked'}`}>
                            {item.checkout_status_label}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div className="tc-actions">
                            {/* 1. Existing WhatsApp Icon Action */}
                            <button
                              type="button"
                              className="tc-icon-btn tc-icon-whatsapp"
                              disabled={!isEligible}
                              title={isEligible ? 'WhatsApp' : 'WhatsApp (No valid mobile number)'}
                              aria-label="WhatsApp"
                              onClick={() =>
                                setActiveSheet({
                                  type: 'whatsapp_checkout',
                                  payload: item,
                                })
                              }
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.076-1.109-.057-.27-.087-.604-.202-1.026-.384-1.785-.772-2.951-2.593-3.04-2.712-.089-.12-1.006-1.336-1.006-2.55 0-1.213.636-1.81.862-2.057.226-.247.492-.308.656-.308.164 0 .329.002.473.01.152.008.356-.058.556.423.206.494.7 1.706.762 1.83.061.123.102.268.02.43-.082.164-.123.266-.246.411-.123.144-.26.322-.37.432-.124.123-.253.256-.109.503.144.246.638 1.054 1.368 1.705.94.838 1.733 1.098 1.98 1.22.246.124.39.103.534-.062.144-.164.617-.719.781-.966.164-.246.328-.205.553-.123.226.082 1.437.678 1.684.801.246.124.41.185.472.288.061.103.061.597-.083 1.002z" />
                              </svg>
                            </button>

                            {/* 2. Existing Bill Icon Action */}
                            {isCheckedOut ? (
                              <a
                                href={item.stay_id ? `/print/invoice/${item.stay_id}` : '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="tc-icon-btn tc-icon-bill"
                                title="View Bill"
                                aria-label="View Bill"
                                onClick={(e) => {
                                  if (!item.stay_id) {
                                    e.preventDefault();
                                    handleBill(item);
                                  }
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <line x1="10" y1="9" x2="8" y2="9" />
                                </svg>
                              </a>
                            ) : (
                              <button
                                type="button"
                                className="tc-icon-btn tc-icon-bill"
                                title="View Bill"
                                aria-label="View Bill"
                                onClick={() => handleBill(item)}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                  <line x1="16" y1="13" x2="8" y2="13" />
                                  <line x1="16" y1="17" x2="8" y2="17" />
                                  <line x1="10" y1="9" x2="8" y2="9" />
                                </svg>
                              </button>
                            )}

                            {/* 3. Existing Check out Icon Action */}
                            {!isCheckedOut && item.stay_id && (
                              <button
                                type="button"
                                className="tc-icon-btn tc-icon-checkout"
                                title="Check out"
                                aria-label="Check out"
                                onClick={() =>
                                  setActiveSheet({
                                    type: 'checkout',
                                    payload: item.stay_id,
                                  })
                                }
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                  <polyline points="16 17 21 12 16 7" />
                                  <line x1="21" y1="12" x2="9" y2="12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sheets / Modals */}
      {/* 1. Existing Check-out WhatsApp Sheet */}
      {activeSheet?.type === 'whatsapp_checkout' && (
        <WhatsAppSheet
          checkout={activeSheet.payload}
          hotel={hotel}
          template={whatsappCheckoutTemplate}
          today={today}
          onClose={() => {
            setActiveSheet(null);
            refetch();
          }}
        />
      )}

      {/* 2. New Check-in WhatsApp Sheet */}
      {activeSheet?.type === 'whatsapp_checkin' && (
        <CheckInWhatsAppSheet
          checkin={activeSheet.payload}
          hotel={hotel}
          template={whatsappCheckinTemplate}
          today={today}
          onClose={() => {
            setActiveSheet(null);
            refetch();
          }}
        />
      )}

      {/* 3. Existing Checkout Sheet */}
      {activeSheet?.type === 'checkout' && (
        <CheckoutSheet
          stayId={activeSheet.payload}
          onClose={() => {
            setActiveSheet(null);
            refetch();
          }}
        />
      )}

      {/* 4. Check-in Sheet */}
      {activeSheet?.type === 'checkin' && (
        <CheckInSheet
          reservation={activeSheet.reservation}
          triggerAdvanceError={activeSheet.triggerAdvanceError}
          onClose={() => {
            setActiveSheet(null);
            refetch();
          }}
        />
      )}

      {/* 5. Booking Details Sheet */}
      {activeSheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={activeSheet.payload}
          onClose={() => {
            setActiveSheet(null);
            refetch();
          }}
          onCheckIn={(reservation) =>
            setActiveSheet({
              type: 'checkin',
              reservation,
              triggerAdvanceError: Number(reservation.advance_paid ?? 0) <= 0,
            })
          }
          onEdit={() => {
            setActiveSheet(null);
            refetch();
          }}
        />
      )}

      {/* 6. Guest Profile Sheet */}
      {activeSheet?.type === 'guest' && (
        <GuestProfileSheet
          guestId={activeSheet.payload}
          onClose={() => setActiveSheet(null)}
          onCheckOut={(stayId) => setActiveSheet({ type: 'checkout', payload: stayId })}
          onNewBooking={() => setActiveSheet(null)}
        />
      )}
    </>
  );
}
