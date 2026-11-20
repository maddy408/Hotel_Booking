import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import BackButton from '../ui/BackButton.jsx';
import { Input } from '../ui/Field.jsx';
import { useStay, useStayBill } from '../../api/stays';
import { useReservation } from '../../api/reservations';
import { useHousekeepingAction } from '../../api/rooms';
import { shareOccupantDocument } from '../../api/occupantDocuments';
import { useToast } from '../ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';
import { colors, fonts, radii, statusColors } from '../../theme/theme';

function Field({ label, value, bold, color }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, bold && styles.bold, color && { color }]}>{value}</Text>
    </View>
  );
}

function Card({ title, right, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

function Accordion({ title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.accordion}>
      <Pressable style={styles.accordionBtn} onPress={() => setOpen((o) => !o)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {badge != null ? (
            <View style={styles.pillBadge}>
              <Text style={styles.pillBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.accordionIndicator}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open ? <View style={styles.accordionContent}>{children}</View> : null}
    </View>
  );
}

export default function RoomDetailsSheet({ room, onClose, onViewStay, onViewInvoice, onEarlyCheckout, onCheckout, onViewBooking, onCheckIn, onPreBook }) {
  const toast = useToast();
  const hkAction = useHousekeepingAction();
  const [loadingDocId, setLoadingDocId] = useState(null);
  const [repairNote, setRepairNote] = useState('');
  const [showRepairForm, setShowRepairForm] = useState(false);

  const stayId = room?.status === 'occupied' ? room?.stayId : null;
  const bookingId = room?.status === 'booked' ? (room?.bookingId || room?.pendingBooking?.id) : null;

  const { data: stay, isLoading: isStayLoading } = useStay(stayId);
  const { data: rawBill } = useStayBill(stayId);
  const { data: reservation, isLoading: isBookingLoading } = useReservation(bookingId);

  const bill = stay?.bill || rawBill;
  const today = todayIso();

  const handleViewDocument = async (doc) => {
    try {
      setLoadingDocId(doc.id);
      await shareOccupantDocument(doc.id, doc.original_filename);
    } catch (e) {
      toast(e.message || 'Could not load document.');
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleHousekeeping = async (action, note) => {
    try {
      await hkAction.mutateAsync({ roomId: room.id, action, note: note?.trim() || undefined });
      toast(
        action === 'ready'
          ? `Room ${room.roomNo} marked ready.`
          : action === 'repair'
            ? `Room ${room.roomNo} sent for repair.`
            : `Room ${room.roomNo} sent for cleaning.`
      );
      onClose();
    } catch (err) {
      toast(err.message || 'Housekeeping update failed.');
    }
  };

  const allStayDocs = useMemo(() => {
    if (!stay) return [];
    const list = [];
    (stay.occupants || []).forEach((occ) => {
      (occ.documents || []).forEach((d) => {
        list.push({ ...d, ownerName: occ.name || (occ.is_primary ? stay.guest_name : `Person ${occ.occupant_number}`) });
      });
    });
    (stay.documents || []).filter((d) => !d.occupant_id).forEach((d) => {
      list.push({ ...d, ownerName: 'General Stay Proof' });
    });
    return list;
  }, [stay]);

  if (!room) return null;

  // ---------------------------------------------------------------- OCCUPIED
  if (room.status === 'occupied') {
    if (isStayLoading || !stay) {
      return (
        <Sheet onClose={onClose}>
          <View style={styles.header}>
            <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
            <Text style={styles.headerTitle}>Room {room.roomNo}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 'auto' }}><Text style={styles.closeX}>×</Text></Pressable>
          </View>
          <View style={styles.body}><Text style={styles.value}>Loading…</Text></View>
        </Sheet>
      );
    }

    const nightsStayed = bill?.nights ?? 1;
    const roomCharges = Number(bill?.roomAmount ?? (Number(stay.rate) * nightsStayed));
    const roomGst = Number(bill?.roomGstAmount ?? 0);
    const extrasGst = Number(bill?.extrasGstAmount ?? 0);
    const totalGst = roomGst + extrasGst;
    const gstRateDisplay = bill?.gstRate ? `${Math.round(bill.gstRate * 100)}%` : '0%';
    const totalInvoice = Number(bill?.total ?? (roomCharges + totalGst));
    const advancePaid = Number(bill?.advancePaid ?? 0);
    const otherPayments = Number(bill?.otherPayments ?? 0);
    const netPaid = Number(bill?.netPaid ?? (advancePaid + otherPayments));
    const balance = Number(bill?.balance ?? (totalInvoice - netPaid));
    const outstandingBalance = Number(bill?.outstandingBalance ?? (balance > 0 ? balance : 0));
    const actualPersonsCount = Number(stay.persons || 1);
    const personsDisplay = `${actualPersonsCount} ${actualPersonsCount === 1 ? 'Person' : 'Persons'}`;
    const occupantsList = stay.occupants && stay.occupants.length > 0 ? stay.occupants : [];

    return (
      <Sheet onClose={onClose}>
        <View style={[styles.header, { backgroundColor: statusColors.occupied.bg, borderBottomColor: statusColors.occupied.border }]}>
          <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
          <View style={[styles.roomBadge, { backgroundColor: statusColors.occupied.fg }]}>
            <Text style={styles.roomBadgeText}>{room.roomNo}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Room {room.roomNo} · {stay.room_type_name || room.roomType?.name}</Text>
            <Text style={styles.headerSubtitle}>Occupied · {personsDisplay}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.closeX}>×</Text></Pressable>
        </View>

        <View style={styles.body}>
          <Card title="Guest Details">
            <Field label="Guest Name" value={stay.guest_name} bold />
            <Field label="Mobile Number" value={stay.guest_phone} />
            <Field label="ID Proof" value={`${stay.id_proof_type || 'Aadhaar'}${stay.id_proof_last4 ? ` ••••${stay.id_proof_last4}` : ''}`} />
            <Field label="Actual Persons Count" value={personsDisplay} bold color={colors.primary} />
          </Card>

          <Card title="Stay Details">
            <Field label="Original Check-in" value={fd(stay.original_check_in_date || stay.check_in_date)} />
            <Field label="Original Planned Checkout" value={fd(stay.original_checkout_date || stay.checkout_planned)} />
            <Field label="Actual Check-in" value={fd(stay.check_in_date)} />
            <Field label="Current Planned Checkout" value={fd(stay.checkout_planned)} />
            <Field label="Nights Stayed" value={`${nightsStayed} night${nightsStayed > 1 ? 's' : ''}`} bold />
            <Field label="Daily Room Rate" value={`${inr(stay.rate)} / day`} bold />
          </Card>

          <Card title="Payment Summary" right={<View style={styles.pillBadge}><Text style={styles.pillBadgeText}>GST {gstRateDisplay}</Text></View>}>
            <Field label={`Room Charges (${nightsStayed}n × ${inr(stay.rate)})`} value={inr(roomCharges)} />
            <Field label={`GST (${gstRateDisplay})`} value={`+${inr(totalGst)}`} />
            {bill?.charges?.length > 0 && <Field label={`Extras (${bill.charges.length})`} value={`+${inr(bill.extrasAmount || 0)}`} />}
            {Number(bill?.discountAmount) > 0 && <Field label="Discount" value={`−${inr(bill.discountAmount)}`} color={colors.success} />}
            <Field label="Total Invoice" value={inr(totalInvoice)} bold />
            <Field label="Advance Paid" value={`−${inr(advancePaid)}`} />
            {otherPayments > 0 && <Field label="Additional Payments" value={`−${inr(otherPayments)}`} />}
            <Field label="Total Paid" value={`−${inr(netPaid)}`} bold />
            <View style={[styles.balanceBox, { backgroundColor: balance > 0 ? colors.dangerBg : balance < 0 ? colors.successBg : colors.surfaceSecondary }]}>
              <Text style={styles.balanceTitle}>{balance > 0 ? 'Outstanding Balance' : balance < 0 ? 'Eligible Refund' : 'Fully Paid'}</Text>
              <Text style={[styles.balanceFigure, { color: balance > 0 ? colors.danger : balance < 0 ? colors.success : colors.heading }]}>
                {balance > 0 ? inr(outstandingBalance) : balance < 0 ? `Refund ${inr(Math.abs(balance))}` : '₹0.00'}
              </Text>
            </View>
          </Card>

          <Accordion title="Occupant Details" badge={occupantsList.length > 0 ? occupantsList.length : actualPersonsCount} defaultOpen>
            {occupantsList.length === 0 ? (
              <Text style={styles.value}>{stay.guest_name} (Lead Guest) · {personsDisplay} registered for this stay.</Text>
            ) : (
              occupantsList.map((occ) => (
                <View key={occ.id || occ.occupant_number} style={styles.occupantItem}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.occupantName}>
                      {occ.occupant_number}. {occ.name || (occ.is_primary ? stay.guest_name : `Person ${occ.occupant_number}`)}
                      {occ.gender ? ` (${occ.gender})` : ''} {occ.is_primary === 1 ? ' · Lead' : ''}
                    </Text>
                    <Text style={styles.mono}>{occ.phone || (occ.is_primary ? stay.guest_phone : '—')}</Text>
                  </View>
                  {(occ.documents || []).map((doc) => (
                    <Pressable key={doc.id} style={styles.docRow} disabled={loadingDocId === doc.id} onPress={() => handleViewDocument(doc)}>
                      <Text style={styles.docName} numberOfLines={1}>{doc.original_filename}</Text>
                      <Text style={styles.docAction}>{loadingDocId === doc.id ? 'Opening…' : 'View'}</Text>
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </Accordion>

          <Accordion title="ID Proof Documents" badge={allStayDocs.length}>
            {allStayDocs.length === 0 ? (
              <Text style={styles.value}>No ID proof documents uploaded for this stay yet.</Text>
            ) : (
              allStayDocs.map((doc) => (
                <Pressable key={doc.id} style={styles.docRow} disabled={loadingDocId === doc.id} onPress={() => handleViewDocument(doc)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docName} numberOfLines={1}>{doc.original_filename}</Text>
                    <Text style={styles.docOwner}>{doc.ownerName}</Text>
                  </View>
                  <Text style={styles.docAction}>{loadingDocId === doc.id ? 'Opening…' : 'View'}</Text>
                </Pressable>
              ))
            )}
          </Accordion>

          <Accordion title="Payment History" badge={`${inr(netPaid)} Paid`}>
            {stay.payments && stay.payments.length > 0 ? (
              stay.payments.map((p) => (
                <View key={p.id} style={styles.docRow}>
                  <View>
                    <Text style={styles.occupantName}>{p.type || 'Payment'} · {(p.method || 'CASH').toUpperCase()}</Text>
                    {p.created_at ? <Text style={styles.docOwner}>{fd(p.created_at)}</Text> : null}
                  </View>
                  <Text style={styles.mono}>{inr(p.amount)}</Text>
                </View>
              ))
            ) : (
              <View style={styles.docRow}>
                <Text style={styles.occupantName}>Advance Payment</Text>
                <Text style={[styles.mono, { color: colors.success }]}>{inr(advancePaid)}</Text>
              </View>
            )}
          </Accordion>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Button title="Close" variant="outline" size="sm" onPress={onClose} style={{ flex: 1 }} />
            <Button title="View Stay" variant="outline" size="sm" onPress={() => { onClose(); onViewStay?.(stay.id); }} style={{ flex: 1 }} />
            <Button title="Invoice" variant="outline" size="sm" onPress={() => { onClose(); onViewInvoice?.(stay.id); }} style={{ flex: 1 }} />
          </View>
          <View style={styles.footerRow}>
            <Button title="Early Out" variant="outline" size="sm" onPress={() => { onClose(); onEarlyCheckout?.(stay.id); }} style={{ flex: 1, borderColor: colors.warning }} textStyle={{ color: colors.warning }} />
            <Button title="Check Out" variant="info" size="sm" onPress={() => { onClose(); onCheckout?.(stay.id); }} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>
    );
  }

  // ------------------------------------------------------------------ BOOKED
  if (room.status === 'booked') {
    if (isBookingLoading || !reservation) {
      return (
        <Sheet onClose={onClose}>
          <View style={styles.header}>
            <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
            <Text style={styles.headerTitle}>Room {room.roomNo}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={{ marginLeft: 'auto' }}><Text style={styles.closeX}>×</Text></Pressable>
          </View>
          <View style={styles.body}><Text style={styles.value}>Loading…</Text></View>
        </Sheet>
      );
    }

    const canCheckIn = reservation.status === 'pending' && reservation.check_in_date <= today && room.housekeepingStatus === 'ok';
    const bookedPersonsCount = Number(reservation.persons || room.persons || 1);

    return (
      <Sheet onClose={onClose}>
        <View style={[styles.header, { backgroundColor: statusColors.booked.bg, borderBottomColor: statusColors.booked.border }]}>
          <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
          <View style={[styles.roomBadge, { backgroundColor: statusColors.booked.fg }]}>
            <Text style={styles.roomBadgeText}>{room.roomNo}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Room {room.roomNo} · {room.roomType?.name}</Text>
            <Text style={styles.headerSubtitle}>Booked · {bookedPersonsCount} {bookedPersonsCount === 1 ? 'Person' : 'Persons'}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.closeX}>×</Text></Pressable>
        </View>

        <View style={styles.body}>
          <Card title="Guest Details">
            <Field label="Guest Name" value={reservation.guest_name} bold />
            <Field label="Mobile Number" value={reservation.guest_phone} />
            <Field label="Email" value={reservation.guest_email || '—'} />
            <Field label="Persons" value={`${bookedPersonsCount}`} bold color={colors.primary} />
          </Card>

          <Card title="Booking Details" right={<View style={styles.pillBadge}><Text style={styles.pillBadgeText}>{reservation.booking_code}</Text></View>}>
            <Field label="Check-in" value={fd(reservation.check_in_date) + (reservation.check_in_date <= today ? ' (Due Today)' : '')} />
            <Field label="Check-out" value={fd(reservation.check_out_date)} />
            <Field label="Daily Rate" value={`${inr(reservation.rate)} / day`} bold />
            <Field label="Status" value={reservation.status.toUpperCase()} bold color={colors.warning} />
            <Field
              label="Room Readiness"
              value={room.housekeepingStatus === 'ok' ? 'Ready for arrival' : room.housekeepingStatus === 'repair' ? 'Under repair' : 'Cleaning in progress'}
              bold
              color={room.housekeepingStatus === 'ok' ? colors.success : room.housekeepingStatus === 'repair' ? colors.danger : colors.cleaning}
            />
          </Card>

          <Card title="Payment & Advance Status">
            <Field label="Advance Paid" value={Number(reservation.advance_paid) > 0 ? inr(reservation.advance_paid) : 'No advance collected'} bold color={Number(reservation.advance_paid) > 0 ? colors.success : colors.danger} />
            <Field label="Advance Method" value={(reservation.advance_method || '—').toUpperCase()} />
          </Card>

          {(reservation.booking_source || reservation.notes) && (
            <Card title="Source & Notes">
              <Field label="Booking Source" value={reservation.booking_source || 'Social Media'} />
              {reservation.notes ? <Field label="Notes" value={reservation.notes} /> : null}
            </Card>
          )}
        </View>

        <View style={styles.footer}>
          <Button title="Close" variant="outline" size="sm" onPress={onClose} style={{ flex: 1 }} />
          <Button title="View Booking" variant="outline" size="sm" onPress={() => { onClose(); onViewBooking?.(reservation.id); }} style={{ flex: 1 }} />
          {canCheckIn && (
            <Button title="Guest Came · Check In" variant="success" size="sm" onPress={() => { onClose(); onCheckIn?.(reservation); }} style={{ flex: 1 }} />
          )}
        </View>
      </Sheet>
    );
  }

  // -------------------------------------------------------------------- FREE
  if (room.status === 'free') {
    return (
      <Sheet onClose={onClose}>
        <View style={[styles.header, { backgroundColor: statusColors.free.bg, borderBottomColor: statusColors.free.border }]}>
          <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
          <View style={[styles.roomBadge, { backgroundColor: statusColors.free.fg }]}>
            <Text style={styles.roomBadgeText}>{room.roomNo}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Room {room.roomNo} · {room.roomType?.name}</Text>
            <Text style={styles.headerSubtitle}>Available</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.closeX}>×</Text></Pressable>
        </View>
        <View style={styles.body}>
          <Card title="Room Information">
            <Field label="Floor" value={room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`} />
            <Field label="Room Type" value={`${room.roomType?.name} (${room.roomType?.code || '—'})`} />
            <Field label="Daily Tariff" value={`${inr(room.roomType?.rate || 0)} / night`} bold />
            <Field label="Max Capacity" value={`${room.roomType?.maxPersons || 2} Persons`} />
            <Field label="Next Scheduled Booking" value={room.nextBookingDate ? fd(room.nextBookingDate) : 'No upcoming bookings'} />
            {room.note ? <Field label="Room Note" value={room.note} /> : null}
          </Card>
        </View>
        <View style={styles.footer}>
          <Button title="Close" variant="outline" size="sm" onPress={onClose} style={{ flex: 1 }} />
          <Button title="+ Pre-Book" variant="outline" size="sm" onPress={() => { onClose(); onPreBook?.(room); }} style={{ flex: 1 }} />
          <Button title="+ Direct Check-in" variant="success" size="sm" onPress={() => { onClose(); onCheckIn?.(room); }} style={{ flex: 1 }} />
        </View>
      </Sheet>
    );
  }

  // --------------------------------------------------------------- CLEANING
  if (room.status === 'cleaning') {
    return (
      <Sheet onClose={onClose}>
        <View style={[styles.header, { backgroundColor: statusColors.cleaning.bg, borderBottomColor: statusColors.cleaning.border }]}>
          <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
          <View style={[styles.roomBadge, { backgroundColor: statusColors.cleaning.fg }]}>
            <Text style={styles.roomBadgeText}>{room.roomNo}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Room {room.roomNo} · {room.roomType?.name}</Text>
            <Text style={styles.headerSubtitle}>Cleaning in progress</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.closeX}>×</Text></Pressable>
        </View>
        <View style={styles.body}>
          <Card title="Housekeeping Status">
            <Field label="Floor" value={room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`} />
            <Field label="Room Type" value={room.roomType?.name} />
          </Card>
          {showRepairForm && (
            <Card title="Send Room for Repair">
              <Input placeholder="e.g. Bathroom tap leaking, AC remote broken" value={repairNote} onChangeText={setRepairNote} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Button title="Cancel" variant="outline" size="sm" onPress={() => setShowRepairForm(false)} style={{ flex: 1 }} />
                <Button title="Confirm Send for Repair" variant="danger" size="sm" loading={hkAction.isPending} onPress={() => handleHousekeeping('repair', repairNote)} style={{ flex: 1 }} />
              </View>
            </Card>
          )}
        </View>
        <View style={styles.footer}>
          <Button title="Close" variant="outline" size="sm" onPress={onClose} style={{ flex: 1 }} />
          {!showRepairForm && <Button title="Found a problem?" variant="outline" size="sm" onPress={() => setShowRepairForm(true)} style={{ flex: 1 }} />}
          <Button title="Mark Room Ready" variant="success" size="sm" loading={hkAction.isPending} onPress={() => handleHousekeeping('ready')} style={{ flex: 1 }} />
        </View>
      </Sheet>
    );
  }

  // ----------------------------------------------------------------- REPAIR
  if (room.status === 'repair') {
    return (
      <Sheet onClose={onClose}>
        <View style={[styles.header, { backgroundColor: statusColors.repair.bg, borderBottomColor: statusColors.repair.border }]}>
          <BackButton onPress={onClose} size={20} color={colors.heading} enableHardwareBack={false} style={{ marginRight: 4 }} />
          <View style={[styles.roomBadge, { backgroundColor: statusColors.repair.fg }]}>
            <Text style={styles.roomBadgeText}>{room.roomNo}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Room {room.roomNo} · {room.roomType?.name}</Text>
            <Text style={styles.headerSubtitle}>Under Repair</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10}><Text style={styles.closeX}>×</Text></Pressable>
        </View>
        <View style={styles.body}>
          <Card title="Maintenance Details">
            <Field label="Floor" value={room.floor === 0 ? 'Ground Floor' : `Floor ${room.floor}`} />
            <Field label="Room Type" value={room.roomType?.name} />
            <Field label="Reported Problem" value={room.note || 'Maintenance in progress'} bold color={colors.danger} />
          </Card>
        </View>
        <View style={styles.footer}>
          <Button title="Close" variant="outline" size="sm" onPress={onClose} style={{ flex: 1 }} />
          <Button title="Repair Done · Send for Cleaning" variant="success" size="sm" loading={hkAction.isPending} onPress={() => handleHousekeeping('cleaning')} style={{ flex: 2 }} />
        </View>
      </Sheet>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1 },
  roomBadge: { borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 6 },
  roomBadgeText: { fontFamily: fonts.bodyBold, color: '#fff', fontSize: 15 },
  headerTitle: { fontFamily: fonts.displaySemibold, fontSize: 15.5, color: colors.heading },
  headerSubtitle: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary },
  closeX: { fontSize: 26, color: colors.textSecondary, lineHeight: 26 },
  body: { padding: 14, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, gap: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading },
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 2 },
  fieldLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, flexShrink: 1 },
  fieldValue: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, textAlign: 'right', flexShrink: 1 },
  bold: { fontFamily: fonts.bodyBold },
  value: { fontFamily: fonts.body, fontSize: 13.5, color: colors.text },
  mono: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.text },
  balanceBox: { borderRadius: radii.md, padding: 10, marginTop: 4, gap: 2 },
  balanceTitle: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.heading },
  balanceFigure: { fontFamily: fonts.bodyBold, fontSize: 18 },
  pillBadge: { backgroundColor: colors.secondaryLight, borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 3 },
  pillBadgeText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.primary },
  accordion: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  accordionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  accordionIndicator: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary },
  accordionContent: { paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  occupantItem: { backgroundColor: colors.cardSecondary, borderRadius: radii.sm, padding: 8, gap: 4 },
  occupantName: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: 8 },
  docName: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text, flex: 1 },
  docOwner: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary },
  docAction: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.primary },
  footer: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  footerRow: { flexDirection: 'row', gap: 8 },
});
