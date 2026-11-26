import { useState, useMemo, useRef } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { FieldError, FormErrorBanner, FormField, Input, Segmented } from '../../components/ui/Field.jsx';
import {
  useRoomTypes,
  useRooms,
  useCreateRoomType,
  useUpdateRoomType,
  useDeleteRoomType,
  useUpdateRoom,
  useDeleteRoom,
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
  const deleteType = useDeleteRoomType();
  const updateRoom = useUpdateRoom();
  const deleteRoom = useDeleteRoom();
  const hkAction = useHousekeepingAction();
  const bulkAdd = useBulkAddRooms();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms' | 'types'
  const [editType, setEditType] = useState(null);
  const [editRoom, setEditRoom] = useState(null);
  const [isEditingRoom, setIsEditingRoom] = useState(false);
  const [editRoomForm, setEditRoomForm] = useState({
    roomNo: '',
    floor: '',
    roomTypeId: '',
    note: '',
  });
  const [editRoomErrors, setEditRoomErrors] = useState({});
  const [isSavingRoom, setIsSavingRoom] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(null); // null | 'repair' | 'ready'
  const [deletingRoomId, setDeletingRoomId] = useState(null);
  const [deletingTypeId, setDeletingTypeId] = useState(null);
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

  const getRoomStatusDetails = (r) => {
    if (!r) {
      return { label: 'Ready (Clean)', bg: statusColors.free.bg, color: statusColors.free.fg, border: statusColors.free.border };
    }
    if (r.isOverdue || isRoomOverdue(r, settingsData)) {
      return { label: 'Overdue', bg: statusColors.overdue.bg, color: statusColors.overdue.fg, border: statusColors.overdue.border };
    }
    if (r.status === 'repair' || r.housekeepingStatus === 'repair') {
      return { label: 'Under Repair', bg: statusColors.repair.bg, color: statusColors.repair.fg, border: statusColors.repair.border };
    }
    if (r.status === 'cleaning' || r.housekeepingStatus === 'cleaning') {
      return { label: 'Cleaning', bg: statusColors.cleaning.bg, color: statusColors.cleaning.fg, border: statusColors.cleaning.border };
    }
    if (r.status === 'occupied') {
      return { label: 'Occupied', bg: statusColors.occupied.bg, color: statusColors.occupied.fg, border: statusColors.occupied.border };
    }
    if (r.status === 'booked' || r.hasPendingBooking) {
      return { label: 'Booked', bg: statusColors.booked.bg, color: statusColors.booked.fg, border: statusColors.booked.border };
    }
    return { label: 'Ready (Clean)', bg: statusColors.free.bg, color: statusColors.free.fg, border: statusColors.free.border };
  };

  const startEditingRoom = () => {
    if (!currentEditRoom) return;
    setEditRoomForm({
      roomNo: String(currentEditRoom.roomNo ?? ''),
      floor: String(currentEditRoom.floor ?? ''),
      roomTypeId: String(currentEditRoom.roomType?.id || currentEditRoom.room_type_id || (roomTypes?.[0]?.id ? String(roomTypes[0].id) : '')),
      note: currentEditRoom.note || '',
    });
    setEditRoomErrors({});
    setIsEditingRoom(true);
  };

  const handleSaveRoom = async () => {
    if (!currentEditRoom || isSavingRoom) return;
    const errs = {};
    const roomNo = parseInt(editRoomForm.roomNo, 10);
    const floor = parseInt(editRoomForm.floor, 10);

    if (!editRoomForm.roomNo || isNaN(roomNo) || roomNo <= 0) {
      errs.roomNo = 'Valid room number greater than 0 is required.';
    }
    if (editRoomForm.floor === '' || isNaN(floor) || floor < 0) {
      errs.floor = 'Floor number is required (0 for Ground Floor).';
    }
    if (!editRoomForm.roomTypeId) {
      errs.roomTypeId = 'Please select a room type.';
    }

    if (Object.keys(errs).length > 0) {
      setEditRoomErrors(errs);
      return;
    }

    setIsSavingRoom(true);
    try {
      await updateRoom.mutateAsync({
        id: currentEditRoom.id,
        roomNo,
        floor,
        roomTypeId: Number(editRoomForm.roomTypeId),
        note: editRoomForm.note.trim() ? editRoomForm.note.trim() : null,
      });
      toast(`Room ${roomNo} details updated.`);
      setIsEditingRoom(false);
    } catch (e) {
      const msg = e.message || 'Failed to update room.';
      if (msg.toLowerCase().includes('already exists')) {
        setEditRoomErrors({ roomNo: msg });
      } else {
        toast(msg);
      }
    } finally {
      setIsSavingRoom(false);
    }
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

  const handleDeleteRoom = (room) => {
    if (!room || deletingRoomId) return;
    Alert.alert(
      'Delete Room',
      `Are you sure you want to delete Room ${room.roomNo}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingRoomId(room.id);
            try {
              await deleteRoom.mutateAsync(room.id);
              toast(`Room ${room.roomNo} deleted.`);
              setEditRoom(null);
            } catch (e) {
              const msg = e.message || 'Failed to delete room.';
              toast(msg);
              Alert.alert('Cannot Delete Room', msg);
            } finally {
              setDeletingRoomId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteType = (type) => {
    if (!type || deletingTypeId) return;
    const count = roomsByType[type.id]?.length || 0;
    if (count > 0) {
      const msg = `Cannot delete "${type.name}": this room type has ${count} room(s) assigned. Change or remove the rooms first.`;
      toast(msg);
      Alert.alert('Cannot Delete Room Type', msg);
      return;
    }
    Alert.alert(
      'Delete Room Type',
      `Are you sure you want to delete "${type.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingTypeId(type.id);
            try {
              await deleteType.mutateAsync(type.id);
              toast(`Room type "${type.name}" deleted.`);
              if (editType?.id === type.id) setEditType(null);
            } catch (e) {
              const msg = e.message || 'Failed to delete room type.';
              toast(msg);
              Alert.alert('Cannot Delete Room Type', msg);
            } finally {
              setDeletingTypeId(null);
            }
          },
        },
      ]
    );
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
            <View style={{ flex: 1, minWidth: 150, marginRight: 8 }}>
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
                        onPress={() => {
                          setEditRoom(r);
                          setIsEditingRoom(false);
                        }}
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
            <View style={{ flex: 1, minWidth: 150, marginRight: 8 }}>
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
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Button title="Edit" variant="outline" size="sm" onPress={() => setEditType(t)} />
                  <Button
                    title="Delete"
                    variant="danger"
                    size="sm"
                    disabled={deletingTypeId === t.id || deleteType.isPending}
                    loading={deletingTypeId === t.id}
                    onPress={() => handleDeleteType(t)}
                  />
                </View>
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
                      onPress={() => {
                        setEditRoom(r);
                        setIsEditingRoom(false);
                      }}
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

            {editType.id ? (
              <Button
                title={deletingTypeId === editType.id ? 'Deleting…' : 'Delete Room Type'}
                variant="danger"
                size="lg"
                disabled={deletingTypeId === editType.id || deleteType.isPending}
                loading={deletingTypeId === editType.id}
                onPress={() => handleDeleteType(editType)}
                style={{ marginTop: 4 }}
              />
            ) : null}
          </View>
        </Sheet>
      )}

      {/* MODAL: EDIT INDIVIDUAL ROOM */}
      {currentEditRoom && (() => {
        const statusDetails = getRoomStatusDetails(currentEditRoom);
        const isRepair = currentEditRoom.status === 'repair' || currentEditRoom.housekeepingStatus === 'repair';
        const isCleaning = currentEditRoom.status === 'cleaning' || currentEditRoom.housekeepingStatus === 'cleaning';
        const isOccupied = currentEditRoom.status === 'occupied';
        const isBooked = currentEditRoom.status === 'booked' || currentEditRoom.hasPendingBooking;
        const isCleanAndReady = (currentEditRoom.status === 'free' || !currentEditRoom.status) && (currentEditRoom.isReady || currentEditRoom.housekeepingStatus === 'ok');

        const canMarkRepair = !isRepair;
        const canMarkReady = isCleaning || isRepair || (!isCleanAndReady && !isOccupied && !isBooked);
        const canDeleteRoom = !isOccupied && !isBooked;

        return (
          <Sheet bottomSheet onClose={() => setEditRoom(null)} scroll={false}>
            <SheetHeader
              title={isEditingRoom ? `Edit Room ${currentEditRoom.roomNo}` : `Room ${currentEditRoom.roomNo}`}
              subtitle={
                isEditingRoom
                  ? 'Update room configuration and details'
                  : `${currentEditRoom.roomType?.name || 'Room'} · ${Number(currentEditRoom.floor) === 0 ? 'Ground Floor' : `Floor ${currentEditRoom.floor}`}`
              }
              showBack={isEditingRoom}
              onBack={() => setIsEditingRoom(false)}
              onClose={() => setEditRoom(null)}
            />
            <ScrollView
              style={styles.roomSheetScroll}
              contentContainerStyle={styles.roomSheetScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {!isEditingRoom ? (
                <View style={styles.roomSheetBody}>
                  {/* Current Status Box */}
                  <View style={styles.roomStatusCard}>
                    <View style={styles.roomStatusRow}>
                      <Text style={styles.roomStatusLabel}>Current Status:</Text>
                      <View
                        style={[
                          styles.roomStatusBadge,
                          {
                            backgroundColor: statusDetails.bg,
                            borderColor: statusDetails.border,
                          },
                        ]}
                      >
                        <View style={[styles.statusDot, { backgroundColor: statusDetails.color }]} />
                        <Text style={[styles.roomStatusBadgeText, { color: statusDetails.color }]}>
                          {statusDetails.label}
                        </Text>
                      </View>
                    </View>
                    {currentEditRoom.note ? (
                      <View style={styles.roomNoteBox}>
                        <Text style={styles.roomNoteLabel}>Note:</Text>
                        <Text style={styles.roomNoteText}>{currentEditRoom.note}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Room Info Summary */}
                  <View style={styles.roomInfoCard}>
                    <View style={styles.roomInfoRow}>
                      <Text style={styles.roomInfoLabel}>Room Number</Text>
                      <Text style={styles.roomInfoValue}>{currentEditRoom.roomNo}</Text>
                    </View>
                    <View style={styles.roomInfoRow}>
                      <Text style={styles.roomInfoLabel}>Room Type</Text>
                      <Text style={styles.roomInfoValue}>{currentEditRoom.roomType?.name || 'Standard'}</Text>
                    </View>
                    <View style={styles.roomInfoRow}>
                      <Text style={styles.roomInfoLabel}>Floor</Text>
                      <Text style={styles.roomInfoValue}>
                        {Number(currentEditRoom.floor) === 0 ? 'Ground Floor' : `Floor ${currentEditRoom.floor}`}
                      </Text>
                    </View>
                    {currentEditRoom.roomType?.rate != null ? (
                      <View style={[styles.roomInfoRow, { borderBottomWidth: 0 }]}>
                        <Text style={styles.roomInfoLabel}>Daily Tariff</Text>
                        <Text style={[styles.roomInfoValue, { fontFamily: fonts.bodyBold }]}>
                          {inr(currentEditRoom.roomType.rate)} / night
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Actions List */}
                  <View style={styles.roomActionsSection}>
                    <Text style={styles.actionsSectionTitle}>Room Actions</Text>
                    <View style={styles.roomActionsList}>
                      {canMarkRepair && (
                        <Button
                          title={submittingAction === 'repair' ? 'Updating…' : 'Mark Under Repair'}
                          variant="danger"
                          size="md"
                          disabled={Boolean(submittingAction)}
                          loading={submittingAction === 'repair'}
                          onPress={() => handleRoomHousekeeping('repair')}
                        />
                      )}
                      {canMarkReady && (
                        <Button
                          title={submittingAction === 'ready' ? 'Updating…' : 'Mark Ready (Clean)'}
                          variant="success"
                          size="md"
                          disabled={Boolean(submittingAction)}
                          loading={submittingAction === 'ready'}
                          onPress={() => handleRoomHousekeeping('ready')}
                        />
                      )}
                      <Button
                        title="Edit Room"
                        variant="outline"
                        size="md"
                        disabled={Boolean(submittingAction)}
                        onPress={startEditingRoom}
                      />
                      {canDeleteRoom && (
                        <View style={styles.destructiveActionWrap}>
                          <Button
                            title={deletingRoomId === currentEditRoom.id ? 'Deleting…' : 'Delete Room'}
                            variant="danger"
                            size="md"
                            disabled={Boolean(submittingAction) || deletingRoomId === currentEditRoom.id || deleteRoom.isPending}
                            loading={deletingRoomId === currentEditRoom.id}
                            onPress={() => handleDeleteRoom(currentEditRoom)}
                          />
                        </View>
                      )}
                      <Button
                        title="Close"
                        variant="outline"
                        size="md"
                        disabled={Boolean(submittingAction)}
                        onPress={() => setEditRoom(null)}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                /* Edit Room Form */
                <View style={styles.roomSheetBody}>
                  <FormField label="Room Number *" required error={editRoomErrors.roomNo}>
                    <Input
                      keyboardType="numeric"
                      placeholder="e.g. 101"
                      value={editRoomForm.roomNo}
                      onChangeText={(v) => {
                        setEditRoomForm((p) => ({ ...p, roomNo: v }));
                        if (editRoomErrors.roomNo) setEditRoomErrors((e) => ({ ...e, roomNo: null }));
                      }}
                      error={editRoomErrors.roomNo}
                    />
                  </FormField>

                  <FormField label="Floor Number * (0 for Ground Floor)" required error={editRoomErrors.floor}>
                    <Input
                      keyboardType="numeric"
                      placeholder="e.g. 1"
                      value={editRoomForm.floor}
                      onChangeText={(v) => {
                        setEditRoomForm((p) => ({ ...p, floor: v }));
                        if (editRoomErrors.floor) setEditRoomErrors((e) => ({ ...e, floor: null }));
                      }}
                      error={editRoomErrors.floor}
                    />
                  </FormField>

                  <FormField label="Assign Room Type *" required error={editRoomErrors.roomTypeId}>
                    <Segmented
                      options={(roomTypes || []).map((t) => ({ value: String(t.id), label: t.name }))}
                      value={editRoomForm.roomTypeId}
                      onChange={(v) => {
                        setEditRoomForm((p) => ({ ...p, roomTypeId: v }));
                        if (editRoomErrors.roomTypeId) setEditRoomErrors((e) => ({ ...e, roomTypeId: null }));
                      }}
                      error={Boolean(editRoomErrors.roomTypeId)}
                    />
                  </FormField>

                  <FormField label="Room Notes / Features (Optional)">
                    <Input
                      placeholder="e.g. Balcony view, near elevator"
                      value={editRoomForm.note}
                      onChangeText={(v) => setEditRoomForm((p) => ({ ...p, note: v }))}
                    />
                  </FormField>

                  <View style={styles.editFormActions}>
                    <Button
                      title={isSavingRoom || updateRoom.isPending ? 'Saving…' : 'Save Room Details'}
                      variant="primary"
                      size="lg"
                      loading={isSavingRoom || updateRoom.isPending}
                      onPress={handleSaveRoom}
                    />
                    <Button
                      title="Cancel"
                      variant="outline"
                      size="lg"
                      disabled={isSavingRoom || updateRoom.isPending}
                      onPress={() => setIsEditingRoom(false)}
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </Sheet>
        );
      })()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topTabs: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radii.md, padding: 3, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  topTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radii.sm },
  topTabActive: { backgroundColor: colors.primary },
  topTabText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.textSecondary },
  topTabTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
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
  roomSheetScroll: {
    flexGrow: 0,
    maxHeight: '100%',
  },
  roomSheetScrollContent: {
    paddingBottom: 28,
  },
  roomSheetBody: {
    paddingHorizontal: 18,
    paddingTop: 14,
    gap: 16,
  },
  roomStatusCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 8,
  },
  roomStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roomStatusLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  roomStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  roomStatusBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
  },
  roomNoteBox: {
    backgroundColor: colors.card,
    borderRadius: radii.sm,
    padding: 8,
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  roomNoteLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  roomNoteText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.heading,
  },
  roomInfoCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  roomInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  roomInfoLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  roomInfoValue: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.heading,
  },
  roomActionsSection: {
    gap: 10,
  },
  actionsSectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  roomActionsList: {
    gap: 10,
  },
  destructiveActionWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 10,
    marginTop: 4,
  },
  editFormActions: {
    gap: 10,
    marginTop: 8,
  },
  roomDialogBody: { padding: 18, gap: 14 },
  roomDialogActions: { gap: 10, marginTop: 4 },
});
