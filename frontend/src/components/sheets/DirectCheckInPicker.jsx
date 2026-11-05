import Sheet, { SheetHeader } from '../Sheet.jsx';
import { inr, fd } from '../../lib/format';

export default function DirectCheckInPicker({ rooms, onPick, onClose }) {
  const free = rooms.filter((r) => r.status === 'free').sort((a, b) => a.roomNo - b.roomNo);
  const byType = {};
  free.forEach((r) => {
    (byType[r.roomType.id] ??= { name: r.roomType.name, rate: r.roomType.rate, rooms: [] }).rooms.push(r);
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
                  {group.rooms.map((r) => (
                    <button key={r.id} type="button" className="pk" title={r.nextBookingDate ? `Booked from ${fd(r.nextBookingDate)}` : ''} onClick={() => onPick(r)}>
                      {r.roomNo}
                      {r.nextBookingDate && <span style={{ fontSize: 11, color: 'var(--bk)' }}> {fd(r.nextBookingDate)}</span>}
                    </button>
                  ))}
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
