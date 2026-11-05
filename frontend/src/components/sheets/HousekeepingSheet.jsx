import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useHousekeepingAction } from '../../api/rooms';
import { useToast } from '../../context/ToastContext.jsx';

export default function HousekeepingSheet({ room, onClose }) {
  const [note, setNote] = useState('');
  const action = useHousekeepingAction();
  const toast = useToast();

  const run = async (act) => {
    try {
      await action.mutateAsync({ roomId: room.id, action: act, note: note.trim() || undefined });
      onClose();
      toast(
        act === 'ready'
          ? `Room ${room.roomNo} is ready.`
          : act === 'repair'
            ? `Room ${room.roomNo} sent for repair.`
            : `Room ${room.roomNo} sent for cleaning.`,
      );
    } catch (err) {
      toast(err.message);
    }
  };

  if (room.status === 'repair') {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="repair" badge={room.roomNo} title="Under repair" subtitle={`${room.roomType.name}`} onClose={onClose} />
        <div className="sb">
          <dl className="info">
            <dt>Problem</dt>
            <dd>{room.note || 'Not written'}</dd>
          </dl>
          <button className="btn go big" type="button" disabled={action.isPending} onClick={() => run('cleaning')}>
            Repair done, send for cleaning
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="cleaning" badge={room.roomNo} title="Being cleaned" subtitle={room.roomType.name} onClose={onClose} />
      <div className="sb">
        <p style={{ margin: 0 }}>
          Housekeeping is cleaning this room. Mark it ready when they finish so you can give it to the next guest.
        </p>
        <button className="btn go big" type="button" disabled={action.isPending} onClick={() => run('ready')}>
          Room is ready
        </button>
        <div className="f">
          <label htmlFor="rnote">Found a problem? Write it here</label>
          <input id="rnote" type="text" placeholder="e.g. Bathroom tap leaking" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn red" type="button" disabled={action.isPending} onClick={() => run('repair')}>
          Send for repair
        </button>
      </div>
    </Sheet>
  );
}
