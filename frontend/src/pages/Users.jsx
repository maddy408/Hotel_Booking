import { useState } from 'react';
import { useUsers } from '../api/users';
import UserFormSheet from '../components/sheets/UserFormSheet.jsx';

export default function Users() {
  const { data: users, isLoading, isError, error, refetch } = useUsers();
  const [sheet, setSheet] = useState(null);

  return (
    <div className="panel">
      <div className="ph">
        <h2>
          Users <span className="muted mono" style={{ fontSize: 15 }}>{users?.length ?? ''}</span>
        </h2>
        <button className="btn dark" type="button" onClick={() => setSheet({ type: 'add' })}>
          + Add user
        </button>
      </div>

      {isLoading ? (
        <div className="sb">
          <div className="skel" style={{ height: 160 }} />
        </div>
      ) : isError ? (
        <div className="empty">
          Could not load users: {error.message}
          <div style={{ marginTop: 10 }}>
            <button className="btn sm" type="button" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <div className="tw">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} onClick={() => setSheet({ type: 'edit', user: u })}>
                  <td>
                    <b>{u.name}</b>
                  </td>
                  <td className="mono">{u.username}</td>
                  <td>{u.role_name}</td>
                  <td>{u.email || '—'}</td>
                  <td>
                    <span className={`tag ${u.is_active ? 's-free' : 's-repair'}`}>{u.is_active ? 'Active' : 'Disabled'}</span>
                  </td>
                  <td className="muted">{u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sheet?.type === 'add' && <UserFormSheet onClose={() => setSheet(null)} />}
      {sheet?.type === 'edit' && <UserFormSheet user={sheet.user} onClose={() => setSheet(null)} />}
    </div>
  );
}
