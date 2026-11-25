import { useState, useMemo, useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import DateFilter from '../../components/DateFilter.jsx';
import { useDoneStays } from '../../api/stays';
import { useTodayReport } from '../../api/reports';
import { fd, inr, getPresetDateRange } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function BillsScreen({ navigation }) {
  const [filter, setFilter] = useState(() => getPresetDateRange('today'));
  const stayRange = useMemo(() => ({ from: filter.from, to: filter.to }), [filter.from, filter.to]);
  const { data: stays, isLoading, isError, error, refetch: refetchStays, isRefetching: isStaysRefetching } = useDoneStays(stayRange);
  const { data: today, refetch: refetchToday, isRefetching: isTodayRefetching } = useTodayReport(filter.from, filter.to);
  const [search, setSearch] = useState('');

  const refetchAll = useCallback(() => {
    refetchStays();
    refetchToday();
  }, [refetchStays, refetchToday]);

  // Refetch latest bills and today summary whenever Bills screen gains navigation focus
  useFocusEffect(
    useCallback(() => {
      refetchAll();
    }, [refetchAll])
  );

  const filteredDone = useMemo(() => {
    const list = [...(stays || [])].sort((a, b) => (b.checkout_actual || '').localeCompare(a.checkout_actual || '') || b.id - a.id);
    if (!search.trim()) return list;
    const q = search.toLowerCase().trim();
    return list.filter((s) => (
      (s.invoice_number && s.invoice_number.toLowerCase().includes(q)) ||
      (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
      (s.room_no && String(s.room_no).includes(q)) ||
      (s.guest_phone && s.guest_phone.includes(q))
    ));
  }, [stays, search]);

  const periodLabel = filter.preset === 'today' ? 'Today' : filter.label;
  const isSingleDay = filter.from === filter.to;
  const dateSubtext = isSingleDay ? fd(filter.from) : `${fd(filter.from)} → ${fd(filter.to)}`;

  // Use backend summary totals, falling back to loaded stay records
  const checkoutsCount = today?.checkouts ?? (stays ? stays.length : '—');
  const billedAmount = today?.billedAtCheckout ?? (stays ? stays.reduce((sum, s) => sum + (Number(s.invoice_total) || 0), 0) : 0);

  const renderHeader = useMemo(() => (
    <View style={styles.headerContainer}>
      <DateFilter value={filter} onChange={setFilter} />

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.sectionTitle}>{periodLabel}</Text>
          <Text style={styles.meta}>{dateSubtext}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Check-outs</Text>
            <Text style={styles.summaryValue}>{checkoutsCount}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Billed at check-out</Text>
            <Text style={styles.summaryValue}>{inr(billedAmount)}</Text>
          </View>
        </View>
      </View>

      <SearchInput
        placeholder="Search invoice no, guest, or room…"
        value={search}
        onChangeText={setSearch}
        style={{ marginBottom: 12 }}
      />

      <Text style={styles.sectionTitle}>
        {filter.preset === 'today' ? `Today's Bills (${filteredDone.length})` : `Bills (${filteredDone.length})`}
      </Text>
    </View>
  ), [filter, periodLabel, dateSubtext, checkoutsCount, billedAmount, search, filteredDone.length]);

  if (isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (isError) return <Screen scroll={false}><ErrorState message={error?.message} onRetry={refetchAll} /></Screen>;

  const renderBillItem = ({ item: s }) => (
    <Pressable
      key={s.id}
      style={styles.row}
      onPress={() => navigation.navigate('InvoicePrint', { stayId: s.id, invoiceId: s.invoice_id })}
    >
      <View style={styles.rowTop}>
        <Text style={styles.invoiceNo}>{s.invoice_number || `#${s.id}`}</Text>
        <Text style={styles.total}>{inr(s.invoice_total)}</Text>
      </View>
      <Text style={styles.guestName}>{s.guest_name}</Text>
      <Text style={styles.meta}>
        Room {s.room_no} · {fd(s.check_in_date)} → {fd(s.checkout_actual)} · {(s.payment_method || '').toUpperCase()}
      </Text>
    </Pressable>
  );

  return (
    <Screen scroll={false} contentStyle={{ padding: 0 }}>
      <FlatList
        data={filteredDone}
        keyExtractor={(s) => String(s.id)}
        renderItem={renderBillItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <EmptyState
            title={search.trim() ? "No bills found" : `No bills for ${periodLabel.toLowerCase()}`}
          />
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isStaysRefetching || isTodayRefetching}
            onRefresh={refetchAll}
            colors={[colors.primary]}
          />
        }
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 32 },
  headerContainer: { marginBottom: 8 },
  summaryCard: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', gap: 20 },
  summaryItem: { gap: 2 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  summaryValue: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.heading },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between' },
  invoiceNo: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.textSecondary },
  total: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.heading },
  guestName: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.heading, marginTop: 2 },
});
