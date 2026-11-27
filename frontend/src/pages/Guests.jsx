import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGuests } from '../api/guests';
import { useRooms } from '../api/rooms';
import GuestEditSheet from '../components/sheets/GuestEditSheet.jsx';
import NewBookingSheet from '../components/sheets/NewBookingSheet.jsx';
import CheckoutSheet from '../components/sheets/CheckoutSheet.jsx';
import BookingDetailSheet from '../components/sheets/BookingDetailSheet.jsx';

export const GUEST_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_house', label: 'In-House' },
  { key: 'booked', label: 'Booked' },
  { key: 'checked_out', label: 'Checked Out' },
  { key: 'no_show', label: 'No-Show' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function Guests() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: guests, isLoading, isError, error, refetch } = useGuests(q);
  const { data: roomsData } = useRooms();
  const [sheet, setSheet] = useState(null);
  const [expandedOccupantsGuestId, setExpandedOccupantsGuestId] = useState(null);

  const sortedGuests = useMemo(() => {
    const list = (guests || []).filter((g) => {
      if (statusFilter !== 'all') {
        const key = g.statusKey || g.status_key || (g.status || '').toLowerCase().replace(/[\s-]/g, '_');
        if (key !== statusFilter) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      const dateA = a.created_at || a.createdAt || '';
      const dateB = b.created_at || b.createdAt || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [guests, statusFilter]);

  // Close occupant popover when clicking anywhere outside
  useEffect(() => {
    const handleDocumentClick = () => {
      setExpandedOccupantsGuestId(null);
    };
    window.addEventListener('click', handleDocumentClick);
    return () => window.removeEventListener('click', handleDocumentClick);
  }, []);

  const openRoomByNo = (roomNo) => {
    const room = roomsData?.rooms.find((r) => r.roomNo === roomNo);
    if (room?.stayId) setSheet({ type: 'checkout', stayId: room.stayId });
  };

  const renderStatusBadge = (status, statusKey) => {
    switch (statusKey) {
      case 'in_house':
        return (
          <span
            className="tag s-occupied"
            style={{ fontWeight: 700, fontSize: '11.5px', whiteSpace: 'nowrap' }}
          >
            In-House
          </span>
        );
      case 'booked':
        return (
          <span
            className="tag s-booked"
            style={{ fontWeight: 700, fontSize: '11.5px', whiteSpace: 'nowrap' }}
          >
            Booked
          </span>
        );
      case 'checked_out':
        return (
          <span
            className="tag"
            style={{
              background: '#F1F5F9',
              color: '#475569',
              borderColor: '#CBD5E1',
              fontWeight: 700,
              fontSize: '11.5px',
              whiteSpace: 'nowrap',
            }}
          >
            Checked Out
          </span>
        );
      case 'no_show':
        return (
          <span
            className="tag"
            style={{
              background: '#FEF3C7',
              color: '#92400E',
              borderColor: '#FCD34D',
              fontWeight: 700,
              fontSize: '11.5px',
              whiteSpace: 'nowrap',
            }}
          >
            No-Show
          </span>
        );
      case 'cancelled':
        return (
          <span
            className="tag"
            style={{
              background: '#FEE2E2',
              color: '#991B1B',
              borderColor: '#FCA5A5',
              fontWeight: 700,
              fontSize: '11.5px',
              whiteSpace: 'nowrap',
            }}
          >
            Cancelled
          </span>
        );
      case 'not_staying':
      default:
        return (
          <span
            className="tag"
            style={{
              background: '#F8F5FA',
              color: '#81748C',
              borderColor: '#EAE4EF',
              fontWeight: 700,
              fontSize: '11.5px',
              whiteSpace: 'nowrap',
            }}
          >
            Not Staying
          </span>
        );
    }
  };

  const renderOccupants = (g) => {
    if (g.occupantsStatus === 'not_added_yet') {
      return (
        <span
          style={{
            color: 'var(--color-muted, #81748C)',
            fontSize: '12px',
            fontStyle: 'italic',
          }}
        >
          Not added yet
        </span>
      );
    }

    const occupants = g.occupants || [];
    if (occupants.length === 0) {
      return <span className="muted">—</span>;
    }

    const visibleOccupants = occupants.slice(0, 2);
    const hiddenCount = occupants.length - 2;
    const isPopoverOpen = expandedOccupantsGuestId === g.id;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', position: 'relative' }}>
        {visibleOccupants.map((occ, idx) => (
          <div
            key={idx}
            style={{
              fontSize: '12px',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={`${occ.name} (${occ.role || (occ.isPrimary ? 'Primary Guest' : 'Additional Occupant')})`}
          >
            <span
              style={{
                fontWeight: 600,
                color: 'var(--color-text-primary, #30223D)',
              }}
            >
              {occ.name}
            </span>{' '}
            <span
              style={{
                fontSize: '11px',
                color: occ.isPrimary ? 'var(--color-primary, #70265F)' : 'var(--color-muted, #81748C)',
                fontWeight: occ.isPrimary ? 600 : 400,
              }}
            >
              ({occ.role || (occ.isPrimary ? 'Primary Guest' : 'Additional Occupant')})
            </span>
          </div>
        ))}

        {hiddenCount > 0 && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              className="occupant-expand-btn"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedOccupantsGuestId(isPopoverOpen ? null : g.id);
              }}
              title={
                'Additional occupants:\n' +
                occupants
                  .slice(2)
                  .map((o) => `• ${o.name} (${o.role})`)
                  .join('\n')
              }
              style={{
                background: 'var(--color-surface-hover, #F8F5FA)',
                border: '1px solid var(--color-border, #EAE4EF)',
                borderRadius: '12px',
                padding: '1px 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-primary, #70265F)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                marginTop: '1px',
              }}
            >
              +{hiddenCount} more
            </button>

            {isPopoverOpen && (
              <div
                className="occupant-popover"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 100,
                  background: '#ffffff',
                  border: '1px solid var(--color-border, #EAE4EF)',
                  borderRadius: '8px',
                  boxShadow: '0 6px 20px rgba(48, 34, 61, 0.16)',
                  padding: '10px 14px',
                  minWidth: '240px',
                  maxWidth: '320px',
                  marginTop: '4px',
                }}
              >
                <div
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: 'var(--color-header, #70265F)',
                    marginBottom: '6px',
                    borderBottom: '1px solid var(--color-border, #EAE4EF)',
                    paddingBottom: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>All Occupants ({occupants.length})</span>
                  <button
                    type="button"
                    onClick={() => setExpandedOccupantsGuestId(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '15px',
                      padding: 0,
                      color: 'var(--color-muted)',
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {occupants.map((occ, oIdx) => (
                    <div
                      key={oIdx}
                      style={{
                        fontSize: '12px',
                        padding: '2px 0',
                        borderBottom:
                          oIdx === occupants.length - 1 ? 'none' : '1px dashed #F1EDF5',
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--color-text-primary, #30223D)',
                        }}
                      >
                        {occ.name}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: occ.isPrimary
                            ? 'var(--color-primary, #70265F)'
                            : 'var(--color-muted, #81748C)',
                          marginLeft: '5px',
                        }}
                      >
                        ({occ.role || (occ.isPrimary ? 'Primary Guest' : 'Additional Occupant')})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderReferredBy = (g) => {
    if (!g.referredBy) {
      return <span className="muted">—</span>;
    }
    return (
      <button
        type="button"
        className="link"
        title={`Referred by ${g.referredBy.name} (Click to open profile)`}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/guests/${g.referredBy.id}`);
        }}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'var(--color-primary, #70265F)',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: '12.5px',
          fontWeight: 600,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'inline-block',
          verticalAlign: 'middle',
        }}
      >
        {g.referredBy.name}
      </button>
    );
  };

  return (
    <div className="panel">
      <style>{`
        /* Guest & Occupancy Register Layout */
        .register-container {
          width: 100%;
          box-sizing: border-box;
        }

        .register-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
        }

        .register-table th,
        .register-table td {
          padding: 8px 10px;
          vertical-align: middle;
          box-sizing: border-box;
        }

        .register-table tbody tr:hover {
          background-color: var(--color-surface-hover, #F8F5FA);
        }

        .register-desktop-view {
          display: block;
        }

        .register-cards-view {
          display: none;
        }

        @media (max-width: 960px) {
          .register-desktop-view {
            display: none;
          }
          .register-cards-view {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 8px 0;
          }
        }
      `}</style>

      {/* Header */}
      <div
        className="ph"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            Guest &amp; Occupancy Register
            <span className="muted mono" style={{ fontSize: 15, fontWeight: 500 }}>
              {guests?.length ?? ''}
            </span>
          </h2>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: 2 }}>
            Reception register tracking current stays, room occupants, upcoming arrivals, and referrals
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search name or mobile"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 'min(280px, 100%)' }}
            aria-label="Search guests"
          />
          <button
            type="button"
            className="btn dark"
            style={{
              backgroundColor: 'var(--color-header, #70265F)',
              borderColor: 'var(--color-header, #70265F)',
              color: '#ffffff',
            }}
            onClick={() => navigate('/guests/referrals')}
          >
            All Referrals
          </button>
        </div>
      </div>

      {/* Status Filter Chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        <div className="seg" role="tablist" aria-label="Status Filter">
          {GUEST_STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={statusFilter === f.key ? 'active' : ''}
              aria-pressed={statusFilter === f.key}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: '13px', marginLeft: 'auto' }}>
          Showing {sortedGuests.length} of {guests?.length ?? 0} guests
        </span>
      </div>

      {isLoading ? (
        <div className="sb">
          <div className="skel" style={{ height: 220 }} />
        </div>
      ) : isError ? (
        <div className="empty">
          Could not load guests: {error.message}
          <div style={{ marginTop: 10 }}>
            <button className="btn sm" type="button" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="register-container">
          {/* Desktop Table View (Fits within screen width, no horizontal scroll) */}
          <div className="register-desktop-view">
            <table className="data register-table">
              <colgroup>
                <col style={{ width: '18%' }} /> {/* 1. Guest */}
                <col style={{ width: '9%' }} />  {/* 2. Room */}
                <col style={{ width: '7%' }} />  {/* 3. Persons */}
                <col style={{ width: '25%' }} /> {/* 4. Occupants */}
                <col style={{ width: '15%' }} /> {/* 5. Referred By */}
                <col style={{ width: '7%' }} />  {/* 6. Visits */}
                <col style={{ width: '10%' }} /> {/* 7. Status */}
                <col style={{ width: '9%' }} />  {/* 8. Action */}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Guest</th>
                  <th style={{ textAlign: 'left' }}>Room</th>
                  <th style={{ textAlign: 'center' }}>Persons</th>
                  <th style={{ textAlign: 'left' }}>Occupants</th>
                  <th style={{ textAlign: 'left' }}>Referred By</th>
                  <th style={{ textAlign: 'center' }}>Visits</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedGuests && sortedGuests.length ? (
                  sortedGuests.map((g) => (
                    <tr
                      key={g.id}
                      onClick={() => navigate(`/guests/${g.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* 1. Guest (Name + Mobile) */}
                      <td>
                        <button
                          type="button"
                          className="link"
                          style={{
                            fontWeight: 700,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: 'var(--color-primary, #70265F)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '13.5px',
                            display: 'block',
                            lineHeight: 1.25,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/guests/${g.id}`);
                          }}
                        >
                          {g.name}
                        </button>
                        <span
                          className="mono"
                          style={{
                            fontSize: '12px',
                            color: 'var(--color-muted, #81748C)',
                            display: 'block',
                            marginTop: '2px',
                          }}
                        >
                          {g.phone}
                        </span>
                      </td>

                      {/* 2. Room */}
                      <td>
                        {(g.room ?? g.room_no ?? g.roomNo) ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span
                              className="rtag"
                              style={{
                                fontWeight: 700,
                                padding: '2px 8px',
                                fontSize: '12px',
                              }}
                            >
                              {g.room ?? g.room_no ?? g.roomNo}
                            </span>
                            {g.additionalRooms && g.additionalRooms.length > 0 && (
                              <span
                                className="tag sm"
                                title={`Additional active rooms: ${g.additionalRooms.join(', ')}`}
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  background: 'var(--occ-bg)',
                                  color: 'var(--occ)',
                                  borderColor: 'var(--occ-border)',
                                }}
                              >
                                +{g.additionalRooms.length}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      {/* 3. Persons */}
                      <td style={{ textAlign: 'center' }}>
                        {g.persons !== null && g.persons !== undefined ? (
                          <span
                            className="mono"
                            style={{
                              fontWeight: 700,
                              fontSize: '13px',
                              color: 'var(--color-text-primary, #30223D)',
                            }}
                          >
                            {g.persons}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>

                      {/* 4. Occupants */}
                      <td>{renderOccupants(g)}</td>

                      {/* 5. Referred By */}
                      <td>{renderReferredBy(g)}</td>

                      {/* 6. Visits */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className="mono"
                          style={{
                            fontWeight: 700,
                            fontSize: '13px',
                            color: 'var(--color-text-primary, #30223D)',
                          }}
                        >
                          {g.visits}
                        </span>
                      </td>

                      {/* 7. Status */}
                      <td style={{ textAlign: 'center' }}>
                        {renderStatusBadge(g.status, g.statusKey)}
                      </td>

                      {/* 8. Action (View and Edit) */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '6px',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            type="button"
                            className="btn sm"
                            style={{
                              padding: '3px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--color-primary, #70265F)',
                              borderColor: 'var(--color-primary, #70265F)',
                              background: 'transparent',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/guests/${g.id}`);
                            }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            style={{
                              padding: '3px 8px',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSheet({ type: 'edit', id: g.id });
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="empty">
                      No guests registered or found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tablet & Mobile Responsive Cards View */}
          <div className="register-cards-view">
            {sortedGuests && sortedGuests.length ? (
              sortedGuests.map((g) => (
                <div
                  key={g.id}
                  className="register-card"
                  onClick={() => navigate(`/guests/${g.id}`)}
                  style={{
                    background: '#ffffff',
                    border: '1px solid var(--color-border, #EAE4EF)',
                    borderRadius: '10px',
                    padding: '14px',
                    boxShadow: '0 1px 3px rgba(48, 34, 61, 0.04)',
                    cursor: 'pointer',
                  }}
                >
                  {/* Top: Name, Phone & Status */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '15px',
                          color: 'var(--color-primary, #70265F)',
                        }}
                      >
                        {g.name}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: '12px',
                          color: 'var(--color-muted)',
                          marginTop: 2,
                        }}
                      >
                        {g.phone}
                      </div>
                    </div>
                    <div>{renderStatusBadge(g.status, g.statusKey)}</div>
                  </div>

                  {/* Middle Info Grid */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                      gap: '8px 12px',
                      background: '#FAF8FC',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          display: 'block',
                        }}
                      >
                        Room
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>
                        {(g.room ?? g.room_no ?? g.roomNo) ? (
                          <>
                            Room {g.room ?? g.room_no ?? g.roomNo}
                            {g.additionalRooms && g.additionalRooms.length > 0 && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  color: 'var(--occ)',
                                  marginLeft: 4,
                                }}
                              >
                                (+{g.additionalRooms.length})
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          display: 'block',
                        }}
                      >
                        Persons
                      </span>
                      <span className="mono" style={{ fontWeight: 600, fontSize: '13px' }}>
                        {g.persons ?? '—'}
                      </span>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          display: 'block',
                        }}
                      >
                        Visits
                      </span>
                      <span className="mono" style={{ fontWeight: 600, fontSize: '13px' }}>
                        {g.visits}
                      </span>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          display: 'block',
                        }}
                      >
                        Referred By
                      </span>
                      {renderReferredBy(g)}
                    </div>

                    <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-muted)',
                          display: 'block',
                          marginBottom: 2,
                        }}
                      >
                        Occupants
                      </span>
                      {renderOccupants(g)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      type="button"
                      className="btn sm"
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--color-primary, #70265F)',
                        borderColor: 'var(--color-primary, #70265F)',
                        background: 'transparent',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/guests/${g.id}`);
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSheet({ type: 'edit', id: g.id });
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty">No guests registered or found.</div>
            )}
          </div>
        </div>
      )}

      {/* Sheets / Modals */}
      {sheet?.type === 'edit' && (
        <GuestEditSheet
          guestId={sheet.id}
          onClose={() => setSheet(null)}
          onSaved={() => refetch()}
          onDeleted={() => {
            setSheet(null);
            refetch();
          }}
          onViewBooking={(bookingId) => setSheet({ type: 'booking', id: Number(bookingId) })}
        />
      )}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet reservationId={sheet.id} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === 'newBooking' && (
        <NewBookingSheet presetGuest={sheet.guest} onClose={() => setSheet(null)} />
      )}
      {sheet?.type === 'checkout' && (
        <CheckoutSheet stayId={sheet.stayId} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
