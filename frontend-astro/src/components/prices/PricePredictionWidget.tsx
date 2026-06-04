import { useMLStore } from '@stores/index';
import { TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Calendar, Target, CheckCircle } from 'lucide-react';
import { formatIDR } from '@utils/formatters';

export default function PricePredictionWidget({ cardId }: { cardId: string }) {
  const { predictions, predictionsLoading, predictionsError, getPricePredictions } = useMLStore();

  const handlePredict = () => {
    getPricePredictions([cardId], 30);
  };

  const prediction = predictions[cardId];

  if (!prediction && !predictionsLoading && !predictionsError) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-lg font-bold mb-2">ML Price Prediction</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          Time series forecasting (ARIMA) predicts prices 30 days ahead using momentum, volatility, and meta signals.
        </p>
        <button
          onClick={handlePredict}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
        >
          Generate Prediction
        </button>
      </div>
    );
  }

  if (predictionsLoading) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center animate-pulse">
        <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm font-medium text-muted-foreground">ML model analyzing data...</p>
      </div>
    );
  }

  if (predictionsError) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-4" />
        <p className="text-sm font-medium text-destructive">{predictionsError}</p>
        <button onClick={handlePredict} className="mt-4 text-xs font-bold uppercase tracking-widest hover:underline">Retry</button>
      </div>
    );
  }

  if (!prediction) return null;

  const trendColors: Record<string, string> = { up: 'text-green-500', down: 'text-red-500', stable: 'text-blue-500' };
  const trendColor = trendColors[prediction.trend] || trendColors.stable;

  const trendIcons: Record<string, any> = { up: TrendingUp, down: TrendingDown, stable: Minus };
  const TrendIcon = trendIcons[prediction.trend] || trendIcons.stable;

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm animate-in fade-in zoom-in-95 duration-500">
      <div className="p-6 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={"p-2 rounded-lg bg-background border " + trendColor}>
              <TrendIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold">ARIMA Prediction (30 Days)</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                Confidence: {Math.round(prediction.confidence_score * 100)}% | v:{prediction.model_version}
              </p>
            </div>
          </div>
          <button onClick={handlePredict} className="text-muted-foreground hover:text-foreground" title="Refresh prediction">
            <Loader2 className={"h-4 w-4 " + (predictionsLoading ? 'animate-spin' : '')} />
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-tighter">Predicted Price</p>
            <p className={"text-2xl font-black font-mono " + trendColor}>
              {formatIDR(prediction.predicted_price)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-tighter">Confidence Range</p>
            <div className="text-sm font-mono font-bold flex items-center gap-2">
              <span className="text-red-500">{formatIDR(prediction.confidence_min)}</span>
              <span className="text-muted-foreground">—</span>
              <span className="text-green-500">{formatIDR(prediction.confidence_max)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 border border-border/50">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              Prediction Range
            </p>
            <div className="flex items-center justify-between text-sm font-mono font-bold">
              <span className="text-red-500">{formatIDR(prediction.confidence_min)}</span>
              <div className="flex-1 mx-4 h-1.5 bg-background rounded-full overflow-hidden border">
                <div className={"h-full " + trendColor + " bg-current opacity-30"} style={{ marginLeft: '20%', width: '60%' }}></div>
              </div>
              <span className="text-green-500">{formatIDR(prediction.confidence_max)}</span>
            </div>
          </div>

          {prediction.factors && prediction.factors.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                <CheckCircle className="h-3 w-3" />
                Model Signals
              </p>
              <div className="flex flex-wrap gap-2">
                {prediction.factors.map((factor, i) => (
                  <span key={i} className="px-2 py-1 rounded bg-secondary text-[10px] font-bold text-secondary-foreground border uppercase tracking-tight">
                    {factor}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="px-6 py-3 bg-muted/20 border-t flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Forecast till {new Date(Date.now() + prediction.horizon_days * 24 * 60 * 60 * 1000).toLocaleDateString()}
        </span>
        <span>Updated: {new Date(prediction.predicted_at).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}