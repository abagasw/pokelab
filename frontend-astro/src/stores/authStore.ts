import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@/types/index';
import { api } from '@api/client';

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  authReady: boolean;
  loading: boolean;
  error: string | null;
  
  // Actions
  login: (data: LoginRequest) => Promise<boolean>;
  register: (data: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  clearSession: () => void;
  refreshAccessToken: () => Promise<boolean>;
  fetchCurrentUser: () => Promise<void>;
  updateProfile: (data: { full_name?: string; avatar_url?: string }) => Promise<boolean>;
  clearError: () => void;
  setAuth: (auth: AuthResponse) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      authReady: false,
      loading: false,
      error: null,

      // Actions
      login: async (data: LoginRequest) => {
        set({ loading: true, error: null });
        try {
          const response = await api.login(data);
          if (response.success && response.data) {
            const { user, access_token, refresh_token } = response.data;
            api.setAuthToken(access_token);
            set({
              user,
              accessToken: access_token,
              refreshToken: refresh_token,
              isAuthenticated: true,
              authReady: true,
              loading: false,
            });
            return true;
          } else {
            set({ error: response.error || 'Login failed', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Login failed', loading: false });
          return false;
        }
      },

      register: async (data: RegisterRequest) => {
        set({ loading: true, error: null });
        try {
          const response = await api.register(data);
          if (response.success && response.data) {
            const { user, access_token, refresh_token } = response.data;
            api.setAuthToken(access_token);
            set({
              user,
              accessToken: access_token,
              refreshToken: refresh_token,
              isAuthenticated: true,
              authReady: true,
              loading: false,
            });
            return true;
          } else {
            set({ error: response.error || 'Registration failed', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Registration failed', loading: false });
          return false;
        }
      },

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken) {
          try {
            await api.logout(refreshToken);
          } catch (e) {
            // Ignore logout errors
          }
        }
        api.setAuthToken(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          authReady: true,
          error: null,
        });
      },

      clearSession: () => {
        api.setAuthToken(null);
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          authReady: true,
          loading: false,
          error: null,
        });
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          get().clearSession();
          return false;
        }
        try {
          const response = await api.refreshToken(refreshToken);
          if (response.success && response.data) {
            const { access_token, refresh_token } = response.data;
            api.setAuthToken(access_token);
            set({
              accessToken: access_token,
              refreshToken: refresh_token,
              isAuthenticated: true,
              authReady: true,
            });
            return true;
          } else {
            get().clearSession();
            return false;
          }
        } catch (err) {
          get().clearSession();
          return false;
        }
      },

      fetchCurrentUser: async () => {
        try {
          const response = await api.getMe();
          if (response.success && response.data) {
            set({ user: response.data, isAuthenticated: true, authReady: true });
          } else {
            const refreshed = await get().refreshAccessToken();
            if (refreshed) {
              const retry = await api.getMe();
              if (retry.success && retry.data) {
                set({ user: retry.data, isAuthenticated: true, authReady: true });
                return;
              }
            }
            get().clearSession();
          }
        } catch (err) {
          get().clearSession();
        }
      },

      updateProfile: async (data) => {
        set({ loading: true, error: null });
        try {
          const response = await api.updateProfile(data);
          if (response.success) {
            await get().fetchCurrentUser();
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Update failed', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Update failed', loading: false });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      setAuth: (auth: AuthResponse) => {
        api.setAuthToken(auth.access_token);
        set({
          user: auth.user,
          accessToken: auth.access_token,
          refreshToken: auth.refresh_token,
          isAuthenticated: true,
          authReady: true,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
);

// Initialize auth token from storage on app load
export const initAuth = () => {
  const state = useAuthStore.getState();
  if (typeof window !== 'undefined') {
    window.addEventListener('pokelab:auth-expired', () => {
      useAuthStore.getState().clearSession();
    });
  }
  if (state.accessToken) {
    api.setAuthToken(state.accessToken);
    useAuthStore.setState({ authReady: true, isAuthenticated: true });
    // Verify token by fetching current user
    state.fetchCurrentUser();
  } else {
    useAuthStore.setState({ authReady: true });
  }
};
