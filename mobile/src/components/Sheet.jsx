import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, radii, shadow, statusColors } from '../theme/theme';

/**
 * Mobile equivalent of the web's Sheet.jsx scrim + popup — rendered as a full-screen
 * Modal with a bottom sheet card, matching the web app's single popup pattern for
 * every room/booking action (RoomDetailsSheet, CheckInSheet, CheckoutSheet, etc).
 */
export default function Sheet({ onClose, children, scroll = true }) {
  const inner = scroll ? (
    <ScrollView contentContainerStyle={styles.scrollBody} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.body}>{children}</View>
  );

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          {inner}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function SheetHeader({ status, badge, title, subtitle, onClose }) {
  const c = status ? statusColors[status] : null;
  return (
    <View style={[styles.header, c ? { backgroundColor: c.bg, borderBottomColor: c.border } : null]}>
      {badge !== undefined ? (
        <View style={[styles.badge, c ? { backgroundColor: c.fg } : null]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
        <Text style={styles.closeText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '92%',
    ...shadow.pop,
  },
  scrollBody: { paddingBottom: 24 },
  body: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  badge: { borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primary },
  badgeText: { fontFamily: fonts.bodyBold, color: '#fff', fontSize: 13 },
  title: { fontFamily: fonts.displaySemibold, fontSize: 16, color: colors.heading },
  subtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 24, color: colors.textSecondary, lineHeight: 24 },
});
