import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { fd, todayIso } from '../lib/format';
import { colors, fonts, radii, statusColors } from '../theme/theme';

const LABEL = { free: 'FREE', booked: 'BOOKED', occupied: 'OCCUPIED', cleaning: 'CLEANING', repair: 'REPAIR' };

/** Ported 1:1 from frontend/src/components/RoomTile.jsx's meta/persons logic. */
export default function RoomTile({ room, onPress, onOpenBooking }) {
  const today = todayIso();
  const guestName = room.guestName ? room.guestName.trim() : '';
  const pendingGuest = room.pendingBooking?.guestName ? room.pendingBooking.guestName.split(' ')[0] : 'Guest';
  let meta = '';
  let due = false;

  if (room.status === 'occupied') {
    due = room.checkoutPlanned <= today;
    meta = due ? 'Leaving today' : 'Till ' + fd(room.checkoutPlanned);
  } else if (room.status === 'booked') {
    if (room.housekeepingStatus === 'repair') {
      meta = 'Maintenance · ' + (room.bookingCode || 'Booked');
    } else if (room.housekeepingStatus === 'cleaning') {
      meta = 'Not ready · ' + (room.bookingCode || 'Booked');
    } else {
      meta = room.bookingCode ? `${room.bookingCode} · Ready` : 'Ready';
    }
  } else if (room.status === 'free') {
    meta = room.nextBookingDate ? 'Booked ' + fd(room.nextBookingDate) : `₹${Math.round(room.roomType?.rate || 0)}`;
  } else if (room.status === 'repair') {
    meta = (room.note || '').split('.')[0] || 'Under repair';
  } else {
    meta = 'Mark ready when done';
  }

  let personsDisplay = '0 Persons';
  if (room.status === 'occupied') {
    const p = Math.max(1, Number(room.persons || 1));
    personsDisplay = `${p} ${p === 1 ? 'Person' : 'Persons'}`;
  } else if (room.status === 'booked') {
    const p = Math.max(1, Number(room.persons || room.pendingBooking?.persons || 1));
    personsDisplay = `${p} ${p === 1 ? 'Person' : 'Persons'}`;
  }

  const c = statusColors[room.status] || statusColors.free;

  return (
    <View style={[styles.tile, { borderColor: c.border, backgroundColor: c.bg }]}>
      <Pressable
        onPress={onPress}
        style={styles.tileMain}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={`Room ${room.roomNo}, ${room.roomType?.name || 'Room'}, ${room.status}`}
      >
        <View pointerEvents="none" style={styles.topRow}>
          <Text style={[styles.roomNo, { color: c.fg }]}>{room.roomNo}</Text>
          <Text style={styles.roomType} numberOfLines={1}>{room.roomType?.name || ''}</Text>
        </View>

        <View pointerEvents="none" style={styles.personsRow}>
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <Circle cx="12" cy="7" r="4" />
          </Svg>
          <Text style={styles.personsText}>{personsDisplay}</Text>
        </View>

        {(room.status === 'occupied' || room.status === 'booked') && guestName ? (
          <Text pointerEvents="none" style={styles.guest} numberOfLines={1}>Guest: {guestName}</Text>
        ) : null}

        <Text pointerEvents="none" style={[styles.meta, due && { color: colors.danger, fontWeight: '700' }]} numberOfLines={1}>{meta}</Text>

        <View pointerEvents="none" style={[styles.statusChip, { backgroundColor: c.fg }]}>
          <Text style={styles.statusChipText}>{LABEL[room.status] || room.status.toUpperCase()}</Text>
        </View>
      </Pressable>

      {room.hasPendingBooking && room.pendingBooking && room.status === 'occupied' && (
        <Pressable
          style={styles.conflict}
          onPress={() => onOpenBooking?.(room.pendingBooking.id)}
          accessibilityRole="button"
          accessibilityLabel={`Room conflict: booking ${room.pendingBooking.bookingCode}`}
        >
          <Text style={styles.conflictTitle} numberOfLines={1}>▲ {room.pendingBooking.bookingCode} · {pendingGuest}</Text>
          <Text style={styles.conflictDates} numberOfLines={1}>
            {fd(room.pendingBooking.checkInDate)} – {fd(room.pendingBooking.checkOutDate)}
          </Text>
          <Text style={styles.conflictAction}>Room conflict · View…</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48%',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  tileMain: {
    flex: 1,
    padding: 10,
    gap: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  roomNo: { fontFamily: fonts.display, fontSize: 18 },
  roomType: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, flexShrink: 1 },
  personsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  personsText: { fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.textSecondary },
  guest: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  conflict: {
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 0,
    padding: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  conflictTitle: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.danger },
  conflictDates: { fontFamily: fonts.body, fontSize: 10, color: colors.danger },
  conflictAction: { fontFamily: fonts.bodySemibold, fontSize: 10, color: colors.danger, marginTop: 1 },
  statusChip: { position: 'absolute', top: 8, right: 8, borderRadius: radii.xs, paddingHorizontal: 5, paddingVertical: 2 },
  statusChipText: { fontFamily: fonts.bodyBold, fontSize: 8.5, color: '#fff', letterSpacing: 0.3 },
});
