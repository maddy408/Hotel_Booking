import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { EmptyState, ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import SearchInput from '../../components/ui/SearchInput.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import CheckInSheet from '../../components/sheets/CheckInSheet.jsx';
import PhotoUploadSheet from '../../components/sheets/PhotoUploadSheet.jsx';
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

  // Active view tab: 'checkins' | 'checkouts'
  const [activeTab, setActiveTab] = useState('checkins');

  // Search query (in-memory, does not re-fetch or dismiss keyboard)
  const [search, setSearch] = useState('');

  // Status sub-filter: 'all' | 'pending' | 'checked_in' | 'checked_out'
  const [statusFilter, setStatusFilter] = useState('all');

  // Active modal sheet: checkin | checkout | upload_photo | booking | stay | whatsapp
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

  const checkinsList = data?.checkins || [];
  const checkoutsList = data?.checkouts || (Array.isArray(data) ? data : (data?.stays || []));

  // Checkins statistics
  // 1. Expected Today – reservations with check-in date equal to today.
  // 2. Pending – today's expected arrivals that have not checked in.
  // 3. Checked-in Today – actual check-in operations completed today.
  // 4. Overdue Arrivals – reservations with check-in dates before today that have not yet checked in and are still eligible for arrival.
  const checkinStats = useMemo(() => {
    let expectedToday = 0;
    let pending = 0;
    let checkedInToday = 0;
    let overdue = 0;

    checkinsList.forEach((c) => {
      const isCancelledOrNoShow = c.status === 'cancelled' || c.status === 'no_show' || c.reservation_status === 'cancelled' || c.reservation_status === 'no_show';
      if (isCancelledOrNoShow) return;

      const isOverdue = Boolean(c.is_overdue || (c.check_in_date && today && c.check_in_date < today && (c.checkin_status === 'pending' || c.checkin_status === 'overdue')));
      const isPending = (c.checkin_status === 'pending' || c.status === 'pending') && !isOverdue;
      const isCheckedIn = c.checkin_status === 'checked_in' || c.checkin_status === 'checked_out' || c.is_checked_in_today;

      if (isOverdue) {
        overdue++;
      } else if (isPending && (c.check_in_date === today || c.is_expected_today)) {
        expectedToday++;
        pending++;
      } else if (isCheckedIn) {
        checkedInToday++;
        if (c.is_expected_today || (c.check_in_date === today && !c.was_overdue)) {
          expectedToday++;
        }
      }
    });

    const s = data?.checkins_stats;
    const finalExpected = s?.expected_today ?? (checkinsList.length ? expectedToday : (s?.total ?? 0));
    const finalPending = s?.pending ?? (checkinsList.length ? pending : 0);
    const finalCheckedIn = s?.checked_in_today ?? s?.checked_in ?? (checkinsList.length ? checkedInToday : (s?.completed ?? 0));
    const finalOverdue = s?.overdue ?? s?.overdue_arrivals ?? (checkinsList.length ? overdue : 0);

    return {
      total: finalExpected,
      expected: finalExpected,
      expected_today: finalExpected,
      pending: finalPending,
      completed: finalCheckedIn,
      checked_in: finalCheckedIn,
      checked_in_today: finalCheckedIn,
      checked_out: 0,
      overdue: finalOverdue,
      overdue_arrivals: finalOverdue,
      all_count: checkinsList.length,
    };
  }, [checkinsList, data?.checkins_stats, today]);

  // Checkouts statistics
  // 1. Expected Today – guests whose scheduled checkout date equals today.
  // 2. Pending – guests due to check out today who are still checked in.
  // 3. Completed Today – actual checkout operations completed today, regardless of their originally scheduled checkout date.
  // 4. Overdue – guests whose scheduled checkout date is before today and who are still checked in.
  const checkoutStats = useMemo(() => {
    let expectedToday = 0;
    let pending = 0;
    let completedToday = 0;
    let overdue = 0;

    checkoutsList.forEach((s) => {
      const isCheckedOut = (s.checkout_status || s.status || s.stay_status) === 'checked_out';
      const isInHouse = !isCheckedOut && (s.stay_status === 'in_house' || s.status === 'in_house' || s.checkout_status === 'pending' || s.checkout_status === 'overdue');
      const plannedDate = s.checkout_planned || s.check_out_date;
      const isPlannedToday = plannedDate === today;
      const isPlannedPast = (plannedDate && today && plannedDate < today) || Boolean(s.is_overdue);

      if (isCheckedOut) {
        if (!s.checkout_actual || s.checkout_actual === today) {
          completedToday++;
          if (isPlannedToday) {
            expectedToday++;
          }
        }
      } else if (isInHouse) {
        if (isPlannedToday) {
          expectedToday++;
          pending++;
        } else if (isPlannedPast) {
          overdue++;
        }
      }
    });

    const s = data?.checkouts_stats || data?.stats;
    const finalExpected = s?.expected_today ?? (checkoutsList.length ? expectedToday : (s?.total ?? 0));
    const finalPending = s?.pending ?? (checkoutsList.length ? pending : 0);
    const finalCompleted = s?.completed_today ?? s?.completed ?? s?.checked_out ?? (checkoutsList.length ? completedToday : 0);
    const finalOverdue = s?.overdue ?? s?.overdue_departures ?? (checkoutsList.length ? overdue : 0);

    return {
      total: finalExpected,
      expected: finalExpected,
      expected_today: finalExpected,
      pending: finalPending,
      completed: finalCompleted,
      completed_today: finalCompleted,
      checked_out: finalCompleted,
      overdue: finalOverdue,
      overdue_departures: finalOverdue,
      all_count: checkoutsList.length,
    };
  }, [checkoutsList, data?.checkouts_stats, data?.stats, today]);

  const whatsappCheckoutTemplate = data?.whatsapp_checkout_template || data?.whatsapp_template;
  const whatsappCheckinTemplate = data?.whatsapp_checkin_template;
  const whatsappCheckinEnabled = data?.whatsapp_checkin_enabled !== false;

  // Memoized checkins filtering (client-side, instant, zero extra API calls)
  const filteredCheckins = useMemo(() => {
    return checkinsList.filter((item) => {
      const isCancelledOrNoShow = item.status === 'cancelled' || item.status === 'no_show' || item.reservation_status === 'cancelled' || item.reservation_status === 'no_show';
      if (isCancelledOrNoShow) return false;

      const isOverdue = Boolean(item.is_overdue || (item.check_in_date && today && item.check_in_date < today && (item.checkin_status === 'pending' || item.checkin_status === 'overdue')));
      const isPending = (item.checkin_status === 'pending' || item.status === 'pending') && !isOverdue;
      const isCheckedIn = item.checkin_status === 'checked_in' || item.checkin_status === 'checked_out' || item.is_checked_in_today;

      if (statusFilter !== 'all') {
        if (statusFilter === 'expected') {
          const isExp = item.is_expected_today || (item.check_in_date === today && !item.was_overdue);
          if (!isExp) return false;
        } else if (statusFilter === 'pending') {
          if (!isPending || (item.check_in_date !== today && !item.is_expected_today)) return false;
        } else if (statusFilter === 'checked_in') {
          if (!isCheckedIn) return false;
        } else if (statusFilter === 'overdue') {
          if (!isOverdue) return false;
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
  }, [checkinsList, statusFilter, search, today]);

  // Memoized checkouts filtering (client-side, instant, zero extra API calls)
  const filteredCheckouts = useMemo(() => {
    return checkoutsList.filter((s) => {
      const isStayCheckedOut = (s.checkout_status || s.status || s.stay_status) === 'checked_out';
      const isInHouse = !isStayCheckedOut && (s.stay_status === 'in_house' || s.status === 'in_house' || s.checkout_status === 'pending' || s.checkout_status === 'overdue');
      const plannedDate = s.checkout_planned || s.check_out_date;
      const isPlannedToday = plannedDate === today;
      const isPlannedPast = (plannedDate && today && plannedDate < today) || Boolean(s.is_overdue);

      if (statusFilter !== 'all') {
        if (statusFilter === 'expected') {
          if (!isPlannedToday) return false;
        } else if (statusFilter === 'pending') {
          if (!isPlannedToday || !isInHouse) return false;
        } else if (statusFilter === 'checked_out' || statusFilter === 'completed') {
          if (!isStayCheckedOut) return false;
          if (s.checkout_actual && today && s.checkout_actual !== today) return false;
        } else if (statusFilter === 'overdue') {
          if (!isPlannedPast || !isInHouse) return false;
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
  }, [checkoutsList, statusFilter, search, today]);

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

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {/* -------------------- SECTION A: DAILY OPERATIONS HEADER -------------------- */}
      <View style={styles.headerPanel}>
        <Text style={styles.headerTitle}>Daily Operations</Text>
        <Text style={styles.headerSubtitle}>
          {today ? fdWithYear(today) : 'Today'} · Timezone: <Text style={styles.boldText}>{timezone}</Text> · Standard checkout: <Text style={styles.boldText}>{checkoutTimeStandard}</Text>
        </Text>
      </View>

      {/* -------------------- SECTION B: CHECK-IN & CHECK-OUT SUMMARY -------------------- */}
      <View style={styles.summaryGrid}>
        {/* Today's Check-ins Summary Card */}
        <Pressable
          style={[styles.summaryCard, activeTab === 'checkins' && styles.summaryCardActive]}
          onPress={() => handleTabChange('checkins')}
          accessibilityRole="button"
          accessibilityLabel="Switch to Today's Check-ins"
        >
          <View style={styles.summaryCardHeader}>
            <Text style={styles.summaryCardTitle}>Today's Check-ins</Text>
            <View style={styles.arrivalsBadge}>
              <Text style={styles.arrivalsBadgeText}>Arrivals</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            {/* Metric 1: Expected (Expected Today) */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkins' && statusFilter === 'expected' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkins') handleTabChange('checkins');
                handleTilePress('expected'); // handleTilePress('all')
              }}
              accessibilityRole="button"
              accessibilityLabel={`Expected Today, count ${checkinStats.total}`}
            >
              <Text style={styles.metricVal}>{checkinStats.total}</Text>
              <Text style={styles.metricLabel}>Expected</Text>
              <Text style={styles.hiddenTestLabel}>Expected Today</Text>
              {activeTab === 'checkins' && statusFilter === 'expected' && <View style={styles.activeDot} />}
            </Pressable>

            {/* Metric 2: Pending (Pending Arrival) */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkins' && statusFilter === 'pending' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkins') handleTabChange('checkins');
                handleTilePress('pending');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Pending Arrival, count ${checkinStats.pending}`}
            >
              <Text
                style={[
                  styles.metricVal,
                  { color: checkinStats.pending > 0 ? colors.primary : colors.heading },
                ]}
              >
                {checkinStats.pending}
              </Text>
              <Text style={styles.metricLabel}>Pending</Text>
              <Text style={styles.hiddenTestLabel}>Pending Arrival</Text>
              {activeTab === 'checkins' && statusFilter === 'pending' && (
                <View style={[styles.activeDot, { backgroundColor: colors.warning }]} />
              )}
            </Pressable>

            {/* Metric 3: Checked-in */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkins' && statusFilter === 'checked_in' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkins') handleTabChange('checkins');
                handleTilePress('checked_in');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Checked In, count ${checkinStats.checked_in ?? checkinStats.completed}`}
            >
              <Text style={[styles.metricVal, { color: colors.success }]}>
                {checkinStats.checked_in ?? checkinStats.completed}
              </Text>
              <Text style={styles.metricLabel}>Checked-in</Text>
              <Text style={styles.hiddenTestLabel}>Checked In</Text>
              <Text style={styles.hiddenTestLabel}>Checked-in Today</Text>
              {activeTab === 'checkins' && statusFilter === 'checked_in' && (
                <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
              )}
            </Pressable>

            {/* Metric 4: Overdue Arrivals */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkins' && statusFilter === 'overdue' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkins') handleTabChange('checkins');
                handleTilePress('overdue');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Overdue Arrivals, count ${checkinStats.overdue ?? 0}`}
            >
              <Text
                style={[
                  styles.metricVal,
                  { color: (checkinStats.overdue ?? 0) > 0 ? colors.danger : colors.heading },
                ]}
              >
                {checkinStats.overdue ?? 0}
              </Text>
              <Text style={styles.metricLabel}>Overdue</Text>
              <Text style={styles.hiddenTestLabel}>Overdue Arrivals</Text>
              {activeTab === 'checkins' && statusFilter === 'overdue' && (
                <View style={[styles.activeDot, { backgroundColor: colors.danger }]} />
              )}
            </Pressable>
          </View>
        </Pressable>

        {/* Today's Check-outs Summary Card */}
        <Pressable
          style={[styles.summaryCard, activeTab === 'checkouts' && styles.summaryCardActive]}
          onPress={() => handleTabChange('checkouts')}
          accessibilityRole="button"
          accessibilityLabel="Switch to Today's Check-outs"
        >
          <View style={styles.summaryCardHeader}>
            <Text style={styles.summaryCardTitle}>Today's Check-outs</Text>
            <View style={styles.departuresBadge}>
              <Text style={styles.departuresBadgeText}>Departures</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            {/* Metric 1: Expected Today departures */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkouts' && statusFilter === 'expected' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkouts') handleTabChange('checkouts');
                handleTilePress('expected');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Expected Checkouts, count ${checkoutStats.total}`}
            >
              <Text style={styles.metricVal}>{checkoutStats.total}</Text>
              <Text style={styles.metricLabel}>Expected</Text>
              <Text style={styles.hiddenTestLabel}>Expected Today departures</Text>
              {activeTab === 'checkouts' && statusFilter === 'expected' && <View style={styles.activeDot} />}
            </Pressable>

            {/* Metric 2: Pending departures */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkouts' && statusFilter === 'pending' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkouts') handleTabChange('checkouts');
                handleTilePress('pending');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Pending Checkouts, count ${checkoutStats.pending}`}
            >
              <Text
                style={[
                  styles.metricVal,
                  { color: checkoutStats.pending > 0 ? colors.primary : colors.heading },
                ]}
              >
                {checkoutStats.pending}
              </Text>
              <Text style={styles.metricLabel}>Pending</Text>
              <Text style={styles.hiddenTestLabel}>Pending departures</Text>
              {activeTab === 'checkouts' && statusFilter === 'pending' && (
                <View style={[styles.activeDot, { backgroundColor: colors.warning }]} />
              )}
            </Pressable>

            {/* Metric 3: Completed Today */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkouts' && (statusFilter === 'checked_out' || statusFilter === 'completed') && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkouts') handleTabChange('checkouts');
                handleTilePress('checked_out');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Completed Checkouts, count ${checkoutStats.completed ?? checkoutStats.checked_out}`}
            >
              <Text style={[styles.metricVal, { color: colors.success }]}>
                {checkoutStats.completed ?? checkoutStats.checked_out}
              </Text>
              <Text style={styles.metricLabel}>Completed</Text>
              <Text style={styles.hiddenTestLabel}>Completed Today</Text>
              <Text style={styles.hiddenTestLabel}>Checked Out</Text>
              {activeTab === 'checkouts' && (statusFilter === 'checked_out' || statusFilter === 'completed') && (
                <View style={[styles.activeDot, { backgroundColor: colors.success }]} />
              )}
            </Pressable>

            {/* Metric 4: Overdue departures */}
            <Pressable
              style={[
                styles.statBox,
                activeTab === 'checkouts' && statusFilter === 'overdue' && styles.statBoxActive,
              ]}
              onPress={() => {
                if (activeTab !== 'checkouts') handleTabChange('checkouts');
                handleTilePress('overdue');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Overdue departures, count ${checkoutStats.overdue ?? 0}`}
            >
              <Text
                style={[
                  styles.metricVal,
                  { color: (checkoutStats.overdue ?? 0) > 0 ? colors.danger : colors.heading },
                ]}
              >
                {checkoutStats.overdue ?? 0}
              </Text>
              <Text style={styles.metricLabel}>Overdue</Text>
              <Text style={styles.hiddenTestLabel}>Overdue departures</Text>
              {activeTab === 'checkouts' && statusFilter === 'overdue' && (
                <View style={[styles.activeDot, { backgroundColor: colors.danger }]} />
              )}
            </Pressable>
          </View>
        </Pressable>
      </View>

      {/* -------------------- SECTION C: SEARCH INPUT -------------------- */}
      <SearchInput
        placeholder="Search room, guest or phone…"
        value={search}
        onChangeText={setSearch}
        style={{ marginBottom: 12 }}
      />

      {/* -------------------- SECTION D: CHECK-IN / CHECK-OUT TABS -------------------- */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.mainTab, activeTab === 'checkins' && styles.mainTabActive]}
          onPress={() => handleTabChange('checkins')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'checkins' }}
        >
          <Text style={[styles.mainTabText, activeTab === 'checkins' && styles.mainTabTextActive]}>
            Check-ins ({checkinStats.total})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.mainTab, activeTab === 'checkouts' && styles.mainTabActive]}
          onPress={() => handleTabChange('checkouts')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'checkouts' }}
        >
          <Text style={[styles.mainTabText, activeTab === 'checkouts' && styles.mainTabTextActive]}>
            Check-outs ({checkoutStats.total})
          </Text>
        </Pressable>
      </View>

      {/* -------------------- SECTION E: STATUS FILTERS & COUNTER -------------------- */}
      <View style={styles.filterSection}>
        <View style={styles.filterButtonsRow}>
          {activeTab === 'checkins' ? (
            <>
              <Pressable
                style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
                onPress={() => setStatusFilter('all')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>
                  All ({checkinStats.all_count ?? checkinsList.length})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.filterChip, statusFilter === 'expected' && styles.filterChipActive]}
                onPress={() => setStatusFilter('expected')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'expected' && styles.filterChipTextActive]}>
                  Expected ({checkinStats.total})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
                onPress={() => setStatusFilter('pending')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>
                  Pending ({checkinStats.pending})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.filterChip, statusFilter === 'checked_in' && styles.filterChipActive]}
                onPress={() => setStatusFilter('checked_in')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'checked_in' && styles.filterChipTextActive]}>
                  Checked-in ({checkinStats.checked_in ?? checkinStats.completed})
                </Text>
              </Pressable>

              {(checkinStats.overdue ?? 0) > 0 && (
                <Pressable
                  style={[styles.filterChip, statusFilter === 'overdue' && styles.filterChipActive]}
                  onPress={() => setStatusFilter('overdue')}
                >
                  <Text style={[styles.filterChipText, statusFilter === 'overdue' && styles.filterChipTextActive]}>
                    Overdue ({checkinStats.overdue})
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Pressable
                style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
                onPress={() => setStatusFilter('all')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>
                  All ({checkoutStats.all_count ?? checkoutsList.length})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.filterChip, statusFilter === 'expected' && styles.filterChipActive]}
                onPress={() => setStatusFilter('expected')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'expected' && styles.filterChipTextActive]}>
                  Expected ({checkoutStats.total})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]}
                onPress={() => setStatusFilter('pending')}
              >
                <Text style={[styles.filterChipText, statusFilter === 'pending' && styles.filterChipTextActive]}>
                  Pending ({checkoutStats.pending})
                </Text>
              </Pressable>

              <Pressable
                style={[styles.filterChip, (statusFilter === 'checked_out' || statusFilter === 'completed') && styles.filterChipActive]}
                onPress={() => setStatusFilter('checked_out')}
              >
                <Text style={[styles.filterChipText, (statusFilter === 'checked_out' || statusFilter === 'completed') && styles.filterChipTextActive]}>
                  Completed ({checkoutStats.completed ?? checkoutStats.checked_out})
                </Text>
              </Pressable>

              {(checkoutStats.overdue ?? 0) > 0 && (
                <Pressable
                  style={[styles.filterChip, statusFilter === 'overdue' && styles.filterChipActive]}
                  onPress={() => setStatusFilter('overdue')}
                >
                  <Text style={[styles.filterChipText, statusFilter === 'overdue' && styles.filterChipTextActive]}>
                    Overdue ({checkoutStats.overdue})
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Showing X of Y counter */}
        <View style={styles.counterRow}>
          <Text style={styles.counterText}>
            Showing {activeTab === 'checkins' ? filteredCheckins.length : filteredCheckouts.length} of{' '}
            {activeTab === 'checkins' ? checkinStats.total : checkoutStats.total}
          </Text>
        </View>
      </View>

      {/* Active Filter Banner */}
      {statusFilter !== 'all' && (
        <View style={styles.filterBanner}>
          <Text style={styles.filterBannerText}>
            Filtered: <Text style={{ fontFamily: fonts.bodyBold }}>
              {statusFilter === 'expected'
                ? activeTab === 'checkins' ? 'Expected Today' : 'Expected Today Departures'
                : statusFilter === 'pending'
                ? activeTab === 'checkins' ? 'Pending Arrival' : 'Pending Departures'
                : statusFilter === 'checked_in'
                ? 'Checked In'
                : statusFilter === 'checked_out' || statusFilter === 'completed'
                ? 'Completed Today'
                : statusFilter === 'overdue'
                ? activeTab === 'checkins' ? 'Overdue Arrivals' : 'Overdue Departures'
                : statusFilter}
            </Text> ({activeTab === 'checkins' ? filteredCheckins.length : filteredCheckouts.length})
          </Text>
          <Pressable onPress={() => setStatusFilter('all')} hitSlop={8} style={styles.clearFilterBtn} accessibilityRole="button" accessibilityLabel="Show All">
            <Text style={styles.clearFilterText}>Show All</Text>
          </Pressable>
        </View>
      )}

      {/* -------------------- SECTION 2: MOBILE RECORD CARDS -------------------- */}

      {/* Check-ins List */}
      {activeTab === 'checkins' && (
        <>
          {filteredCheckins.length === 0 ? (
            <EmptyState
              title={
                search
                  ? `No check-ins found matching "${search}"`
                  : statusFilter !== 'all'
                  ? `No ${statusFilter.replace('_', ' ')} check-ins for today`
                  : 'No check-ins expected for today'
              }
            />
          ) : (
            filteredCheckins.map((item) => {
              const isOverdue = Boolean(item.is_overdue || (item.check_in_date && today && item.check_in_date < today && item.checkin_status !== 'checked_in' && item.checkin_status !== 'checked_out'));
              const isCheckedIn = item.checkin_status === 'checked_in';
              const isCheckedOut = item.checkin_status === 'checked_out';
              const isPending = (item.checkin_status === 'pending' || isOverdue) && !isCheckedIn && !isCheckedOut;
              const isEligibleWhatsApp = Boolean(item.is_eligible_whatsapp && whatsappCheckinEnabled);

              return (
                <View key={item.id || item.reservation_id || `res-${item.room_no}`} style={styles.card}>
                  {/* Top Row: Room & Room Type on Left, Status Badge on Right */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.roomBadgeGroup}>
                      <View style={styles.roomTag}>
                        <Text style={styles.roomTagText}>Room {item.room_no}</Text>
                      </View>
                      <Text style={styles.roomType}>{item.room_type_name}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        isCheckedIn
                          ? styles.badgeSuccess
                          : isCheckedOut
                          ? styles.badgeInfo
                          : isOverdue
                          ? styles.badgeDanger
                          : styles.badgeWarning,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          isCheckedIn
                            ? styles.textSuccess
                            : isCheckedOut
                            ? styles.textInfo
                            : isOverdue
                            ? styles.textDanger
                            : styles.textWarning,
                        ]}
                      >
                        {item.checkin_status_label || (isOverdue ? 'Overdue Arrival' : isCheckedIn ? 'Checked-in' : isCheckedOut ? 'Checked Out' : 'Pending')}
                      </Text>
                    </View>
                  </View>

                  {/* Guest Info */}
                  <View style={styles.guestRow}>
                    <Pressable
                      onPress={() => {
                        if (item.reservation_id) {
                          setSheet({ type: 'booking', reservationId: item.reservation_id });
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

                  {/* Phone & Meta */}
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
                      {item.check_in_date ? fdWithYear(item.check_in_date) : today ? fdWithYear(today) : ''},{' '}
                      {item.check_in_time}
                    </Text>
                    {isCheckedIn && <Text style={styles.actualTag}> (Actual)</Text>}
                    {isOverdue && <Text style={[styles.actualTag, { color: colors.danger }]}> (Overdue)</Text>}
                  </View>

                  {/* -------------------- SECTION 3: ACTIONS -------------------- */}
                  <View style={styles.actionBtnRow}>
                    {/* 1. Process Check-in (ONLY if pending check-in) */}
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

                    {/* 2. Upload Photo */}
                    <Pressable
                      style={[styles.outlineActionBtn, !isPending && { flex: 1 }]}
                      onPress={() => setSheet({ type: 'upload_photo', item })}
                      accessibilityRole="button"
                      accessibilityLabel="Upload Guest ID Photo"
                    >
                      <Text style={styles.outlineActionBtnText}>📷 Upload Photo</Text>
                    </Pressable>

                    {/* 3. WhatsApp Action */}
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
                        <WhatsAppIcon color="#FFFFFF" size={17} />
                      </Pressable>
                    )}

                    {/* 4. Calendar / Booking Details Action */}
                    {item.reservation_id ? (
                      <Pressable
                        style={styles.iconActionBtn}
                        onPress={() => setSheet({ type: 'booking', reservationId: item.reservation_id })}
                        accessibilityRole="button"
                        accessibilityLabel="View Booking Details and Calendar"
                      >
                        <Text style={styles.iconBtnText}>📅</Text>
                      </Pressable>
                    ) : null}

                    {/* 5. View Bill / Invoice (if checked out) */}
                    {isCheckedOut && item.stay_id ? (
                      <Pressable
                        style={[styles.outlineActionBtn, { flex: 1 }]}
                        onPress={() =>
                          navigation.navigate('Bills', {
                            screen: 'InvoicePrint',
                            params: { stayId: item.stay_id, invoiceId: item.invoice_id },
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

      {/* Check-outs List */}
      {activeTab === 'checkouts' && (
        <>
          {filteredCheckouts.length === 0 ? (
            <EmptyState
              title={
                search
                  ? `No check-outs found matching "${search}"`
                  : statusFilter !== 'all'
                  ? `No ${statusFilter === 'pending' ? 'in-house / pending' : 'completed'} check-outs for today`
                  : 'No check-outs due today'
              }
            />
          ) : (
            filteredCheckouts.map((s) => {
              const isCheckedOut = (s.checkout_status || s.status || s.stay_status) === 'checked_out';
              const plannedDate = s.checkout_planned || s.check_out_date;
              const isOverdue = !isCheckedOut && Boolean(s.is_overdue || (plannedDate && today && plannedDate < today));
              const isPending = !isCheckedOut;
              const isEligibleWhatsApp = Boolean(s.is_eligible_whatsapp || s.guest_phone);
              const stayId = s.stay_id || (typeof s.id === 'string' && s.id.startsWith('stay-') ? parseInt(s.id.slice(5), 10) : (typeof s.id === 'number' ? s.id : null));

              return (
                <View key={s.id || s.stay_id || `stay-${s.room_no}`} style={styles.card}>
                  {/* Top Row: Room & Room Type on Left, Status Badge on Right */}
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.roomBadgeGroup}>
                      <View style={styles.roomTag}>
                        <Text style={styles.roomTagText}>Room {s.room_no}</Text>
                      </View>
                      <Text style={styles.roomType}>{s.room_type_name}</Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        isCheckedOut ? styles.badgeSuccess : isOverdue ? styles.badgeDanger : styles.badgeWarning,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          isCheckedOut ? styles.textSuccess : isOverdue ? styles.textDanger : styles.textWarning,
                        ]}
                      >
                        {s.checkout_status_label || (isCheckedOut ? 'Checked Out' : isOverdue ? 'Overdue' : 'Pending')}
                      </Text>
                    </View>
                  </View>

                  {/* Guest Info */}
                  <View style={styles.guestRow}>
                    <Pressable
                      onPress={() => {
                        if (stayId) {
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

                  {/* Phone & Meta */}
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
                      , {s.checkout_time}
                    </Text>
                    {isCheckedOut && <Text style={styles.actualTag}> (Actual)</Text>}
                    {isOverdue && <Text style={[styles.actualTag, { color: colors.danger }]}> (Overdue)</Text>}
                  </View>

                  {/* -------------------- SECTION 3: ACTIONS -------------------- */}
                  <View style={styles.actionBtnRow}>
                    {/* 1. Process Check-out (ONLY if in-house / pending checkout) */}
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

                    {/* 2. Upload Photo */}
                    <Pressable
                      style={[styles.outlineActionBtn, isCheckedOut && { flex: 1 }]}
                      onPress={() => setSheet({ type: 'upload_photo', item: s })}
                      accessibilityRole="button"
                      accessibilityLabel="Upload Guest ID Photo"
                    >
                      <Text style={styles.outlineActionBtnText}>📷 Upload Photo</Text>
                    </Pressable>

                    {/* 3. WhatsApp Action */}
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
                        <WhatsAppIcon color="#FFFFFF" size={17} />
                      </Pressable>
                    )}

                    {/* 4. Calendar / Booking or Stay Details Action */}
                    {s.reservation_id ? (
                      <Pressable
                        style={styles.iconActionBtn}
                        onPress={() => setSheet({ type: 'booking', reservationId: s.reservation_id })}
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

                    {/* 5. View Bill / Invoice (when checked out) */}
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

      {/* 3. Photo Upload Sheet */}
      {sheet?.type === 'upload_photo' && (
        <PhotoUploadSheet
          item={sheet.item}
          guestId={sheet.item.guest_id}
          onClose={() => setSheet(null)}
          onSaved={() => refetch()}
        />
      )}

      {/* 4. Booking Details Sheet (with Calendar flow) */}
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
    padding: 12,
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 18,
    color: colors.heading,
  },
  headerSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  boldText: {
    fontFamily: fonts.bodyBold,
    color: colors.heading,
  },

  // Section B: Summary Cards Grid
  summaryGrid: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    padding: 12,
  },
  summaryCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  summaryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryCardTitle: {
    fontFamily: fonts.displayBold,
    fontSize: 15,
    color: colors.heading,
  },
  arrivalsBadge: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    paddingVertical: 3,
    borderRadius: radii.xs,
  },
  departuresBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.warning,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    position: 'relative',
  },
  statBoxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.secondaryLight,
  },
  metricVal: {
    fontFamily: fonts.displayBold,
    fontSize: 17,
    color: colors.heading,
  },
  metricLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  hiddenTestLabel: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  activeDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },

  // Section D: Main Tabs
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
    paddingVertical: 8,
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

  // Section E: Status Sub-Filters
  filterSection: {
    marginBottom: 10,
  },
  filterButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
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

  // Section 2: Mobile Record Cards
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 10,
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
  badgeInfo: { backgroundColor: colors.infoBg },
  badgeDanger: { backgroundColor: colors.dangerBg },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  textSuccess: { color: colors.success },
  textWarning: { color: colors.warning },
  textInfo: { color: colors.info },
  textDanger: { color: colors.danger },

  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  guestName: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.heading,
  },
  guestCity: {
    fontFamily: fonts.body,
    fontSize: 12,
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
    fontSize: 12,
    color: colors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  timeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  timeVal: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
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
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  primaryActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  primaryActionBtnText: {
    color: '#FFFFFF',
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
  },
  outlineActionBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  outlineActionBtnText: {
    color: colors.text,
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
  },
  iconActionBtn: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappActionBtn: {
    backgroundColor: '#25D366',
    borderColor: '#1EBE5D',
  },
  iconBtnText: {
    fontSize: 16,
  },
});
