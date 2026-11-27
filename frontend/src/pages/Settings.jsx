import { useEffect, useState } from 'react';
import { useSettings, useUpdateHotel, useUpdateGst, useUpdateCheckoutHour, useUpdateWhatsapp, useUpdatePolicies } from '../api/settings';
import { useToast } from '../context/ToastContext.jsx';
import { formatCheckoutHour } from '../lib/format.js';
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

export default function Settings() {
  const { data, isLoading } = useSettings();
  const updateHotel = useUpdateHotel();
  const updateGst = useUpdateGst();
  const updateCheckoutHour = useUpdateCheckoutHour();
  const updateWhatsapp = useUpdateWhatsapp();
  const updatePolicies = useUpdatePolicies();
  const toast = useToast();

  const [hotel, setHotel] = useState(null);
  const [errors, setErrors] = useState({ phone: '', email: '' });
  const [gst, setGst] = useState(null);
  const [checkoutHour, setCheckoutHour] = useState(null);
  const [whatsapp, setWhatsapp] = useState(null);
  const [policies, setPolicies] = useState(null);

  useEffect(() => {
    if (data && !hotel) setHotel(data.hotel);
    if (data && checkoutHour === null) {
      setCheckoutHour(data.settings?.checkout_hour ?? 12);
    }
    if (data && !gst) {
      setGst({
        gstSlab1MaxRate: data.settings?.gst_slab1_max_rate ?? '7500.00',
        gstSlab1GstRate: Number(data.settings?.gst_slab1_gst_rate ?? 0.05) * 100,
        gstSlab2MaxRate: data.settings?.gst_slab2_max_rate ?? '7500.00',
        gstSlab2GstRate: Number(data.settings?.gst_slab2_gst_rate ?? 0.18) * 100,
        gstSlab3GstRate: Number(data.settings?.gst_slab3_gst_rate ?? 0.18) * 100,
        taxExtras: !!data.settings?.tax_extras,
        extraFoodGstRate: Number(data.settings?.extra_food_gst_rate ?? 0.05) * 100,
        extraLaundryGstRate: Number(data.settings?.extra_laundry_gst_rate ?? 0.18) * 100,
        extraBedGstRate: Number(data.settings?.extra_bed_gst_rate ?? 0.05) * 100,
        extraTaxiGstRate: Number(data.settings?.extra_taxi_gst_rate ?? 0.05) * 100,
        extraOtherGstRate: Number(data.settings?.extra_other_gst_rate ?? 0.18) * 100,
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

  if (isLoading || !hotel || !gst || checkoutHour === null || !whatsapp || !policies) {
    return (
      <div className="mgrid">
        <div className="skel" style={{ height: 220 }} />
        <div className="skel" style={{ height: 220 }} />
        <div className="skel" style={{ height: 220 }} />
      </div>
    );
  }

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setHotel((prev) => ({ ...prev, phone: val }));

    const hasInvalidChars = /[^\d\s+\-]/.test(val) || (val.includes('+') && !val.startsWith('+'));
    if (hasInvalidChars) {
      setErrors((prev) => ({ ...prev, phone: 'Only numeric digits are allowed.' }));
      return;
    }

    if (errors.phone) {
      const err = validatePhoneNumber(val);
      if (!err) {
        setErrors((prev) => ({ ...prev, phone: '' }));
      } else {
        setErrors((prev) => ({ ...prev, phone: err }));
      }
    }
  };

  const handlePhoneBlur = () => {
    const err = validatePhoneNumber(hotel?.phone);
    setErrors((prev) => ({ ...prev, phone: err || '' }));
  };

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setHotel((prev) => ({ ...prev, email: val }));

    if (/\s/.test(val)) {
      setErrors((prev) => ({ ...prev, email: 'Email address cannot contain spaces.' }));
      return;
    }

    if (errors.email) {
      const err = validateEmailAddress(val);
      if (!err) {
        setErrors((prev) => ({ ...prev, email: '' }));
      }
    }
  };

  const handleEmailBlur = () => {
    const err = validateEmailAddress(hotel?.email);
    setErrors((prev) => ({ ...prev, email: err || '' }));
  };

  const saveHotel = async (e) => {
    e.preventDefault();
    const phoneErr = validatePhoneNumber(hotel?.phone);
    const emailErr = validateEmailAddress(hotel?.email);

    if (phoneErr || emailErr) {
      setErrors({
        phone: phoneErr || '',
        email: emailErr || '',
      });
      return;
    }

    try {
      await updateHotel.mutateAsync(hotel);
      toast('Hotel details saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const saveGst = async (e) => {
    e.preventDefault();
    const threshold = Number(gst.gstSlab1MaxRate);
    const s1Rate = Number(gst.gstSlab1GstRate);
    const s2Rate = Number(gst.gstSlab2GstRate);

    if (isNaN(threshold) || threshold <= 0) {
      toast('Please enter a valid positive Slab 1 threshold (₹).');
      return;
    }
    if (isNaN(s1Rate) || s1Rate < 0 || s1Rate > 100) {
      toast('Slab 1 GST % must be between 0 and 100.');
      return;
    }
    if (isNaN(s2Rate) || s2Rate < 0 || s2Rate > 100) {
      toast('Slab 2 GST % must be between 0 and 100.');
      return;
    }

    try {
      await updateGst.mutateAsync({
        gstSlab1MaxRate: threshold,
        gstSlab1GstRate: s1Rate / 100,
        gstSlab2MaxRate: threshold,
        gstSlab2GstRate: s2Rate / 100,
        gstSlab3GstRate: s2Rate / 100,
        taxExtras: gst.taxExtras ?? true,
        extraFoodGstRate: Number(gst.extraFoodGstRate ?? 5) / 100,
        extraLaundryGstRate: Number(gst.extraLaundryGstRate ?? 18) / 100,
        extraBedGstRate: Number(gst.extraBedGstRate ?? 5) / 100,
        extraTaxiGstRate: Number(gst.extraTaxiGstRate ?? 5) / 100,
        extraOtherGstRate: Number(gst.extraOtherGstRate ?? 18) / 100,
      });
      toast('GST settings saved successfully.');
    } catch (err) {
      toast(err.message);
    }
  };

  const saveCheckoutHour = async (e) => {
    e.preventDefault();
    const h = Number(checkoutHour);
    if (isNaN(h) || h < 0 || h > 23) {
      toast('Checkout hour must be an integer between 0 and 23.');
      return;
    }
    try {
      await updateCheckoutHour.mutateAsync({ checkoutHour: h });
      toast('Checkout hour saved successfully.');
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
    .replace(/{checkout_time}/g, formatCheckoutHour(checkoutHour))
    .replace(/{checkout_date}/g, '05 Nov 2026')
    .replace(/{hotel_name}/g, hotel.name || 'KKK Lodge')
    .replace(/{hotel_phone}/g, hotel.phone || '9800000000')
    .replace(/{status}/g, 'Pending');

  const checkinPreviewText = (whatsapp.checkinTemplate || DEFAULT_CHECKIN_WHATSAPP_TEMPLATE)
    .replace(/\{\{guest_name\}\}|\{guest_name\}/g, 'Arjun Mehta')
    .replace(/\{\{room_number\}\}|\{\{room_no\}\}|\{room_number\}|\{room_no\}/g, '106')
    .replace(/\{\{checkin_date\}\}|\{checkin_date\}/g, '06 Nov 2026')
    .replace(/\{\{checkin_time\}\}|\{checkin_time\}/g, '10:30 AM')
    .replace(/\{\{checkout_date\}\}|\{checkout_date\}/g, '07 Nov 2026')
    .replace(/\{\{checkout_time\}\}|\{checkout_time\}/g, formatCheckoutHour(checkoutHour))
    .replace(/\{\{hotel_name\}\}|\{hotel_name\}/g, hotel.name || 'KKK Lodge')
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
            <div className={`f ${errors.phone ? 'bad' : ''}`}>
              <label htmlFor="s-phone">Phone</label>
              <input
                id="s-phone"
                type="tel"
                value={hotel.phone || ''}
                onChange={handlePhoneChange}
                onBlur={handlePhoneBlur}
              />
              {errors.phone && <span className="err">{errors.phone}</span>}
            </div>
            <div className={`f ${errors.email ? 'bad' : ''}`}>
              <label htmlFor="s-email">Email</label>
              <input
                id="s-email"
                type="email"
                value={hotel.email || ''}
                onChange={handleEmailChange}
                onBlur={handleEmailBlur}
              />
              {errors.email && <span className="err">{errors.email}</span>}
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateHotel.isPending} style={{ alignSelf: 'flex-start' }}>
            Save hotel details
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="ph">
          <h2>GST Configuration</h2>
        </div>
        <form className="sb" onSubmit={saveGst}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Hotel accommodation GST slabs by nightly tariff. Slabs evaluate per room per night regardless of room type.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              background: 'var(--color-bg, #f7f6f9)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 13,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                Slab 1: Up to ₹{Number(gst.gstSlab1MaxRate || 7500).toLocaleString('en-IN')} / night
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                GST: <strong>{gst.gstSlab1GstRate}%</strong> (CGST {(gst.gstSlab1GstRate / 2).toFixed(1).replace(/\.0$/, '')}% + SGST {(gst.gstSlab1GstRate / 2).toFixed(1).replace(/\.0$/, '')}% or IGST {gst.gstSlab1GstRate}%)
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                Slab 2: Above ₹{Number(gst.gstSlab1MaxRate || 7500).toLocaleString('en-IN')} / night
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                GST: <strong>{gst.gstSlab2GstRate}%</strong> (CGST {(gst.gstSlab2GstRate / 2).toFixed(1).replace(/\.0$/, '')}% + SGST {(gst.gstSlab2GstRate / 2).toFixed(1).replace(/\.0$/, '')}% or IGST {gst.gstSlab2GstRate}%)
              </div>
            </div>
          </div>

          <div className="fg">
            <div className="f full">
              <label htmlFor="g-s1max">Slab 1 tariff threshold (₹ per night) *</label>
              <input
                id="g-s1max"
                type="number"
                min="1"
                step="1"
                required
                value={gst.gstSlab1MaxRate}
                onChange={(e) => {
                  const val = e.target.value;
                  setGst({ ...gst, gstSlab1MaxRate: val, gstSlab2MaxRate: val });
                }}
              />
              <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Room tariffs up to ₹{Number(gst.gstSlab1MaxRate || 0).toLocaleString('en-IN')} will be taxed at Slab 1 GST.
              </span>
            </div>

            <div className="f">
              <label htmlFor="g-s1rate">Slab 1 GST % (Up to ₹{Number(gst.gstSlab1MaxRate || 0).toLocaleString('en-IN')}) *</label>
              <input
                id="g-s1rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={gst.gstSlab1GstRate}
                onChange={(e) => setGst({ ...gst, gstSlab1GstRate: e.target.value })}
              />
            </div>

            <div className="f">
              <label htmlFor="g-s2rate">Slab 2 GST % (Above ₹{Number(gst.gstSlab1MaxRate || 0).toLocaleString('en-IN')}) *</label>
              <input
                id="g-s2rate"
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={gst.gstSlab2GstRate}
                onChange={(e) => setGst({ ...gst, gstSlab2GstRate: e.target.value, gstSlab3GstRate: e.target.value })}
              />
            </div>

            <div className="f full" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, marginTop: 8 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Extra Charges GST Rates</h3>
              <p className="muted" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
                Individual service tax classifications. Room accommodation GST rate is never automatically applied to extra charges.
              </p>
            </div>

            <div className="f">
              <label htmlFor="g-ex-food">Food &amp; Beverage GST % (SAC 996331)</label>
              <input
                id="g-ex-food"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={gst.extraFoodGstRate}
                onChange={(e) => setGst({ ...gst, extraFoodGstRate: e.target.value })}
              />
            </div>

            <div className="f">
              <label htmlFor="g-ex-laundry">Laundry GST % (SAC 999719)</label>
              <input
                id="g-ex-laundry"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={gst.extraLaundryGstRate}
                onChange={(e) => setGst({ ...gst, extraLaundryGstRate: e.target.value })}
              />
            </div>

            <div className="f">
              <label htmlFor="g-ex-bed">Extra Bed GST % (SAC 996311)</label>
              <input
                id="g-ex-bed"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={gst.extraBedGstRate}
                onChange={(e) => setGst({ ...gst, extraBedGstRate: e.target.value })}
              />
            </div>

            <div className="f">
              <label htmlFor="g-ex-taxi">Taxi &amp; Travel GST % (SAC 996412)</label>
              <input
                id="g-ex-taxi"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={gst.extraTaxiGstRate}
                onChange={(e) => setGst({ ...gst, extraTaxiGstRate: e.target.value })}
              />
            </div>

            <div className="f">
              <label htmlFor="g-ex-other">Other Services GST % (SAC 9997)</label>
              <input
                id="g-ex-other"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={gst.extraOtherGstRate}
                onChange={(e) => setGst({ ...gst, extraOtherGstRate: e.target.value })}
              />
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateGst.isPending} style={{ alignSelf: 'flex-start' }}>
            {updateGst.isPending ? 'Saving...' : 'Save GST settings'}
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="ph">
          <h2>Checkout Timing</h2>
        </div>
        <form className="sb" onSubmit={saveCheckoutHour}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Configure the daily checkout hour (24-hour format). Used for computing stay duration and checkout alerts.
          </p>
          <div className="fg">
            <div className="f">
              <label htmlFor="c-hour">Checkout hour (0–23) *</label>
              <input
                id="c-hour"
                type="number"
                min="0"
                max="23"
                required
                value={checkoutHour}
                onChange={(e) => setCheckoutHour(e.target.value)}
              />
            </div>
            <div className="f">
              <label>Current configured time</label>
              <div
                style={{
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  fontSize: 14,
                }}
              >
                {formatCheckoutHour(checkoutHour)}
              </div>
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateCheckoutHour.isPending} style={{ alignSelf: 'flex-start' }}>
            {updateCheckoutHour.isPending ? 'Saving...' : 'Save checkout hour'}
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
