import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Input, Segmented } from '../ui/Field.jsx';
import { useReservation, useCancelReservation, useNoShowReservation, useCancellationPreview, useReservations, useReservationDocuments, useUploadReservationDocuments } from '../../api/reservations';
import { viewOccupantDocument, useDeleteOccupantDocument } from '../../api/occupantDocuments';
import { useRooms, useHousekeepingAction } from '../../api/rooms';
import { useToast } from '../ToastContext.jsx';
import { addDaysIso, fd, inr, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * Ported from web's BookingDetailSheet.jsx. The stand-alone ad-hoc "Manage / Process
 * Refund" sub-sheet for already-cancelled bookings is NOT ported yet (see
 * MOBILE_IMPLEMENTATION_PROGRESS.md) — the cancellation flow itself, including the
 * server-computed cancellation-fee/refund preview, is fully functional below.
 */
export default function BookingDetailSheet({ reservationId, onClose, onCheckIn, onEdit }) {
  const { data: reservation } = useReservation(reservationId);
  const { data: preview } = useCancellationPreview(reservationId);
  const { data: roomsData } = useRooms();
  const cancel = useCancelReservation();
  const noShow = useNoShowReservation();
  const hkAction = useHousekeepingAction();
  const { data: allReservations = [] } = useReservations();
  const { data: bookingDocs = [], refetch: refetchDocs } = useReservationDocuments(reservationId);
  const uploadResDocs = useUploadReservationDocuments();
  const deleteDoc = useDeleteOccupantDocument();
  const toast = useToast();

  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundNow, setRefundNow] = useState(false);
  const [refundMethod, setRefundMethod] = useState('upi');
  const [loadingDocId, setLoadingDocId] = useState(null);

  if (!reservation) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="booked" title="Booking" onClose={onClose} />
        <View style={styles.body}><Text style={styles.value}>Loading…</Text></View>
      </Sheet>
    );
  }

  const today = todayIso();
  const room = roomsData?.rooms.find((r) => r.id === reservation.room_id);
  const hkStatus = room?.housekeepingStatus || room?.housekeeping_status || reservation?.housekeeping_status || 'ok';
  const isOccupied = room?.status === 'occupied';
  const isMaintenance = hkStatus === 'repair';
  const isReady = hkStatus === 'ok';
  const isNotReady = !isReady && !isMaintenance;
  const isPending = reservation.status === 'pending';
  const isCancelled = reservation.status === 'cancelled';

  const days = Math.max(1, Math.round((new Date(reservation.check_out_date) - new Date(reservation.check_in_date)) / 86400000));
  const out = addDaysIso(today, days);
  const isLateArrival = isPending && (reservation.check_in_date < today || reservation.check_out_date <= today);
  const lateArrivalConflict = isLateArrival
    ? allReservations.find((r) => r.id !== reservation.id && Number(r.room_id) === Number(reservation.room_id) && r.status === 'pending' && r.check_in_date < out && today < r.check_out_date)
    : null;

  const canIn = isPending && reservation.check_in_date <= today && !isOccupied && !isMaintenance && isReady && !lateArrivalConflict;
  const isPastArrival = reservation.check_in_date < today;

  const handleMarkReady = async () => {
    try {
      await hkAction.mutateAsync({ roomId: reservation.room_id, action: 'ready' });
      toast(`Room ${reservation.room_no} marked ready.`);
    } catch (err) { toast(err.message); }
  };

  const doCancel = async () => {
    try {
      const fee = preview ? preview.cancellationFee : 0;
      const refundable = preview ? preview.refundableAmount : 0;
      await cancel.mutateAsync({
        id: reservation.id, reason: cancelReason || 'Cancelled by guest / front desk',
        cancellationFee: fee, refundAmount: refundNow ? refundable : 0, refundMethod, processRefund: refundNow,
      });
      toast(`Booking ${reservation.booking_code} cancelled. Room ${reservation.room_no} is free for those dates.`);
      setCancelling(false);
      onClose();
    } catch (err) { toast(err.message || 'Failed to cancel booking.'); }
  };

  const doNoShow = async () => {
    try {
      await noShow.mutateAsync(reservation.id);
      onClose();
      toast(`Booking ${reservation.booking_code} marked as no-show. Room ${reservation.room_no} is free.`);
    } catch (err) { toast(err.message); }
  };

  const handleViewDocument = async (doc) => {
    try {
      setLoadingDocId(doc.id);
      await viewOccupantDocument(doc.id, doc.original_filename);
    } catch (e) {
      toast(e.message || 'Could not load document.');
    } finally {
      setLoadingDocId(null);
    }
  };

  const handleUploadBookingDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const overSized = result.assets.filter((f) => f.size && f.size > 10 * 1024 * 1024);
      if (overSized.length > 0) {
        toast('Document must be 10 MB or smaller.');
        return;
      }

      const files = result.assets.map((f) => ({
        uri: f.uri,
        name: f.name,
        type: f.mimeType || 'application/octet-stream',
      }));

      await uploadResDocs.mutateAsync({ reservationId, files });
      toast('ID document uploaded successfully.');
      refetchDocs();
    } catch (err) {
      toast(err.message || 'Failed to upload document.');
    }
  };

  const handleDeleteDocument = (docId) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this document?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc.mutateAsync({ docId });
              toast('Document deleted.');
              refetchDocs();
            } catch (e) {
              toast(e.message || 'Failed to delete document.');
            }
          },
        },
      ]
    );
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        status={isCancelled ? 'repair' : 'booked'} badge={reservation.room_no}
        title={`Booking ${reservation.booking_code}`}
        subtitle={`Status: ${reservation.status.toUpperCase()}`}
        onClose={onClose}
      />
      <View style={styles.body}>
        <View style={styles.infoGrid}>
          <Text style={styles.infoLabel}>Guest</Text><Text style={styles.infoValue}>{reservation.guest_name}</Text>
          <Text style={styles.infoLabel}>Mobile</Text><Text style={styles.infoValue}>{reservation.guest_phone}</Text>
          <Text style={styles.infoLabel}>Coming on</Text><Text style={styles.infoValue}>{fd(reservation.check_in_date)}</Text>
          <Text style={styles.infoLabel}>Leaves on</Text><Text style={styles.infoValue}>{fd(reservation.check_out_date)}</Text>
          <Text style={styles.infoLabel}>Persons</Text><Text style={styles.infoValue}>{reservation.persons}</Text>
          <Text style={styles.infoLabel}>Daily Rate</Text><Text style={styles.infoValue}>{inr(reservation.rate)}</Text>
          {reservation.notes ? (<><Text style={styles.infoLabel}>Notes</Text><Text style={styles.infoValue}>{reservation.notes}</Text></>) : null}
          <Text style={styles.infoLabel}>Advance Paid</Text>
          <Text style={[styles.infoValue, { color: Number(reservation.advance_paid) > 0 ? colors.success : colors.danger, fontFamily: fonts.bodyBold }]}>
            {Number(reservation.advance_paid) > 0 ? `${inr(reservation.advance_paid)} (PAID)` : 'Not collected'}
          </Text>
          {isCancelled && (
            <>
              <Text style={styles.infoLabel}>Cancellation Fee</Text><Text style={styles.infoValue}>{inr(reservation.cancellation_fee || 0)}</Text>
              <Text style={styles.infoLabel}>Refundable</Text><Text style={[styles.infoValue, { color: colors.success, fontFamily: fonts.bodyBold }]}>{inr(reservation.refundable_amount || 0)}</Text>
              {reservation.cancel_reason ? (<><Text style={styles.infoLabel}>Reason</Text><Text style={styles.infoValue}>{reservation.cancel_reason}</Text></>) : null}
            </>
          )}
        </View>

        {/* ID Documents */}
        <View style={styles.card}>
          <View style={[styles.rowBetween, { marginBottom: 6, flexWrap: 'wrap', gap: 6 }]}>
            <Text style={[styles.cardTitle, { flexShrink: 1, marginBottom: 0 }]}>ID Documents ({bookingDocs.length})</Text>
            {isPending && (
              <Button
                title={uploadResDocs.isPending ? 'Uploading…' : '+ Upload ID Document'}
                variant="outline"
                size="sm"
                loading={uploadResDocs.isPending}
                disabled={uploadResDocs.isPending}
                onPress={handleUploadBookingDoc}
              />
            )}
          </View>
          {bookingDocs.length === 0 ? (
            <Text style={styles.meta}>No ID documents attached.</Text>
          ) : (
            bookingDocs.map((doc) => (
              <View key={doc.id} style={styles.docRow}>
                <Text style={styles.docName} numberOfLines={1}>📄 {doc.original_filename}</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Button
                    title={loadingDocId === doc.id ? 'Loading…' : 'View Document'}
                    variant="outline"
                    size="sm"
                    disabled={loadingDocId === doc.id}
                    onPress={() => handleViewDocument(doc)}
                  />
                  {isPending && (
                    <Pressable onPress={() => handleDeleteDocument(doc.id)} hitSlop={8} accessibilityLabel="Delete Document">
                      <Text style={{ color: colors.danger, fontSize: 15, paddingHorizontal: 4 }}>✕</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {isPending && (
          <View style={[styles.statusBanner, { backgroundColor: isMaintenance ? colors.dangerBg : isNotReady ? colors.cleaningBg : isOccupied ? colors.infoBg : colors.successBg }]}>
            <Text style={styles.statusBannerText}>
              Room {reservation.room_no}: {isOccupied ? 'Currently occupied by another guest.' : isMaintenance ? 'Under maintenance.' : isNotReady ? 'Not ready (cleaning in progress).' : 'Ready for check-in.'}
            </Text>
            {isNotReady && <Button title={hkAction.isPending ? 'Updating…' : 'Mark ready'} variant="success" size="sm" loading={hkAction.isPending} onPress={handleMarkReady} style={{ marginTop: 6, alignSelf: 'flex-start' }} />}
          </View>
        )}

        {lateArrivalConflict && (
          <View style={[styles.statusBanner, { backgroundColor: colors.dangerBg }]}>
            <Text style={[styles.statusBannerText, { color: colors.danger, fontFamily: fonts.bodyBold }]}>⚠️ Late Arrival Booking Conflict</Text>
            <Text style={styles.statusBannerText}>Conflicts with upcoming reservation {lateArrivalConflict.booking_code}. Check-in is blocked.</Text>
          </View>
        )}

        {canIn && <Button title="Guest came · Check in" variant="success" size="lg" onPress={() => onCheckIn(reservation)} />}

        {cancelling ? (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Cancel booking {reservation.booking_code}?</Text>
            {preview ? (
              <View style={styles.previewBox}>
                <View style={styles.rowBetween}><Text style={styles.billLabelSub}>Advance Paid</Text><Text style={styles.billValueSub}>{inr(preview.eligiblePaid)}</Text></View>
                <View style={styles.rowBetween}><Text style={styles.billLabelSub}>Policy</Text><Text style={styles.billValueSub}>{preview.policyRule}</Text></View>
                <View style={styles.rowBetween}><Text style={styles.billLabelSub}>Cancellation Fee</Text><Text style={[styles.billValueSub, { color: colors.danger }]}>−{inr(preview.cancellationFee)}</Text></View>
                <View style={styles.rowBetween}><Text style={styles.billLabelTot}>Refundable</Text><Text style={[styles.billValueTot, { color: colors.success }]}>{inr(preview.refundableAmount)}</Text></View>
              </View>
            ) : null}
            <Input placeholder="Cancellation reason" value={cancelReason} onChangeText={setCancelReason} style={{ marginTop: 10 }} />
            {preview && preview.refundableAmount > 0 && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.rowBetween}>
                  <Text style={styles.label}>Process refund of {inr(preview.refundableAmount)} immediately</Text>
                  <Switch value={refundNow} onValueChange={setRefundNow} />
                </View>
                {refundNow && <Segmented options={['upi', 'cash', 'card']} value={refundMethod} onChange={setRefundMethod} style={{ marginTop: 6 }} />}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Button title={cancel.isPending ? 'Cancelling...' : 'Confirm Cancellation'} variant="danger" loading={cancel.isPending} onPress={doCancel} style={{ flex: 1 }} />
              <Button title="Go Back" variant="outline" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : isPending ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button title="Edit booking" variant="outline" size="sm" onPress={() => onEdit(reservation)} style={{ flex: 1 }} />
            {isPastArrival && <Button title="Mark no-show" variant="outline" size="sm" loading={noShow.isPending} onPress={doNoShow} style={{ flex: 1 }} />}
            <Button title="Cancel booking" variant="danger" size="sm" onPress={() => setCancelling(true)} style={{ flex: 1 }} />
          </View>
        ) : reservation.status === 'checked_in' ? (
          <View style={[styles.statusBanner, { backgroundColor: colors.infoBg }]}>
            <Text style={[styles.statusBannerText, { fontFamily: fonts.bodyBold }]}>Active In-House Stay</Text>
            <Text style={styles.statusBannerText}>This guest has already checked in. Use Rooms or Daily Operations to manage the stay.</Text>
          </View>
        ) : (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerText}>ℹ️ Historical record ({reservation.status.toUpperCase()}). Protected from ordinary editing.</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  value: { fontFamily: fonts.body, fontSize: 13.5, color: colors.text },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoGrid: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  infoLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, width: '48%' },
  infoValue: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text, width: '48%', marginBottom: 4 },
  statusBanner: { backgroundColor: colors.successBg, borderRadius: radii.md, padding: 10 },
  statusBannerText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
  confirmBox: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: 12, borderWidth: 1, borderColor: colors.warningBorder },
  confirmTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.heading, marginBottom: 8 },
  previewBox: { backgroundColor: colors.surface, borderRadius: radii.sm, padding: 8, gap: 2 },
  billLabelSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  billValueSub: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  billLabelTot: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  billValueTot: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
  card: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, gap: 6 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, backgroundColor: colors.surface, borderRadius: radii.xs },
  docName: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.text, flex: 1, marginRight: 8 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
});
