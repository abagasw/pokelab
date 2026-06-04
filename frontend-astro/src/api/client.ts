import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { 
  Card, 
  Expansion, 
  Deck, 
  DeckSearchResponse,
  DeckBuildRequest, 
  DeckBuildResponse,
  CardSearchParams,
  CardSearchResponse,
  ApiResponse,
  PriceComparison,
  ArbitrageOpportunity,
  PricePrediction,
  Tournament,
  Collection,
  CollectionItem,
  CollectionSummary,
  PortfolioInsight,
  User,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  ResearchDeckAnalysis,
  ResearchRecommendationsResponse,
  DeckGapAnalysis,
  AntiMetaRecommendation,
  MetaPrediction,
  ResearchForecastResponse,
  AIResearchAdvice
} from '@/types/index';

const API_BASE_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:8080/api/v1';

function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const directToken = localStorage.getItem('access_token');
  if (directToken) {
    return directToken;
  }

  const persistedAuth = localStorage.getItem('auth-storage');
  if (!persistedAuth) {
    return null;
  }

  try {
    const parsed = JSON.parse(persistedAuth);
    return parsed?.state?.accessToken || null;
  } catch {
    return null;
  }
}

function getPersistedAuthState(): any | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const persistedAuth = localStorage.getItem('auth-storage');
  if (!persistedAuth) {
    return null;
  }

  try {
    return JSON.parse(persistedAuth)?.state || null;
  } catch {
    return null;
  }
}

function getStoredRefreshToken(): string | null {
  return getPersistedAuthState()?.refreshToken || null;
}

function persistRefreshedTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const persistedAuth = localStorage.getItem('auth-storage');
  if (!persistedAuth) {
    localStorage.setItem('access_token', accessToken);
    return;
  }

  try {
    const parsed = JSON.parse(persistedAuth);
    parsed.state = {
      ...parsed.state,
      accessToken,
      refreshToken,
      isAuthenticated: true,
    };
    localStorage.setItem('auth-storage', JSON.stringify(parsed));
  } catch {
    // Keep the direct token as a fallback for the current session.
  }
  localStorage.setItem('access_token', accessToken);
}

function clearStoredAuth() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('auth-storage');
}

function emitAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pokelab:auth-expired'));
  }
}

class ApiClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        const token = getStoredAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - refresh short-lived access tokens once before failing.
    this.client.interceptors.response.use(
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
          !url.includes('/auth/register') &&
          !url.includes('/auth/refresh')
        ) {
          originalRequest._retry = true;
          const token = await this.refreshAccessTokenFromStorage();
          if (token) {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return this.client(originalRequest);
          }
        }

        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  private async refreshAccessTokenFromStorage(): Promise<string | null> {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      clearStoredAuth();
      emitAuthExpired();
      return null;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken })
        .then((response) => {
          persistRefreshedTokens(response.access_token, response.refresh_token);
          this.setAuthToken(response.access_token);
          return response.access_token;
        })
        .catch(() => {
          clearStoredAuth();
          this.setAuthToken(null);
          emitAuthExpired();
          return null;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }

    return this.refreshPromise;
  }

  // Generic request wrappers that extract .data
  private async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.get(url, config);
    return response.data;
  }

  private async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.post(url, data, config);
    return response.data;
  }

  private async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.put(url, data, config);
    return response.data;
  }

  private async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.client.delete(url, config);
    return response.data;
  }

  // Set auth token for subsequent requests
  setAuthToken(token: string | null) {
    if (token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', token);
      }
    } else {
      delete this.client.defaults.headers.common['Authorization'];
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
      }
    }
  }

  // Helper to wrap responses
  private wrapResponse<T>(data: T): ApiResponse<T> {
    return { success: true, data };
  }

  private wrapError(error: any): ApiResponse<any> {
    console.error('API Error:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown error occurred' 
    };
  }

  // Health Check
  async healthCheck(): Promise<{ status: string; service: string; cache: boolean; version: string }> {
    return this.get('/health');
  }

  // Auth
  async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.post<AuthResponse>('/auth/register', data);
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.post<AuthResponse>('/auth/login', data);
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async refreshToken(refreshToken: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const response = await this.post<AuthResponse>('/auth/refresh', { refresh_token: refreshToken });
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async logout(refreshToken: string): Promise<ApiResponse<void>> {
    try {
      await this.post('/auth/logout', { refresh_token: refreshToken });
      return this.wrapResponse(undefined);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async getMe(): Promise<ApiResponse<User>> {
    try {
      const response = await this.get<User>('/auth/me');
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async updateProfile(data: { full_name?: string; avatar_url?: string }): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.put<{ message: string }>('/auth/profile', data);
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async forgotPassword(email: string): Promise<ApiResponse<{ message: string; token?: string }>> {
    try {
      const response = await this.post<{ message: string; token?: string }>('/auth/forgot-password', { email });
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.post<{ message: string }>('/auth/reset-password', { token, new_password: newPassword });
      return this.wrapResponse(response);
    } catch (error) {
      return this.wrapError(error);
    }
  }

  // Cards
  async searchCards(params: CardSearchParams): Promise<ApiResponse<CardSearchResponse>> {
    try {
      const normalizedParams = normalizeCardSearchParams(params);
      const data = await this.get<CardSearchResponse>('/cards', { params: normalizedParams });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getCardById(id: string): Promise<ApiResponse<Card>> {
    try {
      const direct = await this.get<Card>('/cards/by-id', { params: { id } });
      return { success: true, data: direct };
    } catch {
      // Continue with legacy search fallbacks below.
    }

    try {
      // Parse ID format: EXPANSION-NUMBER/TOTAL-NAME (e.g., SV10s-046/138-abomasnow)
      const match = id.match(/^([^-]+)-([^/]+)\/([^-]+)-(.+)$/);
      if (match) {
        const [, expansion, collectorNum, total, name] = match;
        
        // Try search with expansion + name
        const searchData = await this.get<CardSearchResponse>('/cards', { 
          params: { expansion, q: name.replace(/_/g, ' '), limit: 50 }
        });
        
        if (searchData.cards) {
          const card = searchData.cards.find((c: Card) => c.id === id);
          if (card) {
            return { success: true, data: card };
          }
          const cardByNum = searchData.cards.find((c: Card) => 
            c.collector_number === `${collectorNum}/${total}`
          );
          if (cardByNum) {
            return { success: true, data: cardByNum };
          }
        }
      }
      
      // Fallback: search by name only
      const nameMatch = id.match(/-(.+)$/);
      if (nameMatch) {
        const name = nameMatch[1].replace(/_/g, ' ');
        const searchData = await this.get<CardSearchResponse>('/cards', { 
          params: { q: name, limit: 50 }
        });
        if (searchData.cards) {
          const card = searchData.cards.find((c: Card) => c.id === id);
          if (card) {
            return { success: true, data: card };
          }
        }
      }
      
      return { success: false, error: 'Card not found' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get card' };
    }
  }

  async getCardPrices(id: string): Promise<ApiResponse<any>> {
    try {
      const data = await this.get(`/cards/${encodeURIComponent(id)}/prices`);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Expansions
  async getExpansions(): Promise<ApiResponse<Expansion[]>> {
    try {
      const data = await this.get<Expansion[]>('/expansions');
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getExpansionByCode(code: string): Promise<ApiResponse<Expansion>> {
    try {
      const data = await this.get<Expansion>(`/expansions/${code}`);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getCardsByExpansion(code: string, params?: { page?: number; limit?: number }): Promise<ApiResponse<CardSearchResponse>> {
    try {
      const data = await this.get<CardSearchResponse>(`/expansions/${code}/cards`, { params });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Decks
  async getDecks(params?: { format?: string; page?: number; limit?: number }): Promise<ApiResponse<Deck[]>> {
    try {
      const data = await this.get<Deck[]>('/decks', { params });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getDecksPage(params?: { format?: string; page?: number; limit?: number; q?: string; sort?: string }): Promise<ApiResponse<DeckSearchResponse>> {
    try {
      const data = await this.get<DeckSearchResponse>('/decks', {
        params: { ...params, with_meta: 1 },
      });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getDeckById(id: string): Promise<ApiResponse<Deck>> {
    try {
      const data = await this.get<Deck>(`/decks/${id}`);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getDeckDecklists(id: string): Promise<ApiResponse<any>> {
    try {
      const data = await this.get(`/decks/${id}/decklists`);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async buildDeck(request: DeckBuildRequest): Promise<ApiResponse<DeckBuildResponse>> {
    try {
      const data = await this.post<DeckBuildResponse>('/decks/build', request);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async saveDeck(deck: any): Promise<ApiResponse<Deck>> {
    try {
      const data = await this.post<Deck>('/decks', deck);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async analyzeDeck(cards: { card_id: string; count: number }[]): Promise<ApiResponse<any>> {
    try {
      const data = await this.post('/decks/analyze', { cards });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // Tournaments
  async getTournaments(params?: { format?: string; limit?: number }): Promise<ApiResponse<Tournament[]>> {
    try {
      const data = await this.get<Tournament[]>('/tournaments', { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getTournamentById(id: string): Promise<ApiResponse<Tournament>> {
    try {
      const data = await this.get<Tournament>(`/tournaments/${id}`);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getTournamentStandings(id: string, params?: { top?: number }): Promise<ApiResponse<any>> {
    try {
      const data = await this.get(`/tournaments/${id}/standings`, { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  // Prices
  async comparePrices(cardId: string): Promise<ApiResponse<PriceComparison>> {
    try {
      const data = await this.get<PriceComparison>('/prices/compare', { params: { card_id: cardId } });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getArbitrageOpportunities(params?: { min_difference?: number; limit?: number }): Promise<ApiResponse<ArbitrageOpportunity[]>> {
    try {
      const data = await this.get<ArbitrageOpportunity[]>('/prices/arbitrage', { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getPricePrediction(cardId: string): Promise<ApiResponse<PricePrediction>> {
    try {
      const data = await this.get<PricePrediction>(`/prices/${encodeURIComponent(cardId)}/prediction`);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getPriceTrends(params: { card_id?: string; expansion?: string; days?: number }): Promise<ApiResponse<any>> {
    try {
      const data = await this.get('/prices/trends', { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getBestDeals(params?: { category?: string; limit?: number }): Promise<ApiResponse<any>> {
    try {
      const data = await this.get('/prices/best-deals', { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async calculateCollectionValue(cards: { card_id: string; count: number }[]): Promise<ApiResponse<any>> {
    try {
      const data = await this.post('/prices/collection-value', { cards });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  // PokeLab ID Research
  async getResearchRecommendations(collectionId: string): Promise<ApiResponse<ResearchRecommendationsResponse>> {
    try {
      const data = await this.get<ResearchRecommendationsResponse>('/research/recommendations', {
        params: { collection_id: collectionId },
      });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getDeckGap(collectionId: string, deckId: string): Promise<ApiResponse<DeckGapAnalysis>> {
    try {
      const data = await this.get<DeckGapAnalysis>('/research/deck-gap', {
        params: { collection_id: collectionId, deck_id: deckId },
      });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getResearchDeckAnalysis(collectionId: string, deckId: string): Promise<ApiResponse<ResearchDeckAnalysis>> {
    try {
      const data = await this.get<ResearchDeckAnalysis>('/research/deck-analysis', {
        params: { collection_id: collectionId, deck_id: deckId },
      });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getAntiMeta(targetDeckId: string): Promise<ApiResponse<AntiMetaRecommendation[]>> {
    try {
      const data = await this.post<AntiMetaRecommendation[]>('/research/anti-meta', {
        target_deck_id: targetDeckId,
      });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getMetaPredictions(params?: { category?: string; limit?: number }): Promise<ApiResponse<MetaPrediction[]>> {
    try {
      const data = await this.get<MetaPrediction[]>('/research/predictions', { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getResearchForecast(params?: { category?: string; limit?: number }): Promise<ApiResponse<ResearchForecastResponse>> {
    try {
      const data = await this.get<ResearchForecastResponse>('/research/meta-forecast', { params });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async askResearchAdvisor(question: string, context?: string): Promise<ApiResponse<AIResearchAdvice>> {
    try {
      const data = await this.post<AIResearchAdvice>('/research/advisor', { question, context });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  // Collections
  async getCollections(): Promise<ApiResponse<Collection[]>> {
    try {
      const data = await this.get<Collection[]>('/collections');
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async createCollection(name: string): Promise<ApiResponse<Collection>> {
    try {
      const data = await this.post<Collection>('/collections', { name });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getCollection(id: string): Promise<ApiResponse<Collection>> {
    try {
      const data = await this.get<Collection>(`/collections/${id}`);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async updateCollection(id: string, name: string): Promise<ApiResponse<Collection>> {
    try {
      const data = await this.put<Collection>(`/collections/${id}`, { name });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async deleteCollection(id: string): Promise<ApiResponse<void>> {
    try {
      await this.delete(`/collections/${id}`);
      return this.wrapResponse(undefined);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async addToCollection(collectionId: string, item: { card_id: string; quantity?: number; condition?: string }): Promise<ApiResponse<any>> {
    try {
      const data = await this.post(`/collections/${collectionId}/items`, item);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async removeFromCollection(collectionId: string, itemId: string): Promise<ApiResponse<void>> {
    try {
      await this.delete(`/collections/${collectionId}/items/${itemId}`);
      return this.wrapResponse(undefined);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getCollectionSummary(id: string): Promise<ApiResponse<CollectionSummary>> {
    try {
      const data = await this.get<CollectionSummary>(`/collections/${id}/summary`);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async getCollectionInsight(id: string): Promise<ApiResponse<PortfolioInsight>> {
    try {
      const data = await this.get<PortfolioInsight>(`/collections/${id}/insight`);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  // Alerts
  async getAlerts(): Promise<ApiResponse<any[]>> {
    try {
      const data = await this.get<any[]>('/alerts');
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async createAlert(alert: { card_id: string; target_price: number; condition: 'below' | 'above' }): Promise<ApiResponse<any>> {
    try {
      const data = await this.post('/alerts', alert);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async deleteAlert(id: string): Promise<ApiResponse<void>> {
    try {
      await this.delete(`/alerts/${id}`);
      return this.wrapResponse(undefined);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  // AI
  async askAI(question: string, context?: string): Promise<ApiResponse<{ answer: string }>> {
    try {
      const data = await this.post<{ answer: string }>('/ai/ask', { question, context });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async explainCard(cardId: string): Promise<ApiResponse<{ explanation: string }>> {
    try {
      const data = await this.post<{ explanation: string }>('/ai/explain-card', { card_id: cardId });
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

  async suggestDecks(preferences: { budget?: number; play_style?: string; preferred_types?: string[] }): Promise<ApiResponse<any>> {
    try {
      const data = await this.post('/ai/suggest-decks', preferences);
      return this.wrapResponse(data);
    } catch (error: any) {
      return this.wrapError(error);
    }
  }

}

export const api = new ApiClient();
export default api;

function normalizeCardSearchParams(params: CardSearchParams): Record<string, any> {
  const normalized: Record<string, any> = { ...params };
  if (params.query && !params.q) {
    normalized.q = params.query;
  }
  delete normalized.query;

  switch (params.sort) {
    case 'name_asc':
      normalized.sort_by = 'name_id';
      normalized.sort_order = 'asc';
      break;
    case 'name_desc':
      normalized.sort_by = 'name_id';
      normalized.sort_order = 'desc';
      break;
    case 'expansion':
      normalized.sort_by = 'expansion';
      normalized.sort_order = 'desc';
      break;
    case 'rarity':
      normalized.sort_by = 'rarity';
      normalized.sort_order = 'asc';
      break;
    default:
      break;
  }
  delete normalized.sort;
  return normalized;
}
