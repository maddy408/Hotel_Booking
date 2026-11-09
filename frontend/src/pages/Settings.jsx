import { useEffect, useState } from 'react';
import { useSettings, useUpdateHotel, useUpdateGst, useUpdateWhatsapp, useUpdatePolicies } from '../api/settings';
import { useToast } from '../context/ToastContext.jsx';
import { DEFAULT_CHECKIN_WHATSAPP_TEMPLATE } from '../lib/whatsapp.js';

const DEFAULT_WHATSAPP_TEMPLATE =
  'Dear {guest_name}, thank you for choosing {hotel_name}. Your checkout for Room {room_no} is scheduled for today by {checkout_time}. Please visit the front desk for bill settlement. Have a pleasant journey! Call {hotel_phone} for assistance.';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST · GMT+5:30)' },
  { value: 'UTC', label: 'UTC (GMT+0:00)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST · GMT+4:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT · GMT+8:00)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT · GMT+7:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST · GMT+1:00)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT · GMT-5:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT · GMT-6:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT · GMT-8:00)' },
];

const TEMPLATE_VARIABLES = [
  { tag: '{guest_name}', desc: 'Guest full name' },
  { tag: '{room_no}', desc: 'Room number' },
  { tag: '{checkout_time}', desc: 'Standard / actual checkout time' },
  { tag: '{checkout_date}', desc: "Today's checkout date" },
  { tag: '{hotel_name}', desc: 'Hotel name' },
  { tag: '{hotel_phone}', desc: 'Hotel phone number' },
  { tag: '{status}', desc: 'Checkout status (Pending / Checked Out)' },
];

const CHECKIN_TEMPLATE_VARIABLES = [
  { tag: '{{guest_name}}', desc: 'Guest full name' },
  { tag: '{{room_number}}', desc: 'Room number' },
  { tag: '{{checkin_date}}', desc: 'Check-in date' },
  { tag: '{{checkin_time}}', desc: 'Check-in time' },
  { tag: '{{checkout_date}}', desc: 'Expected checkout date' },
  { tag: '{{checkout_time}}', desc: 'Expected checkout time' },
  { tag: '{{hotel_name}}', desc: 'Hotel name' },
  { tag: '{{hotel_phone}}', desc: 'Hotel phone number' },
];

export default function Settings() {
  const { data, isLoading } = useSettings();
  const updateHotel = useUpdateHotel();
  const updateGst = useUpdateGst();
  const updateWhatsapp = useUpdateWhatsapp();
  const updatePolicies = useUpdatePolicies();
  const toast = useToast();

  const [hotel, setHotel] = useState(null);
  const [gst, setGst] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [policies, setPolicies] = useState(null);

  useEffect(() => {
    if (data && !hotel) setHotel(data.hotel);
    if (data && !gst) {
      setGst({
        gstSlab1MaxRate: data.settings.gst_slab1_max_rate,
        gstSlab1GstRate: Number(data.settings.gst_slab1_gst_rate) * 100,
        gstSlab2MaxRate: data.settings.gst_slab2_max_rate,
        gstSlab2GstRate: Number(data.settings.gst_slab2_gst_rate) * 100,
        gstSlab3GstRate: Number(data.settings.gst_slab3_gst_rate) * 100,
        taxExtras: !!data.settings.tax_extras,
        checkoutHour: data.settings.checkout_hour,
      });
    }
    if (data && !whatsapp) {
      setWhatsapp({
        template: data.settings.whatsapp_checkout_template || DEFAULT_WHATSAPP_TEMPLATE,
        checkinTemplate: data.settings.whatsapp_checkin_template || DEFAULT_CHECKIN_WHATSAPP_TEMPLATE,
        checkinEnabled: data.settings.whatsapp_checkin_enabled !== undefined ? Boolean(Number(data.settings.whatsapp_checkin_enabled)) : true,
        timezone: data.settings.timezone || 'Asia/Kolkata',
      });
    }
    if (data && !policies) {
      setPolicies({
        cancellationDeadlineHours: data.settings.cancellation_deadline_hours ?? 24,
        cancellationFreeAllowed: data.settings.cancellation_free_allowed !== undefined ? Boolean(Number(data.settings.cancellation_free_allowed)) : true,
        cancellationFeeType: data.settings.cancellation_fee_type || 'none',
        cancellationFeeValue: Number(data.settings.cancellation_fee_value || 0),
        cancellationLateFeeType: data.settings.cancellation_late_fee_type || 'percentage',
        cancellationLateFeeValue: Number(data.settings.cancellation_late_fee_value || 10),
        earlyCheckoutRefundUnusedNights: data.settings.early_checkout_refund_unused_nights !== undefined ? Boolean(Number(data.settings.early_checkout_refund_unused_nights)) : true,
        earlyCheckoutFeeType: data.settings.early_checkout_fee_type || 'none',
        earlyCheckoutFeeValue: Number(data.settings.early_checkout_fee_value || 0),
      });
    }
  }, [data, hotel, gst, whatsapp, policies]);

  if (isLoading || !hotel || !gst || !whatsapp || !policies) {
    return (
      <div className="mgrid">
        <div className="skel" style={{ height: 220 }} />
        <div className="skel" style={{ height: 220 }} />
        <div className="skel" style={{ height: 220 }} />
      </div>
    );
  }

  const saveHotel = async (e) => {
    e.preventDefault();
    try {
      await updateHotel.mutateAsync(hotel);
      toast('Hotel details saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const saveGst = async (e) => {
    e.preventDefault();
    try {
      await updateGst.mutateAsync({
        gstSlab1MaxRate: Number(gst.gstSlab1MaxRate),
        gstSlab1GstRate: Number(gst.gstSlab1GstRate) / 100,
        gstSlab2MaxRate: Number(gst.gstSlab2MaxRate),
        gstSlab2GstRate: Number(gst.gstSlab2GstRate) / 100,
        gstSlab3GstRate: Number(gst.gstSlab3GstRate) / 100,
        taxExtras: gst.taxExtras,
        checkoutHour: Number(gst.checkoutHour),
      });
      toast('GST settings saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const saveWhatsapp = async (e) => {
    e.preventDefault();
    try {
      await updateWhatsapp.mutateAsync({
        template: whatsapp.template,
        checkinTemplate: whatsapp.checkinTemplate,
        checkinEnabled: whatsapp.checkinEnabled,
        timezone: whatsapp.timezone,
      });
      toast('WhatsApp templates and settings saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const savePolicies = async (e) => {
    e.preventDefault();
    try {
      await updatePolicies.mutateAsync({
        cancellationDeadlineHours: Number(policies.cancellationDeadlineHours),
        cancellationFreeAllowed: policies.cancellationFreeAllowed,
        cancellationFeeType: policies.cancellationFeeType,
        cancellationFeeValue: Number(policies.cancellationFeeValue),
        cancellationLateFeeType: policies.cancellationLateFeeType,
        cancellationLateFeeValue: Number(policies.cancellationLateFeeValue),
        earlyCheckoutRefundUnusedNights: policies.earlyCheckoutRefundUnusedNights,
        earlyCheckoutFeeType: policies.earlyCheckoutFeeType,
        earlyCheckoutFeeValue: Number(policies.earlyCheckoutFeeValue),
      });
      toast('Cancellation & Early Checkout policies saved.');
    } catch (err) {
      toast(err.message || 'Failed to save policies.');
    }
  };

  const insertVariable = (tag) => {
    setWhatsapp((prev) => ({
      ...prev,
      template: (prev?.template || '') + ' ' + tag,
    }));
  };

  const insertCheckinVariable = (tag) => {
    setWhatsapp((prev) => ({
      ...prev,
      checkinTemplate: (prev?.checkinTemplate || '') + ' ' + tag,
    }));
  };

  const previewText = (whatsapp.template || DEFAULT_WHATSAPP_TEMPLATE)
    .replace(/{guest_name}/g, 'Arjun Mehta')
    .replace(/{room_no}/g, '106')
    .replace(/{checkout_time}/g, `${gst.checkoutHour || 12}:00 PM`)
    .replace(/{checkout_date}/g, '05 Nov 2026')
    .replace(/{hotel_name}/g, hotel.name || 'Tamarind Court')
    .replace(/{hotel_phone}/g, hotel.phone || '9800000000')
    .replace(/{status}/g, 'Pending');

  const checkinPreviewText = (whatsapp.checkinTemplate || DEFAULT_CHECKIN_WHATSAPP_TEMPLATE)
    .replace(/\{\{guest_name\}\}|\{guest_name\}/g, 'Arjun Mehta')
    .replace(/\{\{room_number\}\}|\{\{room_no\}\}|\{room_number\}|\{room_no\}/g, '106')
    .replace(/\{\{checkin_date\}\}|\{checkin_date\}/g, '06 Nov 2026')
    .replace(/\{\{checkin_time\}\}|\{checkin_time\}/g, '10:30 AM')
    .replace(/\{\{checkout_date\}\}|\{checkout_date\}/g, '07 Nov 2026')
    .replace(/\{\{checkout_time\}\}|\{checkout_time\}/g, `${gst.checkoutHour || 12}:00 PM`)
    .replace(/\{\{hotel_name\}\}|\{hotel_name\}/g, hotel.name || 'Tamarind Court')
    .replace(/\{\{hotel_phone\}\}|\{hotel_phone\}/g, hotel.phone || '9800000000');

  return (
    <div className="mgrid">
      <div className="panel">
        <div className="ph">
          <h2>Hotel details</h2>
        </div>
        <form className="sb" onSubmit={saveHotel}>
          <div className="fg">
            <div className="f full">
              <label htmlFor="s-name">Hotel name *</label>
              <input id="s-name" type="text" required value={hotel.name} onChange={(e) => setHotel({ ...hotel, name: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-place">Place</label>
              <input id="s-place" type="text" value={hotel.place || ''} onChange={(e) => setHotel({ ...hotel, place: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-gstin">GSTIN</label>
              <input id="s-gstin" type="text" value={hotel.gstin || ''} onChange={(e) => setHotel({ ...hotel, gstin: e.target.value })} />
            </div>
            <div className="f full">
              <label htmlFor="s-address">Address</label>
              <input id="s-address" type="text" value={hotel.address || ''} onChange={(e) => setHotel({ ...hotel, address: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-phone">Phone</label>
              <input id="s-phone" type="tel" value={hotel.phone || ''} onChange={(e) => setHotel({ ...hotel, phone: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-email">Email</label>
              <input id="s-email" type="email" value={hotel.email || ''} onChange={(e) => setHotel({ ...hotel, email: e.target.value })} />
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateHotel.isPending} style={{ alignSelf: 'flex-start' }}>
            Save hotel details
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="ph">
          <h2>GST &amp; checkout</h2>
        </div>
        <form className="sb" onSubmit={saveGst}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Hotel room tariff GST slabs, by nightly rate. These apply to every new booking and check-in bill.
          </p>
          <div className="fg">
            <div className="f">
              <label htmlFor="g-s1max">0% up to rate (₹)</label>
              <input id="g-s1max" type="number" min="0" value={gst.gstSlab1MaxRate} onChange={(e) => setGst({ ...gst, gstSlab1MaxRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s2max">5% up to rate (₹)</label>
              <input id="g-s2max" type="number" min="0" value={gst.gstSlab2MaxRate} onChange={(e) => setGst({ ...gst, gstSlab2MaxRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s1rate">Slab 1 GST %</label>
              <input id="g-s1rate" type="number" min="0" max="100" value={gst.gstSlab1GstRate} onChange={(e) => setGst({ ...gst, gstSlab1GstRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s2rate">Slab 2 GST %</label>
              <input id="g-s2rate" type="number" min="0" max="100" value={gst.gstSlab2GstRate} onChange={(e) => setGst({ ...gst, gstSlab2GstRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s3rate">Above slab-2 GST %</label>
              <input id="g-s3rate" type="number" min="0" max="100" value={gst.gstSlab3GstRate} onChange={(e) => setGst({ ...gst, gstSlab3GstRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-hour">Checkout hour (24h)</label>
              <input id="g-hour" type="number" min="0" max="23" value={gst.checkoutHour} onChange={(e) => setGst({ ...gst, checkoutHour: e.target.value })} />
            </div>
            <div className="f full">
              <label>Apply GST to extra charges too</label>
              <div className="seg">
                <button type="button" aria-pressed={gst.taxExtras} onClick={() => setGst({ ...gst, taxExtras: true })}>
                  Yes
                </button>
                <button type="button" aria-pressed={!gst.taxExtras} onClick={() => setGst({ ...gst, taxExtras: false })}>
                  No
                </button>
              </div>
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateGst.isPending} style={{ alignSelf: 'flex-start' }}>
            Save GST settings
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="ph">
          <h2>WhatsApp &amp; Timezone</h2>
        </div>
        <form className="sb" onSubmit={saveWhatsapp}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Configure the hotel's timezone and the editable WhatsApp message template used in Today's Checkouts module.
          </p>

          <div className="fg">
            <div className="f full">
              <label htmlFor="w-tz">Hotel Timezone</label>
              <select
                id="w-tz"
                value={whatsapp.timezone}
                onChange={(e) => setWhatsapp({ ...whatsapp, timezone: e.target.value })}
              >
                {TIMEZONE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="f full">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label htmlFor="w-template" style={{ margin: 0 }}>
                  Checkout WhatsApp template *
                </label>
                <button
                  type="button"
                  className="btn sm"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => setWhatsapp({ ...whatsapp, template: DEFAULT_WHATSAPP_TEMPLATE })}
                >
                  Reset to default
                </button>
              </div>
              <textarea
                id="w-template"
                rows={4}
                required
                value={whatsapp.template}
                onChange={(e) => setWhatsapp({ ...whatsapp, template: e.target.value })}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div className="f full">
              <label style={{ marginBottom: 4 }}>Click placeholder to insert:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    className="btn sm"
                    title={v.desc}
                    onClick={() => insertVariable(v.tag)}
                    style={{ fontSize: 12, padding: '3px 8px' }}
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="f full">
              <label style={{ marginBottom: 4 }}>Template Preview (Sample Guest):</label>
              <div
                style={{
                  background: 'var(--color-bg, #f7f6f9)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--color-text)',
                }}
              >
                {previewText}
              </div>
            </div>

            {/* Check-in WhatsApp template settings */}
            <div className="f full" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Check-in WhatsApp Template</h3>
                <div className="seg" role="group" aria-label="Enable Check-in WhatsApp">
                  <button
                    type="button"
                    aria-pressed={whatsapp.checkinEnabled}
                    onClick={() => setWhatsapp({ ...whatsapp, checkinEnabled: true })}
                  >
                    Enabled
                  </button>
                  <button
                    type="button"
                    aria-pressed={!whatsapp.checkinEnabled}
                    onClick={() => setWhatsapp({ ...whatsapp, checkinEnabled: false })}
                  >
                    Disabled
                  </button>
                </div>
              </div>
              <p className="muted" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                Used in Daily Operations to greet arriving guests and send check-in confirmations.
              </p>
            </div>

            <div className="f full">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label htmlFor="w-checkin-template" style={{ margin: 0 }}>
                  Check-in WhatsApp template *
                </label>
                <button
                  type="button"
                  className="btn sm"
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  onClick={() => setWhatsapp({ ...whatsapp, checkinTemplate: DEFAULT_CHECKIN_WHATSAPP_TEMPLATE })}
                >
                  Reset to default
                </button>
              </div>
              <textarea
                id="w-checkin-template"
                rows={6}
                required
                value={whatsapp.checkinTemplate}
                onChange={(e) => setWhatsapp({ ...whatsapp, checkinTemplate: e.target.value })}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>

            <div className="f full">
              <label style={{ marginBottom: 4 }}>Click placeholder to insert:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CHECKIN_TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    className="btn sm"
                    title={v.desc}
                    onClick={() => insertCheckinVariable(v.tag)}
                    style={{ fontSize: 12, padding: '3px 8px' }}
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="f full">
              <label style={{ marginBottom: 4 }}>Template Preview (Sample Guest):</label>
              <div
                style={{
                  background: 'var(--color-bg, #f7f6f9)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  color: 'var(--color-text)',
                }}
              >
                {checkinPreviewText}
              </div>
            </div>
          </div>

          <button className="btn dark" type="submit" disabled={updateWhatsapp.isPending} style={{ alignSelf: 'flex-start' }}>
            Save WhatsApp settings
          </button>
        </form>
      </div>

      {/* Cancellation & Early Checkout Policy Settings */}
      <div className="panel full">
        <div className="ph">
          <h2>Cancellation & Early Checkout Policies</h2>
        </div>
        <form className="sb" onSubmit={savePolicies}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {/* Cancellation Policy Section */}
            <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-secondary)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Cancellation Before Check-in</h3>

              <div className="f" style={{ marginBottom: 10 }}>
                <label>Cancellation Deadline (hours before check-in)</label>
                <input
                  type="number"
                  min="0"
                  max="168"
                  value={policies.cancellationDeadlineHours}
                  onChange={(e) => setPolicies({ ...policies, cancellationDeadlineHours: e.target.value })}
                />
                <span className="muted" style={{ fontSize: 11 }}>e.g. 24 hours before check-in time</span>
              </div>

              <div className="f" style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={policies.cancellationFreeAllowed}
                    onChange={(e) => setPolicies({ ...policies, cancellationFreeAllowed: e.target.checked })}
                  />
                  <span>Free cancellation if cancelled before deadline</span>
                </label>
              </div>

              <div className="f" style={{ marginBottom: 10 }}>
                <label>Standard Fee Type (Before Deadline)</label>
                <select
                  value={policies.cancellationFeeType}
                  disabled={policies.cancellationFreeAllowed}
                  onChange={(e) => setPolicies({ ...policies, cancellationFeeType: e.target.value })}
                >
                  <option value="none">None (0 fee)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                  <option value="percentage">Percentage (%) of payment</option>
                  <option value="first_night">First Night Room Tariff</option>
                </select>
              </div>

              {policies.cancellationFeeType !== 'none' && !policies.cancellationFreeAllowed && (
                <div className="f" style={{ marginBottom: 10 }}>
                  <label>Standard Fee Value {policies.cancellationFeeType === 'percentage' ? '(%)' : '(₹)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={policies.cancellationFeeValue}
                    onChange={(e) => setPolicies({ ...policies, cancellationFeeValue: e.target.value })}
                  />
                </div>
              )}

              <div className="f" style={{ marginBottom: 10 }}>
                <label>Late Cancellation Fee Type (Within Deadline)</label>
                <select
                  value={policies.cancellationLateFeeType}
                  onChange={(e) => setPolicies({ ...policies, cancellationLateFeeType: e.target.value })}
                >
                  <option value="none">None (No fee)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                  <option value="percentage">Percentage (%) of payment</option>
                  <option value="first_night">First Night Room Tariff</option>
                </select>
              </div>

              {policies.cancellationLateFeeType !== 'none' && policies.cancellationLateFeeType !== 'first_night' && (
                <div className="f">
                  <label>Late Fee Value {policies.cancellationLateFeeType === 'percentage' ? '(%)' : '(₹)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={policies.cancellationLateFeeValue}
                    onChange={(e) => setPolicies({ ...policies, cancellationLateFeeValue: e.target.value })}
                  />
                </div>
              )}
            </div>

            {/* Early Checkout Policy Section */}
            <div style={{ padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-secondary)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>Early Checkout Policy</h3>

              <div className="f" style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={policies.earlyCheckoutRefundUnusedNights}
                    onChange={(e) => setPolicies({ ...policies, earlyCheckoutRefundUnusedNights: e.target.checked })}
                  />
                  <span>Refund eligible for unused nights (bill actual nights stayed)</span>
                </label>
                <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                  When unchecked, unused nights are non-refundable and stay is charged for planned nights.
                </span>
              </div>

              <div className="f" style={{ marginBottom: 10 }}>
                <label>Early Checkout Deduction / Fee Type</label>
                <select
                  value={policies.earlyCheckoutFeeType}
                  onChange={(e) => setPolicies({ ...policies, earlyCheckoutFeeType: e.target.value })}
                >
                  <option value="none">None (No deduction)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                  <option value="percentage">Percentage (%) of unused nights</option>
                  <option value="one_night">One Night Tariff Penalty</option>
                </select>
              </div>

              {policies.earlyCheckoutFeeType !== 'none' && policies.earlyCheckoutFeeType !== 'one_night' && (
                <div className="f">
                  <label>Early Checkout Fee Value {policies.earlyCheckoutFeeType === 'percentage' ? '(%)' : '(₹)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={policies.earlyCheckoutFeeValue}
                    onChange={(e) => setPolicies({ ...policies, earlyCheckoutFeeValue: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>

          <button className="btn dark" type="submit" disabled={updatePolicies.isPending} style={{ alignSelf: 'flex-start', marginTop: 10 }}>
            {updatePolicies.isPending ? 'Saving policies...' : 'Save Cancellation & Early Checkout Policies'}
          </button>
        </form>
      </div>
    </div>
  );
}
