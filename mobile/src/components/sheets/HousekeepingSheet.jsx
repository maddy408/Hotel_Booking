import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/Field.jsx';
import { useHousekeepingAction } from '../../api/rooms';
import { useToast } from '../ToastContext.jsx';
import { colors, fonts } from '../../theme/theme';

export default function HousekeepingSheet({ room, onClose }) {
  const [note, setNote] = useState('');
  const action = useHousekeepingAction();
  const toast = useToast();

  const run = async (act) => {
    try {
      await action.mutateAsync({ roomId: room.id, action: act, note: note.trim() || undefined });
      onClose();
      toast(
        act === 'ready'
          ? `Room ${room.roomNo} is ready.`
          : act === 'repair'
            ? `Room ${room.roomNo} sent for repair.`
            : `Room ${room.roomNo} sent for cleaning.`
      );
    } catch (err) {
      toast(err.message);
    }
  };

  if (room.status === 'repair') {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="repair" badge={room.roomNo} title="Under repair" subtitle={room.roomType.name} onClose={onClose} />
        <View style={styles.body}>
          <Text style={styles.label}>Problem</Text>
          <Text style={styles.value}>{room.note || 'Not written'}</Text>
          <Button title="Repair done, send for cleaning" variant="success" size="lg" loading={action.isPending} onPress={() => run('cleaning')} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="cleaning" badge={room.roomNo} title="Being cleaned" subtitle={room.roomType.name} onClose={onClose} />
      <View style={styles.body}>
        <Text style={styles.value}>
          Housekeeping is cleaning this room. Mark it ready when they finish so you can give it to the next guest.
        </Text>
        <Button title="Room is ready" variant="success" size="lg" loading={action.isPending} onPress={() => run('ready')} />
        <View>
          <Text style={styles.label}>Found a problem? Write it here</Text>
          <Input placeholder="e.g. Bathroom tap leaking" value={note} onChangeText={setNote} />
        </View>
        <Button title="Send for repair" variant="danger" loading={action.isPending} onPress={() => run('repair')} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  value: { fontFamily: fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 },
});
