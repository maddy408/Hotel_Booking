import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import { useDoneStays } from '../../api/stays';
import { useTodayReport } from '../../api/reports';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function BillsScreen({ navigation }) {
  const { data: stays, isLoading, isError, error, refetch, isRefetching } = useDoneStays();
  const { data: today } = useTodayReport();

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const done = [...stays].sort((a, b) => b.checkout_actual.localeCompare(a.checkout_actual) || b.id - a.id);

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.sectionTitle}>Today</Text>
          <Text style={styles.meta}>{today ? fd(today.date) : ''}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Check-outs</Text><Text style={styles.summaryValue}>{today?.checkouts ?? '—'}</Text></View>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Billed at check-out</Text><Text style={styles.summaryValue}>{inr(today?.billedAtCheckout ?? 0)}</Text></View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>All Bills ({done.length})</Text>
      {done.length === 0 ? (
        <EmptyState title="No bills yet" />
      ) : (
        done.map((s) => (
          <Pressable key={s.id} style={styles.row} onPress={() => navigation.navigate('InvoicePrint', { stayId: s.id })}>
            <View style={styles.rowTop}>
              <Text style={styles.invoiceNo}>{s.invoice_number || `#${s.id}`}</Text>
              <Text style={styles.total}>{inr(s.invoice_total)}</Text>
            </View>
            <Text style={styles.guestName}>{s.guest_name}</Text>
            <Text style={styles.meta}>Room {s.room_no} · {fd(s.check_in_date)} → {fd(s.checkout_actual)} · {(s.payment_method || '').toUpperCase()}</Text>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 20 },
  summaryItem: { gap: 2 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  summaryValue: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.heading },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8, marginTop: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  invoiceNo: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.textSecondary },
  total: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.heading },
  guestName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.heading, marginTop: 2 },
});
