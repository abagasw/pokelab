import { usePriceStore } from '@stores/index';
import { TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Calendar, Target } from 'lucide-react';
import { formatIDR } from '@utils/formatters';

export default function PricePredictionWidget({ cardId }: { cardId: string }) {
  const { pricePrediction, loading, error, getPricePrediction } = usePriceStore();

  const handlePredict = () => {
    getPricePrediction(cardId);
  };

  if (!pricePrediction && !loading && !error) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-20" />
        <h3 className="text-lg font-bold mb-2">AI Price Prediction</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
          Analisis tren pasar, kelangkaan, dan dominasi meta untuk memprediksi harga kartu ini dalam 30 hari ke depan.
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

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center animate-pulse">
        <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin mb-4" />
        <p className="text-sm font-medium text-muted-foreground">AI sedang menganalisis data pasar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive mb-4" />
        <p className="text-sm font-medium text-destructive">{error}</p>
        <button onClick={handlePredict} className="mt-4 text-xs font-bold uppercase tracking-widest hover:underline">Coba Lagi</button>
      </div>
    );
  }

  if (!pricePrediction) return null;

  const trendColor = {
    up: 'text-green-500',
    down: 'text-red-500',
    stable: 'text-blue-500'
  }[pricePrediction.trend];

  const TrendIcon = {
    up: TrendingUp,
    down: TrendingDown,
    stable: Minus
  }[pricePrediction.trend];

  return (
    <div className="rounded-xl border bg-card overflow-hidden shadow-sm animate-in fade-in zoom-in-95 duration-500">
      <div className="p-6 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg bg-background border ${trendColor}`}>
              <TrendIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold">Prediksi ML (30 Hari)</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Confidence: {(pricePrediction.confidence_score * 100).toFixed(0)}%</p>
            </div>
          </div>
          <button onClick={handlePredict} className="text-muted-foreground hover:text-foreground">
            <Loader2 className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-tighter">Harga Saat Ini</p>
            <p className="text-2xl font-black font-mono">{formatIDR(pricePrediction.current_price_idr)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 uppercase font-bold tracking-tighter">Target Prediksi</p>
            <p className={`text-2xl font-black font-mono ${trendColor}`}>
              {formatIDR(pricePrediction.predicted_price)}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 border border-border/50">
            <p className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <Target className="h-3 w-3" />
              Estimasi Range
            </p>
            <div className="flex items-center justify-between text-sm font-mono font-bold">
              <span>{formatIDR(pricePrediction.price_range_min)}</span>
              <div className="flex-1 mx-4 h-1.5 bg-background rounded-full overflow-hidden border">
                <div 
                  className={`h-full ${trendColor} bg-current opacity-30`} 
                  style={{ 
                    marginLeft: '20%', 
                    width: '60%' 
                  }}
                ></div>
              </div>
              <span>{formatIDR(pricePrediction.price_range_max)}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              Analisis Market
            </p>
            <p className="text-sm leading-relaxed italic">
              "{pricePrediction.sentiment}"
            </p>
          </div>

          <div className="pt-4 border-t border-border/50">
            <div className="flex flex-wrap gap-2">
              {pricePrediction.factors.map((factor, i) => (
                <span key={i} className="px-2 py-1 rounded bg-secondary text-[10px] font-bold text-secondary-foreground border uppercase tracking-tight">
                  • {factor}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      <div className="px-6 py-3 bg-muted/20 border-t flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Forecast till {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
        </span>
        <span>Updated: {new Date(pricePrediction.updated_at).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
