import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import NewBookingSheet from '../../components/sheets/NewBookingSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import { useReservations } from '../../api/reservations';
import { useRooms } from '../../api/rooms';
import { addDaysIso, fd, inr, nightsBetween, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function BookingsScreen() {
  const { data: reservations, isLoading, isError, error, refetch, isRefetching } = useReservations();
  const { data: roomsData } = useRooms();
  const [sheet, setSheet] = useState(null);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

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

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings <Text style={styles.count}>{all.length}</Text></Text>
        <Button title="+ New Booking" variant="primary" size="sm" onPress={() => setSheet({ type: 'new' })} />
      </View>

      {all.length ? (
        groups.map(([title, list]) => (
          <View key={title} style={{ marginBottom: 10 }}>
            <Text style={styles.groupLabel}>{title} · {list.length}</Text>
            {list.map((s) => {
              const nights = nightsBetween(s.check_in_date, s.check_out_date);
              const out = addDaysIso(today, nights);
              const r = getRoom(s.room_id);
              const hkStatus = r?.housekeepingStatus || s.housekeeping_status || 'ok';
              const isOccupied = r?.status === 'occupied';
              const isMaintenance = hkStatus === 'repair';
              const isReady = hkStatus === 'ok';
              const isLateArrival = s.status === 'pending' && (s.check_in_date < today || s.check_out_date <= today);
              const lateArrivalConflict = isLateArrival
                ? all.find((o) => o.id !== s.id && Number(o.room_id) === Number(s.room_id) && o.status === 'pending' && o.check_in_date < out && today < o.check_out_date)
                : null;
              const canIn = s.check_in_date <= today && !isOccupied && !isMaintenance && isReady && !lateArrivalConflict;

              return (
                <Pressable key={s.id} style={styles.row} onPress={() => setSheet({ type: 'open', id: s.id })}>
                  <View style={styles.rowTop}>
                    <Text style={styles.bookingCode}>{s.booking_code}</Text>
                    <View style={styles.roomTag}><Text style={styles.roomTagText}>{s.room_no}</Text></View>
                  </View>
                  <Text style={styles.guestName}>{s.guest_name}</Text>
                  <Text style={styles.meta}>
                    {s.guest_phone} · {fd(s.check_in_date)} → {fd(s.check_out_date)} · {nights}n · {s.persons}p
                    {Number(s.advance_paid) > 0 ? ` · advance ${inr(s.advance_paid)}` : ' · advance not paid'}
                  </Text>
                  <Text style={[styles.status, { color: lateArrivalConflict ? colors.danger : isOccupied ? colors.info : isMaintenance ? colors.danger : isReady ? colors.success : colors.cleaning }]}>
                    {lateArrivalConflict ? `Date conflict (${lateArrivalConflict.booking_code})` : isOccupied ? 'Room still occupied' : isMaintenance ? 'Room under maintenance' : isReady ? 'Room ready' : 'Room not ready (cleaning)'}
                  </Text>
                  {canIn ? (
                    <Button
                      title="Guest came · Check in" variant="success" size="sm"
                      onPress={() => setSheet({ type: 'checkinFrom', reservation: s })}
                      style={{ marginTop: 6, alignSelf: 'flex-start' }}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No bookings. Tap "New Booking" when a guest calls or comes to book.</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading },
  count: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary },
  groupLabel: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  bookingCode: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
  roomTag: { backgroundColor: colors.secondaryLight, borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 2 },
  roomTagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  guestName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  status: { fontFamily: fonts.bodySemibold, fontSize: 11.5, marginTop: 4 },
  empty: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
});
