import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { FormErrorBanner, FormField, Input } from '../ui/Field.jsx';
import Button from '../ui/Button.jsx';
import { useGuest, useUpdateGuest, useDeleteGuest } from '../../api/guests';
import { useToast } from '../ToastContext.jsx';
import { useFormValidation, isValidEmail, validatePhone, isValidPhone, handlePhoneInputChange } from '../../lib/validation';
import { colors, fonts, radii } from '../../theme/theme';

const ID_TYPES = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport', 'Other'];

export default function GuestEditSheet({ guestId, onClose, onSaved, onDeleted, onViewBooking }) {
  const { data: guest, isLoading } = useGuest(guestId);
  const updateGuest = useUpdateGuest();
  const deleteGuest = useDeleteGuest();
  const toast = useToast();
  const [deletingGuest, setDeletingGuest] = useState(false);
  const scrollRef = useRef(null);

  const {
    errors,
    formError,
    clearError,
    setError,
    registerInput,
    registerContainer,
    registerLayout,
    handleBackendError,
    validate,
  } = useFormValidation({
    scrollRef,
    fieldOrder: [
      'name',
      'phone',
      'email',
      'idProofNumber',
      'city',
      'address',
      'nationality',
      'visaExpiry',
    ],
  });

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

  const handleSave = async () => {
    const isValid = validate(() => {
      const errs = {};
      if (!name.trim()) {
        errs.name = 'Guest name is required.';
      }
      const phoneValidation = validatePhone(phone);
      if (!phoneValidation.isValid) {
        errs.phone = phoneValidation.error;
      }
      if (email.trim() && !isValidEmail(email)) {
        errs.email = 'Please enter a valid email address.';
      }
      if (idProofNumber.trim() && idProofNumber.trim().length < 4) {
        errs.idProofNumber = 'ID number must be at least 4 characters.';
      }
      if (isForeign && !nationality.trim()) {
        errs.nationality = 'Nationality is required for foreign guests.';
      }
      return errs;
    });

    if (!isValid) return;

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
      handleBackendError(err);
    }
  };

  const handleDelete = () => {
    if (!guest || deletingGuest) return;
    Alert.alert(
      'Delete Guest',
      `Are you sure you want to delete ${guest.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingGuest(true);
            try {
              await deleteGuest.mutateAsync(guestId);
              toast(`Guest ${guest.name} deleted.`);
              onDeleted ? onDeleted() : onClose();
            } catch (e) {
              const msg = e.message || 'Cannot delete guest.';
              toast(msg);
              const bookingId = e.fields?.bookingId;
              const buttons = [{ text: 'OK', style: 'cancel' }];
              if (bookingId && onViewBooking) {
                buttons.push({
                  text: 'View Booking',
                  onPress: () => {
                    onClose();
                    onViewBooking(Number(bookingId));
                  },
                });
              }
              Alert.alert('Cannot Delete Guest', msg, buttons);
            } finally {
              setDeletingGuest(false);
            }
          },
        },
      ]
    );
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
    <Sheet onClose={onClose} hasUnsavedChanges={isFormDirty} scrollRef={scrollRef}>
      <SheetHeader
        title={guest ? `Edit ${guest.name}` : 'Edit Guest Profile'}
        subtitle={guest?.phone ? `Mobile: ${guest.phone}` : 'Update personal details and identity'}
        onClose={onClose}
        hasUnsavedChanges={isFormDirty}
      />
      <View style={styles.body}>
        <FormErrorBanner message={formError} />

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            ℹ️ Updating contact and identity details saves to the guest master record. Historical bookings and stays are preserved.
          </Text>
        </View>

        {/* Full Name */}
        <FormField
          ref={registerContainer('name')}
          onLayout={registerLayout('name')}
          label="Full Name"
          required
          error={errors.name}
        >
          <Input
            ref={registerInput('name')}
            value={name}
            onChangeText={(text) => {
              setName(text);
              clearError('name');
            }}
            placeholder="Full Name"
            error={errors.name}
          />
        </FormField>

        {/* Mobile Phone */}
        <FormField
          ref={registerContainer('phone')}
          onLayout={registerLayout('phone')}
          label="Mobile Number"
          required
          error={errors.phone}
        >
          <Input
            ref={registerInput('phone')}
            value={phone}
            onChangeText={(text) => {
              const res = handlePhoneInputChange(text, phone);
              setPhone(res.value);
              if (res.error) {
                setError('phone', res.error);
              } else {
                clearError('phone');
              }
            }}
            keyboardType="phone-pad"
            maxLength={10}
            placeholder="10-digit mobile (starts with 6-9)"
            error={errors.phone}
          />
        </FormField>

        {/* Email */}
        <FormField
          ref={registerContainer('email')}
          onLayout={registerLayout('email')}
          label="Email Address"
          error={errors.email}
        >
          <Input
            ref={registerInput('email')}
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              clearError('email');
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="guest@example.com"
            error={errors.email}
          />
        </FormField>

        {/* City */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>City / Location</Text>
          <Input
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Mumbai, Bangalore"
          />
        </View>

        {/* Address */}
        <View style={styles.fieldWrap}>
          <Text style={styles.label}>Full Address</Text>
          <Input
            value={address}
            onChangeText={setAddress}
            placeholder="Complete street address"
          />
        </View>

        {/* ID Proof Type */}
        <View style={styles.fieldWrap}>
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
        <FormField
          ref={registerContainer('idProofNumber')}
          onLayout={registerLayout('idProofNumber')}
          label={`ID Proof Number ${guest?.id_proof_last4 ? `(Current: ••••${guest.id_proof_last4})` : ''}`}
          error={errors.idProofNumber}
        >
          <Input
            ref={registerInput('idProofNumber')}
            value={idProofNumber}
            onChangeText={(text) => {
              setIdProofNumber(text);
              clearError('idProofNumber');
            }}
            placeholder="Enter ID number to update"
            error={errors.idProofNumber}
          />
        </FormField>

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
            <FormField
              ref={registerContainer('nationality')}
              onLayout={registerLayout('nationality')}
              label="Nationality"
              required
              error={errors.nationality}
            >
              <Input
                ref={registerInput('nationality')}
                value={nationality}
                onChangeText={(text) => {
                  setNationality(text);
                  clearError('nationality');
                }}
                placeholder="Country of nationality"
                error={errors.nationality}
              />
            </FormField>

            <FormField
              ref={registerContainer('visaExpiry')}
              onLayout={registerLayout('visaExpiry')}
              label="Visa Expiry Date (YYYY-MM-DD)"
              error={errors.visaExpiry}
            >
              <Input
                ref={registerInput('visaExpiry')}
                value={visaExpiry}
                onChangeText={(text) => {
                  setVisaExpiry(text);
                  clearError('visaExpiry');
                }}
                placeholder="YYYY-MM-DD"
                error={errors.visaExpiry}
              />
            </FormField>
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

        <Button
          title={deletingGuest ? 'Deleting Guest…' : 'Delete Guest Profile'}
          variant="danger"
          size="lg"
          loading={deletingGuest}
          disabled={updateGuest.isPending || deletingGuest || deleteGuest.isPending}
          onPress={handleDelete}
          style={{ marginTop: 4 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 14 },
  fieldWrap: { gap: 4, marginBottom: 2 },
  notice: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 10,
  },
  noticeText: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.heading, marginBottom: 4 },
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
  foreignSection: { gap: 12, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: colors.primaryLight, marginTop: 4 },
});
