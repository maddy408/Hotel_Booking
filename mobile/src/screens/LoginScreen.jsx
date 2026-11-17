import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../lib/apiClient';
import TextField from '../components/ui/TextField.jsx';
import Button from '../components/ui/Button.jsx';
import { colors, fonts, radii, shadow } from '../theme/theme';

const schema = z.object({
  username: z.string().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});

export default function LoginScreen() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState('');
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await login(values.username, values.password);
      // No explicit navigation call needed — the root navigator swaps to the
      // authenticated stack automatically once AuthContext's status flips.
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not log in. Try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAwareScrollView contentContainerStyle={styles.wrap} bottomOffset={40}>
        <View style={styles.card}>
          <View style={styles.crest}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 3c-1.5 3-4 7-8 9 2.5 1 5.5 1 8-1 2.5 2 5.5 2 8 1-4-2-6.5-6-8-9Z" />
              <Path d="M12 11c-2 2.5-5 4-8 4 2 2 5 2.5 8 0 3 2.5 6 2 8 0-3 0-6-1.5-8-4Z" />
              <Path d="M12 15c-1 2-3 4-6 4 2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0-3 0-5-2-6-4Z" />
            </Svg>
          </View>
          <Text style={styles.title}>Tamarind Court</Text>
          <Text style={styles.subtitle}>Front desk sign in</Text>

          <Controller
            control={control}
            name="username"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Username"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.username?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label="Password"
                isPassword
                autoCapitalize="none"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />

          {serverError ? (
            <View style={styles.warn}>
              <Text style={styles.warnText}>{serverError}</Text>
            </View>
          ) : null}

          <Button
            title={isSubmitting ? 'Signing in…' : 'Sign in'}
            variant="primary"
            size="lg"
            loading={isSubmitting}
            onPress={handleSubmit(onSubmit)}
            style={{ marginTop: 6 }}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 28,
    gap: 14,
    ...shadow.pop,
  },
  crest: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.heading, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: -8, marginBottom: 4 },
  warn: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: 10 },
  warnText: { fontFamily: fonts.bodySemibold, color: colors.warning, fontSize: 13 },
});
