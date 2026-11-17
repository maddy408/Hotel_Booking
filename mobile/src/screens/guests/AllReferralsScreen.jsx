import { StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import { useAllReferrals } from '../../api/guests';
import { fd } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * Simplified adaptation of the web's AllReferrals.jsx (729 lines, with filters/export —
 * not yet ported, see MOBILE_IMPLEMENTATION_PROGRESS.md). Lists every referral relationship.
 */
export default function AllReferralsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useAllReferrals();

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const list = Array.isArray(data) ? data : data?.referrals || [];

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Text style={styles.title}>All Referrals ({list.length})</Text>
      {list.length === 0 ? (
        <EmptyState title="No referrals yet" />
      ) : (
        list.map((r, i) => (
          <View key={r.id || i} style={styles.row}>
            <Text style={styles.rowTitle}>{r.referred_guest_name || r.guest_name}</Text>
            <Text style={styles.meta}>Referred by {r.referred_by_guest_name || r.referrer_name} {r.created_at ? `· ${fd(r.created_at.slice(0, 10))}` : ''}</Text>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading, marginBottom: 12 },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8 },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
