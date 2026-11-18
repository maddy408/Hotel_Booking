import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import Sheet, { SheetHeader } from '../../components/Sheet.jsx';
import { Input } from '../../components/ui/Field.jsx';
import { useGuest, useGuestReferrals, useUpdateGuest } from '../../api/guests';
import { useToast } from '../../components/ToastContext.jsx';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function GuestDetailsScreen({ route, navigation }) {
  const { guestId } = route.params;
  const { data: guest, isLoading, isError, error, refetch } = useGuest(guestId);
  const { data: referrals } = useGuestReferrals(guestId);
  const updateGuest = useUpdateGuest();
  const toast = useToast();

  const [editSheet, setEditSheet] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [idNo, setIdNo] = useState('');

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;
  if (!guest) return null;

  return (
    <Screen onRefresh={refetch}>
      {/* Profile Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{guest.name}</Text>
            <Text style={styles.phone}>{guest.phone}</Text>
          </View>
          <Button
            title="Edit Profile"
            variant="outline"
            size="sm"
            onPress={() => {
              setName(guest.name || '');
              setCity(guest.city || '');
              setIdNo(guest.id_proof_number || '');
              setEditSheet(true);
            }}
          />
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>City / Location</Text>
            <Text style={styles.infoVal}>{guest.city || '—'}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>ID Proof</Text>
            <Text style={styles.infoVal}>
              {guest.id_proof_type || 'Aadhaar'}{guest.id_proof_number ? ` (${guest.id_proof_number})` : ''}
            </Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Total Stays</Text>
            <Text style={styles.infoVal}>{(guest.stays || []).length} Stay(s)</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoVal}>{guest.created_at ? fd(guest.created_at) : '—'}</Text>
          </View>
        </View>
      </View>

      {/* Stay History Table / Cards */}
      <Text style={styles.sectionTitle}>Complete Stay History ({(guest.stays || []).length})</Text>
      {(guest.stays || []).length === 0 ? (
        <Text style={styles.empty}>No past stay records found.</Text>
      ) : (
        (guest.stays || []).map((s) => (
          <Pressable
            key={s.id}
            style={styles.stayCard}
            onPress={() => navigation.navigate('Bills', { screen: 'InvoicePrint', params: { stayId: s.id } })}
          >
            <View style={styles.rowTop}>
              <Text style={styles.stayRoom}>Room {s.room_no} · {s.room_type_name || ''}</Text>
              <Text style={styles.viewBillText}>View Invoice →</Text>
            </View>
            <Text style={styles.meta}>
              {fd(s.check_in_date)} → {fd(s.checkout_actual || s.checkout_planned)} ({s.days || 1} night{s.days > 1 ? 's' : ''})
            </Text>
            <View style={styles.stayFooter}>
              <Text style={styles.stayStatus}>
                Status: {(s.status || 'checked_out').toUpperCase()}
              </Text>
              {s.invoice_total != null ? (
                <Text style={styles.stayTotal}>Invoice: {inr(s.invoice_total)}</Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}

      {/* Referred Members */}
      {referrals?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Guests Referred by {guest.name} ({referrals.length})</Text>
          {referrals.map((r) => (
            <View key={r.id} style={styles.refRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.refName}>{r.name}</Text>
                <Text style={styles.phone}>{r.phone}</Text>
              </View>
              {r.created_at ? <Text style={styles.meta}>{fd(r.created_at)}</Text> : null}
            </View>
          ))}
        </>
      )}

      {/* EDIT MODAL */}
      {editSheet && (
        <Sheet onClose={() => setEditSheet(false)}>
          <SheetHeader title="Edit Guest Details" onClose={() => setEditSheet(false)} />
          <View style={styles.body}>
            <Text style={styles.label}>Full Name *</Text>
            <Input value={name} onChangeText={setName} />

            <Text style={styles.label}>City</Text>
            <Input value={city} onChangeText={setCity} />

            <Text style={styles.label}>ID Proof Number</Text>
            <Input value={idNo} onChangeText={setIdNo} />

            <Button
              title={updateGuest.isPending ? 'Saving…' : 'Save Details'}
              variant="primary"
              size="lg"
              loading={updateGuest.isPending}
              onPress={async () => {
                try {
                  await updateGuest.mutateAsync({
                    id: guest.id,
                    name: name.trim(),
                    city: city ? city.trim() : null,
                    idProofNumber: idNo ? idNo.trim() : null,
                  });
                  setEditSheet(false);
                  toast('Guest profile updated.');
                } catch (e) {
                  toast(e.message);
                }
              }}
              style={{ marginTop: 8 }}
            />
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  name: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.heading },
  phone: { fontFamily: fonts.mono, fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  infoCol: { width: '47%' },
  infoLabel: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary },
  infoVal: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.heading, marginTop: 2 },
  sectionTitle: { fontFamily: fonts.displaySemibold, fontSize: 15, color: colors.heading, marginTop: 6, marginBottom: 10 },
  stayCard: { backgroundColor: colors.card, borderRadius: radii.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12, marginBottom: 10 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stayRoom: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.heading },
  viewBillText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  stayFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  stayStatus: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.textSecondary },
  stayTotal: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
  refRow: { backgroundColor: colors.card, borderRadius: radii.md, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  refName: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  body: { padding: 16, gap: 10 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading },
});
