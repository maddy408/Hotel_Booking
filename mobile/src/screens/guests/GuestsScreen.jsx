import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useGuests } from '../../api/guests';
import { inr, fd } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function GuestsScreen({ navigation }) {
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_house' | 'booked' | 'checked_out'
  const { data: guests, isLoading, isError, error, refetch, isRefetching } = useGuests(q);

  const filteredGuests = (guests || []).filter((g) => {
    if (statusFilter === 'all') return true;
    return g.status_key === statusFilter || g.status === statusFilter;
  });

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Guests Directory</Text>
          <Text style={styles.subTitle}>{guests?.length || 0} registered guests</Text>
        </View>
        <Button title="All Referrals" variant="outline" size="sm" onPress={() => navigation.navigate('AllReferrals')} />
      </View>

      <Input
        placeholder="Search by name, phone or room…"
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

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={refetch} />
      ) : !filteredGuests.length ? (
        <EmptyState title="No guests match search" />
      ) : (
        filteredGuests.map((g) => {
          const isHouse = g.status_key === 'in_house' || g.status === 'in_house';
          const isBooked = g.status_key === 'booked' || g.status === 'booked';

          return (
            <Pressable
              key={g.id}
              style={styles.card}
              onPress={() => navigation.navigate('GuestDetails', { guestId: g.id })}
            >
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{g.name}</Text>
                  <Text style={styles.phone}>{g.phone}</Text>
                </View>

                {/* Status Badge */}
                {g.status ? (
                  <View style={[styles.statusBadge, isHouse ? styles.badgeOccupied : isBooked ? styles.badgeBooked : styles.badgeDefault]}>
                    <Text style={[styles.statusText, isHouse ? styles.textOccupied : isBooked ? styles.textBooked : styles.textDefault]}>
                      {isHouse ? `Room ${g.current_room_no || ''} · In-House` : isBooked ? `Booked` : `Checked Out`}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.cardDetails}>
                {g.city ? <Text style={styles.meta}>📍 {g.city}</Text> : null}
                <Text style={styles.meta}>
                  🏨 {g.total_stays ?? (g.stays_count || 1)} stay{(g.total_stays ?? (g.stays_count || 1)) === 1 ? '' : 's'}
                </Text>
                {g.id_proof_type ? (
                  <Text style={styles.meta}>
                    🪪 {g.id_proof_type}{g.id_proof_last4 ? ` ••••${g.id_proof_last4}` : ''}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading },
  subTitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radii.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.textSecondary },
  filterChipTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  card: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  phone: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.xs },
  badgeOccupied: { backgroundColor: colors.infoBg },
  badgeBooked: { backgroundColor: colors.warningBg },
  badgeDefault: { backgroundColor: '#F1F5F9' },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  textOccupied: { color: colors.info },
  textBooked: { color: colors.warning },
  textDefault: { color: '#475569' },
  cardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
});
