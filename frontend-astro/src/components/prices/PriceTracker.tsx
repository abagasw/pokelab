import { useEffect, useState } from 'react';
import { usePriceStore } from '@stores/index';
import { TrendingUp, ArrowRight, AlertTriangle, Filter, Loader2 } from 'lucide-react';
import { formatIDR, formatUSD, formatPercentage } from '@utils/formatters';

export default function PriceTracker() {
  const { 
    arbitrageOpportunities, 
    loading, 
    error, 
    minDifference, 
    fetchArbitrageOpportunities,
    setMinDifference 
  } = usePriceStore();

  const [limit, setLimit] = useState(20);

  useEffect(() => {
    fetchArbitrageOpportunities({ min_difference: minDifference / 100, limit });
  }, [minDifference, limit]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium flex items-center">
              <Filter className="mr-2 h-4 w-4" />
              Minimum Profit Margin
            </label>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range"
                min="10"
                max="50"
                value={minDifference}
                onChange={(e) => setMinDifference(parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-sm font-medium w-16">{minDifference}%</span>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Jumlah Hasil</label>
            <div className="mt-2 flex gap-2">
              {[10, 20, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => setLimit(n)}
                  className={`px-3 py-1 rounded-md text-sm ${
                    limit === n 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-background border hover:bg-accent'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      {/* Results */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center">
            <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
            Peluang Arbitrage
          </h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        {arbitrageOpportunities.length === 0 && !loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Tidak ada peluang arbitrage ditemukan</p>
            <p className="text-sm">Coba turunkan minimum profit margin</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {arbitrageOpportunities.map((opp, idx) => (
              <ArbitrageCard key={idx} opportunity={opp} rank={idx + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ArbitrageCard({ 
  opportunity, 
  rank 
}: { 
  opportunity: {
    card_id: string;
    card_name: string;
    expansion_code: string;
    idr_price: number;
    usd_price: number;
    usd_in_idr: number;
    profit_margin: number;
    potential_profit: number;
    recommendation: string;
  };
  rank: number;
}) {
  const getRankColor = (r: number) => {
    if (r === 1) return 'bg-yellow-500 text-white';
    if (r === 2) return 'bg-gray-400 text-white';
    if (r === 3) return 'bg-orange-400 text-white';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="rounded-lg border bg-background p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        {/* Rank */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${getRankColor(rank)}`}>
          {rank}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-lg">{opportunity.card_name}</h3>
              <p className="text-sm text-muted-foreground">
                {opportunity.expansion_code}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {formatPercentage(opportunity.profit_margin)}
              </span>
            </div>
          </div>

          {/* Price Comparison */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-md bg-green-50 p-3">
              <p className="text-xs text-green-600 font-medium">Beli di Indonesia</p>
              <p className="text-lg font-bold text-green-700">
                {formatIDR(opportunity.idr_price)}
              </p>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90 sm:rotate-0" />
            </div>
            <div className="rounded-md bg-blue-50 p-3">
              <p className="text-xs text-blue-600 font-medium">Jual di US</p>
              <p className="text-lg font-bold text-blue-700">
                {formatUSD(opportunity.usd_price)}
              </p>
              <p className="text-xs text-muted-foreground">
                ≈ {formatIDR(opportunity.usd_in_idr)}
              </p>
            </div>
          </div>

          {/* Profit */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Potensi Profit</p>
              <p className="text-xl font-bold text-green-600">
                {formatIDR(opportunity.potential_profit)}
              </p>
            </div>
            <a
              href={`/cards/${opportunity.card_id}`}
              className="text-sm text-primary hover:underline"
            >
              Lihat Detail →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
