import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { Input } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import { useGuest, useUpdateGuest } from '../../api/guests';
import { useToast } from '../ToastContext.jsx';
import { colors, fonts, radii } from '../../theme/theme';

const ID_TYPES = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport', 'Other'];

export default function GuestEditSheet({ guestId, onClose, onSaved }) {
  const { data: guest, isLoading } = useGuest(guestId);
  const updateGuest = useUpdateGuest();
  const toast = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [idProofType, setIdProofType] = useState('Aadhaar');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [isForeign, setIsForeign] = useState(false);
  const [nationality, setNationality] = useState('');
  const [visaExpiry, setVisaExpiry] = useState('');
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (guest) {
      setName(guest.name || '');
      setPhone(guest.phone || '');
      setEmail(guest.email || '');
      setCity(guest.city || '');
      setAddress(guest.address || '');
      setIdProofType(guest.idProofType || guest.id_proof_type || 'Aadhaar');
      setIdProofNumber('');
      setIsForeign(Boolean(guest.isForeign || guest.is_foreign));
      setNationality(guest.nationality || '');
      setVisaExpiry(guest.visaExpiry || guest.visa_expiry || '');
    }
  }, [guest]);

  const validate = () => {
    const errs = {};
    if (!name.trim()) {
      errs.name = 'Guest name is required.';
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (!/^\d{10}$/.test(cleanPhone)) {
      errs.phone = 'Enter a valid 10-digit mobile number.';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    if (idProofNumber.trim() && idProofNumber.trim().length < 4) {
      errs.idProofNumber = 'ID number must be at least 4 characters.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      const payload = {
        id: guestId,
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        email: email.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
        idProofType,
        isForeign: isForeign ? 1 : 0,
        nationality: isForeign ? (nationality.trim() || null) : null,
        visaExpiry: isForeign ? (visaExpiry || null) : null,
      };
      if (idProofNumber.trim()) {
        payload.idProofNumber = idProofNumber.trim();
      }

      await updateGuest.mutateAsync(payload);
      toast('Guest profile updated successfully.');
      onSaved?.();
      onClose();
    } catch (err) {
      toast(err.message || 'Failed to update guest profile.');
    }
  };

  const isFormDirty = Boolean(
    name !== (guest?.name || '') ||
    phone !== (guest?.phone || '') ||
    email !== (guest?.email || '') ||
    city !== (guest?.city || '') ||
    address !== (guest?.address || '') ||
    idProofNumber.trim() !== ''
  );

  return (
    <Sheet onClose={onClose} hasUnsavedChanges={isFormDirty}>
      <SheetHeader
        title={guest ? `Edit ${guest.name}` : 'Edit Guest Profile'}
        subtitle={guest?.phone ? `Mobile: ${guest.phone}` : 'Update personal details and identity'}
        onClose={onClose}
        hasUnsavedChanges={isFormDirty}
      />
      <View style={styles.body}>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            ℹ️ Updating contact and identity details saves to the guest master record. Historical bookings and stays are preserved.
          </Text>
        </View>

        {/* Full Name */}
        <View>
          <Text style={styles.label}>Full Name *</Text>
          <Input
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (formErrors.name) setFormErrors((p) => ({ ...p, name: null }));
            }}
            placeholder="Full Name"
          />
          {formErrors.name && <Text style={styles.err}>{formErrors.name}</Text>}
        </View>

        {/* Mobile Phone */}
        <View>
          <Text style={styles.label}>Mobile Number *</Text>
          <Input
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              if (formErrors.phone) setFormErrors((p) => ({ ...p, phone: null }));
            }}
            keyboardType="phone-pad"
            maxLength={10}
            placeholder="10-digit mobile"
          />
          {formErrors.phone && <Text style={styles.err}>{formErrors.phone}</Text>}
        </View>

        {/* Email */}
        <View>
          <Text style={styles.label}>Email Address</Text>
          <Input
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (formErrors.email) setFormErrors((p) => ({ ...p, email: null }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="guest@example.com"
          />
          {formErrors.email && <Text style={styles.err}>{formErrors.email}</Text>}
        </View>

        {/* City */}
        <View>
          <Text style={styles.label}>City / Location</Text>
          <Input
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Mumbai, Bangalore"
          />
        </View>

        {/* Address */}
        <View>
          <Text style={styles.label}>Full Address</Text>
          <Input
            value={address}
            onChangeText={setAddress}
            placeholder="Complete street address"
          />
        </View>

        {/* ID Proof Type */}
        <View>
          <Text style={styles.label}>ID Proof Type</Text>
          <View style={styles.idTypeRow}>
            {ID_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[styles.idChip, idProofType === type && styles.idChipActive]}
                onPress={() => setIdProofType(type)}
              >
                <Text style={[styles.idChipText, idProofType === type && styles.idChipTextActive]}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ID Proof Number */}
        <View>
          <Text style={styles.label}>
            ID Proof Number {guest?.id_proof_last4 ? `(Current: ••••${guest.id_proof_last4})` : ''}
          </Text>
          <Input
            value={idProofNumber}
            onChangeText={(text) => {
              setIdProofNumber(text);
              if (formErrors.idProofNumber) setFormErrors((p) => ({ ...p, idProofNumber: null }));
            }}
            placeholder="Enter ID number to update"
          />
          {formErrors.idProofNumber && <Text style={styles.err}>{formErrors.idProofNumber}</Text>}
        </View>

        {/* Foreign Guest Toggle */}
        <Pressable
          style={styles.checkRow}
          onPress={() => setIsForeign((prev) => !prev)}
        >
          <View style={[styles.checkbox, isForeign && styles.checkboxActive]}>
            {isForeign && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Foreign National Guest (Non-Indian Passport)</Text>
        </Pressable>

        {isForeign && (
          <View style={styles.foreignSection}>
            <View>
              <Text style={styles.label}>Nationality</Text>
              <Input
                value={nationality}
                onChangeText={setNationality}
                placeholder="Country of nationality"
              />
            </View>
            <View>
              <Text style={styles.label}>Visa Expiry Date (YYYY-MM-DD)</Text>
              <Input
                value={visaExpiry}
                onChangeText={setVisaExpiry}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
        )}

        <Button
          title={updateGuest.isPending ? 'Saving Profile…' : 'Save Details'}
          variant="primary"
          size="lg"
          loading={updateGuest.isPending}
          onPress={handleSave}
          style={{ marginTop: 8 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  notice: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 10,
  },
  noticeText: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading, marginBottom: 4 },
  err: { fontFamily: fonts.body, fontSize: 11.5, color: colors.danger, marginTop: 3 },
  idTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  idChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  idChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  idChipText: { fontFamily: fonts.bodySemibold, fontSize: 11.5, color: colors.textSecondary },
  idChipTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  checkLabel: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading },
  foreignSection: { gap: 12, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: colors.primaryLight },
});
