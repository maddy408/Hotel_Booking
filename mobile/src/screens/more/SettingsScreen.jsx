import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Segmented } from '../../components/ui/Field.jsx';
import {
  useSettings,
  useUpdateHotel,
  useUpdateCheckoutHour,
  useUpdateGst,
  useUpdatePolicies,
  useUpdateWhatsapp,
} from '../../api/settings';
import { useToast } from '../../components/ToastContext.jsx';
import { formatCheckoutHour } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function SettingsScreen() {
  const { data, isLoading, isError, error, refetch } = useSettings();
  const updateHotel = useUpdateHotel();
  const updateCheckoutHour = useUpdateCheckoutHour();
  const updateGst = useUpdateGst();
  const updatePolicies = useUpdatePolicies();
  const updateWhatsapp = useUpdateWhatsapp();
  const toast = useToast();

  const [hotel, setHotel] = useState({ name: '', phone: '', email: '', address: '', timezone: 'Asia/Kolkata' });
  const [checkoutHour, setCheckoutHour] = useState('12');
  const [gst, setGst] = useState({
    gstSlab1MaxRate: '7500.00',
    gstSlab1GstRate: '5',
    gstSlab2MaxRate: '7500.00',
    gstSlab2GstRate: '18',
    gstSlab3GstRate: '18',
  });
  const [policies, setPolicies] = useState({
    cancellationRefundPercentage: '100',
    freeCancellationHours: '24',
    earlyCheckoutFeePerNight: '0',
  });
  const [whatsapp, setWhatsapp] = useState({
    whatsappCheckinEnabled: true,
  });

  useEffect(() => {
    if (data?.hotel) {
      setHotel({
        name: data.hotel.name || '',
        phone: data.hotel.phone || '',
        email: data.hotel.email || '',
        address: data.hotel.address || '',
        timezone: data.hotel.timezone || 'Asia/Kolkata',
      });
    }
    if (data?.settings) {
      setCheckoutHour(String(data.settings.checkout_hour ?? 12));
      setGst({
        gstSlab1MaxRate: String(data.settings.gst_slab1_max_rate ?? '7500.00'),
        gstSlab1GstRate: String(Math.round(Number(data.settings.gst_slab1_gst_rate ?? 0.05) * 100)),
        gstSlab2MaxRate: String(data.settings.gst_slab2_max_rate ?? '7500.00'),
        gstSlab2GstRate: String(Math.round(Number(data.settings.gst_slab2_gst_rate ?? 0.18) * 100)),
        gstSlab3GstRate: String(Math.round(Number(data.settings.gst_slab3_gst_rate ?? 0.18) * 100)),
      });
      setPolicies({
        cancellationRefundPercentage: String(data.settings.cancellation_refund_percentage ?? '100'),
        freeCancellationHours: String(data.settings.free_cancellation_hours ?? '24'),
        earlyCheckoutFeePerNight: String(data.settings.early_checkout_fee_per_night ?? '0'),
      });
      setWhatsapp({
        whatsappCheckinEnabled: data.settings.whatsapp_checkin_enabled !== false,
      });
    }
  }, [data]);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  return (
    <Screen onRefresh={refetch}>
      {/* 1. HOTEL DETAILS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hotel Details</Text>
        <Text style={styles.label}>Hotel Name *</Text>
        <Input
          placeholder="Hotel name"
          value={hotel.name}
          onChangeText={(v) => setHotel((p) => ({ ...p, name: v }))}
          style={{ marginBottom: 8 }}
        />
        <Text style={styles.label}>Phone Number</Text>
        <Input
          placeholder="Phone"
          keyboardType="phone-pad"
          value={hotel.phone}
          onChangeText={(v) => setHotel((p) => ({ ...p, phone: v }))}
          style={{ marginBottom: 8 }}
        />
        <Text style={styles.label}>Email Address</Text>
        <Input
          placeholder="Email"
          keyboardType="email-address"
          value={hotel.email}
          onChangeText={(v) => setHotel((p) => ({ ...p, email: v }))}
          style={{ marginBottom: 8 }}
        />
        <Text style={styles.label}>Address</Text>
        <Input
          placeholder="Full Address"
          value={hotel.address}
          onChangeText={(v) => setHotel((p) => ({ ...p, address: v }))}
          style={{ marginBottom: 12 }}
        />
        <Button
          title="Save Hotel Profile"
          variant="primary"
          size="sm"
          loading={updateHotel.isPending}
          onPress={async () => {
            try {
              await updateHotel.mutateAsync(hotel);
              toast('Hotel profile updated successfully.');
            } catch (e) {
              toast(e.message);
            }
          }}
        />
      </View>

      {/* 2. CHECKOUT TIME */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Standard Checkout Time</Text>
        <Text style={styles.meta}>Current daily checkout rule: {formatCheckoutHour(Number(checkoutHour))}</Text>
        <Text style={[styles.label, { marginTop: 8 }]}>Checkout Hour (0 to 23)</Text>
        <Input
          placeholder="0-23 (e.g. 11 or 12)"
          keyboardType="numeric"
          value={checkoutHour}
          onChangeText={setCheckoutHour}
          style={{ marginVertical: 8 }}
        />
        <Button
          title="Save Checkout Time"
          variant="outline"
          size="sm"
          loading={updateCheckoutHour.isPending}
          onPress={async () => {
            try {
              await updateCheckoutHour.mutateAsync({ checkoutHour: Number(checkoutHour) });
              toast('Checkout hour updated.');
            } catch (e) {
              toast(e.message);
            }
          }}
        />
      </View>

      {/* 3. GST TAX SLABS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GST Tax Settings</Text>
        <Text style={styles.meta}>Configure government GST percentages for room tariffs</Text>

        <Text style={[styles.label, { marginTop: 8 }]}>Tier 1 GST Rate (%)</Text>
        <Input
          keyboardType="numeric"
          placeholder="e.g. 5"
          value={gst.gstSlab1GstRate}
          onChangeText={(v) => setGst((p) => ({ ...p, gstSlab1GstRate: v }))}
          style={{ marginBottom: 8 }}
        />

        <Text style={styles.label}>Tier 2 Threshold Max Rate (₹)</Text>
        <Input
          keyboardType="numeric"
          placeholder="e.g. 7500"
          value={gst.gstSlab1MaxRate}
          onChangeText={(v) => setGst((p) => ({ ...p, gstSlab1MaxRate: v }))}
          style={{ marginBottom: 8 }}
        />

        <Text style={styles.label}>Tier 2 GST Rate (%)</Text>
        <Input
          keyboardType="numeric"
          placeholder="e.g. 18"
          value={gst.gstSlab2GstRate}
          onChangeText={(v) => setGst((p) => ({ ...p, gstSlab2GstRate: v }))}
          style={{ marginBottom: 12 }}
        />

        <Button
          title="Save GST Settings"
          variant="outline"
          size="sm"
          loading={updateGst.isPending}
          onPress={async () => {
            try {
              await updateGst.mutateAsync({
                gstSlab1MaxRate: gst.gstSlab1MaxRate,
                gstSlab1GstRate: Number(gst.gstSlab1GstRate) / 100,
                gstSlab2MaxRate: gst.gstSlab2MaxRate,
                gstSlab2GstRate: Number(gst.gstSlab2GstRate) / 100,
                gstSlab3GstRate: Number(gst.gstSlab3GstRate) / 100,
              });
              toast('GST rates updated successfully.');
            } catch (e) {
              toast(e.message);
            }
          }}
        />
      </View>

      {/* 4. CANCELLATION POLICIES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Policies & Cancellation</Text>
        <Text style={styles.label}>Cancellation Refund Percentage (%)</Text>
        <Input
          keyboardType="numeric"
          value={policies.cancellationRefundPercentage}
          onChangeText={(v) => setPolicies((p) => ({ ...p, cancellationRefundPercentage: v }))}
          style={{ marginBottom: 8 }}
        />

        <Text style={styles.label}>Free Cancellation Window (Hours)</Text>
        <Input
          keyboardType="numeric"
          value={policies.freeCancellationHours}
          onChangeText={(v) => setPolicies((p) => ({ ...p, freeCancellationHours: v }))}
          style={{ marginBottom: 12 }}
        />

        <Button
          title="Save Policies"
          variant="outline"
          size="sm"
          loading={updatePolicies.isPending}
          onPress={async () => {
            try {
              await updatePolicies.mutateAsync({
                cancellationRefundPercentage: Number(policies.cancellationRefundPercentage),
                freeCancellationHours: Number(policies.freeCancellationHours),
                earlyCheckoutFeePerNight: Number(policies.earlyCheckoutFeePerNight),
              });
              toast('Policies updated successfully.');
            } catch (e) {
              toast(e.message);
            }
          }}
        />
      </View>

      {/* 5. WHATSAPP AUTOMATION TOGGLE */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>WhatsApp Notifications</Text>
        <Text style={styles.meta}>Auto-send check-in and checkout greeting templates</Text>
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>Check-in Greetings Alert</Text>
          <Segmented
            options={[
              { value: true, label: 'Enabled' },
              { value: false, label: 'Disabled' },
            ]}
            value={whatsapp.whatsappCheckinEnabled}
            onChange={(v) => {
              setWhatsapp((p) => ({ ...p, whatsappCheckinEnabled: v }));
              updateWhatsapp.mutateAsync({ whatsappCheckinEnabled: v }).then(() => {
                toast('WhatsApp setting updated.');
              }).catch((e) => toast(e.message));
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 14 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading, marginBottom: 4 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.heading, marginBottom: 3 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
});
