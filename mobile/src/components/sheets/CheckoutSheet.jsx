import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { FieldError, FormErrorBanner, Input, Segmented } from '../ui/Field.jsx';
import {
  useStay, useStayBill, useEarlyCheckoutPreview, useAddExtra, useRemoveExtra, useExtendStay, useCheckout, useApplyDiscount,
} from '../../api/stays';
import { viewOccupantDocument, useUploadStayDocuments } from '../../api/occupantDocuments';
import { BASE_URL } from '../../lib/apiClient';
import { useToast } from '../ToastContext.jsx';
import { fd, inr, todayIso } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

/**
 * Ported from the web's CheckoutSheet.jsx. The stand-alone "Refund Management" (ad-hoc
 * refund outside checkout) sub-sheet is NOT ported yet — see MOBILE_IMPLEMENTATION_PROGRESS.md.
 * The balance-based refund-at-checkout flow below (bal < 0 branch) IS fully functional.
 */
export default function CheckoutSheet({ stayId, onClose, initialMode }) {
  const navigation = useNavigation();
  const { data: stay, isError: isStayError, error: stayError } = useStay(stayId);
  const { data: rawBill, isError: isBillError, error: billError } = useStayBill(stayId);

  const [actualCheckoutDate] = useState(todayIso());
  const [discountVal, setDiscountVal] = useState('');
  const [discountType, setDiscountType] = useState('fixed'); // 'fixed' | 'percent'
  const [discountReason, setDiscountReason] = useState('');
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  const totalBefore = (rawBill ? (rawBill.roomAmount + rawBill.roomGstAmount + (rawBill.extrasAmount || 0) + (rawBill.extrasGstAmount || 0) + (rawBill.earlyCheckoutFee || 0)) : 0);
  const effectiveDiscount = discountVal !== ''
    ? (discountType === 'percent'
        ? Math.round((totalBefore * (Number(discountVal) / 100)) * 100) / 100
        : Number(discountVal))
    : (stay?.discount_amount != null ? Number(stay.discount_amount) : undefined);
  const { data: previewData } = useEarlyCheckoutPreview(
    stayId,
    {
      checkoutDate: actualCheckoutDate,
      discount: effectiveDiscount,
    }
  );
  const bill = previewData?.bill || rawBill;

  const addExtra = useAddExtra();
  const removeExtra = useRemoveExtra();
  const extend = useExtendStay();
  const checkout = useCheckout();
  const applyDiscount = useApplyDiscount();
  const toast = useToast();

  const [xLabel, setXLabel] = useState('Food');
  const [xAmount, setXAmount] = useState('');
  const [pay, setPay] = useState('cash');
  const [refundReason, setRefundReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedResult, setCompletedResult] = useState(null);
  const uploadDocs = useUploadStayDocuments();
  const [loadingDocId, setLoadingDocId] = useState(null);

  const scrollRef = useRef(null);
  const extraInputRef = useRef(null);
  const discountInputRef = useRef(null);
  const [extraError, setExtraError] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [formError, setFormError] = useState('');

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

  const handlePostCheckInUpload = async () => {
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
      const files = (result.assets || []).map((f) => ({ uri: f.uri, name: f.name, type: f.mimeType || 'application/octet-stream' }));
      await uploadDocs.mutateAsync({ stayId, files });
      toast('ID proof document uploaded successfully.');
    } catch (err) {
      toast(err.message || 'Failed to upload document.');
    }
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

  if (!stayId || isStayError || isBillError) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Billing Details" onClose={onClose} />
        <View style={styles.body}>
          <Text style={styles.value}>{stayError?.message || billError?.message || 'Billing details not found.'}</Text>
          <Button title="Close" variant="outline" onPress={onClose} />
        </View>
      </Sheet>
    );
  }
  if (!stay || !bill) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Check out" onClose={onClose} />
        <View style={styles.body}><Text style={styles.value}>Loading…</Text></View>
      </Sheet>
    );
  }

  const isCheckedOut = stay.status === 'checked_out';
  const isEarly = !isCheckedOut && (initialMode === 'early' || stay.checkout_planned > actualCheckoutDate);
  const bal = bill.balance;

  const addExtraCharge = async () => {
    const amt = Number(xAmount);
    if (isNaN(amt) || !(amt > 0)) {
      setExtraError('Please enter a valid amount.');
      extraInputRef.current?.focus?.();
      return;
    }
    setExtraError('');
    try {
      await addExtra.mutateAsync({ stayId, label: xLabel, amount: amt, isTaxable: true });
      setXAmount('');
      toast(`Added ${xLabel} charge.`);
    } catch (err) {
      setExtraError(err.message || 'Failed to add charge.');
      extraInputRef.current?.focus?.();
    }
  };

  const handleApplyDiscount = async () => {
    const rawNum = Number(discountVal);
    if (isNaN(rawNum) || rawNum < 0 || discountVal.trim() === '') {
      setDiscountError('Please enter a valid discount amount.');
      discountInputRef.current?.focus?.();
      return;
    }
    let calculatedAmount = rawNum;
    if (discountType === 'percent') {
      if (rawNum > 100) {
        setDiscountError('Discount percentage cannot exceed 100%.');
        discountInputRef.current?.focus?.();
        return;
      }
      calculatedAmount = Math.round((totalBefore * (rawNum / 100)) * 100) / 100;
    } else {
      if (rawNum > totalBefore) {
        setDiscountError('Discount cannot exceed the payable amount.');
        discountInputRef.current?.focus?.();
        return;
      }
    }
    setDiscountError('');
    try {
      await applyDiscount.mutateAsync({ stayId, amount: calculatedAmount, reason: discountReason || 'Discretionary discount' });
      toast(`Discount of ${inr(calculatedAmount)} applied.`);
      setShowDiscountInput(false);
    } catch (err) {
      setDiscountError(err.message || 'Failed to apply discount.');
      discountInputRef.current?.focus?.();
    }
  };

  const doCheckout = async () => {
    if (isSubmitting || checkout.isPending) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      const effDiscount = discountVal !== ''
        ? (discountType === 'percent'
            ? Math.round((totalBefore * (Number(discountVal) / 100)) * 100) / 100
            : Number(discountVal))
        : (stay.discount_amount != null ? Number(stay.discount_amount) : 0);

      if (effDiscount > totalBefore) {
        setFormError('Discount cannot exceed the payable amount.');
        setIsSubmitting(false);
        return;
      }

      const result = await checkout.mutateAsync({
        stayId, paymentMethod: pay, amount: bal > 0 ? bal : 0, actualCheckoutDate,
        discountAmount: effDiscount,
        discountReason: discountReason || stay.discount_reason,
        refundReason: bal < 0 ? (refundReason || 'Early checkout refund') : null,
      });
      setCompletedResult(result);
      toast(`${stay.guest_name.split(' ')[0]} checked out. Bill ${inr(result.bill.total)}. Room ${stay.room_no} sent for cleaning.`);
    } catch (err) {
      setFormError(err.message || 'Checkout failed.');
      toast(err.message || 'Checkout failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCheckoutBusy = checkout.isPending || isSubmitting;

  return (
    <Sheet onClose={onClose} scrollRef={scrollRef}>
      <SheetHeader
        status="occupied" badge={stay.room_no}
        title={isCheckedOut ? 'Bill Details (Checked Out)' : isEarly ? 'Early Check out' : 'Check out'}
        subtitle={stay.room_type_name}
        onClose={onClose}
      />
      <View style={styles.body}>
        <FormErrorBanner message={formError} />
        <View style={styles.infoGrid}>
          <Text style={styles.infoLabel}>Guest</Text><Text style={styles.infoValue}>{stay.guest_name}</Text>
          <Text style={styles.infoLabel}>Mobile</Text><Text style={styles.infoValue}>{stay.guest_phone}</Text>
          <Text style={styles.infoLabel}>Persons</Text><Text style={styles.infoValue}>{stay.persons}</Text>
          <Text style={styles.infoLabel}>Original Check-in</Text><Text style={styles.infoValue}>{fd(stay.check_in_date)}</Text>
          <Text style={styles.infoLabel}>Planned Checkout</Text><Text style={styles.infoValue}>{fd(stay.checkout_planned)}</Text>
          <Text style={styles.infoLabel}>Nights Stayed</Text><Text style={[styles.infoValue, { fontFamily: fonts.bodyBold }]}>{bill.nights}</Text>
          <Text style={styles.infoLabel}>Daily Rate</Text><Text style={styles.infoValue}>{inr(stay.rate)}</Text>
        </View>

        {stay.occupants?.length > 0 && (
          <View style={{ gap: 4 }}>
            <Text style={styles.label}>Occupants ({stay.occupants.length})</Text>
            {stay.occupants.map((occ) => (
              <View key={occ.id} style={styles.fileRow}>
                <Text style={styles.fileName}>{occ.occupant_number}. {occ.name || '—'} {occ.gender ? `(${occ.gender})` : ''}</Text>
                <Text style={styles.mono}>{occ.phone || '—'}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ gap: 4 }}>
          <View style={[styles.rowBetween, { flexWrap: 'wrap', gap: 6 }]}>
            <Text style={[styles.label, { flexShrink: 1 }]}>ID Proof Documents ({stay.documents?.length || 0})</Text>
            <Button title={uploadDocs.isPending ? 'Uploading…' : '+ Upload ID Document'} variant="outline" size="sm" loading={uploadDocs.isPending} onPress={handlePostCheckInUpload} />
          </View>
          {(stay.documents || []).map((doc) => (
            <Pressable key={doc.id} style={styles.fileRow} disabled={loadingDocId === doc.id} onPress={() => handleViewDocument(doc)}>
              <Text style={styles.fileName} numberOfLines={1}>{doc.original_filename}</Text>
              <Text style={styles.docAction}>{loadingDocId === doc.id ? 'Loading…' : 'View Document'}</Text>
            </Pressable>
          ))}
        </View>

        {!isCheckedOut && isEarly ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>Early checkout recalculation active — checkout date {fd(actualCheckoutDate)}.</Text>
          </View>
        ) : null}

        <View style={styles.billTable}>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Actual stay: {bill.nights} night(s) × {inr(stay.rate)}</Text>
            <Text style={styles.billValue}>{inr(bill.roomAmount)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabelSub}>Room GST ({Math.round((bill.gstRate || 0) * 100)}%)</Text>
            <Text style={styles.billValueSub}>{inr(bill.roomGstAmount)}</Text>
          </View>
          {(bill.charges || []).map((x) => (
            <View key={x.id} style={styles.billRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={styles.billLabel}>{x.label}</Text>
                {!isCheckedOut && !completedResult ? (
                  <Pressable
                    hitSlop={10}
                    onPress={() => handleRemoveExtra(x)}
                    style={styles.removeBtn}
                    accessibilityLabel="Remove Extra Charge"
                  >
                    <Text style={styles.removeFile}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.billValue}>{inr(x.amount)}</Text>
            </View>
          ))}
          {Number(bill.earlyCheckoutFee) > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabelSub, { color: colors.danger }]}>Early Checkout Policy Fee</Text>
              <Text style={[styles.billValueSub, { color: colors.danger }]}>+{inr(bill.earlyCheckoutFee)}</Text>
            </View>
          )}
          {Number(bill.discountAmount) > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabelSub, { color: colors.success }]}>Discount Applied</Text>
              <Text style={[styles.billValueSub, { color: colors.success }]}>−{inr(bill.discountAmount)}</Text>
            </View>
          )}
          <View style={styles.billRow}>
            <Text style={styles.billLabelTot}>Total invoice amount</Text>
            <Text style={styles.billValueTot}>{inr(bill.total)}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabelSub}>Advance paid</Text>
            <Text style={styles.billValueSub}>−{inr(bill.advancePaid || 0)}</Text>
          </View>
          {Number(bill.otherPayments) > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabelSub}>Other payments</Text>
              <Text style={styles.billValueSub}>−{inr(bill.otherPayments)}</Text>
            </View>
          )}
          <View style={styles.billRow}>
            <Text style={styles.billLabelTot}>
              {isCheckedOut ? 'Settled' : bal > 0 ? 'Outstanding (Guest owes)' : bal < 0 ? 'Eligible refund (Hotel owes)' : 'Balance due'}
            </Text>
            <Text style={[styles.billValueTot, { color: isCheckedOut ? colors.heading : bal > 0 ? colors.danger : bal < 0 ? colors.success : colors.heading }]}>
              {isCheckedOut ? inr(0) : bal === 0 ? '₹0 (Fully Paid)' : bal > 0 ? inr(bal) : `Refund ${inr(Math.abs(bal))}`}
            </Text>
          </View>
        </View>

        {!isCheckedOut && !completedResult && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={showDiscountInput ? 'Cancel Discount' : 'Add / Adjust Discount'} variant="outline" size="sm" onPress={() => setShowDiscountInput(!showDiscountInput)} style={{ flex: 1 }} />
          </View>
        )}

        {showDiscountInput && !isCheckedOut && (
          <View style={styles.discountPanel}>
            <Text style={[styles.label, { marginBottom: 6 }]}>Discount Type</Text>
            <Segmented
              options={[
                { value: 'fixed', label: 'Fixed (₹)' },
                { value: 'percent', label: 'Percentage (%)' },
              ]}
              value={discountType}
              onChange={(t) => {
                setDiscountType(t);
                if (discountError) setDiscountError('');
              }}
              style={{ marginBottom: 8 }}
            />
            <Input
              ref={discountInputRef}
              placeholder={discountType === 'percent' ? 'Discount Percentage (e.g. 10)' : 'Amount (₹)'}
              keyboardType="numeric"
              value={discountVal}
              onChangeText={(v) => {
                setDiscountVal(v);
                if (discountError) setDiscountError('');
              }}
              error={discountError}
              style={{ marginBottom: 4 }}
            />
            {discountType === 'percent' && Number(discountVal) > 0 && !isNaN(Number(discountVal)) && (
              <Text style={[styles.meta, { marginBottom: 6, color: colors.primary }]}>
                = {inr(Math.round((totalBefore * (Number(discountVal) / 100)) * 100) / 100)} off {inr(totalBefore)}
              </Text>
            )}
            {discountError ? <FieldError style={{ marginBottom: 6 }}>{discountError}</FieldError> : null}
            <Input placeholder="Reason" value={discountReason} onChangeText={setDiscountReason} style={{ marginBottom: 6 }} />
            <Button title="Save Discount" variant="success" size="sm" loading={applyDiscount.isPending} onPress={handleApplyDiscount} />
          </View>
        )}

        {completedResult ? (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
            <Text style={{ fontSize: 28, color: colors.success }}>✓</Text>
            <Text style={styles.label}>Check out completed</Text>
            <Text style={styles.value}>Final Invoice: {inr(completedResult.bill?.total || bill.total)}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="Print Invoice"
                variant="outline"
                size="sm"
                onPress={() => {
                  onClose();
                  navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId } });
                }}
              />
              <Button title="Done" variant="outline" size="sm" onPress={onClose} />
            </View>
          </View>
        ) : isCheckedOut ? (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              title="Print Invoice"
              variant="outline"
              size="sm"
              onPress={() => {
                onClose();
                navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId } });
              }}
            />
            <Button title="Close" variant="outline" size="sm" onPress={onClose} />
          </View>
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Add extra stay charge</Text>
              <Segmented options={EXTRAS} value={xLabel} onChange={setXLabel} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Input
                  ref={extraInputRef}
                  style={{ flex: 1 }}
                  keyboardType="numeric"
                  placeholder="₹ amount"
                  value={xAmount}
                  onChangeText={(v) => {
                    setXAmount(v);
                    if (extraError) setExtraError('');
                  }}
                  error={extraError}
                />
                <Button title="Add" variant="outline" size="sm" loading={addExtra.isPending} onPress={addExtraCharge} />
              </View>
              {extraError ? <FieldError>{extraError}</FieldError> : null}
            </View>

            {bal === 0 ? (
              confirming ? (
                <View style={styles.confirmBox}>
                  <Text style={styles.confirmTitle}>Bill is fully paid. Complete checkout for Room {stay.room_no}?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Button title={isCheckoutBusy ? 'Checking out...' : 'Yes, check out'} variant="info" loading={isCheckoutBusy} disabled={isCheckoutBusy} onPress={doCheckout} style={{ flex: 1 }} />
                    <Button title="Cancel" variant="outline" disabled={isCheckoutBusy} onPress={() => setConfirming(false)} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <Button title="Complete checkout (Fully paid)" variant="info" size="lg" disabled={isCheckoutBusy} onPress={() => setConfirming(true)} />
              )
            ) : bal > 0 ? (
              <>
                <View>
                  <Text style={styles.label}>Guest pays outstanding balance by</Text>
                  <Segmented options={['cash', 'upi', 'card']} value={pay} onChange={setPay} />
                </View>
                {confirming ? (
                  <View style={styles.confirmBox}>
                    <Text style={styles.confirmTitle}>Collect {inr(bal)} by {pay.toUpperCase()} to complete checkout?</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Button title={isCheckoutBusy ? 'Processing...' : 'Yes, collect & check out'} variant="info" loading={isCheckoutBusy} disabled={isCheckoutBusy} onPress={doCheckout} style={{ flex: 1 }} />
                      <Button title="Cancel" variant="outline" disabled={isCheckoutBusy} onPress={() => setConfirming(false)} style={{ flex: 1 }} />
                    </View>
                  </View>
                ) : (
                  <Button title={`Check out · Collect ${inr(bal)}`} variant="info" size="lg" disabled={isCheckoutBusy} onPress={() => setConfirming(true)} />
                )}
              </>
            ) : (
              <>
                <View style={styles.advanceOk}>
                  <Text style={styles.advanceOkText}>Guest is eligible for a refund of {inr(Math.abs(bal))}.</Text>
                </View>
                <View>
                  <Text style={styles.label}>Refund payment method</Text>
                  <Segmented options={['upi', 'cash', 'card']} value={pay} onChange={setPay} />
                </View>
                <Input placeholder="Refund reason" value={refundReason} onChangeText={setRefundReason} />
                {confirming ? (
                  <View style={styles.confirmBox}>
                    <Text style={styles.confirmTitle}>Refund {inr(Math.abs(bal))} by {pay.toUpperCase()} to complete checkout?</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                      <Button title={isCheckoutBusy ? 'Processing...' : 'Yes, refund & check out'} variant="info" loading={isCheckoutBusy} disabled={isCheckoutBusy} onPress={doCheckout} style={{ flex: 1 }} />
                      <Button title="Cancel" variant="outline" disabled={isCheckoutBusy} onPress={() => setConfirming(false)} style={{ flex: 1 }} />
                    </View>
                  </View>
                ) : (
                  <Button title={`Check out · Refund ${inr(Math.abs(bal))}`} variant="info" size="lg" disabled={isCheckoutBusy} onPress={() => setConfirming(true)} />
                )}
              </>
            )}

            <Button
              title="Guest staying 1 more day" variant="outline" size="sm" loading={extend.isPending}
              onPress={async () => {
                try {
                  await extend.mutateAsync(stayId);
                  toast(`Room ${stay.room_no} extended.`);
                } catch (err) { toast(err.message); }
              }}
              style={{ alignSelf: 'flex-start' }}
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading, marginBottom: 4 },
  value: { fontFamily: fonts.body, fontSize: 13.5, color: colors.text },
  mono: { fontFamily: fonts.mono, fontSize: 12, color: colors.textSecondary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoGrid: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  infoLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, width: '48%' },
  infoValue: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text, width: '48%', marginBottom: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: 8 },
  fileName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
  docAction: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  removeBtn: { padding: 4 },
  removeFile: { fontSize: 13, color: colors.danger },
  warn: { backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radii.md, padding: 10 },
  warnText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.warning },
  advanceOk: { backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.successBorder, borderRadius: radii.md, padding: 10 },
  advanceOkText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.success },
  discountPanel: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10 },
  confirmBox: { backgroundColor: colors.warningBg, borderRadius: radii.md, padding: 12, borderWidth: 1, borderColor: colors.warningBorder },
  confirmTitle: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  billTable: { backgroundColor: colors.cardSecondary, borderRadius: radii.md, padding: 10, gap: 4 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between' },
  billLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text, flexShrink: 1 },
  billValue: { fontFamily: fonts.mono, fontSize: 12.5, color: colors.text },
  billLabelSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  billValueSub: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary },
  billLabelTot: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  billValueTot: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
});
