export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nightsBetween(a, b) {
  const diff = (new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000;
  return Math.max(1, Math.round(diff));
}

export function fd(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function fdWithYear(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fdLong(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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

/** Client-side estimate only — the server recomputes and is authoritative. */
export function estimateGstRate(rate, settings) {
  if (!settings) return rate <= 1000 ? 0 : rate <= 7500 ? 0.05 : 0.18;
  if (rate <= Number(settings.gst_slab1_max_rate)) return Number(settings.gst_slab1_gst_rate);
  if (rate <= Number(settings.gst_slab2_max_rate)) return Number(settings.gst_slab2_gst_rate);
  return Number(settings.gst_slab3_gst_rate);
}
