import { useEffect, useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useGuest, useUpdateGuest } from '../../api/guests';
import { useToast } from '../../context/ToastContext.jsx';

const ID_TYPES = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport', 'Other'];

export default function GuestEditSheet({ guestId, onClose, onSaved }) {
  const { data: guest, isLoading } = useGuest(guestId);
  const updateGuest = useUpdateGuest();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    idProofType: 'Aadhaar',
    idProofNumber: '',
    isForeign: false,
    nationality: '',
    visaExpiry: '',
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
        isForeign: !!guest.isForeign,
        nationality: guest.nationality || '',
        visaExpiry: guest.visaExpiry || '',
      });
    }
  }, [guest]);

  const handleFieldChange = (field, value) => {
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
    if (!/^\d{10}$/.test(cleanPhone)) {
      errs.phone = 'Enter a valid 10-digit mobile number.';
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

  const handleSubmit = async (e) => {
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
        isForeign: form.isForeign ? 1 : 0,
        nationality: form.isForeign ? (form.nationality.trim() || null) : null,
        visaExpiry: form.isForeign ? (form.visaExpiry || null) : null,
      };
      if (form.idProofNumber.trim()) {
        payload.idProofNumber = form.idProofNumber.trim();
      }

      await updateGuest.mutateAsync(payload);
      toast('Guest profile updated successfully.');
      onSaved?.();
      onClose();
    } catch (err) {
      toast(err.message || 'Failed to update guest profile.');
    }
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        title={guest ? `Edit ${guest.name}` : 'Edit Guest Profile'}
        subtitle={guest?.phone ? `Mobile: ${guest.phone}` : 'Update personal information and address'}
        onClose={onClose}
      />
      <div className="sb">
        {isLoading || !guest ? (
          <div className="skel" style={{ height: 200 }} />
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--color-surface-secondary, #F1EAF8)',
                border: '1px solid var(--color-border, #EAE4EF)',
                fontSize: 12.5,
                color: 'var(--color-primary-dark, #542047)',
                lineHeight: 1.4,
              }}
            >
              ℹ️ <b>Master Profile:</b> Updating contact and identity details saves to the guest record. Historical bookings, stays, and financial transactions are preserved.
            </div>

            <div className={`f full ${formErrors.name ? 'bad' : ''}`}>
              <label htmlFor="ge-name">
                Full Name <i>*</i>
              </label>
              <input
                id="ge-name"
                type="text"
                required
                value={form.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="Guest full name"
                autoFocus
              />
              {formErrors.name && <span className="err">{formErrors.name}</span>}
            </div>

            <div className={`f full ${formErrors.phone ? 'bad' : ''}`}>
              <label htmlFor="ge-phone">
                Mobile Number <i>*</i>
              </label>
              <input
                id="ge-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                value={form.phone}
                onChange={(e) => handleFieldChange('phone', e.target.value)}
                placeholder="10-digit mobile number"
              />
              {formErrors.phone && <span className="err">{formErrors.phone}</span>}
            </div>

            <div className={`f full ${formErrors.email ? 'bad' : ''}`}>
              <label htmlFor="ge-email">Email Address</label>
              <input
                id="ge-email"
                type="email"
                value={form.email}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                placeholder="guest@example.com"
              />
              {formErrors.email && <span className="err">{formErrors.email}</span>}
            </div>

            <div className="row2">
              <div className="f" style={{ flex: 1 }}>
                <label htmlFor="ge-city">City</label>
                <input
                  id="ge-city"
                  type="text"
                  value={form.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  placeholder="City / District"
                />
              </div>
              <div className="f" style={{ flex: 1 }}>
                <label htmlFor="ge-idtype">ID Proof Type</label>
                <select
                  id="ge-idtype"
                  value={form.idProofType}
                  onChange={(e) => handleFieldChange('idProofType', e.target.value)}
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
              <label htmlFor="ge-address">Complete Address</label>
              <input
                id="ge-address"
                type="text"
                value={form.address}
                onChange={(e) => handleFieldChange('address', e.target.value)}
                placeholder="Door no, street, area, pincode"
              />
            </div>

            <div className={`f full ${formErrors.idProofNumber ? 'bad' : ''}`}>
              <label htmlFor="ge-idnum">
                ID Proof Number {guest.idProofMasked ? <span className="muted mono">({guest.idProofMasked})</span> : null}
              </label>
              <input
                id="ge-idnum"
                type="text"
                value={form.idProofNumber}
                onChange={(e) => handleFieldChange('idProofNumber', e.target.value)}
                placeholder={guest.idProofMasked ? 'Leave blank to keep current ID number' : 'Enter ID proof number'}
              />
              {formErrors.idProofNumber && <span className="err">{formErrors.idProofNumber}</span>}
              <small className="muted" style={{ marginTop: 4, display: 'block', fontSize: 11.5 }}>
                Stored encrypted (AES-256-GCM). Only masked characters are displayed.
              </small>
            </div>

            <div style={{ marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={form.isForeign}
                  onChange={(e) => handleFieldChange('isForeign', e.target.checked)}
                />
                Foreign Guest (Non-Indian Citizen)
              </label>
            </div>

            {form.isForeign && (
              <div className="row2" style={{ gap: 10 }}>
                <div className="f" style={{ flex: 1 }}>
                  <label htmlFor="ge-nationality">Nationality</label>
                  <input
                    id="ge-nationality"
                    type="text"
                    value={form.nationality}
                    onChange={(e) => handleFieldChange('nationality', e.target.value)}
                    placeholder="e.g. United Kingdom"
                  />
                </div>
                <div className="f" style={{ flex: 1 }}>
                  <label htmlFor="ge-visa">Visa Expiry Date</label>
                  <input
                    id="ge-visa"
                    type="date"
                    value={form.visaExpiry}
                    onChange={(e) => handleFieldChange('visaExpiry', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="row2" style={{ marginTop: 12, gap: 10 }}>
              <button className="btn dark" type="submit" disabled={updateGuest.isPending} style={{ flex: 1 }}>
                {updateGuest.isPending ? 'Saving changes…' : 'Save changes'}
              </button>
              <button
                className="btn"
                type="button"
                disabled={updateGuest.isPending}
                onClick={onClose}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}
