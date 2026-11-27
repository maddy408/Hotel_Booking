import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import Button from './Button';
import { colors, fonts } from '../../theme/theme';

export const ScreenOverlayContext = createContext(null);

export function useScreenOverlay() {
  return useContext(ScreenOverlayContext);
}

class OverlayManager {
  constructor() {
    this.listeners = new Set();
    this.items = new Map();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  registerOverlay(id, element) {
    this.items.set(id, element);
    this.notify();
  }

  unregisterOverlay(id) {
    if (this.items.delete(id)) {
      this.notify();
    }
  }

  notify() {
    const list = Array.from(this.items.entries()).map(([id, element]) => ({ id, element }));
    this.listeners.forEach((fn) => fn(list));
  }
}

function OverlayHost({ manager }) {
  const [overlays, setOverlays] = useState([]);

  useEffect(() => {
    return manager.subscribe((list) => {
      setOverlays(list);
    });
  }, [manager]);

  if (!overlays.length) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
      {overlays.map((o) => (
        <View key={o.id} style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
          {o.element}
        </View>
      ))}
    </View>
  );
}

const ROOT_TAB_SCREENS = ['RoomsHome', 'BookingsHome', 'DailyOpsHome', 'GuestsHome', 'BillsHome', 'MoreMenu'];

/** Shared screen shell: safe area + optional scroll + keyboard avoidance, matching web's <main class="gut"><div class="inner">. */
export default function Screen({ children, scroll = true, refreshing, onRefresh, contentStyle, scrollRef, edges }) {
  const manager = useMemo(() => new OverlayManager(), []);
  const contextValue = useMemo(() => ({
    registerOverlay: (id, element) => manager.registerOverlay(id, element),
    unregisterOverlay: (id) => manager.unregisterOverlay(id),
  }), [manager]);

  let isRootTabScreen = false;
  try {
    const route = useRoute();
    isRootTabScreen = ROOT_TAB_SCREENS.includes(route?.name);
  } catch {
    // Outside navigation container (e.g. unit tests)
  }

  // When inside a bottom tab screen, bottom navigation handles bottom safe area insets.
  // Omitting 'bottom' removes the unwanted white space above the bottom navigation.
  const resolvedEdges = edges || (isRootTabScreen ? ['left', 'right'] : ['left', 'right', 'bottom']);

  const inner = scroll ? (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, styles.scrollContent, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <ScreenOverlayContext.Provider value={contextValue}>
      <SafeAreaView style={styles.safe} edges={resolvedEdges}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inner}
          <OverlayHost manager={manager} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenOverlayContext.Provider>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title = 'Nothing here yet', subtitle }) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <View style={styles.center}>
      <Text style={styles.errorTitle}>Could not load this</Text>
      <Text style={styles.muted}>{message}</Text>
      {onRetry ? <Button title="Retry" onPress={onRetry} variant="outline" size="sm" style={{ marginTop: 12 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  scrollContent: { flexGrow: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 6 },
  muted: { fontFamily: fonts.body, color: colors.textSecondary, fontSize: 13.5, textAlign: 'center' },
  emptyTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, color: colors.heading },
  errorTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, color: colors.danger },
});
