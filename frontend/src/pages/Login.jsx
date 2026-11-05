import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ApiError } from '../lib/apiClient';

const schema = z.object({
  username: z.string().min(1, 'Enter your username.'),
  password: z.string().min(1, 'Enter your password.'),
});

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { username: '', password: '' } });

  const onSubmit = async (values) => {
    setServerError('');
    try {
      await login(values.username, values.password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Could not log in. Try again.');
    }
  };

  return (
    <div className="loginwrap">
      <form className="logincard" onSubmit={handleSubmit(onSubmit)}>
        <div className="crest">TC</div>
        <h1>Tamarind Court</h1>
        <p className="muted">Front desk sign in</p>

        <div className={`f ${errors.username ? 'bad' : ''}`}>
          <label htmlFor="username">Username</label>
          <input id="username" type="text" autoComplete="username" autoFocus {...register('username')} />
          {errors.username && <span className="err">{errors.username.message}</span>}
        </div>

        <div className={`f ${errors.password ? 'bad' : ''}`}>
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" {...register('password')} />
          {errors.password && <span className="err">{errors.password.message}</span>}
        </div>

        {serverError && <div className="warn">{serverError}</div>}

        <button className="btn dark big" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
