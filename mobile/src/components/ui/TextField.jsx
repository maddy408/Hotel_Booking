import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radii } from '../../theme/theme';
import { EyeIcon, EyeOffIcon } from '../Icons.jsx';

const TextField = forwardRef(function TextField(
  {
    label,
    error,
    style,
    required,
    isPassword,
    secureTextEntry,
    containerRef,
    onLayout,
    ...inputProps
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const isSecure = isPassword ? !showPassword : secureTextEntry;

  return (
    <View ref={containerRef} onLayout={onLayout} style={[styles.wrap, style]}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.req}> *</Text> : null}
        </Text>
      ) : null}
      <View style={styles.inputContainer}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            error ? styles.inputError : null,
            isPassword ? { paddingRight: 42 } : null,
          ]}
          secureTextEntry={isSecure}
          accessibilityInvalid={!!error}
          {...inputProps}
        />
        {isPassword ? (
          <Pressable
            style={styles.eyeBtn}
            onPress={() => setShowPassword((prev) => !prev)}
            hitSlop={8}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOffIcon color={colors.primary} size={20} />
            ) : (
              <EyeIcon color={colors.textSecondary} size={20} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrap: { gap: 5, marginBottom: 12 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  req: { color: colors.danger },
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
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
  eyeBtn: {
    position: 'absolute',
    right: 12,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 1.5,
    backgroundColor: '#FFF5F5',
  },
  error: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12.5,
    color: colors.danger,
    marginTop: 2,
    lineHeight: 16,
  },
});
