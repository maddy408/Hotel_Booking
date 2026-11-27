import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Segmented, FieldError, FormErrorBanner } from '../../components/ui/Field.jsx';
import {
  useSettings,
  useUpdateHotel,
  useUpdateCheckoutHour,
  useUpdateGst,
  useUpdatePolicies,
  useUpdateWhatsapp,
} from '../../api/settings';
import { useToast } from '../../components/ToastContext.jsx';
import { formatCheckoutHour, inr } from '../../lib/format';
import { useFormValidation, isFilled, isValidEmail, isValidPhone } from '../../lib/validation.js';
import { colors, fonts, radii } from '../../theme/theme';

import BackButton from '../../components/ui/BackButton.jsx';

export function validatePhoneNumber(phone) {
  if (phone === null || phone === undefined || String(phone).trim() === '') {
    return 'Phone number is required.';
  }
  const str = String(phone).trim();

  let cleaned = str;
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3).trim();
  } else if (cleaned.startsWith('+')) {
    return 'Only Indian mobile numbers (+91) are supported.';
  }

  if (/[^\d\s\-]/.test(cleaned)) {
    return 'Only numeric digits are allowed.';
  }

  const digits = cleaned.replace(/\D/g, '');

  let normalized = digits;
  if (normalized.length === 12 && normalized.startsWith('91')) {
    normalized = normalized.slice(2);
  } else if (normalized.length === 11 && normalized.startsWith('0')) {
    normalized = normalized.slice(1);
  }

  if (normalized.length === 0) {
    return 'Phone number is required.';
  }

  if (!/^[6-9]/.test(normalized)) {
    return 'Indian mobile numbers must start with 6, 7, 8, or 9.';
  }

  if (normalized.length !== 10) {
    return 'Mobile number must be exactly 10 digits.';
  }

  return null;
}

export function validateEmailAddress(email) {
  if (email === null || email === undefined || String(email).trim() === '') {
    return 'Email address is required.';
  }
  const str = String(email);

  if (/\s/.test(str)) {
    return 'Email address cannot contain spaces.';
  }

  const trimmed = str.trim();
  if (!trimmed.includes('@') || trimmed.startsWith('@') || trimmed.endsWith('@')) {
    return 'Please enter a valid email address (example: user@example.com).';
  }

  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return 'Please enter a valid email address (example: user@example.com).';
  }

  const domain = parts[1];
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return 'Please enter a complete email domain (example: user@example.com).';
  }

  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) {
    return 'Email domain extension must be at least 2 characters.';
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Please enter a valid email address (example: user@example.com).';
  }

  return null;
}

export default function SettingsScreen({ navigation }) {
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
  const [isEditingGst, setIsEditingGst] = useState(false);
  const [gstDraft, setGstDraft] = useState({
    gstSlab1MaxRate: '7500.00',
    gstSlab1GstRate: '5',
    gstSlab2GstRate: '18',
  });
  const [extraChargesOpen, setExtraChargesOpen] = useState(false);
  const [extraGst, setExtraGst] = useState({
    extraFoodGstRate: '5',
    extraLaundryGstRate: '18',
    extraBedGstRate: '5',
    extraTaxiGstRate: '5',
    extraOtherGstRate: '18',
  });
  const [policies, setPolicies] = useState({
    cancellationRefundPercentage: '100',
    freeCancellationHours: '24',
    earlyCheckoutFeePerNight: '0',
  });
  const [whatsapp, setWhatsapp] = useState({
    whatsappCheckinEnabled: true,
  });

  const {
    errors,
    validate,
    clearError,
    setBackendErrors,
    registerRef,
    registerLayout,
    scrollRef,
    unmappedError,
  } = useFormValidation([
    'hotelName',
    'hotelPhone',
    'hotelEmail',
    'checkoutHour',
    'gstSlab1GstRate',
    'gstSlab1MaxRate',
    'gstSlab2GstRate',
    'extraFoodGstRate',
    'extraLaundryGstRate',
    'extraBedGstRate',
    'extraTaxiGstRate',
    'extraOtherGstRate',
    'cancellationRefundPercentage',
    'freeCancellationHours',
  ]);

  const initializedRef = useRef(false);
  useEffect(() => {
    if (data && !initializedRef.current) {
      initializedRef.current = true;
      if (data.hotel) {
        setHotel({
          name: data.hotel.name || '',
          phone: data.hotel.phone || '',
          email: data.hotel.email || '',
          address: data.hotel.address || '',
          timezone: data.hotel.timezone || 'Asia/Kolkata',
        });
      }
      if (data.settings) {
        setCheckoutHour(String(data.settings.checkout_hour ?? 12));
        const s1Max = String(data.settings.gst_slab1_max_rate ?? '7500.00');
        const s1Rate = String(Math.round(Number(data.settings.gst_slab1_gst_rate ?? 0.05) * 100));
        const s2Max = String(data.settings.gst_slab2_max_rate ?? '7500.00');
        const s2Rate = String(Math.round(Number(data.settings.gst_slab2_gst_rate ?? 0.18) * 100));
        const s3Rate = String(Math.round(Number(data.settings.gst_slab3_gst_rate ?? 0.18) * 100));

        setGst({
          gstSlab1MaxRate: s1Max,
          gstSlab1GstRate: s1Rate,
          gstSlab2MaxRate: s2Max,
          gstSlab2GstRate: s2Rate,
          gstSlab3GstRate: s3Rate,
        });
        setGstDraft({
          gstSlab1MaxRate: s1Max,
          gstSlab1GstRate: s1Rate,
          gstSlab2GstRate: s2Rate,
        });
        setExtraGst({
          extraFoodGstRate: String(Math.round(Number(data.settings.extra_food_gst_rate ?? 0.05) * 100)),
          extraLaundryGstRate: String(Math.round(Number(data.settings.extra_laundry_gst_rate ?? 0.18) * 100)),
          extraBedGstRate: String(Math.round(Number(data.settings.extra_bed_gst_rate ?? 0.05) * 100)),
          extraTaxiGstRate: String(Math.round(Number(data.settings.extra_taxi_gst_rate ?? 0.05) * 100)),
          extraOtherGstRate: String(Math.round(Number(data.settings.extra_other_gst_rate ?? 0.18) * 100)),
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
    }
  }, [data]);

  // Sync loaded settings on background refetch when user is not actively editing GST
  useEffect(() => {
    if (data?.settings && !isEditingGst && initializedRef.current) {
      const s1Max = String(data.settings.gst_slab1_max_rate ?? '7500.00');
      const s1Rate = String(Math.round(Number(data.settings.gst_slab1_gst_rate ?? 0.05) * 100));
      const s2Max = String(data.settings.gst_slab2_max_rate ?? '7500.00');
      const s2Rate = String(Math.round(Number(data.settings.gst_slab2_gst_rate ?? 0.18) * 100));
      const s3Rate = String(Math.round(Number(data.settings.gst_slab3_gst_rate ?? 0.18) * 100));

      setGst({
        gstSlab1MaxRate: s1Max,
        gstSlab1GstRate: s1Rate,
        gstSlab2MaxRate: s2Max,
        gstSlab2GstRate: s2Rate,
        gstSlab3GstRate: s3Rate,
      });
      setExtraGst({
        extraFoodGstRate: String(Math.round(Number(data.settings.extra_food_gst_rate ?? 0.05) * 100)),
        extraLaundryGstRate: String(Math.round(Number(data.settings.extra_laundry_gst_rate ?? 0.18) * 100)),
        extraBedGstRate: String(Math.round(Number(data.settings.extra_bed_gst_rate ?? 0.05) * 100)),
        extraTaxiGstRate: String(Math.round(Number(data.settings.extra_taxi_gst_rate ?? 0.05) * 100)),
        extraOtherGstRate: String(Math.round(Number(data.settings.extra_other_gst_rate ?? 0.18) * 100)),
      });
    }
  }, [data?.settings, isEditingGst]);

  const isDirty = Boolean(
    data && (
      hotel.name !== (data.hotel?.name || '') ||
      hotel.phone !== (data.hotel?.phone || '') ||
      hotel.email !== (data.hotel?.email || '') ||
      hotel.address !== (data.hotel?.address || '') ||
      checkoutHour !== String(data.settings?.checkout_hour ?? 12) ||
      (isEditingGst && (
        gstDraft.gstSlab1MaxRate !== gst.gstSlab1MaxRate ||
        gstDraft.gstSlab1GstRate !== gst.gstSlab1GstRate ||
        gstDraft.gstSlab2GstRate !== gst.gstSlab2GstRate
      ))
    )
  );

  const prevDirtyRef = useRef(false);
  useEffect(() => {
    if (prevDirtyRef.current !== isDirty) {
      prevDirtyRef.current = isDirty;
      navigation?.setOptions?.({
        headerLeft: () => <BackButton fallbackRoute="MoreMenu" hasUnsavedChanges={isDirty} />,
      });
    }
  }, [navigation, isDirty]);

  const handleOpenEditGst = () => {
    setGstDraft({
      gstSlab1MaxRate: gst.gstSlab1MaxRate,
      gstSlab1GstRate: gst.gstSlab1GstRate,
      gstSlab2GstRate: gst.gstSlab2GstRate,
    });
    clearError('gstSlab1MaxRate');
    clearError('gstSlab1GstRate');
    clearError('gstSlab2GstRate');
    setIsEditingGst(true);
  };

  const handleCancelEditGst = () => {
    clearError('gstSlab1MaxRate');
    clearError('gstSlab1GstRate');
    clearError('gstSlab2GstRate');
    setGstDraft({
      gstSlab1MaxRate: gst.gstSlab1MaxRate,
      gstSlab1GstRate: gst.gstSlab1GstRate,
      gstSlab2GstRate: gst.gstSlab2GstRate,
    });
    setIsEditingGst(false);
  };

  const handleSaveGst = async () => {
    const isValid = validate({
      gstSlab1MaxRate: () => {
        if (!isFilled(gstDraft.gstSlab1MaxRate)) return 'Slab 1 threshold is required.';
        const num = Number(gstDraft.gstSlab1MaxRate);
        if (isNaN(num) || num <= 0) return 'Please enter a valid threshold amount.';
        return null;
      },
      gstSlab1GstRate: () => {
        if (!isFilled(gstDraft.gstSlab1GstRate)) return 'Slab 1 GST percentage is required.';
        const num = Number(gstDraft.gstSlab1GstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST percentage must be between 0 and 100%.';
        return null;
      },
      gstSlab2GstRate: () => {
        if (!isFilled(gstDraft.gstSlab2GstRate)) return 'Slab 2 GST percentage is required.';
        const num = Number(gstDraft.gstSlab2GstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST percentage must be between 0 and 100%.';
        return null;
      },
    });
    if (!isValid) return;

    try {
      const threshold = gstDraft.gstSlab1MaxRate;
      const s1Rate = gstDraft.gstSlab1GstRate;
      const s2Rate = gstDraft.gstSlab2GstRate;

      await updateGst.mutateAsync({
        gstSlab1MaxRate: threshold,
        gstSlab1GstRate: Number(s1Rate) / 100,
        gstSlab2MaxRate: threshold,
        gstSlab2GstRate: Number(s2Rate) / 100,
        gstSlab3GstRate: Number(s2Rate) / 100,
        taxExtras: true,
        extraFoodGstRate: Number(extraGst.extraFoodGstRate ?? 5) / 100,
        extraLaundryGstRate: Number(extraGst.extraLaundryGstRate ?? 18) / 100,
        extraBedGstRate: Number(extraGst.extraBedGstRate ?? 5) / 100,
        extraTaxiGstRate: Number(extraGst.extraTaxiGstRate ?? 5) / 100,
        extraOtherGstRate: Number(extraGst.extraOtherGstRate ?? 18) / 100,
      });

      setGst({
        gstSlab1MaxRate: threshold,
        gstSlab1GstRate: s1Rate,
        gstSlab2MaxRate: threshold,
        gstSlab2GstRate: s2Rate,
        gstSlab3GstRate: s2Rate,
      });
      setIsEditingGst(false);
      toast('GST rates updated successfully.');
    } catch (e) {
      const { unmapped } = setBackendErrors(e);
      if (unmapped) toast(unmapped);
    }
  };

  const handleSaveExtraGst = async () => {
    const isValid = validate({
      extraFoodGstRate: () => {
        if (!isFilled(extraGst.extraFoodGstRate)) return 'Food & Beverage GST rate is required.';
        const num = Number(extraGst.extraFoodGstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST rate must be between 0 and 100%.';
        return null;
      },
      extraLaundryGstRate: () => {
        if (!isFilled(extraGst.extraLaundryGstRate)) return 'Laundry GST rate is required.';
        const num = Number(extraGst.extraLaundryGstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST rate must be between 0 and 100%.';
        return null;
      },
      extraBedGstRate: () => {
        if (!isFilled(extraGst.extraBedGstRate)) return 'Extra Bed GST rate is required.';
        const num = Number(extraGst.extraBedGstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST rate must be between 0 and 100%.';
        return null;
      },
      extraTaxiGstRate: () => {
        if (!isFilled(extraGst.extraTaxiGstRate)) return 'Taxi & Travel GST rate is required.';
        const num = Number(extraGst.extraTaxiGstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST rate must be between 0 and 100%.';
        return null;
      },
      extraOtherGstRate: () => {
        if (!isFilled(extraGst.extraOtherGstRate)) return 'Other Services GST rate is required.';
        const num = Number(extraGst.extraOtherGstRate);
        if (isNaN(num) || num < 0 || num > 100) return 'GST rate must be between 0 and 100%.';
        return null;
      },
    });
    if (!isValid) return;

    try {
      await updateGst.mutateAsync({
        gstSlab1MaxRate: gst.gstSlab1MaxRate,
        gstSlab1GstRate: Number(gst.gstSlab1GstRate) / 100,
        gstSlab2MaxRate: gst.gstSlab2MaxRate,
        gstSlab2GstRate: Number(gst.gstSlab2GstRate) / 100,
        gstSlab3GstRate: Number(gst.gstSlab3GstRate) / 100,
        taxExtras: true,
        extraFoodGstRate: Number(extraGst.extraFoodGstRate) / 100,
        extraLaundryGstRate: Number(extraGst.extraLaundryGstRate) / 100,
        extraBedGstRate: Number(extraGst.extraBedGstRate) / 100,
        extraTaxiGstRate: Number(extraGst.extraTaxiGstRate) / 100,
        extraOtherGstRate: Number(extraGst.extraOtherGstRate) / 100,
      });
      toast('Extra charges GST updated successfully.');
    } catch (e) {
      const { unmapped } = setBackendErrors(e);
      if (unmapped) toast(unmapped);
    }
  };

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;

  return (
    <Screen scrollRef={scrollRef} onRefresh={refetch}>
      <FormErrorBanner error={unmappedError} />

      {/* 1. HOTEL DETAILS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hotel Details</Text>
        
        <View onLayout={registerLayout('hotelName')} style={{ marginBottom: 8 }}>
          <Text style={styles.label}>Hotel Name *</Text>
          <Input
            ref={registerRef('hotelName')}
            error={Boolean(errors.hotelName)}
            placeholder="Hotel name"
            value={hotel.name}
            onChangeText={(v) => {
              clearError('hotelName');
              setHotel((p) => ({ ...p, name: v }));
            }}
          />
          <FieldError error={errors.hotelName}>{errors.hotelName}</FieldError>
        </View>

        <View onLayout={registerLayout('hotelPhone')} style={{ marginBottom: 8 }}>
          <Text style={styles.label}>Phone Number</Text>
          <Input
            ref={registerRef('hotelPhone')}
            error={Boolean(errors.hotelPhone)}
            placeholder="Phone"
            keyboardType="phone-pad"
            value={hotel.phone}
            onChangeText={(v) => {
              setHotel((p) => ({ ...p, phone: v }));
              const hasInvalidChars = /[^\d\s+\-]/.test(v) || (v.includes('+') && !v.startsWith('+'));
              if (hasInvalidChars) {
                setError('hotelPhone', 'Only numeric digits are allowed.');
                return;
              }
              if (errors.hotelPhone) {
                const err = validatePhoneNumber(v);
                if (!err) {
                  clearError('hotelPhone');
                } else {
                  setError('hotelPhone', err);
                }
              }
            }}
            onBlur={() => {
              const err = validatePhoneNumber(hotel.phone);
              if (err) {
                setError('hotelPhone', err);
              } else {
                clearError('hotelPhone');
              }
            }}
          />
          <FieldError error={errors.hotelPhone}>{errors.hotelPhone}</FieldError>
        </View>

        <View onLayout={registerLayout('hotelEmail')} style={{ marginBottom: 8 }}>
          <Text style={styles.label}>Email Address</Text>
          <Input
            ref={registerRef('hotelEmail')}
            error={Boolean(errors.hotelEmail)}
            placeholder="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={hotel.email}
            onChangeText={(v) => {
              setHotel((p) => ({ ...p, email: v }));
              if (/\s/.test(v)) {
                setError('hotelEmail', 'Email address cannot contain spaces.');
                return;
              }
              if (errors.hotelEmail) {
                const err = validateEmailAddress(v);
                if (!err) {
                  clearError('hotelEmail');
                }
              }
            }}
            onBlur={() => {
              const err = validateEmailAddress(hotel.email);
              if (err) {
                setError('hotelEmail', err);
              } else {
                clearError('hotelEmail');
              }
            }}
          />
          <FieldError error={errors.hotelEmail}>{errors.hotelEmail}</FieldError>
        </View>

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
            const isValid = validate({
              hotelName: () => (!isFilled(hotel.name) ? 'Hotel name is required.' : null),
              hotelPhone: () => validatePhoneNumber(hotel.phone),
              hotelEmail: () => validateEmailAddress(hotel.email),
            });
            if (!isValid) return;

            try {
              await updateHotel.mutateAsync(hotel);
              toast('Hotel profile updated successfully.');
            } catch (e) {
              const { unmapped } = setBackendErrors(e);
              if (unmapped) toast(unmapped);
            }
          }}
        />
      </View>

      {/* 2. CHECKOUT TIME */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Standard Checkout Time</Text>
        <Text style={styles.meta}>Current daily checkout rule: {formatCheckoutHour(Number(checkoutHour))}</Text>
        
        <View onLayout={registerLayout('checkoutHour')} style={{ marginVertical: 8 }}>
          <Text style={styles.label}>Checkout Hour (0 to 23)</Text>
          <Input
            ref={registerRef('checkoutHour')}
            error={Boolean(errors.checkoutHour)}
            placeholder="0-23 (e.g. 11 or 12)"
            keyboardType="numeric"
            value={checkoutHour}
            onChangeText={(v) => {
              clearError('checkoutHour');
              setCheckoutHour(v);
            }}
          />
          <FieldError error={errors.checkoutHour} />
        </View>

        <Button
          title="Save Checkout Time"
          variant="outline"
          size="sm"
          loading={updateCheckoutHour.isPending}
          onPress={async () => {
            const isValid = validate({
              checkoutHour: () => {
                if (!isFilled(checkoutHour)) return 'Checkout hour is required.';
                const num = Number(checkoutHour);
                if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 23) {
                  return 'Checkout hour must be a whole number between 0 and 23.';
                }
                return null;
              },
            });
            if (!isValid) return;

            try {
              await updateCheckoutHour.mutateAsync({ checkoutHour: Number(checkoutHour) });
              toast('Checkout hour updated.');
            } catch (e) {
              const { unmapped } = setBackendErrors(e);
              if (unmapped) toast(unmapped);
            }
          }}
        />
      </View>

      {/* 3. GST TAX SETTINGS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GST Tax Settings</Text>
        <Text style={styles.meta}>Configure government GST percentages for room tariffs</Text>

        {/* Compact Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryItem}>
            Room GST Slab 1: Up to {inr(gst.gstSlab1MaxRate || 7500)}/night — {gst.gstSlab1GstRate}%
          </Text>
          <Text style={[styles.summaryItem, { marginTop: 4 }]}>
            Room GST Slab 2: Above {inr(gst.gstSlab1MaxRate || 7500)}/night — {gst.gstSlab2GstRate}%
          </Text>
        </View>

        {!isEditingGst ? (
          <Button
            title="Edit GST Settings"
            variant="outline"
            size="sm"
            onPress={handleOpenEditGst}
          />
        ) : (
          <View style={styles.editForm}>
            <View onLayout={registerLayout('gstSlab1MaxRate')} style={{ marginBottom: 8 }}>
              <Text style={styles.label}>Slab 1 threshold (₹ per night) *</Text>
              <Input
                ref={registerRef('gstSlab1MaxRate')}
                error={Boolean(errors.gstSlab1MaxRate)}
                keyboardType="numeric"
                placeholder="e.g. 7500"
                value={gstDraft.gstSlab1MaxRate}
                onChangeText={(v) => {
                  clearError('gstSlab1MaxRate');
                  setGstDraft((p) => ({ ...p, gstSlab1MaxRate: v }));
                }}
              />
              <FieldError error={errors.gstSlab1MaxRate} />
            </View>

            <View onLayout={registerLayout('gstSlab1GstRate')} style={{ marginBottom: 8 }}>
              <Text style={styles.label}>Slab 1 GST percentage *</Text>
              <Input
                ref={registerRef('gstSlab1GstRate')}
                error={Boolean(errors.gstSlab1GstRate)}
                keyboardType="numeric"
                placeholder="e.g. 5"
                value={gstDraft.gstSlab1GstRate}
                onChangeText={(v) => {
                  clearError('gstSlab1GstRate');
                  setGstDraft((p) => ({ ...p, gstSlab1GstRate: v }));
                }}
              />
              <FieldError error={errors.gstSlab1GstRate} />
            </View>

            <View onLayout={registerLayout('gstSlab2GstRate')} style={{ marginBottom: 12 }}>
              <Text style={styles.label}>Slab 2 GST percentage *</Text>
              <Input
                ref={registerRef('gstSlab2GstRate')}
                error={Boolean(errors.gstSlab2GstRate)}
                keyboardType="numeric"
                placeholder="e.g. 18"
                value={gstDraft.gstSlab2GstRate}
                onChangeText={(v) => {
                  clearError('gstSlab2GstRate');
                  setGstDraft((p) => ({ ...p, gstSlab2GstRate: v }));
                }}
              />
              <FieldError error={errors.gstSlab2GstRate} />
            </View>

            <View style={styles.buttonRow}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Save GST Settings"
                  variant="primary"
                  size="sm"
                  loading={updateGst.isPending}
                  onPress={handleSaveGst}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="outline"
                  size="sm"
                  disabled={updateGst.isPending}
                  onPress={handleCancelEditGst}
                />
              </View>
            </View>
          </View>
        )}

        {/* 4. EXTRA CHARGES GST COLLAPSIBLE SECTION */}
        <View style={styles.collapsibleContainer}>
          <Pressable
            style={styles.collapsibleHeader}
            onPress={() => setExtraChargesOpen((p) => !p)}
            accessibilityRole="button"
            accessibilityLabel="Extra Charges GST"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.collapsibleTitle}>Extra Charges GST</Text>
              <Text style={styles.collapsibleMeta}>Food & Beverage, Laundry, Extra Bed, Taxi, Other</Text>
            </View>
            <Text style={styles.chevron}>{extraChargesOpen ? '▲' : '▼'}</Text>
          </Pressable>

          {extraChargesOpen && (
            <View style={styles.collapsibleContent}>
              <View onLayout={registerLayout('extraFoodGstRate')} style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Food & Beverage</Text>
                <Input
                  ref={registerRef('extraFoodGstRate')}
                  error={Boolean(errors.extraFoodGstRate)}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  value={extraGst.extraFoodGstRate}
                  onChangeText={(v) => {
                    clearError('extraFoodGstRate');
                    setExtraGst((p) => ({ ...p, extraFoodGstRate: v }));
                  }}
                />
                <FieldError error={errors.extraFoodGstRate} />
              </View>

              <View onLayout={registerLayout('extraLaundryGstRate')} style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Laundry</Text>
                <Input
                  ref={registerRef('extraLaundryGstRate')}
                  error={Boolean(errors.extraLaundryGstRate)}
                  keyboardType="numeric"
                  placeholder="e.g. 18"
                  value={extraGst.extraLaundryGstRate}
                  onChangeText={(v) => {
                    clearError('extraLaundryGstRate');
                    setExtraGst((p) => ({ ...p, extraLaundryGstRate: v }));
                  }}
                />
                <FieldError error={errors.extraLaundryGstRate} />
              </View>

              <View onLayout={registerLayout('extraBedGstRate')} style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Extra Bed</Text>
                <Input
                  ref={registerRef('extraBedGstRate')}
                  error={Boolean(errors.extraBedGstRate)}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  value={extraGst.extraBedGstRate}
                  onChangeText={(v) => {
                    clearError('extraBedGstRate');
                    setExtraGst((p) => ({ ...p, extraBedGstRate: v }));
                  }}
                />
                <FieldError error={errors.extraBedGstRate} />
              </View>

              <View onLayout={registerLayout('extraTaxiGstRate')} style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Taxi & Travel</Text>
                <Input
                  ref={registerRef('extraTaxiGstRate')}
                  error={Boolean(errors.extraTaxiGstRate)}
                  keyboardType="numeric"
                  placeholder="e.g. 5"
                  value={extraGst.extraTaxiGstRate}
                  onChangeText={(v) => {
                    clearError('extraTaxiGstRate');
                    setExtraGst((p) => ({ ...p, extraTaxiGstRate: v }));
                  }}
                />
                <FieldError error={errors.extraTaxiGstRate} />
              </View>

              <View onLayout={registerLayout('extraOtherGstRate')} style={{ marginBottom: 12 }}>
                <Text style={styles.label}>Other Services</Text>
                <Input
                  ref={registerRef('extraOtherGstRate')}
                  error={Boolean(errors.extraOtherGstRate)}
                  keyboardType="numeric"
                  placeholder="e.g. 18"
                  value={extraGst.extraOtherGstRate}
                  onChangeText={(v) => {
                    clearError('extraOtherGstRate');
                    setExtraGst((p) => ({ ...p, extraOtherGstRate: v }));
                  }}
                />
                <FieldError error={errors.extraOtherGstRate} />
              </View>

              <Button
                title="Save Extra Charges GST"
                variant="outline"
                size="sm"
                loading={updateGst.isPending}
                onPress={handleSaveExtraGst}
              />
            </View>
          )}
        </View>
      </View>

      {/* 4. CANCELLATION POLICIES */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Policies & Cancellation</Text>
        
        <View onLayout={registerLayout('cancellationRefundPercentage')} style={{ marginBottom: 8 }}>
          <Text style={styles.label}>Cancellation Refund Percentage (%)</Text>
          <Input
            ref={registerRef('cancellationRefundPercentage')}
            error={Boolean(errors.cancellationRefundPercentage)}
            keyboardType="numeric"
            value={policies.cancellationRefundPercentage}
            onChangeText={(v) => {
              clearError('cancellationRefundPercentage');
              setPolicies((p) => ({ ...p, cancellationRefundPercentage: v }));
            }}
          />
          <FieldError error={errors.cancellationRefundPercentage} />
        </View>

        <View onLayout={registerLayout('freeCancellationHours')} style={{ marginBottom: 12 }}>
          <Text style={styles.label}>Free Cancellation Window (Hours)</Text>
          <Input
            ref={registerRef('freeCancellationHours')}
            error={Boolean(errors.freeCancellationHours)}
            keyboardType="numeric"
            value={policies.freeCancellationHours}
            onChangeText={(v) => {
              clearError('freeCancellationHours');
              setPolicies((p) => ({ ...p, freeCancellationHours: v }));
            }}
          />
          <FieldError error={errors.freeCancellationHours} />
        </View>

        <Button
          title="Save Policies"
          variant="outline"
          size="sm"
          loading={updatePolicies.isPending}
          onPress={async () => {
            const isValid = validate({
              cancellationRefundPercentage: () => {
                if (!isFilled(policies.cancellationRefundPercentage)) return 'Cancellation refund percentage is required.';
                const num = Number(policies.cancellationRefundPercentage);
                if (isNaN(num) || num < 0 || num > 100) return 'Refund percentage must be between 0 and 100.';
                return null;
              },
              freeCancellationHours: () => {
                if (!isFilled(policies.freeCancellationHours)) return 'Free cancellation window is required.';
                const num = Number(policies.freeCancellationHours);
                if (isNaN(num) || num < 0) return 'Free cancellation window must be 0 or more hours.';
                return null;
              },
            });
            if (!isValid) return;

            try {
              await updatePolicies.mutateAsync({
                cancellationRefundPercentage: Number(policies.cancellationRefundPercentage),
                freeCancellationHours: Number(policies.freeCancellationHours),
                earlyCheckoutFeePerNight: Number(policies.earlyCheckoutFeePerNight),
              });
              toast('Policies updated successfully.');
            } catch (e) {
              const { unmapped } = setBackendErrors(e);
              if (unmapped) toast(unmapped);
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
  summaryBox: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  summaryItem: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12.5,
    color: colors.heading,
  },
  editForm: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  collapsibleContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  collapsibleTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13.5,
    color: colors.heading,
  },
  collapsibleMeta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  collapsibleContent: {
    marginTop: 10,
  },
});
