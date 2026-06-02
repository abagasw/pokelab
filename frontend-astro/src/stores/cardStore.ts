import { create } from 'zustand';
import type { Card, CardFilters, CardSearchResponse } from '@/types/index';
import { api } from '@api/client';

interface CardState {
  // Data
  cards: Card[];
  selectedCard: Card | null;
  
  // Pagination
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasMore: boolean;
  currentFilters: CardFilters;
  
  // Loading states
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  
  // Actions
  searchCards: (filters?: CardFilters) => Promise<void>;
  loadMore: () => Promise<void>;
  getCard: (id: string) => Promise<Card | null>;
  setSelectedCard: (card: Card | null) => void;
  clearCards: () => void;
}

export const useCardStore = create<CardState>((set, get) => ({
  cards: [],
  selectedCard: null,
  currentPage: 1,
  totalPages: 0,
  totalCount: 0,
  hasMore: false,
  currentFilters: {},
  loading: false,
  loadingMore: false,
  error: null,

  searchCards: async (filters = {}) => {
    const previousFilters = get().currentFilters;
    const mergedFilters = {
      ...previousFilters,
      ...filters,
      page: filters.page || 1,
    };

    set({ loading: true, error: null, cards: [] });
    try {
      const response = await api.searchCards(mergedFilters);
      
      if (response.success && response.data) {
        const data = response.data;
        set({
          cards: data.cards || [],
          currentPage: data.page || 1,
          totalPages: data.total_pages || 1,
          totalCount: data.total || 0,
          hasMore: (data.page || 1) < (data.total_pages || 1),
          currentFilters: mergedFilters,
          error: null,
        });
      } else {
        set({ error: response.error || 'Gagal mencari kartu' });
      }
    } catch (err) {
      set({ error: 'Terjadi kesalahan saat memuat kartu' });
    } finally {
      set({ loading: false });
    }
  },

  loadMore: async () => {
    const { currentPage, totalPages, loadingMore, cards } = get();
    
    if (loadingMore || currentPage >= totalPages) return;
    
    set({ loadingMore: true });
    try {
      const nextPage = currentPage + 1;
      const response = await api.searchCards({ ...get().currentFilters, page: nextPage });
      
      if (response.success && response.data) {
        const data = response.data;
        set({
          cards: [...cards, ...data.cards],
          currentPage: data.page,
          hasMore: data.page < data.total_pages,
          error: null,
        });
      }
    } catch (err) {
      console.error('Failed to load more cards:', err);
    } finally {
      set({ loadingMore: false });
    }
  },

  getCard: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getCardById(id);
      
      if (response.success && response.data) {
        set({ selectedCard: response.data, error: null });
        return response.data;
      } else {
        set({ error: response.error || 'Kartu tidak ditemukan' });
        return null;
      }
    } catch (err) {
      set({ error: 'Terjadi kesalahan saat memuat kartu' });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  setSelectedCard: (card: Card | null) => {
    set({ selectedCard: card });
  },

  clearCards: () => {
    set({
      cards: [],
      selectedCard: null,
      currentPage: 1,
      totalPages: 0,
      totalCount: 0,
      hasMore: false,
      currentFilters: {},
      error: null,
    });
  },
}));
