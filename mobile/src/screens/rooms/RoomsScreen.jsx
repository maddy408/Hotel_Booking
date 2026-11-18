import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import RoomTile from '../../components/RoomTile.jsx';
import DirectCheckInPicker from '../../components/sheets/DirectCheckInPicker.jsx';
import RoomDetailsSheet from '../../components/sheets/RoomDetailsSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import HousekeepingSheet from '../../components/sheets/HousekeepingSheet.jsx';
import NewBookingSheet from '../../components/sheets/NewBookingSheet.jsx';
import RoomCalendar from '../../components/RoomCalendar.jsx';
import { useRooms } from '../../api/rooms';
import { todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

const STATUS_ORDER = ['free', 'booked', 'occupied', 'cleaning', 'repair'];
const STATUS_LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair' };

function roomMatchesFilter(r, f) {
  if (!f) return true;
  if (f === 'booked') return r.status === 'booked' || r.hasPendingBooking === true;
  return r.status === f;
}

export default function RoomsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useRooms();
  const [filter, setFilter] = useState(null);
  const [sheet, setSheet] = useState(null);

  const rooms = data?.rooms || [];
  const today = todayIso();

  const counts = useMemo(() => {
    const c = { free: 0, booked: 0, occupied: 0, cleaning: 0, repair: 0 };
    const leaving = rooms.filter((r) => r.status === 'occupied' && r.checkoutPlanned <= today).length;
    rooms.forEach((r) => { if (c[r.status] !== undefined) c[r.status]++; });
    return { ...c, leaving };
  }, [rooms, today]);

  const floors = useMemo(() => {
    const filtered = rooms.filter((r) => roomMatchesFilter(r, filter));
    const byFloor = {};
    filtered.forEach((r) => { (byFloor[r.floor] ??= []).push(r); });
    return Object.keys(byFloor)
      .sort((a, b) => Number(a) - Number(b))
      .map((f) => ({ floor: Number(f), rooms: byFloor[f].sort((a, b) => a.roomNo - b.roomNo) }));
  }, [rooms, filter]);

  if (isLoading) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen>
        <ErrorState message={error?.message} onRetry={refetch} />
      </Screen>
    );
  }

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <View style={styles.actionBar}>
        <Button title="+ Direct Check-in" variant="success" size="sm" onPress={() => setSheet({ type: 'direct' })} style={{ flex: 1 }} />
        <Button title="+ Pre Booking" variant="primary" size="sm" onPress={() => setSheet({ type: 'newBooking' })} style={{ flex: 1 }} />
      </View>

      <RoomCalendar style={{ marginBottom: 12 }} />

      <View style={styles.countGrid}>
        {STATUS_ORDER.map((s) => {
          const active = filter === s;
          return (
            <Pressable
              key={s}
              style={[styles.countCard, active && { borderColor: colors.primary, borderWidth: 2 }]}
              onPress={() => setFilter(active ? null : s)}
            >
              <Text style={styles.countNum}>{counts[s]}</Text>
              <Text style={styles.countLabel}>{STATUS_LABEL[s]}</Text>
              {s === 'occupied' && counts.leaving > 0 ? <Text style={styles.countSub}>{counts.leaving} leaving today</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {floors.map(({ floor, rooms: floorRooms }) => (
        <View key={floor} style={{ marginTop: 6 }}>
          <Text style={styles.floorLabel}>{floor === 0 ? 'Ground Floor' : `Floor ${floor}`}</Text>
          <View style={styles.tileGrid}>
            {floorRooms.map((r) => (
              <RoomTile
                key={r.id}
                room={r}
                onPress={() => setSheet({ type: 'roomDetails', room: r })}
                onOpenBooking={(bookingId) => setSheet({ type: 'booking', reservationId: bookingId })}
              />
            ))}
          </View>
        </View>
      ))}

      {floors.length === 0 ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.body, color: colors.textSecondary }}>No rooms match this filter.</Text>
        </View>
      ) : null}

      {/* Visual availability calendar (frontend's RoomCalendar.jsx) is not ported yet —
          see MOBILE_IMPLEMENTATION_PROGRESS.md. All booking/check-in/checkout workflows
          below are fully functional against the live backend. */}

      {sheet?.type === 'direct' && (
        <DirectCheckInPicker rooms={rooms} onClose={() => setSheet(null)} onPick={(room) => setSheet({ type: 'checkin', room })} />
      )}
      {sheet?.type === 'roomDetails' && (
        <RoomDetailsSheet
          room={sheet.room}
          onClose={() => setSheet(null)}
          onViewStay={() => setSheet(null)}
          onEarlyCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'early' })}
          onCheckout={(stayId) => setSheet({ type: 'checkout', stayId })}
          onViewBooking={(reservationId) => setSheet({ type: 'booking', reservationId })}
          onCheckIn={(roomOrReservation) =>
            sheet.room.status === 'booked'
              ? setSheet({ type: 'checkin-from-reservation', reservation: roomOrReservation })
              : setSheet({ type: 'checkin', room: roomOrReservation })
          }
          onPreBook={(room) => setSheet({ type: 'newBooking', presetRoom: room })}
        />
      )}
      {sheet?.type === 'checkin' && <CheckInSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkin-from-reservation' && <CheckInSheet reservation={sheet.reservation} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkout' && <CheckoutSheet stayId={sheet.stayId} initialMode={sheet.initialMode} onClose={() => setSheet(null)} />}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.reservationId}
          onClose={() => setSheet(null)}
          onCheckIn={(reservation) => setSheet({ type: 'checkin-from-reservation', reservation })}
          onEdit={(reservation) => setSheet({ type: 'editBooking', editReservation: reservation })}
        />
      )}
      {sheet?.type === 'housekeeping' && <HousekeepingSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {(sheet?.type === 'newBooking' || sheet?.type === 'editBooking') && (
        <NewBookingSheet editReservation={sheet.editReservation} onClose={() => setSheet(null)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  countCard: {
    flexGrow: 1, minWidth: '18%', backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1,
    borderColor: colors.cardBorder, padding: 10, alignItems: 'center',
  },
  countNum: { fontFamily: fonts.display, fontSize: 20, color: colors.heading },
  countLabel: { fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.textSecondary },
  countSub: { fontFamily: fonts.body, fontSize: 9.5, color: colors.warning, marginTop: 2 },
  floorLabel: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary, marginBottom: 8, marginTop: 4 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
