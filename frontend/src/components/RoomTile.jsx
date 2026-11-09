import { fd, inr, todayIso } from '../lib/format';

const LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair' };

export default function RoomTile({ room, onClick, onOpenBooking }) {
  const today = todayIso();
  let guestName = room.guestName ? room.guestName.split(' ')[0] : '';
  const pendingGuest = room.pendingBooking?.guestName ? room.pendingBooking.guestName.split(' ')[0] : 'Guest';
  let meta = '';
  let due = false;

  if (room.status === 'occupied') {
    due = room.checkoutPlanned <= today;
    meta = due ? 'Leaving today' : 'Till ' + fd(room.checkoutPlanned);
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
    meta = (room.note || '').split('.')[0];
  } else {
    meta = 'Mark ready when done';
  }

  return (
    <button className={`room s-${room.status}`} type="button" onClick={onClick}>
      <span className="t">
        <span className="no">{room.roomNo}</span>
        <span className="ty">{room.roomType.name}</span>
      </span>
      <span className="g">{guestName}</span>
      <span className={`m${due ? ' due' : ''}`}>{meta}</span>
      {room.hasPendingBooking && room.pendingBooking && room.status === 'occupied' && (
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            margin: '2px 0',
            padding: '3px 5px',
            background: 'var(--color-warning-bg, #fffbeb)',
            border: '1px solid var(--color-warning-border, #fcd34d)',
            borderRadius: 6,
            fontSize: 10.5,
            lineHeight: 1.25,
            color: 'var(--color-heading, #1e293b)',
            cursor: 'pointer',
            textAlign: 'left',
            boxSizing: 'border-box',
            maxWidth: '100%',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              color: '#b45309',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            ⚠ {room.pendingBooking.bookingCode} · {pendingGuest}
          </span>
          <span
            style={{
              color: 'var(--color-text-secondary, #64748b)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
              fontSize: '10px',
            }}
          >
            {fd(room.pendingBooking.checkInDate)} – {fd(room.pendingBooking.checkOutDate)}
          </span>
          <span
            style={{
              color: '#b45309',
              fontWeight: 600,
              fontSize: '9.5px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            Room conflict · View booking
          </span>
        </span>
      )}
      <span className="st">{LABEL[room.status]}</span>
    </button>
  );
}
