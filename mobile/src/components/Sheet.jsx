import { useCallback, useEffect } from 'react';
import { Alert, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import BackButton from './ui/BackButton.jsx';
import { ToastProvider } from './ToastContext.jsx';
import { colors, fonts, radii, shadow, statusColors } from '../theme/theme';

/**
 * Mobile full-screen presentation for complete page-level forms, details, and workflows.
 * Renders in a dedicated root modal that occupies the full mobile screen height and width,
 * hides the underlying screen, and hides bottom tab navigation while active.
 *
 * Supports `compact={true}` for small confirmation dialogs and selection pickers.
 */
export default function Sheet({
  onClose,
  children,
  scroll = true,
  hasUnsavedChanges = false,
  unsavedChangesTitle = 'Discard unsaved changes?',
  unsavedChangesMessage = 'You have unsaved changes. Are you sure you want to discard them and close?',
  compact = false,
  scrollRef,
}) {
  const handleDismiss = useCallback(() => {
    if (hasUnsavedChanges) {
      Alert.alert(
        unsavedChangesTitle,
        unsavedChangesMessage,
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ],
        { cancelable: true }
      );
    } else {
      onClose?.();
    }
  }, [hasUnsavedChanges, unsavedChangesTitle, unsavedChangesMessage, onClose]);

  // Support Android hardware Back navigation
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleDismiss();
      return true;
    });
    return () => sub.remove();
  }, [handleDismiss]);

  const inner = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={compact ? undefined : styles.scroll}
      contentContainerStyle={compact ? styles.compactScrollBody : styles.scrollBody}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={compact ? styles.compactBody : styles.body}>{children}</View>
  );

  if (compact) {
    return (
      <Modal
        visible={true}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDismiss}
        statusBarTranslucent={true}
      >
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ToastProvider>
            <View style={styles.compactOverlay}>
              <Pressable style={styles.scrim} onPress={handleDismiss} accessibilityLabel="Close dialog" />
              <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.compactWrap} pointerEvents="box-none">
                <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
                <View style={styles.compactCard} pointerEvents="auto">
                  {inner}
                </View>
              </SafeAreaView>
            </View>
          </ToastProvider>
        </SafeAreaProvider>
      </Modal>
    );
  }

  // Full-screen presentation for complete workflows
  return (
    <Modal
      visible={true}
      transparent={false}
      animationType="slide"
      onRequestClose={handleDismiss}
      statusBarTranslucent={false}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ToastProvider>
          <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.fullScreenSafe}>
            <StatusBar style="dark" backgroundColor={colors.surface} />
            <KeyboardAvoidingView
              style={styles.keyboardAvoid}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.fullScreenContainer} pointerEvents="auto">
                <View style={styles.sheet} pointerEvents="auto">
                  {inner}
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </ToastProvider>
      </SafeAreaProvider>
    </Modal>
  );
}

export function SheetHeader({
  status,
  badge,
  title,
  subtitle,
  onClose,
  onBack,
  hasUnsavedChanges = false,
  showBack = true,
}) {
  const c = status ? statusColors[status] : null;
  const handleBackAction = showBack ? (onBack || onClose) : null;

  const handleClosePress = () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Discard unsaved changes?',
        'You have unsaved changes. Are you sure you want to discard them and close?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ],
        { cancelable: true }
      );
    } else {
      onClose?.();
    }
  };

  return (
    <View style={[styles.header, c ? { backgroundColor: c.bg, borderBottomColor: c.border } : null]}>
      {handleBackAction ? (
        <BackButton
          onPress={handleBackAction}
          hasUnsavedChanges={hasUnsavedChanges}
          color={colors.heading}
          size={20}
          style={styles.sheetBackBtn}
          enableHardwareBack={false} // Hardware back is handled by Sheet
        />
      ) : null}
      {badge !== undefined ? (
        <View style={[styles.badge, c ? { backgroundColor: c.fg } : null]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={handleClosePress} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fullScreenSafe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  keyboardAvoid: {
    flex: 1,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.6)',
    zIndex: 1,
  },
  sheetWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 2,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollBody: {
    paddingBottom: 40,
    flexGrow: 1,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
  },
  compactOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  compactWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 2,
  },
  compactCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    overflow: 'hidden',
    width: '90%',
    maxWidth: 420,
    maxHeight: '85%',
    alignSelf: 'center',
    zIndex: 10,
    elevation: 24,
    ...shadow.pop,
  },
  compactScrollBody: {
    paddingBottom: 16,
  },
  compactBody: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetBackBtn: {
    marginLeft: 0,
    marginRight: 4,
    padding: 4,
  },
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.primary,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    color: '#fff',
    fontSize: 13,
  },
  title: {
    fontFamily: fonts.displaySemibold,
    fontSize: 16,
    color: colors.heading,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    fontSize: 24,
    color: colors.textSecondary,
    lineHeight: 24,
  },
});
