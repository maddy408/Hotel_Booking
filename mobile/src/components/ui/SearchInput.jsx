import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, Text } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, fonts, radii } from '../../theme/theme';

const SearchIcon = ({ size = 16, color = colors.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx="11" cy="11" r="8" />
    <Line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Svg>
);

const ClearIcon = ({ size = 14, color = colors.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Svg>
);

const SearchInput = forwardRef(function SearchInput(
  {
    value = '',
    onChangeText,
    onClear,
    placeholder = 'Search…',
    style,
    inputStyle,
    ...props
  },
  ref
) {
  const hasValue = Boolean(value && value.length > 0);

  const handleClear = () => {
    if (onChangeText) onChangeText('');
    if (onClear) onClear();
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap} pointerEvents="none">
        <SearchIcon size={16} color={colors.textSecondary} />
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, inputStyle]}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityRole="search"
        {...props}
      />
      {hasValue ? (
        <Pressable
          onPress={handleClear}
          hitSlop={10}
          style={styles.clearBtn}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <View style={styles.clearBadge}>
            <ClearIcon size={12} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
});

export default SearchInput;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    minHeight: 42,
  },
  iconWrap: {
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14.5,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  clearBtn: {
    marginLeft: 6,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
