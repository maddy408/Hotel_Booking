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
      {/* 1. Date Filter Control */}
      <DateFilter value={filter} onChange={setFilter} />

      {/* 2. Today at a Glance - Responsive 2-Column Layout */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {filter.preset === 'today' ? 'Today at a glance' : `${filter.label} at a glance`}
          </Text>
          <Text style={styles.meta}>{dateSubtext}</Text>
        </View>
        <View style={styles.grid2Col}>
          <View style={styles.glanceItem}>
            <Text style={styles.glanceLabel}>Check-outs</Text>
            <Text style={styles.glanceValue}>{periodSummary?.checkouts ?? '—'}</Text>
          </View>
          <View style={styles.glanceItem}>
            <Text style={styles.glanceLabel}>Billed</Text>
            <Text style={styles.glanceValue}>{inr(periodSummary?.billedAtCheckout ?? 0)}</Text>
          </View>
          <View style={styles.glanceItem}>
            <Text style={styles.glanceLabel}>Advance taken</Text>
            <Text style={styles.glanceValue}>{inr(periodSummary?.advanceTaken ?? 0)}</Text>
          </View>
          <View style={styles.glanceItem}>
            <Text style={styles.glanceLabel}>Balance collected</Text>
            <Text style={styles.glanceValue}>{inr(periodSummary?.balanceCollected ?? 0)}</Text>
          </View>
          <View style={[styles.glanceItem, styles.glanceItemFull]}>
            <Text style={styles.glanceLabel}>Occupancy</Text>
            <Text style={styles.glanceValue}>{occLabel}</Text>
          </View>
        </View>
      </View>

      {/* 3. Money Received - Cash, UPI, Card side by side & Total below */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Money Received</Text>
          <Text style={styles.meta}>
            {isSingleDay ? `Day-end collection (${fd(filter.from)})` : `Day-end collection (${periodLabel})`}
          </Text>
        </View>
        <View style={styles.methodsRow}>
          <View style={styles.methodBox}>
            <Text style={styles.methodLabel}>Cash</Text>
            <Text style={styles.methodValue}>{inr(dayEnd?.byMethod?.cash ?? 0)}</Text>
          </View>
          <View style={styles.methodBox}>
            <Text style={styles.methodLabel}>UPI</Text>
            <Text style={styles.methodValue}>{inr(dayEnd?.byMethod?.upi ?? 0)}</Text>
          </View>
          <View style={styles.methodBox}>
            <Text style={styles.methodLabel}>Card</Text>
            <Text style={styles.methodValue}>{inr(dayEnd?.byMethod?.card ?? 0)}</Text>
          </View>
        </View>
        <View style={styles.totalReceivedRow}>
          <Text style={styles.totalReceivedLabel}>Total Received</Text>
          <Text style={styles.totalReceivedValue}>{inr(dayEnd?.total ?? 0)}</Text>
        </View>
      </View>

      {/* 4. Revenue Summary - Simple Rows with Highlighted Total at Bottom */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Revenue Summary</Text>
            <Text style={styles.meta}>{periodLabel}</Text>
          </View>
          <Button
            title={exporting ? 'Exporting…' : 'Export CSV'}
            variant="outline"
            size="sm"
            loading={exporting}
            disabled={exporting}
            onPress={exportCsv}
            style={styles.compactExportBtn}
          />
        </View>

        <View style={styles.revenueRows}>
          <View style={styles.simpleRow}>
            <Text style={styles.simpleLabel}>Invoices</Text>
            <Text style={styles.simpleValue}>{revenue?.totals?.invoiceCount ?? 0}</Text>
          </View>
          <View style={styles.simpleRow}>
            <Text style={styles.simpleLabel}>Room revenue</Text>
            <Text style={styles.simpleValue}>{inr(revenue?.totals?.roomAmount ?? 0)}</Text>
          </View>
          <View style={styles.simpleRow}>
            <Text style={styles.simpleLabel}>GST collected</Text>
            <Text style={styles.simpleValue}>{inr(revenue?.totals?.gstAmount ?? 0)}</Text>
          </View>
          <View style={[styles.simpleRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.simpleLabel}>Discount</Text>
            <Text style={styles.simpleValue}>{inr(revenue?.totals?.discountAmount ?? 0)}</Text>
          </View>
        </View>

        <View style={styles.totalRevenueRow}>
          <Text style={styles.totalRevenueLabel}>Total revenue</Text>
          <Text style={styles.totalRevenueValue}>{inr(revenue?.totals?.total ?? 0)}</Text>
        </View>

        {/* Daily breakdown of occupancy */}
        {occupancy?.days?.length > 1 ? (
          <View style={styles.occSection}>
            <Text style={styles.occTitle}>
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
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.heading,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  mono: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.text,
  },

  /* Today at a Glance: 2-Column Responsive Grid */
  grid2Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  glanceItem: {
    width: '48.5%',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  glanceItemFull: {
    width: '100%',
  },
  glanceLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  glanceValue: {
    fontFamily: fonts.mono,
    fontSize: 15,
    fontWeight: '700',
    color: colors.heading,
  },

  /* Money Received: Cash, UPI, Card side-by-side */
  methodsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  methodBox: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  methodLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  methodValue: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '700',
    color: colors.heading,
  },
  totalReceivedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.secondaryLight,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  totalReceivedLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.primaryDark,
  },
  totalReceivedValue: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },

  /* Revenue Summary: Simple rows with bottom highlight */
  compactExportBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  revenueRows: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  simpleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  simpleLabel: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textSecondary,
  },
  simpleValue: {
    fontFamily: fonts.mono,
    fontSize: 13.5,
    fontWeight: '600',
    color: colors.heading,
  },
  totalRevenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.secondaryLight,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  totalRevenueLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.primaryDark,
  },
  totalRevenueValue: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },

  /* Occupancy daily breakdown */
  occSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: 4,
  },
  occTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  occRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
