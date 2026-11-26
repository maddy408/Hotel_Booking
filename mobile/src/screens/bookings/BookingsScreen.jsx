import { useState, useMemo, useCallback } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import NewBookingSheet from '../../components/sheets/NewBookingSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import { useReservations } from '../../api/reservations';
import { useRooms } from '../../api/rooms';
import { addDaysIso, fd, inr, nightsBetween, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';
import { getSimpleBookingSituation } from '../../lib/bookingSituation.js';
export { getSimpleBookingSituation };

export default function BookingsScreen() {
  const { data: reservations, isLoading, isError, error, refetch, isRefetching } = useReservations({ status: 'all' });
  const { data: roomsData } = useRooms();
  const [sheet, setSheet] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('date'); // 'date' | 'room'
  const [collapsedRooms, setCollapsedRooms] = useState({});

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const today = reservations?.find((s) => s.hotel_today)?.hotel_today || todayIso();
  const tomorrow = addDaysIso(today, 1);
  const allReservations = reservations || [];
  const all = allReservations;

  const getRoom = (roomId) => roomsData?.rooms.find((r) => r.id === roomId);

  const toggleRoomCollapse = (roomNo) => {
    setCollapsedRooms((prev) => ({ ...prev, [roomNo]: !prev[roomNo] }));
  };

  const filteredReservations = useMemo(() => {
    const sorted = [...allReservations].sort((a, b) => {
      const dateA = a.created_at || a.createdAt || '';
      const dateB = b.created_at || b.createdAt || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
    if (!search.trim()) return sorted;
    const q = search.toLowerCase().trim();
    return sorted.filter((s) => (
      (s.booking_code && s.booking_code.toLowerCase().includes(q)) ||
      (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
      (s.guest_phone && s.guest_phone.includes(q)) ||
      (s.room_no && String(s.room_no).includes(q))
    ));
  }, [allReservations, search]);

  const isOverdue = (s) => Boolean(s.is_overdue ?? s.check_in_overdue ?? (s.status === 'pending' && s.check_in_date < today));

  // Date-based sections
  const dateGroups = useMemo(() => {
    return [
      ['CHECK-IN OVERDUE', filteredReservations.filter(isOverdue)],
      ['Today', filteredReservations.filter((s) => !isOverdue(s) && s.check_in_date === today && s.status === 'pending')],
      ['Tomorrow', filteredReservations.filter((s) => !isOverdue(s) && s.check_in_date === tomorrow && s.status === 'pending')],
      ['Later', filteredReservations.filter((s) => !isOverdue(s) && s.check_in_date > tomorrow && s.status === 'pending')],
    ].filter(([, list]) => list.length);
  }, [filteredReservations, today, tomorrow]);

  const totalDateCount = useMemo(() => {
    return dateGroups.reduce((acc, [, list]) => acc + list.length, 0);
  }, [dateGroups]);

  // Room-wise sections
  const roomSections = useMemo(() => {
    const map = {};
    // Group all filtered bookings by room_no
    filteredReservations.forEach((b) => {
      const rNo = b.room_no || 'Unknown';
      if (!map[rNo]) map[rNo] = [];
      map[rNo].push(b);
    });

    const roomNos = Object.keys(map).sort((a, b) => Number(a) - Number(b));
    return roomNos.map((rNo) => {
      const bookingsForRoom = map[rNo].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
      const rObj = roomsData?.rooms?.find((r) => String(r.roomNo || r.room_no) === String(rNo)) || getRoom(bookingsForRoom[0]?.room_id);

      // Check active overlaps inside this room
      let overlapPair = null;
      for (let i = 0; i < bookingsForRoom.length; i++) {
        for (let j = i + 1; j < bookingsForRoom.length; j++) {
          const b1 = bookingsForRoom[i];
          const b2 = bookingsForRoom[j];
          if (b1.status === 'pending' && b2.status === 'pending' && b1.check_in_date < b2.check_out_date && b2.check_in_date < b1.check_out_date) {
            overlapPair = [b1, b2];
            break;
          }
        }
        if (overlapPair) break;
      }

      const isCollapsed = Boolean(collapsedRooms[rNo]);
      // Next guest selection:
      // Filter pending reservations for this room, ordered by check_in_date ASC
      const pendingForRoom = bookingsForRoom.filter((b) => b.status === 'pending' && (!b.check_out_date || b.check_out_date > today));
      const minDate = (rObj?.status === 'occupied' && rObj?.checkoutPlanned && rObj.checkoutPlanned > today) ? rObj.checkoutPlanned : today;
      const validNext = pendingForRoom.find((b) => b.check_in_date >= minDate) || null;

      const isActuallyStaying = rObj?.status === 'occupied' && Boolean(rObj?.guestName);

      return {
        title: `Room ${rNo}`,
        roomNo: rNo,
        room: rObj,
        isRoomGroup: true,
        overlapPair,
        isCollapsed,
        currentGuest: isActuallyStaying ? {
          name: rObj.guestName,
          checkout: rObj.checkoutPlanned,
          time: rObj.checkoutTime,
          isOverdue: rObj.isOverdue || (rObj.checkoutPlanned && rObj.checkoutPlanned < today),
        } : null,
        nextGuest: validNext ? {
          name: validNext.guest_name,
          checkIn: validNext.check_in_date,
          bookingCode: validNext.booking_code,
        } : null,
        data: isCollapsed ? [] : bookingsForRoom,
        totalBookingsCount: bookingsForRoom.length,
      };
    });
  }, [filteredReservations, roomsData?.rooms, collapsedRooms, today]);

  const sections = useMemo(() => {
    if (viewMode === 'room') {
      return roomSections;
    }
    return dateGroups.map(([title, list]) => ({
      title,
      data: list,
      isOverdueGroup: title === 'CHECK-IN OVERDUE',
    }));
  }, [viewMode, roomSections, dateGroups]);

  const renderHeader = useMemo(() => (
    <View style={styles.headerContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Bookings <Text style={styles.count}>{filteredReservations.length}</Text></Text>
        <Button title="+ New Booking" variant="primary" size="sm" onPress={() => setSheet({ type: 'new' })} />
      </View>
      <SearchInput
        placeholder="Search booking, guest, phone or room…"
        value={search}
        onChangeText={setSearch}
        style={{ marginTop: 4, marginBottom: 8 }}
      />
      <View style={styles.viewToggleContainer}>
        <Pressable
          style={[styles.toggleBtn, viewMode === 'date' && styles.toggleBtnActive]}
          onPress={() => setViewMode('date')}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'date' && styles.toggleBtnTextActive]}>
            📅 By Date ({totalDateCount})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, viewMode === 'room' && styles.toggleBtnActive]}
          onPress={() => setViewMode('room')}
        >
          <Text style={[styles.toggleBtnText, viewMode === 'room' && styles.toggleBtnTextActive]}>
            🚪 Room-wise View ({roomSections.length})
          </Text>
        </Pressable>
      </View>
    </View>
  ), [filteredReservations.length, search, viewMode, roomSections.length]);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const renderSectionHeader = ({ section }) => {
    if (section.isRoomGroup) {
      const r = section.room;
      const hk = r?.housekeepingStatus || r?.housekeeping_status || 'ok';
      const isOccupied = r?.status === 'occupied';
      const isMnt = hk === 'repair';
      const isCln = hk === 'cleaning';
      const roomBadgeText = isOccupied ? (r?.isOverdue ? 'Checkout overdue' : 'Guest is staying') : isMnt ? 'Repair' : isCln ? 'Room cleaning' : 'Room ready';
      const roomBadgeColor = isOccupied ? (r?.isOverdue ? '#dc2626' : '#0284c7') : isMnt ? '#dc2626' : isCln ? '#7c3aed' : '#16a34a';
      const roomBadgeBg = isOccupied ? (r?.isOverdue ? '#fef2f2' : '#f0f9ff') : isMnt ? '#fef2f2' : isCln ? '#f5f3ff' : '#f0fdf4';

      return (
        <View style={styles.roomSectionContainer}>
          <Pressable style={styles.roomSectionHeader} onPress={() => toggleRoomCollapse(section.roomNo)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
              <View style={styles.roomNumberBadge}>
                <Text style={styles.roomNumberBadgeText}>Room {section.roomNo}</Text>
              </View>
              {(r?.roomType?.name || section.data?.[0]?.room_type_name || section.room?.room_type_name) ? (
                <Text style={styles.roomTypeNameText}>{r?.roomType?.name || section.data?.[0]?.room_type_name || section.room?.room_type_name}</Text>
              ) : null}
              <View style={[styles.statusBadgeSmall, { backgroundColor: roomBadgeBg }]}>
                <Text style={[styles.statusBadgeSmallText, { color: roomBadgeColor }]}>{roomBadgeText}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.roomBookingsCountText}>{section.totalBookingsCount} booking{section.totalBookingsCount !== 1 ? 's' : ''}</Text>
              <Text style={styles.collapseArrow}>{section.isCollapsed ? '▼' : '▲'}</Text>
            </View>
          </Pressable>

          {/* Current & Next Guest Info Box */}
          <View style={styles.roomSummaryBox}>
            {section.currentGuest ? (
              <View style={styles.guestSummaryRow}>
                <Text style={styles.summaryLabel}>Current guest:</Text>
                <Text style={styles.summaryValueBold}>{section.currentGuest.name}</Text>
                <Text style={styles.summarySub}>
                  · Checkout: {fd(section.currentGuest.checkout)}
                  {section.currentGuest.isOverdue ? ' (Overdue!)' : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.guestSummaryRow}>
                <Text style={styles.summaryLabel}>Current guest:</Text>
                <Text style={styles.summarySub}>None (Room vacant)</Text>
              </View>
            )}

            {section.nextGuest ? (
              <View style={styles.guestSummaryRow}>
                <Text style={styles.summaryLabel}>Next guest:</Text>
                <Text style={styles.summaryValueBold}>{section.nextGuest.name}</Text>
                <Text style={styles.summarySub}>· Check-in: {fd(section.nextGuest.checkIn)} ({section.nextGuest.bookingCode})</Text>
              </View>
            ) : (
              <View style={styles.guestSummaryRow}>
                <Text style={styles.summaryLabel}>Next guest:</Text>
                <Text style={styles.summarySub}>None scheduled</Text>
              </View>
            )}
          </View>

          {/* Overlap Conflict Warning Banner */}
          {section.overlapPair && (
            <View style={styles.overlapWarningBanner}>
              <Text style={styles.overlapWarningTitle}>⚠️ Warning: Active Overlapping Bookings</Text>
              <Text style={styles.overlapWarningText}>
                {section.overlapPair[0].booking_code} ({section.overlapPair[0].guest_name}, {fd(section.overlapPair[0].check_in_date)} to {fd(section.overlapPair[0].check_out_date)}) overlaps with {section.overlapPair[1].booking_code} ({section.overlapPair[1].guest_name}, {fd(section.overlapPair[1].check_in_date)} to {fd(section.overlapPair[1].check_out_date)}). Please resolve room assignment.
              </Text>
            </View>
          )}
        </View>
      );
    }

    const { title, isOverdueGroup, data } = section;
    return (
      <View style={[styles.groupHeaderContainer, isOverdueGroup && styles.groupHeaderOverdue]}>
        <Text style={[styles.groupLabel, isOverdueGroup && styles.groupLabelOverdue]}>
          {isOverdueGroup ? '⚠️ ' : ''}{title} · {data.length}
        </Text>
        {isOverdueGroup && <Text style={styles.groupOverdueSubtext}>Arrival date passed</Text>}
      </View>
    );
  };

  const renderBookingItem = ({ item: s, section }) => {
    const nights = nightsBetween(s.check_in_date, s.check_out_date);
    const isOverdueItem = (section?.isOverdueGroup) || isOverdue(s);
    const daysOverdue = nightsBetween(s.check_in_date, today);
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

    const situation = getSimpleBookingSituation(s, r, today, all);
    const canIn = s.status === 'pending' &&
      s.check_in_date <= today &&
      !isOccupied &&
      !isMaintenance &&
      isReady &&
      !lateArrivalConflict &&
      !situation.isConflict &&
      !situation.isWaitingRoomOccupied;

    return (
      <View key={s.id} style={[styles.row, isOverdueItem && styles.rowOverdue, situation.isConflict && styles.rowConflict]}>
        <Pressable onPress={() => setSheet({ type: 'open', id: s.id })}>
          {/* Card Top Header: Booking #, Room #, and Situation Status Badge */}
          <View style={styles.rowTop}>
            <View style={styles.headerPrimary}>
              <Text style={styles.bookingCode}>{s.booking_code}</Text>
              <View style={styles.roomTag}>
                <Text style={styles.roomTagText}>Room {s.room_no}</Text>
              </View>
            </View>

            <View style={styles.headerBadges}>
              {isOverdueItem && (
                <View style={styles.overdueBadge}>
                  <Text style={styles.overdueBadgeText}>{daysOverdue > 0 ? `${daysOverdue}d overdue` : 'Overdue'}</Text>
                </View>
              )}
              {/* Simple English Status Badge */}
              <View style={[styles.situationBadge, { backgroundColor: situation.bg, borderColor: situation.border }]}>
                <Text style={[styles.situationBadgeText, { color: situation.color }]}>{situation.text}</Text>
              </View>
            </View>
          </View>

          {/* Guest Name & Phone */}
          <View style={styles.guestInfoRow}>
            <Text style={styles.guestName}>{s.guest_name}</Text>
            <Text style={styles.phoneText}>📞 {s.guest_phone}</Text>
          </View>

          {/* Booking Meta: Dates, Nights, Persons, Advance */}
          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Stay Dates</Text>
              <Text style={styles.detailValue}>{fd(s.check_in_date)} → {fd(s.check_out_date)} ({nights} {nights === 1 ? 'night' : 'nights'})</Text>
            </View>
            <View style={styles.detailItemRight}>
              <Text style={styles.detailLabel}>Guests & Advance</Text>
              <Text style={styles.detailValue}>
                {s.persons} {Number(s.persons) === 1 ? 'person' : 'persons'} · {Number(s.advance_paid) > 0 ? inr(s.advance_paid) : 'advance not paid'}
              </Text>
            </View>
          </View>

          {/* Date Conflict Notice */}
          {situation.isConflict ? (
            <View style={styles.conflictNotice}>
              <Text style={styles.conflictNoticeText}>
                ⚠️ Dates overlap with {situation.conflictBookingCode}. Two guests cannot book the same room on overlapping dates.
              </Text>
            </View>
          ) : null}
        </Pressable>

        {/* Action Button: Separated from card pressable */}
        {canIn ? (
          <Button
            title="Guest came · Check in"
            variant="success"
            size="sm"
            onPress={() => setSheet({ type: 'checkinFrom', reservation: s })}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          />
        ) : null}
      </View>
    );
  };

  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <SectionList
        sections={sections}
        keyExtractor={(s) => String(s.id)}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderBookingItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <Text style={styles.empty}>No bookings. Tap "+ New Booking" when a guest calls or comes to book.</Text>
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={!!isRefetching}
            onRefresh={refetch}
            colors={[colors.primary]}
          />
        }
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />

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
  listContent: { padding: 16, paddingBottom: 32 },
  headerContainer: { marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.heading },
  count: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary },
  viewToggleContainer: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  toggleBtnTextActive: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
  },
  groupHeaderContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 },
  groupHeaderOverdue: { backgroundColor: '#FFE4E6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.xs, borderWidth: 1, borderColor: '#FECDD3' },
  groupLabel: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase' },
  groupLabelOverdue: { color: '#9F1239', fontFamily: fonts.bodyBold },
  groupOverdueSubtext: { fontFamily: fonts.bodySemibold, fontSize: 11, color: '#BE123C' },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  rowOverdue: { borderLeftWidth: 4, borderLeftColor: '#E11D48', backgroundColor: '#FFFDFC' },
  rowConflict: { borderLeftWidth: 4, borderLeftColor: '#DC2626', backgroundColor: '#FEF2F2' },
  overdueBadge: { backgroundColor: '#FFE4E6', borderWidth: 1, borderColor: '#FECDD3', borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  overdueBadgeText: { fontFamily: fonts.mono, fontSize: 10.5, color: '#9F1239', fontWeight: '700' },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    rowGap: 6,
    columnGap: 8,
    marginBottom: 6,
  },
  headerPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flexShrink: 1,
    justifyContent: 'flex-end',
  },
  bookingCode: { fontFamily: fonts.mono, fontSize: 12.5, fontWeight: '700', color: colors.heading },
  roomTag: { backgroundColor: colors.secondaryLight, borderRadius: radii.xs, paddingHorizontal: 7, paddingVertical: 2 },
  roomTagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  situationBadge: { borderWidth: 1, borderRadius: radii.xs, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  situationBadgeText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  guestInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  guestName: { fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.heading },
  phoneText: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
  detailsRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: radii.xs,
    padding: 8,
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: { flex: 1.2 },
  detailItemRight: { flex: 1, alignItems: 'flex-end' },
  detailLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textMuted, textTransform: 'uppercase' },
  detailValue: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.heading, marginTop: 1 },
  conflictNotice: {
    marginTop: 6,
    padding: 6,
    borderRadius: radii.xs,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  conflictNoticeText: { fontFamily: fonts.bodySemibold, fontSize: 11, color: '#991B1B' },
  roomSectionContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 10,
    marginTop: 10,
    marginBottom: 6,
  },
  roomSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomNumberBadge: {
    backgroundColor: colors.primary,
    borderRadius: radii.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  roomNumberBadgeText: {
    color: '#ffffff',
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  roomTypeNameText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.heading,
  },
  statusBadgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  statusBadgeSmallText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
  },
  roomBookingsCountText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  collapseArrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textSecondary,
  },
  roomSummaryBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 3,
  },
  guestSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  summaryLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.textMuted,
  },
  summaryValueBold: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.heading,
  },
  summarySub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
  },
  overlapWarningBanner: {
    marginTop: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: radii.xs,
    padding: 6,
  },
  overlapWarningTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: '#991B1B',
    marginBottom: 2,
  },
  overlapWarningText: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: '#7F1D1D',
  },
  empty: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textSecondary, textAlign: 'center', paddingVertical: 24 },
});
