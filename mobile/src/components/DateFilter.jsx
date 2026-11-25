import { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronDownIcon } from './Icons.jsx';
import RoomCalendar from './RoomCalendar.jsx';
import Button from './ui/Button.jsx';
import {
  todayIso,
  addDaysIso,
  fdWithYear,
  getPresetDateRange,
  formatDateRangeLabel,
} from '../lib/format';
import { colors, fonts, radii, shadow } from '../theme/theme';

const PRESET_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
];

/**
 * Compact Date Filter for Mobile Reports and Bills.
 * Displays a single compact bar with calendar icon, selected period label,
 * and dropdown chevron. Tapping opens a clean lavender/purple bottom sheet
 * with 2-column presets and an interactive custom range date picker.
 */
export default function DateFilter({
  value,
  onChange,
  style,
  compact = false,
}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null); // 'from' | 'to' | null

  // Current applied state
  const currentPreset = value?.preset || 'today';
  const currentFrom = value?.from || todayIso();
  const currentTo = value?.to || todayIso();
  const currentLabel = value?.label || formatDateRangeLabel(currentFrom, currentTo, currentPreset);

  // Temporary sheet state (so Cancel/dismiss doesn't alter applied filter)
  const [activePreset, setActivePreset] = useState(currentPreset);
  const [customFrom, setCustomFrom] = useState(currentFrom);
  const [customTo, setCustomTo] = useState(currentTo);
  const [customError, setCustomError] = useState(null);

  const openSheet = useCallback(() => {
    setActivePreset(currentPreset);
    setCustomFrom(currentFrom);
    setCustomTo(currentTo);
    setCustomError(null);
    setPickerTarget(null);
    setSheetVisible(true);
  }, [currentPreset, currentFrom, currentTo]);

  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setPickerTarget(null);
    setCustomError(null);
  }, []);

  const handleSelectPreset = useCallback((presetKey) => {
    setActivePreset(presetKey);
    setCustomError(null);

    if (presetKey !== 'custom') {
      const range = getPresetDateRange(presetKey);
      onChange?.({
        from: range.from,
        to: range.to,
        preset: range.preset,
        label: range.label,
      });
      closeSheet();
    }
  }, [onChange, closeSheet]);

  const validateCustomRange = (from, to) => {
    if (!from || !to) {
      return 'Please select both From and To dates.';
    }
    const today = todayIso();
    if (from > to) {
      return 'From date cannot be after To date.';
    }
    if (to > today) {
      return 'Future dates are not permitted.';
    }
    return null;
  };

  const handleApplyCustom = useCallback(() => {
    const err = validateCustomRange(customFrom, customTo);
    if (err) {
      setCustomError(err);
      return;
    }
    const label = formatDateRangeLabel(customFrom, customTo, 'custom');
    onChange?.({
      from: customFrom,
      to: customTo,
      preset: 'custom',
      label,
    });
    closeSheet();
  }, [customFrom, customTo, onChange, closeSheet]);

  const handleCalendarPick = useCallback((date) => {
    if (!date) return;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (pickerTarget === 'from') {
      setCustomFrom(iso);
      if (customTo && iso > customTo) {
        setCustomTo(iso);
      }
    } else if (pickerTarget === 'to') {
      setCustomTo(iso);
      if (customFrom && iso < customFrom) {
        setCustomFrom(iso);
      }
    }
    setCustomError(null);
    setPickerTarget(null);
  }, [pickerTarget, customFrom, customTo]);

  const pickerDateObj = useMemo(() => {
    const raw = pickerTarget === 'to' ? customTo : customFrom;
    if (raw) {
      return new Date(`${raw}T00:00:00`);
    }
    return new Date();
  }, [pickerTarget, customFrom, customTo]);

  return (
    <>
      {/* 1. Compact Date Filter Trigger */}
      <Pressable
        style={[styles.filterBar, compact && styles.filterBarCompact, style]}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityLabel={`Filter date: ${currentLabel}. Tap to change period.`}
      >
        <View style={styles.filterBarLeft}>
          <View style={styles.calendarIconWrap}>
            <CalendarIcon size={15} color={colors.primary} />
          </View>
          <Text style={styles.filterBarLabel} numberOfLines={1}>
            {currentLabel}
          </Text>
        </View>
        <View style={styles.chevronWrap}>
          <ChevronDownIcon size={14} color={colors.textSecondary} />
        </View>
      </Pressable>

      {/* 2. Date Selection Bottom Sheet */}
      <Modal
        visible={sheetVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={closeSheet}
        statusBarTranslucent={true}
      >
        <View style={styles.modalOverlay}>
          {/* Dismissible scrim */}
          <Pressable
            style={styles.scrim}
            onPress={closeSheet}
            accessibilityLabel="Close date filter"
          />

          {/* Bottom sheet content */}
          <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bottomSheetContainer}>
            <View style={styles.sheetCard}>
              {/* Handle bar indicator */}
              <View style={styles.handleBar} />

              {/* Header */}
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.sheetTitle}>Filter by Date</Text>
                  <Text style={styles.sheetSubtitle}>
                    Active: <Text style={styles.sheetSubtitleBold}>{currentLabel}</Text>
                  </Text>
                </View>
                <Pressable
                  style={styles.closeBtn}
                  onPress={closeSheet}
                  hitSlop={12}
                  accessibilityLabel="Close"
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {/* 2-Column Preset Grid */}
                <View style={styles.presetsGrid}>
                  {PRESET_OPTIONS.map((item) => {
                    const isSelected = activePreset === item.key;
                    return (
                      <Pressable
                        key={item.key}
                        style={[
                          styles.presetBtn,
                          isSelected && styles.presetBtnActive,
                        ]}
                        onPress={() => handleSelectPreset(item.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSelected }}
                      >
                        <Text
                          style={[
                            styles.presetBtnText,
                            isSelected && styles.presetBtnTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                        {isSelected && (
                          <View style={styles.activeDot} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Custom Range Section */}
                {activePreset === 'custom' && (
                  <View style={styles.customSection}>
                    <Text style={styles.customSectionTitle}>Select custom date range</Text>

                    <View style={styles.customDateRow}>
                      {/* From Field */}
                      <View style={styles.customDateFieldWrap}>
                        <Text style={styles.fieldLabel}>From Date</Text>
                        <Pressable
                          style={[
                            styles.dateInputBtn,
                            pickerTarget === 'from' && styles.dateInputBtnFocus,
                          ]}
                          onPress={() => setPickerTarget('from')}
                          accessibilityRole="button"
                          accessibilityLabel="Select from date"
                        >
                          <CalendarIcon size={14} color={colors.primary} />
                          <Text style={styles.dateInputBtnText} numberOfLines={1}>
                            {customFrom ? fdWithYear(customFrom) : 'Select date'}
                          </Text>
                        </Pressable>
                      </View>

                      <Text style={styles.dateRangeSep}>to</Text>

                      {/* To Field */}
                      <View style={styles.customDateFieldWrap}>
                        <Text style={styles.fieldLabel}>To Date</Text>
                        <Pressable
                          style={[
                            styles.dateInputBtn,
                            pickerTarget === 'to' && styles.dateInputBtnFocus,
                          ]}
                          onPress={() => setPickerTarget('to')}
                          accessibilityRole="button"
                          accessibilityLabel="Select to date"
                        >
                          <CalendarIcon size={14} color={colors.primary} />
                          <Text style={styles.dateInputBtnText} numberOfLines={1}>
                            {customTo ? fdWithYear(customTo) : 'Select date'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Inline Validation Error */}
                    {customError ? (
                      <View style={styles.errorBanner} accessibilityRole="alert">
                        <Text style={styles.errorBannerText}>⚠️ {customError}</Text>
                      </View>
                    ) : null}

                    {/* Actions */}
                    <View style={styles.customActionRow}>
                      <Button
                        title="Cancel"
                        variant="secondary"
                        size="md"
                        style={{ flex: 1 }}
                        onPress={closeSheet}
                      />
                      <Button
                        title="Apply"
                        variant="primary"
                        size="md"
                        style={{ flex: 1 }}
                        onPress={handleApplyCustom}
                      />
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      {/* 3. Existing Date Picker Modal (RoomCalendar) */}
      <Modal
        visible={Boolean(pickerTarget)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerTarget(null)}
        statusBarTranslucent={true}
      >
        <View style={styles.pickerModalOverlay}>
          <Pressable
            style={styles.scrim}
            onPress={() => setPickerTarget(null)}
            accessibilityLabel="Close date picker"
          />
          <View style={styles.pickerDialogCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {pickerTarget === 'from' ? 'Select From Date' : 'Select To Date'}
              </Text>
              <Pressable
                onPress={() => setPickerTarget(null)}
                hitSlop={12}
                accessibilityLabel="Close"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <RoomCalendar
              style={{ marginBottom: 0, borderWidth: 0 }}
              selectedDate={pickerDateObj}
              onDateSelect={handleCalendarPick}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Filter bar (compact control near top of screen)
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.secondaryLight,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  filterBarCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  filterBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  calendarIconWrap: {
    width: 24,
    height: 24,
    borderRadius: radii.xs,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBarLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.primary,
    flex: 1,
  },
  chevronWrap: {
    marginLeft: 6,
  },

  // Modal & Bottom Sheet
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
  },
  bottomSheetContainer: {
    width: '100%',
    maxHeight: '90%',
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
    ...shadow.pop,
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sheetTitle: {
    fontFamily: fonts.displayBold || fonts.bodyBold,
    fontSize: 16,
    color: colors.heading,
  },
  sheetSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sheetSubtitleBold: {
    fontFamily: fonts.bodyBold,
    color: colors.primary,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    fontFamily: fonts.bodyBold,
    color: colors.textSecondary,
  },
  sheetScroll: {
    maxHeight: 480,
  },
  sheetScrollContent: {
    padding: 16,
    paddingBottom: 20,
  },

  // 2-Column Preset Grid
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  presetBtn: {
    width: '48.4%',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  presetBtnActive: {
    backgroundColor: colors.secondaryLight,
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  presetBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
  },
  presetBtnTextActive: {
    fontFamily: fonts.bodyBold,
    color: colors.primary,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
  },

  // Custom Range Section
  customSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  customSectionTitle: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.heading,
    marginBottom: 10,
  },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customDateFieldWrap: {
    flex: 1,
  },
  fieldLabel: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  dateInputBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 9,
    minHeight: 42,
  },
  dateInputBtnFocus: {
    borderColor: colors.primary,
    backgroundColor: colors.secondaryLight,
  },
  dateInputBtnText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.heading,
    flex: 1,
  },
  dateRangeSep: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    alignSelf: 'center',
    marginTop: 18,
  },
  errorBanner: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  errorBannerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.danger,
  },
  customActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },

  // Picker Modal (RoomCalendar dialog)
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pickerDialogCard: {
    width: '94%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    overflow: 'hidden',
    ...shadow.pop,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pickerTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14.5,
    color: colors.heading,
  },
});
