import { useState, useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import Button from '../../components/ui/Button.jsx';
import GuestEditSheet from '../../components/sheets/GuestEditSheet.jsx';
import { useGuests } from '../../api/guests';
import { useDebounce } from '../../lib/useDebounce';
import { colors, fonts, radii } from '../../theme/theme';

export default function GuestsScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editGuestId, setEditGuestId] = useState(null);

  const debouncedQ = useDebounce(q, 350);
  const { data: guests, isLoading, isError, error, refetch, isRefetching } = useGuests(debouncedQ);

  const filteredGuests = useMemo(() => {
    return (guests || []).filter((g) => {
      if (statusFilter !== 'all') {
        const key = g.statusKey || g.status_key || (g.status || '').toLowerCase().replace(/[\s-]/g, '_');
        if (key !== statusFilter) return false;
      }
      if (q.trim()) {
        const term = q.toLowerCase().trim();
        const matches =
          (g.name && g.name.toLowerCase().includes(term)) ||
          (g.phone && g.phone.includes(term)) ||
          (g.room && String(g.room).includes(term)) ||
          (g.email && g.email.toLowerCase().includes(term));
        if (!matches) return false;
      }
      return true;
    });
  }, [guests, statusFilter, q]);

  const renderStatusBadge = (status, statusKey) => {
    const key = statusKey || (status || '').toLowerCase().replace(/[\s-]/g, '_');
    switch (key) {
      case 'in_house':
        return (
          <View style={[styles.statusBadge, styles.badgeOccupied]}>
            <Text style={[styles.statusText, styles.textOccupied]}>In-House</Text>
          </View>
        );
      case 'booked':
        return (
          <View style={[styles.statusBadge, styles.badgeBooked]}>
            <Text style={[styles.statusText, styles.textBooked]}>Booked</Text>
          </View>
        );
      case 'checked_out':
        return (
          <View style={[styles.statusBadge, styles.badgeCheckedOut]}>
            <Text style={[styles.statusText, styles.textCheckedOut]}>Checked Out</Text>
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
      case 'not_staying':
      default:
        return (
          <View style={[styles.statusBadge, styles.badgeDefault]}>
            <Text style={[styles.statusText, styles.textDefault]}>{status || 'Not Staying'}</Text>
          </View>
        );
    }
  };

  const renderOccupants = (g) => {
    if (g.occupantsStatus === 'not_added_yet' || g.occupants_status === 'not_added_yet') {
      return (
        <Text style={styles.occupantsMuted}>Not added yet</Text>
      );
    }

    const occupants = g.occupants || [];
    if (!occupants.length) {
      return <Text style={styles.occupantsMuted}>—</Text>;
    }

    // Deduplicate occupants by name to prevent duplicate occupant rows
    const seenNames = new Set();
    const uniqueOccupants = [];
    for (const occ of occupants) {
      const nameKey = (occ.name || '').trim().toLowerCase();
      if (nameKey && seenNames.has(nameKey)) {
        continue;
      }
      if (nameKey) {
        seenNames.add(nameKey);
      }
      uniqueOccupants.push(occ);
    }

    return (
      <View style={{ gap: 3 }}>
        {uniqueOccupants.map((occ, idx) => {
          const isPrimary = Boolean(occ.isPrimary || occ.is_primary || (occ.role && occ.role.toLowerCase().includes('primary')));
          return (
            <View key={idx} style={styles.occupantRow}>
              <Text style={styles.occupantBullet}>•</Text>
              <Text style={styles.occupantName}>
                {occ.name || `Occupant ${idx + 1}`}
              </Text>
              {isPrimary ? (
                <Text style={styles.occupantLeadRole}>
                  (Primary Guest)
                </Text>
              ) : (
                occ.role && occ.role !== 'Additional Occupant' && occ.role !== 'Primary Guest' ? (
                  <Text style={styles.occupantRole}>
                    ({occ.role})
                  </Text>
                ) : null
              )}
            </View>
          );
        })}
      </View>
    );
  };

  const renderReferredBy = (g) => {
    const ref = g.referredBy || g.referred_by;
    if (!ref || !ref.name) {
      return <Text style={styles.metaValMuted}>—</Text>;
    }

    return (
      <Pressable
        hitSlop={8}
        onPress={() => {
          if (ref.id) {
            navigation.navigate('GuestDetails', { guestId: ref.id });
          }
        }}
      >
        <Text style={styles.referrerLink} numberOfLines={1}>
          {ref.name} ↗
        </Text>
      </Pressable>
    );
  };

  const renderHeader = useMemo(() => (
    <View style={styles.headerContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.title}>Guest & Occupancy Register</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{guests?.length || 0}</Text>
            </View>
          </View>
          <Text style={styles.subTitle}>
            Reception register tracking current stays, room occupants, upcoming arrivals, and referrals
          </Text>
        </View>
        <Button
          title="All Referrals"
          variant="outline"
          size="sm"
          onPress={() => navigation.navigate('AllReferrals')}
        />
      </View>

      {/* Search Input with Clear Button */}
      <SearchInput
        placeholder="Search name, mobile or room…"
        value={q}
        onChangeText={setQ}
        style={{ marginBottom: 10 }}
      />

      {/* Status Filter Chips */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: 'All' },
          { key: 'in_house', label: 'In-House' },
          { key: 'booked', label: 'Booked' },
          { key: 'checked_out', label: 'Checked Out' },
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
  ), [guests?.length, q, statusFilter, navigation]);

  const renderEmpty = () => {
    if (isLoading) return <LoadingState />;
    if (isError) return <ErrorState message={error?.message} onRetry={refetch} />;
    return <EmptyState title="No guests registered or found" />;
  };

  const renderGuestItem = ({ item: g }) => {
    const addRooms = g.additionalRooms || g.additional_rooms || [];
    const idProofType = g.idProofType || g.id_proof_type;
    const idProofLast4 = g.idProofLast4 || g.id_proof_last4;

    return (
      <View key={g.id} style={styles.card}>
        <Pressable onPress={() => navigation.navigate('GuestDetails', { guestId: g.id })}>
          {/* Card Top: Name, Phone & Status Badge */}
          <View style={styles.rowTop}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.name}>{g.name}</Text>
              <Text style={styles.phone}>{g.phone}</Text>
              {g.email ? <Text style={styles.email} numberOfLines={1}>✉️ {g.email}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {renderStatusBadge(g.status, g.statusKey || g.status_key)}
            </View>
          </View>

          {/* Quick Metrics (Room, Persons, Visits) */}
          <View style={[styles.cardGrid, { marginBottom: 6 }]}>
            {/* Room */}
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Room</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.metaValBold}>
                  {g.room ? `Room ${g.room}` : '—'}
                </Text>
                {addRooms.length > 0 && (
                  <View style={styles.addRoomBadge}>
                    <Text style={styles.addRoomText}>+{addRooms.length}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Persons */}
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Persons</Text>
              <Text style={styles.metaValBold}>
                {g.persons !== null && g.persons !== undefined ? `${g.persons}` : '—'}
              </Text>
            </View>

            {/* Visits */}
            <View style={styles.gridItem}>
              <Text style={styles.metaLabel}>Visits</Text>
              <Text style={styles.metaValBold}>
                {g.visits ?? 0} {g.visits === 1 ? 'stay' : 'stays'}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Detailed Info Grid */}
        <View style={styles.cardGrid}>
          {/* Referred By */}
          <View style={styles.gridItem}>
            <Text style={styles.metaLabel}>Referred By</Text>
            {renderReferredBy(g)}
          </View>

          {/* City / Address if available */}
          {(g.city || g.address) && (
            <View style={[styles.gridItem, { width: '100%' }]}>
              <Text style={styles.metaLabel}>Address / Location</Text>
              <Text style={styles.metaVal} numberOfLines={1}>
                📍 {[g.city, g.address].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}

          {/* ID Proof */}
          {idProofType && (
            <View style={[styles.gridItem, { width: '100%' }]}>
              <Text style={styles.metaLabel}>ID Proof</Text>
              <Text style={styles.metaVal}>
                🪪 {idProofType}{idProofLast4 ? ` (••••${idProofLast4})` : ''}
              </Text>
            </View>
          )}

          {/* Occupants Section */}
          <View style={[styles.gridItem, { width: '100%', marginTop: 2 }]}>
            <Text style={styles.metaLabel}>Occupants</Text>
            {renderOccupants(g)}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.cardActions}>
          <Button
            title="View Profile"
            variant="outline"
            size="sm"
            onPress={() => navigation.navigate('GuestDetails', { guestId: g.id })}
          />
          <Button
            title="Edit"
            variant="outline"
            size="sm"
            onPress={() => setEditGuestId(g.id)}
          />
        </View>
      </View>
    );
  };

  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <FlatList
        data={isLoading || isError ? [] : filteredGuests}
        keyExtractor={(g) => String(g.id)}
        renderItem={renderGuestItem}
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

      {/* Guest Edit Sheet */}
      {editGuestId && (
        <GuestEditSheet
          guestId={editGuestId}
          onClose={() => setEditGuestId(null)}
          onSaved={() => refetch()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 32 },
  headerContainer: { marginBottom: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
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
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  phone: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  email: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.xs },
  badgeOccupied: { backgroundColor: colors.infoBg },
  badgeBooked: { backgroundColor: colors.warningBg },
  badgeCheckedOut: { backgroundColor: '#F1F5F9' },
  badgeNoShow: { backgroundColor: '#FEF3C7' },
  badgeCancelled: { backgroundColor: '#FEE2E2' },
  badgeDefault: { backgroundColor: '#F8F5FA' },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  textOccupied: { color: colors.info },
  textBooked: { color: colors.warning },
  textCheckedOut: { color: '#475569' },
  textNoShow: { color: '#92400E' },
  textCancelled: { color: '#991B1B' },
  textDefault: { color: '#81748C' },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.sm,
    padding: 10,
  },
  gridItem: { width: '47%' },
  metaLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaVal: { fontFamily: fonts.body, fontSize: 12, color: colors.heading, marginTop: 2 },
  metaValBold: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, marginTop: 2 },
  metaValMuted: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  referrerLink: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary, marginTop: 2, textDecorationLine: 'underline' },
  addRoomBadge: { backgroundColor: colors.infoBg, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  addRoomText: { fontFamily: fonts.monoBold, fontSize: 10, color: colors.info },
  occupantsMuted: { fontFamily: fonts.body, fontStyle: 'italic', fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  occupantRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  occupantBullet: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  occupantName: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.heading },
  occupantRole: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary },
  occupantLeadRole: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.primary },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
