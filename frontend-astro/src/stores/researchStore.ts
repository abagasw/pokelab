import { create } from 'zustand';
import { api } from '@api/client';
import type {
  AIResearchAdvice,
  AntiMetaRecommendation,
  DeckGapAnalysis,
  MetaPrediction,
  ResearchDeckAnalysis,
  ResearchDeckRecommendation,
} from '@/types/index';

interface ResearchState {
  recommendations: ResearchDeckRecommendation[];
  selectedGap: DeckGapAnalysis | null;
  selectedAnalysis: ResearchDeckAnalysis | null;
  antiMeta: AntiMetaRecommendation[];
  predictions: MetaPrediction[];
  advisor: AIResearchAdvice | null;
  loading: boolean;
  error: string | null;
  fetchRecommendations: (collectionId: string) => Promise<void>;
  fetchDeckGap: (collectionId: string, deckId: string) => Promise<void>;
  fetchDeckAnalysis: (collectionId: string, deckId: string) => Promise<void>;
  fetchAntiMeta: (targetDeckId: string) => Promise<void>;
  fetchPredictions: (category?: string) => Promise<void>;
  askAdvisor: (question: string, context?: string) => Promise<void>;
  clearError: () => void;
}

export const useResearchStore = create<ResearchState>((set) => ({
  recommendations: [],
  selectedGap: null,
  selectedAnalysis: null,
  antiMeta: [],
  predictions: [],
  advisor: null,
  loading: false,
  error: null,

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
}));
