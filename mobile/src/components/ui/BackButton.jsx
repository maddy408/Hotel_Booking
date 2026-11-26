import { useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeftIcon } from '../Icons.jsx';

/**
 * Reusable Back Button component for mobile headers, secondary screens, forms and modals.
 *
 * Requirements:
 * - Uses existing React Navigation architecture and useNavigation().
 * - Displays a consistent left-arrow icon matching the mobile theme.
 * - Supports an optional custom onPress prop.
 * - Navigates to actual previous screen using existing navigation stack.
 * - Handles root screens safely without navigation errors.
 * - Supports Android hardware Back navigation.
 * - Handles forms, modals and detail screens correctly.
 * - Shows an unsaved-changes confirmation before discarding form data.
 * - Preserves previous screen state wherever possible.
 * - Avoids unnecessary Back buttons on root screens.
 */
export default function BackButton({
  navigation: propNavigation,
  onPress,
  hasUnsavedChanges = false,
  unsavedChangesTitle = 'Discard unsaved changes?',
  unsavedChangesMessage = 'You have unsaved changes. Are you sure you want to discard them and go back?',
  fallbackRoute,
  color = '#FFFFFF',
  size = 22,
  style,
  enableHardwareBack = true,
  accessibilityLabel = 'Go back',
}) {
  const hookNavigation = useNavigation();
  const navigation = propNavigation || hookNavigation;

  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const unsavedChangesTitleRef = useRef(unsavedChangesTitle);
  unsavedChangesTitleRef.current = unsavedChangesTitle;
  const unsavedChangesMessageRef = useRef(unsavedChangesMessage);
  unsavedChangesMessageRef.current = unsavedChangesMessage;
  const fallbackRouteRef = useRef(fallbackRoute);
  fallbackRouteRef.current = fallbackRoute;

  const handleBack = useCallback(() => {
    const currentOnPress = onPressRef.current;
    const currentFallback = fallbackRouteRef.current;
    const currentHasUnsaved = hasUnsavedChangesRef.current;
    const currentTitle = unsavedChangesTitleRef.current;
    const currentMsg = unsavedChangesMessageRef.current;

    const execute = () => {
      if (typeof currentOnPress === 'function') {
        currentOnPress();
        return;
      }
      const state = navigation?.getState?.();
      const canPop = state ? state.index > 0 : (navigation?.canGoBack && navigation.canGoBack());
      if (canPop) {
        navigation.goBack();
      } else if (currentFallback) {
        if (typeof navigation?.reset === 'function') {
          navigation.reset({
            index: 0,
            routes: [{ name: currentFallback }],
          });
        } else if (navigation?.navigate) {
          navigation.navigate(currentFallback);
        }
      }
    };

    if (currentHasUnsaved) {
      Alert.alert(
        currentTitle,
        currentMsg,
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: execute },
        ],
        { cancelable: true }
      );
    } else {
      execute();
    }
  }, [navigation]);

  useEffect(() => {
    if (!enableHardwareBack) return;

    const onHardwareBack = () => {
      if (hasUnsavedChangesRef.current) {
        handleBack();
        return true;
      }
      if (typeof onPressRef.current === 'function') {
        onPressRef.current();
        return true;
      }
      const state = navigation?.getState?.();
      const canPop = state ? state.index > 0 : (navigation?.canGoBack && navigation.canGoBack());
      if (canPop) {
        navigation.goBack();
        return true;
      }
      if (fallbackRouteRef.current) {
        if (typeof navigation?.reset === 'function') {
          navigation.reset({
            index: 0,
            routes: [{ name: fallbackRouteRef.current }],
          });
        } else if (navigation?.navigate) {
          navigation.navigate(fallbackRouteRef.current);
        }
        return true;
      }
      return false; // let Android handle root screen exit safely
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [enableHardwareBack, handleBack, navigation]);

  return (
    <Pressable
      onPress={handleBack}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed ? styles.pressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <ArrowLeftIcon color={color} size={size} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    marginLeft: 4,
    marginRight: 8,
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
