import { useMemo, useState } from 'react';
import { useRooms } from '../api/rooms';
import RoomTile from '../components/RoomTile.jsx';
import CheckInSheet from '../components/sheets/CheckInSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import HousekeepingSheet from '../components/sheets/HousekeepingSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import DirectCheckInPicker from '../components/sheets/DirectCheckInPicker.jsx';

const LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair' };
const FLOOR_NAME = (f) => (Number(f) === 0 ? 'Ground floor' : `Floor ${f}`);

const COUNT_ICONS = {
  free: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
      <path d="M2 20h20" />
      <circle cx="14" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  booked: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  occupied: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
    </svg>
  ),
  cleaning: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 4-3 3 5 5 3-3a2.12 2.12 0 0 0 0-3l-2-2a2.12 2.12 0 0 0-3 0Z" />
      <path d="m9.5 9.5-6.5 6.5A2.12 2.12 0 0 0 2 17.5V22h4.5a2.12 2.12 0 0 0 1.5-.59l6.5-6.5" />
      <path d="m14 10 4 4" />
    </svg>
  ),
  repair: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
};

export default function Rooms() {
  const { data, isLoading, isError, error, refetch } = useRooms();
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null);

  const floors = useMemo(() => {
    if (!data) return [];
    const set = new Set(data.rooms.map((r) => r.floor));
    return [...set].sort((a, b) => a - b);
  }, [data]);

  if (isLoading) {
    return (
      <div className="mgrid">
        <div className="actbar">
          <div className="skel" style={{ height: 52 }} />
          <div className="skel" style={{ height: 52 }} />
        </div>
        <div className="counts">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="skel" key={i} style={{ height: 72 }} />
          ))}
        </div>
        <div className="rooms">
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="skel" key={i} style={{ height: 116 }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="panel empty">
        Could not load rooms: {error.message}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm dark" type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { rooms, counts } = data;
  const leaving = rooms.filter((r) => r.status === 'occupied' && r.dueToday).length;
  const displayCounts = counts || { free: 0, booked: 0, occupied: 0, cleaning: 0, repair: 0 };

  const roomMatchesFilter = (r, f) => {
    if (f === 'all') return true;
    if (f === 'booked') return r.status === 'booked' || r.hasPendingBooking === true;
    if (f === 'occupied') return r.status === 'occupied';
    return r.status === f;
  };

  const sub = {
    free: 'Ready to give',
    booked: 'Active booking',
    occupied: leaving ? `${leaving} leaving today` : 'Ongoing stay',
    cleaning: 'Being cleaned',
    repair: 'Not usable',
  };

  const openRoom = (room) => {
    if (room.status === 'free') setSheet({ type: 'checkin', room });
    else if (room.status === 'occupied') setSheet({ type: 'checkout', stayId: room.stayId });
    else if (room.status === 'booked') setSheet({ type: 'booking', reservationId: room.bookingId });
    else setSheet({ type: 'housekeeping', room });
  };

  const matchingRoomsCount = rooms.filter((r) => roomMatchesFilter(r, filter)).length;

  return (
    <div>
      {/* 1. Primary Action Buttons */}
      <div className="actbar">
        <button className="btn go big" type="button" onClick={() => setSheet({ type: 'direct' })}>
          <span className="act-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M7 21v-4l2-3 2 1.5V21" />
              <path d="m14 11 3 3v7" />
              <path d="M9 13.5 13 8l3 2.5" />
            </svg>
          </span>
          <span>+ Direct Check-in <span style={{ fontWeight: 500, opacity: 0.88 }}>(walk-in guest)</span></span>
        </button>

        <button className="btn dark big" type="button" onClick={() => setSheet({ type: 'newBooking' })}>
          <span className="act-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" />
              <line x1="10" y1="16" x2="14" y2="16" />
            </svg>
          </span>
          <span>+ New Booking <span style={{ fontWeight: 500, opacity: 0.88 }}>(for later date)</span></span>
        </button>
      </div>

      {/* 2. Room Statistics (5 Status Cards) */}
      <div className="counts">
        {Object.keys(LABEL).map((k) => (
          <button
            key={k}
            type="button"
            className={`count s-${k}`}
            aria-pressed={filter === k}
            onClick={() => setFilter(filter === k ? 'all' : k)}
            title={`Filter rooms by ${LABEL[k]}`}
          >
            <div className="count-icon-box" style={{ color: `var(--color-${k === 'free' ? 'success' : k === 'booked' ? 'warning' : k === 'occupied' ? 'info' : k === 'cleaning' ? 'cleaning' : 'danger'})` }}>
              {COUNT_ICONS[k]}
            </div>
            <span className="n">{displayCounts[k]}</span>
            <span className="l">
              <b>{LABEL[k]}</b>
              <span>{sub[k]}</span>
            </span>
            <span className="count-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>

      {/* 3. Room Interaction Instructions */}
      <div className="hint">
        <span>
          <span className="hint-dot free-dot" aria-hidden="true" />
          Tap a <b style={{ color: 'var(--ok)' }}>green</b> room to check in.
        </span>
        <span>
          <span className="hint-dot occ-dot" aria-hidden="true" />
          Tap a <b style={{ color: 'var(--occ)' }}>blue</b> room to check out.
        </span>
        <span>
          <span className="hint-dot bk-dot" aria-hidden="true" />
          Tap a <b style={{ color: 'var(--bk)' }}>yellow</b> room when the booked guest comes.
        </span>
        {filter !== 'all' && (
          <button className="btn sm clear" type="button" onClick={() => setFilter('all')}>
            Show all {rooms.length} rooms
          </button>
        )}
      </div>

      {!rooms.length && <div className="panel empty">No rooms yet. Add your rooms in the Room Master tab.</div>}
      {rooms.length > 0 && filter !== 'all' && matchingRoomsCount === 0 && (
        <div className="panel empty">No {LABEL[filter]?.toLowerCase() || filter} rooms.</div>
      )}

      {/* 4. Floor-wise Room Cards */}
      {floors.map((f) => {
        const rs = rooms.filter((r) => r.floor === f && roomMatchesFilter(r, filter)).sort((a, b) => a.roomNo - b.roomNo);
        if (!rs.length) return null;
        return (
          <div className="floor" key={f}>
            <div className="floor-header">
              <span className="floor-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                  <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                  <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                  <path d="M10 6h4" />
                  <path d="M10 10h4" />
                  <path d="M10 14h4" />
                  <path d="M10 18h4" />
                </svg>
                {FLOOR_NAME(f)}
              </span>
              <span className="floor-count-pill">{rs.length} Rooms</span>
            </div>

            <div className="rooms">
              {rs.map((r) => (
                <RoomTile
                  key={r.id}
                  room={r}
                  onClick={() => openRoom(r)}
                  onOpenBooking={(bookingId) => setSheet({ type: 'booking', reservationId: bookingId })}
                />
              ))}
            </div>
          </div>
        );
      })}

      {sheet?.type === 'direct' && (
        <DirectCheckInPicker rooms={rooms} onClose={() => setSheet(null)} onPick={(room) => setSheet({ type: 'checkin', room })} />
      )}
      {sheet?.type === 'checkin' && <CheckInSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkin-from-reservation' && <CheckInSheet reservation={sheet.reservation} triggerAdvanceError={sheet.triggerAdvanceError} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkout' && <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.reservationId}
          onClose={() => setSheet(null)}
          onCheckIn={(reservation) => setSheet({ type: 'checkin-from-reservation', reservation, triggerAdvanceError: Number(reservation.advance_paid ?? 0) <= 0 })}
          onEdit={(reservation) => setSheet({ type: 'editBooking', reservation })}
        />
      )}
      {sheet?.type === 'housekeeping' && <HousekeepingSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {sheet?.type === 'newBooking' && <NewBookingSheet onClose={() => setSheet(null)} />}
      {sheet?.type === 'editBooking' && <NewBookingSheet editReservation={sheet.reservation} onClose={() => setSheet(null)} />}
    </div>
  );
}
