import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { Input, Segmented } from '../../components/ui/Field.jsx';
import {
  useRoomTypes,
  useRooms,
  useCreateRoomType,
  useUpdateRoomType,
  useUpdateRoom,
  useBulkAddRooms,
} from '../../api/rooms';
import { useToast } from '../../components/ToastContext.jsx';
import { inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function RoomMasterScreen() {
  const { data: roomTypes, isLoading, isError, error, refetch } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const createType = useCreateRoomType();
  const updateType = useUpdateRoomType();
  const updateRoom = useUpdateRoom();
  const bulkAdd = useBulkAddRooms();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'types'
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);
  const [addRoomsModal, setAddRoomsModal] = useState(false);

  // Form for adding floor / room
  const [roomForm, setRoomForm] = useState({
    floor: '1',
    from: '',
    to: '',
    typeId: '',
  });

  const rooms = roomsData?.rooms || [];

  // Group rooms by floor
  const floors = useMemo(() => {
    const list = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b);
    return list;
  }, [rooms]);

  const roomsByType = useMemo(() => {
    const map = {};
    rooms.forEach((r) => {
      (map[r.roomType.id] ??= []).push(r);
    });
    return map;
  }, [rooms]);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const handleAddRooms = async () => {
    const from = parseInt(roomForm.from, 10);
    const to = roomForm.to ? parseInt(roomForm.to, 10) : from;
    const typeId = roomForm.typeId || (roomTypes?.[0]?.id ? String(roomTypes[0].id) : '');

    if (isNaN(from) || from <= 0) {
      toast('Please enter a valid starting room number.');
      return;
    }
    if (isNaN(to) || to < from) {
      toast('Ending room number must be greater than or equal to start.');
      return;
    }
    if (!typeId) {
      toast('Please select a room type.');
      return;
    }

    try {
      const result = await bulkAdd.mutateAsync({
        floor: Number(roomForm.floor),
        from,
        to,
        roomTypeId: Number(typeId),
      });

      const floorName = Number(roomForm.floor) === 0 ? 'Ground floor' : `Floor ${roomForm.floor}`;
      toast(`${result.added || (to - from + 1)} room(s) added to ${floorName}!`);
      setAddRoomsModal(false);
      setRoomForm({ floor: '1', from: '', to: '', typeId: '' });
    } catch (e) {
      toast(e.message || 'Failed to add rooms.');
    }
  };

  return (
    <Screen onRefresh={refetch}>
      {/* Top Switcher Tabs */}
      <View style={styles.topTabs}>
        <Pressable
          style={[styles.topTab, activeTab === 'rooms' && styles.topTabActive]}
          onPress={() => setActiveTab('rooms')}
        >
          <Text style={[styles.topTabText, activeTab === 'rooms' && styles.topTabTextActive]}>
            Floors & Rooms ({rooms.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.topTab, activeTab === 'types' && styles.topTabActive]}
          onPress={() => setActiveTab('types')}
        >
          <Text style={[styles.topTabText, activeTab === 'types' && styles.topTabTextActive]}>
            Room Types ({roomTypes?.length || 0})
          </Text>
        </Pressable>
      </View>

      {/* -------------------- FLOORS & ROOMS TAB -------------------- */}
      {activeTab === 'rooms' && (
        <>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>All Rooms & Floors</Text>
              <Text style={styles.subTitle}>Manage floors and configure individual rooms</Text>
            </View>
            <Button
              title="+ Add Rooms / Floor"
              variant="primary"
              size="sm"
              onPress={() => {
                setRoomForm({
                  floor: '1',
                  from: '',
                  to: '',
                  typeId: roomTypes?.[0]?.id ? String(roomTypes[0].id) : '',
                });
                setAddRoomsModal(true);
              }}
            />
          </View>

          {floors.map((f) => {
            const floorRooms = rooms.filter((r) => r.floor === f).sort((a, b) => a.roomNo - b.roomNo);
            const floorName = Number(f) === 0 ? 'Ground Floor' : `Floor ${f}`;

            return (
              <View key={f} style={styles.floorCard}>
                <View style={styles.floorHeader}>
                  <Text style={styles.floorName}>{floorName}</Text>
                  <Text style={styles.floorMeta}>{floorRooms.length} room{floorRooms.length === 1 ? '' : 's'}</Text>
                </View>
                <View style={styles.roomGrid}>
                  {floorRooms.map((r) => (
                    <Pressable key={r.id} style={styles.roomChip} onPress={() => setEditRoom(r)}>
                      <Text style={styles.roomChipText}>{r.roomNo}</Text>
                      <Text style={styles.roomChipSub}>{r.roomType?.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}

          {floors.length === 0 && (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Text style={styles.meta}>No rooms created yet. Tap "+ Add Rooms / Floor" to start.</Text>
            </View>
          )}
        </>
      )}

      {/* -------------------- ROOM TYPES TAB -------------------- */}
      {activeTab === 'types' && (
        <>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Room Types</Text>
              <Text style={styles.subTitle}>Categories, rates, and occupancy rules</Text>
            </View>
            <Button
              title="+ Add Type"
              variant="primary"
              size="sm"
              onPress={() => setEditType({ name: '', rate: '', max_persons: '2', code: '' })}
            />
          </View>

          {(roomTypes || []).map((t) => (
            <View key={t.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
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
        </>
      )}

      {/* MODAL: ADD ROOMS / FLOOR */}
      {addRoomsModal && (
        <Sheet onClose={() => setAddRoomsModal(false)}>
          <SheetHeader title="Add Rooms / Floor" onClose={() => setAddRoomsModal(false)} />
          <View style={styles.body}>
            <Text style={styles.label}>Floor Number * (0 for Ground Floor)</Text>
            <Input
              keyboardType="numeric"
              placeholder="e.g. 1"
              value={roomForm.floor}
              onChangeText={(v) => setRoomForm((p) => ({ ...p, floor: v }))}
            />

            <Text style={styles.label}>Room Number (or Start Number) *</Text>
            <Input
              keyboardType="numeric"
              placeholder="e.g. 101"
              value={roomForm.from}
              onChangeText={(v) => setRoomForm((p) => ({ ...p, from: v }))}
            />

            <Text style={styles.label}>To Room Number (Optional, for range)</Text>
            <Input
              keyboardType="numeric"
              placeholder="e.g. 110 (leave blank for single room)"
              value={roomForm.to}
              onChangeText={(v) => setRoomForm((p) => ({ ...p, to: v }))}
            />

            <Text style={styles.label}>Assign Room Type *</Text>
            <Segmented
              options={(roomTypes || []).map((t) => ({ value: String(t.id), label: t.name }))}
              value={roomForm.typeId}
              onChange={(v) => setRoomForm((p) => ({ ...p, typeId: v }))}
            />

            <Button
              title={bulkAdd.isPending ? 'Adding Rooms…' : 'Add Room(s)'}
              variant="primary"
              size="lg"
              loading={bulkAdd.isPending}
              onPress={handleAddRooms}
              style={{ marginTop: 8 }}
            />
          </View>
        </Sheet>
      )}

      {/* MODAL: EDIT ROOM TYPE */}
      {editType && (
        <Sheet onClose={() => setEditType(null)}>
          <SheetHeader title={editType.id ? 'Edit Room Type' : 'Add Room Type'} onClose={() => setEditType(null)} />
          <View style={styles.body}>
            <Text style={styles.label}>Type Name *</Text>
            <Input placeholder="e.g. Deluxe Suite" value={editType.name} onChangeText={(v) => setEditType((p) => ({ ...p, name: v }))} />

            <Text style={styles.label}>Daily Base Rate (₹) *</Text>
            <Input placeholder="e.g. 2500" keyboardType="numeric" value={String(editType.rate ?? '')} onChangeText={(v) => setEditType((p) => ({ ...p, rate: v }))} />

            <Text style={styles.label}>Max Persons *</Text>
            <Input placeholder="e.g. 2" keyboardType="numeric" value={String(editType.maxPersons ?? editType.max_persons ?? 2)} onChangeText={(v) => setEditType((p) => ({ ...p, maxPersons: v }))} />

            <Button
              title="Save Room Type"
              variant="primary"
              size="lg"
              loading={createType.isPending || updateType.isPending}
              onPress={async () => {
                try {
                  if (editType.id) {
                    await updateType.mutateAsync({
                      id: editType.id,
                      name: editType.name,
                      rate: Number(editType.rate),
                      maxPersons: Number(editType.maxPersons || editType.max_persons || 2),
                    });
                  } else {
                    await createType.mutateAsync({
                      name: editType.name,
                      rate: Number(editType.rate),
                      maxPersons: Number(editType.maxPersons || editType.max_persons || 2),
                    });
                  }
                  setEditType(null);
                  toast('Room type saved successfully.');
                } catch (e) {
                  toast(e.message);
                }
              }}
              style={{ marginTop: 8 }}
            />
          </View>
        </Sheet>
      )}

      {/* MODAL: EDIT INDIVIDUAL ROOM */}
      {editRoom && (
        <Sheet onClose={() => setEditRoom(null)}>
          <SheetHeader title={`Room ${editRoom.roomNo}`} onClose={() => setEditRoom(null)} />
          <View style={styles.body}>
            <Text style={styles.meta}>{editRoom.roomType?.name} · Floor {editRoom.floor}</Text>
            <Button
              title="Mark Under Repair"
              variant="danger"
              size="sm"
              loading={updateRoom.isPending}
              onPress={async () => {
                try {
                  await updateRoom.mutateAsync({ id: editRoom.id, housekeepingStatus: 'repair' });
                  setEditRoom(null);
                  toast(`Room ${editRoom.roomNo} marked under repair.`);
                } catch (e) {
                  toast(e.message);
                }
              }}
            />
            <Button
              title="Mark Ready (Clean)"
              variant="success"
              size="sm"
              loading={updateRoom.isPending}
              onPress={async () => {
                try {
                  await updateRoom.mutateAsync({ id: editRoom.id, housekeepingStatus: 'ok' });
                  setEditRoom(null);
                  toast(`Room ${editRoom.roomNo} marked ready.`);
                } catch (e) {
                  toast(e.message);
                }
              }}
            />
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topTabs: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.md, padding: 3, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  topTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radii.sm },
  topTabActive: { backgroundColor: colors.primary },
  topTabText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  topTabTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.heading },
  subTitle: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },
  floorCard: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 12 },
  floorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  floorName: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading },
  floorMeta: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  typeName: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading, marginBottom: 4 },
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roomChip: { backgroundColor: colors.secondaryLight, borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  roomChipText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.primary },
  roomChipSub: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textSecondary, marginTop: 1 },
  body: { padding: 16, gap: 12 },
});
