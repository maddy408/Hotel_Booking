import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useCreateUser, useUpdateUser, useResetPassword, useRoles } from '../../api/users';
import { useToast } from '../../context/ToastContext.jsx';

export default function UserFormSheet({ user, onClose }) {
  const isEdit = !!user;
  const { data: roles } = useRoles();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const resetPassword = useResetPassword();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user?.name || '',
    username: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
    role: user?.role_code || 'receptionist',
    isActive: user ? !!user.is_active : true,
    password: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await updateUser.mutateAsync({ id: user.id, name: form.name, email: form.email || null, phone: form.phone || null, role: form.role, isActive: form.isActive });
        toast('User updated.');
      } else {
        if (form.password.length < 8) {
          toast('Password must be at least 8 characters.');
          return;
        }
        await createUser.mutateAsync({ name: form.name, username: form.username, email: form.email || null, phone: form.phone || null, role: form.role, password: form.password });
        toast(`User ${form.username} created.`);
      }
      onClose();
    } catch (err) {
      toast(err.message);
    }
  };

  const doReset = async () => {
    if (newPassword.length < 8) {
      toast('Password must be at least 8 characters.');
      return;
    }
    try {
      await resetPassword.mutateAsync({ id: user.id, password: newPassword });
      setNewPassword('');
      toast('Password reset.');
    } catch (err) {
      toast(err.message);
    }
  };

  const isPending = createUser.isPending || updateUser.isPending;

  return (
    <Sheet onClose={onClose}>
      <SheetHeader title={isEdit ? `Edit ${user.name}` : 'Add user'} onClose={onClose} />
      <form className="sb" onSubmit={save}>
        <div className="fg">
          <div className="f full">
            <label htmlFor="u-name">Name *</label>
            <input id="u-name" type="text" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="u-username">Username *</label>
            <input id="u-username" type="text" required disabled={isEdit} value={form.username} onChange={(e) => set('username', e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="u-email">Email</label>
            <input id="u-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="u-phone">Phone</label>
            <input id="u-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="u-role">Role *</label>
            <select id="u-role" value={form.role} onChange={(e) => set('role', e.target.value)}>
              {(roles || [{ code: 'admin', name: 'Administrator' }, { code: 'manager', name: 'Manager' }, { code: 'receptionist', name: 'Receptionist' }, { code: 'housekeeping', name: 'Housekeeping' }]).map(
                (r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ),
              )}
            </select>
          </div>
          {!isEdit && (
            <div className="f full">
              <label htmlFor="u-password">Password *</label>
              <input id="u-password" type="password" required minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} />
            </div>
          )}
          {isEdit && (
            <div className="f full">
              <label>Active</label>
              <div className="seg">
                <button type="button" aria-pressed={form.isActive} onClick={() => set('isActive', true)}>
                  Active
                </button>
                <button type="button" aria-pressed={!form.isActive} onClick={() => set('isActive', false)}>
                  Disabled
                </button>
              </div>
            </div>
          )}
        </div>
        <button className="btn dark big" type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
        </button>

        {isEdit && (
          <>
            <div className="f full">
              <label htmlFor="u-newpass">Reset password</label>
              <div className="addc">
                <input id="u-newpass" type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                <button className="btn sm" type="button" disabled={resetPassword.isPending} onClick={doReset}>
                  Reset
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </Sheet>
  );
}
