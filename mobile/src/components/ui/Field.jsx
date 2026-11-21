import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii } from '../../theme/theme';
import SearchInput from './SearchInput.jsx';

export { SearchInput };

/** Form field label wrapper matching web's <label> */
export function FieldLabel({ children, required, hint, style }) {
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }, style]}>
      <Text style={styles.label}>
        {children}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Distinct, visible error message displayed directly below the field */
export function FieldError({ children, style }) {
  if (!children) return null;
  return (
    <Text style={[styles.error, style]} accessibilityRole="alert">
      {children}
    </Text>
  );
}

/** Standalone banner for unmapped / form-level validation or backend errors */
export function FormErrorBanner({ message, style }) {
  if (!message) return null;
  return (
    <View style={[styles.formErrorBanner, style]} accessibilityRole="alert">
      <Text style={styles.formErrorText}>⚠️ {message}</Text>
    </View>
  );
}

/** Standard text input with visible error border and ref forwarding for auto-focus */
export const Input = forwardRef(function Input({ error, style, ...props }, ref) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.textSecondary}
      style={[styles.input, error ? styles.inputError : null, style]}
      accessibilityInvalid={!!error}
      {...props}
    />
  );
});

/** Convenient container wrapping label, input control, and field error with ref/layout support */
export const FormField = forwardRef(function FormField(
  { label, required, hint, error, children, style, onLayout, ...rest },
  ref
) {
  return (
    <View ref={ref} onLayout={onLayout} style={[styles.fieldWrap, style]} {...rest}>
      {label ? <FieldLabel required={required} hint={hint}>{label}</FieldLabel> : null}
      {children}
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
});

/** Replaces web's .seg segmented button group (room type filter, payment method, etc). */
export function Segmented({ options, value, onChange, style, error }) {
  return (
    <View style={[styles.seg, error && styles.segError, style]}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt.toUpperCase() : opt.label;
        const active = value === val;
        return (
          <Pressable
            key={String(val)}
            onPress={() => onChange(val)}
            style={[styles.segBtn, active && styles.segBtnActive]}
          >
            <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Replaces web's .step +/- numeric stepper (days, persons). */
export function Stepper({ value, onChange, min = 1, max }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepBtn}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
      >
        <Text style={[styles.stepBtnText, value <= min && { opacity: 0.4 }]}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        style={styles.stepBtn}
        disabled={max != null && value >= max}
        onPress={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
      >
        <Text style={[styles.stepBtnText, max != null && value >= max && { opacity: 0.4 }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    gap: 4,
    marginBottom: 12,
  },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  error: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12.5,
    color: colors.danger,
    marginTop: 4,
    lineHeight: 16,
  },
  formErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  formErrorText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 1.5,
    backgroundColor: '#FFF5F5',
  },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  segError: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: radii.md,
    padding: 4,
    backgroundColor: '#FFF5F5',
  },
  segBtn: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segText: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.text },
  segTextActive: { color: '#fff' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignSelf: 'flex-start',
  },
  stepBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  stepBtnText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.primary },
  stepValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.heading,
    minWidth: 30,
    textAlign: 'center',
  },
});
