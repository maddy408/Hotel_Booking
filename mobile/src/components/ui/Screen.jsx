import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from './Button';
import { colors, fonts } from '../../theme/theme';

/** Shared screen shell: safe area + optional scroll + keyboard avoidance, matching web's <main class="gut"><div class="inner">. */
export default function Screen({ children, scroll = true, refreshing, onRefresh, contentStyle }) {
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {inner}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 6 },
  muted: { fontFamily: fonts.body, color: colors.textSecondary, fontSize: 13.5, textAlign: 'center' },
  emptyTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, color: colors.heading },
  errorTitle: { fontFamily: fonts.displaySemibold, fontSize: 16, color: colors.danger },
});
