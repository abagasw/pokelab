import { useState } from 'react';
import { useAuthStore } from '@stores/authStore';

const getSafeRedirect = () => {
  if (typeof window === 'undefined') return '/collections';
  const redirect = new URLSearchParams(window.location.search).get('redirect');
  if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/collections';
};

export default function RegisterForm() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const { register, loading, error, clearError } = useAuthStore();

  const clearFormError = () => {
    clearError();
    setValidationError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFormError();

    const cleanEmail = email.trim();
    const cleanUsername = username.trim();
    const cleanFullName = fullName.trim();

    if (password !== confirmPassword) {
      setValidationError('Password tidak cocok');
      return;
    }

    if (password.length < 8) {
      setValidationError('Password minimal 8 karakter');
      return;
    }

    if (cleanUsername.length < 3) {
      setValidationError('Username minimal 3 karakter');
      return;
    }

    const success = await register({
      email: cleanEmail,
      username: cleanUsername,
      password,
      full_name: cleanFullName,
    });

    if (success) {
      window.location.href = getSafeRedirect();
    }
  };

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {displayError && (
        <div className="rounded-md border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">
          {displayError}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => {
            clearFormError();
            setEmail(event.target.value);
          }}
          placeholder="nama@email.com"
          required
          autoComplete="email"
          className="w-full rounded-md border border-input bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="username" className="text-sm font-medium">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) => {
            clearFormError();
            setUsername(event.target.value);
          }}
          placeholder="username"
          required
          minLength={3}
          autoComplete="username"
          className="w-full rounded-md border border-input bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="fullName" className="text-sm font-medium">
          Nama Lengkap (opsional)
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Nama pemain"
          autoComplete="name"
          className="w-full rounded-md border border-input bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => {
            clearFormError();
            setPassword(event.target.value);
          }}
          placeholder="********"
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-md border border-input bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Konfirmasi Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            clearFormError();
            setConfirmPassword(event.target.value);
          }}
          placeholder="********"
          required
          autoComplete="new-password"
          className="w-full rounded-md border border-input bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Mendaftarkan...' : 'Daftar'}
      </button>
    </form>
  );
}
