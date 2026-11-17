import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { useRoomTypes, useRooms, useCreateRoomType, useUpdateRoomType, useUpdateRoom } from '../../api/rooms';
import { useToast } from '../../components/ToastContext.jsx';
import { inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * Simplified adaptation of the web's RoomMaster.jsx (423 lines, with bulk room
 * creation and drag-reassignment — not yet ported, see
 * MOBILE_IMPLEMENTATION_PROGRESS.md). Lists room types and rooms; supports creating
 * and editing a room type against the live backend.
 */
export default function RoomMasterScreen() {
  const { data: roomTypes, isLoading, isError, error, refetch } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const createType = useCreateRoomType();
  const updateType = useUpdateRoomType();
  const updateRoom = useUpdateRoom();
  const toast = useToast();
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const roomsByType = {};
  (roomsData?.rooms || []).forEach((r) => { (roomsByType[r.roomType.id] ??= []).push(r); });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Room Types</Text>
        <Button title="+ Add Type" variant="primary" size="sm" onPress={() => setEditType({ name: '', rate: '', max_persons: '2', code: '' })} />
      </View>

      {(roomTypes || []).map((t) => (
        <View key={t.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.typeName}>{t.name}</Text>
              <Text style={styles.meta}>{inr(t.rate)}/night · Max {t.maxPersons || t.max_persons} persons</Text>
            </View>
            <Button title="Edit" variant="outline" size="sm" onPress={() => setEditType(t)} />
          </View>
          <View style={styles.roomGrid}>
            {(roomsByType[t.id] || []).map((r) => (
              <Pressable key={r.id} style={styles.roomChip} onPress={() => setEditRoom(r)}>
                <Text style={styles.roomChipText}>{r.roomNo}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {editType && (
        <Sheet onClose={() => setEditType(null)}>
          <SheetHeader title={editType.id ? 'Edit Room Type' : 'Add Room Type'} onClose={() => setEditType(null)} />
          <View style={styles.body}>
            <Input placeholder="Name" value={editType.name} onChangeText={(v) => setEditType((p) => ({ ...p, name: v }))} />
            <Input placeholder="Code" value={editType.code} onChangeText={(v) => setEditType((p) => ({ ...p, code: v }))} />
            <Input placeholder="Rate per night" keyboardType="numeric" value={String(editType.rate)} onChangeText={(v) => setEditType((p) => ({ ...p, rate: v }))} />
            <Input placeholder="Max persons" keyboardType="numeric" value={String(editType.maxPersons || editType.max_persons || '')} onChangeText={(v) => setEditType((p) => ({ ...p, max_persons: v }))} />
            <Button
              title="Save" variant="primary" size="lg"
              loading={createType.isPending || updateType.isPending}
              onPress={async () => {
                try {
                  const payload = { name: editType.name, code: editType.code, rate: Number(editType.rate), maxPersons: Number(editType.max_persons || editType.maxPersons) };
                  if (editType.id) await updateType.mutateAsync({ id: editType.id, ...payload });
                  else await createType.mutateAsync(payload);
                  setEditType(null);
                  toast('Room type saved.');
                } catch (e) { toast(e.message); }
              }}
            />
          </View>
        </Sheet>
      )}

      {editRoom && (
        <Sheet onClose={() => setEditRoom(null)}>
          <SheetHeader title={`Room ${editRoom.roomNo}`} onClose={() => setEditRoom(null)} />
          <View style={styles.body}>
            <Text style={styles.meta}>{editRoom.roomType?.name} · Floor {editRoom.floor}</Text>
            <Button
              title="Mark Under Repair" variant="danger" size="sm" loading={updateRoom.isPending}
              onPress={async () => {
                try {
                  await updateRoom.mutateAsync({ id: editRoom.id, housekeepingStatus: 'repair' });
                  setEditRoom(null);
                  toast(`Room ${editRoom.roomNo} marked under repair.`);
                } catch (e) { toast(e.message); }
              }}
            />
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.heading },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  typeName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roomChip: { backgroundColor: colors.secondaryLight, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 5 },
  roomChipText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.primary },
  body: { padding: 16, gap: 12 },
});
