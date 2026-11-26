import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useUpdateRoom, useDeleteRoom, useHousekeepingAction } from '../../api/rooms';
import { useToast } from '../../context/ToastContext.jsx';

export default function EditRoomSheet({ room, roomTypes, onClose }) {
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();
  const hkAction = useHousekeepingAction();
  const toast = useToast();

  const [deleting, setDeleting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [showStatusNote, setShowStatusNote] = useState(false);

  const isUnderRepair = room?.status === 'repair' || room?.housekeepingStatus === 'repair' || room?.housekeeping_status === 'repair';
  const isOccupied = room?.status === 'occupied';
  const isBooked = room?.status === 'booked' || room?.hasPendingBooking;

  const handleHousekeeping = async (action) => {
    if (submittingAction) return;
    setSubmittingAction(action);
    try {
      await hkAction.mutateAsync({
        roomId: room.id,
        action,
        note: action === 'repair' ? (statusNote.trim() || 'Marked under maintenance from Room Master') : undefined,
      });
      if (action === 'repair') {
        toast(`Room ${room.roomNo} marked under repair.`);
      } else {
        toast(`Room ${room.roomNo} marked ready.`);
      }
      onClose();
    } catch (e) {
      toast(e.message || 'Room status update failed.');
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete Room ${room.roomNo}? This action cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteRoom.mutateAsync(room.id);
      toast(`Room ${room.roomNo} deleted.`);
      onClose();
    } catch (err) {
      toast(err.message || 'Cannot delete room.');
    } finally {
      setDeleting(false);
    }
  };

  const [form, setForm] = useState({
    roomNo: room?.roomNo ?? room?.room_no ?? '',
    floor: room?.floor ?? 0,
    roomTypeId: room?.roomType?.id ?? room?.room_type_id ?? '',
    note: room?.note || '',
  });
  const [errors, setErrors] = useState({});

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }));
  };

  const validate = () => {
    const errs = {};
    const no = Number(form.roomNo);
    if (!form.roomNo || isNaN(no) || no <= 0) {
      errs.roomNo = 'Enter a valid room number greater than 0.';
    }
    const flr = Number(form.floor);
    if (form.floor === '' || isNaN(flr) || flr < 0) {
      errs.floor = 'Enter a valid floor number (0 = Ground floor).';
    }
    if (!form.roomTypeId) {
      errs.roomTypeId = 'Select a room type.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await updateRoom.mutateAsync({
        id: room.id,
        roomNo: Number(form.roomNo),
        floor: Number(form.floor),
        roomTypeId: Number(form.roomTypeId),
        note: form.note.trim() ? form.note.trim() : null,
      });
      toast(`Room ${form.roomNo} details updated.`);
      onClose();
    } catch (err) {
      if (err.message?.includes('already exists')) {
        setErrors((e) => ({ ...e, roomNo: err.message }));
      } else {
        toast(err.message || 'Failed to update room.');
      }
    }
  };

  const isPending = updateRoom.isPending;

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        badge={room.roomNo}
        title={`Edit Room ${room.roomNo}`}
        subtitle="Update room master details"
        onClose={onClose}
      />
      <form className="sb" onSubmit={save}>
        <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 8 }}>
          ℹ️ <b>Room Configuration:</b> Changes to room number or type will be reflected across active boards. Existing invoice records retain their historical snapshots.
        </div>

        <div className="fg">
          <div className={`f ${errors.roomNo ? 'bad' : ''}`}>
            <label htmlFor="er-no">
              Room number <i>*</i>
            </label>
            <input
              id="er-no"
              type="number"
              min="1"
              required
              value={form.roomNo}
              onChange={(e) => setField('roomNo', e.target.value)}
              placeholder="e.g. 101"
            />
            {errors.roomNo && <span className="err">{errors.roomNo}</span>}
          </div>

          <div className={`f ${errors.floor ? 'bad' : ''}`}>
            <label htmlFor="er-floor">
              Floor <i>*</i> <span className="muted" style={{ fontWeight: 400 }}>(0 = Ground floor)</span>
            </label>
            <input
              id="er-floor"
              type="number"
              min="0"
              required
              value={form.floor}
              onChange={(e) => setField('floor', e.target.value)}
              placeholder="0"
            />
            {errors.floor && <span className="err">{errors.floor}</span>}
          </div>

          <div className={`f full ${errors.roomTypeId ? 'bad' : ''}`}>
            <label htmlFor="er-type">
              Room type / category <i>*</i>
            </label>
            <select
              id="er-type"
              required
              value={form.roomTypeId}
              onChange={(e) => setField('roomTypeId', e.target.value)}
            >
              <option value="" disabled>Select room type</option>
              {roomTypes?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (₹{Number(t.rate)} / day · max {t.max_persons ?? t.maxPersons ?? 2} persons)
                </option>
              ))}
            </select>
            {errors.roomTypeId && <span className="err">{errors.roomTypeId}</span>}
          </div>

          <div className="f full">
            <label htmlFor="er-note">Room notes / features</label>
            <input
              id="er-note"
              type="text"
              value={form.note}
              onChange={(e) => setField('note', e.target.value)}
              placeholder="e.g. Quiet garden view, accessible, twin bed"
            />
          </div>
        </div>

        <div className="row2" style={{ marginTop: 12 }}>
          <button className="btn dark big" type="submit" disabled={isPending || deleting || Boolean(submittingAction)}>
            {isPending ? 'Saving changes…' : 'Save changes'}
          </button>
          <button className="btn big" type="button" disabled={isPending || deleting || Boolean(submittingAction)} onClick={onClose}>
            Cancel
          </button>
        </div>

        {/* Housekeeping Maintenance & Status Action */}
        {!isOccupied && !isBooked && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
            <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 8 }}>
              Maintenance &amp; Status Action
            </label>
            {isUnderRepair ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-secondary)', padding: '8px 12px', borderRadius: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--color-danger, #dc2626)', fontWeight: 600 }}>
                  ⚠️ Currently under maintenance
                </span>
                <button
                  type="button"
                  className="btn sm go"
                  disabled={Boolean(submittingAction)}
                  onClick={() => handleHousekeeping('ready')}
                >
                  {submittingAction === 'ready' ? 'Updating…' : 'Mark Ready'}
                </button>
              </div>
            ) : (
              <div>
                {!showStatusNote ? (
                  <button
                    type="button"
                    className="btn sm"
                    style={{ borderColor: '#dc2626', color: '#dc2626' }}
                    onClick={() => setShowStatusNote(true)}
                  >
                    Mark Under Maintenance
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: 6 }}>
                    <input
                      type="text"
                      placeholder="Reason for maintenance (e.g. AC repair, plumbing issue)"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn sm"
                        style={{ backgroundColor: '#dc2626', color: '#ffffff', borderColor: '#dc2626' }}
                        disabled={Boolean(submittingAction)}
                        onClick={() => handleHousekeeping('repair')}
                      >
                        {submittingAction === 'repair' ? 'Updating…' : 'Confirm Maintenance'}
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setShowStatusNote(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Delete Room Section */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn"
            style={{ width: '100%', borderColor: '#ef4444', color: '#dc2626' }}
            disabled={isPending || deleting || Boolean(submittingAction)}
            onClick={handleDelete}
          >
            {deleting ? 'Deleting room…' : '🗑️ Delete Room'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

