import { create } from 'zustand';
import type { ArbitrageOpportunity, PriceComparison, PricePrediction } from '@/types/index';
import { api } from '@api/client';

interface PriceState {
  // State
  arbitrageOpportunities: ArbitrageOpportunity[];
  priceComparison: PriceComparison | null;
  pricePrediction: PricePrediction | null;
  minDifference: number;
  loading: boolean;
  error: string | null;

  // Actions
  fetchArbitrage: (params?: { min_difference?: number; limit?: number }) => Promise<void>;
  setMinDifference: (value: number) => void;
  comparePrices: (cardId: string) => Promise<void>;
  getPricePrediction: (cardId: string) => Promise<void>;
  clearError: () => void;
}

export const usePriceStore = create<PriceState>((set, get) => ({
  // Initial state
  arbitrageOpportunities: [],
  priceComparison: null,
  pricePrediction: null,
  minDifference: 20,
  loading: false,
  error: null,

  // Actions
  fetchArbitrage: async (params) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getArbitrageOpportunities(params);
      if (response.success && response.data) {
        set({ arbitrageOpportunities: response.data });
      } else {
        set({ error: response.error || 'Failed to fetch arbitrage' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch arbitrage' });
    } finally {
      set({ loading: false });
    }
  },

  setMinDifference: (value: number) => {
    set({ minDifference: value });
  },

  comparePrices: async (cardId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.comparePrices(cardId);
      if (response.success && response.data) {
        set({ priceComparison: response.data });
      } else {
        set({ error: response.error || 'Failed to compare prices' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to compare prices' });
    } finally {
      set({ loading: false });
    }
  },

  getPricePrediction: async (cardId: string) => {
    set({ loading: true, error: null, pricePrediction: null });
    try {
      const response = await api.getPricePrediction(cardId);
      if (response.success && response.data) {
        set({ pricePrediction: response.data });
      } else {
        set({ error: response.error || 'Failed to get prediction' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to get prediction' });
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
