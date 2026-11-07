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

  const getRoom = (roomId) => roomsData?.rooms.find((r) => r.id === roomId);

  const quickCheckIn = async (res) => {
    const r = getRoom(res.room_id);
    const hkStatus = r?.housekeepingStatus || r?.housekeeping_status || res.housekeeping_status || 'ok';
    if (hkStatus !== 'ok' || r?.status === 'occupied') {
      setSheet({ type: 'open', id: res.id });
      return;
    }
    const advancePaid = Number(res.advance_paid ?? 0);
    if (advancePaid <= 0) {
      setSheet({ type: 'checkinFrom', reservation: res, triggerAdvanceError: true });
      return;
    }
    try {
      await checkIn.mutateAsync(res.id);
      toast(`${res.guest_name.split(' ')[0]} checked in to Room ${res.room_no}.`);
    } catch (err) {
      if (err.fields?.room || err.fields?.housekeepingStatus || err.message?.includes('not ready') || err.message?.includes('maintenance')) {
        setSheet({ type: 'open', id: res.id });
        toast(err.message);
        return;
      }
      if (err.fields?.advanceAmount || err.message?.includes('advance amount before check-in') || err.message?.includes('Advance payment is required') || err.message?.includes('advance')) {
        setSheet({ type: 'checkinFrom', reservation: res, triggerAdvanceError: true });
        return;
      }
      if (err.fields?.persons || err.message?.includes('allows a maximum of')) {
        setSheet({ type: 'checkinFrom', reservation: res });
        return;
      }
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
                const r = getRoom(s.room_id);
                const hkStatus = r?.housekeepingStatus || r?.housekeeping_status || s.housekeeping_status || 'ok';
                const isOccupied = r?.status === 'occupied';
                const isMaintenance = hkStatus === 'repair';
                const isReady = hkStatus === 'ok';
                const isNotReady = !isReady && !isMaintenance;
                const canIn = s.check_in_date <= today && !isOccupied && !isMaintenance && isReady;
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
                        {s.persons > 1 ? 's' : ''}{Number(s.advance_paid) > 0 ? ` · advance ${inr(s.advance_paid)}` : ' · advance not paid'}
                      </span>
                      {isOccupied ? (
                        <span style={{ color: 'var(--occ)' }}> · Room still occupied</span>
                      ) : isMaintenance ? (
                        <span style={{ color: 'var(--mnt)' }}> · Room under maintenance</span>
                      ) : isNotReady ? (
                        <span style={{ color: 'var(--cln)' }}> · Room not ready (cleaning)</span>
                      ) : (
                        <span style={{ color: 'var(--ok)' }}> · Room ready</span>
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
          onCheckIn={(reservation) => setSheet({ type: 'checkinFrom', reservation, triggerAdvanceError: Number(reservation.advance_paid ?? 0) <= 0 })}
          onEdit={(reservation) => setSheet({ type: 'edit', reservation })}
        />
      )}
      {sheet?.type === 'checkinFrom' && (
        <CheckInSheet
          reservation={sheet.reservation}
          triggerAdvanceError={sheet.triggerAdvanceError}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'edit' && <NewBookingSheet editReservation={sheet.reservation} onClose={() => setSheet(null)} />}
    </div>
  );
}
