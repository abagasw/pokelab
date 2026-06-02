import { create } from 'zustand';
import type { Deck, DeckBuildRequest, DeckBuildResponse } from '@/types/index';
import { api } from '@api/client';

interface DeckState {
  // State
  decks: Deck[];
  currentDeck: DeckBuildResponse | null;
  loading: boolean;
  error: string | null;
  buildingDeck: boolean;
  
  // Pagination
  currentPage: number;
  totalPages: number;
  totalCount: number;
  
  // Actions
  fetchDecks: (params?: { format?: string; page?: number; limit?: number; q?: string; sort?: string }) => Promise<void>;
  buildDeck: (request: DeckBuildRequest) => Promise<void>;
  saveDeck: (deck: any) => Promise<boolean>;
  clearCurrentDeck: () => void;
  clearError: () => void;
  setPage: (page: number) => void;
}

export const useDeckStore = create<DeckState>((set, get) => ({
  // Initial state
  decks: [],
  currentDeck: null,
  loading: false,
  error: null,
  buildingDeck: false,
  currentPage: 1,
  totalPages: 1,
  totalCount: 0,

  // Actions
  fetchDecks: async (params) => {
    set({ loading: true, error: null });
    try {
      const response = await api.getDecksPage(params);
      if (response.success && response.data) {
        set({ 
          decks: response.data.decks || [],
          currentPage: response.data.page || params?.page || 1,
          totalPages: response.data.total_pages || 1,
          totalCount: response.data.total || 0,
        });
      } else {
        set({ error: response.error || 'Failed to fetch decks' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch decks' });
    } finally {
      set({ loading: false });
    }
  },

  buildDeck: async (request: DeckBuildRequest) => {
    set({ buildingDeck: true, error: null });
    try {
      const response = await api.buildDeck(request);
      if (response.success && response.data) {
        set({ currentDeck: response.data });
      } else {
        set({ error: response.error || 'Failed to build deck' });
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to build deck' });
    } finally {
      set({ buildingDeck: false });
    }
  },

  saveDeck: async (deck: any) => {
    set({ loading: true, error: null });
    try {
      const response = await api.saveDeck(deck);
      if (response.success) {
        await get().fetchDecks();
        return true;
      } else {
        set({ error: response.error || 'Failed to save deck' });
        return false;
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to save deck' });
      return false;
    } finally {
      set({ loading: false });
    }
  },

  clearCurrentDeck: () => {
    set({ currentDeck: null });
  },

  clearError: () => {
    set({ error: null });
  },
  
  setPage: (page: number) => {
    set({ currentPage: page });
  },
}));
