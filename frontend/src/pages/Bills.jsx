import { useState } from 'react';
import { useDoneStays } from '../api/stays';
import GuestProfileSheet from '../components/sheets/GuestProfileSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import { useRooms } from '../api/rooms';
import { fd, inr, todayIso } from '../lib/format';

export default function Bills() {
  const { data: stays, isLoading, isError, error, refetch } = useDoneStays();
  const { data: roomsData } = useRooms();
  const [sheet, setSheet] = useState(null);

  if (isLoading) {
    return (
      <div className="panel">
        <div className="sb">
          <div className="skel" style={{ height: 160 }} />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="panel empty">
        Could not load bills: {error.message}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm" type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const today = todayIso();
  const done = [...stays].sort((a, b) => b.checkout_actual.localeCompare(a.checkout_actual) || b.id - a.id);
  const todaysBills = done.filter((s) => s.checkout_actual === today);
  const tTotal = todaysBills.reduce((a, s) => a + Number(s.invoice_total || 0), 0);

  const openRoomByNo = (roomNo) => {
    const room = roomsData?.rooms.find((r) => r.roomNo === roomNo);
    if (room?.stayId) setSheet({ type: 'checkout', stayId: room.stayId });
  };

  return (
    <>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="ph">
          <h2>Today</h2>
          <span className="muted">{fd(today)}</span>
        </div>
        <div className="sumrow" style={{ padding: '14px 16px' }}>
          <div>
            <span>Check-outs</span>
            <b className="mono">{todaysBills.length}</b>
          </div>
          <div>
            <span>Billed at check-out</span>
            <b className="mono">{inr(tTotal)}</b>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="ph">
          <h2>All bills</h2>
        </div>
        <div className="tw">
          <table className="data">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Guest</th>
                <th>Room</th>
                <th>Stay</th>
                <th className="r">Total</th>
                <th>Paid by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {done.length ? (
                done.map((s) => (
                  <tr key={s.id} onClick={() => setSheet({ type: 'guest', guestId: s.guest_id })}>
                    <td className="mono">{s.invoice_number || `#${s.id}`}</td>
                    <td>
                      <b>{s.guest_name}</b>
                    </td>
                    <td className="mono">{s.room_no}</td>
                    <td>
                      {fd(s.check_in_date)} → {fd(s.checkout_actual)}
                    </td>
                    <td className="r mono">{inr(s.invoice_total)}</td>
                    <td>{s.payment_method?.toUpperCase()}</td>
                    <td>
                      <a
                        className="btn sm"
                        href={`/print/invoice/${s.id}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Print
                      </a>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="empty">
                    No bills yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sheet?.type === 'guest' && (
        <GuestProfileSheet
          guestId={sheet.guestId}
          onClose={() => setSheet(null)}
          onNewBooking={(guest) => setSheet({ type: 'newBooking', guest })}
          onOpenRoomNo={(roomNo) => openRoomByNo(roomNo)}
        />
      )}
      {sheet?.type === 'newBooking' && <NewBookingSheet presetGuest={sheet.guest} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkout' && <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />}
    </>
  );
}
