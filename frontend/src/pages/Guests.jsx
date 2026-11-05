import { useState } from 'react';
import { useGuests } from '../api/guests';
import { useRooms } from '../api/rooms';
import GuestProfileSheet from '../components/sheets/GuestProfileSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import { fd } from '../lib/format';

export default function Guests() {
  const [q, setQ] = useState('');
  const { data: guests, isLoading, isError, error, refetch } = useGuests(q);
  const { data: roomsData } = useRooms();
  const [sheet, setSheet] = useState(null);

  const openRoomByNo = (roomNo) => {
    const room = roomsData?.rooms.find((r) => r.roomNo === roomNo);
    if (room?.stayId) setSheet({ type: 'checkout', stayId: room.stayId });
  };

  return (
    <div className="panel">
      <div className="ph">
        <h2>
          Guests <span className="muted mono" style={{ fontSize: 15 }}>{guests?.length ?? ''}</span>
        </h2>
        <input
          type="search"
          placeholder="Search name or mobile"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 'min(280px, 100%)' }}
          aria-label="Search guests"
        />
      </div>

      {isLoading ? (
        <div className="sb">
          <div className="skel" style={{ height: 200 }} />
        </div>
      ) : isError ? (
        <div className="empty">
          Could not load guests: {error.message}
          <div style={{ marginTop: 10 }}>
            <button className="btn sm" type="button" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="tw">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>ID proof</th>
                <th>City</th>
                <th className="r">Visits</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              {guests.length ? (
                guests.map((g) => (
                  <tr key={g.id} onClick={() => setSheet({ type: 'profile', id: g.id })}>
                    <td>
                      <b>{g.name}</b>
                    </td>
                    <td className="mono">{g.phone}</td>
                    <td>
                      {g.idProofType} <span className="mono muted">{g.idProofMasked || '—'}</span>
                    </td>
                    <td>{g.city || '—'}</td>
                    <td className="r mono">{g.visits}</td>
                    <td>
                      {g.now?.type === 'in_house' ? (
                        <span className="tag s-occupied">Room {g.now.roomNo}</span>
                      ) : g.now?.type === 'booked' ? (
                        <span className="tag s-booked">Booked {fd(g.now.bookingDate)}</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty">
                    No guest found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {sheet?.type === 'profile' && (
        <GuestProfileSheet
          guestId={sheet.id}
          onClose={() => setSheet(null)}
          onNewBooking={(guest) => setSheet({ type: 'newBooking', guest })}
          onOpenRoomNo={(roomNo) => openRoomByNo(roomNo)}
        />
      )}
      {sheet?.type === 'newBooking' && <NewBookingSheet presetGuest={sheet.guest} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkout' && <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />}
    </div>
  );
}
