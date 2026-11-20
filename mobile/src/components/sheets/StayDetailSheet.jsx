import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { Input, Segmented } from '../ui/Field.jsx';
import { useStay, useStayBill, useAddExtra, useRemoveExtra } from '../../api/stays';
import { shareOccupantDocument } from '../../api/occupantDocuments';
import { useToast } from '../ToastContext.jsx';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

export default function StayDetailSheet({ stayId, onClose, onCheckout, onEarlyCheckout, onPrintInvoice }) {
  const { data: stay, isLoading: isStayLoading } = useStay(stayId);
  const { data: rawBill } = useStayBill(stayId);

  const addExtra = useAddExtra();
  const removeExtra = useRemoveExtra();
  const toast = useToast();

  const [xLabel, setXLabel] = useState('Food');
  const [xAmount, setXAmount] = useState('');
  const [loadingDocId, setLoadingDocId] = useState(null);

  const bill = stay?.bill || rawBill;

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

  const handleAddExtra = async () => {
    const amt = Number(xAmount);
    if (!(amt > 0)) {
      toast('Enter extra charge amount.');
      return;
    }
    try {
      await addExtra.mutateAsync({ stayId, label: xLabel, amount: amt, isTaxable: true });
      setXAmount('');
      toast(`Added ${xLabel} charge.`);
    } catch (err) {
      toast(err.message || 'Failed to add charge.');
    }
  };

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
            <Text style={styles.valueBold}>{fd(stay.checkout_planned)}</Text>
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
              style={{ flex: 1 }}
              placeholder="Amount (₹)"
              keyboardType="numeric"
              value={xAmount}
              onChangeText={setXAmount}
            />
            <Button
              title={addExtra.isPending ? 'Adding…' : 'Add Charge'}
              variant="primary"
              size="sm"
              loading={addExtra.isPending}
              onPress={handleAddExtra}
            />
          </View>

          {/* List of extras if any */}
          {(stay.charges || []).filter((c) => c.type === 'extra').length > 0 && (
            <View style={{ marginTop: 10, gap: 6 }}>
              {(stay.charges || []).filter((c) => c.type === 'extra').map((c) => (
                <View key={c.id} style={styles.chargeRow}>
                  <Text style={styles.chargeName}>{c.label}</Text>
                  <Text style={styles.valueMono}>{inr(c.amount)}</Text>
                  <Pressable onPress={() => removeExtra.mutateAsync({ stayId, chargeId: c.id })} hitSlop={8}>
                    <Text style={styles.chargeDelete}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Occupants & ID Documents */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Registered Occupants & Documents</Text>
          {(stay.occupants || []).map((occ) => (
            <View key={occ.id} style={styles.occItem}>
              <View style={styles.infoRow}>
                <Text style={styles.occName}>{occ.occupant_number}. {occ.name || 'Occupant'} ({occ.gender || '—'})</Text>
                <Text style={styles.valueMono}>{occ.phone || '—'}</Text>
              </View>
              {(occ.documents || []).map((doc) => (
                <Pressable
                  key={doc.id}
                  style={styles.docRow}
                  disabled={loadingDocId === doc.id}
                  onPress={() => handleViewDocument(doc)}
                >
                  <Text style={styles.docName} numberOfLines={1}>📄 {doc.original_filename}</Text>
                  <Text style={styles.docAction}>{loadingDocId === doc.id ? 'Opening…' : 'View / Open'}</Text>
                </Pressable>
              ))}
            </View>
          ))}
          {(!stay.occupants || stay.occupants.length === 0) && (
            <Text style={styles.meta}>No extra occupants recorded.</Text>
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
              onPrintInvoice?.(stay.id);
            }}
            style={{ flex: 1 }}
          />
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
