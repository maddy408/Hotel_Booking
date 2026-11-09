import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { buildWhatsAppMessage, cleanPhoneForWhatsApp } from '../../lib/whatsapp.js';

export default function WhatsAppSheet({ checkout, hotel, template, today, onClose }) {
  const toast = useToast();

  const initialMessage = buildWhatsAppMessage(template, {
    guestName: checkout.guest_name,
    roomNo: checkout.room_no,
    checkoutTime: checkout.checkout_time,
    checkoutDate: checkout.checkout_planned || today,
    hotelName: hotel?.name,
    hotelPhone: hotel?.phone,
    status: checkout.checkout_status_label,
  });

  const [message, setMessage] = useState(initialMessage);
  const cleanPhone = checkout.whatsapp_phone || cleanPhoneForWhatsApp(checkout.guest_phone);
  const canSend = Boolean(cleanPhone && message.trim());

  const handleOpenWhatsApp = () => {
    if (!cleanPhone) {
      toast('Guest mobile number is missing or invalid.');
      return;
    }
    const encoded = encodeURIComponent(message.trim());
    const url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    toast(`Opening WhatsApp chat with ${checkout.guest_name}...`);
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
        status="cleaning"
        badge={checkout.room_no}
        title="Send WhatsApp Message"
        subtitle={`${checkout.guest_name} · ${checkout.room_type_name}`}
        onClose={onClose}
      />

      <div className="sb">
        {/* 2-column responsive details card with subtle lavender background */}
        <div className="wa-card">
          <div className="wa-details-grid">
            <div className="wa-detail-item">
              <span className="wa-detail-label">Guest Name</span>
              <span className="wa-detail-value">{checkout.guest_name}</span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Room Number</span>
              <span className="wa-detail-value">
                Room {checkout.room_no} <span className="muted" style={{ fontWeight: 500, fontSize: 13 }}>({checkout.room_type_name})</span>
              </span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Mobile Number</span>
              <span className="wa-detail-value mono">
                {checkout.guest_phone || <span className="muted">—</span>}
              </span>
            </div>
            <div className="wa-detail-item">
              <span className="wa-detail-label">Checkout Time</span>
              <span className="wa-detail-value">{checkout.checkout_time}</span>
            </div>
          </div>

          <div className="wa-status-row">
            <span className="wa-detail-label">Checkout Status</span>
            <span className={`tag ${checkout.checkout_status === 'checked_out' ? 's-occupied' : 's-booked'}`}>
              {checkout.checkout_status_label}
            </span>
          </div>
        </div>

        {/* Message editor section */}
        <div className="wa-editor-section">
          <div className="wa-editor-header">
            <div className="wa-editor-title-group">
              <h3 className="wa-editor-title">WhatsApp Message</h3>
              <span className="wa-pill" title="Pre-filled using the editable template configured in Settings">
                Settings Template
              </span>
            </div>
            <button
              type="button"
              className="btn sm wa-reset-btn"
              onClick={handleResetToTemplate}
              title="Reset message back to the template configured in Settings"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset to Template
            </button>
          </div>

          <textarea
            id="wa-custom-msg"
            rows={5}
            className="wa-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type WhatsApp message here..."
            aria-label="WhatsApp Message"
          />
        </div>

        {/* Footer actions */}
        <div className="wa-footer">
          <button
            type="button"
            className="btn wa-send-btn"
            disabled={!canSend}
            onClick={handleOpenWhatsApp}
            title={canSend ? 'Send message via WhatsApp' : 'Cannot send: invalid mobile number or empty message'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.076-1.109-.057-.27-.087-.604-.202-1.026-.384-1.785-.772-2.951-2.593-3.04-2.712-.089-.12-1.006-1.336-1.006-2.55 0-1.213.636-1.81.862-2.057.226-.247.492-.308.656-.308.164 0 .329.002.473.01.152.008.356-.058.556.423.206.494.7 1.706.762 1.83.061.123.102.268.02.43-.082.164-.123.266-.246.411-.123.144-.26.322-.37.432-.124.123-.253.256-.109.503.144.246.638 1.054 1.368 1.705.94.838 1.733 1.098 1.98 1.22.246.124.39.103.534-.062.144-.164.617-.719.781-.966.164-.246.328-.205.553-.123.226.082 1.437.678 1.684.801.246.124.41.185.472.288.061.103.061.597-.083 1.002z" />
            </svg>
            Send WhatsApp
          </button>

          <button
            type="button"
            className="btn wa-copy-btn"
            onClick={handleCopyMessage}
            title="Copy message text to clipboard"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Message
          </button>

          <button
            type="button"
            className="btn wa-close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </Sheet>
  );
}
