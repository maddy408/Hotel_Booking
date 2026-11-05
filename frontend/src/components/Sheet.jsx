import { useEffect } from 'react';

/**
 * The single popup pattern the whole app uses for room actions: a centered modal on
 * desktop, a bottom sheet on mobile (handled purely by CSS). Esc and scrim-click close it.
 */
export default function Sheet({ onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}

export function SheetHeader({ status, badge, title, subtitle, onClose }) {
  return (
    <div className={`sh${status ? ` s-${status}` : ''}`}>
      {badge !== undefined && <span className="badge">{badge}</span>}
      <h2>
        {title}
        {subtitle && <small>{subtitle}</small>}
      </h2>
      <button className="x" type="button" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>
  );
}
