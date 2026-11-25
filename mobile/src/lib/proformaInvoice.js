/**
 * Pure calculation and construction of a proforma/preview invoice
 * for active in-house stays before checkout.
 */
export function buildProformaInvoiceData({ stay, bill, hotel, settings, guest, stayId }) {
  const actualStayId = Number(stayId || stay?.id || 0);

  const fallbackHotel = hotel || {
    name: 'KKK Lodge',
    place: 'Puducherry',
    address: '123 Heritage Lane',
    gstin: '',
    phone: '',
  };
  const fallbackSettings = settings || {};

  const checkoutDate = stay?.checkout_actual || stay?.checkout_planned || null;
  const checkInDate = stay?.check_in_date || new Date().toISOString().slice(0, 10);
  const nights = bill?.nights ?? (checkoutDate && checkInDate ? Math.max(1, Math.round((new Date(checkoutDate) - new Date(checkInDate)) / 86400000)) : 1);
  const rate = Number(stay?.rate ?? bill?.roomRate ?? 0);

  const roomAmount = Number(bill?.roomAmount ?? (nights * rate));
  const gstRate = Number(bill?.gstRate ?? (stay?.gst_rate || 0.05));
  const roomGstAmount = Number(bill?.roomGstAmount ?? Math.round(roomAmount * gstRate));

  const charges = (stay?.charges && stay.charges.length > 0)
    ? stay.charges
    : (bill?.charges || []);

  const extrasAmount = Number(bill?.extrasAmount ?? charges.reduce((sum, c) => sum + Number(c.amount || 0), 0));
  const extrasGstAmount = Number(bill?.extrasGstAmount ?? Math.round(extrasAmount * gstRate));

  const cgstAmount = Number(bill?.cgstAmount ?? Math.round((roomGstAmount + extrasGstAmount) / 2));
  const sgstAmount = Number(bill?.sgstAmount ?? (roomGstAmount + extrasGstAmount - cgstAmount));
  const igstAmount = Number(bill?.igstAmount ?? 0);

  const totalAmount = Number(bill?.total ?? (roomAmount + roomGstAmount + extrasAmount + extrasGstAmount));

  let advancePaid = 0;
  if (bill?.advancePaid !== undefined) {
    advancePaid = Number(bill.advancePaid);
  } else if (stay?.advance_paid !== undefined) {
    advancePaid = Number(stay.advance_paid);
  } else if (guest?.payments) {
    advancePaid = guest.payments
      .filter((p) => (p.status || 'successful') === 'successful' && p.type === 'advance')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }

  const balanceAmount = Number(bill?.balance ?? Math.max(0, totalAmount - advancePaid));

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startMonth = Number(fallbackSettings.financial_year_start_month || 4);
  const fyStart = month >= startMonth ? year : year - 1;
  const fy = `${fyStart}-${String(fyStart + 1).slice(-2)}`;
  const prefix = fallbackSettings.invoice_prefix || 'TC';
  const invoiceNumber = `${prefix}-PROFORMA-${String(actualStayId).padStart(4, '0')}`;

  const invoice = {
    id: 0,
    hotel_id: stay?.hotel_id || 1,
    stay_id: actualStayId,
    invoice_number: invoiceNumber,
    financial_year: fy,
    sequence_no: 0,
    guest_gstin: stay?.guest_gstin || guest?.id_proof_number || null,
    room_amount: roomAmount,
    gst_rate: gstRate,
    room_gst_amount: roomGstAmount,
    extras_amount: extrasAmount,
    extras_gst_amount: extrasGstAmount,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    total_amount: totalAmount,
    advance_paid: advancePaid,
    balance_amount: balanceAmount,
    discount_amount: Number(bill?.discountAmount ?? 0),
    early_checkout_fee: Number(bill?.earlyCheckoutFee ?? 0),
    refund_amount: 0,
    created_at: now.toISOString().replace('T', ' ').slice(0, 19),
    is_proforma: true,
  };

  const payments = (guest?.payments || []).filter((p) => {
    return (p.status || 'successful') === 'successful' && (Number(p.stay_id) === actualStayId || p.type === 'advance');
  });

  if (payments.length === 0 && advancePaid > 0) {
    payments.push({
      id: 1,
      type: 'advance',
      method: stay?.payment_method || 'UPI',
      amount: String(advancePaid),
      status: 'successful',
      created_at: stay?.check_in_date || now.toISOString().slice(0, 10),
    });
  }

  const paymentSummary = {
    advancePaid,
    checkoutPaid: 0,
    totalPaid: advancePaid,
    balance: balanceAmount,
  };

  const normalizedStay = {
    id: actualStayId,
    guest_name: stay?.guest_name || guest?.name || 'Guest',
    guest_phone: stay?.guest_phone || guest?.phone || '',
    room_no: stay?.room_no || '—',
    room_type_name: stay?.room_type_name || '',
    check_in_date: stay?.check_in_date || now.toISOString().slice(0, 10),
    checkout_planned: stay?.checkout_planned || '',
    checkout_actual: stay?.checkout_actual || null,
    rate: rate,
    nights: nights,
  };

  return {
    invoice,
    hotel: fallbackHotel,
    stay: normalizedStay,
    charges,
    payments,
    paymentSummary,
  };
}
