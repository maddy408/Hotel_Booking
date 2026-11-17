import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { useSettings, useUpdateHotel, useUpdateCheckoutHour } from '../../api/settings';
import { useToast } from '../../components/ToastContext.jsx';
import { formatCheckoutHour } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * Simplified adaptation of the web's Settings.jsx (810 lines, covering GST slabs,
 * cancellation/refund policy editors and WhatsApp integration — not yet ported, see
 * MOBILE_IMPLEMENTATION_PROGRESS.md). Supports editing the hotel name and the
 * checkout hour against the live backend, matching the business rule everywhere
 * else in the app (formatCheckoutHour).
 */
export default function SettingsScreen() {
  const { data, isLoading, isError, error, refetch } = useSettings();
  const updateHotel = useUpdateHotel();
  const updateCheckoutHour = useUpdateCheckoutHour();
  const toast = useToast();
  const [hotelName, setHotelName] = useState(null);
  const [checkoutHour, setCheckoutHour] = useState(null);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  const settings = data?.settings || {};
  const hotel = data?.hotel || {};
  const name = hotelName ?? hotel.name ?? '';
  const hour = checkoutHour ?? String(settings.checkout_hour ?? 12);

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hotel</Text>
        <Input placeholder="Hotel name" value={name} onChangeText={setHotelName} style={{ marginBottom: 10 }} />
        <Button
          title="Save Hotel Name" variant="outline" size="sm" loading={updateHotel.isPending}
          onPress={async () => {
            try {
              await updateHotel.mutateAsync({ name });
              toast('Hotel name updated.');
            } catch (e) { toast(e.message); }
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Checkout Hour</Text>
        <Text style={styles.meta}>Currently: {formatCheckoutHour(settings.checkout_hour)}</Text>
        <Input placeholder="0-23" keyboardType="numeric" value={hour} onChangeText={setCheckoutHour} style={{ marginVertical: 10 }} />
        <Button
          title="Save Checkout Hour" variant="outline" size="sm" loading={updateCheckoutHour.isPending}
          onPress={async () => {
            try {
              await updateCheckoutHour.mutateAsync({ checkoutHour: Number(hour) });
              toast('Checkout hour updated.');
            } catch (e) { toast(e.message); }
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 14 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.heading, marginBottom: 8 },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary },
});
