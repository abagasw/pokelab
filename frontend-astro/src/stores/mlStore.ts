import { create } from 'zustand';
import { mlApi } from '@/api/mlClient';
import type {
  MLPricePrediction,
  MLAnomaly,
  MLModelInfo,
  MLPredictionResponse,
} from '@/types/ml';

interface MLState {
  // Price predictions
  predictions: Record<string, MLPricePrediction>;
  predictionsLoading: boolean;
  predictionsError: string | null;

  // Anomaly detection
  anomalies: MLAnomaly[];
  anomaliesLoading: boolean;
  anomaliesError: string | null;

  // Model info
  modelInfo: MLModelInfo | null;
  modelInfoLoading: boolean;

  // Actions
  getPricePredictions: (cardIds: string[], horizonDays?: number) => Promise<void>;
  getAnomalies: (cardIds: string[], thresholdStd?: number) => Promise<void>;
  getModelInfo: () => Promise<void>;
  clearPredictions: () => void;
  clearAnomalies: () => void;
}

export const useMLStore = create<MLState>((set, get) => ({
  predictions: {},
  predictionsLoading: false,
  predictionsError: null,

  anomalies: [],
  anomaliesLoading: false,
  anomaliesError: null,

  modelInfo: null,
  modelInfoLoading: false,

  getPricePredictions: async (cardIds, horizonDays = 30) => {
    set({ predictionsLoading: true, predictionsError: null });
    try {
      const response = await mlApi.getPricePredictions({
        card_ids: cardIds,
        horizon_days: horizonDays,
      });
      const predMap: Record<string, MLPricePrediction> = {};
      for (const pred of response.predictions) {
        predMap[pred.card_id] = pred;
      }
      set((state) => ({
        predictions: { ...state.predictions, ...predMap },
        predictionsLoading: false,
      }));
    } catch (error: any) {
      set({
        predictionsError: error.response?.data?.error || error.message || 'Failed to get predictions',
        predictionsLoading: false,
      });
    }
  },

  getAnomalies: async (cardIds, thresholdStd = 3.0) => {
    set({ anomaliesLoading: true, anomaliesError: null });
    try {
      const response = await mlApi.detectAnomalies(cardIds, thresholdStd);
      set({ anomalies: response.anomalies || [], anomaliesLoading: false });
    } catch (error: any) {
      set({
        anomaliesError: error.response?.data?.error || error.message || 'Failed to detect anomalies',
        anomaliesLoading: false,
      });
    }
  },

  getModelInfo: async () => {
    set({ modelInfoLoading: true });
    try {
      const info = await mlApi.getModelInfo();
      set({ modelInfo: info, modelInfoLoading: false });
    } catch {
      set({ modelInfoLoading: false });
    }
  },

  clearPredictions: () => set({ predictions: {}, predictionsError: null }),
  clearAnomalies: () => set({ anomalies: [], anomaliesError: null }),
}));
