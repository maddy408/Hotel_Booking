import { fd, inr, todayIso } from '../lib/format';

const LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair' };

export default function RoomTile({ room, onClick }) {
  const today = todayIso();
  let guestName = room.guestName ? room.guestName.split(' ')[0] : '';
  let meta = '';
  let due = false;

  if (room.status === 'occupied') {
    due = room.checkoutPlanned <= today;
    meta = due ? 'Leaving today' : 'Till ' + fd(room.checkoutPlanned);
  } else if (room.status === 'booked') {
    meta = room.bookingCode || '';
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
      <span className="st">{LABEL[room.status]}</span>
    </button>
  );
}
