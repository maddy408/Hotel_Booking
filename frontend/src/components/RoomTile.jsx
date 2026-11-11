import { fd, inr, todayIso } from '../lib/format';

const LABEL = { free: 'FREE', booked: 'BOOKED', occupied: 'OCCUPIED', cleaning: 'CLEANING', repair: 'REPAIR' };

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
    meta = (room.note || '').split('.')[0] || 'Under repair';
  } else {
    meta = 'Mark ready when done';
  }

  return (
    <button className={`room s-${room.status}`} type="button" onClick={onClick}>
      <span className="t">
        <span className="no">{room.roomNo}</span>
        <span className="ty">{room.roomType.name}</span>
      </span>
      {guestName ? <span className="g">{guestName}</span> : null}
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

      <span className="st">{LABEL[room.status] || room.status.toUpperCase()}</span>
    </button>
  );
}
