import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import { useTodayCheckouts } from '../../api/todayCheckouts';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * Simplified mobile adaptation of the web's Daily Operations / TodayCheckouts.jsx
 * (771 lines on web, including WhatsApp reminders and per-room detail panels not yet
 * ported — see MOBILE_IMPLEMENTATION_PROGRESS.md). Shows today's due check-outs with
 * a working Checkout action against the live backend.
 */
export default function DailyOpsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useTodayCheckouts();
  const [sheet, setSheet] = useState(null);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const list = Array.isArray(data) ? data : (data?.stays || data?.checkouts || []);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <Text style={styles.title}>Today's Check-outs</Text>
      {list.length === 0 ? (
        <EmptyState title="No check-outs due today" />
      ) : (
        list.map((s) => (
          <Pressable key={s.id} style={styles.row} onPress={() => setSheet({ stayId: s.id })}>
            <View style={styles.rowTop}>
              <Text style={styles.guestName}>{s.guest_name}</Text>
              <View style={styles.roomTag}><Text style={styles.roomTagText}>{s.room_no}</Text></View>
            </View>
            <Text style={styles.meta}>
              {fd(s.check_in_date)} → {fd(s.checkout_planned)} · {s.persons} person{s.persons > 1 ? 's' : ''}
            </Text>
            {s.balance != null ? (
              <Text style={[styles.balance, { color: Number(s.balance) > 0 ? colors.danger : colors.success }]}>
                {Number(s.balance) > 0 ? `Due ${inr(s.balance)}` : Number(s.balance) < 0 ? `Refund ${inr(Math.abs(s.balance))}` : 'Fully paid'}
              </Text>
            ) : null}
          </Pressable>
        ))
      )}

      {sheet && <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading, marginBottom: 12 },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guestName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  roomTag: { backgroundColor: colors.secondaryLight, borderRadius: radii.xs, paddingHorizontal: 6, paddingVertical: 2 },
  roomTagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  balance: { fontFamily: fonts.bodySemibold, fontSize: 12.5, marginTop: 4 },
});
