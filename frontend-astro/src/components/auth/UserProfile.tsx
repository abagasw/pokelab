import { useState, useEffect } from 'react';
import { useAuthStore } from '@stores/authStore';
import { api } from '@api/client';

export default function UserProfile() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setAvatarUrl(user.avatar_url || '');
    }
  }, [user]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await api.updateProfile({
        full_name: fullName,
        avatar_url: avatarUrl,
      });

      if (response.success) {
        setMessage('Profil berhasil diperbarui');
      } else {
        setMessage(response.error || 'Gagal memperbarui profil');
      }
    } catch (err: any) {
      setMessage(err.message || 'Terjadi kesalahan');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Silakan login untuk melihat profil</p>
        <a href="/login" className="text-primary hover:underline mt-2 inline-block">
          Login
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-md ${message.includes('berhasil') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
          {message}
        </div>
      )}

      {/* User Info Card */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-3xl">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="Avatar" className="w-full h-full rounded-full object-cover" />
            ) : (
              '👤'
            )}
          </div>
          <div>
            <h2 className="text-xl font-semibold">{user?.username}</h2>
            <p className="text-muted-foreground">{user?.email}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Bergabung: {new Date(user?.created_at || '').toLocaleDateString('id-ID')}
            </p>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <form onSubmit={handleUpdate} className="bg-white border rounded-lg p-6 space-y-4">
        <h3 className="font-semibold">Edit Profil</h3>

        <div>
          <label className="block text-sm font-medium mb-1">Nama Lengkap</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Nama lengkap Anda"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">URL Avatar</label>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.jpg"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </form>

      {/* Logout Button */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="font-semibold text-red-600 mb-4">Zona Berbahaya</h3>
        <button
          onClick={handleLogout}
          className="w-full py-2 px-4 border border-red-500 text-red-500 rounded-md hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
