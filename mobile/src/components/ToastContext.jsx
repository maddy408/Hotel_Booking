import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, fonts, radii } from '../theme/theme';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const toast = useCallback(
    (text) => {
      setMessage(text);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMessage(null));
      }, 3000);
    },
    [opacity]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {message != null && (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
          <Text style={styles.text}>{message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 32,
    backgroundColor: colors.heading,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    elevation: 6,
  },
  text: {
    color: colors.surface,
    fontFamily: fonts.bodySemibold,
    fontSize: 14,
    textAlign: 'center',
  },
});
