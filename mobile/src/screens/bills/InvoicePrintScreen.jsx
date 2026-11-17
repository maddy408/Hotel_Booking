import { Linking, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import { useInvoiceByStay } from '../../api/invoices';
import { BASE_URL } from '../../lib/apiClient';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * The web's InvoicePrint.jsx (183 lines) renders a print-styled HTML invoice in the
 * browser tab. On mobile this shows the key invoice figures and opens the same backend
 * print page in the system browser for the full formatted/printable version.
 */
export default function InvoicePrintScreen({ route }) {
  const { stayId } = route.params;
  const { data, isLoading, isError, error, refetch } = useInvoiceByStay(stayId);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;
  if (!data) return null;

  const { invoice, stay } = data;
  const gstAmount = Number(invoice.room_gst_amount || 0) + Number(invoice.extras_gst_amount || 0);

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.invoiceNo}>Invoice {invoice.invoice_number || `#${stayId}`}</Text>
        <Text style={styles.guest}>{stay.guest_name}</Text>
        <Text style={styles.meta}>Room {stay.room_no} · {fd(stay.check_in_date)} → {fd(stay.checkout_actual)}</Text>
        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.label}>Room Amount</Text><Text style={styles.value}>{inr(invoice.room_amount)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>GST</Text><Text style={styles.value}>{inr(gstAmount)}</Text></View>
        {Number(invoice.extras_amount) > 0 ? <View style={styles.row}><Text style={styles.label}>Extras</Text><Text style={styles.value}>{inr(invoice.extras_amount)}</Text></View> : null}
        <View style={[styles.row, { marginTop: 6 }]}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{inr(invoice.total_amount)}</Text></View>
      </View>
      <Button
        title="Open Printable Invoice"
        variant="primary" size="lg"
        onPress={() => Linking.openURL(`${BASE_URL}/print/invoice/${stayId}`)}
        style={{ marginTop: 16 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 16, gap: 2 },
  invoiceNo: { fontFamily: fonts.mono, fontSize: 13, color: colors.textSecondary },
  guest: { fontFamily: fonts.display, fontSize: 18, color: colors.heading, marginTop: 4 },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, marginBottom: 8 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  value: { fontFamily: fonts.mono, fontSize: 13, color: colors.text },
  totalLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.heading },
  totalValue: { fontFamily: fonts.monoBold, fontSize: 15, color: colors.heading },
});
