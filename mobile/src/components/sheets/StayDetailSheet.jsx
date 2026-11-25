import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { FieldError, Input, Segmented } from '../ui/Field.jsx';
import { useStay, useStayBill, useAddExtra, useRemoveExtra } from '../../api/stays';
import { viewOccupantDocument, useUploadStayDocuments, useDeleteOccupantDocument } from '../../api/occupantDocuments';
import { useToast } from '../ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

export default function StayDetailSheet({ stayId, onClose, onCheckout, onEarlyCheckout, onPrintInvoice }) {
  const normalizedStayId = typeof stayId === 'string' && stayId.startsWith('stay-')
    ? parseInt(stayId.slice(5), 10)
    : Number(stayId);
  const validStayId = !isNaN(normalizedStayId) && normalizedStayId > 0 ? normalizedStayId : null;

  const { data: stay, isLoading: isStayLoading, isError: isStayError, error: stayError, refetch } = useStay(validStayId);
  const { data: rawBill } = useStayBill(validStayId);

  const addExtra = useAddExtra();
  const removeExtra = useRemoveExtra();
  const uploadDocs = useUploadStayDocuments();
  const deleteDoc = useDeleteOccupantDocument();
  const toast = useToast();

  const [xLabel, setXLabel] = useState('Food');
  const [xAmount, setXAmount] = useState('');
  const [loadingDocId, setLoadingDocId] = useState(null);
  const extraInputRef = useRef(null);
  const [extraError, setExtraError] = useState('');

  const bill = stay?.bill || rawBill;
  const plannedCheckoutDate = stay?.checkout_planned ? stay.checkout_planned.slice(0, 10) : null;
  const today = todayIso();
  const isLate = Boolean(
    (plannedCheckoutDate && today > plannedCheckoutDate) ||
    bill?.isLateCheckout ||
    bill?.checkoutType === 'late'
  );
  const isEarlyEligible = Boolean(
    plannedCheckoutDate && today < plannedCheckoutDate && !isLate
  );

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

  const handleUploadStayDoc = async () => {
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

      await uploadDocs.mutateAsync({ stayId: validStayId, files });
      toast('ID document uploaded successfully.');
      refetch();
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
              refetch();
            } catch (e) {
              toast(e.message || 'Failed to delete document.');
            }
          },
        },
      ]
    );
  };

  const handleRemoveExtra = (charge) => {
    Alert.alert(
      'Remove Extra Charge',
      `Are you sure you want to remove "${charge.label}" (${inr(charge.amount)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeExtra.mutateAsync({ stayId, chargeId: charge.id });
              toast(`Charge "${charge.label}" removed.`);
            } catch (e) {
              toast(e.message || 'Failed to remove charge.');
            }
          },
        },
      ]
    );
  };

  const handleAddExtra = async () => {
    const amt = Number(xAmount);
    if (isNaN(amt) || !(amt > 0)) {
      setExtraError('Please enter a valid amount.');
      extraInputRef.current?.focus?.();
      return;
    }
    setExtraError('');
    try {
      await addExtra.mutateAsync({ stayId: validStayId, label: xLabel, amount: amt, isTaxable: true });
      setXAmount('');
      toast(`Added ${xLabel} charge.`);
    } catch (err) {
      setExtraError(err.message || 'Failed to add charge.');
      extraInputRef.current?.focus?.();
    }
  };

  if (!validStayId || isStayError) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Stay Details" onClose={onClose} />
        <View style={styles.body}>
          <Text style={[styles.meta, { color: colors.danger, marginBottom: 12 }]}>
            {stayError?.message || (!validStayId ? 'Invalid or missing stay ID.' : 'Could not load stay details.')}
          </Text>
          {validStayId ? (
            <Button title="Retry" variant="outline" size="sm" onPress={refetch} />
          ) : (
            <Button title="Close" variant="outline" size="sm" onPress={onClose} />
          )}
        </View>
      </Sheet>
    );
  }

  if (isStayLoading || !stay) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Stay Details" onClose={onClose} />
        <View style={styles.body}><Text style={styles.meta}>Loading stay details…</Text></View>
      </Sheet>
    );
  }

  const nightsStayed = bill?.nights ?? 1;
  const roomCharges = Number(bill?.roomAmount ?? (Number(stay.rate) * nightsStayed));
  const extrasTotal = Number(bill?.extrasTotal ?? 0);
  const totalAmount = Number(bill?.total ?? (roomCharges + extrasTotal));
  const advancePaid = Number(stay.advance_paid || bill?.advancePaid || 0);
  const balanceDue = Number(bill?.balance ?? (totalAmount - advancePaid));

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        status="occupied"
        badge={stay.room_no}
        title={`Room ${stay.room_no} · ${stay.room_type_name || ''}`}
        subtitle={`Stay #${stay.id} · ${stay.guest_name}`}
        onClose={onClose}
      />
      <View style={styles.body}>
        {/* Guest Overview */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Guest Information</Text>
          <View style={styles.infoRow}><Text style={styles.label}>Guest Name</Text><Text style={styles.valueBold}>{stay.guest_name}</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>Phone Number</Text><Text style={styles.valueMono}>{stay.guest_phone}</Text></View>
          {stay.city ? <View style={styles.infoRow}><Text style={styles.label}>City</Text><Text style={styles.value}>{stay.city}</Text></View> : null}
          <View style={styles.infoRow}>
            <Text style={styles.label}>ID Proof</Text>
            <Text style={styles.value}>{stay.id_proof_type || 'Aadhaar'}{stay.id_proof_last4 ? ` ••••${stay.id_proof_last4}` : ''}</Text>
          </View>
        </View>

        {/* Stay Timing Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stay Timeline</Text>
          <View style={styles.infoRow}><Text style={styles.label}>Actual Check-in</Text><Text style={styles.value}>{fd(stay.check_in_date)}</Text></View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Planned Checkout</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.valueBold}>{fd(stay.checkout_planned)}</Text>
              {stay.checkout_time ? (
                <Text style={[styles.value, { color: colors.textSecondary, fontSize: 11 }]}>
                  ({stay.checkout_time.slice(0, 5)})
                </Text>
              ) : null}
              {isLate && (
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: colors.danger, marginLeft: 2 }}>
                  (Overdue)
                </Text>
              )}
            </View>
          </View>
          <View style={styles.infoRow}><Text style={styles.label}>Nights Stayed</Text><Text style={styles.valueBold}>{nightsStayed} night{nightsStayed > 1 ? 's' : ''}</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>Daily Room Rate</Text><Text style={styles.value}>{inr(stay.rate)} / day</Text></View>
        </View>

        {/* Financial Overview */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Charges & Billing</Text>
          <View style={styles.infoRow}><Text style={styles.label}>Room Charges ({nightsStayed}n × {inr(stay.rate)})</Text><Text style={styles.valueMono}>{inr(roomCharges)}</Text></View>
          {extrasTotal > 0 ? (
            <View style={styles.infoRow}><Text style={styles.label}>Extra Services</Text><Text style={styles.valueMono}>+{inr(extrasTotal)}</Text></View>
          ) : null}
          <View style={styles.infoRow}><Text style={styles.labelBold}>Total Amount</Text><Text style={styles.valueBold}>{inr(totalAmount)}</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>Advance Paid</Text><Text style={[styles.valueMono, { color: colors.success }]}>−{inr(advancePaid)}</Text></View>
          <View style={[styles.infoRow, styles.balanceRow]}>
            <Text style={styles.balanceLabel}>Balance Due</Text>
            <Text style={[styles.balanceValue, { color: balanceDue > 0 ? colors.danger : colors.success }]}>
              {inr(balanceDue)}
            </Text>
          </View>
        </View>

        {/* Add Extra Charges */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Add Extra Service Charge</Text>
          <Segmented options={EXTRAS} value={xLabel} onChange={setXLabel} style={{ marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Input
              ref={extraInputRef}
              style={{ flex: 1 }}
              placeholder="Amount (₹)"
              keyboardType="numeric"
              value={xAmount}
              onChangeText={(v) => {
                setXAmount(v);
                if (extraError) setExtraError('');
              }}
              error={extraError}
            />
            <Button
              title={addExtra.isPending ? 'Adding…' : 'Add Charge'}
              variant="primary"
              size="sm"
              loading={addExtra.isPending}
              onPress={handleAddExtra}
            />
          </View>
          <FieldError error={extraError} />

          {/* List of extras if any */}
          {(stay.charges || []).filter((c) => c.type === 'extra').length > 0 && (
            <View style={{ marginTop: 10, gap: 6 }}>
              {(stay.charges || []).filter((c) => c.type === 'extra').map((c) => (
                <View key={c.id} style={styles.chargeRow}>
                  <Text style={styles.chargeName}>{c.label}</Text>
                  <Text style={styles.valueMono}>{inr(c.amount)}</Text>
                  <Pressable onPress={() => handleRemoveExtra(c)} hitSlop={8} accessibilityLabel="Remove Charge">
                    <Text style={styles.chargeDelete}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Occupants & ID Documents */}
        <View style={styles.card}>
          <View style={[styles.infoRow, { marginBottom: 6, flexWrap: 'wrap', gap: 6 }]}>
            <Text style={[styles.cardTitle, { flexShrink: 1, marginBottom: 0 }]}>Occupants & ID Documents</Text>
            <Button
              title={uploadDocs.isPending ? 'Uploading…' : '+ Upload ID Document'}
              variant="outline"
              size="sm"
              loading={uploadDocs.isPending}
              disabled={uploadDocs.isPending}
              onPress={handleUploadStayDoc}
            />
          </View>

          {/* Stay-level documents */}
          {stay.documents && stay.documents.length > 0 ? (
            <View style={{ marginBottom: 8, gap: 4 }}>
              <Text style={styles.labelBold}>Stay Documents ({stay.documents.length})</Text>
              {stay.documents.map((doc) => (
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
                    <Pressable onPress={() => handleDeleteDocument(doc.id)} hitSlop={8} accessibilityLabel="Delete Document">
                      <Text style={{ color: colors.danger, fontSize: 15, paddingHorizontal: 4 }}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {(stay.occupants || []).map((occ) => (
            <View key={occ.id} style={styles.occItem}>
              <View style={styles.infoRow}>
                <Text style={styles.occName}>{occ.occupant_number}. {occ.name || 'Occupant'} ({occ.gender || '—'})</Text>
                <Text style={styles.valueMono}>{occ.phone || '—'}</Text>
              </View>
              {(occ.documents || []).map((doc) => (
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
                    <Pressable onPress={() => handleDeleteDocument(doc.id)} hitSlop={8} accessibilityLabel="Delete Document">
                      <Text style={{ color: colors.danger, fontSize: 15, paddingHorizontal: 4 }}>✕</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ))}
          {(!stay.occupants || stay.occupants.length === 0) && (!stay.documents || stay.documents.length === 0) && (
            <Text style={styles.meta}>No extra occupants or documents recorded.</Text>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.footerBtns}>
          <Button
            title="Print Invoice"
            variant="outline"
            size="sm"
            onPress={() => {
              onClose();
              onPrintInvoice?.(stay.id, stay);
            }}
            style={{ flex: 1 }}
          />
          {isEarlyEligible && (
            <Button
              title="Early Checkout"
              variant="outline"
              size="sm"
              onPress={() => {
                onClose();
                onEarlyCheckout?.(stay.id);
              }}
              style={{ flex: 1, borderColor: colors.warning }}
              textStyle={{ color: colors.warning }}
            />
          )}
          <Button
            title="Check Out"
            variant="info"
            size="sm"
            onPress={() => {
              onClose();
              onCheckout?.(stay.id);
            }}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 12,
    gap: 8,
  },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading, marginBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary },
  labelBold: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  value: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text },
  valueBold: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  valueMono: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.text },
  balanceRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 },
  balanceLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.heading },
  balanceValue: { fontFamily: fonts.monoBold, fontSize: 15 },
  chargeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, padding: 8, borderRadius: radii.sm },
  chargeName: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text, flex: 1 },
  chargeDelete: { color: colors.danger, fontSize: 14, fontWeight: '700', paddingLeft: 8 },
  occItem: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  occName: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading },
  docRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, paddingHorizontal: 6, marginTop: 4, backgroundColor: colors.surface, borderRadius: radii.xs },
  docName: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: colors.text, flex: 1, marginRight: 8 },
  docAction: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  footerBtns: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
