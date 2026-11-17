import { StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import { useGuest, useGuestReferrals } from '../../api/guests';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

/**
 * Simplified mobile adaptation of the web's GuestDetails.jsx (1496 lines, including
 * inline editing, ID document management and referral-tree visualisation — not yet
 * ported, see MOBILE_IMPLEMENTATION_PROGRESS.md). Shows the guest's profile and stay
 * history read-only, from the live backend.
 */
export default function GuestDetailsScreen({ route }) {
  const { guestId } = route.params;
  const { data: guest, isLoading, isError, error, refetch } = useGuest(guestId);
  const { data: referrals } = useGuestReferrals(guestId);

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;
  if (!guest) return null;

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.name}>{guest.name}</Text>
        <Text style={styles.phone}>{guest.phone}</Text>
        {guest.city ? <Text style={styles.meta}>From {guest.city}</Text> : null}
        {guest.id_proof_type ? <Text style={styles.meta}>{guest.id_proof_type}{guest.id_proof_last4 ? ` ••••${guest.id_proof_last4}` : ''}</Text> : null}
      </View>

      <Text style={styles.sectionTitle}>Stay History ({(guest.stays || []).length})</Text>
      {(guest.stays || []).length === 0 ? (
        <Text style={styles.empty}>No past stays.</Text>
      ) : (
        (guest.stays || []).map((s) => (
          <View key={s.id} style={styles.row}>
            <Text style={styles.rowTitle}>Room {s.room_no} · {fd(s.check_in_date)} → {fd(s.checkout_actual || s.checkout_planned)}</Text>
            <Text style={styles.meta}>{s.status === 'checked_out' ? `Invoice ${inr(s.invoice_total || 0)}` : s.status?.toUpperCase()}</Text>
          </View>
        ))
      )}

      {referrals?.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Referred Guests ({referrals.length})</Text>
          {referrals.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.rowTitle}>{r.name}</Text>
              <Text style={styles.meta}>{r.phone}</Text>
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 16 },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.heading },
  phone: { fontFamily: fonts.mono, fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading, marginBottom: 8, marginTop: 4 },
  row: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 10, marginBottom: 6 },
  rowTitle: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginBottom: 12 },
});
