import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Activity,
  BarChart3,
  Brain,
  Loader2,
  Zap,
  Database,
  Target,
} from 'lucide-react';
import api from '@/api/client';
import { useResearchStore } from '@stores/index';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Tooltip, Legend, Title
);

const COLORS = {
  primary: 'hsl(221, 83%, 53%)',
  green: 'hsl(142, 71%, 45%)',
  amber: 'hsl(38, 92%, 50%)',
  red: 'hsl(0, 84%, 60%)',
  purple: 'hsl(262, 83%, 58%)',
  teal: 'hsl(173, 80%, 40%)',
  slate: 'hsl(215, 16%, 47%)',
};

const CHART_PALETTE = [
  COLORS.primary, COLORS.green, COLORS.amber, COLORS.red,
  COLORS.purple, COLORS.teal, '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

const chartFont = { family: "'Inter', 'system-ui', sans-serif" };
const gridColor = 'hsla(215, 16%, 47%, 0.12)';

ChartJS.defaults.font.family = chartFont.family;
ChartJS.defaults.font.size = 11;
ChartJS.defaults.color = 'hsl(215, 16%, 47%)';

export default function MLDashboard() {
  const { forecast, predictions, fetchForecast } = useResearchStore();
  const [topDecks, setTopDecks] = useState<any[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);

  useEffect(() => {
    fetchForecast('', 100);
    loadDecks();
  }, []);

  async function loadDecks() {
    setDecksLoading(true);
    try {
      const resp = await api.getDecks({ limit: 50 }).catch(() => ({ success: false, data: [] }));
      if (resp.success && resp.data) {
        const decks = Array.isArray(resp.data) ? resp.data : (resp.data as any).decks || [];
        setTopDecks(decks.slice(0, 30));
      }
    } catch { /* silent */ } finally {
      setDecksLoading(false);
    }
  }

  const deckForecasts = forecast?.deck_predictions || [];
  const cardSignals = forecast?.card_predictions?.length ? forecast.card_predictions : predictions;
  const labStats = forecast?.lab_stats;

  // Meta Share Horizontal Bar
  const metaShareData = useMemo(() => {
    const top10 = deckForecasts.slice(0, 10);
    return {
      labels: top10.map(d => d.archetype?.slice(0, 22) || 'Unknown'),
      datasets: [{
        label: 'Meta Share %',
        data: top10.map(d => d.meta_share_pct || 0),
        backgroundColor: CHART_PALETTE.slice(0, top10.length).map(c => c + '44'),
        borderColor: CHART_PALETTE.slice(0, top10.length),
        borderWidth: 2,
        borderRadius: 6,
      }],
    };
  }, [deckForecasts]);

  // Prediction Score Horizontal Bar (replacing Momentum Matrix)
  const predictionScoreData = useMemo(() => {
    const top12 = [...deckForecasts]
      .sort((a, b) => (b.prediction_score || 0) - (a.prediction_score || 0))
      .slice(0, 12);
    return {
      labels: top12.map(d => d.archetype?.slice(0, 22) || 'Unknown'),
      datasets: [
        {
          label: 'Prediction Score',
          data: top12.map(d => d.prediction_score || 0),
          backgroundColor: COLORS.primary + '55',
          borderColor: COLORS.primary,
          borderWidth: 2,
          borderRadius: 4,
        },
        {
          label: 'Confidence %',
          data: top12.map(d => d.confidence_pct || 0),
          backgroundColor: COLORS.green + '44',
          borderColor: COLORS.green,
          borderWidth: 2,
          borderRadius: 4,
        },
      ],
    };
  }, [deckForecasts]);

  // Tier Distribution Doughnut
  const tierData = useMemo(() => {
    const counts: Record<string, number> = {};
    deckForecasts.forEach(d => {
      const tier = d.predicted_tier || 'Unknown';
      counts[tier] = (counts[tier] || 0) + 1;
    });
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    return {
      labels: entries.map(([t]) => `Tier ${t}`),
      datasets: [{
        data: entries.map(([, c]) => c),
        backgroundColor: CHART_PALETTE.slice(0, entries.length).map(c => c + '88'),
        borderColor: CHART_PALETTE.slice(0, entries.length),
        borderWidth: 2,
      }],
    };
  }, [deckForecasts]);

  // Deck Tournament Performance
  const deckPerformanceData = useMemo(() => {
    const sorted = [...deckForecasts]
      .sort((a, b) => (b.prediction_score || 0) - (a.prediction_score || 0))
      .slice(0, 10);
    if (sorted.length === 0) return { labels: [] as string[], datasets: [] as any[] };

    const hasWins = sorted.some(d => (d.win_count || 0) > 0);
    const hasTop8 = sorted.some(d => (d.top8_count || 0) > 0);
    const hasTournaments = sorted.some(d => (d.tournament_count || 0) > 0);

    if (hasWins || hasTop8) {
      const byWins = [...sorted].sort((a, b) => ((b.win_count || 0) + (b.top8_count || 0)) - ((a.win_count || 0) + (a.top8_count || 0)));
      return {
        labels: byWins.map(d => d.archetype?.slice(0, 24) || 'Unknown'),
        datasets: [
          { label: 'Wins', data: byWins.map(d => d.win_count || 0), backgroundColor: COLORS.primary + '66', borderColor: COLORS.primary, borderWidth: 2, borderRadius: 4 },
          { label: 'Top 8', data: byWins.map(d => d.top8_count || 0), backgroundColor: COLORS.green + '66', borderColor: COLORS.green, borderWidth: 2, borderRadius: 4 },
          ...(hasTournaments ? [{ label: 'Tournaments', data: byWins.map(d => d.tournament_count || 0), backgroundColor: COLORS.amber + '44', borderColor: COLORS.amber, borderWidth: 2, borderRadius: 4 }] : []),
        ],
      };
    }

    if (hasTournaments) {
      const byTourneys = [...sorted].sort((a, b) => (b.tournament_count || 0) - (a.tournament_count || 0));
      return {
        labels: byTourneys.map(d => d.archetype?.slice(0, 24) || 'Unknown'),
        datasets: [
          { label: 'Tournament Appearances', data: byTourneys.map(d => d.tournament_count || 0), backgroundColor: COLORS.purple + '55', borderColor: COLORS.purple, borderWidth: 2, borderRadius: 4 },
          { label: 'Decklists', data: byTourneys.map(d => d.deck_count || 0), backgroundColor: COLORS.primary + '66', borderColor: COLORS.primary, borderWidth: 2, borderRadius: 4 },
          { label: 'Meta Share %', data: byTourneys.map(d => Math.round(d.meta_share_pct || 0)), backgroundColor: COLORS.amber + '44', borderColor: COLORS.amber, borderWidth: 2, borderRadius: 4 },
        ],
      };
    }

    return {
      labels: sorted.map(d => d.archetype?.slice(0, 24) || 'Unknown'),
      datasets: [
        { label: 'Prediction Score', data: sorted.map(d => d.prediction_score || 0), backgroundColor: COLORS.primary + '66', borderColor: COLORS.primary, borderWidth: 2, borderRadius: 4 },
        { label: 'Momentum', data: sorted.map(d => d.momentum_score || 0), backgroundColor: COLORS.green + '66', borderColor: COLORS.green, borderWidth: 2, borderRadius: 4 },
        { label: 'Meta Share %', data: sorted.map(d => Math.round(d.meta_share_pct || 0)), backgroundColor: COLORS.amber + '44', borderColor: COLORS.amber, borderWidth: 2, borderRadius: 4 },
      ],
    };
  }, [deckForecasts]);

  // Card Category Doughnut
  const categoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    cardSignals.forEach((c: any) => {
      const cat = c.category || 'Unknown';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    const entries = Object.entries(counts).sort(([, a], [, b]) => (b as number) - (a as number));
    return {
      labels: entries.map(([c]) => c),
      datasets: [{
        data: entries.map(([, c]) => c as number),
        backgroundColor: CHART_PALETTE.slice(0, entries.length).map(c => c + '88'),
        borderColor: CHART_PALETTE.slice(0, entries.length),
        borderWidth: 2,
      }],
    };
  }, [cardSignals]);

  const hBarOpts = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'hsl(222, 47%, 11%)', padding: 12, cornerRadius: 8 },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { font: { size: 10 } } },
      y: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  const multiHBarOpts = {
    ...hBarOpts,
    plugins: {
      ...hBarOpts.plugins,
      legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, padding: 14, font: { size: 11 } } },
    },
  };

  const vBarOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' as const, labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
      tooltip: { backgroundColor: 'hsl(222, 47%, 11%)', padding: 12, cornerRadius: 8 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
      y: { grid: { color: gridColor }, beginAtZero: true },
    },
  };

  const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '55%',
    plugins: {
      legend: { position: 'right' as const, labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: { backgroundColor: 'hsl(222, 47%, 11%)', padding: 12, cornerRadius: 8 },
    },
  };

  const isLoading = decksLoading && deckForecasts.length === 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading dashboard data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KPICard icon={Database} label="Total Decks" value={labStats?.total_decks || topDecks.length || 0} color="blue" />
        <KPICard icon={BarChart3} label="Archetypes" value={labStats?.total_archetypes || deckForecasts.length || 0} color="green" />
        <KPICard icon={Zap} label="Card Signals" value={labStats?.total_card_signals || cardSignals.length || 0} color="amber" />
        <KPICard icon={Activity} label="Tournaments" value={labStats?.total_tournament_signals || 0} color="purple" />
      </div>

      {/* Row 1: Meta Share + Prediction Score */}
      <div className="grid gap-6 xl:grid-cols-2">
        <ChartCard title="Meta Share Distribution" description="Top 10 archetype berdasarkan meta share percentage." icon={BarChart3}>
          <div className="h-[380px]">
            {metaShareData.labels.length > 0 ? (
              <Bar data={metaShareData} options={hBarOpts} />
            ) : (
              <EmptyChart text="Belum ada data meta share." />
            )}
          </div>
        </ChartCard>

        <ChartCard title="Prediction Score & Confidence" description="Top 12 deck berdasarkan prediction score dan confidence." icon={Target}>
          <div className="h-[380px]">
            {predictionScoreData.labels.length > 0 ? (
              <Bar data={predictionScoreData} options={multiHBarOpts} />
            ) : (
              <EmptyChart text="Belum ada data prediction." />
            )}
          </div>
        </ChartCard>
      </div>

      {/* Row 2: Deck Performance + Tier Distribution */}
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Deck Tournament Performance" description="Tournament appearances, decklist count, dan meta share per archetype." icon={BarChart3}>
          <div className="h-[380px]">
            {deckPerformanceData.labels.length > 0 ? (
              <Bar data={deckPerformanceData} options={vBarOpts} />
            ) : (
              <EmptyChart text="Belum ada data tournament." />
            )}
          </div>
        </ChartCard>

        <ChartCard title="Tier Distribution" description="Distribusi predicted tier dari model forecast." icon={Brain}>
          <div className="h-[380px] flex items-center justify-center">
            {tierData.labels.length > 0 ? (
              <Doughnut data={tierData} options={doughnutOpts} />
            ) : (
              <EmptyChart text="Belum ada data tier." />
            )}
          </div>
        </ChartCard>
      </div>

      {/* Row 3: Card Category + Model Coverage */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <ChartCard title="Card Signal Categories" description="Distribusi kategori kartu dari prediction signals." icon={Brain}>
          <div className="h-[380px] flex items-center justify-center">
            {categoryData.labels.length > 0 ? (
              <Doughnut data={categoryData} options={doughnutOpts} />
            ) : (
              <EmptyChart text="Belum ada data card signals." />
            )}
          </div>
        </ChartCard>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="font-bold text-sm">Model Coverage & Methodology</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 mb-5">
            <MiniStat label="Decks" value={labStats?.total_decks || 0} />
            <MiniStat label="Archetypes" value={labStats?.total_archetypes || 0} />
            <MiniStat label="Card Signals" value={labStats?.total_card_signals || 0} />
            <MiniStat label="Tournament Signals" value={labStats?.total_tournament_signals || 0} />
          </div>
          <div className="border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Methodology</p>
            <ul className="space-y-1.5 text-xs leading-5 text-muted-foreground">
              {(forecast?.methodology || [
                'Deterministic scoring dari deck tournament, meta share, dan momentum.',
                'Price trends dari scraping marketplace Indonesia.',
                'Card signals dari adoption velocity, staple index, dan volatility.',
                'Forecast model menggunakan weighted scoring, bukan ML black-box.',
              ]).map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub Components ---

function KPICard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-green-500/10 text-green-600 border-green-500/20',
    amber: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  };
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg border ${colorMap[color] || colorMap.blue}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, description, icon: Icon, children }: { title: string; description: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 mt-0.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h3 className="font-bold text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
      <p className="text-sm">{text}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xl font-black tracking-tight mt-1">{value}</p>
    </div>
  );
}
