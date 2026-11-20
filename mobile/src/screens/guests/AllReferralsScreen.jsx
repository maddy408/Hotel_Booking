import { useState, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import { useAllReferrals } from '../../api/guests';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function AllReferralsScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeReservationId, setActiveReservationId] = useState(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useAllReferrals();

  const summary = data?.summary || {
    total_referral_bookings: 0,
    unique_referred_guests: 0,
    arrived_referred_guests: 0,
    upcoming_referral_bookings: 0,
  };

  const rawItems = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return data.items || data.referrals || [];
  }, [data]);

  const filteredItems = useMemo(() => {
    return rawItems.filter((item) => {
      // 1. General search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesGeneral =
          (item.referrer_name && item.referrer_name.toLowerCase().includes(q)) ||
          (item.referrer_phone && item.referrer_phone.toLowerCase().includes(q)) ||
          (item.referred_guest_name && item.referred_guest_name.toLowerCase().includes(q)) ||
          (item.referred_guest_phone && item.referred_guest_phone.toLowerCase().includes(q)) ||
          (item.booking_code && item.booking_code.toLowerCase().includes(q)) ||
          (item.room_no && String(item.room_no).includes(q));

        if (!matchesGeneral) return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all') {
        const code = item.status_code || (item.status || '').toLowerCase().replace(/[\s-]/g, '_');
        if (statusFilter === 'arrived') {
          if (!item.has_arrived && code !== 'in_house' && code !== 'checked_out') return false;
        } else if (statusFilter === 'upcoming') {
          if (code !== 'upcoming' && code !== 'confirmed') return false;
        } else if (code !== statusFilter) {
          return false;
        }
      }

      return true;
    });
  }, [rawItems, search, statusFilter]);

  const renderStatusBadge = (item) => {
    const code = item.status_code || (item.status || '').toLowerCase().replace(/[\s-]/g, '_');
    switch (code) {
      case 'in_house':
        return (
          <View style={[styles.statusBadge, styles.badgeOccupied]}>
            <Text style={[styles.statusText, styles.textOccupied]}>In-House</Text>
          </View>
        );
      case 'checked_out':
        return (
          <View style={[styles.statusBadge, styles.badgeCheckedOut]}>
            <Text style={[styles.statusText, styles.textCheckedOut]}>Checked Out</Text>
          </View>
        );
      case 'confirmed':
        return (
          <View style={[styles.statusBadge, styles.badgeConfirmed]}>
            <Text style={[styles.statusText, styles.textConfirmed]}>Confirmed</Text>
          </View>
        );
      case 'upcoming':
        return (
          <View style={[styles.statusBadge, styles.badgeBooked]}>
            <Text style={[styles.statusText, styles.textBooked]}>Upcoming</Text>
          </View>
        );
      case 'no_show':
        return (
          <View style={[styles.statusBadge, styles.badgeNoShow]}>
            <Text style={[styles.statusText, styles.textNoShow]}>No-Show</Text>
          </View>
        );
      case 'cancelled':
        return (
          <View style={[styles.statusBadge, styles.badgeCancelled]}>
            <Text style={[styles.statusText, styles.textCancelled]}>Cancelled</Text>
          </View>
        );
      default:
        return (
          <View style={[styles.statusBadge, styles.badgeDefault]}>
            <Text style={[styles.statusText, styles.textDefault]}>{item.status || '—'}</Text>
          </View>
        );
    }
  };

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.title}>All Referrals Register</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{rawItems.length}</Text>
            </View>
          </View>
          <Text style={styles.subTitle}>
            Track which guest referred whom, whether the referred guest arrived, and related booking and stay details.
          </Text>
        </View>
      </View>

      {/* 4 Summary Cards */}
      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Referral Bookings</Text>
          <Text style={styles.summaryValPrimary}>{summary.total_referral_bookings}</Text>
          <Text style={styles.summarySub}>Total reference bookings</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Unique Referred Guests</Text>
          <Text style={styles.summaryVal}>{summary.unique_referred_guests}</Text>
          <Text style={styles.summarySub}>Distinct guests introduced</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Arrived Referred Guests</Text>
          <Text style={styles.summaryValSuccess}>{summary.arrived_referred_guests}</Text>
          <Text style={styles.summarySub}>In-House or Checked Out</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Upcoming Bookings</Text>
          <Text style={styles.summaryValWarning}>{summary.upcoming_referral_bookings}</Text>
          <Text style={styles.summarySub}>Pending arrivals</Text>
        </View>
      </View>

      {/* Search Input */}
      <Input
        placeholder="Search name, phone, booking ID, room…"
        value={search}
        onChangeText={setSearch}
        style={{ marginBottom: 10 }}
      />

      {/* Status Filter Chips */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: 'All' },
          { key: 'upcoming', label: 'Upcoming' },
          { key: 'confirmed', label: 'Confirmed' },
          { key: 'in_house', label: 'In-House' },
          { key: 'checked_out', label: 'Checked Out' },
          { key: 'arrived', label: 'Arrived' },
          { key: 'no_show', label: 'No-Show' },
          { key: 'cancelled', label: 'Cancelled' },
        ].map((f) => (
          <Pressable
            key={f.key}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (isLoading) return <LoadingState />;
    if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;
    return <EmptyState title="No referral records found" />;
  };

  const renderReferralItem = ({ item, index: idx }) => (
          <View key={`${item.reservation_id || idx}`} style={styles.card}>
            {/* Top Row: Referrer → Referred Guest & Status */}
            <View style={styles.rowTop}>
              <View style={{ flex: 1, marginRight: 8 }}>
                {/* Referrer Info */}
                <View style={styles.partyBox}>
                  <Text style={styles.partyRole}>Referring Member</Text>
                  <Pressable
                    onPress={() => {
                      if (item.referrer_id) {
                        navigation.navigate('GuestDetails', { guestId: item.referrer_id });
                      }
                    }}
                  >
                    <Text style={styles.partyNameLink}>
                      {item.referrer_name || '—'} ↗
                    </Text>
                  </Pressable>
                  <Text style={styles.monoText}>{item.referrer_phone || '—'}</Text>
                </View>

                {/* Arrow */}
                <Text style={styles.arrowText}>↓ referred</Text>

                {/* Referred Guest Info */}
                <View style={styles.partyBox}>
                  <Text style={styles.partyRole}>Referred Guest</Text>
                  <Pressable
                    onPress={() => {
                      if (item.referred_guest_id) {
                        navigation.navigate('GuestDetails', { guestId: item.referred_guest_id });
                      }
                    }}
                  >
                    <Text style={styles.partyNameLink}>
                      {item.referred_guest_name || '—'} ↗
                    </Text>
                  </Pressable>
                  <Text style={styles.monoText}>{item.referred_guest_phone || '—'}</Text>
                </View>
              </View>

              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {renderStatusBadge(item)}
                {item.booking_code && (
                  <Pressable
                    style={styles.bookingBadge}
                    onPress={() => setActiveReservationId(item.reservation_id)}
                  >
                    <Text style={styles.bookingBadgeText}>{item.booking_code}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Middle Details Grid */}
            <View style={styles.detailsGrid}>
              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Room</Text>
                <Text style={styles.metaValBold}>
                  {item.room_no ? `Room ${item.room_no}` : '—'}
                </Text>
              </View>

              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Booking Date</Text>
                <Text style={styles.metaVal}>
                  {item.booking_date ? fd(item.booking_date.slice(0, 10)) : '—'}
                </Text>
              </View>

              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Scheduled Check-in</Text>
                <Text style={styles.metaVal}>
                  {item.scheduled_check_in ? fd(item.scheduled_check_in) : '—'}
                </Text>
              </View>

              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Scheduled Check-out</Text>
                <Text style={styles.metaVal}>
                  {item.scheduled_check_out ? fd(item.scheduled_check_out) : '—'}
                </Text>
              </View>

              {item.actual_check_in ? (
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Actual Check-in</Text>
                  <Text style={[styles.metaVal, { color: colors.success, fontFamily: fonts.bodyBold }]}>
                    {fd(item.actual_check_in)}
                  </Text>
                </View>
              ) : null}

              {item.actual_check_out ? (
                <View style={styles.gridItem}>
                  <Text style={styles.metaLabel}>Actual Check-out</Text>
                  <Text style={styles.metaVal}>
                    {fd(item.actual_check_out)}
                  </Text>
                </View>
              ) : null}

              <View style={styles.gridItem}>
                <Text style={styles.metaLabel}>Advance Collected</Text>
                <Text style={styles.metaValBold}>
                  {inr(item.advance_paid || item.advance_amount || 0)}
                </Text>
              </View>
            </View>

            {/* Card Actions */}
            <View style={styles.cardActions}>
              {item.reservation_id && (
                <Button
                  title="View Booking"
                  variant="outline"
                  size="sm"
                  onPress={() => setActiveReservationId(item.reservation_id)}
                />
              )}
              {item.referred_guest_id && (
                <Button
                  title="Guest Profile"
                  variant="outline"
                  size="sm"
                  onPress={() => navigation.navigate('GuestDetails', { guestId: item.referred_guest_id })}
                />
              )}
            </View>
          </View>
  );

  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <FlatList
        data={isLoading || isError ? [] : filteredItems}
        keyExtractor={(item, idx) => String(item.reservation_id || item.id || idx)}
        renderItem={renderReferralItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={!!isRefetching}
            onRefresh={refetch}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      />

      {/* Booking Detail Modal */}
      {activeReservationId && (
        <BookingDetailSheet
          reservationId={activeReservationId}
          onClose={() => setActiveReservationId(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 32 },
  headerContainer: { marginBottom: 4 },
  header: { marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.heading },
  subTitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  countBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  countText: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.primary },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  summaryCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
  },
  summaryLabel: { fontFamily: fonts.bodySemibold, fontSize: 10.5, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryVal: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.heading, marginTop: 2 },
  summaryValPrimary: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.primary, marginTop: 2 },
  summaryValSuccess: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.success, marginTop: 2 },
  summaryValWarning: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.warning, marginTop: 2 },
  summarySub: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, marginTop: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  filterChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radii.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.textSecondary },
  filterChipTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  partyBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.xs, padding: 6, marginVertical: 2 },
  partyRole: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  partyNameLink: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.primary, textDecorationLine: 'underline', marginTop: 1 },
  arrowText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.textSecondary, marginVertical: 1, marginLeft: 8 },
  monoText: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },
  bookingBadge: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 2 },
  bookingBadgeText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.xs },
  badgeOccupied: { backgroundColor: colors.infoBg },
  badgeBooked: { backgroundColor: colors.warningBg },
  badgeCheckedOut: { backgroundColor: '#F1F5F9' },
  badgeConfirmed: { backgroundColor: '#E0F2FE' },
  badgeNoShow: { backgroundColor: '#FEF3C7' },
  badgeCancelled: { backgroundColor: '#FEE2E2' },
  badgeDefault: { backgroundColor: '#F8F5FA' },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 10.5 },
  textOccupied: { color: colors.info },
  textBooked: { color: colors.warning },
  textCheckedOut: { color: '#475569' },
  textConfirmed: { color: '#0369A1' },
  textNoShow: { color: '#92400E' },
  textCancelled: { color: '#991B1B' },
  textDefault: { color: '#81748C' },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.sm,
    padding: 10,
  },
  gridItem: { width: '47%' },
  metaLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaVal: { fontFamily: fonts.body, fontSize: 11.5, color: colors.heading, marginTop: 1 },
  metaValBold: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.heading, marginTop: 1 },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
