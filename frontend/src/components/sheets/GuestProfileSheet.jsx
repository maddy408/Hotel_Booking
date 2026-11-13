import { useEffect, useRef, useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useGuest, useUpdateGuest } from '../../api/guests';
import { useUploadIdImage, fetchIdImageBlobUrl } from '../../api/idImage';
import { useToast } from '../../context/ToastContext.jsx';
import { fd } from '../../lib/format';

const ID_TYPES = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport', 'Other'];

export default function GuestProfileSheet({ guestId, initialEdit = false, onClose, onNewBooking, onOpenRoomNo }) {
  const { data: guest } = useGuest(guestId);
  const updateGuest = useUpdateGuest();
  const uploadIdImage = useUploadIdImage();
  const toast = useToast();
  const fileInput = useRef(null);
  const [viewing, setViewing] = useState(null); // blob url, while the preview is open
  const [isEditing, setIsEditing] = useState(initialEdit);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    idProofType: 'Aadhaar',
    idProofNumber: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (guest) {
      setForm({
        name: guest.name || '',
        phone: guest.phone || '',
        email: guest.email || '',
        city: guest.city || '',
        address: guest.address || '',
        idProofType: guest.idProofType || 'Aadhaar',
        idProofNumber: '',
      });
    }
  }, [guest]);

  if (!guest) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader title="Guest" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 120 }} />
        </div>
      </Sheet>
    );
  }

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await uploadIdImage.mutateAsync({ guestId, file });
      toast('ID image saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const viewImage = async () => {
    try {
      setViewing(await fetchIdImageBlobUrl(guestId));
    } catch (err) {
      toast(err.message);
    }
  };

  const handleEditChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) {
      errs.name = 'Guest name is required.';
    }
    const cleanPhone = form.phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      errs.phone = 'Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    if (form.idProofNumber.trim() && form.idProofNumber.trim().length < 4) {
      errs.idProofNumber = 'ID number must be at least 4 characters.';
    }
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const payload = {
        id: guestId,
        name: form.name.trim(),
        phone: form.phone.replace(/\D/g, ''),
        email: form.email.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null,
        idProofType: form.idProofType,
      };
      if (form.idProofNumber.trim()) {
        payload.idProofNumber = form.idProofNumber.trim();
      }

      await updateGuest.mutateAsync(payload);
      toast('Guest profile updated.');
      setIsEditing(false);
      setForm((prev) => ({ ...prev, idProofNumber: '' }));
    } catch (err) {
      toast(err.message || 'Failed to update guest profile.');
    }
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        title={isEditing ? `Edit ${guest.name}` : guest.name}
        subtitle={isEditing ? 'Update master guest details' : guest.city || ''}
        onClose={onClose}
      />
      <div className="sb">
        {isEditing ? (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: 12.5, color: 'var(--color-muted)' }}>
              ℹ️ <b>Master Profile:</b> Updating this profile corrects contact and identity records. Completed invoices and past stay bills retain their historical snapshots.
            </div>

            <div className={`f full ${formErrors.name ? 'bad' : ''}`}>
              <label htmlFor="gp-name">
                Full Name <i>*</i>
              </label>
              <input
                id="gp-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => handleEditChange('name', e.target.value)}
                placeholder="Guest full name"
              />
              {formErrors.name && <span className="err">{formErrors.name}</span>}
            </div>

            <div className={`f full ${formErrors.phone ? 'bad' : ''}`}>
              <label htmlFor="gp-phone">
                Mobile Number <i>*</i>
              </label>
              <input
                id="gp-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                value={form.phone}
                onChange={(e) => handleEditChange('phone', e.target.value)}
                placeholder="10-digit mobile"
              />
              {formErrors.phone && <span className="err">{formErrors.phone}</span>}
            </div>

            <div className={`f full ${formErrors.email ? 'bad' : ''}`}>
              <label htmlFor="gp-email">Email Address</label>
              <input
                id="gp-email"
                type="email"
                value={form.email}
                onChange={(e) => handleEditChange('email', e.target.value)}
                placeholder="guest@example.com"
              />
              {formErrors.email && <span className="err">{formErrors.email}</span>}
            </div>

            <div className="row2">
              <div className="f" style={{ flex: 1 }}>
                <label htmlFor="gp-city">City</label>
                <input
                  id="gp-city"
                  type="text"
                  value={form.city}
                  onChange={(e) => handleEditChange('city', e.target.value)}
                  placeholder="City"
                />
              </div>
              <div className="f" style={{ flex: 1 }}>
                <label htmlFor="gp-idtype">ID Proof Type</label>
                <select
                  id="gp-idtype"
                  value={form.idProofType}
                  onChange={(e) => handleEditChange('idProofType', e.target.value)}
                >
                  {ID_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="f full">
              <label htmlFor="gp-address">Street Address</label>
              <input
                id="gp-address"
                type="text"
                value={form.address}
                onChange={(e) => handleEditChange('address', e.target.value)}
                placeholder="Full residential or company address"
              />
            </div>

            <div className={`f full ${formErrors.idProofNumber ? 'bad' : ''}`}>
              <label htmlFor="gp-idnum">
                ID Proof Number {guest.idProofMasked ? <span className="muted mono">({guest.idProofMasked})</span> : null}
              </label>
              <input
                id="gp-idnum"
                type="text"
                value={form.idProofNumber}
                onChange={(e) => handleEditChange('idProofNumber', e.target.value)}
                placeholder={guest.idProofMasked ? 'Leave blank to keep existing ID number' : 'Enter ID proof number'}
              />
              {formErrors.idProofNumber && <span className="err">{formErrors.idProofNumber}</span>}
              <small className="muted" style={{ marginTop: 4, display: 'block', fontSize: 11.5 }}>
                Stored encrypted (AES-256-GCM). Only masked characters are displayed.
              </small>
            </div>

            <div className="row2" style={{ marginTop: 8 }}>
              <button className="btn dark" type="submit" disabled={updateGuest.isPending}>
                {updateGuest.isPending ? 'Saving changes…' : 'Save changes'}
              </button>
              <button
                className="btn"
                type="button"
                disabled={updateGuest.isPending}
                onClick={() => {
                  setIsEditing(false);
                  setFormErrors({});
                  if (guest) {
                    setForm({
                      name: guest.name || '',
                      phone: guest.phone || '',
                      email: guest.email || '',
                      city: guest.city || '',
                      address: guest.address || '',
                      idProofType: guest.idProofType || 'Aadhaar',
                      idProofNumber: '',
                    });
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <dl className="info">
              <dt>Mobile</dt>
              <dd className="mono">{guest.phone}</dd>
              <dt>Email</dt>
              <dd>{guest.email || <span className="muted">—</span>}</dd>
              <dt>Address</dt>
              <dd>{guest.address || guest.city || <span className="muted">—</span>}</dd>
              <dt>ID proof</dt>
              <dd>
                {guest.idProofType} <span className="mono">{guest.idProofMasked || '—'}</span>
              </dd>
              <dt>Visits</dt>
              <dd>{guest.visits}</dd>
            </dl>

            <div className="f">
              <label>ID proof image</label>
              <div className="row2">
                {guest.hasIdImage && (
                  <button className="btn sm" type="button" onClick={viewImage}>
                    View
                  </button>
                )}
                <button
                  className="btn sm"
                  type="button"
                  disabled={uploadIdImage.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  {guest.hasIdImage ? 'Replace' : 'Upload'} photo
                </button>
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFileChosen} />
            </div>

            {viewing && (
              <div className="f">
                <img
                  src={viewing}
                  alt="ID proof"
                  style={{ borderRadius: 10, border: '1px solid var(--line)', maxHeight: 220, objectFit: 'contain' }}
                />
              </div>
            )}

            <div className="row2" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button className="btn sm" type="button" onClick={() => setIsEditing(true)}>
                Edit profile
              </button>
              <button className="btn dark sm" type="button" onClick={() => onNewBooking(guest)}>
                New booking for this guest
              </button>
            </div>

            {guest.now?.type === 'in_house' && (
              <button className="btn blue" type="button" onClick={() => onOpenRoomNo(guest.now.roomNo)}>
                In Room {guest.now.roomNo} · open bill
              </button>
            )}

            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                Stay History
              </h4>
              <ul className="hist">
                {guest.history?.map((h) => (
                  <li key={`${h.kind}-${h.id}`}>
                    <span>
                      Room <b className="mono">{h.room_no}</b> · {fd(h.check_in)} → {fd(h.status === 'checked_out' ? h.checkout_actual : h.check_out)}
                    </span>
                    <span className={h.status === 'checked_out' ? 'mono' : 'muted'}>
                      {h.status === 'checked_out' ? 'Done' : h.kind === 'reservation' ? `Booking ${h.booking_code}` : 'Staying now'}
                    </span>
                  </li>
                ))}
                {!guest.history?.length && <li className="muted">No stays yet.</li>}
              </ul>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
