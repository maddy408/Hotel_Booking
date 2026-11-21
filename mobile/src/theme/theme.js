/**
 * Ported 1:1 from frontend/src/styles/theme.css — "Premium Dark Navy Blue,
 * Deep Ocean Blue, Slate & Crisp White". Keep this file and theme.css in sync;
 * do not invent new colors here (see PROTECTION RULES in the mobile conversion brief).
 */
export const colors = {
  primary: '#0B0B58',
  primaryDark: '#07073B',
  primaryHover: '#121272',
  primaryActive: '#050529',
  secondary: '#1E297A',
  secondaryLight: '#EEF2FF',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  card: '#FFFFFF',
  cardSecondary: '#F8FAFC',
  cardBorder: '#E2E8F0',

  header: '#0B0B58',
  headerDark: '#07073B',
  headerText: '#FFFFFF',
  navigation: 'rgba(255, 255, 255, 0.18)',
  navigationHover: 'rgba(255, 255, 255, 0.28)',
  navigationActive: '#FFFFFF',
  navigationActiveText: '#0B0B58',

  heading: '#0F172A',
  text: '#1E293B',
  textSecondary: '#64748B',
  muted: '#64748B',
  buttonText: '#FFFFFF',

  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  borderStrong: '#CBD5E1',

  // Semantic status colors (room/booking status chips, tiles, badges)
  success: '#15803D',
  successBg: '#DCFCE7',
  successBorder: '#BBF7D0',

  warning: '#B45309',
  warningBg: '#FEF3C7',
  warningBorder: '#FDE68A',

  info: '#0284C7',
  infoBg: '#E0F2FE',
  infoBorder: '#BAE6FD',

  cleaning: '#4F46E5',
  cleaningBg: '#EEF2FF',
  cleaningBorder: '#E0E7FF',

  danger: '#BE123C',
  dangerBg: '#FFE4E6',
  dangerBorder: '#FECDD3',

  focusRing: 'rgba(26, 54, 93, 0.22)',
  scrim: 'rgba(15, 23, 42, 0.55)',
};

/** Room/booking status -> { fg, bg, border } — mirrors .s-free/.s-occupied/etc in theme.css. */
export const statusColors = {
  free: { fg: colors.success, bg: colors.successBg, border: colors.successBorder },
  occupied: { fg: colors.info, bg: colors.infoBg, border: colors.infoBorder },
  cleaning: { fg: colors.cleaning, bg: colors.cleaningBg, border: colors.cleaningBorder },
  repair: { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder },
  booked: { fg: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
  overdue: { fg: colors.danger, bg: colors.dangerBg, border: colors.dangerBorder },
};

export const radii = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 9999,
};

export const shadow = {
  card: {
    shadowColor: 'rgba(48, 34, 61, 1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  pop: {
    shadowColor: 'rgba(48, 34, 61, 1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 10,
  },
};

/** Font family names — registered via expo-font in App.jsx using @expo-google-fonts/*. */
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displaySemibold: 'BricolageGrotesque_600SemiBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemibold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
