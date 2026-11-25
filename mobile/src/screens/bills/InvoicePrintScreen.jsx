import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import { useInvoiceData } from '../../api/invoices';
import { useToast } from '../../components/ToastContext.jsx';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';
export function buildInvoiceHtml(data) {
  const { invoice, hotel, stay, charges = [], payments = [], paymentSummary } = data || {};
  if (!invoice || !hotel || !stay) return '';

  const checkoutDate = stay.checkout_actual || stay.checkout_planned || (invoice.created_at ? invoice.created_at.slice(0, 10) : '');
  const nights = Math.max(1, Math.round((new Date(checkoutDate) - new Date(stay.check_in_date)) / 86400000));

  const successfulPayments = payments.filter((p) => (p.status || 'successful') === 'successful');
  const advancePayments = successfulPayments.filter((p) => p.type === 'advance');
  const checkoutPayments = successfulPayments.filter((p) => p.type === 'balance');

  const advancePaid = paymentSummary ? paymentSummary.advancePaid : advancePayments.reduce((sum, p) => sum + Number(p.amount), 0) || Number(invoice.advance_paid || 0);
  const checkoutPaid = paymentSummary ? paymentSummary.checkoutPaid : checkoutPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaid = paymentSummary ? paymentSummary.totalPaid : (advancePaid + checkoutPaid);
  const balance = paymentSummary ? paymentSummary.balance : Number(invoice.balance_amount || 0);

  const advanceMethods = Array.from(new Set(advancePayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');
  const checkoutMethods = Array.from(new Set(checkoutPayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');

  const chargesRows = charges.map((c) => {
    const chargeGstPct = Number(c.gst_rate) > 0
      ? `${Math.round(Number(c.gst_rate) * 100)}%`
      : c.is_taxable
        ? `${Math.round(Number(invoice.gst_rate || 0.05) * 100)}%`
        : '—';
    return `
      <tr>
        <td>${c.label} ${c.sac_code ? `<span class="muted">(SAC ${c.sac_code})</span>` : ''}</td>
        <td class="r">${chargeGstPct}</td>
        <td class="r">${inr(c.amount)}</td>
      </tr>
    `;
  }).join('');

  const taxRows = Number(invoice.igst_amount) > 0 ? `
    <tr>
      <td>IGST</td>
      <td class="r"></td>
      <td class="r">${inr(invoice.igst_amount)}</td>
    </tr>
  ` : `
    <tr>
      <td>CGST</td>
      <td class="r"></td>
      <td class="r">${inr(invoice.cgst_amount)}</td>
    </tr>
    <tr>
      <td>SGST</td>
      <td class="r"></td>
      <td class="r">${inr(invoice.sgst_amount)}</td>
    </tr>
  `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Invoice - ${invoice.invoice_number}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #30223D;
            background: #ffffff;
            margin: 0;
            padding: 24px;
            font-size: 13px;
            line-height: 1.4;
          }
          .invwrap {
            max-width: 680px;
            margin: 0 auto;
          }
          .inv-head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #70265F;
            padding-bottom: 14px;
            margin-bottom: 16px;
          }
          h1 {
            color: #70265F;
            font-size: 20px;
            margin: 0 0 4px 0;
          }
          .muted {
            color: #81748C;
            font-size: 12px;
            margin-top: 2px;
          }
          .inv-meta {
            text-align: right;
            font-size: 12px;
            color: #81748C;
          }
          .inv-num {
            font-family: "Courier New", Courier, monospace;
            font-size: 16px;
            font-weight: bold;
            color: #30223D;
            margin-bottom: 4px;
          }
          .badge-proforma {
            display: inline-block;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            background: #EFF6FF;
            color: #1D4ED8;
            border: 1px solid #BFDBFE;
            margin-left: 4px;
            vertical-align: middle;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          .inv-grid {
            display: flex;
            gap: 20px;
            background: #FDF9FB;
            border: 1px solid #F1E5EC;
            border-radius: 6px;
            padding: 12px 16px;
            margin-bottom: 16px;
          }
          .grid-col {
            flex: 1;
          }
          .label {
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #81748C;
            margin-bottom: 2px;
          }
          .val {
            font-weight: 600;
            margin-bottom: 8px;
            color: #30223D;
          }
          table.inv-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          table.inv-table th {
            text-align: left;
            border-bottom: 2px solid #70265F;
            padding: 6px 4px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #81748C;
          }
          table.inv-table td {
            padding: 8px 4px;
            border-bottom: 1px solid #F1E5EC;
            color: #30223D;
          }
          table.inv-table td.r, table.inv-table th.r {
            text-align: right;
            font-family: "Courier New", Courier, monospace;
          }
          .inv-total td {
            font-weight: bold;
            border-top: 2px solid #70265F;
            border-bottom: 1px solid #70265F;
            background: #FDF9FB;
            font-size: 14px;
          }
          .inv-balance {
            text-align: right;
            font-size: 18px;
            font-weight: bold;
            color: #70265F;
            margin-top: 12px;
            padding: 8px 12px;
            background: #FDF9FB;
            border-radius: 6px;
            border: 1px solid #F1E5EC;
          }
        </style>
      </head>
      <body>
        <div class="invwrap">
          <div class="inv-head">
            <div>
              <h1>${hotel.name}</h1>
              <div class="muted">${hotel.address || hotel.place || ''}</div>
              ${hotel.gstin ? `<div class="muted">GSTIN: ${hotel.gstin}</div>` : ''}
              ${hotel.phone ? `<div class="muted">Phone: ${hotel.phone}</div>` : ''}
            </div>
            <div class="inv-meta">
              <div class="inv-num">${invoice.invoice_number}${invoice.is_proforma ? ' <span class="badge-proforma">PROFORMA PREVIEW</span>' : ''}</div>
              <div>Date: ${invoice.created_at ? invoice.created_at.slice(0, 10) : ''}</div>
              ${invoice.financial_year ? `<div>FY: ${invoice.financial_year}</div>` : ''}
            </div>
          </div>

          <div class="inv-grid">
            <div class="grid-col">
              <div class="label">Guest Details</div>
              <div class="val">${stay.guest_name}</div>
              <div class="label">Mobile Number</div>
              <div class="val">${stay.guest_phone}</div>
              ${invoice.guest_gstin ? `<div class="label">Guest GSTIN</div><div class="val">${invoice.guest_gstin}</div>` : ''}
            </div>
            <div class="grid-col">
              <div class="label">Stay Information</div>
              <div class="val">Room ${stay.room_no} · ${stay.room_type_name || ''}</div>
              <div class="label">Stay Duration</div>
              <div class="val">${fd(stay.check_in_date)} → ${fd(checkoutDate)} (${nights} night${nights > 1 ? 's' : ''})</div>
            </div>
          </div>

          <table class="inv-table">
            <thead>
              <tr>
                <th>Description</th>
                <th class="r">GST</th>
                <th class="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Room charge (${nights} night${nights > 1 ? 's' : ''} × ${inr(stay.rate)})</td>
                <td class="r">${Math.round(invoice.gst_rate * 100)}%</td>
                <td class="r">${inr(invoice.room_amount)}</td>
              </tr>
              ${chargesRows}
              ${taxRows}
              <tr class="inv-total">
                <td>Invoice Total</td>
                <td></td>
                <td class="r">${inr(invoice.total_amount)}</td>
              </tr>
              ${advancePaid > 0 ? `
                <tr>
                  <td>Advance paid${advanceMethods ? ` (${advanceMethods})` : ''}</td>
                  <td></td>
                  <td class="r">−${inr(advancePaid)}</td>
                </tr>
              ` : ''}
              ${checkoutPaid > 0 ? `
                <tr>
                  <td>Checkout collection${checkoutMethods ? ` (${checkoutMethods})` : ''}</td>
                  <td></td>
                  <td class="r">−${inr(checkoutPaid)}</td>
                </tr>
              ` : ''}
              <tr style="font-weight: 600;">
                <td>Total Paid</td>
                <td></td>
                <td class="r">${inr(totalPaid)}</td>
              </tr>
            </tbody>
          </table>

          <div class="inv-balance">Balance Due: ${inr(balance)}</div>
        </div>
      </body>
    </html>
  `;
}

export default function InvoicePrintScreen({ route, navigation }) {
  const { stayId, invoiceId, id, stay: initialStay, guest: initialGuest } = route?.params || {};
  const { data, isLoading, isError, error, refetch, isRefetching } = useInvoiceData({ stayId, invoiceId, id, stay: initialStay, guest: initialGuest });
  const toast = useToast();
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);

  if (isLoading) return <Screen><LoadingState label="Loading invoice…" /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;
  if (!data) return null;

  const { invoice, hotel, stay, charges = [], payments = [], paymentSummary } = data;
  if (!invoice || !hotel || !stay) {
    return (
      <Screen>
        <ErrorState message="Invoice data is incomplete." onRetry={refetch} />
      </Screen>
    );
  }

  const checkoutDate = stay.checkout_actual || stay.checkout_planned || (invoice.created_at ? invoice.created_at.slice(0, 10) : '');
  const nights = Math.max(1, Math.round((new Date(checkoutDate) - new Date(stay.check_in_date)) / 86400000));

  const successfulPayments = payments.filter((p) => (p.status || 'successful') === 'successful');
  const advancePayments = successfulPayments.filter((p) => p.type === 'advance');
  const checkoutPayments = successfulPayments.filter((p) => p.type === 'balance');

  const advancePaid = paymentSummary ? paymentSummary.advancePaid : advancePayments.reduce((sum, p) => sum + Number(p.amount), 0) || Number(invoice.advance_paid || 0);
  const checkoutPaid = paymentSummary ? paymentSummary.checkoutPaid : checkoutPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalPaid = paymentSummary ? paymentSummary.totalPaid : (advancePaid + checkoutPaid);
  const balance = paymentSummary ? paymentSummary.balance : Number(invoice.balance_amount || 0);

  const advanceMethods = Array.from(new Set(advancePayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');
  const checkoutMethods = Array.from(new Set(checkoutPayments.map((p) => p.method?.toUpperCase()).filter(Boolean))).join(', ');

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const html = buildInvoiceHtml(data);
      await Print.printAsync({ html });
    } catch (e) {
      toast(e.message || 'Print error.');
    } finally {
      setPrinting(false);
    }
  };

  const handleSharePdf = async () => {
    try {
      setSharing(true);
      const html = buildInvoiceHtml(data);
      const { uri, base64 } = await Print.printToFileAsync({ html, base64: true });

      const cleanInvoiceNumber = (invoice.invoice_number || 'invoice').replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetUri = `${FileSystem.cacheDirectory}Invoice_${cleanInvoiceNumber}.pdf`;

      // Remove prior cached file if present to guarantee clean export
      try {
        const existing = await FileSystem.getInfoAsync(targetUri);
        if (existing.exists) {
          await FileSystem.deleteAsync(targetUri, { idempotent: true });
        }
      } catch {}

      if (base64) {
        // Write the PDF directly into the scoped cache directory from base64 string.
        // This avoids Android/Expo Go permission rejection on Print's internal temp URI.
        await FileSystem.writeAsStringAsync(targetUri, base64, {
          encoding: FileSystem.EncodingType?.Base64 || 'base64',
        });
      } else {
        await FileSystem.copyAsync({
          from: uri,
          to: targetUri,
        });
      }

      let shared = false;
      if (await Sharing.isAvailableAsync()) {
        try {
          await Sharing.shareAsync(targetUri, {
            mimeType: 'application/pdf',
            dialogTitle: `Invoice ${invoice.invoice_number}`,
            UTI: 'com.adobe.pdf',
          });
          shared = true;
        } catch (shareErr) {
          console.warn('ExpoSharing.shareAsync rejected, falling back to File.preview:', shareErr);
        }
      }

      if (!shared) {
        try {
          const file = new File(targetUri);
          await File.preview(file, { mimeType: 'application/pdf' });
          shared = true;
        } catch (previewErr) {
          console.warn('File.preview fallback failed, attempting temp URI preview:', previewErr);
          try {
            const rawFile = new File(uri);
            await File.preview(rawFile, { mimeType: 'application/pdf' });
            shared = true;
          } catch (rawErr) {
            console.warn('Temp URI preview also failed:', rawErr);
          }
        }
      }

      if (!shared) {
        toast('PDF saved: ' + targetUri);
      }
    } catch (e) {
      toast(e.message || 'PDF export error.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {/* Action Buttons Top Bar: Back, Print Invoice, Share PDF */}
      <View style={styles.actionBar}>
        <Button
          title="← Back"
          variant="outline"
          size="md"
          onPress={() => {
            if (navigation?.canGoBack && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation?.navigate?.('BillsHome');
            }
          }}
          style={{ flex: 1 }}
        />
        <Button
          title={printing ? 'Printing…' : '🖨️ Print Invoice'}
          variant="primary"
          size="md"
          loading={printing}
          onPress={handlePrint}
          style={{ flex: 1.2 }}
        />
        <Button
          title={sharing ? 'Exporting…' : '📄 Share PDF'}
          variant="outline"
          size="md"
          loading={sharing}
          onPress={handleSharePdf}
          style={{ flex: 1.2 }}
        />
      </View>

      {/* On-Screen Printable Invoice Preview */}
      <View style={styles.invoiceSheet}>
        {/* Hotel Branding Header */}
        <View style={styles.hotelHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hotelName}>{hotel.name || 'KKK Lodge'}</Text>
            <Text style={styles.hotelMuted}>{hotel.address || hotel.place || ''}</Text>
            {hotel.gstin ? <Text style={styles.hotelMuted}>GSTIN: {hotel.gstin}</Text> : null}
            {hotel.phone ? <Text style={styles.hotelMuted}>Phone: {hotel.phone}</Text> : null}
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceNumber}>{invoice.invoice_number}</Text>
            {Boolean(invoice.is_proforma) && (
              <View style={styles.proformaBadge}>
                <Text style={styles.proformaBadgeText}>PROFORMA / PREVIEW</Text>
              </View>
            )}
            <Text style={styles.invoiceDate}>Date: {invoice.created_at ? invoice.created_at.slice(0, 10) : ''}</Text>
            {invoice.financial_year ? <Text style={styles.invoiceDate}>FY: {invoice.financial_year}</Text> : null}
          </View>
        </View>

        {/* Guest & Stay Details Grid */}
        <View style={styles.gridBox}>
          <View style={styles.gridCol}>
            <Text style={styles.metaLabel}>Guest Name</Text>
            <Text style={styles.metaValBold}>{stay.guest_name}</Text>
            <Text style={styles.metaLabel}>Mobile Number</Text>
            <Text style={styles.monoText}>{stay.guest_phone}</Text>
            {invoice.guest_gstin ? (
              <>
                <Text style={styles.metaLabel}>Guest GSTIN</Text>
                <Text style={styles.monoText}>{invoice.guest_gstin}</Text>
              </>
            ) : null}
          </View>

          <View style={styles.gridCol}>
            <Text style={styles.metaLabel}>Room</Text>
            <Text style={styles.metaValBold}>Room {stay.room_no} · {stay.room_type_name || ''}</Text>
            <Text style={styles.metaLabel}>Stay Duration</Text>
            <Text style={styles.metaVal}>
              {fd(stay.check_in_date)} → {fd(checkoutDate)} ({nights} night{nights > 1 ? 's' : ''})
            </Text>
          </View>
        </View>

        {/* Itemized Table */}
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, { flex: 2 }]}>Description</Text>
          <Text style={[styles.thText, { flex: 1, textAlign: 'right' }]}>GST</Text>
          <Text style={[styles.thText, { flex: 1.5, textAlign: 'right' }]}>Amount</Text>
        </View>

        {/* Room Charge */}
        <View style={styles.tableRow}>
          <Text style={[styles.tdText, { flex: 2 }]}>
            Room charge ({nights} night{nights > 1 ? 's' : ''} × {inr(stay.rate)})
          </Text>
          <Text style={[styles.tdMono, { flex: 1, textAlign: 'right' }]}>
            {Math.round((invoice.gst_rate || 0.05) * 100)}%
          </Text>
          <Text style={[styles.tdMonoBold, { flex: 1.5, textAlign: 'right' }]}>
            {inr(invoice.room_amount)}
          </Text>
        </View>

        {/* Extra Charges */}
        {charges.map((c) => {
          const chargeGstPct = Number(c.gst_rate) > 0
            ? `${Math.round(Number(c.gst_rate) * 100)}%`
            : c.is_taxable
              ? `${Math.round(Number(invoice.gst_rate || 0.05) * 100)}%`
              : '—';
          return (
            <View key={c.id} style={styles.tableRow}>
              <View style={{ flex: 2 }}>
                <Text style={styles.tdText}>{c.label}</Text>
                {c.sac_code ? <Text style={styles.sacText}>(SAC {c.sac_code})</Text> : null}
              </View>
              <Text style={[styles.tdMono, { flex: 1, textAlign: 'right' }]}>{chargeGstPct}</Text>
              <Text style={[styles.tdMonoBold, { flex: 1.5, textAlign: 'right' }]}>{inr(c.amount)}</Text>
            </View>
          );
        })}

        {/* Taxes */}
        {Number(invoice.igst_amount) > 0 ? (
          <View style={styles.tableRow}>
            <Text style={[styles.tdText, { flex: 2 }]}>IGST</Text>
            <Text style={[styles.tdMono, { flex: 1, textAlign: 'right' }]}></Text>
            <Text style={[styles.tdMono, { flex: 1.5, textAlign: 'right' }]}>{inr(invoice.igst_amount)}</Text>
          </View>
        ) : (
          <>
            <View style={styles.tableRow}>
              <Text style={[styles.tdText, { flex: 2 }]}>CGST</Text>
              <Text style={[styles.tdMono, { flex: 1, textAlign: 'right' }]}></Text>
              <Text style={[styles.tdMono, { flex: 1.5, textAlign: 'right' }]}>{inr(invoice.cgst_amount)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tdText, { flex: 2 }]}>SGST</Text>
              <Text style={[styles.tdMono, { flex: 1, textAlign: 'right' }]}></Text>
              <Text style={[styles.tdMono, { flex: 1.5, textAlign: 'right' }]}>{inr(invoice.sgst_amount)}</Text>
            </View>
          </>
        )}

        {/* Invoice Total */}
        <View style={[styles.tableRow, styles.totalRow]}>
          <Text style={[styles.totalLabel, { flex: 2 }]}>Invoice Total</Text>
          <Text style={{ flex: 1 }}></Text>
          <Text style={[styles.totalVal, { flex: 1.5, textAlign: 'right' }]}>{inr(invoice.total_amount)}</Text>
        </View>

        {/* Advance Paid */}
        {advancePaid > 0 && (
          <View style={styles.tableRow}>
            <Text style={[styles.tdText, { flex: 2 }]}>
              Advance paid{advanceMethods ? ` (${advanceMethods})` : ''}
            </Text>
            <Text style={{ flex: 1 }}></Text>
            <Text style={[styles.tdMono, { flex: 1.5, textAlign: 'right', color: colors.success }]}>
              −{inr(advancePaid)}
            </Text>
          </View>
        )}

        {/* Checkout Collection */}
        {checkoutPaid > 0 && (
          <View style={styles.tableRow}>
            <Text style={[styles.tdText, { flex: 2 }]}>
              Checkout collection{checkoutMethods ? ` (${checkoutMethods})` : ''}
            </Text>
            <Text style={{ flex: 1 }}></Text>
            <Text style={[styles.tdMono, { flex: 1.5, textAlign: 'right', color: colors.success }]}>
              −{inr(checkoutPaid)}
            </Text>
          </View>
        )}

        {/* Total Paid */}
        <View style={[styles.tableRow, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.tdTextBold, { flex: 2 }]}>Total Paid</Text>
          <Text style={{ flex: 1 }}></Text>
          <Text style={[styles.tdMonoBold, { flex: 1.5, textAlign: 'right' }]}>{inr(totalPaid)}</Text>
        </View>

        {/* Balance Box */}
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Balance Due</Text>
          <Text style={[styles.balanceVal, balance > 0 && { color: colors.danger }]}>
            {inr(balance)}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionBar: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  invoiceSheet: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginBottom: 20,
  },
  hotelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingBottom: 12,
    marginBottom: 12,
  },
  hotelName: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.primary },
  hotelMuted: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },
  invoiceMeta: { alignItems: 'flex-end' },
  invoiceNumber: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.heading },
  proformaBadge: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: radii.xs,
    paddingHorizontal: 6,
    paddingVertical: 1,
    marginVertical: 2,
    alignSelf: 'flex-end',
  },
  proformaBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 9.5,
    color: '#1D4ED8',
    letterSpacing: 0.3,
  },
  invoiceDate: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },
  gridBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radii.sm,
    padding: 10,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  gridCol: { flex: 1 },
  metaLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  metaVal: { fontFamily: fonts.body, fontSize: 12, color: colors.heading, marginBottom: 6 },
  metaValBold: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, marginBottom: 6 },
  monoText: { fontFamily: fonts.mono, fontSize: 12, color: colors.heading, marginBottom: 6 },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
    paddingBottom: 6,
    marginBottom: 4,
  },
  thText: { fontFamily: fonts.bodyBold, fontSize: 10.5, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tdText: { fontFamily: fonts.body, fontSize: 12, color: colors.heading },
  tdTextBold: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading },
  tdMono: { fontFamily: fonts.mono, fontSize: 12, color: colors.heading },
  tdMonoBold: { fontFamily: fonts.monoBold, fontSize: 12.5, color: colors.heading },
  sacText: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 9,
    backgroundColor: colors.surfaceSecondary,
  },
  totalLabel: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.primary },
  totalVal: { fontFamily: fonts.monoBold, fontSize: 14, color: colors.primary },
  balanceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    padding: 12,
    marginTop: 14,
  },
  balanceLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.heading },
  balanceVal: { fontFamily: fonts.monoBold, fontSize: 18, color: colors.primary },
});
