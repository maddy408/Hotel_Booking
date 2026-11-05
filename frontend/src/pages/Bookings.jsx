import { useState } from 'react';
import { useReservations, useCheckInReservation } from '../api/reservations';
import { useRooms } from '../api/rooms';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import CheckInSheet from '../components/sheets/CheckInSheet.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { addDaysIso, fd, inr, nightsBetween, todayIso } from '../lib/format';

export default function Bookings() {
  const { data: reservations, isLoading, isError, error, refetch } = useReservations();
  const { data: roomsData } = useRooms();
  const checkIn = useCheckInReservation();
  const toast = useToast();
  const [sheet, setSheet] = useState(null);

  if (isLoading) {
    return (
      <div className="panel">
        <div className="sb">
          <div className="skel" style={{ height: 60 }} />
          <div className="skel" style={{ height: 60 }} />
          <div className="skel" style={{ height: 60 }} />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel empty">
        Could not load bookings: {error.message}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm" type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const today = todayIso();
  const tomorrow = addDaysIso(today, 1);
  const all = [...reservations].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date) || a.room_no - b.room_no);
  const groups = [
    ['Not came (date passed)', all.filter((s) => s.check_in_date < today)],
    ['Today', all.filter((s) => s.check_in_date === today)],
    ['Tomorrow', all.filter((s) => s.check_in_date === tomorrow)],
    ['Later', all.filter((s) => s.check_in_date > tomorrow)],
  ].filter(([, list]) => list.length);

  const roomStatus = (roomId) => roomsData?.rooms.find((r) => r.id === roomId)?.status;

  const quickCheckIn = async (res) => {
    try {
      await checkIn.mutateAsync(res.id);
      toast(`${res.guest_name.split(' ')[0]} checked in to Room ${res.room_no}.`);
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <div className="panel">
      <div className="ph">
        <h2>
          Bookings <span className="muted mono" style={{ fontSize: 15 }}>{all.length}</span>
        </h2>
        <button className="btn dark" type="button" onClick={() => setSheet({ type: 'new' })}>
          + New booking
        </button>
      </div>

      {all.length ? (
        groups.map(([title, list]) => (
          <div key={title}>
            <div className="grp">
              {title} · {list.length}
            </div>
            <ul className="blist">
              {list.map((s) => {
                const nights = nightsBetween(s.check_in_date, s.check_out_date);
                const st = roomStatus(s.room_id);
                const canIn = s.check_in_date <= today && st === 'booked';
                return (
                  <li key={s.id}>
                    <span className="bno">{s.booking_code}</span>
                    <span className="rtag">{s.room_no}</span>
                    <div className="who">
                      <b>{s.guest_name}</b>
                      <span className="mono">{s.guest_phone}</span>
                      <span>
                        {' '}
                        · {fd(s.check_in_date)} → {fd(s.check_out_date)} · {nights} day{nights > 1 ? 's' : ''} · {s.persons} person
                        {s.persons > 1 ? 's' : ''} · advance {inr(s.advance_amount)}
                      </span>
                      {s.check_in_date <= today && !canIn && (
                        <span style={{ color: 'var(--mnt)' }}> · Room {st === 'occupied' ? 'still occupied' : 'not ready'}</span>
                      )}
                    </div>
                    {canIn && (
                      <button className="btn go sm" type="button" disabled={checkIn.isPending} onClick={() => quickCheckIn(s)}>
                        Guest came · Check in
                      </button>
                    )}
                    <button className="btn sm" type="button" onClick={() => setSheet({ type: 'open', id: s.id })}>
                      Open
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      ) : (
        <div className="empty">No bookings. Tap "New booking" when a guest calls or comes to book.</div>
      )}

      {sheet?.type === 'new' && <NewBookingSheet onClose={() => setSheet(null)} />}
      {sheet?.type === 'open' && (
        <BookingDetailSheet
          reservationId={sheet.id}
          onClose={() => setSheet(null)}
          onCheckIn={(reservation) => setSheet({ type: 'checkinFrom', reservation })}
          onEdit={(reservation) => setSheet({ type: 'edit', reservation })}
        />
      )}
      {sheet?.type === 'checkinFrom' && <CheckInSheet reservation={sheet.reservation} onClose={() => setSheet(null)} />}
      {sheet?.type === 'edit' && <NewBookingSheet editReservation={sheet.reservation} onClose={() => setSheet(null)} />}
    </div>
  );
}
