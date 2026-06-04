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

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    const success = await login({ email: email.trim(), password });
    if (success) {
      window.location.href = getSafeRedirect();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
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
            clearError();
            setEmail(event.target.value);
          }}
          placeholder="nama@email.com"
          required
          autoComplete="email"
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
            clearError();
            setPassword(event.target.value);
          }}
          placeholder="********"
          required
          minLength={8}
          autoComplete="current-password"
          className="w-full rounded-md border border-input bg-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center space-x-2 text-muted-foreground">
          <input type="checkbox" className="rounded border-gray-300" />
          <span>Ingat saya</span>
        </label>
        <a href="/forgot-password" className="text-primary hover:underline">
          Lupa password?
        </a>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Login...' : 'Login'}
      </button>
    </form>
  );
}
