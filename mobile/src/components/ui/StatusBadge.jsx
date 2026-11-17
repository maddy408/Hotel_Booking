import { StyleSheet, Text, View } from 'react-native';
import { fonts, radii, statusColors } from '../../theme/theme';

const LABEL = { free: 'Free', booked: 'Booked', occupied: 'Occupied', cleaning: 'Cleaning', repair: 'Repair' };

export default function StatusBadge({ status, label }) {
  const c = statusColors[status] || statusColors.free;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label || LABEL[status] || status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.full,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 },
});
