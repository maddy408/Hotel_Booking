import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import { useTodayCheckouts } from '../../api/todayCheckouts';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function DailyOpsScreen({ navigation }) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useTodayCheckouts();
  const [activeTab, setActiveTab] = useState('checkins'); // 'checkins' | 'checkouts'
  const [sheet, setSheet] = useState(null);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const checkinsList = data?.checkins || [];
  const checkoutsList = data?.checkouts || (Array.isArray(data) ? data : (data?.stays || []));

  const checkinStats = data?.checkins_stats || { total: checkinsList.length, pending: checkinsList.filter((c) => c.checkin_status === 'pending').length, checked_in: checkinsList.filter((c) => c.checkin_status === 'checked_in').length };
  const checkoutStats = data?.checkouts_stats || data?.stats || { total: checkoutsList.length, pending: checkoutsList.filter((c) => c.checkout_status === 'pending').length, checked_out: checkoutsList.filter((c) => c.checkout_status === 'checked_out').length };

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {/* Tab Switcher: Today's Check-ins vs Today's Check-outs */}
      <View style={styles.topTabs}>
        <Pressable
          style={[styles.topTab, activeTab === 'checkins' && styles.topTabActive]}
          onPress={() => setActiveTab('checkins')}
        >
          <Text style={[styles.topTabText, activeTab === 'checkins' && styles.topTabTextActive]}>
            Today's Check-ins ({checkinsList.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.topTab, activeTab === 'checkouts' && styles.topTabActive]}
          onPress={() => setActiveTab('checkouts')}
        >
          <Text style={[styles.topTabText, activeTab === 'checkouts' && styles.topTabTextActive]}>
            Today's Check-outs ({checkoutsList.length})
          </Text>
        </Pressable>
      </View>

      {/* -------------------- CHECK-INS TAB -------------------- */}
      {activeTab === 'checkins' && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{checkinStats.total || checkinsList.length}</Text>
              <Text style={styles.statLabel}>Expected Today</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.warning }]}>{checkinStats.pending || 0}</Text>
              <Text style={styles.statLabel}>Pending Arrival</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.success }]}>{checkinStats.checked_in || 0}</Text>
              <Text style={styles.statLabel}>Checked In</Text>
            </View>
          </View>

          {checkinsList.length === 0 ? (
            <EmptyState title="No check-ins expected for today" />
          ) : (
            checkinsList.map((item) => {
              const isCheckedIn = item.checkin_status === 'checked_in';
              return (
                <View key={item.reservation_id || item.id} style={styles.row}>
                  <View style={styles.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.guestName}>{item.guest_name}</Text>
                      <Text style={styles.phone}>{item.guest_phone}</Text>
                    </View>
                    <View style={styles.roomTag}>
                      <Text style={styles.roomTagText}>Room {item.room_no}</Text>
                    </View>
                  </View>

                  <View style={styles.rowMeta}>
                    <Text style={styles.meta}>
                      Booking {item.booking_code} · {item.persons || 1} Person(s)
                    </Text>
                    <View style={[styles.statusBadge, isCheckedIn ? styles.badgeSuccess : styles.badgeWarning]}>
                      <Text style={[styles.statusText, isCheckedIn ? styles.textSuccess : styles.textWarning]}>
                        {isCheckedIn ? 'Checked In' : 'Pending Arrival'}
                      </Text>
                    </View>
                  </View>

                  {!isCheckedIn && (
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => setSheet({ type: 'checkin', reservation: item })}
                    >
                      <Text style={styles.actionBtnText}>Process Check-in →</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </>
      )}

      {/* -------------------- CHECK-OUTS TAB -------------------- */}
      {activeTab === 'checkouts' && (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{checkoutStats.total || checkoutsList.length}</Text>
              <Text style={styles.statLabel}>Due Today</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.warning }]}>{checkoutStats.pending || 0}</Text>
              <Text style={styles.statLabel}>In-House</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: colors.success }]}>{checkoutStats.checked_out || 0}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>

          {checkoutsList.length === 0 ? (
            <EmptyState title="No check-outs due today" />
          ) : (
            checkoutsList.map((s) => {
              const isDone = s.checkout_status === 'checked_out' || s.status === 'checked_out';
              return (
                <Pressable
                  key={s.id || s.stay_id}
                  style={styles.row}
                  onPress={() => {
                    if (isDone) {
                      navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId: s.id || s.stay_id, invoiceId: s.invoice_id } });
                    } else {
                      setSheet({ type: 'checkout', stayId: s.id || s.stay_id });
                    }
                  }}
                >
                  <View style={styles.rowTop}>
                    <Text style={styles.guestName}>{s.guest_name}</Text>
                    <View style={styles.roomTag}><Text style={styles.roomTagText}>Room {s.room_no}</Text></View>
                  </View>
                  <Text style={styles.meta}>
                    {fd(s.check_in_date)} → {fd(s.checkout_planned)} · {s.persons || 1} person(s)
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    {s.balance != null ? (
                      <Text style={[styles.balance, { color: Number(s.balance) > 0 ? colors.danger : colors.success }]}>
                        {Number(s.balance) > 0 ? `Due ${inr(s.balance)}` : Number(s.balance) < 0 ? `Refund ${inr(Math.abs(s.balance))}` : 'Fully paid'}
                      </Text>
                    ) : <View />}

                    <View style={[styles.statusBadge, isDone ? styles.badgeSuccess : styles.badgeWarning]}>
                      <Text style={[styles.statusText, isDone ? styles.textSuccess : styles.textWarning]}>
                        {isDone ? 'Checked Out (View Bill)' : 'Check Out →'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </>
      )}

      {sheet?.type === 'checkout' && (
        <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === 'checkin' && (
        <CheckInSheet reservation={sheet.reservation} onClose={() => setSheet(null)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topTabs: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.md, padding: 3, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  topTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radii.sm },
  topTabActive: { backgroundColor: colors.primary },
  topTabText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  topTabTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 10, alignItems: 'center' },
  statNum: { fontFamily: fonts.display, fontSize: 18, color: colors.heading },
  statLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary, marginTop: 2 },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  guestName: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading },
  phone: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  roomTag: { backgroundColor: colors.secondaryLight, borderRadius: radii.xs, paddingHorizontal: 7, paddingVertical: 3 },
  roomTagText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  balance: { fontFamily: fonts.bodySemibold, fontSize: 12.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.xs },
  badgeSuccess: { backgroundColor: colors.successBg },
  badgeWarning: { backgroundColor: colors.warningBg },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
  actionBtn: { marginTop: 10, backgroundColor: colors.primary, borderRadius: radii.sm, paddingVertical: 8, alignItems: 'center' },
  actionBtnText: { color: '#FFFFFF', fontFamily: fonts.bodyBold, fontSize: 12.5 },
});
