import { useMemo, useState } from 'react';
import { useRooms } from '../api/rooms';
import { useReservations } from '../api/reservations';
import { useDoneStays } from '../api/stays';
import { useSettings } from '../api/settings';
import { isRoomOverdue } from '../lib/overdue';
import { todayIso, fdWithYear, addDaysIso } from '../lib/format';
import RoomTile from '../components/RoomTile.jsx';
import CheckInSheet from '../components/sheets/CheckInSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';
import HousekeepingSheet from '../components/sheets/HousekeepingSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import DirectCheckInPicker from '../components/sheets/DirectCheckInPicker.jsx';
import RoomDetailsSheet from '../components/sheets/RoomDetailsSheet.jsx';
import StayDetailSheet from '../components/sheets/StayDetailSheet.jsx';
import RoomCalendar from '../components/RoomCalendar.jsx';

const LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair', overdue: 'Overdue' };
const FLOOR_NAME = (f) => (Number(f) === 0 ? 'Ground floor' : `Floor ${f}`);

function toIsoString(date) {
  if (!date) return todayIso();
  if (typeof date === 'string') return date.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const COUNT_ICONS = {
  free: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14" />
      <path d="M2 20h20" />
      <circle cx="14" cy="12" r="1" fill="currentColor" />
    </svg>
  ),
  booked: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  occupied: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
    </svg>
  ),
  cleaning: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 4-3 3 5 5 3-3a2.12 2.12 0 0 0 0-3l-2-2a2.12 2.12 0 0 0-3 0Z" />
      <path d="m9.5 9.5-6.5 6.5A2.12 2.12 0 0 0 2 17.5V22h4.5a2.12 2.12 0 0 0 1.5-.59l6.5-6.5" />
      <path d="m14 10 4 4" />
    </svg>
  ),
  repair: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  overdue: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

export default function Rooms() {
  const { data, isLoading, isError, error, refetch } = useRooms();
  const { data: reservations = [] } = useReservations();
  const { data: doneStays = [] } = useDoneStays();
  const { data: settingsData } = useSettings();

  const [selectedDateObj, setSelectedDateObj] = useState(() => new Date());
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null);

  const baseRooms = data?.rooms || [];
  const today = todayIso();
  const selectedDateIso = toIsoString(selectedDateObj);
  const isTodaySelected = selectedDateIso === today;

  // Compute room status & tile metadata dynamically for selectedDateIso (matching mobile)
  const rooms = useMemo(() => {
    if (!baseRooms.length) return [];
    let computedRooms;
    if (isTodaySelected) {
      computedRooms = baseRooms;
    } else {
      const isPast = selectedDateIso < today;

      computedRooms = baseRooms.map((room) => {
        const roomId = Number(room.id);

        // 1. Check if occupied on selectedDateIso
        let activeStay = null;

        if (!isPast) {
          if (room.status === 'occupied' && room.stayId) {
            const inDate = room.checkInDate || today;
            const outDate = room.checkoutPlanned || '9999-12-31';
            if (inDate <= selectedDateIso && selectedDateIso < outDate) {
              activeStay = {
                stayId: room.stayId,
                guestName: room.guestName,
                persons: room.persons || 1,
                checkoutPlanned: room.checkoutPlanned,
              };
            }
          }
        } else {
          if (Array.isArray(doneStays)) {
            const foundDone = doneStays.find((s) => {
              if (Number(s.room_id) !== roomId) return false;
              const inDate = (s.check_in_date || '').slice(0, 10);
              const outDate = (s.checkout_actual || s.checkout_planned || '').slice(0, 10);
              return inDate <= selectedDateIso && selectedDateIso < outDate;
            });
            if (foundDone) {
              activeStay = {
                stayId: foundDone.id,
                guestName: foundDone.guest_name,
                persons: foundDone.persons || 1,
                checkoutPlanned: (foundDone.checkout_actual || foundDone.checkout_planned || '').slice(0, 10),
              };
            }
          }

          if (!activeStay && room.status === 'occupied' && room.stayId) {
            const inDate = room.checkInDate || today;
            const outDate = room.checkoutPlanned || '9999-12-31';
            if (inDate <= selectedDateIso && selectedDateIso < outDate) {
              activeStay = {
                stayId: room.stayId,
                guestName: room.guestName,
                persons: room.persons || 1,
                checkoutPlanned: room.checkoutPlanned,
              };
            }
          }
        }

        if (activeStay) {
          return {
            ...room,
            status: 'occupied',
            stayId: activeStay.stayId,
            guestName: activeStay.guestName,
            persons: activeStay.persons,
            checkoutPlanned: activeStay.checkoutPlanned,
            hasPendingBooking: false,
            pendingBooking: null,
          };
        }

        // 2. Check reservations overlapping selectedDateIso
        if (Array.isArray(reservations)) {
          const matchingRes = reservations.find((res) => {
            if (Number(res.room_id) !== roomId) return false;
            if (res.status !== 'pending') return false;
            const inDate = (res.check_in_date || '').slice(0, 10);
            const outDate = (res.check_out_date || '').slice(0, 10);
            return inDate <= selectedDateIso && selectedDateIso < outDate;
          });

          if (matchingRes) {
            return {
              ...room,
              status: 'booked',
              guestName: matchingRes.guest_name,
              persons: matchingRes.persons || 1,
              bookingId: matchingRes.id,
              bookingCode: matchingRes.booking_code,
              bookingCheckIn: matchingRes.check_in_date,
              hasPendingBooking: true,
              pendingBooking: {
                id: matchingRes.id,
                bookingCode: matchingRes.booking_code,
                guestName: matchingRes.guest_name,
                checkInDate: matchingRes.check_in_date,
                checkOutDate: matchingRes.check_out_date,
                persons: matchingRes.persons || 1,
              },
            };
          }
        }

        // 3. Maintenance / Housekeeping
        if (room.housekeepingStatus === 'repair') {
          return {
            ...room,
            status: 'repair',
            guestName: null,
            persons: 0,
            stayId: null,
            hasPendingBooking: false,
            pendingBooking: null,
          };
        }

        return {
          ...room,
          status: 'free',
          guestName: null,
          persons: 0,
          stayId: null,
          hasPendingBooking: false,
          pendingBooking: null,
        };
      });
    }

    return computedRooms.map((room) => ({
      ...room,
      isOverdue: isRoomOverdue(room, settingsData),
    }));
  }, [baseRooms, reservations, doneStays, selectedDateIso, today, isTodaySelected, settingsData]);

  const floors = useMemo(() => {
    if (!rooms.length) return [];
    const set = new Set(rooms.map((r) => r.floor));
    return [...set].sort((a, b) => a - b);
  }, [rooms]);

  if (isLoading) {
    return (
      <div className="mgrid">
        <div className="actbar">
          <div className="skel" style={{ height: 52 }} />
          <div className="skel" style={{ height: 52 }} />
        </div>
        <div className="counts">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="skel" key={i} style={{ height: 72 }} />
          ))}
        </div>
        <div className="rooms">
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="skel" key={i} style={{ height: 116 }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="panel empty">
        Could not load rooms: {error.message}
        <div style={{ marginTop: 10 }}>
          <button className="btn sm dark" type="button" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const overdueCount = rooms.filter((r) => r.status === 'occupied' && (r.isOverdue || (r.checkoutPlanned && r.checkoutPlanned.slice(0, 10) < today))).length;
  const leaving = rooms.filter((r) => r.status === 'occupied' && (r.dueToday || (r.checkoutPlanned && r.checkoutPlanned.slice(0, 10) === selectedDateIso))).length;

  const displayCounts = useMemo(() => {
    const c = { free: 0, booked: 0, occupied: 0, cleaning: 0, repair: 0, overdue: 0 };
    rooms.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status]++;
      if (r.isOverdue) c.overdue++;
    });
    return c;
  }, [rooms]);

  const roomMatchesFilter = (r, f) => {
    if (f === 'all') return true;
    if (f === 'booked') return r.status === 'booked' || r.hasPendingBooking === true;
    if (f === 'occupied') return r.status === 'occupied';
    if (f === 'overdue') return Boolean(r.isOverdue);
    return r.status === f;
  };

  const sub = {
    free: 'Ready to give',
    booked: 'Active booking',
    occupied: overdueCount > 0
      ? `${overdueCount} overdue${leaving > 0 ? ` · ${leaving} leaving` : ''}`
      : leaving > 0
        ? `${leaving} leaving today`
        : 'Ongoing stay',
    cleaning: 'Being cleaned',
    repair: 'Not usable',
    overdue: 'Exceeded checkout',
  };

  const openRoom = (room) => {
    setSheet({ type: 'roomDetails', room });
  };

  const matchingRoomsCount = rooms.filter((r) => roomMatchesFilter(r, filter)).length;

  return (
    <div>
      {/* 1. Primary Action Buttons */}
      <div className="actbar">
        <button className="btn go big" type="button" onClick={() => setSheet({ type: 'direct' })}>
          <span className="act-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
              <path d="M7 21v-4l2-3 2 1.5V21" />
              <path d="m14 11 3 3v7" />
              <path d="M9 13.5 13 8l3 2.5" />
            </svg>
          </span>
          <span>+ Direct Check-in <span style={{ fontWeight: 500, opacity: 0.88 }}>(walk-in guest)</span></span>
        </button>

        <button className="btn dark big" type="button" onClick={() => setSheet({ type: 'newBooking' })}>
          <span className="act-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="12" y1="14" x2="12" y2="18" />
              <line x1="10" y1="16" x2="14" y2="16" />
            </svg>
          </span>
          <span>+ Pre Booking <span style={{ fontWeight: 500, opacity: 0.88 }}>(for later date)</span></span>
        </button>
      </div>

      {/* Date banner indicating dynamic view */}
      <div
        className="room-date-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          marginTop: 12,
          marginBottom: 12,
          background: isTodaySelected ? 'var(--color-surface, #ffffff)' : '#FFFBEB',
          border: `1px solid ${isTodaySelected ? 'var(--color-border, #EAE4EF)' : '#FCD34D'}`,
          borderRadius: '8px',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div>
          <strong style={{ fontSize: '14px', color: isTodaySelected ? 'var(--color-heading, #1E1B4B)' : '#92400E' }}>
            {isTodaySelected ? 'Today’s Room Status' : `Room Status: ${fdWithYear(selectedDateIso)}`}
          </strong>
          <div style={{ fontSize: '12px', color: 'var(--color-muted, #64748B)', marginTop: '2px' }}>
            {isTodaySelected ? 'Real-time live status' : `${selectedDateIso < today ? 'Past' : 'Projected'} availability for selected date`}
          </div>
        </div>
        {!isTodaySelected && (
          <button
            type="button"
            className="btn sm"
            style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: '#F59E0B', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            onClick={() => setSelectedDateObj(new Date())}
          >
            Reset to Today
          </button>
        )}
      </div>

      {/* 2. Room Statistics (6 Status Cards) */}
      <div className="counts">
        {Object.keys(LABEL).map((k) => (
          <button
            key={k}
            type="button"
            className={`count s-${k}`}
            aria-pressed={filter === k}
            onClick={() => setFilter(filter === k ? 'all' : k)}
            title={`Filter rooms by ${LABEL[k]}`}
          >
            <div className="count-icon-box" style={{ color: `var(--color-${k === 'free' ? 'success' : k === 'booked' ? 'warning' : k === 'occupied' ? 'info' : k === 'cleaning' ? 'cleaning' : 'danger'})` }}>
              {COUNT_ICONS[k]}
            </div>
            <span className="n">{displayCounts[k]}</span>
            <span className="l">
              <b>{LABEL[k]}</b>
              <span>{sub[k]}</span>
            </span>
            <span className="count-arrow" aria-hidden="true">→</span>
          </button>
        ))}
      </div>

      {/* 3. Rooms Content Layout: Left Section (Room Cards ~72-75%) + Right Section (Compact Calendar ~25-28%) */}
      <div className="rooms-content-layout">
        <div className="rooms-grid-column">
          {/* Room Interaction Instructions */}
          <div className="hint">
            <span>
              <span className="hint-dot free-dot" aria-hidden="true" />
              Tap any room tile to view Room Details, guest & stay information, or room actions.
            </span>
            {filter !== 'all' && (
              <button className="btn sm clear" type="button" onClick={() => setFilter('all')}>
                Show all {rooms.length} rooms
              </button>
            )}
          </div>

          {!rooms.length && <div className="panel empty">No rooms yet. Add your rooms in the Room Master tab.</div>}
          {rooms.length > 0 && filter !== 'all' && matchingRoomsCount === 0 && (
            <div className="panel empty">No {LABEL[filter]?.toLowerCase() || filter} rooms.</div>
          )}

          {/* Floor-wise Room Cards */}
          {floors.map((f) => {
            const rs = rooms.filter((r) => r.floor === f && roomMatchesFilter(r, filter)).sort((a, b) => a.roomNo - b.roomNo);
            if (!rs.length) return null;
            return (
              <div className="floor" key={f}>
                <div className="floor-header">
                  <span className="floor-badge">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                      <path d="M10 6h4" />
                      <path d="M10 10h4" />
                      <path d="M10 14h4" />
                      <path d="M10 18h4" />
                    </svg>
                    {FLOOR_NAME(f)}
                  </span>
                  <span className="floor-count-pill">{rs.length} Rooms</span>
                </div>

                <div className="rooms">
                  {rs.map((r) => (
                    <RoomTile
                      key={r.id}
                      room={r}
                      onClick={() => openRoom(r)}
                      onOpenBooking={(bookingId) => setSheet({ type: 'booking', reservationId: bookingId })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Calendar on the Right side of the Rooms Dashboard */}
        <aside className="rooms-calendar-column" aria-label="Monthly Calendar View">
          <RoomCalendar
            initialDate={selectedDateObj}
            onDateSelect={(d) => setSelectedDateObj(d)}
          />
        </aside>
      </div>

      {sheet?.type === 'direct' && (
        <DirectCheckInPicker
          rooms={rooms}
          checkIn={today}
          checkOut={addDaysIso(today, 1)}
          onClose={() => setSheet(null)}
          onPick={(room) => setSheet({ type: 'checkin', room })}
        />
      )}
      {sheet?.type === 'roomDetails' && (
        <RoomDetailsSheet
          room={sheet.room}
          onClose={() => setSheet(null)}
          onViewStay={(stayId) => setSheet({ type: 'stay', stayId })}
          onEarlyCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'early' })}
          onCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'checkout' })}
          onViewBooking={(bookingId) => setSheet({ type: 'booking', reservationId: bookingId })}
          onCheckIn={(roomOrRes) => {
            if (roomOrRes?.booking_code) {
              setSheet({
                type: 'checkin-from-reservation',
                reservation: roomOrRes,
                triggerAdvanceError: Number(roomOrRes.advance_paid ?? 0) <= 0,
              });
            } else {
              setSheet({ type: 'checkin', room: roomOrRes });
            }
          }}
          onPreBook={(room) => setSheet({ type: 'newBooking', preSelectedRoom: room })}
        />
      )}
      {sheet?.type === 'stay' && (
        <StayDetailSheet
          stayId={sheet.stayId}
          onClose={() => setSheet(null)}
          onCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'checkout' })}
          onEarlyCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'early' })}
        />
      )}
      {sheet?.type === 'checkin' && <CheckInSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkin-from-reservation' && <CheckInSheet reservation={sheet.reservation} triggerAdvanceError={sheet.triggerAdvanceError} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkout' && (
        <CheckoutSheet
          stayId={sheet.stayId}
          initialMode={sheet.initialMode}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.reservationId}
          onClose={() => setSheet(null)}
          onCheckIn={(reservation) => setSheet({ type: 'checkin-from-reservation', reservation, triggerAdvanceError: Number(reservation.advance_paid ?? 0) <= 0 })}
          onEdit={(reservation) => setSheet({ type: 'editBooking', reservation })}
        />
      )}
      {sheet?.type === 'housekeeping' && <HousekeepingSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {sheet?.type === 'newBooking' && (
        <NewBookingSheet
          preSelectedRoom={sheet.preSelectedRoom}
          editReservation={sheet.preSelectedRoom ? { room_id: sheet.preSelectedRoom.id, max_persons: sheet.preSelectedRoom.max_persons } : null}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'editBooking' && <NewBookingSheet editReservation={sheet.reservation} onClose={() => setSheet(null)} />}
    </div>
  );
}
