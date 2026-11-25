import Sheet, { SheetHeader } from '../Sheet.jsx';
import { inr, fd, todayIso, addDaysIso } from '../../lib/format';
import { useFreeRooms } from '../../api/reservations';

export default function DirectCheckInPicker({ rooms, checkIn: propCheckIn, checkOut: propCheckOut, onPick, onClose }) {
  const today = todayIso();
  const checkIn = propCheckIn || today;
  const checkOut = propCheckOut || addDaysIso(checkIn, 1);
  const { data: freeRoomsData } = useFreeRooms({ checkIn, checkOut });

  const effectiveRooms = freeRoomsData ?? rooms ?? [];
  const free = effectiveRooms
    .filter((r) => {
      // 1. Core bookability: must not be blocked by existing reservation or maintenance
      if (r.is_bookable === false) return false;
      if (r.selection_allowed === false) return false;
      if (r.is_available === false) return false;
      if (r.booking_status === 'unavailable' || r.booking_status === 'maintenance' || r.booking_status === 'available_not_ready') return false;

      // 2. Direct walk-in check-in requires a room that is physically unoccupied right now
      if (r.current_stay || r.stayId || r.stay_id) return false;

      // 3. Must be clean and ready
      const hk = r.housekeepingStatus || r.housekeeping_status || 'ok';
      if (hk !== 'ok' && hk !== 'ready') return false;
      if (r.is_ready === false) return false;

      // 4. Must not have blocked card badge
      const badge = r.card_badge || '';
      if (badge === 'Occupied' || badge === 'Booked' || badge === 'Overdue' || badge === 'Cleaning' || badge === 'Repair') {
        return false;
      }

      // 5. If status is explicitly provided (e.g. from /rooms or local backend), it must be 'free'
      if (r.status && r.status !== 'free') return false;

      // 6. If status is undefined (e.g. from remote /reservations/free-rooms), verify card_badge or booking_status or readiness
      if (!r.status) {
        const isReadyBadge = badge === 'Ready' || r.booking_status === 'available_ready' || r.is_ready === true;
        if (!isReadyBadge) return false;
      }

      return true;
    })
    .sort((a, b) => (Number(a.roomNo || a.room_no) || 0) - (Number(b.roomNo || b.room_no) || 0));

  const byType = {};
  free.forEach((r) => {
    const typeId = r.roomType?.id ?? r.room_type_id ?? 'default';
    const typeName = r.roomType?.name ?? r.type_name ?? 'Standard Room';
    const typeRate = r.roomType?.rate ?? r.type_rate ?? 0;
    (byType[typeId] ??= { name: typeName, rate: typeRate, rooms: [] }).rooms.push(r);
  });

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="free" title="Direct Check-in" subtitle="Pick a free room for the walk-in guest" onClose={onClose} />
      <div className="sb">
        {free.length ? (
          <>
            {Object.values(byType).map((group) => (
              <div className="f" key={group.name}>
                <label>
                  {group.name} · {inr(group.rate)} / day · {group.rooms.length} free
                </label>
                <div className="pks">
                  {group.rooms.map((r) => {
                    const rNo = r.roomNo ?? r.room_no;
                    const rawNext = r.nextBookingDate || r.next_reservation?.check_in_date;
                    const nextDate = (rawNext && rawNext >= today && rawNext >= checkIn) ? rawNext : null;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="pk"
                        title={nextDate ? `Booked from ${fd(nextDate)}` : ''}
                        onClick={() => onPick({
                          ...r,
                          id: r.id,
                          roomNo: r.roomNo ?? Number(r.room_no),
                          room_no: r.room_no ?? String(r.roomNo),
                          roomType: r.roomType ?? {
                            id: r.room_type_id,
                            name: r.type_name,
                            rate: r.type_rate,
                          },
                          nextBookingDate: nextDate || null,
                        })}
                      >
                        {rNo}
                        {nextDate && <span style={{ fontSize: 11, color: 'var(--bk)' }}> {fd(nextDate)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              A date next to a room number means it is booked from that day.
            </p>
          </>
        ) : (
          <div className="warn">No free room right now. Check rooms in Cleaning and mark them ready.</div>
        )}
      </div>
    </Sheet>
  );
}
