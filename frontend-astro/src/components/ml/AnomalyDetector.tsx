import { useMLStore } from '@stores/index';
import { AlertTriangle, Loader2, RefreshCw, Shield, Zap } from 'lucide-react';

interface AnomalyDetectorProps {
  cardIds?: string[];
}

export default function AnomalyDetector({ cardIds = [] }: AnomalyDetectorProps) {
  const { anomalies, anomaliesLoading, anomaliesError, getAnomalies } = useMLStore();

  const handleDetect = () => {
    if (cardIds.length > 0) {
      getAnomalies(cardIds);
    }
  };

  const severityColors: Record<string, string> = {
    high: 'bg-red-500/10 text-red-500 border-red-500/30',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    low: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  };

  const severityIcons: Record<string, any> = {
    high: AlertTriangle,
    medium: Zap,
    low: Shield,
  };

  const anomalyTypeLabels: Record<string, string> = {
    price_spike: 'Price Spike',
    arbitrage: 'Arbitrage',
    tournament_outlier: 'Tournament Outlier',
    scraping_fraud: 'Scraping Fraud',
  };

  if (anomalies.length === 0 && !anomaliesLoading && !anomaliesError) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-lg font-bold mb-2">Anomaly Detection</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          ML-based detection for price spikes, arbitrage, and data quality.
        </p>
        <button
          onClick={handleDetect}
          disabled={cardIds.length === 0}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Run Detection
        </button>
      </div>
    );
  }

  if (anomaliesLoading) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center animate-pulse">
        <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm font-medium text-muted-foreground">Running anomaly detection...</p>
      </div>
    );
  }

  if (anomaliesError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-destructive mb-4" />
        <p className="text-sm font-medium text-destructive">{anomaliesError}</p>
        <button onClick={handleDetect} className="mt-4 text-xs font-bold uppercase tracking-widest hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Detected Anomalies ({anomalies.length})
        </h3>
        <button
          onClick={handleDetect}
          className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {anomalies.length === 0 ? (
        <div className="rounded-lg bg-muted/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">No anomalies detected. All clear!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.map((anomaly, i) => {
            const SeverityIcon = severityIcons[anomaly.severity] || Shield;
            const colorClass = severityColors[anomaly.severity] || severityColors.low;
            const typeLabel = anomalyTypeLabels[anomaly.anomaly_type] || anomaly.anomaly_type;
            return (
              <div key={i} className={"rounded-lg border p-4 " + colorClass}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SeverityIcon className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {typeLabel}
                    </span>
                  </div>
                  <span className={"px-2 py-0.5 rounded text-[10px] font-bold uppercase " + colorClass}>
                    {anomaly.severity}
                  </span>
                </div>
                <p className="text-sm mb-2">{anomaly.explanation}</p>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span>Score: {(anomaly.anomaly_score * 100).toFixed(1)}%</span>
                  <span>ID: {anomaly.entity_id.slice(0, 12)}...</span>
                </div>
                {anomaly.recommended_action && (
                  <div className="mt-2 pt-2 border-t border-current/10">
                    <p className="text-xs font-medium">Action: {anomaly.recommended_action}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}