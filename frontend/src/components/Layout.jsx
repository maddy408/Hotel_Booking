import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../api/settings';
import { fdLong, todayIso } from '../lib/format';

const ALL_TABS = [
  { to: '/', label: 'Rooms', roles: null },
  { to: '/bookings', label: 'Bookings', roles: null },
  { to: '/today-checkouts', label: 'Daily Ops', roles: ['admin', 'manager', 'receptionist'] },
  { to: '/guests', label: 'Guests', roles: null },
  { to: '/bills', label: 'Bills', roles: null },
  { to: '/reports', label: 'Reports', roles: ['admin', 'manager'] },
  { to: '/room-master', label: 'Room Master', roles: ['admin', 'manager'] },
  { to: '/users', label: 'Users', roles: ['admin'] },
  { to: '/settings', label: 'Settings', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { data } = useSettings();
  const hotel = data?.hotel;
  const crest = (hotel?.name || 'Tamarind Court')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tabs = ALL_TABS.filter((t) => !t.roles || t.roles.includes(user?.role));

  return (
    <>
      <header className="bar gut">
        <div className="inner">
          <div className="crest">{crest}</div>
          <div>
            <h1>{hotel?.name || 'Tamarind Court'}</h1>
            <small>{(hotel?.place ? hotel.place + ' · ' : '') + fdLong(todayIso())}</small>
          </div>
          <div className="sp" />
          <nav className="tabs" role="tablist">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === '/'}
                role="tab"
                className={({ isActive }) => `tab${isActive ? ' active' : ''}`}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <div className="userchip">
            <span>
              {user?.name} · <span className="muted">{user?.roleName}</span>
            </span>
            <button type="button" className="btn sm" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="gut">
        <div className="inner">
          <Outlet />
        </div>
      </main>
    </>
  );
}
