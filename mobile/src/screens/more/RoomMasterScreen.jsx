import { useState, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { FieldError, FormErrorBanner, FormField, Input, Segmented } from '../../components/ui/Field.jsx';
import {
  useRoomTypes,
  useRooms,
  useCreateRoomType,
  useUpdateRoomType,
  useUpdateRoom,
  useHousekeepingAction,
  useBulkAddRooms,
} from '../../api/rooms';
import { useSettings } from '../../api/settings';
import { isRoomOverdue } from '../../lib/overdue';
import { useToast } from '../../components/ToastContext.jsx';
import { inr } from '../../lib/format';
import { useFormValidation } from '../../lib/validation';
import { colors, fonts, radii, statusColors } from '../../theme/theme';

export default function RoomMasterScreen() {
  const { data: roomTypes, isLoading, isError, error, refetch } = useRoomTypes();
  const { data: roomsData } = useRooms();
  const { data: settingsData } = useSettings();
  const createType = useCreateRoomType();
  const updateType = useUpdateRoomType();
  const updateRoom = useUpdateRoom();
  const hkAction = useHousekeepingAction();
  const bulkAdd = useBulkAddRooms();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'types'
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(null); // null | 'repair' | 'ready'
  const [addRoomsModal, setAddRoomsModal] = useState(false);

  const addRoomsScrollRef = useRef(null);
  const {
    errors: addRoomsErrors,
    formError: addRoomsFormError,
    clearError: clearAddRoomsError,
    registerInput: registerAddRoomsInput,
    registerContainer: registerAddRoomsContainer,
    registerLayout: registerAddRoomsLayout,
    handleBackendError: handleAddRoomsBackendError,
    validate: validateAddRooms,
  } = useFormValidation({
    scrollRef: addRoomsScrollRef,
    fieldOrder: ['floor', 'from', 'to', 'typeId'],
  });

  const editTypeScrollRef = useRef(null);
  const {
    errors: typeErrors,
    formError: typeFormError,
    clearError: clearTypeError,
    registerInput: registerTypeInput,
    registerContainer: registerTypeContainer,
    registerLayout: registerTypeLayout,
    handleBackendError: handleTypeBackendError,
    validate: validateType,
  } = useFormValidation({
    scrollRef: editTypeScrollRef,
    fieldOrder: ['name', 'rate', 'maxPersons'],
  });

  // Form for adding floor / room
  const [roomForm, setRoomForm] = useState({
    floor: '1',
    from: '',
    to: '',
    typeId: '',
  });

  const rooms = roomsData?.rooms || [];

  const currentEditRoom = useMemo(() => {
    if (!editRoom) return null;
    return rooms.find((r) => r.id === editRoom.id) || editRoom;
  }, [editRoom, rooms]);

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

  const getRoomStatusColor = (r) => {
    if (r.isOverdue || isRoomOverdue(r, settingsData)) {
      return statusColors.overdue;
    }
    if (r.status === 'occupied') return statusColors.occupied;
    if (r.status === 'booked' || r.hasPendingBooking) return statusColors.booked;
    if (r.status === 'repair' || r.housekeepingStatus === 'repair') return statusColors.repair;
    if (r.status === 'cleaning' || r.housekeepingStatus === 'cleaning') return statusColors.cleaning;
    return statusColors.free;
  };

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const handleRoomHousekeeping = async (action) => {
    if (!currentEditRoom || submittingAction) return;
    setSubmittingAction(action);
    try {
      await hkAction.mutateAsync({
        roomId: currentEditRoom.id,
        action,
        note: action === 'repair' ? 'Marked under repair from Room Master' : undefined,
      });
      const roomNo = currentEditRoom.roomNo;
      setEditRoom(null);
      if (action === 'repair') {
        toast(`Room ${roomNo} marked under repair.`);
      } else {
        toast(`Room ${roomNo} marked ready.`);
      }
    } catch (e) {
      // Keep popup open so the user sees the error and can correct or cancel
      toast(e.message || 'Room status update failed.');
    } finally {
      setSubmittingAction(null);
    }
  };

  const handleAddRooms = async () => {
    const isValid = validateAddRooms(() => {
      const errs = {};
      const from = parseInt(roomForm.from, 10);
      const to = roomForm.to ? parseInt(roomForm.to, 10) : from;
      const typeId = roomForm.typeId || (roomTypes?.[0]?.id ? String(roomTypes[0].id) : '');
      const floorNum = parseInt(roomForm.floor, 10);

      if (roomForm.floor === '' || isNaN(floorNum) || floorNum < 0) {
        errs.floor = 'Floor number is required (0 for Ground Floor).';
      }
      if (roomForm.from === '' || isNaN(from) || from <= 0) {
        errs.from = 'Starting room number is required.';
      }
      if (roomForm.to && (isNaN(to) || to < from)) {
        errs.to = 'Ending room number must be greater than or equal to start.';
      }
      if (!typeId) {
        errs.typeId = 'Please select a room type.';
      }
      return errs;
    });

    if (!isValid) return;

    const from = parseInt(roomForm.from, 10);
    const to = roomForm.to ? parseInt(roomForm.to, 10) : from;
    const typeId = roomForm.typeId || (roomTypes?.[0]?.id ? String(roomTypes[0].id) : '');

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
      handleAddRoomsBackendError(e);
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
                  {floorRooms.map((r) => {
                    const isMnt = r.status === 'repair' || r.housekeepingStatus === 'repair';
                    const isCln = r.status === 'cleaning' || r.housekeepingStatus === 'cleaning';
                    const sc = getRoomStatusColor(r);
                    return (
                      <Pressable
                        key={r.id}
                        style={[
                          styles.roomChip,
                          {
                            backgroundColor: sc.bg,
                            borderColor: sc.border,
                            borderWidth: 1.5,
                          },
                        ]}
                        onPress={() => setEditRoom(r)}
                      >
                        <Text style={[styles.roomChipText, { color: sc.fg }]}>
                          {r.roomNo}
                        </Text>
                        <Text style={[styles.roomChipSub, { color: sc.fg }]}>
                          {isMnt ? 'Repair' : isCln ? 'Cleaning' : r.roomType?.name}
                        </Text>
                      </Pressable>
                    );
                  })}
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
                {(roomsByType[t.id] || []).map((r) => {
                  const isMnt = r.status === 'repair' || r.housekeepingStatus === 'repair';
                  const isCln = r.status === 'cleaning' || r.housekeepingStatus === 'cleaning';
                  return (
                    <Pressable
                      key={r.id}
                      style={[
                        styles.roomChip,
                        isMnt && styles.roomChipRepair,
                        isCln && styles.roomChipCleaning,
                      ]}
                      onPress={() => setEditRoom(r)}
                    >
                      <Text style={[styles.roomChipText, isMnt && styles.roomChipTextRepair, isCln && styles.roomChipTextCleaning]}>
                        {r.roomNo}
                      </Text>
                      {(isMnt || isCln) && (
                        <Text style={[styles.roomChipSub, isMnt && styles.roomChipSubRepair, isCln && styles.roomChipSubCleaning]}>
                          {isMnt ? 'Repair' : 'Cleaning'}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
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
            <FormErrorBanner message={addRoomsFormError} />

            <FormField
              ref={registerAddRoomsContainer('floor')}
              onLayout={registerAddRoomsLayout('floor')}
              label="Floor Number * (0 for Ground Floor)"
              required
              error={addRoomsErrors.floor}
            >
              <Input
                ref={registerAddRoomsInput('floor')}
                keyboardType="numeric"
                placeholder="e.g. 1"
                value={roomForm.floor}
                onChangeText={(v) => {
                  setRoomForm((p) => ({ ...p, floor: v }));
                  clearAddRoomsError('floor');
                }}
                error={addRoomsErrors.floor}
              />
            </FormField>

            <FormField
              ref={registerAddRoomsContainer('from')}
              onLayout={registerAddRoomsLayout('from')}
              label="Room Number (or Start Number)"
              required
              error={addRoomsErrors.from}
            >
              <Input
                ref={registerAddRoomsInput('from')}
                keyboardType="numeric"
                placeholder="e.g. 101"
                value={roomForm.from}
                onChangeText={(v) => {
                  setRoomForm((p) => ({ ...p, from: v }));
                  clearAddRoomsError('from');
                }}
                error={addRoomsErrors.from}
              />
            </FormField>

            <FormField
              ref={registerAddRoomsContainer('to')}
              onLayout={registerAddRoomsLayout('to')}
              label="To Room Number (Optional, for range)"
              error={addRoomsErrors.to}
            >
              <Input
                ref={registerAddRoomsInput('to')}
                keyboardType="numeric"
                placeholder="e.g. 110 (leave blank for single room)"
                value={roomForm.to}
                onChangeText={(v) => {
                  setRoomForm((p) => ({ ...p, to: v }));
                  clearAddRoomsError('to');
                }}
                error={addRoomsErrors.to}
              />
            </FormField>

            <FormField
              ref={registerAddRoomsContainer('typeId')}
              onLayout={registerAddRoomsLayout('typeId')}
              label="Assign Room Type"
              required
              error={addRoomsErrors.typeId}
            >
              <Segmented
                options={(roomTypes || []).map((t) => ({ value: String(t.id), label: t.name }))}
                value={roomForm.typeId}
                onChange={(v) => {
                  setRoomForm((p) => ({ ...p, typeId: v }));
                  clearAddRoomsError('typeId');
                }}
                error={Boolean(addRoomsErrors.typeId)}
              />
            </FormField>

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
            <FormErrorBanner message={typeFormError} />

            <FormField
              ref={registerTypeContainer('name')}
              onLayout={registerTypeLayout('name')}
              label="Type Name"
              required
              error={typeErrors.name}
            >
              <Input
                ref={registerTypeInput('name')}
                placeholder="e.g. Deluxe Suite"
                value={editType.name}
                onChangeText={(v) => {
                  setEditType((p) => ({ ...p, name: v }));
                  clearTypeError('name');
                }}
                error={typeErrors.name}
              />
            </FormField>

            <FormField
              ref={registerTypeContainer('rate')}
              onLayout={registerTypeLayout('rate')}
              label="Daily Base Rate (₹)"
              required
              error={typeErrors.rate}
            >
              <Input
                ref={registerTypeInput('rate')}
                placeholder="e.g. 2500"
                keyboardType="numeric"
                value={String(editType.rate ?? '')}
                onChangeText={(v) => {
                  setEditType((p) => ({ ...p, rate: v }));
                  clearTypeError('rate');
                }}
                error={typeErrors.rate}
              />
            </FormField>

            <FormField
              ref={registerTypeContainer('maxPersons')}
              onLayout={registerTypeLayout('maxPersons')}
              label="Max Persons"
              required
              error={typeErrors.maxPersons}
            >
              <Input
                ref={registerTypeInput('maxPersons')}
                placeholder="e.g. 2"
                keyboardType="numeric"
                value={String(editType.maxPersons ?? editType.max_persons ?? 2)}
                onChangeText={(v) => {
                  setEditType((p) => ({ ...p, maxPersons: v }));
                  clearTypeError('maxPersons');
                }}
                error={typeErrors.maxPersons}
              />
            </FormField>

            <Button
              title="Save Room Type"
              variant="primary"
              size="lg"
              loading={createType.isPending || updateType.isPending}
              onPress={async () => {
                const isValid = validateType(() => {
                  const errs = {};
                  if (!(editType.name || '').trim()) {
                    errs.name = 'Room type name is required.';
                  }
                  const r = Number(editType.rate);
                  if (isNaN(r) || r < 0 || editType.rate === '') {
                    errs.rate = 'Daily rate is required and must be at least 0.';
                  }
                  const maxP = Number(editType.maxPersons ?? editType.max_persons);
                  if (isNaN(maxP) || maxP < 1) {
                    errs.maxPersons = 'Max persons must be at least 1.';
                  }
                  return errs;
                });
                if (!isValid) return;

                try {
                  if (editType.id) {
                    await updateType.mutateAsync({
                      id: editType.id,
                      name: editType.name.trim(),
                      rate: Number(editType.rate),
                      maxPersons: Number(editType.maxPersons || editType.max_persons || 2),
                    });
                  } else {
                    await createType.mutateAsync({
                      name: editType.name.trim(),
                      rate: Number(editType.rate),
                      maxPersons: Number(editType.maxPersons || editType.max_persons || 2),
                    });
                  }
                  setEditType(null);
                  toast('Room type saved successfully.');
                } catch (e) {
                  handleTypeBackendError(e);
                }
              }}
              style={{ marginTop: 8 }}
            />
          </View>
        </Sheet>
      )}

      {/* MODAL: EDIT INDIVIDUAL ROOM */}
      {currentEditRoom && (
        <Sheet compact onClose={() => setEditRoom(null)}>
          <SheetHeader
            title={`Room ${currentEditRoom.roomNo}`}
            subtitle={`${currentEditRoom.roomType?.name || 'Room'} · ${Number(currentEditRoom.floor) === 0 ? 'Ground Floor' : `Floor ${currentEditRoom.floor}`}`}
            showBack={false}
            onClose={() => setEditRoom(null)}
          />
          <View style={styles.roomDialogBody}>
            <View style={styles.roomStatusRow}>
              <Text style={styles.roomStatusLabel}>Current Status:</Text>
              <View
                style={[
                  styles.roomStatusBadge,
                  {
                    backgroundColor:
                      currentEditRoom.status === 'repair' || currentEditRoom.housekeepingStatus === 'repair'
                        ? colors.dangerBg
                        : currentEditRoom.status === 'cleaning' || currentEditRoom.housekeepingStatus === 'cleaning'
                        ? colors.warningBg
                        : currentEditRoom.status === 'occupied'
                        ? colors.secondaryLight
                        : currentEditRoom.status === 'booked'
                        ? colors.warningBg
                        : colors.successBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.roomStatusBadgeText,
                    {
                      color:
                        currentEditRoom.status === 'repair' || currentEditRoom.housekeepingStatus === 'repair'
                          ? colors.danger
                          : currentEditRoom.status === 'cleaning' || currentEditRoom.housekeepingStatus === 'cleaning'
                          ? colors.warning
                          : currentEditRoom.status === 'occupied'
                          ? colors.primary
                          : currentEditRoom.status === 'booked'
                          ? colors.warning
                          : colors.success,
                    },
                  ]}
                >
                  {currentEditRoom.status === 'repair' || currentEditRoom.housekeepingStatus === 'repair'
                    ? 'Under Repair'
                    : currentEditRoom.status === 'cleaning' || currentEditRoom.housekeepingStatus === 'cleaning'
                    ? 'Cleaning'
                    : currentEditRoom.status === 'occupied'
                    ? 'Occupied'
                    : currentEditRoom.status === 'booked'
                    ? 'Booked'
                    : 'Ready (Clean)'}
                </Text>
              </View>
            </View>

            <View style={styles.roomDialogActions}>
              <Button
                title={submittingAction === 'repair' ? 'Updating…' : 'Mark Under Repair'}
                variant="danger"
                size="md"
                disabled={Boolean(submittingAction) || currentEditRoom.status === 'repair' || currentEditRoom.housekeepingStatus === 'repair'}
                loading={submittingAction === 'repair'}
                onPress={() => handleRoomHousekeeping('repair')}
              />
              <Button
                title={submittingAction === 'ready' ? 'Updating…' : 'Mark Ready (Clean)'}
                variant="success"
                size="md"
                disabled={
                  Boolean(submittingAction) ||
                  ((currentEditRoom.status === 'free' || !currentEditRoom.status) && (currentEditRoom.isReady || currentEditRoom.housekeepingStatus === 'ok'))
                }
                loading={submittingAction === 'ready'}
                onPress={() => handleRoomHousekeeping('ready')}
              />
              <Button
                title="Close"
                variant="outline"
                size="md"
                disabled={Boolean(submittingAction)}
                onPress={() => setEditRoom(null)}
              />
            </View>
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
  roomChipRepair: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder },
  roomChipCleaning: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder },
  roomChipText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.primary },
  roomChipTextRepair: { color: colors.danger },
  roomChipTextCleaning: { color: colors.warning },
  roomChipSub: { fontFamily: fonts.body, fontSize: 9.5, color: colors.textSecondary, marginTop: 1 },
  roomChipSubRepair: { color: colors.danger, fontFamily: fonts.bodyBold },
  roomChipSubCleaning: { color: colors.warning, fontFamily: fonts.bodySemibold },
  body: { padding: 16, gap: 12 },
  roomDialogBody: { padding: 18, gap: 14 },
  roomStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 2 },
  roomStatusLabel: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  roomStatusBadge: { borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 4 },
  roomStatusBadgeText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  roomDialogActions: { gap: 10, marginTop: 4 },
});
