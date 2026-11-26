import { useState, useMemo } from 'react';
import { useDoneStays } from '../api/stays';
import { useTodayReport } from '../api/reports';
import GuestProfileSheet from '../components/sheets/GuestProfileSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import { useRooms } from '../api/rooms';
import { fd, inr, todayIso, getPresetDateRange, formatDateRangeLabel } from '../lib/format';

const PRESET_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'all', label: 'All bills' },
];

export default function Bills() {
  const [filter, setFilter] = useState(() => getPresetDateRange('today'));
  const [search, setSearch] = useState('');

  const stayRange = useMemo(() => {
    if (filter.preset === 'all') return {};
    return { from: filter.from, to: filter.to };
  }, [filter.preset, filter.from, filter.to]);

  const { data: stays, isLoading, isError, error, refetch: refetchStays } = useDoneStays(stayRange);
  // Reuses the same /reports/today the Reports screen shows, matching period totals
  const { data: today, refetch: refetchToday } = useTodayReport(
    filter.preset === 'all' ? undefined : filter.from,
    filter.preset === 'all' ? undefined : filter.to
  );
  const { data: roomsData } = useRooms();
  const [sheet, setSheet] = useState(null);

  const refetchAll = () => {
    refetchStays();
    refetchToday();
  };

  const selectPreset = (key) => {
    if (key === 'all') {
      setFilter({ preset: 'all', from: '', to: '', label: 'All bills' });
    } else {
      setFilter(getPresetDateRange(key));
    }
  };

  const handleCustomDateChange = (field, val) => {
    setFilter((prev) => {
      const updated = {
        ...prev,
        [field]: val,
        preset: 'custom',
      };
      updated.label = formatDateRangeLabel(updated.from, updated.to, 'custom');
      return updated;
    });
  };

  const filteredDone = useMemo(() => {
    const list = [...(stays || [])].sort(
      (a, b) => (b.checkout_actual || '').localeCompare(a.checkout_actual || '') || b.id - a.id
    );
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter(
      (s) =>
        (s.invoice_number && s.invoice_number.toLowerCase().includes(q)) ||
        (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
        (s.room_no && String(s.room_no).includes(q)) ||
        (s.guest_phone && s.guest_phone.includes(q))
    );
  }, [stays, search]);

  const openRoomByNo = (roomNo) => {
    const room = roomsData?.rooms.find((r) => r.roomNo === roomNo);
    if (room?.stayId) setSheet({ type: 'checkout', stayId: room.stayId });
  };

  if (isLoading) {
    return (
      <div className="panel">
        <div className="sb">
          <div className="skel" style={{ height: 160 }} />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel empty">
        Could not load bills: {error.message}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm" type="button" onClick={refetchAll}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const periodLabel = filter.preset === 'today' ? 'Today' : filter.label || 'Bills';
  const isSingleDay = filter.from && filter.from === filter.to;
  const dateSubtext = filter.preset === 'all' ? 'All records' : isSingleDay ? fd(filter.from) : `${fd(filter.from)} → ${fd(filter.to)}`;

  const checkoutsCount = today?.checkouts ?? (stays ? stays.length : '—');
  const billedAmount = today?.billedAtCheckout ?? (stays ? stays.reduce((sum, s) => sum + (Number(s.invoice_total) || 0), 0) : 0);

  return (
    <>
      {/* Date Filter & Period Summary */}
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2>{periodLabel}</h2>
            <span className="muted">{dateSubtext}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="seg" role="tablist" aria-label="Bill Period Presets">
              {PRESET_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={filter.preset === item.key ? 'active' : ''}
                  aria-pressed={filter.preset === item.key}
                  onClick={() => selectPreset(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {filter.preset !== 'all' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="date"
                  value={filter.from}
                  max={filter.to || todayIso()}
                  onChange={(e) => handleCustomDateChange('from', e.target.value)}
                  style={{ width: 135, padding: '4px 6px', fontSize: 12.5 }}
                  aria-label="From Date"
                />
                <span className="muted" style={{ fontSize: 12 }}>to</span>
                <input
                  type="date"
                  value={filter.to}
                  min={filter.from}
                  max={todayIso()}
                  onChange={(e) => handleCustomDateChange('to', e.target.value)}
                  style={{ width: 135, padding: '4px 6px', fontSize: 12.5 }}
                  aria-label="To Date"
                />
              </div>
            )}
          </div>
        </div>
        <div className="sumrow" style={{ padding: '14px 16px' }}>
          <div>
            <span>Check-outs</span>
            <b className="mono">{checkoutsCount}</b>
          </div>
          <div>
            <span>Billed at check-out</span>
            <b className="mono">{inr(billedAmount)}</b>
          </div>
        </div>
      </div>

      {/* Bills List Table */}
      <div className="panel">
        <div className="ph" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2>
            {filter.preset === 'all'
              ? `All bills (${filteredDone.length})`
              : `${periodLabel} bills (${filteredDone.length})`}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="search"
              placeholder="Search invoice, guest, room, mobile…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 260, padding: '5px 10px', fontSize: 13 }}
              aria-label="Search bills"
            />
          </div>
        </div>
        <div className="tw">
          <table className="data">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Guest</th>
                <th>Room</th>
                <th>Stay</th>
                <th className="r">Total</th>
                <th>Paid by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredDone.length ? (
                filteredDone.map((s) => (
                  <tr key={s.id} onClick={() => setSheet({ type: 'guest', guestId: s.guest_id })}>
                    <td className="mono">{s.invoice_number || `#${s.id}`}</td>
                    <td>
                      <b>{s.guest_name}</b>
                    </td>
                    <td className="mono">{s.room_no}</td>
                    <td>
                      {fd(s.check_in_date)} → {fd(s.checkout_actual)}
                    </td>
                    <td className="r mono">{inr(s.invoice_total)}</td>
                    <td>{s.payment_method?.toUpperCase()}</td>
                    <td>
                      <a
                        className="btn sm"
                        href={`/print/invoice/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Print
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">
                    {search.trim() ? 'No matching bills found.' : `No bills for ${periodLabel.toLowerCase()}.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sheet?.type === 'guest' && (
        <GuestProfileSheet
          guestId={sheet.guestId}
          onClose={() => setSheet(null)}
          onNewBooking={(guest) => setSheet({ type: 'newBooking', guest })}
          onOpenRoomNo={(roomNo) => openRoomByNo(roomNo)}
        />
      )}
      {sheet?.type === 'newBooking' && <NewBookingSheet presetGuest={sheet.guest} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkout' && <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />}
    </>
  );
}
