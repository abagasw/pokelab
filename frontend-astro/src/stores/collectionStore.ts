import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Collection, CollectionItem, PriceAlert, PortfolioInsight } from '@/types/index';
import { api } from '@api/client';

interface CollectionState {
  // State
  collections: Collection[];
  currentCollection: Collection | null;
  currentInsight: PortfolioInsight | null;
  priceAlerts: PriceAlert[];
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchCollections: () => Promise<void>;
  fetchCollection: (id: string) => Promise<void>;
  fetchCollectionInsight: (id: string) => Promise<void>;
  createCollection: (name: string) => Promise<boolean>;
  updateCollection: (id: string, name: string) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  addToCollection: (collectionId: string, item: {
    card_id: string;
    quantity?: number;
    condition?: string;
    purchase_price?: number;
    notes?: string;
  }) => Promise<boolean>;
  removeFromCollection: (collectionId: string, itemId: string) => Promise<boolean>;
  fetchPriceAlerts: () => Promise<void>;
  createPriceAlert: (cardId: string, targetPrice: number, condition?: 'below' | 'above') => Promise<boolean>;
  deletePriceAlert: (id: string) => Promise<boolean>;
  clearError: () => void;
}

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set, get) => ({
      // Initial state
      collections: [],
      currentCollection: null,
      currentInsight: null,
      priceAlerts: [],
      loading: false,
      error: null,

      // Actions
      fetchCollections: async () => {
        set({ loading: true, error: null });
        try {
          const response = await api.getCollections();
          if (response.success && response.data) {
            set({ collections: response.data, loading: false });
          } else {
            set({ error: response.error || 'Failed to fetch collections', loading: false });
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to fetch collections', loading: false });
        }
      },

      fetchCollection: async (id: string) => {
        set({ loading: true, error: null, currentCollection: null });
        try {
          const response = await api.getCollection(id);
          if (response.success && response.data) {
            set({ currentCollection: response.data, loading: false });
          } else {
            set({ error: response.error || 'Failed to fetch collection', loading: false });
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to fetch collection', loading: false });
        }
      },

      fetchCollectionInsight: async (id: string) => {
        set({ loading: true, error: null, currentInsight: null });
        try {
          const response = await api.getCollectionInsight(id);
          if (response.success && response.data) {
            set({ currentInsight: response.data, loading: false });
          } else {
            set({ error: response.error || 'Failed to fetch insight', loading: false });
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to fetch insight', loading: false });
        }
      },

      createCollection: async (name: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.createCollection(name);
          if (response.success && response.data) {
            await get().fetchCollections();
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to create collection', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to create collection', loading: false });
          return false;
        }
      },

      updateCollection: async (id: string, name: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.updateCollection(id, name);
          if (response.success && response.data) {
            await get().fetchCollections();
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to update collection', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to update collection', loading: false });
          return false;
        }
      },

      deleteCollection: async (id: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.deleteCollection(id);
          if (response.success) {
            await get().fetchCollections();
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to delete collection', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to delete collection', loading: false });
          return false;
        }
      },

      addToCollection: async (collectionId: string, item) => {
        set({ loading: true, error: null });
        try {
          const response = await api.addToCollection(collectionId, item);
          if (response.success && response.data) {
            await get().fetchCollection(collectionId);
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to add to collection', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to add to collection', loading: false });
          return false;
        }
      },

      removeFromCollection: async (collectionId: string, itemId: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.removeFromCollection(collectionId, itemId);
          if (response.success) {
            await get().fetchCollection(collectionId);
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to remove from collection', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to remove from collection', loading: false });
          return false;
        }
      },

      fetchPriceAlerts: async () => {
        set({ loading: true, error: null });
        try {
          const response = await api.getAlerts();
          if (response.success && response.data) {
            set({ priceAlerts: response.data, loading: false });
          } else {
            set({ error: response.error || 'Failed to fetch alerts', loading: false });
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to fetch alerts', loading: false });
        }
      },

      createPriceAlert: async (cardId: string, targetPrice: number, condition?: 'below' | 'above') => {
        set({ loading: true, error: null });
        try {
          const response = await api.createAlert({
            card_id: cardId,
            target_price: targetPrice,
            condition: condition || 'below',
          });
          if (response.success && response.data) {
            await get().fetchPriceAlerts();
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to create alert', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to create alert', loading: false });
          return false;
        }
      },

      deletePriceAlert: async (id: string) => {
        set({ loading: true, error: null });
        try {
          const response = await api.deleteAlert(id);
          if (response.success) {
            await get().fetchPriceAlerts();
            set({ loading: false });
            return true;
          } else {
            set({ error: response.error || 'Failed to delete alert', loading: false });
            return false;
          }
        } catch (err: any) {
          set({ error: err.message || 'Failed to delete alert', loading: false });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'collection-storage',
      partialize: (state) => ({
        collections: state.collections,
        priceAlerts: state.priceAlerts,
      }),
    }
  )
);
