import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import { Input } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { useGuests } from '../../api/guests';
import { colors, fonts, radii } from '../../theme/theme';

export default function GuestsScreen({ navigation }) {
  const [q, setQ] = useState('');
  const { data: guests, isLoading, isError, error, refetch, isRefetching } = useGuests(q);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <View style={styles.header}>
        <Text style={styles.title}>Guests</Text>
        <Button title="All Referrals" variant="outline" size="sm" onPress={() => navigation.navigate('AllReferrals')} />
      </View>
      <Input placeholder="Search by name or phone…" value={q} onChangeText={setQ} style={{ marginBottom: 12 }} />

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message={error?.message} onRetry={refetch} />
      ) : !guests?.length ? (
        <EmptyState title="No guests found" />
      ) : (
        guests.map((g) => (
          <Pressable key={g.id} style={styles.row} onPress={() => navigation.navigate('GuestDetails', { guestId: g.id })}>
            <Text style={styles.name}>{g.name}</Text>
            <Text style={styles.phone}>{g.phone}</Text>
            {g.total_stays != null ? <Text style={styles.meta}>{g.total_stays} stay{g.total_stays === 1 ? '' : 's'}</Text> : null}
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading, flex: 1 },
  phone: { fontFamily: fonts.mono, fontSize: 13, color: colors.textSecondary },
  meta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginLeft: 8 },
});
