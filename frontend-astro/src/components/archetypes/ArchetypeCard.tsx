import type { MetaDeckPrediction } from '@/types/index';
import { Trophy, Zap, Target, Shield, ChevronRight, TrendingUp, BarChart3, Users, Award } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ArchetypeCardProps {
  archetype: MetaDeckPrediction;
  onClick?: () => void;
  variant?: 'default' | 'compact';
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Tier contender': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Established meta deck': { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Potential breakout': { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  'Meta watchlist': { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border' },
};

const GROWTH_COLORS: Record<string, { bg: string; text: string; icon: typeof TrendingUp }> = {
  surging: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: TrendingUp },
  consolidating: { bg: 'bg-blue-500/15', text: 'text-blue-400', icon: TrendingUp },
  watch: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: Target },
  fringe: { bg: 'bg-muted', text: 'text-muted-foreground', icon: Target },
};

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function getWinRate(tournamentCount: number, winCount: number): number | null {
  if (tournamentCount === 0) return null;
  return Math.round((winCount / tournamentCount) * 100);
}

function getTop8Rate(tournamentCount: number, top8Count: number): number | null {
  if (tournamentCount === 0) return null;
  return Math.round((top8Count / tournamentCount) * 100);
}

export default function ArchetypeCard({ archetype, onClick, variant = 'default' }: ArchetypeCardProps) {
  const tierConfig = TIER_COLORS[archetype.expected_role] || TIER_COLORS['Meta watchlist'];
  const growthConfig = GROWTH_COLORS[archetype.growth_signal] || GROWTH_COLORS['fringe'];
  const GrowthIcon = growthConfig.icon;
  
  const winRate = getWinRate(archetype.tournament_count, archetype.win_count);
  const top8Rate = getTop8Rate(archetype.tournament_count, archetype.top8_count);
  
  // Consistency score: based on tournament depth and win rate stability
  const consistencyScore = archetype.tournament_count > 0 
    ? Math.min(100, Math.round((archetype.confidence_pct + (winRate || 0) + (top8Rate || 0)) / 3))
    : 0;

  const cardClass = cn(
    'group relative overflow-hidden transition-all duration-300',
    'border border-border bg-card hover:border-primary/40 hover:shadow-xl',
    'rounded-2xl',
    variant === 'compact' ? 'p-4' : 'p-5',
    onClick && 'cursor-pointer'
  );

  const detailHref = `/decks/archetype?name=${encodeURIComponent(archetype.archetype.toLowerCase().replace(/\s+/g, '-'))}`;

  return (
    <article
      className={cardClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      data-detail-href={detailHref}
    >
      {/* Tier badge */}
      <div className="absolute top-3 right-3 z-10">
        <span className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider',
          tierConfig.bg, tierConfig.text, tierConfig.border
        )}>
          {archetype.predicted_tier}
        </span>
      </div>

      {/* Header - Archetype name and growth signal */}
      <div className="mb-4">
        <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {archetype.archetype}
        </h3>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
            growthConfig.bg, growthConfig.text
          )}>
            <GrowthIcon className="h-3 w-3" />
            {archetype.growth_signal}
          </span>
          {archetype.meta_share_pct > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium">
              <Users className="h-3 w-3" />
              {archetype.meta_share_pct.toFixed(1)}% meta
            </span>
          )}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricItem
          icon={Trophy}
          label="Turnamen"
          value={formatNumber(archetype.tournament_count)}
          description="Total sinyal turnamen"
        />
        <MetricItem
          icon={Award}
          label="Decklist"
          value={archetype.deck_count.toString()}
          description="Variasi decklist berbeda"
        />
        <MetricItem
          icon={Zap}
          label="Win Rate"
          value={winRate !== null ? `${winRate}%` : '-'}
          description={winRate !== null ? `${archetype.win_count} / ${archetype.tournament_count}` : 'No data'}
        />
        <MetricItem
          icon={Shield}
          label="Top 8 Rate"
          value={top8Rate !== null ? `${top8Rate}%` : '-'}
          description={top8Rate !== null ? `${archetype.top8_count} top 8 finishes` : 'No data'}
        />
      </div>

      {/* Consistency & Prediction Scores */}
      <div className="border-t border-border pt-4 mb-4">
        <div className="grid grid-cols-2 gap-3">
          <ScoreBar
            label="Skor Prediksi"
            value={archetype.prediction_score}
            max={100}
            color="primary"
            showValue
          />
          <ScoreBar
            label="Keyakinan"
            value={archetype.confidence_pct}
            max={100}
            color="blue"
            showValue
          />
          <ScoreBar
            label="Momentum"
            value={archetype.momentum_score}
            max={100}
            color="amber"
            showValue
          />
          <ScoreBar
            label="Konsistensi"
            value={consistencyScore}
            max={100}
            color="emerald"
            showValue
          />
        </div>
      </div>

      {/* Drivers / Sinyal Kunci */}
      {variant !== 'compact' && archetype.drivers.length > 0 && (
        <div className="border-t border-border pt-4 mb-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3" />
            Sinyal Kunci
          </p>
          <div className="flex flex-wrap gap-1.5">
            {archetype.drivers.slice(0, 3).map((driver, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 text-[10px] text-muted-foreground border border-border"
              >
                {driver}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-xs text-muted-foreground">
          Deck representatif: {archetype.representative_deck_name}
        </span>
        <a
          href={detailHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Lihat Analisis
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

interface MetricItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  description: string;
}

function MetricItem({ icon: Icon, label, value, description }: MetricItemProps) {
  return (
    <div className="border border-border bg-background/50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      </div>
      <p className="font-mono text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
    </div>
  );
}

interface ScoreBarProps {
  label: string;
  value: number;
  max: number;
  color: 'primary' | 'blue' | 'amber' | 'emerald' | 'rose';
  showValue?: boolean;
}

function ScoreBar({ label, value, max, color, showValue }: ScoreBarProps) {
  const percentage = Math.min(100, Math.round((value / max) * 100));
  
  const colorClasses: Record<string, { bar: string; text: string }> = {
    primary: { bar: 'bg-primary', text: 'text-primary' },
    blue: { bar: 'bg-blue-500', text: 'text-blue-400' },
    amber: { bar: 'bg-amber-500', text: 'text-amber-400' },
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
    rose: { bar: 'bg-rose-500', text: 'text-rose-400' },
  };
  
  const colors = colorClasses[color] || colorClasses.primary;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
        {showValue && <p className="font-mono text-xs font-bold" style={{ color: `var(--${color})` }}>{value}</p>}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
