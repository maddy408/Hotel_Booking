import { useState, useCallback } from 'react';
import { Alert, RefreshControl, StyleSheet, Text, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import Screen from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import DateFilter from '../../components/DateFilter.jsx';
import { useTodayReport, useDayEndReport, useOccupancyReport, useRevenueReport, downloadInvoicesCsv, openDownloadedCsv } from '../../api/reports';
import { useToast } from '../../components/ToastContext.jsx';
import { fd, inr, getPresetDateRange } from '../../lib/format';
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
  const [filter, setFilter] = useState(() => getPresetDateRange('today'));
  const { data: periodSummary, refetch: refetchSummary, isRefetching: isSummaryRefetching } = useTodayReport(filter.from, filter.to);
  const { data: dayEnd, refetch: refetchDayEnd, isRefetching: isDayEndRefetching } = useDayEndReport(filter.from, filter.to);
  const { data: occupancy, refetch: refetchOccupancy, isRefetching: isOccRefetching } = useOccupancyReport(filter.from, filter.to);
  const { data: revenue, refetch: refetchRevenue, isRefetching: isRevRefetching } = useRevenueReport(filter.from, filter.to);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const isRefreshing = isSummaryRefetching || isDayEndRefetching || isOccRefetching || isRevRefetching;

  const refetchAll = useCallback(() => {
    refetchSummary();
    refetchDayEnd();
    refetchOccupancy();
    refetchRevenue();
  }, [refetchSummary, refetchDayEnd, refetchOccupancy, refetchRevenue]);

  const exportCsv = async () => {
    // Prevent duplicate downloads from rapid repeated taps
    if (exporting) return;
    setExporting(true);
    try {
      const result = await downloadInvoicesCsv(filter.from, filter.to);
      const filename = result?.filename || 'invoices.csv';
      const fileToOpen = result?.localCacheUri || result?.uri;

      // Show success message only after the file is actually saved
      toast(`Saved ${filename} to Downloads.`);

      Alert.alert(
        'CSV Downloaded',
        `Successfully saved ${filename} to your Downloads folder.`,
        [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Open File',
            onPress: async () => {
              try {
                if (fileToOpen) {
                  await openDownloadedCsv(fileToOpen);
                }
              } catch (openErr) {
                toast(openErr.message || 'Could not open CSV file.');
              }
            },
          },
          {
            text: 'Share File',
            onPress: async () => {
              try {
                if (fileToOpen && (await Sharing.isAvailableAsync())) {
                  await Sharing.shareAsync(fileToOpen, {
                    mimeType: 'text/csv',
                    dialogTitle: `Share ${filename}`,
                    UTI: 'public.comma-separated-values-text',
                  });
                } else if (fileToOpen) {
                  toast('Sharing is not available on this device.');
                }
              } catch (shareErr) {
                toast(shareErr.message || 'Could not share CSV file.');
              }
            },
          },
        ]
      );
    } catch (err) {
      toast(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const periodLabel = filter.preset === 'today' ? 'Today' : filter.label;
  const isSingleDay = filter.from === filter.to;
  const dateSubtext = isSingleDay ? fd(filter.from) : `${fd(filter.from)} → ${fd(filter.to)}`;

  const occSummary = periodSummary?.occupancy;
  const occLabel = occSummary
    ? isSingleDay
      ? `${occSummary.occupied}/${occSummary.total} (${occSummary.percent}%)`
      : `${occSummary.occupied}/${occSummary.total} avg (${occSummary.percent}%)`
    : '—';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={refetchAll}
          colors={[colors.primary]}
        />
      }
    >
      {/* Compact Date Filter Control */}
      <DateFilter value={filter} onChange={setFilter} />

      {/* Card 1: Summary / Period at a glance */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {filter.preset === 'today' ? 'Today at a glance' : `${filter.label} at a glance`}
          </Text>
          <Text style={styles.meta}>{dateSubtext}</Text>
        </View>
        {periodSummary ? (
          <SummaryRow items={[
            ['Check-outs', String(periodSummary.checkouts ?? '—')],
            ['Billed', inr(periodSummary.billedAtCheckout ?? 0)],
            ['Advance taken', inr(periodSummary.advanceTaken ?? 0)],
            ['Occupancy', occLabel],
          ]} />
        ) : null}
      </View>

      {/* Card 2: Day-end / Period collection */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {isSingleDay ? `Day-end collection (${fd(filter.from)})` : `Day-end collection (${periodLabel})`}
          </Text>
          {!isSingleDay ? <Text style={styles.meta}>{dateSubtext}</Text> : null}
        </View>
        {dayEnd ? (
          <SummaryRow items={[
            ['Cash', inr(dayEnd.byMethod?.cash ?? 0)],
            ['UPI', inr(dayEnd.byMethod?.upi ?? 0)],
            ['Card', inr(dayEnd.byMethod?.card ?? 0)],
            ['Total', inr(dayEnd.total ?? 0)],
          ]} />
        ) : null}
      </View>

      {/* Card 3: Revenue & Occupancy Breakdown */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Revenue ({periodLabel})</Text>
          <Button
            title={exporting ? 'Exporting…' : 'Export CSV'}
            variant="outline"
            size="sm"
            loading={exporting}
            disabled={exporting}
            onPress={exportCsv}
          />
        </View>
        {revenue ? (
          <SummaryRow items={[
            ['Invoices', String(revenue.totals?.invoiceCount ?? 0)],
            ['Room revenue', inr(revenue.totals?.roomAmount ?? 0)],
            ['GST collected', inr(revenue.totals?.gstAmount ?? 0)],
            ['Total revenue', inr(revenue.totals?.total ?? 0)],
          ]} />
        ) : null}

        {/* Daily breakdown of occupancy */}
        {occupancy?.days?.length ? (
          <View style={{ marginTop: 14, gap: 4 }}>
            <Text style={[styles.summaryLabel, { marginBottom: 4, fontFamily: fonts.bodyBold }]}>
              Daily Breakdown
            </Text>
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
