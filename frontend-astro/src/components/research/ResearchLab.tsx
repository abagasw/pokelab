import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip as ChartTooltip, Legend as ChartLegend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Activity, BarChart3, Brain, ChevronRight, FlaskConical, Loader2, Search, Shield, Sparkles, Target, TrendingUp, Trophy, Zap, ArrowUpRight, ArrowDownRight, Minus, Swords, Crown, Star, Heart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore, useCollectionStore, useDeckStore, useResearchStore } from '@stores/index';
import { formatIDR } from '@utils/formatters';
import type { AntiMetaRecommendation, MetaDeckPrediction, MetaPrediction, ResearchDeckRecommendation, ResearchForecastResponse } from '@/types/index';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, ChartTooltip, ChartLegend);
ChartJS.defaults.font.family = "'Inter','system-ui',sans-serif";
ChartJS.defaults.font.size = 11;

type ResearchLabMode = 'dashboard' | 'recommendations' | 'anti-meta' | 'predictions';
interface ResearchLabProps { mode: ResearchLabMode; }

const predictionFilters = ['', 'Pokemon', 'Trainer', 'Supporter', 'Item', 'Energy'];
const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  S: { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  A: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  B: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  C: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
};
function getTierColor(tier: string) { return TIER_COLORS[tier?.toUpperCase()] || TIER_COLORS['C']; }
const PALETTE = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#14b8a6','#ec4899','#f97316','#6366f1','#06b6d4'];

export default function ResearchLab({ mode }: ResearchLabProps) {  const { authReady, isAuthenticated, user } = useAuthStore();
  const { collections, fetchCollections } = useCollectionStore();
  const { decks, fetchDecks, loading: decksLoading } = useDeckStore();
  const { recommendations, antiMeta, predictions, forecast, advisor, loading, error, fetchRecommendations, fetchAntiMeta, fetchForecast, askAdvisor } = useResearchStore();
  const [collectionId, setCollectionId] = useState('');
  const [targetDeckId, setTargetDeckId] = useState('');
  const [category, setCategory] = useState('');
  const [question, setQuestion] = useState('Jelaskan deck terbaik dari inventory saya, missing card prioritas, dan matchup yang perlu dilatih.');

  useEffect(() => { if (typeof window !== 'undefined') { const t = new URLSearchParams(window.location.search).get('target'); if (t) setTargetDeckId(t); } }, []);
  useEffect(() => { fetchDecks({ limit: 30 }); fetchForecast('', 500); }, [fetchDecks, fetchForecast]);
  useEffect(() => { if (authReady && isAuthenticated) fetchCollections(); }, [authReady, isAuthenticated, fetchCollections]);
  useEffect(() => { if (!collectionId && collections.length > 0) setCollectionId(collections[0].id); }, [collectionId, collections]);
  useEffect(() => { if (!targetDeckId && decks.length > 0) setTargetDeckId(decks[0].id); }, [decks, targetDeckId]);
  useEffect(() => { if (isAuthenticated && collectionId && (mode === 'dashboard' || mode === 'recommendations')) fetchRecommendations(collectionId); }, [collectionId, isAuthenticated, mode, fetchRecommendations]);
  useEffect(() => { if (targetDeckId && mode === 'anti-meta') fetchAntiMeta(targetDeckId); }, [targetDeckId, mode, fetchAntiMeta]);
  useEffect(() => { if (mode === 'predictions') fetchForecast(category, 500); }, [category, mode, fetchForecast]);

  const bestRec = recommendations[0];

  return (
    <LabShell mode={mode}>
      {error && <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive rounded-lg">{error}</div>}
      {mode === 'dashboard' && <DashboardView loading={loading} decksLoading={decksLoading} isAuthenticated={isAuthenticated} decks={decks} recommendations={recommendations} predictions={predictions} forecast={forecast} bestRecommendation={bestRec} />}
      {mode === 'recommendations' && (isAuthenticated ? <RecommendationsView loading={loading} collectionId={collectionId} recommendations={recommendations} advisor={advisor?.answer} question={question} setQuestion={setQuestion} onAsk={() => askAdvisor(question, JSON.stringify(recommendations.slice(0, 3)))} /> : <LoginNeededPanel />)}
      {mode === 'anti-meta' && <AntiMetaView loading={loading} decks={decks} targetDeckId={targetDeckId} setTargetDeckId={setTargetDeckId} antiMeta={antiMeta} />}
      {mode === 'predictions' && <PredictionsView loading={loading} category={category} setCategory={setCategory} predictions={predictions} forecast={forecast} />}
    </LabShell>
  );
}

function LabShell({ mode, children }: { mode: ResearchLabMode; children: React.ReactNode }) {
  const tabs = [
    { href: '/lab', label: 'Meta Overview', key: 'dashboard', icon: BarChart3 },
    { href: '/lab/recommendations', label: 'My Decks', key: 'recommendations', icon: Target },
    { href: '/lab/anti-meta', label: 'Counter Pick', key: 'anti-meta', icon: Shield },
    { href: '/lab/predictions', label: 'Card Watch', key: 'predictions', icon: TrendingUp },
  ];
  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            
            <h1 className="text-3xl font-black tracking-tight md:text-4xl">PokeLab</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Research console untuk meta analysis, deck building, counter picks, dan card investment.</p>
          </div>
        </div>
      </header>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => { const Icon = tab.icon; const active = tab.key === mode; return (
          <a key={tab.key} href={tab.href} className={`inline-flex h-10 shrink-0 items-center rounded-lg border px-4 text-sm font-semibold transition-all ${active ? 'border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground'}`}><Icon className="mr-2 h-4 w-4" />{tab.label}</a>
        ); })}
      </nav>
      {children}
    </div>
  );
}

function DashboardView({ loading, decksLoading, isAuthenticated, decks, recommendations, predictions, forecast, bestRecommendation }: {
  loading: boolean; decksLoading: boolean; isAuthenticated: boolean;
  decks: { id: string; name: string; archetype?: string; tournament_count?: number; win_count?: number; top8_count?: number }[];
  recommendations: ResearchDeckRecommendation[]; predictions: MetaPrediction[];
  forecast: ResearchForecastResponse | null; bestRecommendation?: ResearchDeckRecommendation;
}) {
  const deckForecasts = forecast?.deck_predictions || [];
  const cardSignals = forecast?.card_predictions?.length ? forecast.card_predictions : predictions;
  const stats = forecast?.lab_stats;
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({});

  const tierList = useMemo(() => {
    const tiers: Record<string, MetaDeckPrediction[]> = { S: [], A: [], B: [], C: [] };
    deckForecasts.forEach(d => { const t = d.predicted_tier?.toUpperCase() || 'C'; if (tiers[t]) tiers[t].push(d); });
    return tiers;
  }, [deckForecasts]);

  const metaShareChart = useMemo(() => {
    const top8 = deckForecasts.slice(0, 8);
    return { labels: top8.map(d => d.archetype?.slice(0, 18) || '?'), datasets: [{ data: top8.map(d => d.meta_share_pct || 0), backgroundColor: PALETTE.slice(0, 8).map(c => c + '88'), borderColor: PALETTE.slice(0, 8), borderWidth: 2 }] };
  }, [deckForecasts]);

  const topMovers = useMemo(() => [...deckForecasts].filter(d => d.growth_signal === 'rising' || d.momentum_score > 60).sort((a, b) => {
    const diff = (b.momentum_score || 0) - (a.momentum_score || 0);
    if (diff !== 0) return diff;
    return (a.archetype || '').localeCompare(b.archetype || '');
  }).slice(0, 5), [deckForecasts]);
  const topCards = cardSignals.slice(0, 6);

  const { chartData: tournamentChartData, chartMode } = useMemo(() => {
    const sorted = [...deckForecasts]
      .sort((a, b) => {
        const diff = (b.prediction_score || 0) - (a.prediction_score || 0);
        if (diff !== 0) return diff;
        const tcDiff = (b.tournament_count || 0) - (a.tournament_count || 0);
        if (tcDiff !== 0) return tcDiff;
        return (a.archetype || '').localeCompare(b.archetype || '');
      })
      .slice(0, 10);
    if (sorted.length === 0) return { chartData: null, chartMode: 'empty' as const };

    const hasWins = sorted.some(d => (d.win_count || 0) > 0);
    const hasTop8 = sorted.some(d => (d.top8_count || 0) > 0);
    const hasTournaments = sorted.some(d => (d.tournament_count || 0) > 0);

    if (hasWins || hasTop8) {
      const byWins = [...sorted].sort((a, b) => {
        const diff = ((b.win_count || 0) + (b.top8_count || 0)) - ((a.win_count || 0) + (a.top8_count || 0));
        if (diff !== 0) return diff;
        return (a.archetype || '').localeCompare(b.archetype || '');
      });
      return {
        chartData: {
          labels: byWins.map(d => d.archetype?.slice(0, 20) || '?'),
          datasets: [
            { label: 'Wins', data: byWins.map(d => d.win_count || 0), backgroundColor: '#3b82f688', borderColor: '#3b82f6', borderWidth: 2, borderRadius: 4 },
            { label: 'Top 8', data: byWins.map(d => d.top8_count || 0), backgroundColor: '#22c55e66', borderColor: '#22c55e', borderWidth: 2, borderRadius: 4 },
            ...(hasTournaments ? [{ label: 'Tournaments', data: byWins.map(d => d.tournament_count || 0), backgroundColor: '#a855f755', borderColor: '#a855f7', borderWidth: 2, borderRadius: 4 }] : []),
          ],
        },
        chartMode: 'wins' as const,
      };
    }

    if (hasTournaments) {
      const byTourneys = [...sorted].sort((a, b) => {
        const diff = (b.tournament_count || 0) - (a.tournament_count || 0);
        if (diff !== 0) return diff;
        return (a.archetype || '').localeCompare(b.archetype || '');
      });
      return {
        chartData: {
          labels: byTourneys.map(d => d.archetype?.slice(0, 20) || '?'),
          datasets: [
            { label: 'Tournament Appearances', data: byTourneys.map(d => d.tournament_count || 0), backgroundColor: '#a855f755', borderColor: '#a855f7', borderWidth: 2, borderRadius: 4 },
            { label: 'Decklists', data: byTourneys.map(d => d.deck_count || 0), backgroundColor: '#3b82f688', borderColor: '#3b82f6', borderWidth: 2, borderRadius: 4 },
            { label: 'Meta Share %', data: byTourneys.map(d => Math.round(d.meta_share_pct || 0)), backgroundColor: '#f59e0b55', borderColor: '#f59e0b', borderWidth: 2, borderRadius: 4 },
          ],
        },
        chartMode: 'tournaments' as const,
      };
    }

    return {
      chartData: {
        labels: sorted.map(d => d.archetype?.slice(0, 20) || '?'),
        datasets: [
          { label: 'Prediction Score', data: sorted.map(d => d.prediction_score || 0), backgroundColor: '#3b82f688', borderColor: '#3b82f6', borderWidth: 2, borderRadius: 4 },
          { label: 'Momentum', data: sorted.map(d => d.momentum_score || 0), backgroundColor: '#22c55e66', borderColor: '#22c55e', borderWidth: 2, borderRadius: 4 },
          { label: 'Meta Share %', data: sorted.map(d => Math.round(d.meta_share_pct || 0)), backgroundColor: '#f59e0b55', borderColor: '#f59e0b', borderWidth: 2, borderRadius: 4 },
        ],
      },
      chartMode: 'meta' as const,
    };
  }, [deckForecasts]);

  const toggleTier = (tier: string) => setExpandedTiers(prev => ({ ...prev, [tier]: !prev[tier] }));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Crown} label="Meta Decks" value={stats?.total_decks || decks.length} color="blue" />
        <StatCard icon={BarChart3} label="Archetypes" value={stats?.total_archetypes || deckForecasts.length} color="green" />
        <StatCard icon={Zap} label="Card Signals" value={stats?.total_card_signals || cardSignals.length} color="amber" />
        <StatCard icon={Trophy} label="Tournaments" value={stats?.total_tournament_signals || deckForecasts.reduce((s, d) => s + (d.deck_count || 0), 0)} color="purple" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2"><Crown className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Meta Tier List</h2></div>
          <div className="space-y-3">
            {(['S', 'A', 'B', 'C'] as const).map(tier => {
              const tc = getTierColor(tier);
              const tierDecks = tierList[tier] || [];
              const isExpanded = expandedTiers[tier];
              const visibleDecks = isExpanded ? tierDecks : tierDecks.slice(0, 6);
              const hiddenCount = tierDecks.length - 6;
              return (
                <div key={tier} className={`rounded-lg border ${tc.border} ${tc.bg} p-3`}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`text-xl font-black ${tc.text}`}>Tier {tier}</span>
                    <span className="text-xs text-muted-foreground">({tierDecks.length} decks)</span>
                  </div>
                  {tierDecks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {visibleDecks.map(d => (
                        <a key={d.archetype} href={`/decks/detail?id=${encodeURIComponent(d.representative_deck_id)}`} className={`inline-flex items-center gap-1.5 rounded-md border ${tc.border} bg-background/80 px-2.5 py-1.5 text-xs font-semibold hover:bg-background transition-colors`}>
                          <span className="truncate max-w-[140px]">{d.archetype}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{d.meta_share_pct}%</span>
                        </a>
                      ))}
                      {!isExpanded && hiddenCount > 0 && (
                        <button onClick={() => toggleTier(tier)} className={`inline-flex items-center gap-1 rounded-md border border-dashed ${tc.border} px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors cursor-pointer`}>
                          +{hiddenCount} more <ChevronRight className="h-3 w-3" />
                        </button>
                      )}
                      {isExpanded && tierDecks.length > 6 && (
                        <button onClick={() => toggleTier(tier)} className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent transition-colors cursor-pointer">
                          Show less
                        </button>
                      )}
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No decks in this tier</p>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h3 className="font-bold text-sm">Meta Share</h3></div>
            <div className="h-[220px] flex items-center justify-center">
              {metaShareChart.labels.length > 0 ? <Doughnut data={metaShareChart} options={{ responsive: true, maintainAspectRatio: false, cutout: '55%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } } } }} /> : <EmptyChart text="No data" />}
            </div>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-400" /><h3 className="font-bold text-sm">Rising Decks</h3></div>
            {topMovers.length > 0 ? (
              <div className="space-y-2">
                {topMovers.map(d => (
                  <a key={d.archetype} href={`/decks/detail?id=${encodeURIComponent(d.representative_deck_id)}`} className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5 hover:border-primary/40 transition-colors">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{d.archetype}</p><p className="text-xs text-muted-foreground">{d.growth_signal}</p></div>
                    <div className="flex items-center gap-1 text-green-400"><ArrowUpRight className="h-4 w-4" /><span className="font-mono text-sm font-bold">{d.momentum_score}</span></div>
                  </a>
                ))}
              </div>
            ) : <EmptyChart text="No rising decks" />}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-2 flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Tournament Performance</h2></div>
        <p className="mb-4 text-xs text-muted-foreground">
          {chartMode === 'wins'
            ? 'Wins, Top 8, dan tournament count dari data turnamen.'
            : chartMode === 'tournaments'
              ? 'Tournament appearances, decklist count, dan meta share per archetype.'
              : chartMode === 'meta'
                ? 'Meta score, momentum, dan meta share archetype.'
                : 'Memuat data tournament...'}
        </p>
        <div className="h-[300px]">
          {tournamentChartData ? (
            <Bar data={tournamentChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 12 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'hsla(215,16%,47%,0.1)' } } } }} />
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-sm">Memuat tournament data...</p>
            </div>
          ) : <EmptyChart text="No tournament data" />}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-400" /><h2 className="text-lg font-bold">Top Cards to Watch</h2></div>
          <a href="/lab/predictions" className="text-sm font-semibold text-primary hover:underline">View all</a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topCards.map((card: any) => <CardSignalMini key={card.card_id} card={card} />)}
          {topCards.length === 0 && <p className="col-span-full text-center text-sm text-muted-foreground py-8">No card signals yet</p>}
        </div>
      </div>

      {isAuthenticated && bestRecommendation && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="mb-3 flex items-center gap-2"><Heart className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">Best Match for Your Collection</h2></div>
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="text-xl font-bold">{bestRecommendation.deck_name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{bestRecommendation.completeness_pct}% ready - {bestRecommendation.missing_cards?.length || 0} missing - {formatIDR(bestRecommendation.estimated_upgrade_cost_idr)}</p>
            </div>
            <a href="/lab/recommendations" className="inline-flex h-10 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">View Details</a>
          </div>
        </div>
      )}
    </div>
  );
}
function RecommendationsView({ loading, collectionId, recommendations, advisor, question, setQuestion, onAsk }: {
  loading: boolean; collectionId: string; recommendations: ResearchDeckRecommendation[];
  advisor?: string; question: string; setQuestion: (v: string) => void; onAsk: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard icon={Target} label="Total Matches" value={recommendations.length} color="blue" />
        <StatCard icon={Heart} label="High Priority Cards" value={recommendations.reduce((s, r) => s + r.missing_cards.filter(c => c.buy_priority === 'high').length, 0)} color="amber" />
        <StatCard icon={Zap} label="Est. Top 3 Cost" value={formatIDR(recommendations.slice(0, 3).reduce((s, r) => s + r.estimated_upgrade_cost_idr, 0))} color="green" />
      </div>
      {loading && recommendations.length === 0 ? <LoadingBlock /> : (
        <div className="space-y-4">
          {recommendations.slice(0, 8).map((rec, i) => <DeckRecommendationCard key={rec.deck_id} rec={rec} rank={i + 1} />)}
          {recommendations.length === 0 && <EmptyBlock text="No recommendations. Add cards to your collection first." />}
        </div>
      )}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><h2 className="text-lg font-bold">AI Deck Advisor</h2></div>
        <p className="mb-3 text-sm text-muted-foreground">Ask about your best deck options, missing card priorities, and matchup training.</p>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} className="min-h-[100px] w-full rounded-lg border border-input bg-background p-3 text-sm leading-6" />
        <button onClick={onAsk} disabled={loading || recommendations.length === 0} className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}Ask Advisor
        </button>
        {advisor && <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{advisor}</div>}
      </div>
    </div>
  );
}

function DeckRecommendationCard({ rec, rank }: { rec: ResearchDeckRecommendation; rank: number }) {
  const completeness = rec.completeness_pct || 0;
  const missing = rec.missing_cards || [];
  const highPriority = missing.filter(c => c.buy_priority === 'high');
  return (
    <div className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">#{rank}</span>
            <a href={`/decks/detail?id=${encodeURIComponent(rec.deck_id)}`} className="truncate text-lg font-bold hover:text-primary transition-colors">{rec.deck_name}</a>
          </div>
          <p className="text-sm text-muted-foreground">{rec.archetype} - {rec.tier}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-primary">{completeness}%</p>
          <p className="text-xs text-muted-foreground">complete</p>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${completeness >= 80 ? 'bg-green-500' : completeness >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: completeness + '%' }} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Missing</p><p className="text-lg font-bold">{missing.length}</p></div>
        <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">High Priority</p><p className="text-lg font-bold text-amber-400">{highPriority.length}</p></div>
        <div className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">Est. Cost</p><p className="text-lg font-bold">{formatIDR(rec.estimated_upgrade_cost_idr)}</p></div>
      </div>
      {missing.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Missing Cards ({missing.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.slice(0, 8).map(card => (
              <span key={card.card_id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${card.buy_priority === 'high' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-border bg-background text-muted-foreground'}`}>
                {card.card_name}{card.missing_count > 1 && <span className="font-mono">x{card.missing_count}</span>}
              </span>
            ))}
            {missing.length > 8 && <span className="inline-flex items-center px-2 text-xs text-muted-foreground">+{missing.length - 8} more</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function AntiMetaView({ loading, decks, targetDeckId, setTargetDeckId, antiMeta }: {
  loading: boolean; decks: { id: string; name: string }[]; targetDeckId: string;
  setTargetDeckId: (v: string) => void; antiMeta: AntiMetaRecommendation[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="text-lg font-bold mb-1">Pick Your Counter</h2>
            <p className="text-sm text-muted-foreground">Select the deck you want to counter, then review tech cards and matchup strategies.</p>
          </div>
          <div className="flex gap-2">
            <select value={targetDeckId} onChange={e => setTargetDeckId(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm min-w-[200px]">
              {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {targetDeckId && <a href={'/decks/detail?id=' + encodeURIComponent(targetDeckId)} className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-accent">View Target</a>}
          </div>
        </div>
      </div>
      {loading && antiMeta.length === 0 ? <LoadingBlock /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {antiMeta.map(item => <CounterDeckCard key={item.counter_deck_id} item={item} />)}
          {antiMeta.length === 0 && <div className="col-span-full"><EmptyBlock text="Select a target deck to see counter options." /></div>}
        </div>
      )}
    </div>
  );
}

function CounterDeckCard({ item }: { item: AntiMetaRecommendation }) {
  const score = item.counter_score || 0;
  const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-slate-400';
  return (
    <div className="rounded-xl border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <a href={'/decks/detail?id=' + encodeURIComponent(item.counter_deck_id)} className="text-lg font-bold hover:text-primary transition-colors">{item.counter_deck_name}</a>
          <p className="text-sm text-muted-foreground">{item.archetype || 'Flexible'}</p>
        </div>
        <div className="text-right">
          <p className={'text-3xl font-black ' + scoreColor}>{score}</p>
          <p className="text-xs text-muted-foreground">counter score</p>
        </div>
      </div>
      {item.tech_cards.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Tech Cards</p>
          <div className="flex flex-wrap gap-1.5">
            {item.tech_cards.map(tech => <span key={tech} className="inline-flex items-center rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{tech}</span>)}
          </div>
        </div>
      )}
      {item.matchup_notes.length > 0 && (
        <div className="space-y-1.5">
          {item.matchup_notes.map(note => (
            <div key={note} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Swords className="h-3 w-3 mt-0.5 shrink-0 text-primary" /><span>{note}</span>
            </div>
          ))}
        </div>
      )}
      <a href={'/decks/detail?id=' + encodeURIComponent(item.counter_deck_id)} className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15 transition-colors">
        View Deck Details <ChevronRight className="ml-1 h-3 w-3" />
      </a>
    </div>
  );
}

function PredictionsView({ loading, category, setCategory, predictions, forecast }: {
  loading: boolean; category: string; setCategory: (v: string) => void;
  predictions: MetaPrediction[]; forecast: ResearchForecastResponse | null;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('score');
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return predictions.filter(c => !q || (c.card_name + ' ' + c.category + ' ' + (c.card_type || '')).toLowerCase().includes(q)).sort((a, b) => {
      switch (sort) { case 'confidence': return (b.confidence_pct || 0) - (a.confidence_pct || 0); case 'adoption': return (b.adoption_velocity || 0) - (a.adoption_velocity || 0); case 'staple': return (b.staple_index || 0) - (a.staple_index || 0); case 'name': return a.card_name.localeCompare(b.card_name); default: return (b.prediction_score || 0) - (a.prediction_score || 0); }
    });
  }, [predictions, query, sort]);
  useEffect(() => { setPage(1); }, [category, query, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const catChart = useMemo(() => {
    const counts: Record<string, number> = {};
    predictions.forEach(c => { const cat = c.category || 'Unknown'; counts[cat] = (counts[cat] || 0) + 1; });
    const entries = Object.entries(counts).sort(([, a], [, b]) => (b as number) - (a as number));
    return { labels: entries.map(([c]) => c), datasets: [{ data: entries.map(([, c]) => c as number), backgroundColor: PALETTE.slice(0, entries.length).map(c => c + '88'), borderColor: PALETTE.slice(0, entries.length), borderWidth: 2 }] };
  }, [predictions]);
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard icon={Star} label="Total Signals" value={predictions.length} color="blue" />
        <StatCard icon={TrendingUp} label="Rising" value={predictions.filter(c => c.trend === 'rising').length} color="green" />
        <StatCard icon={Zap} label="High Confidence" value={predictions.filter(c => (c.confidence_pct || 0) >= 70).length} color="amber" />
        <StatCard icon={Activity} label="Watch List" value={predictions.filter(c => c.trend === 'watch').length} color="purple" />
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {predictionFilters.map(f => (
            <button key={f || 'all'} onClick={() => setCategory(f)} className={'h-9 rounded-md border px-3 text-sm font-medium transition-colors ' + (category === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground')}>{f || 'All'}</button>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search card name, type..." className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="score">Sort by score</option><option value="confidence">Sort by confidence</option><option value="adoption">Sort by adoption</option><option value="staple">Sort by staple</option><option value="name">Sort by name</option>
          </select>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h3 className="font-bold text-sm">Signal Distribution by Category</h3></div>
        <div className="h-[200px] flex items-center justify-center">
          {catChart.labels.length > 0 ? <Doughnut data={catChart} options={{ responsive: true, maintainAspectRatio: false, cutout: '50%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, padding: 8, font: { size: 10 } } } } }} /> : <EmptyChart text="No data" />}
        </div>
      </div>
      {loading && predictions.length === 0 ? <LoadingBlock /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map(card => <PredictionCardEnhanced key={card.card_id} card={card} />)}
            {visible.length === 0 && <div className="col-span-full"><EmptyBlock text="No cards match your filter." /></div>}
          </div>
          <PaginationControls page={safePage} totalPages={totalPages} totalItems={filtered.length} pageSize={pageSize} label="cards" onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

function PredictionCardEnhanced({ card }: { card: MetaPrediction }) {
  const score = card.prediction_score || 0;
  const trend = card.trend || 'stable';
  const TrendIcon = trend === 'rising' ? ArrowUpRight : trend === 'falling' ? ArrowDownRight : Minus;
  const trendColor = trend === 'rising' ? 'text-green-400' : trend === 'falling' ? 'text-red-400' : 'text-slate-400';
  return (
    <a href={"/cards/detail?id=" + encodeURIComponent(card.card_id)} className="block rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 cursor-pointer">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0"><h3 className="truncate font-bold">{card.card_name}</h3><p className="text-xs text-muted-foreground">{card.category}{card.card_type ? ' - ' + card.card_type : ''}</p></div>
        <div className={'flex items-center gap-1 ' + trendColor}><TrendIcon className="h-4 w-4" /><span className="text-xs font-bold uppercase">{trend}</span></div>
      </div>
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Prediction Score</span><span className="font-mono text-sm font-bold text-primary">{score}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={'h-full rounded-full ' + (score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : 'bg-slate-500')} style={{ width: Math.min(100, score) + '%' }} /></div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MicroStat label="Confidence" value={(card.confidence_pct || 0) + '%'} />
        <MicroStat label="Adoption" value={String(card.adoption_velocity || 0)} />
        <MicroStat label="Staple" value={String(card.staple_index || 0)} />
      </div>
      {card.reason && <p className="text-xs leading-5 text-muted-foreground mb-2">{card.reason}</p>}
{card.recommended_action && <div className="rounded-md border border-primary/25 bg-primary/10 p-2 text-xs text-primary">{card.recommended_action}</div>}
    </a>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number | string; color: string }) {
  const cm: Record<string, string> = { blue: 'bg-primary/10 text-primary border-primary/20', green: 'bg-green-500/10 text-green-600 border-green-500/20', amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20', purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20' };
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
      <div className={'p-2.5 rounded-lg border ' + (cm[color] || cm.blue)}><Icon className="h-5 w-5" /></div>
      <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p><p className="text-2xl font-black tracking-tight">{value}</p></div>
    </div>
  );
}

function CardSignalMini({ card }: { card: any }) {
  const score = card.prediction_score || 0;
  return (
    <div className="rounded-lg border bg-background p-3 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-2 mb-2"><p className="truncate text-sm font-semibold">{card.card_name}</p><span className="font-mono text-sm font-bold text-primary">{score}</span></div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{card.category}</span><span>-</span><span>{card.confidence_pct || 0}% conf</span><span>-</span><span className={card.trend === 'rising' ? 'text-green-400' : ''}>{card.trend || 'stable'}</span></div>
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) { return <div className="rounded-md border bg-background px-2 py-1.5 text-center"><p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="font-mono text-xs font-semibold">{value}</p></div>; }

function PaginationControls({ page, totalPages, totalItems, pageSize, label, onPageChange }: { page: number; totalPages: number; totalItems: number; pageSize: number; label: string; onPageChange: (p: number) => void }) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">Showing <span className="font-mono text-foreground">{start}-{end}</span> of <span className="font-mono text-foreground">{totalItems}</span> {label}</p>
      <div className="flex items-center gap-2">
        <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-40">Prev</button>
        <span className="min-w-16 text-center font-mono text-xs text-muted-foreground">{page}/{totalPages}</span>
        <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="inline-flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-muted-foreground hover:bg-accent disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

function LoginNeededPanel() {
  return (
    <section className="rounded-xl border bg-card p-10 text-center">
      <Target className="mx-auto h-12 w-12 text-primary mb-4" />
      <h2 className="text-2xl font-bold">Login Required</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Deck recommendations need your collection data to calculate completeness, missing cards, and upgrade costs.</p>
      <div className="mt-6 flex justify-center gap-3">
        <a href="/login?redirect=/lab/recommendations" className="inline-flex h-10 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Login</a>
        <a href="/register?redirect=/lab/recommendations" className="inline-flex h-10 items-center rounded-lg border border-border px-6 text-sm font-semibold hover:bg-accent">Register</a>
      </div>
    </section>
  );
}

function EmptyChart({ text }: { text: string }) { return <div className="flex flex-col items-center justify-center h-full text-muted-foreground"><BarChart3 className="h-8 w-8 mb-2 opacity-20" /><p className="text-sm">{text}</p></div>; }
function EmptyBlock({ text }: { text: string }) { return <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>; }
function LoadingBlock() { return <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading data...</div>; }
// v21:26:59
