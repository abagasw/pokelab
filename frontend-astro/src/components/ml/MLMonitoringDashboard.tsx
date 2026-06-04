import { useMLStore } from '@stores/index';
import { Brain, Loader2, CheckCircle, XCircle, Activity } from 'lucide-react';

export default function MLMonitoringDashboard() {
  const { modelInfo, modelInfoLoading, getModelInfo } = useMLStore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <Brain className="h-5 w-5" />
          ML Models Status
        </h3>
        <button
          onClick={getModelInfo}
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Refresh Status
        </button>
      </div>

      {modelInfoLoading ? (
        <div className="rounded-lg bg-card border p-8 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground mt-2">Checking ML service...</p>
        </div>
      ) : modelInfo ? (
        <div className="grid gap-4">
          {/* Price Prediction Model */}
          <div className="rounded-lg bg-card border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {modelInfo.price_prediction.loaded ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <h4 className="font-semibold">Price Prediction</h4>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-secondary text-secondary-foreground">
                {modelInfo.price_prediction.type}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{modelInfo.price_prediction.loaded ? 'Loaded' : 'Not Loaded'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="font-medium">{modelInfo.price_prediction.version}</p>
              </div>
            </div>
          </div>

          {/* Deck Ranking Model */}
          <div className="rounded-lg bg-card border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {modelInfo.deck_ranking.loaded ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <h4 className="font-semibold">Deck Ranking</h4>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-secondary text-secondary-foreground">
                {modelInfo.deck_ranking.type}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{modelInfo.deck_ranking.loaded ? 'Loaded' : 'Not Loaded'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="font-medium">{modelInfo.deck_ranking.version}</p>
              </div>
            </div>
          </div>

          {/* Anomaly Detection Model */}
          <div className="rounded-lg bg-card border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {modelInfo.anomaly_detection.loaded ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <h4 className="font-semibold">Anomaly Detection</h4>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-secondary text-secondary-foreground">
                {modelInfo.anomaly_detection.type}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{modelInfo.anomaly_detection.loaded ? 'Loaded' : 'Not Loaded'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="font-medium">{modelInfo.anomaly_detection.version}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-card border p-6 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">ML service unavailable</p>
        </div>
      )}
    </div>
  );
}
