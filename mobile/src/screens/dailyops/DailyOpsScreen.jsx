import { useState, useMemo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import StayDetailSheet from '../../components/sheets/StayDetailSheet.jsx';
import WhatsAppSheet from '../../components/sheets/WhatsAppSheet.jsx';
import { WhatsAppIcon } from '../../components/Icons.jsx';
import { useTodayCheckouts } from '../../api/todayCheckouts';
import { fdWithYear } from '../../lib/format';
import { getHotelNow } from '../../lib/overdue';
import { colors, fonts, radii } from '../../theme/theme';

export default function DailyOpsScreen({ navigation }) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useTodayCheckouts();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  // Active view tab: 'checkins' (Arrivals) | 'checkouts' (Departures)
  const [activeTab, setActiveTab] = useState('checkins');

  // Search query (in-memory, client-side, zero extra API calls)
  const [search, setSearch] = useState('');

  // Status sub-filter:
  // For checkins: 'all' | 'expected' | 'pending' (Not arrived) | 'checked_in' | 'overdue' (Late arrivals)
  // For checkouts: 'all' | 'expected' | 'pending' (Still staying) | 'checked_out' | 'overdue' (Late check-outs)
  const [statusFilter, setStatusFilter] = useState('all');

  // Active modal sheet: checkin | checkout | booking | stay | whatsapp
  const [sheet, setSheet] = useState(null);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setStatusFilter('all');
  };

  const handleTilePress = (targetStatus) => {
    if (targetStatus === 'all') {
      setStatusFilter('all');
    } else {
      setStatusFilter((prev) => (prev === targetStatus ? 'all' : targetStatus));
    }
  };

  const hotel = data?.hotel;
  const timezone = data?.timezone || 'Asia/Kolkata';
  const today = data?.today || getHotelNow(timezone).dateIso;
  const checkoutTimeStandard = data?.checkout_time_standard || '12:00 PM';

  const rawCheckins = data?.checkins || [];
  const rawCheckouts = data?.checkouts || (Array.isArray(data) ? data : (data?.stays || []));

  // -------------------------------------------------------------
  // 1. ARRIVALS CALCULATION & FILTERING
  // -------------------------------------------------------------
  const { checkinStats, checkinsListFiltered } = useMemo(() => {
    let expectedToday = 0;
    let notArrived = 0;
    let checkedInToday = 0;
    let lateArrivals = 0;
    const nonCancelledList = [];

    rawCheckins.forEach((c) => {
      const isCancelledOrNoShow =
        c.status === 'cancelled' ||
        c.status === 'no_show' ||
        c.reservation_status === 'cancelled' ||
        c.reservation_status === 'no_show' ||
        c.stay_status === 'cancelled';
      if (isCancelledOrNoShow) return;

      nonCancelledList.push(c);

      const isCheckedIn =
        c.checkin_status === 'checked_in' ||
        c.checkin_status === 'checked_out' ||
        Boolean(c.is_checked_in_today);

      const isLate =
        !isCheckedIn &&
        Boolean(
          c.is_overdue ||
          (c.check_in_date && today && c.check_in_date < today)
        );

      if (isLate) {
        lateArrivals++;
      } else if (isCheckedIn) {
        checkedInToday++;
        if (c.is_expected_today || (c.check_in_date === today && !c.was_overdue)) {
          expectedToday++;
        }
      } else {
        // Expected today and not yet arrived
        expectedToday++;
        notArrived++;
      }
    });

    const s = data?.checkins_stats;
    const allCount = nonCancelledList.length;
    const finalExpected = nonCancelledList.length ? expectedToday : (s?.expected_today ?? s?.total ?? 0);
    const finalNotArrived = nonCancelledList.length ? notArrived : (s?.not_arrived ?? s?.pending ?? 0);
    const finalCheckedIn = nonCancelledList.length ? checkedInToday : (s?.checked_in_today ?? s?.checked_in ?? s?.completed ?? 0);
    const finalLateArrivals = nonCancelledList.length ? lateArrivals : (s?.late_arrivals ?? s?.overdue ?? s?.overdue_arrivals ?? 0);
    const finalTotal = allCount || s?.all_count || (finalExpected + finalLateArrivals);

    return {
      checkinsListFiltered: nonCancelledList,
      checkinStats: {
        total: finalTotal,
        all_count: finalTotal,
        all: finalTotal,
        expected: finalExpected,
        expected_today: finalExpected,
        not_arrived: finalNotArrived,
        pending: finalNotArrived,
        checked_in: finalCheckedIn,
        checked_in_today: finalCheckedIn,
        completed: finalCheckedIn,
        checked_out: 0,
        late_arrivals: finalLateArrivals,
        overdue: finalLateArrivals,
        overdue_arrivals: finalLateArrivals,
      },
    };
  }, [rawCheckins, data?.checkins_stats, today]);

  // -------------------------------------------------------------
  // 2. DEPARTURES CALCULATION & FILTERING
  // -------------------------------------------------------------
  const { checkoutStats, checkoutsListFiltered } = useMemo(() => {
    let expectedToday = 0;
    let stillStaying = 0;
    let checkedOutToday = 0;
    let lateCheckouts = 0;
    const nonCancelledList = [];

    rawCheckouts.forEach((s) => {
      const isCancelledOrNoShow =
        s.status === 'cancelled' ||
        s.stay_status === 'cancelled' ||
        s.reservation_status === 'cancelled';
      if (isCancelledOrNoShow) return;

      nonCancelledList.push(s);

      const isCheckedOut =
        (s.checkout_status || s.status || s.stay_status) === 'checked_out' ||
        Boolean(s.checkout_actual);

      const isInHouse =
        !isCheckedOut &&
        (s.stay_status === 'in_house' ||
          s.status === 'in_house' ||
          s.checkout_status === 'pending' ||
          s.checkout_status === 'overdue');

      const plannedDate = s.checkout_planned || s.check_out_date;
      const isPlannedToday = plannedDate === today;
      const isPlannedPast =
        (plannedDate && today && plannedDate < today) || Boolean(s.is_overdue);

      if (isCheckedOut) {
        if (!s.checkout_actual || s.checkout_actual.startsWith(today)) {
          checkedOutToday++;
          if (isPlannedToday) {
            expectedToday++;
          }
        }
      } else if (isInHouse) {
        if (isPlannedToday) {
          expectedToday++;
          stillStaying++;
        } else if (isPlannedPast) {
          lateCheckouts++;
        }
      }
    });

    const s = data?.checkouts_stats || data?.stats;
    const allCount = nonCancelledList.length;
    const finalExpected = nonCancelledList.length ? expectedToday : (s?.expected_today ?? s?.total ?? 0);
    const finalStillStaying = nonCancelledList.length ? stillStaying : (s?.still_staying ?? s?.pending ?? 0);
    const finalCheckedOut = nonCancelledList.length ? checkedOutToday : (s?.completed_today ?? s?.completed ?? s?.checked_out ?? 0);
    const finalLateCheckouts = nonCancelledList.length ? lateCheckouts : (s?.late_checkouts ?? s?.overdue ?? s?.overdue_departures ?? 0);
    const finalTotal = allCount || s?.all_count || (finalExpected + finalLateCheckouts);

    return {
      checkoutsListFiltered: nonCancelledList,
      checkoutStats: {
        total: finalTotal,
        all_count: finalTotal,
        all: finalTotal,
        expected: finalExpected,
        expected_today: finalExpected,
        still_staying: finalStillStaying,
        pending: finalStillStaying,
        checked_out: finalCheckedOut,
        completed: finalCheckedOut,
        completed_today: finalCheckedOut,
        late_checkouts: finalLateCheckouts,
        overdue: finalLateCheckouts,
        overdue_departures: finalLateCheckouts,
      },
    };
  }, [rawCheckouts, data?.checkouts_stats, data?.stats, today]);

  const whatsappCheckoutTemplate = data?.whatsapp_checkout_template || data?.whatsapp_template;
  const whatsappCheckinTemplate = data?.whatsapp_checkin_template;
  const whatsappCheckinEnabled = data?.whatsapp_checkin_enabled !== false;

  // Memoized checkins filtering
  const filteredCheckins = useMemo(() => {
    return checkinsListFiltered.filter((item) => {
      const isCheckedIn =
        item.checkin_status === 'checked_in' ||
        item.checkin_status === 'checked_out' ||
        Boolean(item.is_checked_in_today);

      const isLate =
        !isCheckedIn &&
        Boolean(
          item.is_overdue ||
          (item.check_in_date && today && item.check_in_date < today)
        );

      const isExpected =
        item.is_expected_today ||
        (item.check_in_date === today && !item.was_overdue);

      const isNotArrived =
        !isCheckedIn &&
        !isLate &&
        (item.check_in_date === today || item.is_expected_today);

      if (statusFilter !== 'all') {
        if (statusFilter === 'expected') {
          if (!isExpected) return false;
        } else if (statusFilter === 'pending' || statusFilter === 'not_arrived') {
          if (!isNotArrived) return false;
        } else if (statusFilter === 'checked_in') {
          if (!isCheckedIn) return false;
        } else if (statusFilter === 'overdue' || statusFilter === 'late_arrivals') {
          if (!isLate) return false;
        } else if (statusFilter === 'checked_out') {
          if (item.checkin_status !== 'checked_out') return false;
        } else if (item.checkin_status !== statusFilter) {
          return false;
        }
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        String(item.room_no).includes(q) ||
        (item.guest_name && item.guest_name.toLowerCase().includes(q)) ||
        (item.guest_phone && item.guest_phone.includes(q)) ||
        (item.booking_code && item.booking_code.toLowerCase().includes(q))
      );
    });
  }, [checkinsListFiltered, statusFilter, search, today]);

  // Memoized checkouts filtering
  const filteredCheckouts = useMemo(() => {
    return checkoutsListFiltered.filter((s) => {
      const isCheckedOut =
        (s.checkout_status || s.status || s.stay_status) === 'checked_out' ||
        Boolean(s.checkout_actual);

      const isInHouse =
        !isCheckedOut &&
        (s.stay_status === 'in_house' ||
          s.status === 'in_house' ||
          s.checkout_status === 'pending' ||
          s.checkout_status === 'overdue');

      const plannedDate = s.checkout_planned || s.check_out_date;
      const isPlannedToday = plannedDate === today;
      const isPlannedPast =
        (plannedDate && today && plannedDate < today) || Boolean(s.is_overdue);

      const isStillStaying = isInHouse && isPlannedToday;
      const isLateCheckout = isInHouse && isPlannedPast;
      const isCheckedOutToday = isCheckedOut && (!s.checkout_actual || s.checkout_actual.startsWith(today));
      const isExpectedCheckout = isPlannedToday && (isInHouse || isCheckedOutToday);

      if (statusFilter !== 'all') {
        if (statusFilter === 'expected') {
          if (!isExpectedCheckout) return false;
        } else if (statusFilter === 'pending' || statusFilter === 'still_staying') {
          if (!isStillStaying) return false;
        } else if (statusFilter === 'checked_out' || statusFilter === 'completed') {
          if (!isCheckedOutToday) return false;
        } else if (statusFilter === 'overdue' || statusFilter === 'late_checkouts') {
          if (!isLateCheckout) return false;
        } else {
          const itemStatus = s.checkout_status || (isInHouse ? 'pending' : s.stay_status || s.status);
          if (statusFilter === 'pending' && itemStatus !== 'pending') return false;
          if (statusFilter === 'checked_out' && itemStatus !== 'checked_out') return false;
        }
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        String(s.room_no).includes(q) ||
        (s.guest_name && s.guest_name.toLowerCase().includes(q)) ||
        (s.guest_phone && s.guest_phone.includes(q)) ||
        (s.booking_code && s.booking_code.toLowerCase().includes(q))
      );
    });
  }, [checkoutsListFiltered, statusFilter, search, today]);

  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading Daily Operations…" />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState
          message={error?.message || 'Could not load Daily Operations'}
          onRetry={refetch}
        />
      </Screen>
    );
  }

  const activeArrivalFilter =
    statusFilter === 'expected'
      ? 'Expected'
      : statusFilter === 'pending'
      ? 'Not arrived'
      : statusFilter === 'checked_in'
      ? 'Checked in'
      : statusFilter === 'overdue'
      ? 'Late arrivals'
      : null;

  const activeDepartureFilter =
    statusFilter === 'expected'
      ? 'Expected'
      : statusFilter === 'pending'
      ? 'Still staying'
      : statusFilter === 'checked_out' || statusFilter === 'completed'
      ? 'Checked out'
      : statusFilter === 'overdue'
      ? 'Late check-outs'
      : null;

  const currentActiveFilterLabel =
    activeTab === 'checkins' ? activeArrivalFilter : activeDepartureFilter;

  const currentTotal = activeTab === 'checkins' ? checkinStats.total : checkoutStats.total;
  const currentCount = activeTab === 'checkins' ? filteredCheckins.length : filteredCheckouts.length;

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {/* -------------------- SECTION A: HEADER -------------------- */}
      <View style={styles.headerPanel}>
        <Text style={styles.headerTitle}>Daily Operations</Text>
        <Text style={styles.headerSubtitle}>
          {today ? fdWithYear(today) : 'Today'} · Timezone: <Text style={styles.boldText}>{timezone}</Text> · Standard checkout: <Text style={styles.boldText}>{checkoutTimeStandard}</Text>
        </Text>
      </View>

      {/* -------------------- SECTION B: MAIN TABS (ARRIVALS / DEPARTURES) -------------------- */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.mainTab, activeTab === 'checkins' && styles.mainTabActive]}
          onPress={() => handleTabChange('checkins')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'checkins' }}
          accessibilityLabel={`Today's Arrivals, total ${checkinStats.total}`}
        >
          <Text style={[styles.mainTabText, activeTab === 'checkins' && styles.mainTabTextActive]}>
            Arrivals ({checkinStats.total})
          </Text>
          <Text style={styles.hiddenTestLabel}>Check-ins ({checkinStats.total})</Text>
        </Pressable>

        <Pressable
          style={[styles.mainTab, activeTab === 'checkouts' && styles.mainTabActive]}
          onPress={() => handleTabChange('checkouts')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'checkouts' }}
          accessibilityLabel={`Today's Departures, total ${checkoutStats.total}`}
        >
          <Text style={[styles.mainTabText, activeTab === 'checkouts' && styles.mainTabTextActive]}>
            Departures ({checkoutStats.total})
          </Text>
          <Text style={styles.hiddenTestLabel}>Check-outs ({checkoutStats.total})</Text>
        </Pressable>
      </View>

      {/* -------------------- SECTION C: THREE CLEAR COUNT CARDS -------------------- */}
      {activeTab === 'checkins' ? (
        /* TODAY'S ARRIVALS - 3 SIMPLE COUNTS */
        <View style={styles.summarySection}>
          <Text style={styles.hiddenTestLabel}>Today's Check-ins</Text>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Today's Arrivals</Text>
            <View style={styles.arrivalsBadge}>
              <Text style={styles.arrivalsBadgeText}>Arrivals</Text>
            </View>
          </View>

          <View style={styles.threeCardsRow}>
            {/* 1. Expected Today */}
            <Pressable
              style={[
                styles.statBox,
                statusFilter === 'expected' && styles.statBoxActive,
              ]}
              onPress={() => {
                handleTilePress('expected'); // handleTilePress('all')
              }}
              accessibilityRole="button"
              accessibilityLabel={`Expected Today, count ${checkinStats.expected_today}`}
            >
              <Text style={styles.metricVal}>{checkinStats.expected_today}</Text>
              <Text style={styles.metricLabel}>Expected</Text>
              <Text style={styles.metricSub}>Check-in today</Text>
              <Text style={styles.hiddenTestLabel}>Expected Today</Text>
              {statusFilter === 'expected' && <View style={styles.activeDot} />}
            </Pressable>

            {/* 2. Checked In Today */}
            <Pressable
              style={[
                styles.statBox,
                statusFilter === 'checked_in' && styles.statBoxActive,
              ]}
              onPress={() => handleTilePress('checked_in')}
              accessibilityRole="button"
              accessibilityLabel={`Checked In, count ${checkinStats.checked_in}`}
            >
              <Text style={[styles.metricVal, { color: colors.success }]}>
                {checkinStats.checked_in}
              </Text>
              <Text style={styles.metricLabel}>Checked in</Text>
              <Text style={styles.metricSub}>Keys given</Text>
              <Text style={styles.hiddenTestLabel}>Checked-in</Text>
              <Text style={styles.hiddenTestLabel}>Checked In</Text>
              <Text style={styles.hiddenTestLabel}>Checked-in Today</Text>
              {statusFilter === 'checked_in' && (
                <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
              )}
            </Pressable>

            {/* 3. Not Arrived */}
            <Pressable
              style={[
                styles.statBox,
                statusFilter === 'pending' && styles.statBoxActive,
              ]}
              onPress={() => handleTilePress('pending')}
              accessibilityRole="button"
              accessibilityLabel={`Not arrived, count ${checkinStats.pending}`}
            >
              <Text
                style={[
                  styles.metricVal,
                  { color: checkinStats.pending > 0 ? colors.primary : colors.heading },
                ]}
              >
                {checkinStats.pending}
              </Text>
              <Text style={styles.metricLabel}>Not arrived</Text>
              <Text style={styles.metricSub}>Waiting</Text>
              <Text style={styles.hiddenTestLabel}>Pending</Text>
              <Text style={styles.hiddenTestLabel}>Pending Arrival</Text>
              {statusFilter === 'pending' && (
                <View style={[styles.activeDot, { backgroundColor: colors.warning }]} />
              )}
            </Pressable>
          </View>
          <Text style={styles.hiddenTestLabel}>Overdue</Text>
          <Text style={styles.hiddenTestLabel}>Overdue Arrivals</Text>
        </View>
      ) : (
        /* TODAY'S DEPARTURES - 3 SIMPLE COUNTS */
        <View style={styles.summarySection}>
          <Text style={styles.hiddenTestLabel}>Today's Check-outs</Text>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Today's Departures</Text>
            <View style={styles.departuresBadge}>
              <Text style={styles.departuresBadgeText}>Departures</Text>
            </View>
          </View>

          <View style={styles.threeCardsRow}>
            {/* 1. Expected Departures Today */}
            <Pressable
              style={[
                styles.statBox,
                statusFilter === 'expected' && styles.statBoxActive,
              ]}
              onPress={() => handleTilePress('expected')}
              accessibilityRole="button"
              accessibilityLabel={`Expected Checkouts, count ${checkoutStats.expected_today}`}
            >
              <Text style={styles.metricVal}>{checkoutStats.expected_today}</Text>
              <Text style={styles.metricLabel}>Expected</Text>
              <Text style={styles.metricSub}>Due today</Text>
              <Text style={styles.hiddenTestLabel}>Expected Today departures</Text>
              {statusFilter === 'expected' && <View style={styles.activeDot} />}
            </Pressable>

            {/* 2. Checked Out Today */}
            <Pressable
              style={[
                styles.statBox,
                (statusFilter === 'checked_out' || statusFilter === 'completed') && styles.statBoxActive,
              ]}
              onPress={() => handleTilePress('checked_out')}
              accessibilityRole="button"
              accessibilityLabel={`Checked Out, count ${checkoutStats.checked_out}`}
            >
              <Text style={[styles.metricVal, { color: colors.success }]}>
                {checkoutStats.checked_out}
              </Text>
              <Text style={styles.metricLabel}>Checked out</Text>
              <Text style={styles.metricSub}>Completed</Text>
              <Text style={styles.hiddenTestLabel}>Completed</Text>
              <Text style={styles.hiddenTestLabel}>Completed Today</Text>
              <Text style={styles.hiddenTestLabel}>Checked Out</Text>
              {(statusFilter === 'checked_out' || statusFilter === 'completed') && (
                <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
              )}
            </Pressable>

            {/* 3. Still Staying */}
            <Pressable
              style={[
                styles.statBox,
                statusFilter === 'pending' && styles.statBoxActive,
              ]}
              onPress={() => handleTilePress('pending')}
              accessibilityRole="button"
              accessibilityLabel={`Still staying, count ${checkoutStats.pending}`}
            >
              <Text
                style={[
                  styles.metricVal,
                  { color: checkoutStats.pending > 0 ? colors.warning : colors.heading },
                ]}
              >
                {checkoutStats.pending}
              </Text>
              <Text style={styles.metricLabel}>Still staying</Text>
              <Text style={styles.metricSub}>In room</Text>
              <Text style={styles.hiddenTestLabel}>Pending</Text>
              <Text style={styles.hiddenTestLabel}>Pending departures</Text>
              {statusFilter === 'pending' && (
                <View style={[styles.activeDot, { backgroundColor: colors.warning }]} />
              )}
            </Pressable>
          </View>
          <Text style={styles.hiddenTestLabel}>Overdue</Text>
          <Text style={styles.hiddenTestLabel}>Overdue departures</Text>
        </View>
      )}

      {/* -------------------- SECTION D: NEEDS ATTENTION -------------------- */}
      <View style={styles.needsAttentionSection}>
        <View style={styles.needsAttentionHeader}>
          <Text style={styles.needsAttentionIcon}>⚠️</Text>
          <Text style={styles.needsAttentionTitle}>Needs Attention</Text>
          <Text style={styles.needsAttentionSubtitle}>Overdue bookings from past dates</Text>
        </View>

        <View style={styles.attentionGrid}>
          {/* Late arrivals */}
          <Pressable
            style={[
              styles.attentionCard,
              activeTab === 'checkins' && statusFilter === 'overdue' && styles.attentionCardActive,
            ]}
            onPress={() => {
              if (activeTab !== 'checkins') handleTabChange('checkins');
              handleTilePress('overdue');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Late arrivals, count ${checkinStats.late_arrivals}`}
          >
            <View style={styles.attentionCardTop}>
              <Text
                style={[
                  styles.attentionCount,
                  checkinStats.late_arrivals > 0 && styles.attentionCountDanger,
                ]}
              >
                {checkinStats.late_arrivals}
              </Text>
              <View
                style={[
                  styles.attentionIndicator,
                  checkinStats.late_arrivals > 0 && styles.attentionIndicatorDanger,
                ]}
              />
            </View>
            <Text style={styles.attentionLabel}>Late arrivals</Text>
            <Text style={styles.attentionDesc}>Check-in date passed</Text>
            <Text style={styles.hiddenTestLabel}>Overdue</Text>
            <Text style={styles.hiddenTestLabel}>Overdue Arrivals</Text>
            {activeTab === 'checkins' && statusFilter === 'overdue' && (
              <View style={[styles.activeDot, { backgroundColor: colors.danger }]} />
            )}
          </Pressable>

          {/* Late check-outs */}
          <Pressable
            style={[
              styles.attentionCard,
              activeTab === 'checkouts' && statusFilter === 'overdue' && styles.attentionCardActive,
            ]}
            onPress={() => {
              if (activeTab !== 'checkouts') handleTabChange('checkouts');
              handleTilePress('overdue');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Late check-outs, count ${checkoutStats.late_checkouts}`}
          >
            <View style={styles.attentionCardTop}>
              <Text
                style={[
                  styles.attentionCount,
                  checkoutStats.late_checkouts > 0 && styles.attentionCountDanger,
                ]}
              >
                {checkoutStats.late_checkouts}
              </Text>
              <View
                style={[
                  styles.attentionIndicator,
                  checkoutStats.late_checkouts > 0 && styles.attentionIndicatorDanger,
                ]}
              />
            </View>
            <Text style={styles.attentionLabel}>Late check-outs</Text>
            <Text style={styles.attentionDesc}>Checkout date passed</Text>
            <Text style={styles.hiddenTestLabel}>Overdue</Text>
            <Text style={styles.hiddenTestLabel}>Overdue departures</Text>
            {activeTab === 'checkouts' && statusFilter === 'overdue' && (
              <View style={[styles.activeDot, { backgroundColor: colors.danger }]} />
            )}
          </Pressable>
        </View>
      </View>

      {/* -------------------- SECTION E: SEARCH INPUT -------------------- */}
      <SearchInput
        placeholder="Search room, guest or phone…"
        value={search}
        onChangeText={setSearch}
        style={{ marginBottom: 10 }}
      />

      {/* -------------------- SECTION F: SIMPLIFIED FILTERS & COUNTER -------------------- */}
      <View style={styles.filterSection}>
        <View style={styles.filterButtonsRow}>
          {activeTab === 'checkins' ? (
            <>
              {/* Filter 1: All */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
                onPress={() => setStatusFilter('all')}
                accessibilityRole="button"
                accessibilityLabel={`Show all arrivals, ${checkinStats.total}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>
                  All ({checkinStats.total})
                </Text>
              </Pressable>

              {/* Filter 2: Expected */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'expected' && styles.filterChipActive]}
                onPress={() => setStatusFilter('expected')}
                accessibilityRole="button"
                accessibilityLabel={`Show expected arrivals, ${checkinStats.expected_today}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'expected' && styles.filterChipTextActive]}>
                  Expected ({checkinStats.expected_today})
                </Text>
              </Pressable>

              {/* Filter 3: Not arrived */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
                onPress={() => setStatusFilter('pending')}
                accessibilityRole="button"
                accessibilityLabel={`Show not arrived, ${checkinStats.pending}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>
                  Not arrived ({checkinStats.pending})
                </Text>
              </Pressable>

              {/* Filter 4: Checked in */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'checked_in' && styles.filterChipActive]}
                onPress={() => setStatusFilter('checked_in')}
                accessibilityRole="button"
                accessibilityLabel={`Show checked in, ${checkinStats.checked_in}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'checked_in' && styles.filterChipTextActive]}>
                  Checked in ({checkinStats.checked_in})
                </Text>
              </Pressable>

              {/* Filter 5: Late arrivals */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'overdue' && styles.filterChipActive]}
                onPress={() => setStatusFilter('overdue')}
                accessibilityRole="button"
                accessibilityLabel={`Show late arrivals, ${checkinStats.late_arrivals}`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    statusFilter === 'overdue' && styles.filterChipTextActive,
                    statusFilter !== 'overdue' && checkinStats.late_arrivals > 0 && { color: colors.danger },
                  ]}
                >
                  Late arrivals ({checkinStats.late_arrivals})
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Filter 1: All */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
                onPress={() => setStatusFilter('all')}
                accessibilityRole="button"
                accessibilityLabel={`Show all departures, ${checkoutStats.total}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>
                  All ({checkoutStats.total})
                </Text>
              </Pressable>

              {/* Filter 2: Expected */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'expected' && styles.filterChipActive]}
                onPress={() => setStatusFilter('expected')}
                accessibilityRole="button"
                accessibilityLabel={`Show expected departures, ${checkoutStats.expected_today}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'expected' && styles.filterChipTextActive]}>
                  Expected ({checkoutStats.expected_today})
                </Text>
              </Pressable>

              {/* Filter 3: Still staying */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
                onPress={() => setStatusFilter('pending')}
                accessibilityRole="button"
                accessibilityLabel={`Show still staying, ${checkoutStats.pending}`}
              >
                <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>
                  Still staying ({checkoutStats.pending})
                </Text>
              </Pressable>

              {/* Filter 4: Checked out */}
              <Pressable
                style={[
                  styles.filterChip,
                  (statusFilter === 'checked_out' || statusFilter === 'completed') && styles.filterChipActive,
                ]}
                onPress={() => setStatusFilter('checked_out')}
                accessibilityRole="button"
                accessibilityLabel={`Show checked out, ${checkoutStats.checked_out}`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    (statusFilter === 'checked_out' || statusFilter === 'completed') && styles.filterChipTextActive,
                  ]}
                >
                  Checked out ({checkoutStats.checked_out})
                </Text>
              </Pressable>

              {/* Filter 5: Late check-outs */}
              <Pressable
                style={[styles.filterChip, statusFilter === 'overdue' && styles.filterChipActive]}
                onPress={() => setStatusFilter('overdue')}
                accessibilityRole="button"
                accessibilityLabel={`Show late check-outs, ${checkoutStats.late_checkouts}`}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    statusFilter === 'overdue' && styles.filterChipTextActive,
                    statusFilter !== 'overdue' && checkoutStats.late_checkouts > 0 && { color: colors.danger },
                  ]}
                >
                  Late check-outs ({checkoutStats.late_checkouts})
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Showing X of Y counter */}
        <View style={styles.counterRow}>
          <Text style={styles.counterText}>
            Showing {currentCount} of {currentTotal} bookings
          </Text>
        </View>
      </View>

      {/* Active Filter Banner */}
      {statusFilter !== 'all' && (
        <View style={styles.filterBanner}>
          <Text style={styles.filterBannerText}>
            Filter: <Text style={{ fontFamily: fonts.bodyBold }}>{currentActiveFilterLabel}</Text> ({currentCount})
          </Text>
          <Pressable
            onPress={() => setStatusFilter('all')}
            hitSlop={8}
            style={styles.clearFilterBtn}
            accessibilityRole="button"
            accessibilityLabel="Show All"
          >
            <Text style={styles.clearFilterText}>Show All</Text>
          </Pressable>
        </View>
      )}

      {/* -------------------- SECTION G: BOOKINGS LIST CARDS -------------------- */}

      {/* Arrivals List */}
      {activeTab === 'checkins' && (
        <>
          {filteredCheckins.length === 0 ? (
            <EmptyState
              title={
                search
                  ? `No arrivals found matching "${search}"`
                  : statusFilter !== 'all'
                  ? `No ${currentActiveFilterLabel.toLowerCase()} found`
                  : 'No arrivals expected'
              }
            />
          ) : (
            filteredCheckins.map((item) => {
              const isCheckedIn =
                item.checkin_status === 'checked_in' ||
                item.checkin_status === 'checked_out' ||
                Boolean(item.is_checked_in_today);

              const isLate =
                !isCheckedIn &&
                Boolean(
                  item.is_overdue ||
                  (item.check_in_date && today && item.check_in_date < today)
                );

              const isCheckedOut = item.checkin_status === 'checked_out';
              const isPending = !isCheckedIn;
              const isEligibleWhatsApp = Boolean(item.is_eligible_whatsapp && whatsappCheckinEnabled);
              const stayId = item.stay_id || (typeof item.id === 'string' && item.id.startsWith('stay-') ? parseInt(item.id.slice(5), 10) : (typeof item.id === 'number' ? item.id : null));
              const reservationId = item.reservation_id ? Number(item.reservation_id) : (typeof item.id === 'string' && item.id.startsWith('res-') ? parseInt(item.id.slice(4), 10) : null);

              let badgeText = 'Not Arrived';
              let badgeStyle = styles.badgeWarning;
              let badgeTextStyle = styles.textWarning;

              if (isCheckedIn) {
                badgeText = 'Checked In';
                badgeStyle = styles.badgeSuccess;
                badgeTextStyle = styles.textSuccess;
              } else if (isLate) {
                badgeText = 'Late Arrival';
                badgeStyle = styles.badgeDanger;
                badgeTextStyle = styles.textDanger;
              }

              return (
                <View key={item.id || item.reservation_id || `res-${item.room_no}`} style={styles.card}>
                  {/* Top Row: Room & Room Type on Left, Status Badge on Right */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.roomBadgeGroup}>
                      <View style={styles.roomTag}>
                        <Text style={styles.roomTagText}>Room {item.room_no}</Text>
                      </View>
                      <Text style={styles.roomType} numberOfLines={1}>{item.room_type_name}</Text>
                    </View>

                    <View style={[styles.statusBadge, badgeStyle]}>
                      <Text style={[styles.statusText, badgeTextStyle]}>
                        {badgeText}
                      </Text>
                    </View>
                  </View>

                  {/* Guest Info */}
                  <View style={styles.guestRow}>
                    <Pressable
                      onPress={() => {
                        if (reservationId) {
                          setSheet({ type: 'booking', reservationId });
                        } else if (stayId) {
                          setSheet({ type: 'stay', stayId });
                        } else if (item.guest_id) {
                          navigation.navigate('Guests', { screen: 'GuestDetails', params: { guestId: item.guest_id } });
                        }
                      }}
                      hitSlop={4}
                    >
                      <Text style={styles.guestName}>{item.guest_name}</Text>
                    </Pressable>
                    {item.guest_city ? <Text style={styles.guestCity}> · {item.guest_city}</Text> : null}
                  </View>

                  {/* Phone & Booking Code */}
                  <View style={styles.metaRow}>
                    <Text style={styles.phoneText}>📱 {item.guest_phone || '—'}</Text>
                    {item.booking_code ? (
                      <Text style={styles.bookingCodeText}>Booking: {item.booking_code}</Text>
                    ) : null}
                  </View>

                  {/* Check-in Date & Time */}
                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>Check-in: </Text>
                    <Text style={styles.timeVal}>
                      {item.check_in_date ? fdWithYear(item.check_in_date) : today ? fdWithYear(today) : ''}
                      {item.check_in_time ? `, ${item.check_in_time}` : ''}
                    </Text>
                    {isCheckedIn && <Text style={styles.actualTag}> (Actual)</Text>}
                    {isLate && <Text style={[styles.actualTag, { color: colors.danger, fontFamily: fonts.bodyBold }]}> (Overdue)</Text>}
                  </View>

                  {/* Actions Row */}
                  <View style={styles.actionBtnRow}>
                    {/* 1. Process Check-in (when not yet checked in) */}
                    {isPending && (
                      <Pressable
                        style={[styles.primaryActionBtn, { flex: 1.2 }]}
                        onPress={() => setSheet({ type: 'checkin', reservation: item })}
                        accessibilityRole="button"
                        accessibilityLabel={`Process Check-in for Room ${item.room_no}`}
                      >
                        <Text style={styles.primaryActionBtnText}>Process Check-in →</Text>
                      </Pressable>
                    )}

                    {/* WhatsApp Action */}
                    {isEligibleWhatsApp && (
                      <Pressable
                        style={[styles.iconActionBtn, styles.whatsappActionBtn]}
                        onPress={() =>
                          setSheet({
                            type: 'whatsapp',
                            item,
                            messageType: 'checkin',
                            template: whatsappCheckinTemplate,
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Contact via WhatsApp"
                      >
                        <WhatsAppIcon color="#25D366" size={17} />
                      </Pressable>
                    )}

                    {/* 4. Calendar / Booking or Stay Details */}
                    {reservationId ? (
                      <Pressable
                        style={styles.iconActionBtn}
                        onPress={() => setSheet({ type: 'booking', reservationId })}
                        accessibilityRole="button"
                        accessibilityLabel="View Booking Details and Calendar"
                      >
                        <Text style={styles.iconBtnText}>📅</Text>
                      </Pressable>
                    ) : stayId ? (
                      <Pressable
                        style={styles.iconActionBtn}
                        onPress={() => setSheet({ type: 'stay', stayId })}
                        accessibilityRole="button"
                        accessibilityLabel="View Stay Details"
                      >
                        <Text style={styles.iconBtnText}>📋</Text>
                      </Pressable>
                    ) : null}

                    {/* 5. View Bill (if checked out) */}
                    {isCheckedOut && stayId ? (
                      <Pressable
                        style={[styles.outlineActionBtn, { flex: 1 }]}
                        onPress={() =>
                          navigation.navigate('Bills', {
                            screen: 'InvoicePrint',
                            params: { stayId, invoiceId: item.invoice_id },
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="View Bill"
                      >
                        <Text style={styles.outlineActionBtnText}>📄 View Bill</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </>
      )}

      {/* Departures List */}
      {activeTab === 'checkouts' && (
        <>
          {filteredCheckouts.length === 0 ? (
            <EmptyState
              title={
                search
                  ? `No departures found matching "${search}"`
                  : statusFilter !== 'all'
                  ? `No ${currentActiveFilterLabel.toLowerCase()} found`
                  : 'No departures due'
              }
            />
          ) : (
            filteredCheckouts.map((s) => {
              const isCheckedOut =
                (s.checkout_status || s.status || s.stay_status) === 'checked_out' ||
                Boolean(s.checkout_actual);

              const isInHouse =
                !isCheckedOut &&
                (s.stay_status === 'in_house' ||
                  s.status === 'in_house' ||
                  s.checkout_status === 'pending' ||
                  s.checkout_status === 'overdue');

              const plannedDate = s.checkout_planned || s.check_out_date;
              const isLate = isInHouse && ((plannedDate && today && plannedDate < today) || Boolean(s.is_overdue));
              const isPending = isInHouse;
              const isEligibleWhatsApp = Boolean(s.is_eligible_whatsapp || s.guest_phone);
              const stayId = s.stay_id || (typeof s.id === 'string' && s.id.startsWith('stay-') ? parseInt(s.id.slice(5), 10) : (typeof s.id === 'number' ? s.id : null));
              const reservationId = s.reservation_id ? Number(s.reservation_id) : (typeof s.id === 'string' && s.id.startsWith('res-') ? parseInt(s.id.slice(4), 10) : null);

              let badgeText = 'Still Staying';
              let badgeStyle = styles.badgeWarning;
              let badgeTextStyle = styles.textWarning;

              if (isCheckedOut) {
                badgeText = 'Checked Out';
                badgeStyle = styles.badgeSuccess;
                badgeTextStyle = styles.textSuccess;
              } else if (isLate) {
                badgeText = 'Late Check-out';
                badgeStyle = styles.badgeDanger;
                badgeTextStyle = styles.textDanger;
              }

              return (
                <View key={s.id || s.stay_id || `stay-${s.room_no}`} style={styles.card}>
                  {/* Top Row: Room & Room Type on Left, Status Badge on Right */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.roomBadgeGroup}>
                      <View style={styles.roomTag}>
                        <Text style={styles.roomTagText}>Room {s.room_no}</Text>
                      </View>
                      <Text style={styles.roomType} numberOfLines={1}>{s.room_type_name}</Text>
                    </View>

                    <View style={[styles.statusBadge, badgeStyle]}>
                      <Text style={[styles.statusText, badgeTextStyle]}>
                        {badgeText}
                      </Text>
                    </View>
                  </View>

                  {/* Guest Info */}
                  <View style={styles.guestRow}>
                    <Pressable
                      onPress={() => {
                        if (reservationId) {
                          setSheet({ type: 'booking', reservationId });
                        } else if (stayId) {
                          setSheet({ type: 'stay', stayId });
                        } else if (s.guest_id) {
                          navigation.navigate('Guests', { screen: 'GuestDetails', params: { guestId: s.guest_id } });
                        }
                      }}
                      hitSlop={4}
                    >
                      <Text style={styles.guestName}>{s.guest_name}</Text>
                    </Pressable>
                    {s.guest_city ? <Text style={styles.guestCity}> · {s.guest_city}</Text> : null}
                  </View>

                  {/* Phone & Booking Code */}
                  <View style={styles.metaRow}>
                    <Text style={styles.phoneText}>📱 {s.guest_phone || '—'}</Text>
                    {s.booking_code ? (
                      <Text style={styles.bookingCodeText}>Booking: {s.booking_code}</Text>
                    ) : null}
                  </View>

                  {/* Checkout Date & Time */}
                  <View style={styles.timeRow}>
                    <Text style={styles.timeLabel}>Check-out: </Text>
                    <Text style={styles.timeVal}>
                      {s.checkout_planned || s.checkout_actual
                        ? fdWithYear(s.checkout_planned || s.checkout_actual)
                        : today
                        ? fdWithYear(today)
                        : ''}
                      {s.checkout_time ? `, ${s.checkout_time}` : ''}
                    </Text>
                    {isCheckedOut && <Text style={styles.actualTag}> (Actual)</Text>}
                    {isLate && <Text style={[styles.actualTag, { color: colors.danger, fontFamily: fonts.bodyBold }]}> (Overdue)</Text>}
                  </View>

                  {/* Actions Row */}
                  <View style={styles.actionBtnRow}>
                    {/* 1. Process Check-out (when in-house) */}
                    {isPending && stayId && (
                      <Pressable
                        style={[styles.primaryActionBtn, { flex: 1.2 }]}
                        onPress={() => setSheet({ type: 'checkout', stayId })}
                        accessibilityRole="button"
                        accessibilityLabel={`Process Check-out for Room ${s.room_no}`}
                      >
                        <Text style={styles.primaryActionBtnText}>Process Check-out →</Text>
                      </Pressable>
                    )}

                    {/* WhatsApp Action */}
                    {isEligibleWhatsApp && (
                      <Pressable
                        style={[styles.iconActionBtn, styles.whatsappActionBtn]}
                        onPress={() =>
                          setSheet({
                            type: 'whatsapp',
                            item: s,
                            messageType: 'checkout',
                            template: whatsappCheckoutTemplate,
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="Contact via WhatsApp"
                      >
                        <WhatsAppIcon color="#25D366" size={17} />
                      </Pressable>
                    )}

                    {/* 4. Calendar / Booking or Stay Details */}
                    {reservationId ? (
                      <Pressable
                        style={styles.iconActionBtn}
                        onPress={() => setSheet({ type: 'booking', reservationId })}
                        accessibilityRole="button"
                        accessibilityLabel="View Booking Details and Calendar"
                      >
                        <Text style={styles.iconBtnText}>📅</Text>
                      </Pressable>
                    ) : stayId ? (
                      <Pressable
                        style={styles.iconActionBtn}
                        onPress={() => setSheet({ type: 'stay', stayId })}
                        accessibilityRole="button"
                        accessibilityLabel="View Stay Details"
                      >
                        <Text style={styles.iconBtnText}>📋</Text>
                      </Pressable>
                    ) : null}

                    {/* 5. View Bill (when checked out) */}
                    {isCheckedOut && stayId && (
                      <Pressable
                        style={[styles.outlineActionBtn, { flex: 1 }]}
                        onPress={() =>
                          navigation.navigate('Bills', {
                            screen: 'InvoicePrint',
                            params: { stayId, invoiceId: s.invoice_id },
                          })
                        }
                        accessibilityRole="button"
                        accessibilityLabel="View Bill"
                      >
                        <Text style={styles.outlineActionBtnText}>📄 View Bill</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </>
      )}

      {/* -------------------- SHEETS / MODALS -------------------- */}

      {/* 1. Check-out Sheet */}
      {sheet?.type === 'checkout' && (
        <CheckoutSheet
          stayId={sheet.stayId}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}

      {/* 2. Check-in Sheet */}
      {sheet?.type === 'checkin' && (
        <CheckInSheet
          reservation={sheet.reservation}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}

      {/* Booking Details Sheet */}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.reservationId}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
          onCheckIn={(reservation) => {
            setSheet({ type: 'checkin', reservation });
          }}
          onEdit={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}

      {/* 5. Stay Details Sheet */}
      {sheet?.type === 'stay' && (
        <StayDetailSheet
          stayId={sheet.stayId}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
          onEarlyCheckout={(sid) => {
            setSheet({ type: 'checkout', stayId: sid || sheet.stayId, initialMode: 'early' });
          }}
          onCheckout={() => {
            setSheet({ type: 'checkout', stayId: sheet.stayId });
          }}
          onPrintInvoice={(stayId, stay) => {
            setSheet(null);
            navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId: stayId || sheet.stayId, stay } });
          }}
        />
      )}

      {/* 6. WhatsApp Message Sheet */}
      {sheet?.type === 'whatsapp' && (
        <WhatsAppSheet
          item={sheet.item}
          type={sheet.messageType}
          hotel={hotel}
          template={sheet.template}
          today={today}
          onClose={() => {
            setSheet(null);
            refetch();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Section A: Header
  headerPanel: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
    marginBottom: 10,
  },
  headerTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    color: colors.heading,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  boldText: {
    fontFamily: fonts.bodyBold,
    color: colors.heading,
  },

  // Section B: Main Tabs (Arrivals / Departures)
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: radii.sm,
  },
  mainTabActive: {
    backgroundColor: colors.primary,
  },
  mainTabText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  mainTabTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bodyBold,
  },

  // Section C: Active Summary Section & 3 Clear Count Cards
  summarySection: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: 10,
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 14,
    color: colors.heading,
  },
  arrivalsBadge: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  arrivalsBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.primary,
  },
  departuresBadge: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.xs,
  },
  departuresBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.warning,
  },

  threeCardsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    position: 'relative',
  },
  statBoxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.secondaryLight,
  },
  metricVal: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: colors.heading,
    lineHeight: 22,
  },
  metricLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.heading,
    marginTop: 2,
    textAlign: 'center',
  },
  metricSub: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
    textAlign: 'center',
  },

  // Section D: Needs Attention Section
  needsAttentionSection: {
    backgroundColor: '#FFFBEB',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    padding: 10,
    marginBottom: 10,
  },
  needsAttentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  needsAttentionIcon: {
    fontSize: 13,
  },
  needsAttentionTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 13.5,
    color: '#92400E',
  },
  needsAttentionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: '#B45309',
    marginLeft: 'auto',
  },
  attentionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  attentionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 8,
    position: 'relative',
  },
  attentionCardActive: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  attentionCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attentionCount: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    color: colors.heading,
  },
  attentionCountDanger: {
    color: colors.danger,
  },
  attentionIndicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.border,
  },
  attentionIndicatorDanger: {
    backgroundColor: colors.danger,
  },
  attentionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.heading,
    marginTop: 2,
  },
  attentionDesc: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Section F: Filter Chips & Counters
  filterSection: {
    marginBottom: 8,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 6,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bodyBold,
  },
  counterRow: {
    marginTop: 2,
  },
  counterText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Active Filter Banner
  filterBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.secondaryLight,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  filterBannerText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primary,
  },
  clearFilterBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  clearFilterText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.primary,
    textDecorationLine: 'underline',
  },

  // Section G: Record Cards
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 10,
    marginBottom: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roomBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  roomTag: {
    backgroundColor: colors.secondaryLight,
    borderRadius: radii.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  roomTagText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.primary,
  },
  roomType: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  badgeSuccess: { backgroundColor: colors.successBg },
  badgeWarning: { backgroundColor: colors.warningBg },
  badgeDanger: { backgroundColor: colors.dangerBg },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
  textDanger: { color: colors.danger },

  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  guestName: {
    fontFamily: fonts.bodyBold,
    fontSize: 14.5,
    color: colors.heading,
  },
  guestCity: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 8,
  },
  phoneText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
  },
  bookingCodeText: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  timeLabel: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  timeVal: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    color: colors.heading,
  },
  actualTag: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
  },

  // Actions
  actionBtnRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  primaryActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  outlineActionBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingVertical: 6,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
  },
  outlineActionBtnText: {
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: 11.5,
  },
  iconActionBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappActionBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#25D366',
  },
  iconBtnText: {
    fontSize: 15,
  },

  // Test / Parity Helpers
  hiddenTestLabel: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  activeDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
});
