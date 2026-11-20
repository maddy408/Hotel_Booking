import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { inr, fd } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function DirectCheckInPicker({ rooms, onPick, onClose }) {
  const free = rooms.filter((r) => r.status === 'free').sort((a, b) => a.roomNo - b.roomNo);
  const byType = {};
  free.forEach((r) => {
    const typeId = r.roomType?.id ?? 'default';
    const typeName = r.roomType?.name ?? 'Standard Room';
    const typeRate = r.roomType?.rate ?? 0;
    (byType[typeId] ??= { name: typeName, rate: typeRate, rooms: [] }).rooms.push(r);
  });

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="free" title="Direct Check-in" subtitle="Pick a free room for the walk-in guest" onClose={onClose} />
      <View style={styles.body}>
        {free.length ? (
          <>
            {Object.values(byType).map((group) => (
              <View key={group.name} style={{ gap: 8 }}>
                <Text style={styles.groupLabel}>
                  {group.name} · {inr(group.rate)} / day · {group.rooms.length} free
                </Text>
                <View style={styles.grid}>
                  {group.rooms.map((r) => (
                    <Pressable key={r.id} style={styles.chip} onPress={() => onPick(r)}>
                      <Text style={styles.chipText}>{r.roomNo}</Text>
                      {r.nextBookingDate ? <Text style={styles.chipDate}>{fd(r.nextBookingDate)}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            <Text style={styles.hint}>A date next to a room number means it is booked from that day.</Text>
          </>
        ) : (
          <View style={styles.warn}>
            <Text style={styles.warnText}>No free room right now. Check rooms in Cleaning and mark them ready.</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 16 },
  groupLabel: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minWidth: 54,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  chipDate: { fontFamily: fonts.body, fontSize: 10, color: colors.warning },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary },
  warn: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: 12, borderWidth: 1, borderColor: colors.warningBorder },
  warnText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.warning },
});
