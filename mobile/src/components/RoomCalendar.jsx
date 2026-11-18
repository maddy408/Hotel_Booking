import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  MONTH_NAMES,
  WEEKDAYS,
  isSameDay,
  formatSelectedDateText,
  getCalendarGrid,
} from '../lib/calendar.js';
import { colors, fonts, radii } from '../theme/theme';

export default function RoomCalendar({ initialDate, onDateSelect, style }) {
  const [today] = useState(() => new Date());
  const initial = initialDate || today;

  const [{ year: viewYear, month: viewMonth }, setViewDate] = useState(() => ({
    year: initial.getFullYear(),
    month: initial.getMonth(),
  }));
  const [selectedDate, setSelectedDate] = useState(() => initial);

  const calendarDays = useMemo(
    () => getCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  );

  const handlePrevMonth = () => {
    setViewDate(({ year, month }) => {
      if (month === 0) return { year: year - 1, month: 11 };
      return { year, month: month - 1 };
    });
  };

  const handleNextMonth = () => {
    setViewDate(({ year, month }) => {
      if (month === 11) return { year: year + 1, month: 0 };
      return { year, month: month + 1 };
    });
  };

  const handleGoToToday = () => {
    const now = new Date();
    setViewDate({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedDate(now);
    if (onDateSelect) onDateSelect(now);
  };

  const handleDateClick = (item) => {
    setSelectedDate(item.date);
    if (!item.isCurrentMonth) {
      setViewDate({ year: item.year, month: item.month });
    }
    if (onDateSelect) onDateSelect(item.date);
  };

  return (
    <View style={[styles.card, style]}>
      {/* Header with Title and Today Button */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.calendarIcon}>📅</Text>
          <Text style={styles.heading}>Calendar</Text>
        </View>
        <Pressable
          style={styles.todayBtn}
          onPress={handleGoToToday}
          hitSlop={8}
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>

      {/* Month Navigation */}
      <View style={styles.navRow}>
        <Pressable onPress={handlePrevMonth} style={styles.navBtn} hitSlop={10}>
          <Text style={styles.navArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <Pressable onPress={handleNextMonth} style={styles.navBtn} hitSlop={10}>
          <Text style={styles.navArrow}>›</Text>
        </Pressable>
      </View>

      {/* Weekday Row */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((wd) => (
          <View key={wd} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{wd}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.grid}>
        {calendarDays.map((item, idx) => {
          const isToday = isSameDay(item.date, today);
          const isSelected = isSameDay(item.date, selectedDate);

          return (
            <Pressable
              key={`${item.year}-${item.month}-${item.dayNumber}-${idx}`}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                isToday && !isSelected && styles.dayCellToday,
              ]}
              onPress={() => handleDateClick(item)}
            >
              <Text
                style={[
                  styles.dayNum,
                  !item.isCurrentMonth && styles.dayNumOut,
                  isSelected && styles.dayNumSelected,
                  isToday && !isSelected && styles.dayNumToday,
                ]}
              >
                {item.dayNumber}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Selected Info Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Selected Date:</Text>
        <Text style={styles.footerValue} numberOfLines={1}>
          {formatSelectedDateText(selectedDate)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarIcon: {
    fontSize: 16,
  },
  heading: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.heading,
  },
  todayBtn: {
    backgroundColor: colors.secondaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  todayText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11.5,
    color: colors.primary,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  navBtn: {
    padding: 4,
    minWidth: 28,
    alignItems: 'center',
  },
  navArrow: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 24,
  },
  monthTitle: {
    fontFamily: fonts.displaySemibold,
    fontSize: 14,
    color: colors.heading,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekdayText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    marginVertical: 1,
  },
  dayCellSelected: {
    backgroundColor: colors.primary,
  },
  dayCellToday: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  dayNum: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.text,
  },
  dayNumOut: {
    color: '#9CA3AF',
    opacity: 0.5,
  },
  dayNumSelected: {
    color: '#FFFFFF',
    fontFamily: fonts.bodyBold,
  },
  dayNumToday: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  footerValue: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.heading,
    flex: 1,
  },
});
