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
          <div className="skel" style={{ height: 54 }} />
          <div className="skel" style={{ height: 54 }} />
        </div>
        <div className="counts">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="skel" key={i} style={{ height: 70 }} />
          ))}
        </div>
        <div className="rooms">
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="skel" key={i} style={{ height: 112 }} />
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
          <button className="btn sm" type="button" onClick={() => refetch()}>
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
    return r.status === f;
  };

  const sub = {
    free: 'Ready to give',
    booked: 'Active booking',
    occupied: `${leaving} leaving today`,
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
      <div className="actbar">
        <button className="btn go big" type="button" onClick={() => setSheet({ type: 'direct' })}>
          + Direct Check-in <span style={{ fontWeight: 500, opacity: 0.85 }}>(walk-in guest)</span>
        </button>
        <button className="btn dark big" type="button" onClick={() => setSheet({ type: 'newBooking' })}>
          + New Booking <span style={{ fontWeight: 500, opacity: 0.85 }}>(for later date)</span>
        </button>
      </div>

      <div className="counts">
        {Object.keys(LABEL).map((k) => (
          <button
            key={k}
            type="button"
            className={`count s-${k}`}
            aria-pressed={filter === k}
            onClick={() => setFilter(filter === k ? 'all' : k)}
          >
            <span className="n">{displayCounts[k]}</span>
            <span className="l">
              <b>{LABEL[k]}</b>
              <span>{sub[k]}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="hint">
        <span>
          Tap a <b style={{ color: 'var(--ok)' }}>green</b> room to check in.
        </span>
        <span>
          Tap a <b style={{ color: 'var(--occ)' }}>blue</b> room to check out.
        </span>
        <span>
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

      {floors.map((f) => {
        const rs = rooms.filter((r) => r.floor === f && roomMatchesFilter(r, filter)).sort((a, b) => a.roomNo - b.roomNo);
        if (!rs.length) return null;
        return (
          <div className="floor" key={f}>
            <h3>{FLOOR_NAME(f)}</h3>
            <div className="rooms">
              {rs.map((r) => (
                <RoomTile key={r.id} room={r} onClick={() => openRoom(r)} />
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
