import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import RoomTile from '../../components/RoomTile.jsx';
import DirectCheckInPicker from '../../components/sheets/DirectCheckInPicker.jsx';
import RoomDetailsSheet from '../../components/sheets/RoomDetailsSheet.jsx';
import StayDetailSheet from '../../components/sheets/StayDetailSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import HousekeepingSheet from '../../components/sheets/HousekeepingSheet.jsx';
import NewBookingSheet from '../../components/sheets/NewBookingSheet.jsx';
import RoomCalendar from '../../components/RoomCalendar.jsx';
import { useRooms } from '../../api/rooms';
import { useReservations } from '../../api/reservations';
import { useDoneStays } from '../../api/stays';
import { useSettings } from '../../api/settings';
import { isRoomOverdue } from '../../lib/overdue';
import { todayIso, fdWithYear, addDaysIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

const STATUS_ORDER = ['free', 'booked', 'occupied', 'cleaning', 'repair', 'overdue'];
const STATUS_LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair', overdue: 'Overdue' };

function toIsoString(date) {
  if (!date) return todayIso();
  if (typeof date === 'string') return date.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function roomMatchesFilter(r, f) {
  if (!f) return true;
  if (f === 'booked') return r.status === 'booked' || r.hasPendingBooking === true;
  if (f === 'overdue') return Boolean(r.isOverdue);
  return r.status === f;
}

const EMPTY_ARRAY = [];

export default function RoomsScreen({ navigation }) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useRooms();
  const { data: reservations = EMPTY_ARRAY } = useReservations();
  const { data: doneStays = EMPTY_ARRAY } = useDoneStays();
  const { data: settingsData } = useSettings();

  const [selectedDateObj, setSelectedDateObj] = useState(() => new Date());
  const [filter, setFilter] = useState(null);
  const [sheet, setSheet] = useState(null);

  const baseRooms = data?.rooms || EMPTY_ARRAY;
  const today = todayIso();
  const selectedDateIso = toIsoString(selectedDateObj);
  const isTodaySelected = selectedDateIso === today;

  // Compute room status & tile metadata dynamically for selectedDateIso
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
        // Today or future: check room's current active stay
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
        // Past date: check completed stays and current stays
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

      if (isPast) {
        return {
          ...room,
          status: 'free',
          guestName: null,
          persons: 0,
          stayId: null,
          hasPendingBooking: false,
          pendingBooking: null,
        };
      }

      // Future date: temporary cleaning condition today is completed in future
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

  const counts = useMemo(() => {
    const c = { free: 0, booked: 0, occupied: 0, cleaning: 0, repair: 0, overdue: 0 };
    const leaving = rooms.filter((r) => r.status === 'occupied' && (r.checkoutPlanned ? r.checkoutPlanned.slice(0, 10) === selectedDateIso : false)).length;
    rooms.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status]++;
      if (r.isOverdue) c.overdue++;
    });
    return { ...c, leaving };
  }, [rooms, selectedDateIso]);

  const floors = useMemo(() => {
    const filtered = rooms.filter((r) => roomMatchesFilter(r, filter));
    const byFloor = {};
    filtered.forEach((r) => {
      (byFloor[r.floor] ??= []).push(r);
    });
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

      <RoomCalendar
        style={{ marginBottom: 12 }}
        selectedDate={selectedDateObj}
        onDateSelect={(date) => setSelectedDateObj(date)}
      />

      {/* Date banner indicating dynamic view */}
      <View style={styles.dateBanner}>
        <View style={styles.dateBannerLeft}>
          <Text style={styles.dateBannerTitle}>
            {isTodaySelected ? 'Today’s Room Status' : `Room Status: ${fdWithYear(selectedDateIso)}`}
          </Text>
          <Text style={styles.dateBannerSubtitle}>
            {isTodaySelected
              ? 'Real-time live status'
              : `${selectedDateIso < today ? 'Past' : 'Projected'} availability for selected date`}
          </Text>
        </View>
        {!isTodaySelected && (
          <Pressable
            style={styles.resetDateBtn}
            onPress={() => setSelectedDateObj(new Date())}
            hitSlop={8}
          >
            <Text style={styles.resetDateText}>Reset to Today</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.countGrid}>
        {STATUS_ORDER.map((s) => {
          const active = filter === s;
          const isOverdueCard = s === 'overdue';
          const isOccupiedCard = s === 'occupied';
          return (
            <Pressable
              key={s}
              style={[
                styles.countCard,
                isOverdueCard && styles.countCardOverdue,
                active && (isOverdueCard ? styles.countCardOverdueActive : styles.countCardActive),
              ]}
              onPress={() => setFilter(active ? null : s)}
              accessibilityRole="button"
              accessibilityLabel={`${STATUS_LABEL[s]} rooms filter, count ${counts[s]}`}
            >
              <Text style={[styles.countNum, isOverdueCard && counts.overdue > 0 && styles.countNumOverdue]}>
                {counts[s]}
              </Text>
              <Text style={[styles.countLabel, isOverdueCard && counts.overdue > 0 && styles.countLabelOverdue]}>
                {STATUS_LABEL[s]}
              </Text>
              {isOccupiedCard && (counts.overdue > 0 || counts.leaving > 0) ? (
                <Text style={[styles.countSub, counts.overdue > 0 ? styles.countSubOverdue : styles.countSubWarning]}>
                  {counts.overdue > 0
                    ? `${counts.overdue} overdue${counts.leaving > 0 ? ` · ${counts.leaving} leaving` : ''}`
                    : `${counts.leaving} leaving ${isTodaySelected ? 'today' : 'on date'}`}
                </Text>
              ) : null}
              {isOverdueCard && counts.overdue > 0 ? (
                <Text style={[styles.countSub, styles.countSubOverdue]}>Action needed</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {filter && (
        <View style={[styles.filterBanner, filter === 'overdue' && styles.filterBannerOverdue]}>
          <Text style={[styles.filterText, filter === 'overdue' && styles.filterTextOverdue]}>
            Showing {STATUS_LABEL[filter]} rooms ({rooms.filter((r) => roomMatchesFilter(r, filter)).length})
          </Text>
          <Pressable onPress={() => setFilter(null)} style={styles.clearFilterBtn} hitSlop={8}>
            <Text style={[styles.clearFilterText, filter === 'overdue' && styles.clearFilterTextOverdue]}>
              Show all {rooms.length} rooms
            </Text>
          </Pressable>
        </View>
      )}

      {floors.map(({ floor, rooms: floorRooms }) => (
        <View key={floor} style={{ marginTop: 6 }}>
          <Text style={styles.floorLabel}>{floor === 0 ? 'Ground Floor' : `Floor ${floor}`}</Text>
          <View style={styles.tileGrid}>
            {floorRooms.map((r) => (
              <RoomTile
                key={r.id}
                room={r}
                settings={settingsData}
                onPress={() => setSheet({ type: 'roomDetails', room: r })}
                onOpenBooking={(bookingId) => setSheet({ type: 'booking', reservationId: bookingId })}
              />
            ))}
          </View>
        </View>
      ))}

      {floors.length === 0 ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.body, color: colors.textSecondary }}>
            No {filter ? (STATUS_LABEL[filter]?.toLowerCase() || filter) : ''} rooms.
          </Text>
        </View>
      ) : null}

      {/* Visual availability calendar (frontend's RoomCalendar.jsx) is not ported yet —
          see MOBILE_IMPLEMENTATION_PROGRESS.md. All booking/check-in/checkout workflows
          below are fully functional against the live backend. */}

      {sheet?.type === 'direct' && (
        <DirectCheckInPicker rooms={baseRooms}
          checkIn={selectedDateIso || today}
          checkOut={addDaysIso(selectedDateIso || today, 1)}
          onClose={() => setSheet(null)}
          onPick={(room) => setSheet({ type: 'checkin', room })}
        />
      )}
      {sheet?.type === 'roomDetails' && (
        <RoomDetailsSheet
          room={sheet.room}
          onClose={() => setSheet(null)}
          onViewStay={(stayId) => setSheet({ type: 'stayDetail', stayId })}
          onViewInvoice={(stayId) => {
            setSheet(null);
            navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId } });
          }}
          onEarlyCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'early' })}
          onCheckout={(stayId) => setSheet({ type: 'checkout', stayId })}
          onViewBooking={(reservationId) => setSheet({ type: 'booking', reservationId })}
          onCheckIn={(roomOrReservation) => {
            if (sheet.room.status === 'booked' || roomOrReservation?.booking_code) {
              setSheet({
                type: 'checkin-from-reservation',
                reservation: roomOrReservation,
                triggerAdvanceError: Number(roomOrReservation.advance_paid ?? 0) <= 0,
              });
            } else {
              setSheet({ type: 'checkin', room: roomOrReservation });
            }
          }}
          onPreBook={(room) => setSheet({ type: 'newBooking', editReservation: { room_id: room.id } })}
        />
      )}
      {sheet?.type === 'stayDetail' && (
        <StayDetailSheet
          stayId={sheet.stayId}
          onClose={() => setSheet(null)}
          onEarlyCheckout={(stayId) => setSheet({ type: 'checkout', stayId, initialMode: 'early' })}
          onCheckout={(stayId) => setSheet({ type: 'checkout', stayId })}
          onPrintInvoice={(stayId, stay) => {
            setSheet(null);
            navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId, stay } });
          }}
        />
      )}
      {sheet?.type === 'checkin' && <CheckInSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {sheet?.type === 'checkin-from-reservation' && (
        <CheckInSheet
          reservation={sheet.reservation}
          triggerAdvanceError={sheet.triggerAdvanceError}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'checkout' && <CheckoutSheet stayId={sheet.stayId} initialMode={sheet.initialMode} onClose={() => setSheet(null)} />}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.reservationId}
          onClose={() => setSheet(null)}
          onCheckIn={(reservation) =>
            setSheet({
              type: 'checkin-from-reservation',
              reservation,
              triggerAdvanceError: Number(reservation.advance_paid ?? 0) <= 0,
            })
          }
          onEdit={(reservation) => setSheet({ type: 'editBooking', editReservation: reservation })}
        />
      )}
      {sheet?.type === 'housekeeping' && <HousekeepingSheet room={sheet.room} onClose={() => setSheet(null)} />}
      {(sheet?.type === 'newBooking' || sheet?.type === 'editBooking') && (
        <NewBookingSheet
          initialCheckIn={selectedDateIso || today}
          preSelectedRoom={sheet.preSelectedRoom}
          editReservation={sheet.editReservation}
          onClose={() => setSheet(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionBar: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  dateBannerLeft: { flex: 1 },
  dateBannerTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  dateBannerSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  resetDateBtn: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.xs,
  },
  resetDateText: { fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.primary },
  countGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  countCard: {
    flexGrow: 1, minWidth: '29%', backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1,
    borderColor: colors.cardBorder, padding: 9, alignItems: 'center',
  },
  countCardActive: { borderColor: colors.primary, borderWidth: 2 },
  countCardOverdue: { borderColor: colors.dangerBorder },
  countCardOverdueActive: { borderColor: colors.danger, borderWidth: 2, backgroundColor: colors.dangerBg },
  countNum: { fontFamily: fonts.display, fontSize: 20, color: colors.heading },
  countNumOverdue: { color: colors.danger },
  countLabel: { fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.textSecondary },
  countLabelOverdue: { color: colors.danger, fontFamily: fonts.bodyBold },
  countSub: { fontFamily: fonts.body, fontSize: 9.5, color: colors.warning, marginTop: 2 },
  countSubOverdue: { fontFamily: fonts.bodySemibold, fontSize: 9.5, color: colors.danger, marginTop: 2 },
  countSubWarning: { fontFamily: fonts.body, fontSize: 9.5, color: colors.warning, marginTop: 2 },
  filterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.secondaryLight,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    marginBottom: 10,
  },
  filterBannerOverdue: { backgroundColor: colors.dangerBg },
  filterText: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.primary },
  filterTextOverdue: { color: colors.danger },
  clearFilterBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  clearFilterText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary, textDecorationLine: 'underline' },
  clearFilterTextOverdue: { color: colors.danger },
  floorLabel: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary, marginBottom: 8, marginTop: 4 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
