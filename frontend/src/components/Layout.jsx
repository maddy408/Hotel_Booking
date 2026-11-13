import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../api/settings';
import { fdLong, todayIso } from '../lib/format';

const ALL_TABS = [
  {
    to: '/',
    label: 'Rooms',
    roles: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9" />
      </svg>
    ),
  },
  {
    to: '/bookings',
    label: 'Bookings',
    roles: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    to: '/today-checkouts',
    label: 'Daily Ops',
    roles: ['admin', 'manager', 'receptionist'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    to: '/guests',
    label: 'Guests',
    roles: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    to: '/bills',
    label: 'Bills',
    roles: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    to: '/reports',
    label: 'Reports',
    roles: ['admin', 'manager'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    to: '/room-master',
    label: 'Room Master',
    roles: ['admin', 'manager'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    to: '/users',
    label: 'Users',
    roles: ['admin'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    roles: ['admin'],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const { data } = useSettings();
  const hotel = data?.hotel;
  const location = useLocation();

  // Close drawer whenever route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const tabs = ALL_TABS.filter((t) => !t.roles || t.roles.includes(user?.role));

  // Bottom Navigation tabs for fast mobile access
  const primaryBottomNav = [
    { to: '/', label: 'Rooms', icon: ALL_TABS[0].icon },
    { to: '/bookings', label: 'Bookings', icon: ALL_TABS[1].icon },
    { to: '/today-checkouts', label: 'Daily Ops', icon: ALL_TABS[2].icon },
    { to: '/guests', label: 'Guests', icon: ALL_TABS[3].icon },
    { to: '/bills', label: 'Bills', icon: ALL_TABS[4].icon },
  ];

  return (
    <div className="app-shell">
      {/* Top Header Bar */}
      <header className="bar gut">
        <div className="inner">
          <div className="brand-group">
            <button
              type="button"
              className="drawer-toggle-btn"
              aria-label="Open navigation menu"
              onClick={() => setDrawerOpen(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="crest" aria-hidden="true" title={hotel?.name || 'Tamarind Court'}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3c-1.5 3-4 7-8 9 2.5 1 5.5 1 8-1 2.5 2 5.5 2 8 1-4-2-6.5-6-8-9Z" />
                <path d="M12 11c-2 2.5-5 4-8 4 2 2 5 2.5 8 0 3 2.5 6 2 8 0-3 0-6-1.5-8-4Z" />
                <path d="M12 15c-1 2-3 4-6 4 2 1.5 4 1.5 6 0 2 1.5 4 1.5 6 0-3 0-5-2-6-4Z" />
              </svg>
            </div>
            <div className="brand-titles">
              <h1>{hotel?.name || 'Tamarind Court'}</h1>
              <small>{(hotel?.place ? hotel.place + ' · ' : '') + fdLong(todayIso())}</small>
            </div>
          </div>

          <div className="sp" />

          {/* Desktop Tab Navigation */}
          <nav className="desktop-tabs" role="tablist">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                role="tab"
                className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
              >
                <span className="tab-icon">{t.icon}</span>
                <span>{t.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Desktop Right User Chip */}
          <div className="nav-right">
            <div className="nav-divider" />
            <div className="userchip">
              <span>{user?.name || 'Admin'} - </span>
              <span className="user-role">{user?.roleName || 'Administrator'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8, marginLeft: 2 }} aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <button type="button" className="btn-logout" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer (Side Menu Navigation) */}
      <div 
        className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />
      
      <aside className={`mobile-drawer ${drawerOpen ? 'open' : ''}`} aria-label="Mobile Navigation">
        <div className="drawer-header">
          <div className="brand-group">
            <div className="crest">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 3c-1.5 3-4 7-8 9 2.5 1 5.5 1 8-1 2.5 2 5.5 2 8 1-4-2-6.5-6-8-9Z" />
                <path d="M12 11c-2 2.5-5 4-8 4 2 2 5 2.5 8 0 3 2.5 6 2 8 0-3 0-6-1.5-8-4Z" />
              </svg>
            </div>
            <div>
              <h3>{hotel?.name || 'Tamarind Court'}</h3>
              <p className="drawer-hotel-sub">{hotel?.place || 'Front Desk System'}</p>
            </div>
          </div>
          <button 
            type="button" 
            className="drawer-close-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="drawer-user-info">
          <div className="drawer-avatar">
            {(user?.name || 'A')[0].toUpperCase()}
          </div>
          <div className="drawer-user-meta">
            <strong>{user?.name || 'Admin'}</strong>
            <span className="drawer-badge">{user?.roleName || 'Administrator'}</span>
          </div>
        </div>

        <nav className="drawer-nav">
          <div className="drawer-section-title">Navigation Menu</div>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              onClick={() => setDrawerOpen(false)}
              className={({ isActive }) => `drawer-item${isActive ? ' active' : ''}`}
            >
              <span className="drawer-icon">{t.icon}</span>
              <span className="drawer-label">{t.label}</span>
              <svg className="drawer-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </NavLink>
          ))}
        </nav>

        <div className="drawer-footer">
          <button 
            type="button" 
            className="drawer-logout-btn"
            onClick={() => {
              setDrawerOpen(false);
              logout();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Body */}
      <main className="gut main-content-wrap">
        <div className="inner">
          <Outlet />
        </div>
      </main>

      {/* Mobile Professional Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
        {primaryBottomNav.map((b) => (
          <NavLink
            key={b.to}
            to={b.to}
            end={b.to === '/'}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <span className="bottom-nav-icon">{b.icon}</span>
            <span className="bottom-nav-label">{b.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`bottom-nav-item bottom-nav-more ${drawerOpen ? 'active' : ''}`}
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="More navigation options"
        >
          <span className="bottom-nav-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="1.5"></circle>
              <circle cx="19" cy="12" r="1.5"></circle>
              <circle cx="5" cy="12" r="1.5"></circle>
            </svg>
          </span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </div>
  );
}
