export function todayIso(tz = 'Asia/Kolkata') {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getPresetDateRange(presetKey, baseToday = todayIso()) {
  switch (presetKey) {
    case 'today':
      return { from: baseToday, to: baseToday, preset: 'today', label: 'Today' };
    case 'yesterday': {
      const y = addDaysIso(baseToday, -1);
      return { from: y, to: y, preset: 'yesterday', label: 'Yesterday' };
    }
    case 'last7':
      return { from: addDaysIso(baseToday, -6), to: baseToday, preset: 'last7', label: 'Last 7 days' };
    case 'thisWeek': {
      const d = new Date(`${baseToday}T00:00:00`);
      const dayOfWeek = d.getDay(); // 0 is Sunday, 1 is Monday...
      const diffToMonday = (dayOfWeek + 6) % 7;
      const mondayIso = addDaysIso(baseToday, -diffToMonday);
      return { from: mondayIso, to: baseToday, preset: 'thisWeek', label: 'This week' };
    }
    case 'thisMonth': {
      const firstOfMonth = `${baseToday.slice(0, 7)}-01`;
      return { from: firstOfMonth, to: baseToday, preset: 'thisMonth', label: 'This month' };
    }
    default:
      return { from: baseToday, to: baseToday, preset: 'today', label: 'Today' };
  }
}

export function formatDateRangeLabel(from, to, preset) {
  if (preset && preset !== 'custom') {
    const p = getPresetDateRange(preset, to || todayIso());
    if (p.from === from && p.to === to) {
      return p.label;
    }
  }
  if (!from || !to) return 'Select date';
  if (from === to) {
    return fdWithYear(from);
  }
  const fromD = new Date(`${from}T00:00:00`);
  const toD = new Date(`${to}T00:00:00`);
  const fromStr = fromD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const toStrWithYear = toD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (fromD.getFullYear() === toD.getFullYear()) {
    return `${fromStr} – ${toStrWithYear}`;
  }
  const fromWithYear = fromD.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fromWithYear} – ${toStrWithYear}`;
}

export function nightsBetween(a, b) {
  const diff = (new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000;
  return Math.max(1, Math.round(diff));
}

export function fd(iso) {
  if (!iso) return '';
  const s = String(iso).trim();
  if (
    !s ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'invalid date' ||
    s.startsWith('0000-00-00')
  ) {
    return '';
  }
  const datePart = s.includes(' ') ? s.split(' ')[0] : (s.includes('T') ? s.split('T')[0] : s);
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  const formatted = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return formatted === 'Invalid Date' ? '' : formatted;
}

export function fdWithYear(iso) {
  if (!iso) return '';
  const s = String(iso).trim();
  if (
    !s ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'invalid date' ||
    s.startsWith('0000-00-00')
  ) {
    return '';
  }
  const datePart = s.includes(' ') ? s.split(' ')[0] : (s.includes('T') ? s.split('T')[0] : s);
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  const formatted = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return formatted === 'Invalid Date' ? '' : formatted;
}

export function fdLong(iso) {
  if (!iso) return '';
  const s = String(iso).trim();
  if (
    !s ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'invalid date' ||
    s.startsWith('0000-00-00')
  ) {
    return '';
  }
  const datePart = s.includes(' ') ? s.split(' ')[0] : (s.includes('T') ? s.split('T')[0] : s);
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  const formatted = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return formatted === 'Invalid Date' ? '' : formatted;
}

export function formatDateTime(str, fallback = '—') {
  if (!str) return fallback;
  const s = String(str).trim();
  if (
    !s ||
    s.toLowerCase() === 'null' ||
    s.toLowerCase() === 'undefined' ||
    s.toLowerCase() === 'invalid date' ||
    s.startsWith('0000-00-00')
  ) {
    return fallback;
  }
  const [datePart, rawTime] = s.includes('T') ? s.split('T') : s.split(' ');
  const d = new Date(`${datePart}T00:00:00`);
  if (isNaN(d.getTime())) {
    return fallback;
  }
  const dateFormatted = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (!dateFormatted || dateFormatted === 'Invalid Date') {
    return fallback;
  }
  if (!rawTime) {
    return dateFormatted;
  }
  const timePart = rawTime.replace('Z', '').split('.')[0];
  const [hStr, mStr] = timePart.split(':');
  if (hStr === undefined || mStr === undefined) {
    return dateFormatted;
  }
  const hour = Number(hStr);
  if (isNaN(hour)) {
    return dateFormatted;
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${dateFormatted}, ${twelveHour}:${mStr} ${period}`;
}

/** Formats actual check-in date/time for display. Returns 'Not checked in' if null/undefined/empty/invalid. */
export function formatActualCheckIn(val) {
  return formatDateTime(val, 'Not checked in');
}

export function isCheckedIn(val) {
  return formatActualCheckIn(val) !== 'Not checked in';
}

export function inr(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

/** Formats the hotel's configured checkout hour (settings.checkout_hour, 0-23) for display. */
export function formatCheckoutHour(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '12 noon';
  if (h === 0) return 'midnight';
  if (h === 12) return '12 noon';
  const period = h < 12 ? 'AM' : 'PM';
  const twelveHour = h % 12 === 0 ? 12 : h % 12;
  return `${twelveHour} ${period}`;
}

/** Client-side estimate only — the server recomputes and is authoritative.
 * Standard hotel accommodation slabs: up to ₹7,500 is 5%, above ₹7,500 is 18%.
 */
export function estimateGstRate(rate, settings) {
  const r = Number(rate) || 0;
  if (!settings) return r <= 7500 ? 0.05 : 0.18;
  const s1Max = Number(settings.gst_slab1_max_rate) || 7500;
  const s1Rate = settings.gst_slab1_gst_rate !== undefined ? Number(settings.gst_slab1_gst_rate) : 0.05;
  const s2Max = Number(settings.gst_slab2_max_rate) || s1Max;
  const s2Rate = settings.gst_slab2_gst_rate !== undefined ? Number(settings.gst_slab2_gst_rate) : 0.18;
  const s3Rate = settings.gst_slab3_gst_rate !== undefined ? Number(settings.gst_slab3_gst_rate) : 0.18;

  if (r <= s1Max) return s1Rate;
  if (r <= s2Max) return s2Rate;
  return s3Rate;
}

/** Formats GST percentage into intra-state CGST + SGST or inter-state IGST label. */
export function formatGstBreakup(gstRate, isInterState = false) {
  const totalPct = Math.round((Number(gstRate) || 0) * 1000) / 10;
  if (isInterState) {
    return `${totalPct}% IGST`;
  }
  const half = (totalPct / 2).toFixed(totalPct % 2 === 0 ? 0 : 1);
  return `${half}% CGST + ${half}% SGST`;
}
