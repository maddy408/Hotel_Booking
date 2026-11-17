import { useState, useEffect, useRef } from 'react';
import { useGuests } from '../api/guests';

export default function ReferredBySelect({
  id = 'referred-by-select',
  value,
  onChange,
  initialGuest = null,
  excludeGuestId = null,
  disabled = false,
  hasError = false,
}) {
  const { data: guests, isLoading } = useGuests('');
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedGuest = (guests && guests.find((g) => g.id === Number(value)))
    || (initialGuest && initialGuest.id === Number(value) ? initialGuest : null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredGuests = (guests || []).filter((g) => {
    if (excludeGuestId && g.id === Number(excludeGuestId)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const nameMatch = (g.name || '').toLowerCase().includes(q);
    const phoneMatch = (g.phone || '').includes(q);
    return nameMatch || phoneMatch;
  });

  const handleSelect = (guest) => {
    onChange(guest.id, guest);
    setSearch('');
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null, null);
    setSearch('');
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          width: '100%',
        }}
      >
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={selectedGuest ? `${selectedGuest.name} (${selectedGuest.phone})` : 'Search guest by name or phone…'}
          value={isOpen ? search : (selectedGuest ? `${selectedGuest.name} (${selectedGuest.phone})` : '')}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearch('');
          }}
          disabled={disabled}
          style={{
            width: '100%',
            paddingRight: selectedGuest ? '32px' : '14px',
            borderColor: hasError ? 'var(--color-danger-border, #fca5a5)' : undefined,
          }}
        />
        {selectedGuest && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            title="Clear reference"
            aria-label="Clear selected reference"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              padding: '4px 6px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary, #666)',
              fontSize: '16px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {isOpen && !disabled && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--color-surface, #ffffff)',
            border: '1.5px solid var(--color-border, #e5e7eb)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 100,
          }}
        >
          {isLoading ? (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-secondary, #888)' }}>
              Loading guests…
            </div>
          ) : filteredGuests.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--color-text-secondary, #888)' }}>
              {search.trim() ? 'No matching guests found' : 'No guests available'}
            </div>
          ) : (
            filteredGuests.map((g) => {
              const isSelected = selectedGuest?.id === g.id;
              return (
                <div
                  key={g.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(g)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    background: isSelected ? 'var(--color-lavender, #ede9fe)' : 'transparent',
                    borderBottom: '1px solid var(--color-border-subtle, #f3f4f6)',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--color-surface-secondary, #f8f9fa)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ fontWeight: isSelected ? 700 : 600, color: 'var(--color-heading, inherit)' }}>
                    {g.name}
                  </div>
                  <div className="mono" style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                    {g.phone}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
