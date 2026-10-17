import { create } from 'zustand';
import { api } from '@api/client';
import type {
  AIResearchAdvice,
  AntiMetaRecommendation,
  DeckGapAnalysis,
  MetaDeckPrediction,
  MetaPrediction,
  ResearchForecastResponse,
  ResearchDeckAnalysis,
  ResearchDeckRecommendation,
} from '@/types/index';

interface ResearchState {
  recommendations: ResearchDeckRecommendation[];
  selectedGap: DeckGapAnalysis | null;
  selectedAnalysis: ResearchDeckAnalysis | null;
  antiMeta: AntiMetaRecommendation[];
  predictions: MetaPrediction[];
  forecast: ResearchForecastResponse | null;
  archetypes: MetaDeckPrediction[];
  advisor: AIResearchAdvice | null;
  loading: boolean;
  error: string | null;
  
  // Pagination for archetypes
  currentPage: number;
  totalPages: number;
  totalCount: number;
  
  // Actions
  fetchRecommendations: (collectionId: string) => Promise<void>;
  fetchDeckGap: (collectionId: string, deckId: string) => Promise<void>;
  fetchDeckAnalysis: (collectionId: string, deckId: string) => Promise<void>;
  fetchAntiMeta: (targetDeckId: string) => Promise<void>;
  fetchPredictions: (category?: string) => Promise<void>;
  fetchForecast: (category?: string, limit?: number) => Promise<void>;
  fetchArchetypes: (params?: { page?: number; limit?: number; sort?: string; q?: string; tier?: string; growth?: string; minTournaments?: number; minMetaShare?: number }) => Promise<void>;
  askAdvisor: (question: string, context?: string) => Promise<void>;
  clearError: () => void;
  setPage: (page: number) => void;
}

export const useResearchStore = create<ResearchState>((set, get) => ({
  recommendations: [],
  selectedGap: null,
  selectedAnalysis: null,
  antiMeta: [],
  predictions: [],
  forecast: null,
  archetypes: [],
  advisor: null,
  loading: false,
  error: null,
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,

  fetchRecommendations: async (collectionId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getResearchRecommendations(collectionId);
      if (response.success && response.data) {
        set({ recommendations: response.data.recommendations });
      } else {
        set({ error: response.error || 'Gagal memuat rekomendasi PokeLab' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat rekomendasi PokeLab' });
    } finally {
      set({ loading: false });
    }
  },

  fetchDeckGap: async (collectionId, deckId) => {
    set({ loading: true, error: null, selectedGap: null });
    try {
      const response = await api.getDeckGap(collectionId, deckId);
      if (response.success && response.data) {
        set({ selectedGap: response.data });
      } else {
        set({ error: response.error || 'Gagal memuat deck gap' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat deck gap' });
    } finally {
      set({ loading: false });
    }
  },

  fetchDeckAnalysis: async (collectionId, deckId) => {
    set({ loading: true, error: null, selectedAnalysis: null, advisor: null });
    try {
      const response = await api.getResearchDeckAnalysis(collectionId, deckId);
      if (response.success && response.data) {
        set({ selectedAnalysis: response.data });
      } else {
        set({ error: response.error || 'Gagal memuat analisis deck' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat analisis deck' });
    } finally {
      set({ loading: false });
    }
  },

  fetchAntiMeta: async (targetDeckId) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getAntiMeta(targetDeckId);
      if (response.success && response.data) {
        set({ antiMeta: response.data });
      } else {
        set({ error: response.error || 'Gagal memuat anti-meta plan' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat anti-meta plan' });
    } finally {
      set({ loading: false });
    }
  },

  fetchPredictions: async (category) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getMetaPredictions({ category, limit: 24 });
      if (response.success && response.data) {
        set({ predictions: response.data });
      } else {
        set({ error: response.error || 'Gagal memuat prediksi meta' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat prediksi meta' });
    } finally {
      set({ loading: false });
    }
  },

  fetchForecast: async (category, limit = 500) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getResearchForecast({ category, limit });
      if (response.success && response.data) {
        set({ 
          forecast: response.data, 
          predictions: response.data.card_predictions || [],
          archetypes: response.data.deck_predictions || [],
          totalCount: response.data.deck_predictions?.length || 0,
          totalPages: 1,
          currentPage: 1,
        });
      } else {
        set({ error: response.error || 'Gagal memuat meta forecast' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat meta forecast' });
    } finally {
      set({ loading: false });
    }
  },

  fetchArchetypes: async (params) => {
    // This will be handled client-side by ArchetypeListContainer
    // The actual data comes from fetchForecast
    // This is a no-op but kept for API compatibility
    set({ currentPage: params?.page || 1 });
  },

  askAdvisor: async (question, context) => {
    set({ loading: true, error: null, advisor: null });
    try {
      const response = await api.askResearchAdvisor(question, context);
      if (response.success && response.data) {
        set({ advisor: response.data });
      } else {
        set({ error: response.error || 'Gagal memuat AI advisor' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Gagal memuat AI advisor' });
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
  
  setPage: (page: number) => set({ currentPage: page }),
}));
