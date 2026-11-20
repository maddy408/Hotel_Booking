import { useCallback, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii } from '../../theme/theme';

const VARIANTS = {
  primary: { bg: colors.primary, border: colors.primary, text: colors.buttonText },
  success: { bg: colors.success, border: colors.success, text: colors.buttonText },
  info: { bg: colors.info, border: colors.info, text: colors.buttonText },
  danger: { bg: colors.surface, border: colors.danger, text: colors.danger },
  outline: { bg: colors.surface, border: colors.border, text: colors.text },
};

/** Mirrors the web app's .btn / .btn.go / .btn.blue / .btn.dark / .btn.red classes. */
export default function Button({ title, children, onPress, variant = 'outline', disabled, loading, size = 'md', style, textStyle }) {
  const v = VARIANTS[variant] || VARIANTS.outline;
  const isDisabled = Boolean(disabled || loading);
  const lastPressRef = useRef(0);

  const handlePress = useCallback(
    (e) => {
      if (isDisabled) return;
      const now = Date.now();
      // Guard against rapid duplicate taps within 450ms
      if (now - lastPressRef.current < 450) {
        return;
      }
      lastPressRef.current = now;
      onPress?.(e);
    },
    [onPress, isDisabled]
  );

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      hitSlop={size === 'sm' ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 6, bottom: 6, left: 6, right: 6 }}
      pressRetentionOffset={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        size === 'lg' && styles.lg,
        { backgroundColor: v.bg, borderColor: v.border, opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <Text pointerEvents="none" style={[styles.text, { color: v.text }, size === 'sm' && styles.textSm, textStyle]}>{title ?? children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1.5,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  sm: { paddingVertical: 7, paddingHorizontal: 12 },
  lg: { paddingVertical: 15, width: '100%' },
  text: { fontFamily: fonts.bodySemibold, fontSize: 15 },
  textSm: { fontSize: 13 },
});
