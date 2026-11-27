import { useEffect, useRef, useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useGuest, useUpdateGuest } from '../../api/guests';
import { useUploadIdImage, fetchIdImageBlobUrl } from '../../api/idImage';
import { fetchOccupantDocumentBlob } from '../../api/occupantDocuments';
import { useToast } from '../../context/ToastContext.jsx';
import { fd } from '../../lib/format';
import { validatePhone, handlePhoneInputChange, getIdProofConfig, handleIdNumberInputChange, validateIdNumber } from '../../lib/validation.js';

const ID_TYPES = ['Aadhaar', 'Driving Licence', 'Voter ID', 'Passport', 'Other'];

export default function GuestProfileSheet({ guestId, initialEdit = false, onClose, onNewBooking, onOpenRoomNo, onOpenBooking }) {
  const { data: guest } = useGuest(guestId);
  const updateGuest = useUpdateGuest();
  const uploadIdImage = useUploadIdImage();
  const toast = useToast();
  const fileInput = useRef(null);
  const [viewing, setViewing] = useState(null); // blob url, while the preview is open
  const [isEditing, setIsEditing] = useState(initialEdit);

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleViewDoc = async (docId) => {
    try {
      const { blobUrl } = await fetchOccupantDocumentBlob(docId);
      window.open(blobUrl, '_blank');
    } catch (err) {
      toast(err.message || 'Could not preview document.');
    }
  };

  const handleDownloadDoc = async (docId, filename) => {
    try {
      const { blobUrl } = await fetchOccupantDocumentBlob(docId);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'document';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast(err.message || 'Could not download document.');
    }
  };

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

  const handleIdTypeChange = (newType) => {
    setForm((prev) => ({
      ...prev,
      idProofType: newType,
      idProofNumber: '',
    }));
    if (formErrors.idProofNumber) {
      setFormErrors((prev) => ({ ...prev, idProofNumber: null }));
    }
  };

  const handleIdNumberChange = (raw) => {
    const res = handleIdNumberInputChange(raw, form.idProofType);
    setForm((prev) => ({ ...prev, idProofNumber: res.value }));
    if (formErrors.idProofNumber) {
      setFormErrors((prev) => ({ ...prev, idProofNumber: null }));
    }
  };

  const validateForm = () => {
    const errs = {};
    if (!form.name.trim()) {
      errs.name = 'Guest name is required.';
    }
    const phoneValidation = validatePhone(form.phone);
    if (!phoneValidation.isValid) {
      errs.phone = phoneValidation.error;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Enter a valid email address.';
    }
    if (form.idProofNumber.trim()) {
      if (!form.idProofType) {
        errs.idProofNumber = 'Please select an ID proof type above.';
      } else {
        const idVal = validateIdNumber(form.idProofNumber, form.idProofType, { isOptional: false });
        if (!idVal.isValid) {
          errs.idProofNumber = idVal.error;
        }
      }
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

  const idConfig = getIdProofConfig(form.idProofType);
  const isSameAsSaved = Boolean(guest?.idProofMasked && (guest.idProofType || guest.id_proof_type) === form.idProofType);

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
                onChange={(e) => {
                  const res = handlePhoneInputChange(e.target.value, form.phone);
                  handleEditChange('phone', res.value);
                  if (res.error) {
                    setFormErrors((prev) => ({ ...prev, phone: res.error }));
                  } else {
                    setFormErrors((prev) => ({ ...prev, phone: null }));
                  }
                }}
                placeholder="10-digit mobile (starts with 6-9)"
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
                  onChange={(e) => handleIdTypeChange(e.target.value)}
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
                {idConfig.label} {isSameAsSaved ? <span className="muted mono">({guest.idProofMasked})</span> : null}
              </label>
              <input
                id="gp-idnum"
                type="text"
                inputMode={idConfig.inputMode}
                maxLength={idConfig.maxLength}
                autoCapitalize={idConfig.autoCapitalize}
                autoCorrect="off"
                spellCheck="false"
                style={{ textTransform: form.idProofType === 'Aadhaar' ? 'none' : 'uppercase' }}
                value={form.idProofNumber}
                onChange={(e) => handleIdNumberChange(e.target.value)}
                placeholder={isSameAsSaved ? 'Leave blank to keep existing ID number' : idConfig.placeholder}
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

            {/* Section B: Booking History */}
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                Booking History ({guest.bookings?.length || 0})
              </h4>
              {guest.bookings && guest.bookings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {guest.bookings.map((b) => (
                    <div key={b.id} style={{ padding: '10px 12px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div>
                          <button
                            type="button"
                            className="link"
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: 'var(--color-primary, #4338ca)',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                            onClick={() => onOpenBooking?.(b.id)}
                            title="Click to open booking details"
                          >
                            {b.booking_code}
                          </button>
                          <span style={{ marginLeft: 8, fontWeight: 600 }}>Room {b.room_no}</span>
                        </div>
                        <span className={`tag s-${b.status}`} style={{ fontSize: 11 }}>{b.status}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '4px 8px', color: 'var(--color-text-secondary)', fontSize: 11.5 }}>
                        <div><b>Dates:</b> {fd(b.check_in_date)} → {fd(b.check_out_date)}</div>
                        <div><b>Expected:</b> {b.persons} {b.persons === 1 ? 'person' : 'persons'}</div>
                        <div><b>Source:</b> {b.booking_source || 'Social Media'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No bookings found.</div>
              )}
            </div>

            {/* Section C: Check-In / Stay History */}
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                Check-In / Stay History ({guest.stays?.length || 0})
              </h4>
              {guest.stays && guest.stays.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {guest.stays.map((s) => (
                    <div key={s.id} style={{ padding: '10px 12px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div>
                          {s.reservation_id && s.booking_code ? (
                            <button
                              type="button"
                              className="link"
                              style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color: 'var(--color-primary, #4338ca)',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                              onClick={() => onOpenBooking?.(s.reservation_id)}
                              title="Click to open linked booking details"
                            >
                              {s.booking_code}
                            </button>
                          ) : (
                            <span className="tag" style={{ fontSize: 11, background: '#f1f5f9', color: '#475569' }}>Direct Check-In</span>
                          )}
                          <span style={{ marginLeft: 8, fontWeight: 600 }}>Room {s.room_no}</span>
                        </div>
                        <span className={`tag s-${s.status}`} style={{ fontSize: 11 }}>{s.status}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '4px 8px', color: 'var(--color-text-secondary)', fontSize: 11.5 }}>
                        <div><b>Check-in:</b> {fd(s.check_in_date)}</div>
                        <div><b>Check-out:</b> {s.status === 'checked_out' && s.checkout_actual ? fd(s.checkout_actual) : fd(s.checkout_planned)}</div>
                        <div><b>Actual:</b> {s.persons} {s.persons === 1 ? 'person staying' : 'persons staying'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No stays yet.</div>
              )}
            </div>

            {/* Section D: ID Proof Documents */}
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                ID Proof Documents ({guest.documents?.length || 0})
              </h4>
              {(() => {
                const docs = (() => {
                  const list = [...(guest.documents || [])];
                  const seenIds = new Set(list.map((d) => d.id));
                  for (const st of guest.stays || []) {
                    for (const d of st.documents || []) {
                      if (!seenIds.has(d.id)) {
                        seenIds.add(d.id);
                        list.push({ ...d, related_label: d.related_label || `Stay #${st.id} (Room ${st.room_no})` });
                      }
                    }
                    for (const occ of st.occupants || []) {
                      for (const d of occ.documents || []) {
                        if (!seenIds.has(d.id)) {
                          seenIds.add(d.id);
                          list.push({ ...d, occupant_name: occ.name, is_primary: occ.is_primary, related_label: d.related_label || `Stay #${st.id} (Room ${st.room_no})` });
                        }
                      }
                    }
                  }
                  for (const bk of guest.bookings || []) {
                    for (const d of bk.documents || []) {
                      if (!seenIds.has(d.id)) {
                        seenIds.add(d.id);
                        list.push({ ...d, related_label: d.related_label || `Booking ${bk.booking_code || '#' + bk.id}` });
                      }
                    }
                  }
                  return list;
                })();
                if (docs.length === 0) {
                  return <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No ID proof documents uploaded</div>;
                }
                const groups = {};
                for (const doc of docs) {
                  const key = doc.reservation_id ? `res_${doc.reservation_id}` : `stay_${doc.stay_id}`;
                  if (!groups[key]) {
                    const title = doc.reservation_id
                      ? `Booking ${doc.booking_code || '#' + doc.reservation_id} (Room ${doc.room_no || '—'})`
                      : `Stay (Room ${doc.room_no || '—'} · Direct Check-In)`;
                    groups[key] = { key, title, docs: [] };
                  }
                  groups[key].docs.push(doc);
                }
                const groupList = Object.values(groups);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {groupList.map((group) => (
                      <div key={group.key} style={{ padding: '8px 10px', background: 'var(--color-bg-secondary, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-heading)', marginBottom: 6 }}>
                          📁 {group.title}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {group.docs.map((doc) => (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 4, fontSize: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: doc.original_filename?.toLowerCase().endsWith('.pdf') ? '#fee2e2' : '#e0e7ff', color: doc.original_filename?.toLowerCase().endsWith('.pdf') ? '#991b1b' : '#3730a3', textTransform: 'uppercase' }}>
                                  {doc.original_filename?.split('.').pop() || 'FILE'}
                                </span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }} title={doc.original_filename}>
                                  {doc.original_filename}
                                </span>
                                <span className="muted" style={{ fontSize: 11 }}>
                                  ({formatFileSize(doc.file_size)} · {doc.uploaded_at ? fd(doc.uploaded_at.split(' ')[0]) : '—'})
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  type="button"
                                  className="btn sm"
                                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', minWidth: 'auto' }}
                                  onClick={() => handleViewDoc(doc.id)}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="btn sm"
                                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', minWidth: 'auto' }}
                                  onClick={() => handleDownloadDoc(doc.id, doc.original_filename)}
                                >
                                  Download
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            {/* Section E: People Referred by This Guest */}
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                People Referred by This Guest ({(guest.referrals || guest.referred_guests)?.length || 0})
              </h4>
              {(() => {
                const refs = guest.referrals || guest.referred_guests || [];
                if (refs.length === 0) {
                  return <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No guests referred yet.</div>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {refs.map((rg, idx) => (
                      <div key={`${rg.guest_id}-${rg.reservation_id || idx}`} style={{ padding: '10px 12px', background: 'var(--color-surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, fontSize: 12.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-primary, #70265F)' }}>{rg.guest_name || rg.name}</span>
                          <span className={`tag s-${rg.status}`} style={{ fontSize: 11 }}>{rg.status}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '4px 8px', color: 'var(--color-text-secondary)', fontSize: 11.5 }}>
                          <div><b>Mobile:</b> <span className="mono">{rg.guest_phone || rg.phone}</span></div>
                          <div><b>Booking:</b> {rg.booking_code || (rg.reservation_id ? '#' + rg.reservation_id : '—')}</div>
                          <div><b>Room:</b> {rg.room_no ? `Room ${rg.room_no}` : '—'}</div>
                          <div><b>Check-In:</b> {rg.check_in_date ? fd(rg.check_in_date.split(' ')[0]) : '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
