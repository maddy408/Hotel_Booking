import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { buildCheckInWhatsAppMessage, cleanPhoneForWhatsApp } from '../../lib/whatsapp.js';
import { fdWithYear } from '../../lib/format.js';

export default function CheckInWhatsAppSheet({ checkin, hotel, template, today, onClose }) {
  const toast = useToast();

  const checkinDateFormatted = checkin?.check_in_date ? fdWithYear(checkin.check_in_date) : fdWithYear(today);
  const checkoutDateFormatted = checkin?.checkout_planned ? fdWithYear(checkin.checkout_planned) : '';

  const initialMessage = buildCheckInWhatsAppMessage(template, {
    guestName: checkin?.guest_name,
    roomNo: checkin?.room_no,
    checkinDate: checkinDateFormatted,
    checkinTime: checkin?.check_in_time || '12:00 PM',
    checkoutDate: checkoutDateFormatted,
    checkoutTime: checkin?.checkout_time || '12:00 PM',
    hotelName: hotel?.name,
    hotelPhone: hotel?.phone,
  });

  const [message, setMessage] = useState(initialMessage);
  const cleanPhone = checkin?.whatsapp_phone || cleanPhoneForWhatsApp(checkin?.guest_phone);
  const canSend = Boolean(cleanPhone && message.trim());

  const handleOpenWhatsApp = () => {
    if (!cleanPhone) {
      toast('Guest mobile number is missing or invalid.');
      return;
    }
    const encoded = encodeURIComponent(message.trim());
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast(`Opening WhatsApp chat with ${checkin.guest_name}...`);
    onClose();
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast('Message copied to clipboard.');
    } catch {
      toast('Could not copy to clipboard.');
    }
  };

  const handleResetToTemplate = () => {
    setMessage(initialMessage);
    toast('Message reset to Settings template.');
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        status="booked"
        badge={checkin?.room_no}
        title="Send Check-in WhatsApp"
        subtitle={`${checkin?.guest_name || 'Guest'} · ${checkin?.room_type_name || ''}`}
        onClose={onClose}
      />

      <div className="sb">
        {/* Details card with subtle lavender background */}
        <div className="wa-card">
          <div className="wa-details-grid">
            <div className="wa-detail-item">
              <span className="wa-detail-label">Guest Name</span>
              <span className="wa-detail-value">{checkin?.guest_name}</span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Room Number</span>
              <span className="wa-detail-value">
                Room {checkin?.room_no} <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>({checkin?.room_type_name})</span>
              </span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Mobile Number</span>
              <span className="wa-detail-value mono">
                {checkin?.guest_phone || <span className="muted">—</span>}
              </span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Check-in Date &amp; Time</span>
              <span className="wa-detail-value">{checkinDateFormatted}, {checkin?.check_in_time}</span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Expected Check-out</span>
              <span className="wa-detail-value">{checkoutDateFormatted} at {checkin?.checkout_time}</span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Check-in Status</span>
              <span className="wa-detail-value">
                <span className={`tag ${checkin?.checkin_status === 'checked_in' ? 's-occupied' : 's-booked'}`}>
                  {checkin?.checkin_status_label}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Message editor section */}
        <div className="wa-editor-section">
          <div className="wa-editor-header">
            <div className="wa-editor-title-group">
              <h3 className="wa-editor-title">Check-in WhatsApp Message</h3>
              <span className="wa-pill" title="Pre-filled using the editable check-in template configured in Settings">
                Settings Template
              </span>
            </div>
            <button
              type="button"
              className="btn sm wa-reset-btn"
              onClick={handleResetToTemplate}
              title="Reset message back to the template configured in Settings"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset to Template
            </button>
          </div>

          <textarea
            id="wa-checkin-msg"
            rows={7}
            className="wa-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type WhatsApp check-in message here..."
            aria-label="Check-in WhatsApp Message"
          />
        </div>

        {/* Footer actions */}
        <div className="wa-footer">
          <button
            type="button"
            className="btn wa-send-btn"
            disabled={!canSend}
            onClick={handleOpenWhatsApp}
            title={canSend ? 'Open WhatsApp with message prefilled' : 'Cannot send: invalid mobile number or empty message'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.076-1.109-.057-.27-.087-.604-.202-1.026-.384-1.785-.772-2.951-2.593-3.04-2.712-.089-.12-1.006-1.336-1.006-2.55 0-1.213.636-1.81.862-2.057.226-.247.492-.308.656-.308.164 0 .329.002.473.01.152.008.356-.058.556.423.206.494.7 1.706.762 1.83.061.123.102.268.02.43-.082.164-.123.266-.246.411-.123.144-.26.322-.37.432-.124.123-.253.256-.109.503.144.246.638 1.054 1.368 1.705.94.838 1.733 1.098 1.98 1.22.246.124.39.103.534-.062.144-.164.617-.719.781-.966.164-.246.328-.205.553-.123.226.082 1.437.678 1.684.801.246.124.41.185.472.288.061.103.061.597-.083 1.002z" />
            </svg>
            Open WhatsApp
          </button>

          <button
            type="button"
            className="btn wa-copy-btn"
            onClick={handleCopyMessage}
            title="Copy message text to clipboard"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Message
          </button>
        </div>
      </div>
    </Sheet>
  );
}

