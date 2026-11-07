export function buildWhatsAppMessage(template, { guestName, roomNo, checkoutTime, checkoutDate, hotelName, hotelPhone, status }) {
  const tpl =
    template ||
    'Dear {guest_name}, thank you for choosing {hotel_name}. Your checkout for Room {room_no} is scheduled for today by {checkout_time}. Please visit the front desk for bill settlement. Have a pleasant journey! Call {hotel_phone} for assistance.';

  return tpl
    .replace(/{guest_name}/g, guestName || 'Guest')
    .replace(/{room_no}/g, roomNo ? String(roomNo) : '')
    .replace(/{checkout_time}/g, checkoutTime || '12:00 PM')
    .replace(/{checkout_date}/g, checkoutDate || 'today')
    .replace(/{hotel_name}/g, hotelName || 'Hotel')
    .replace(/{hotel_phone}/g, hotelPhone || '')
    .replace(/{status}/g, status || '');
}

export const DEFAULT_CHECKIN_WHATSAPP_TEMPLATE = `Dear {{guest_name}},

Welcome to {{hotel_name}}!

Your check-in has been successfully completed.

Room Number: {{room_number}}
Check-in Date: {{checkin_date}}
Check-in Time: {{checkin_time}}
Expected Check-out: {{checkout_date}} at {{checkout_time}}

We hope you have a comfortable and pleasant stay with us.

Thank you,
{{hotel_name}}`;

export function buildCheckInWhatsAppMessage(template, {
  guestName,
  roomNo,
  checkinDate,
  checkinTime,
  checkoutDate,
  checkoutTime,
  hotelName,
  hotelPhone,
}) {
  const tpl = template || DEFAULT_CHECKIN_WHATSAPP_TEMPLATE;

  return tpl
    .replace(/\{\{guest_name\}\}|\{guest_name\}/g, guestName || 'Guest')
    .replace(/\{\{room_number\}\}|\{\{room_no\}\}|\{room_number\}|\{room_no\}/g, roomNo ? String(roomNo) : '')
    .replace(/\{\{checkin_date\}\}|\{\{check_in_date\}\}|\{checkin_date\}|\{check_in_date\}/g, checkinDate || '')
    .replace(/\{\{checkin_time\}\}|\{\{check_in_time\}\}|\{checkin_time\}|\{check_in_time\}/g, checkinTime || '12:00 PM')
    .replace(/\{\{checkout_date\}\}|\{\{check_out_date\}\}|\{checkout_date\}|\{check_out_date\}/g, checkoutDate || '')
    .replace(/\{\{checkout_time\}\}|\{\{check_out_time\}\}|\{checkout_time\}|\{check_out_time\}/g, checkoutTime || '12:00 PM')
    .replace(/\{\{hotel_name\}\}|\{hotel_name\}/g, hotelName || 'Tamarind Court')
    .replace(/\{\{hotel_phone\}\}|\{hotel_phone\}/g, hotelPhone || '');
}

export function cleanPhoneForWhatsApp(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 7) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

