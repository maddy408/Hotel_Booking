import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { inr, fd, todayIso, addDaysIso } from '../../lib/format';
import { useFreeRooms } from '../../api/reservations';
import { BASE_URL } from '../../lib/apiClient';
import { colors, fonts, radii } from '../../theme/theme';

export default function DirectCheckInPicker({ rooms, checkIn: propCheckIn, checkOut: propCheckOut, onPick, onClose }) {
  const today = todayIso();
  const checkIn = propCheckIn || today;
  const checkOut = propCheckOut || addDaysIso(checkIn, 1);
  const freeRoomsQuery = useFreeRooms({ checkIn, checkOut });
  const freeRoomsData = freeRoomsQuery.data;

  // Authoritative availability calculation: freeRooms from API, fallback to rooms prop
  const effectiveRooms = freeRoomsData ?? rooms ?? [];

  // Diagnostic logging for Expo Go runtime verification
  if (__DEV__) {
    const fTotal = effectiveRooms.length;
    const f1_bookable = effectiveRooms.filter((r) => r.is_bookable === undefined || r.is_bookable === true).length;
    const f2_selection = effectiveRooms.filter((r) => (r.is_bookable === undefined || r.is_bookable === true) && (r.selection_allowed === undefined || r.selection_allowed === true)).length;
    const f3_available = effectiveRooms.filter((r) => (r.is_bookable === undefined || r.is_bookable === true) && (r.selection_allowed === undefined || r.selection_allowed === true) && (r.is_available === undefined || r.is_available === true)).length;
    const f4_nostay = effectiveRooms.filter((r) => (r.is_bookable === undefined || r.is_bookable === true) && (r.selection_allowed === undefined || r.selection_allowed === true) && (r.is_available === undefined || r.is_available === true) && !r.stayId && !r.current_stay && !r.stay_id).length;
    const f5_hk = effectiveRooms.filter((r) => (r.is_bookable === undefined || r.is_bookable === true) && (r.selection_allowed === undefined || r.selection_allowed === true) && (r.is_available === undefined || r.is_available === true) && !r.stayId && !r.current_stay && !r.stay_id && (r.housekeepingStatus || r.housekeeping_status || 'ok') === 'ok' && r.is_ready !== false).length;
    const f6_old_status_free = effectiveRooms.filter((r) => r.status === 'free').length;

    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] ========================================');
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 1. API Base URL:', BASE_URL);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 2. Check-in Date:', checkIn);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 3. Check-out Date:', checkOut);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 4. Query Status:', freeRoomsQuery.status, '| isLoading:', freeRoomsQuery.isLoading);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 5. API Response Count:', freeRoomsData?.length ?? 'none (fallback to rooms: ' + (rooms?.length ?? 0) + ')');
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 6. First Room Properties:', Object.keys(effectiveRooms[0] || {}));
    if (effectiveRooms[0]) {
      const sample = effectiveRooms[0];
      console.log('[DIRECT_CHECKIN_DIAGNOSTIC] Sample Room (' + (sample.room_no || sample.roomNo) + ') inspected fields:', {
        status: sample.status,
        booking_status: sample.booking_status,
        is_bookable: sample.is_bookable,
        selection_allowed: sample.selection_allowed,
        housekeepingStatus: sample.housekeepingStatus,
        housekeeping_status: sample.housekeeping_status,
        stayId: sample.stayId,
        stay_id: sample.stay_id,
        current_stay: sample.current_stay ? 'present' : null,
        card_badge: sample.card_badge,
      });
    }
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 7. Total Rooms Before Filtering:', fTotal);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] 8. Step-by-step Filter Breakdown:');
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC]    -> After is_bookable !== false:', f1_bookable);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC]    -> After selection_allowed !== false:', f2_selection);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC]    -> After is_available !== false:', f3_available);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC]    -> After no current_stay / stayId:', f4_nostay);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC]    -> After housekeeping === ok & is_ready !== false:', f5_hk);
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC]    -> (OLD BUGGY CHECK) r.status === "free":', f6_old_status_free, '(eliminated all rooms when r.status was undefined)');
    console.log('[DIRECT_CHECKIN_DIAGNOSTIC] ========================================');
  }

  const free = effectiveRooms
    .filter((r) => {
      // 1. Core bookability: must not be blocked by existing reservation or maintenance
      if (r.is_bookable === false) return false;
      if (r.selection_allowed === false) return false;
      if (r.is_available === false) return false;
      if (r.booking_status === 'unavailable' || r.booking_status === 'maintenance' || r.booking_status === 'available_not_ready') return false;

      // 2. Direct walk-in check-in requires a room that is physically unoccupied right now
      if (r.current_stay || !r.stayId ? false : true) return false;
      if (r.current_stay || r.stayId || r.stay_id) return false;

      // 3. Must be clean and ready
      if ((r.housekeepingStatus || r.housekeeping_status || 'ok') === 'ok') {
        // housekeeping is ok
      } else {
        return false;
      }
      if (r.is_ready === false) return false;

      // 4. Must not have blocked card badge
      const badge = r.card_badge || '';
      if (badge === 'Occupied' || badge === 'Booked' || badge === 'Overdue' || badge === 'Cleaning' || badge === 'Repair') {
        return false;
      }

      // 5. Exclude non-free status if present
      if (r.status !== 'occupied' && r.status !== 'cleaning' && r.status !== 'repair' && r.status !== 'booked') {
        // not blocked status
      } else {
        return false;
      }

      // 6. If status is provided, must be free; if omitted (as in /reservations/free-rooms), must be Ready
      if (r.status === 'free' || (!r.status && (badge === 'Ready' || r.booking_status === 'available_ready' || r.is_ready !== false))) {
        return true;
      }

      return false;
    })
    .map((r) => {
      const rawNext = r.nextBookingDate || r.next_reservation?.check_in_date;
      const validNext = (rawNext && rawNext >= today && rawNext >= checkIn) ? rawNext : null;
      return {
        ...r,
        id: r.id,
        roomNo: r.roomNo ?? Number(r.room_no),
        room_no: r.room_no ?? String(r.roomNo),
        floor: r.floor,
        roomType: r.roomType ?? {
          id: r.room_type_id,
          name: r.type_name,
          rate: r.type_rate,
          maxPersons: r.max_persons,
        },
        nextBookingDate: validNext,
      };
    })
    .sort((a, b) => (Number(a.roomNo || a.room_no) || 0) - (Number(b.roomNo || b.room_no) || 0));

  const byType = {};
  free.forEach((r) => {
    const typeId = r.roomType?.id ?? r.room_type_id ?? 'default';
    const typeName = r.roomType?.name ?? r.type_name ?? 'Standard Room';
    const typeRate = r.roomType?.rate ?? r.type_rate ?? 0;
    (byType[typeId] ??= { name: typeName, rate: typeRate, rooms: [] }).rooms.push(r);
  });

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="free" title="Direct Check-in" subtitle="Pick a free room for the walk-in guest" onClose={onClose} />
      <View style={styles.body}>
        {free.length ? (
          <>
            {Object.values(byType).map((group) => (
              <View key={group.name} style={{ gap: 8 }}>
                <Text style={styles.groupLabel}>
                  {group.name} · {inr(group.rate)} / day · {group.rooms.length} free
                </Text>
                <View style={styles.grid}>
                  {group.rooms.map((r) => (
                    <Pressable
                      key={r.id}
                      style={styles.chip}
                      onPress={() => onPick(r)}
                    >
                      <Text style={styles.chipText}>{r.roomNo ?? r.room_no}</Text>
                      {r.nextBookingDate ? (
                        <Text style={styles.chipDate}>{fd(r.nextBookingDate)}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Text style={styles.hint}>A date next to a room number means it is booked from that day.</Text>
          </>
        ) : (
          <View style={styles.warn}>
            <Text style={styles.warnText}>No free room right now. Check rooms in Cleaning and mark them ready.</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  groupLabel: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 54,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  chipDate: { fontFamily: fonts.body, fontSize: 10, color: colors.warning },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary },
  warn: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: 12, borderWidth: 1, borderColor: colors.warningBorder },
  warnText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.warning },
});
