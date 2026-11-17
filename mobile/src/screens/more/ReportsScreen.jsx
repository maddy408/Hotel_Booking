import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Screen from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { useTodayReport, useDayEndReport, useOccupancyReport, useRevenueReport, downloadInvoicesCsv } from '../../api/reports';
import { useToast } from '../../components/ToastContext.jsx';
import { addDaysIso, fd, inr, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

function SummaryRow({ items }) {
  return (
    <View style={styles.summaryRow}>
      {items.map(([label, value]) => (
        <View key={label} style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={styles.summaryValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ReportsScreen() {
  const { data: today } = useTodayReport();
  const [dayEndDate] = useState(todayIso());
  const { data: dayEnd } = useDayEndReport(dayEndDate);
  const [range] = useState({ from: addDaysIso(todayIso(), -6), to: todayIso() });
  const { data: occupancy } = useOccupancyReport(range.from, range.to);
  const { data: revenue } = useRevenueReport(range.from, range.to);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadInvoicesCsv(range.from, range.to);
    } catch (err) {
      toast(err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Today at a glance</Text>
          <Text style={styles.meta}>{today ? fd(today.date) : ''}</Text>
        </View>
        {today ? (
          <SummaryRow items={[
            ['Check-outs', String(today.checkouts)],
            ['Billed', inr(today.billedAtCheckout)],
            ['Advance taken', inr(today.advanceTaken)],
            ['Occupancy', `${today.occupancy.occupied}/${today.occupancy.total} (${today.occupancy.percent}%)`],
          ]} />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Day-end collection ({fd(dayEndDate)})</Text>
        {dayEnd ? (
          <SummaryRow items={[
            ['Cash', inr(dayEnd.byMethod.cash)],
            ['UPI', inr(dayEnd.byMethod.upi)],
            ['Card', inr(dayEnd.byMethod.card)],
            ['Total', inr(dayEnd.total)],
          ]} />
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Revenue (last 7 days)</Text>
          <Button title={exporting ? 'Exporting…' : 'Export CSV'} variant="outline" size="sm" loading={exporting} onPress={exportCsv} />
        </View>
        {revenue ? (
          <SummaryRow items={[
            ['Invoices', String(revenue.totals.invoiceCount)],
            ['Room revenue', inr(revenue.totals.roomAmount)],
            ['GST collected', inr(revenue.totals.gstAmount)],
            ['Total revenue', inr(revenue.totals.total)],
          ]} />
        ) : null}
        {occupancy ? (
          <View style={{ marginTop: 10, gap: 4 }}>
            {occupancy.days.map((d) => (
              <View key={d.date} style={styles.occRow}>
                <Text style={styles.meta}>{fd(d.date)}</Text>
                <Text style={styles.mono}>{d.occupied}/{d.total} ({d.percent}%)</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.text },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  summaryItem: { gap: 2, minWidth: '40%' },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  summaryValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.heading },
  occRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 4 },
});
