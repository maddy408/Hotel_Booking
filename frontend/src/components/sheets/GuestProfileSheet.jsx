import { useRef, useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useGuest } from '../../api/guests';
import { useUploadIdImage, fetchIdImageBlobUrl } from '../../api/idImage';
import { useToast } from '../../context/ToastContext.jsx';
import { fd } from '../../lib/format';

export default function GuestProfileSheet({ guestId, onClose, onNewBooking, onOpenRoomNo }) {
  const { data: guest } = useGuest(guestId);
  const uploadIdImage = useUploadIdImage();
  const toast = useToast();
  const fileInput = useRef(null);
  const [viewing, setViewing] = useState(null); // blob url, while the preview is open

  if (!guest) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader title="Guest" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 120 }} />
        </div>
      </Sheet>
    );
  }

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await uploadIdImage.mutateAsync({ guestId, file });
      toast('ID image saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const viewImage = async () => {
    try {
      setViewing(await fetchIdImageBlobUrl(guestId));
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader title={guest.name} subtitle={guest.city || ''} onClose={onClose} />
      <div className="sb">
        <dl className="info">
          <dt>Mobile</dt>
          <dd className="mono">{guest.phone}</dd>
          <dt>ID proof</dt>
          <dd>
            {guest.idProofType} <span className="mono">{guest.idProofMasked || '—'}</span>
          </dd>
          <dt>Visits</dt>
          <dd>{guest.visits}</dd>
        </dl>

        <div className="f">
          <label>ID proof image</label>
          <div className="row2">
            {guest.hasIdImage && (
              <button className="btn sm" type="button" onClick={viewImage}>
                View
              </button>
            )}
            <button className="btn sm" type="button" disabled={uploadIdImage.isPending} onClick={() => fileInput.current?.click()}>
              {guest.hasIdImage ? 'Replace' : 'Upload'} photo
            </button>
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFileChosen} />
        </div>

        {viewing && (
          <div className="f">
            <img src={viewing} alt="ID proof" style={{ borderRadius: 10, border: '1px solid var(--line)', maxHeight: 220, objectFit: 'contain' }} />
          </div>
        )}

        <button className="btn dark" type="button" onClick={() => onNewBooking(guest)}>
          New booking for this guest
        </button>
        {guest.now?.type === 'in_house' && (
          <button className="btn blue" type="button" onClick={() => onOpenRoomNo(guest.now.roomNo)}>
            In Room {guest.now.roomNo} · open bill
          </button>
        )}
        <ul className="hist">
          {guest.history.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <span>
                Room <b className="mono">{h.room_no}</b> · {fd(h.check_in)} → {fd(h.status === 'checked_out' ? h.checkout_actual : h.check_out)}
              </span>
              <span className={h.status === 'checked_out' ? 'mono' : 'muted'}>
                {h.status === 'checked_out' ? 'Done' : h.kind === 'reservation' ? `Booking ${h.booking_code}` : 'Staying now'}
              </span>
            </li>
          ))}
          {!guest.history.length && <li className="muted">No stays yet.</li>}
        </ul>
      </div>
    </Sheet>
  );
}
