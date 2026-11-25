import { fd, inr, todayIso, nightsBetween } from '../lib/format';

const LABEL = { free: 'FREE', booked: 'BOOKED', occupied: 'OCCUPIED', cleaning: 'CLEANING', repair: 'REPAIR' };

export default function RoomTile({ room, onClick, onOpenBooking }) {
  const today = todayIso();
  const guestName = room.guestName ? room.guestName.trim() : '';
  const pendingGuest = room.pendingBooking?.guestName ? room.pendingBooking.guestName.split(' ')[0] : 'Guest';
  let meta = '';
  let due = false;
  let isOverdue = false;
  let overdueDays = 0;

  const plannedIso = room.checkoutPlanned ? room.checkoutPlanned.slice(0, 10) : null;

  if (room.status === 'occupied') {
    if (plannedIso && plannedIso < today) {
      isOverdue = true;
      due = true;
      overdueDays = nightsBetween(plannedIso, today);
      meta = `Due was ${fd(plannedIso)}`;
    } else if (plannedIso && plannedIso === today) {
      due = true;
      meta = 'Leaving today';
    } else if (plannedIso) {
      meta = 'Till ' + fd(plannedIso);
    } else {
      meta = 'Ongoing stay';
    }
  } else if (room.status === 'booked') {
    if (room.housekeepingStatus === 'repair') {
      meta = 'Maintenance · ' + (room.bookingCode || 'Booked');
    } else if (room.housekeepingStatus === 'cleaning') {
      meta = 'Not ready · ' + (room.bookingCode || 'Booked');
    } else {
      meta = room.bookingCode ? `${room.bookingCode} · Ready` : 'Ready';
    }
  } else if (room.status === 'free') {
    meta = room.nextBookingDate ? 'Booked ' + fd(room.nextBookingDate) : inr(room.roomType.rate);
  } else if (room.status === 'repair') {
    meta = (room.note || '').split('.')[0] || 'Under repair';
  } else {
    meta = 'Mark ready when done';
  }

  // Determine persons count display strictly per requirement:
  // - Occupied room: Show actual persons count from current stay (stays.persons)
  // - Booked room: Show persons count from active reservation
  // - Ready / Cleaning / Maintenance: Show 0 Persons without misleading guest counts
  let personsDisplay = '0 Persons';
  if (room.status === 'occupied') {
    const p = Math.max(1, Number(room.persons || 1));
    personsDisplay = `${p} ${p === 1 ? 'Person' : 'Persons'}`;
  } else if (room.status === 'booked') {
    const p = Math.max(1, Number(room.persons || room.pendingBooking?.persons || 1));
    personsDisplay = `${p} ${p === 1 ? 'Person' : 'Persons'}`;
  } else {
    personsDisplay = '0 Persons';
  }

  return (
    <button className={`room s-${room.status}`} type="button" onClick={onClick}>
      <span className="t">
        <span className="no">{room.roomNo}</span>
        <span className="ty">{room.roomType.name}</span>
      </span>

      <span
        className="room-persons-badge"
        style={{
          fontSize: '11.5px',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          lineHeight: 1.2,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ opacity: 0.75 }}
        >
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span>{personsDisplay}</span>
      </span>

      {(room.status === 'occupied' || room.status === 'booked') && guestName ? (
        <span className="g" title={guestName}>
          Guest: {guestName}
        </span>
      ) : null}

      {/* Compact Inline Overdue Stay Alert */}
      {isOverdue && (
        <span
          className="room-overdue-warn"
          title={`Checkout was planned on ${fd(plannedIso)} · Overdue by ${overdueDays} day${overdueDays > 1 ? 's' : ''}`}
        >
          <span className="overdue-tag">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ flexShrink: 0 }}
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{overdueDays}d overdue</span>
          </span>
          <span className="overdue-dates">· Due {fd(plannedIso)}</span>
        </span>
      )}

      {(room.hasConflict || room.hasPendingBooking) &&
        room.pendingBooking &&
        room.status === 'occupied' &&
        (!room.pendingBooking.checkOutDate || room.pendingBooking.checkOutDate > today) && (
        <span
          className="room-booking-conflict-warn"
          role="button"
          tabIndex={0}
          title={`Booking ${room.pendingBooking.bookingCode} (${room.pendingBooking.guestName}) · ${fd(room.pendingBooking.checkInDate)} – ${fd(room.pendingBooking.checkOutDate)} · Click to view`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBooking?.(room.pendingBooking.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onOpenBooking?.(room.pendingBooking.id);
            }
          }}
        >
          <span className="conflict-title">
            ▲ {room.pendingBooking.bookingCode} · {pendingGuest}
          </span>
          <span className="conflict-dates">
            {fd(room.pendingBooking.checkInDate)} – {fd(room.pendingBooking.checkOutDate)}
          </span>
          <span className="conflict-action">
            Room conflict · View…
          </span>
        </span>
      )}

      {!isOverdue && <span className={`m${due ? ' due' : ''}`}>{meta}</span>}

      <span className="st">{LABEL[room.status] || room.status.toUpperCase()}</span>
    </button>
  );
}
