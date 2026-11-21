import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { useToast } from '../ToastContext.jsx';
import {
  buildWhatsAppMessage,
  buildCheckInWhatsAppMessage,
  cleanPhoneForWhatsApp,
} from '../../lib/whatsapp.js';
import { colors, fonts, radii } from '../../theme/theme';

export default function WhatsAppSheet({
  item,
  type = 'checkout', // 'checkin' | 'checkout'
  hotel,
  template,
  today,
  onClose,
}) {
  const toast = useToast();

  const isCheckin = type === 'checkin';
  const rawPhone = item?.whatsapp_phone || item?.guest_phone || '';
  const cleanPhone = cleanPhoneForWhatsApp(rawPhone);

  const initialMessage = isCheckin
    ? buildCheckInWhatsAppMessage(template, {
        guestName: item.guest_name,
        roomNo: item.room_no,
        checkinDate: item.check_in_date || today,
        checkinTime: item.check_in_time || '12:00 PM',
        checkoutDate: item.checkout_planned,
        checkoutTime: item.checkout_time || '12:00 PM',
        hotelName: hotel?.name,
        hotelPhone: hotel?.phone,
      })
    : buildWhatsAppMessage(template, {
        guestName: item.guest_name,
        roomNo: item.room_no,
        checkoutTime: item.checkout_time || '12:00 PM',
        checkoutDate: item.checkout_planned || today,
        hotelName: hotel?.name,
        hotelPhone: hotel?.phone,
        status: item.checkout_status_label,
      });

  const [message, setMessage] = useState(initialMessage);

  const handleOpenWhatsApp = async () => {
    if (!cleanPhone) {
      toast('Guest mobile number is missing or invalid.');
      return;
    }
    const encoded = encodeURIComponent(message.trim());
    const webUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
    const appUrl = `whatsapp://send?phone=${cleanPhone}&text=${encoded}`;

    try {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
      toast(`Opening WhatsApp for ${item.guest_name}…`);
      onClose();
    } catch {
      try {
        await Linking.openURL(webUrl);
        toast(`Opening WhatsApp for ${item.guest_name}…`);
        onClose();
      } catch (err) {
        toast('Could not open WhatsApp on this device.');
      }
    }
  };

  const handleResetToTemplate = () => {
    setMessage(initialMessage);
    toast('Message reset to template.');
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        badge={item.room_no ? `Room ${item.room_no}` : undefined}
        title={isCheckin ? 'Send Check-in WhatsApp' : 'Send Checkout WhatsApp'}
        subtitle={`${item.guest_name || 'Guest'} · ${item.room_type_name || ''}`}
        onClose={onClose}
      />
      <View style={styles.body}>
        {/* Guest Details Summary Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Guest Name</Text>
              <Text style={styles.infoVal}>{item.guest_name || 'Guest'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Room</Text>
              <Text style={styles.infoVal}>
                Room {item.room_no} <Text style={styles.mutedText}>({item.room_type_name})</Text>
              </Text>
            </View>
          </View>

          <View style={[styles.infoRow, { marginTop: 8 }]}>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>Mobile Number</Text>
              <Text style={[styles.infoVal, { fontFamily: fonts.mono }]}>
                {item.guest_phone || '—'}
              </Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.infoLabel}>{isCheckin ? 'Check-in Time' : 'Checkout Time'}</Text>
              <Text style={styles.infoVal}>
                {isCheckin ? item.check_in_time || '12:00 PM' : item.checkout_time || '12:00 PM'}
              </Text>
            </View>
          </View>
        </View>

        {/* Message Editor */}
        <View style={styles.editorSection}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>WhatsApp Message</Text>
            <Pressable onPress={handleResetToTemplate} hitSlop={6}>
              <Text style={styles.resetBtnText}>Reset to Template</Text>
            </Pressable>
          </View>

          <TextInput
            multiline
            numberOfLines={6}
            value={message}
            onChangeText={setMessage}
            style={styles.messageInput}
            textAlignVertical="top"
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Button
            title="💬 Send via WhatsApp"
            variant="primary"
            size="md"
            onPress={handleOpenWhatsApp}
            disabled={!cleanPhone || !message.trim()}
            style={{ flex: 1.2 }}
          />
          <Button
            title="Cancel"
            variant="outline"
            size="md"
            onPress={onClose}
            style={{ flex: 0.8 }}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  infoVal: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.heading,
  },
  mutedText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
  },
  editorSection: {
    marginBottom: 16,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  editorTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.heading,
  },
  resetBtnText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 12,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  messageInput: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 10,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    minHeight: 120,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
