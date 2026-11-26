import { useState, useMemo } from 'react';
import { useReservations, useCheckInReservation } from '../api/reservations';
import { useRooms } from '../api/rooms';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import CheckInSheet from '../components/sheets/CheckInSheet.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { addDaysIso, fd, inr, nightsBetween, todayIso } from '../lib/format';
import { getSimpleBookingSituation } from '../lib/bookingSituation.js';
export { getSimpleBookingSituation };

export default function Bookings() {
  const { data: reservations, isLoading, isError, error, refetch } = useReservations({ status: 'all' });
  const { data: roomsData } = useRooms();
  const checkIn = useCheckInReservation();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);
  const [viewMode, setViewMode] = useState('date'); // 'date' | 'room'
  const [search, setSearch] = useState('');

  if (isLoading) {
    return (
      <div className="panel">
        <div className="sb">
          <div className="skel" style={{ height: 60 }} />
          <div className="skel" style={{ height: 60 }} />
          <div className="skel" style={{ height: 60 }} />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel empty">
        Could not load bookings: {error.message}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm" type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const today = reservations?.find((s) => s.hotel_today)?.hotel_today || todayIso();
  const tomorrow = addDaysIso(today, 1);
  const all = [...(reservations || [])].sort((a, b) => {
    const dateA = a.created_at || a.createdAt || '';
    const dateB = b.created_at || b.createdAt || '';
    if (dateA && dateB && dateA !== dateB) {
      return dateB.localeCompare(dateA);
    }
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
  const filtered = useMemo(() => {
    if (!search.trim()) return all;
    const q = search.toLowerCase().trim();
    return all.filter((s) => (
      (s.booking_code && s.booking_code.toLowerCase().includes(q)) ||
      (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
      (s.guest_phone && s.guest_phone.includes(q)) ||
      (s.room_no && String(s.room_no).includes(q))
    ));
  }, [all, search]);

  const isOverdue = (s) => Boolean(s.is_overdue ?? s.check_in_overdue ?? (s.status === 'pending' && s.check_in_date < today));
  const groups = [
    ['CHECK-IN OVERDUE', filtered.filter(isOverdue)],
    ['Today', filtered.filter((s) => !isOverdue(s) && s.check_in_date === today && s.status === 'pending')],
    ['Tomorrow', filtered.filter((s) => !isOverdue(s) && s.check_in_date === tomorrow && s.status === 'pending')],
    ['Later', filtered.filter((s) => !isOverdue(s) && s.check_in_date > tomorrow && s.status === 'pending')],
  ].filter(([, list]) => list.length);
  const totalPendingCount = groups.reduce((acc, [, list]) => acc + list.length, 0);

  const getRoom = (roomId) => roomsData?.rooms?.find((r) => r.id === roomId);

  // Room-wise sections
  const roomSections = useMemo(() => {
    const map = {};
    filtered.forEach((b) => {
      const rNo = b.room_no || 'Unknown';
      if (!map[rNo]) map[rNo] = [];
      map[rNo].push(b);
    });

    const roomNos = Object.keys(map).sort((a, b) => Number(a) - Number(b));
    return roomNos.map((rNo) => {
      const bookingsForRoom = map[rNo].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
      const rObj = roomsData?.rooms?.find((r) => String(r.roomNo || r.room_no) === String(rNo)) || getRoom(bookingsForRoom[0]?.room_id);

      const pendingForRoom = bookingsForRoom.filter((b) => b.status === 'pending' && (!b.check_out_date || b.check_out_date > today));
      const minDate = (rObj?.status === 'occupied' && rObj?.checkoutPlanned && rObj.checkoutPlanned > today) ? rObj.checkoutPlanned : today;
      const validNext = pendingForRoom.find((b) => b.check_in_date >= minDate) || null;

      const isActuallyStaying = rObj?.status === 'occupied' && Boolean(rObj?.guestName);

      return {
        roomNo: rNo,
        room: rObj,
        bookings: bookingsForRoom,
        currentGuest: isActuallyStaying ? {
          name: rObj.guestName,
          checkout: rObj.checkoutPlanned,
          time: rObj.checkoutTime,
          isOverdue: rObj.isOverdue || (rObj.checkoutPlanned && rObj.checkoutPlanned < today),
        } : null,
        nextGuest: validNext ? {
          name: validNext.guest_name,
          checkIn: validNext.check_in_date,
          bookingCode: validNext.booking_code,
        } : null,
      };
    });
  }, [filtered, roomsData?.rooms, today]);

  const openPreCheckInVerification = (res) => {
    setSheet({
      type: 'checkinFrom',
      reservation: res,
      triggerAdvanceError: Number(res.advance_paid ?? 0) <= 0,
    });
  };

  const renderBookingRow = (s, isItemOverdue) => {
    const nights = nightsBetween(s.check_in_date, s.check_out_date);
    const daysOverdue = nightsBetween(s.check_in_date, today);
    const out = addDaysIso(today, nights);
    const r = getRoom(s.room_id);
    const hkStatus = r?.housekeepingStatus || r?.housekeeping_status || s.housekeeping_status || 'ok';
    const isOccupied = r?.status === 'occupied';
    const isMaintenance = hkStatus === 'repair';
    const isReady = hkStatus === 'ok';
    const isLateArrival = s.status === 'pending' && (s.check_in_date < today || s.check_out_date <= today);
    const lateArrivalConflict = isLateArrival
      ? all.find((other) =>
          other.id !== s.id &&
          Number(other.room_id) === Number(s.room_id) &&
          other.status === 'pending' &&
          other.check_in_date < out &&
          today < other.check_out_date
        )
      : null;

    const situation = getSimpleBookingSituation(s, r, today, all);
    const canIn = s.status === 'pending' &&
      s.check_in_date <= today &&
      !isOccupied &&
      !isMaintenance &&
      isReady &&
      !lateArrivalConflict &&
      !situation.isConflict &&
      !situation.isWaitingRoomOccupied;

    return (
      <li key={s.id} className={isItemOverdue ? 'row-overdue' : ''}>
        <span className="bno">{s.booking_code}</span>
        <span className="rtag">Room {s.room_no}</span>
        {isItemOverdue && (
          <span className="overdue-badge" title={`Check-in was scheduled on ${fd(s.check_in_date)}`}>
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3.5a.75.75 0 01.75.75v3.25a.75.75 0 01-1.5 0V5.25A.75.75 0 018 4.5zm0 7a1 1 0 100-2 1 1 0 000 2z" />
            </svg>
            {daysOverdue > 0 ? `${daysOverdue}d overdue` : 'Overdue'}
          </span>
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: situation.color,
            backgroundColor: situation.bg,
            border: `1px solid ${situation.border}`,
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          {situation.text}
        </span>
        <div className="who">
          <b>{s.guest_name}</b>
          <span className="mono">{s.guest_phone}</span>
          <span>
            {' '}
            · {fd(s.check_in_date)} → {fd(s.check_out_date)} · {nights} day{nights > 1 ? 's' : ''} · {s.persons} person
            {s.persons > 1 ? 's' : ''}{Number(s.advance_paid) > 0 ? ` · advance ${inr(s.advance_paid)}` : ' · advance not paid'}
          </span>
          {situation.isConflict ? (
            <span style={{ color: 'var(--bad, #ef4444)', fontWeight: 600 }}> · Date conflict ({situation.conflictBookingCode})</span>
          ) : null}
        </div>
        {canIn && (
          <button className="btn go sm" type="button" onClick={() => openPreCheckInVerification(s)}>
            Guest came · Check in
          </button>
        )}
        <button className="btn sm" type="button" onClick={() => setSheet({ type: 'open', id: s.id })}>
          Open
        </button>
      </li>
    );
  };

  return (
    <div className="panel">
      <div className="ph" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h2 style={{ margin: 0 }}>
            Bookings <span className="muted mono" style={{ fontSize: 15 }}>{all.length}</span>
          </h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn sm ${viewMode === 'date' ? 'dark' : ''}`}
              onClick={() => setViewMode('date')}
            >
              📅 By Date ({totalPendingCount})
            </button>
            <button
              type="button"
              className={`btn sm ${viewMode === 'room' ? 'dark' : ''}`}
              onClick={() => setViewMode('room')}
            >
              🚪 Room-wise View ({roomSections.length})
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search booking, guest or room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 'min(240px, 100%)', padding: '6px 12px', fontSize: 13 }}
            aria-label="Search bookings"
          />
          <button className="btn dark" type="button" onClick={() => setSheet({ type: 'new' })}>
            + New Booking
          </button>
        </div>
      </div>

      {filtered.length ? (
        viewMode === 'date' ? (
          groups.map(([title, list]) => {
            const isOverdueGroup = title === 'CHECK-IN OVERDUE';
            return (
              <div key={title}>
                <div className={`grp ${isOverdueGroup ? 'grp-overdue' : ''}`}>
                  {isOverdueGroup && (
                    <svg className="grp-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3.5a.75.75 0 01.75.75v3.25a.75.75 0 01-1.5 0V5.25A.75.75 0 018 4.5zm0 7a1 1 0 100-2 1 1 0 000 2z" />
                    </svg>
                  )}
                  <span>{title}</span>
                  <span className={isOverdueGroup ? 'grp-count-overdue' : ''}>· {list.length}</span>
                  {isOverdueGroup && <span className="grp-alert-subtext">Action Required: Scheduled arrival date has passed</span>}
                </div>
                <ul className="blist">
                  {list.map((s) => renderBookingRow(s, isOverdueGroup || isOverdue(s)))}
                </ul>
              </div>
            );
          })
        ) : (
          roomSections.map((sec) => {
            const r = sec.room;
            const hk = r?.housekeepingStatus || r?.housekeeping_status || 'ok';
            const isOcc = r?.status === 'occupied';
            const isMnt = hk === 'repair';
            const isCln = hk === 'cleaning';
            const roomBadgeText = isOcc ? (r?.isOverdue ? 'Checkout overdue' : 'Guest is staying') : isMnt ? 'Repair' : isCln ? 'Room cleaning' : 'Room ready';
            const roomBadgeColor = isOcc ? (r?.isOverdue ? '#dc2626' : '#0284c7') : isMnt ? '#dc2626' : isCln ? '#7c3aed' : '#16a34a';
            const roomBadgeBg = isOcc ? (r?.isOverdue ? '#fef2f2' : '#f0f9ff') : isMnt ? '#fef2f2' : isCln ? '#f5f3ff' : '#f0fdf4';

            return (
              <div key={sec.roomNo} style={{ marginBottom: 16 }}>
                <div className="grp" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>Room {sec.roomNo}</span>
                    {(r?.roomType?.name || sec.bookings[0]?.room_type_name) && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {r?.roomType?.name || sec.bookings[0]?.room_type_name}
                      </span>
                    )}
                    <span
                      style={{
                        backgroundColor: roomBadgeBg,
                        color: roomBadgeColor,
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {roomBadgeText}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {sec.bookings.length} booking{sec.bookings.length !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Current & Next Guest Info Box */}
                <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)', marginRight: 6 }}>Current guest:</span>
                    {sec.currentGuest ? (
                      <b>{sec.currentGuest.name} <span style={{ fontWeight: 400, color: sec.currentGuest.isOverdue ? '#dc2626' : 'inherit' }}>· Checkout: {fd(sec.currentGuest.checkout)}{sec.currentGuest.isOverdue ? ' (Overdue!)' : ''}</span></b>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>None (Room vacant)</span>
                    )}
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)', marginRight: 6 }}>Next guest:</span>
                    {sec.nextGuest ? (
                      <b>{sec.nextGuest.name} <span style={{ fontWeight: 400 }}>· Check-in: {fd(sec.nextGuest.checkIn)} ({sec.nextGuest.bookingCode})</span></b>
                    ) : (
                      <span style={{ color: 'var(--color-text-secondary)' }}>None scheduled</span>
                    )}
                  </div>
                </div>

                <ul className="blist">
                  {sec.bookings.map((s) => renderBookingRow(s, isOverdue(s)))}
                </ul>
              </div>
            );
          })
        )
      ) : (
        <div className="empty">{search.trim() ? 'No bookings match your search.' : 'No bookings. Tap "New booking" when a guest calls or comes to book.'}</div>
      )}

      {sheet?.type === 'new' && <NewBookingSheet onClose={() => setSheet(null)} />}
      {sheet?.type === 'open' && (
        <BookingDetailSheet
          reservationId={sheet.id}
          onClose={() => setSheet(null)}
          onCheckIn={(reservation) => setSheet({ type: 'checkinFrom', reservation, triggerAdvanceError: Number(reservation.advance_paid ?? 0) <= 0 })}
          onEdit={(reservation) => setSheet({ type: 'edit', reservation })}
        />
      )}
      {sheet?.type === 'checkinFrom' && (
        <CheckInSheet
          reservation={sheet.reservation}
          triggerAdvanceError={sheet.triggerAdvanceError}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'edit' && <NewBookingSheet editReservation={sheet.reservation} onClose={() => setSheet(null)} />}
    </div>
  );
}
