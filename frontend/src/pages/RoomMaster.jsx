import { useState } from 'react';
import { useSettings, useUpdateHotel } from '../api/settings';
import {
  useRoomTypes,
  useRooms,
  useCreateRoomType,
  useUpdateRoomType,
  useDeleteRoomType,
  useBulkAddRooms,
  useChangeRoomType,
  useDeleteRoom,
} from '../api/rooms';
import { useToast } from '../context/ToastContext.jsx';
import { inr, estimateGstRate } from '../lib/format';

const FLOOR_NAME = (f) => (Number(f) === 0 ? 'Ground floor' : `Floor ${f}`);

function HotelPanel() {
  const { data } = useSettings();
  const update = useUpdateHotel();
  const toast = useToast();
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');

  const displayName = name || data?.hotel.name || '';
  const displayPlace = place || data?.hotel.place || '';

  const save = async () => {
    const n = (name || data?.hotel.name || '').trim();
    if (!n) {
      toast('Enter the hotel name.');
      return;
    }
    try {
      await update.mutateAsync({ name: n, place: place || data?.hotel.place || '' });
      toast('Hotel details saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <div className="panel">
      <div className="ph">
        <h2>Hotel</h2>
      </div>
      <div className="formrow">
        <div className="f">
          <label htmlFor="m-hname">Hotel name</label>
          <input id="m-hname" type="text" value={displayName} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="f">
          <label htmlFor="m-hplace">Place</label>
          <input id="m-hplace" type="text" value={displayPlace} onChange={(e) => setPlace(e.target.value)} />
        </div>
        <button className="btn dark" type="button" disabled={update.isPending} onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

function RoomTypesPanel() {
  const { data: types } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const createType = useCreateRoomType();
  const updateType = useUpdateRoomType();
  const deleteType = useDeleteRoomType();
  const toast = useToast();
  const [edits, setEdits] = useState({});
  const [newType, setNewType] = useState({ name: '', rate: '', max: 2 });

  const countFor = (id) => roomsData?.rooms.filter((r) => r.roomType.id === id).length ?? 0;
  const edit = (id, field, value) => setEdits((e) => ({ ...e, [id]: { ...e[id], [field]: value } }));
  const valueFor = (t, field) => edits[t.id]?.[field] ?? t[field];

  const saveType = async (t) => {
    const name = String(valueFor(t, 'name')).trim();
    const rate = Number(valueFor(t, 'rate'));
    const maxPersons = Number(valueFor(t, 'max_persons'));
    if (!name || !(rate > 0) || !(maxPersons >= 1)) {
      toast('Enter name, rate and max persons.');
      return;
    }
    try {
      await updateType.mutateAsync({ id: t.id, name, rate, maxPersons });
      toast(`${name} saved at ${inr(rate)} per day.`);
    } catch (err) {
      toast(err.message);
    }
  };

  const removeType = async (t) => {
    try {
      await deleteType.mutateAsync(t.id);
      toast(`${t.name} removed.`);
    } catch (err) {
      toast(err.message);
    }
  };

  const addType = async () => {
    const name = newType.name.trim();
    const rate = Number(newType.rate);
    if (!name || !(rate > 0)) {
      toast('Enter type name and rate.');
      return;
    }
    try {
      await createType.mutateAsync({ name, rate, maxPersons: Number(newType.max) || 2 });
      setNewType({ name: '', rate: '', max: 2 });
      toast(`Room type ${name} added.`);
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <div className="panel">
      <div className="ph">
        <h2>Room types &amp; rates</h2>
        <span className="muted">{types?.length ?? 0} types</span>
      </div>
      <p className="sec-note" style={{ paddingTop: 12 }}>
        The rate here fills in automatically at check-in and booking. Changing it does not change bills of guests already staying.
      </p>
      <div className="tw">
        <table className="mt">
          <thead>
            <tr>
              <th>Type name</th>
              <th>Rate / day (₹)</th>
              <th>Max persons</th>
              <th>GST</th>
              <th>Rooms</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types?.map((t) => (
              <tr key={t.id}>
                <td>
                  <input type="text" value={valueFor(t, 'name')} onChange={(e) => edit(t.id, 'name', e.target.value)} aria-label="Type name" />
                </td>
                <td>
                  <input
                    className="w-m"
                    type="number"
                    min="0"
                    step="100"
                    value={valueFor(t, 'rate')}
                    onChange={(e) => edit(t.id, 'rate', e.target.value)}
                    aria-label="Rate"
                  />
                </td>
                <td>
                  <input
                    className="w-s"
                    type="number"
                    min="1"
                    value={valueFor(t, 'max_persons')}
                    onChange={(e) => edit(t.id, 'max_persons', e.target.value)}
                    aria-label="Max persons"
                  />
                </td>
                <td className="mono muted">{Math.round(estimateGstRate(Number(valueFor(t, 'rate')) || 0) * 100)}%</td>
                <td className="mono">{countFor(t.id)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm" type="button" disabled={updateType.isPending} onClick={() => saveType(t)}>
                    Save
                  </button>{' '}
                  <button
                    className="btn sm red"
                    type="button"
                    disabled={countFor(t.id) > 0 || deleteType.isPending}
                    title={countFor(t.id) ? 'Remove or change its rooms first' : ''}
                    onClick={() => removeType(t)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            <tr className="add">
              <td>
                <input
                  type="text"
                  placeholder="New type, e.g. AC Double"
                  aria-label="New type name"
                  value={newType.name}
                  onChange={(e) => setNewType((n) => ({ ...n, name: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className="w-m"
                  type="number"
                  min="0"
                  step="100"
                  placeholder="₹"
                  aria-label="Rate"
                  value={newType.rate}
                  onChange={(e) => setNewType((n) => ({ ...n, rate: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className="w-s"
                  type="number"
                  min="1"
                  aria-label="Max persons"
                  value={newType.max}
                  onChange={(e) => setNewType((n) => ({ ...n, max: e.target.value }))}
                />
              </td>
              <td></td>
              <td></td>
              <td>
                <button className="btn sm dark" type="button" disabled={createType.isPending} onClick={addType}>
                  + Add type
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoomsPanel() {
  const { data: roomsData } = useRooms();
  const { data: types } = useRoomTypes();
  const bulkAdd = useBulkAddRooms();
  const changeType = useChangeRoomType();
  const deleteRoom = useDeleteRoom();
  const toast = useToast();
  const [form, setForm] = useState({ floor: 1, from: '', to: '', typeId: '' });
  const [armed, setArmed] = useState(null);

  const rooms = roomsData?.rooms ?? [];
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
  const typeId = form.typeId || types?.[0]?.id || '';

  const addRooms = async () => {
    const from = Number(form.from);
    const to = Number(form.to) || from;
    if (!(from > 0) || to < from || to - from > 60) {
      toast('Enter a room number, or a range up to 60 rooms.');
      return;
    }
    if (!typeId) {
      toast('Add a room type first.');
      return;
    }
    try {
      const result = await bulkAdd.mutateAsync({ floor: Number(form.floor), from, to, roomTypeId: Number(typeId) });
      toast(
        result.added
          ? `${result.added} room${result.added > 1 ? 's' : ''} added to ${FLOOR_NAME(form.floor)}.${result.skipped.length ? ' Already there: ' + result.skipped.join(', ') : ''}`
          : 'These room numbers already exist.',
      );
      setForm((f) => ({ ...f, from: '', to: '' }));
    } catch (err) {
      toast(err.message);
    }
  };

  const onTypeChange = async (room, newTypeId) => {
    try {
      await changeType.mutateAsync({ roomId: room.id, roomTypeId: Number(newTypeId) });
      toast(`Room ${room.roomNo} is now ${types.find((t) => t.id === Number(newTypeId))?.name}.`);
    } catch (err) {
      toast(err.message);
    }
  };

  const onDelete = async (room) => {
    if (armed !== room.id) {
      setArmed(room.id);
      toast(`Tap × again to remove Room ${room.roomNo}.`);
      return;
    }
    try {
      await deleteRoom.mutateAsync(room.id);
      toast(`Room ${room.roomNo} removed.`);
    } catch (err) {
      toast(err.message);
    } finally {
      setArmed(null);
    }
  };

  return (
    <div className="panel">
      <div className="ph">
        <h2>Rooms</h2>
        <span className="muted">{rooms.length} rooms</span>
      </div>
      <div className="formrow">
        <div className="f">
          <label htmlFor="nr-floor">Floor (0 = ground)</label>
          <input
            id="nr-floor"
            type="number"
            min="0"
            value={form.floor}
            onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
          />
        </div>
        <div className="f">
          <label htmlFor="nr-from">Room no. from</label>
          <input id="nr-from" type="number" min="1" placeholder="e.g. 501" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="f">
          <label htmlFor="nr-to">to (optional)</label>
          <input id="nr-to" type="number" min="1" placeholder="e.g. 510" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="f">
          <label htmlFor="nr-type">Type</label>
          <select id="nr-type" value={typeId} onChange={(e) => setForm((f) => ({ ...f, typeId: e.target.value }))}>
            {types?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn dark" type="button" disabled={bulkAdd.isPending} onClick={addRooms}>
          + Add rooms
        </button>
      </div>
      <p className="sec-note">
        Give one number to add one room, or a range (501 to 510) to add a full floor. Change a room's type below. A room with a guest or
        booking cannot be removed. For a room with a problem, use Repair on the Rooms screen instead.
      </p>
      {floors.map((f) => (
        <div className="flr" key={f}>
          <h3>
            {FLOOR_NAME(f)} · {rooms.filter((r) => r.floor === f).length} rooms
          </h3>
          <div className="rchips">
            {rooms
              .filter((r) => r.floor === f)
              .sort((a, b) => a.roomNo - b.roomNo)
              .map((r) => (
                <span className="rchip" key={r.id}>
                  <b>{r.roomNo}</b>
                  <select aria-label={`Type of room ${r.roomNo}`} value={r.roomType.id} onChange={(e) => onTypeChange(r, e.target.value)}>
                    {types?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`del${armed === r.id ? ' armed' : ''}`}
                    type="button"
                    aria-label={`Remove room ${r.roomNo}`}
                    title={armed === r.id ? 'Tap again to remove' : 'Remove'}
                    onClick={() => onDelete(r)}
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
        </div>
      ))}
      {!floors.length && <div className="empty">No rooms yet. Add your first room above.</div>}
    </div>
  );
}

export default function RoomMaster() {
  return (
    <div className="mgrid">
      <HotelPanel />
      <RoomTypesPanel />
      <RoomsPanel />
    </div>
  );
}
