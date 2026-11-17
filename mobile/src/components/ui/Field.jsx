import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii } from '../../theme/theme';

/** Form field label + error wrapper, matching web's <div class="f"><label>...<input>. */
export function FieldLabel({ children, required, hint }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <Text style={styles.label}>
        {children}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FieldError({ children }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Input({ error, style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      style={[styles.input, error ? styles.inputError : null, style]}
      {...props}
    />
  );
}

/** Replaces web's .seg segmented button group (room type filter, payment method, etc). */
export function Segmented({ options, value, onChange, style }) {
  return (
    <View style={[styles.seg, style]}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt.toUpperCase() : opt.label;
        const active = value === val;
        return (
          <Pressable
            key={val}
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
        onPress={() => onChange((max != null ? Math.min(max, value + 1) : value + 1))}
      >
        <Text style={[styles.stepBtnText, max != null && value >= max && { opacity: 0.4 }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  hint: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 4 },
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
  inputError: { borderColor: colors.danger },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 0, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md, alignSelf: 'flex-start' },
  stepBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  stepBtnText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.primary },
  stepValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading, minWidth: 30, textAlign: 'center' },
});
