// ML API client - proxied through Go backend
import axios from 'axios';
import type {
  MLPredictionRequest,
  MLPredictionResponse,
  MLAnomalyResponse,
  MLModelInfo,
} from '@/types/ml';

const ML_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8080/api/v1';

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

const mlClient = axios.create({
  baseURL: ML_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

mlClient.interceptors.request.use((config) => {
  const token = getStoredAccessToken();
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

mlClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const url = String(originalRequest?.url || '');

    if (
      status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh')
    ) {
      originalRequest._retry = true;

      try {
        const { default: mainApi } = await import('./client');
        const refreshToken = JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.refreshToken;
        if (refreshToken) {
          const resp = await mainApi.refreshToken(refreshToken);
          if (resp.success && resp.data) {
            const newToken = resp.data.access_token;
            localStorage.setItem('access_token', newToken);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return mlClient(originalRequest);
          }
        }
      } catch {
        // Refresh failed, clear auth
        localStorage.removeItem('access_token');
        localStorage.removeItem('auth-storage');
        window.dispatchEvent(new CustomEvent('pokelab:auth-expired'));
      }
    }

    console.error('ML API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export const mlApi = {
  async getPricePredictions(request: MLPredictionRequest): Promise<MLPredictionResponse> {
    const resp = await mlClient.post<MLPredictionResponse>('/ml/predict/prices', request);
    return resp.data;
  },

  async detectAnomalies(cardIds: string[], thresholdStd = 3.0): Promise<MLAnomalyResponse> {
    const resp = await mlClient.get<MLAnomalyResponse>('/ml/detect/anomalies', {
      params: { card_ids: cardIds.join(','), threshold_std: thresholdStd },
    });
    return resp.data;
  },

  async getModelInfo(): Promise<MLModelInfo> {
    const resp = await mlClient.get<MLModelInfo>('/ml/models/info');
    return resp.data;
  },

  async healthCheck(): Promise<{ status: string; models_loaded: Record<string, boolean> }> {
    const resp = await mlClient.get('/ml/health');
    return resp.data;
  },
};

export default mlApi;