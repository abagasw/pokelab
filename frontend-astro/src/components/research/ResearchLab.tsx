import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Brain,
  ChevronRight,
  FlaskConical,
  Gauge,
  Layers3,
  Loader2,
  Package,
  Search,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore, useCollectionStore, useDeckStore, useResearchStore } from '@stores/index';
import { formatIDR } from '@utils/formatters';
import type { AntiMetaRecommendation, MetaPrediction, ResearchDeckRecommendation } from '@/types/index';

type ResearchLabMode = 'dashboard' | 'recommendations' | 'anti-meta' | 'predictions';

interface ResearchLabProps {
  mode: ResearchLabMode;
}

const predictionFilters = ['', 'Pokemon', 'Trainer', 'Supporter', 'Item', 'Energy'];

export default function ResearchLab({ mode }: ResearchLabProps) {
  const { isAuthenticated, user } = useAuthStore();
  const { collections, fetchCollections } = useCollectionStore();
  const { decks, fetchDecks } = useDeckStore();
  const {
    recommendations,
    antiMeta,
    predictions,
    advisor,
    loading,
    error,
    fetchRecommendations,
    fetchAntiMeta,
    fetchPredictions,
    askAdvisor,
  } = useResearchStore();

  const [collectionId, setCollectionId] = useState('');
  const [targetDeckId, setTargetDeckId] = useState('');
  const [category, setCategory] = useState('');
  const [question, setQuestion] = useState('Jelaskan deck terbaik dari inventory saya, missing card prioritas, dan matchup yang perlu dilatih.');

  useEffect(() => {
    if (isAuthenticated) {
      fetchCollections();
      fetchDecks({ limit: 30 });
      fetchPredictions('');
    }
  }, [isAuthenticated, fetchCollections, fetchDecks, fetchPredictions]);

  useEffect(() => {
    if (!collectionId && collections.length > 0) {
      setCollectionId(collections[0].id);
    }
  }, [collectionId, collections]);

  useEffect(() => {
    if (!targetDeckId && decks.length > 0) {
      setTargetDeckId(decks[0].id);
    }
  }, [decks, targetDeckId]);

  useEffect(() => {
    if (collectionId && (mode === 'dashboard' || mode === 'recommendations')) {
      fetchRecommendations(collectionId);
    }
  }, [collectionId, mode, fetchRecommendations]);

  useEffect(() => {
    if (targetDeckId && mode === 'anti-meta') {
      fetchAntiMeta(targetDeckId);
    }
  }, [targetDeckId, mode, fetchAntiMeta]);

  useEffect(() => {
    if (mode === 'predictions') {
      fetchPredictions(category);
    }
  }, [category, mode, fetchPredictions]);

  const bestRecommendation = recommendations[0];
  const topThreeCost = useMemo(
    () => recommendations.slice(0, 3).reduce((sum, deck) => sum + deck.estimated_upgrade_cost_idr, 0),
    [recommendations]
  );
  const highPriorityCount = useMemo(
    () => recommendations[0]?.missing_cards.filter((card) => card.buy_priority === 'high').length || 0,
    [recommendations]
  );

  if (!isAuthenticated) {
    return (
      <LabShell mode={mode}>
        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-2xl px-4 py-12 text-center">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Login untuk membuka PokeLab ID</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Research lab memakai collection akun untuk menghitung deck readiness, missing cards, upgrade cost, dan counter plan.
            </p>
            <a
              href="/login"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Login
            </a>
          </div>
        </section>
      </LabShell>
    );
  }

  return (
    <LabShell mode={mode}>
      <ControlBar
        username={user?.username}
        collections={collections}
        collectionId={collectionId}
        onCollectionChange={setCollectionId}
      />

      {error && (
        <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {mode === 'dashboard' && (
        <DashboardView
          loading={loading}
          collectionId={collectionId}
          recommendations={recommendations}
          predictions={predictions}
          bestRecommendation={bestRecommendation}
          topThreeCost={topThreeCost}
          highPriorityCount={highPriorityCount}
        />
      )}

      {mode === 'recommendations' && (
        <RecommendationsView
          loading={loading}
          collectionId={collectionId}
          recommendations={recommendations}
          advisor={advisor?.answer}
          question={question}
          setQuestion={setQuestion}
          onAsk={() => askAdvisor(question, JSON.stringify(recommendations.slice(0, 3)))}
        />
      )}

      {mode === 'anti-meta' && (
        <AntiMetaView
          loading={loading}
          decks={decks}
          targetDeckId={targetDeckId}
          setTargetDeckId={setTargetDeckId}
          antiMeta={antiMeta}
        />
      )}

      {mode === 'predictions' && (
        <PredictionsView
          loading={loading}
          category={category}
          setCategory={setCategory}
          predictions={predictions}
        />
      )}
    </LabShell>
  );
}

function LabShell({ mode, children }: { mode: ResearchLabMode; children: React.ReactNode }) {
  const tabs = [
    { href: '/lab', label: 'Radar', key: 'dashboard', icon: BarChart3 },
    { href: '/lab/recommendations', label: 'Inventory Decks', key: 'recommendations', icon: Target },
    { href: '/lab/anti-meta', label: 'Anti-Meta', key: 'anti-meta', icon: Shield },
    { href: '/lab/predictions', label: 'Predictions', key: 'predictions', icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex h-8 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wide text-primary">
              <FlaskConical className="mr-2 h-4 w-4" />
              Competitive Research Lab
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">PokeLab ID</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Research console untuk rekomendasi deck meta, anti-meta plan, prediksi kartu, dan upgrade path berdasarkan inventory.
            </p>
          </div>
          <div className="max-w-md border border-border bg-card/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            Scoring dihitung deterministik dari collection, deck meta, turnamen, dan harga. OpenRouter AI dipakai untuk menjelaskan hasil, bukan menentukan ranking.
          </div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === mode;
          return (
            <a
              key={tab.key}
              href={tab.href}
              className={`inline-flex h-10 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card/40 text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="mr-2 h-4 w-4" />
              {tab.label}
            </a>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

function ControlBar({
  username,
  collections,
  collectionId,
  onCollectionChange,
}: {
  username?: string;
  collections: { id: string; name: string; total_cards?: number }[];
  collectionId: string;
  onCollectionChange: (value: string) => void;
}) {
  const selected = collections.find((collection) => collection.id === collectionId);

  return (
    <section className="grid gap-3 border-y border-border bg-card/35 p-4 lg:grid-cols-[1fr_320px] lg:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill icon={Activity} label="Workspace" value={username || 'Trainer'} />
        <StatusPill icon={Layers3} label="Inventory Source" value={selected?.name || 'No collection'} />
        <StatusPill icon={Gauge} label="Mode" value="Login required" />
      </div>
      <div>
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Collection</label>
        <select
          value={collectionId}
          onChange={(event) => onCollectionChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

function DashboardView({
  loading,
  collectionId,
  recommendations,
  predictions,
  bestRecommendation,
  topThreeCost,
  highPriorityCount,
}: {
  loading: boolean;
  collectionId: string;
  recommendations: ResearchDeckRecommendation[];
  predictions: MetaPrediction[];
  bestRecommendation?: ResearchDeckRecommendation;
  topThreeCost: number;
  highPriorityCount: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={Target} label="Best Match" value={bestRecommendation?.deck_name || '-'} detail={`${bestRecommendation?.completeness_pct || 0}% inventory ready`} tone="blue" />
        <MetricTile icon={Package} label="Top 3 Upgrade" value={formatIDR(topThreeCost)} detail="estimasi missing cards" tone="green" />
        <MetricTile icon={Search} label="High Priority Gaps" value={`${highPriorityCount}`} detail="dari deck match terbaik" tone="amber" />
        <MetricTile icon={Brain} label="AI Mode" value="Explain Only" detail="ranking tetap teruji" tone="purple" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
        <ResearchPanel
          title="Inventory Readiness"
          description="Deck meta yang paling dekat dengan collection aktif."
          actionHref="/lab/recommendations"
          actionLabel="Buka ranking"
        >
          {loading && recommendations.length === 0 ? <LoadingBlock /> : <RecommendationTable collectionId={collectionId} recommendations={recommendations.slice(0, 6)} compact />}
        </ResearchPanel>

        <ResearchPanel
          title="Meta Radar Indonesia"
          description="Kartu dengan sinyal penggunaan turnamen tertinggi."
          actionHref="/lab/predictions"
          actionLabel="Buka board"
        >
          <div className="divide-y divide-border">
            {predictions.slice(0, 7).map((card) => (
              <PredictionLine key={card.card_id} card={card} />
            ))}
            {predictions.length === 0 && <EmptyBlock text="Belum ada prediction signal." />}
          </div>
        </ResearchPanel>
      </div>
    </div>
  );
}

function RecommendationsView({
  loading,
  collectionId,
  recommendations,
  advisor,
  question,
  setQuestion,
  onAsk,
}: {
  loading: boolean;
  collectionId: string;
  recommendations: ResearchDeckRecommendation[];
  advisor?: string;
  question: string;
  setQuestion: (value: string) => void;
  onAsk: () => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <ResearchPanel title="Deck Recommendation Ranking" description="Urutan berdasarkan inventory completeness, meta score, dan upgrade cost.">
        {loading && recommendations.length === 0 ? <LoadingBlock /> : <RecommendationTable collectionId={collectionId} recommendations={recommendations} />}
      </ResearchPanel>

      <aside className="border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">AI Matchup Coach</h2>
        </div>
        <p className="mb-3 text-sm leading-6 text-muted-foreground">
          Advisor membaca hasil ranking deterministik, lalu memberi latihan matchup dan prioritas upgrade.
        </p>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          className="min-h-[128px] w-full rounded-md border border-input bg-background p-3 text-sm leading-6"
        />
        <button
          onClick={onAsk}
          disabled={loading || recommendations.length === 0}
          className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
          Tanya Advisor
        </button>
        {advisor && <div className="mt-4 border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">{advisor}</div>}
      </aside>
    </div>
  );
}

function AntiMetaView({
  loading,
  decks,
  targetDeckId,
  setTargetDeckId,
  antiMeta,
}: {
  loading: boolean;
  decks: { id: string; name: string }[];
  targetDeckId: string;
  setTargetDeckId: (value: string) => void;
  antiMeta: AntiMetaRecommendation[];
}) {
  return (
    <ResearchPanel title="Anti-Meta Matrix" description="Pilih target meta, lalu lihat counter deck, tech cards, dan matchup plan.">
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_320px] md:items-end">
        <div className="text-sm leading-6 text-muted-foreground">
          Matrix ini cocok untuk persiapan turnamen lokal: tentukan deck lawan yang paling sering muncul, lalu prioritaskan counter plan yang masih realistis dimainkan.
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target Deck</label>
          <select
            value={targetDeckId}
            onChange={(event) => setTargetDeckId(event.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && antiMeta.length === 0 ? (
        <LoadingBlock />
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {antiMeta.map((item) => (
            <AntiMetaRow key={item.counter_deck_id} item={item} />
          ))}
          {antiMeta.length === 0 && <EmptyBlock text="Pilih target deck setelah data deck tersedia." />}
        </div>
      )}
    </ResearchPanel>
  );
}

function PredictionsView({
  loading,
  category,
  setCategory,
  predictions,
}: {
  loading: boolean;
  category: string;
  setCategory: (value: string) => void;
  predictions: MetaPrediction[];
}) {
  return (
    <ResearchPanel title="Meta Prediction Board" description="Pantau Pokemon, Trainer, Supporter, Item, dan Energy yang berpotensi naik meta.">
      <div className="mb-5 flex flex-wrap gap-2">
        {predictionFilters.map((filter) => (
          <button
            key={filter || 'all'}
            onClick={() => setCategory(filter)}
            className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
              category === filter
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {filter || 'All'}
          </button>
        ))}
      </div>

      {loading && predictions.length === 0 ? (
        <LoadingBlock />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {predictions.map((card) => (
            <PredictionCard key={card.card_id} card={card} />
          ))}
          {predictions.length === 0 && <EmptyBlock text="Belum ada kartu pada filter ini." />}
        </div>
      )}
    </ResearchPanel>
  );
}

function RecommendationTable({ collectionId, recommendations, compact = false }: { collectionId: string; recommendations: ResearchDeckRecommendation[]; compact?: boolean }) {
  if (recommendations.length === 0) {
    return <EmptyBlock text="Belum ada rekomendasi. Pastikan collection punya kartu dan data deck meta sudah ter-import." />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-3 pr-4 font-medium">Deck</th>
            <th className="py-3 pr-4 font-medium">Ready</th>
            <th className="py-3 pr-4 font-medium">Meta</th>
            <th className="py-3 pr-4 font-medium">Upgrade</th>
            <th className="py-3 pr-4 font-medium">Priority Gap</th>
            <th className="py-3 pr-4 font-medium">Report</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recommendations.map((deck) => (
            <tr key={deck.deck_id} className="align-top">
              <td className="py-4 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{deck.deck_name}</span>
                  <Badge tone="blue">Tier {deck.tier}</Badge>
                  {deck.archetype && <Badge>{deck.archetype}</Badge>}
                </div>
                {!compact && <p className="mt-2 max-w-xl text-xs leading-5 text-muted-foreground">{deck.recommendation_reason}</p>}
              </td>
              <td className="py-4 pr-4">
                <div className="w-32">
                  <div className="mb-1 flex justify-between font-mono text-xs">
                    <span>{deck.completeness_pct}%</span>
                    <span className="text-muted-foreground">{deck.owned_cards}/{deck.required_cards}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, deck.completeness_pct)}%` }} />
                  </div>
                </div>
              </td>
              <td className="py-4 pr-4 font-mono text-sm text-primary">{deck.meta_score}</td>
              <td className="py-4 pr-4 font-mono text-sm">{formatIDR(deck.estimated_upgrade_cost_idr)}</td>
              <td className="py-4 pr-4">
                <div className="flex max-w-sm flex-wrap gap-1.5">
                  {deck.missing_cards.slice(0, compact ? 3 : 7).map((card) => (
                    <Badge key={card.card_id} tone={card.buy_priority === 'high' ? 'amber' : 'slate'}>
                      {card.missing_count}x {card.card_name}
                    </Badge>
                  ))}
                  {deck.missing_cards.length === 0 && <span className="text-xs font-medium text-green-500">Ready</span>}
                </div>
              </td>
              <td className="py-4 pr-4">
                <a
                  href={`/lab/deck-analysis?collection_id=${encodeURIComponent(collectionId)}&deck_id=${encodeURIComponent(deck.deck_id)}`}
                  className="inline-flex h-9 items-center rounded-md border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15"
                >
                  Analisis
                  <ChevronRight className="ml-1 h-4 w-4" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AntiMetaRow({ item }: { item: AntiMetaRecommendation }) {
  return (
    <article className="grid gap-4 py-4 lg:grid-cols-[1fr_1fr_160px] lg:items-start">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Counter Deck</p>
        <h3 className="mt-1 font-semibold">{item.counter_deck_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{item.archetype || 'Flexible archetype'}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tech Package</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tech_cards.map((tech) => (
            <Badge key={tech} tone="blue">{tech}</Badge>
          ))}
        </div>
        <ul className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
          {item.matchup_notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
      <div className="border border-border bg-background p-3">
        <p className="text-xs text-muted-foreground">Counter Score</p>
        <p className="mt-1 font-mono text-2xl font-bold text-primary">{item.counter_score}</p>
      </div>
    </article>
  );
}

function PredictionCard({ card }: { card: MetaPrediction }) {
  return (
    <article className="border border-border bg-background p-4 transition-colors hover:border-primary/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{card.card_name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{card.category}{card.card_type ? ` / ${card.card_type}` : ''}</p>
        </div>
        <Badge tone={card.trend === 'rising' ? 'green' : 'blue'}>{card.trend}</Badge>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between font-mono text-xs">
          <span>Signal</span>
          <span>{card.prediction_score}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, card.prediction_score)}%` }} />
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.reason}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {card.factors.map((factor) => (
          <Badge key={factor}>{factor}</Badge>
        ))}
      </div>
    </article>
  );
}

function PredictionLine({ card }: { card: MetaPrediction }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{card.card_name}</p>
        <p className="text-xs text-muted-foreground">{card.appearances} appearances / {card.total_copies} copies</p>
      </div>
      <span className="font-mono text-sm font-semibold text-primary">{card.prediction_score}</span>
    </div>
  );
}

function ResearchPanel({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border bg-card p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actionHref && actionLabel && (
          <a href={actionHref} className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-background px-3 text-sm font-medium text-primary hover:bg-accent">
            {actionLabel}
            <ChevronRight className="ml-1 h-4 w-4" />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

function MetricTile({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string; detail: string; tone: 'blue' | 'green' | 'amber' | 'purple' }) {
  const toneClass = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    amber: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  }[tone];

  return (
    <div className="border border-border bg-card p-4">
      <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-md border ${toneClass}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatusPill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-3">
      <Icon className="h-4 w-4 text-primary" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[220px] truncate text-sm font-medium">{value}</span>
    </div>
  );
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' }) {
  const toneClass = {
    slate: 'border-border bg-secondary/50 text-muted-foreground',
    blue: 'border-primary/25 bg-primary/10 text-primary',
    green: 'border-green-500/25 bg-green-500/10 text-green-500',
    amber: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
  }[tone];

  return (
    <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>
      <span className="truncate">{children}</span>
    </span>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-[180px] items-center justify-center border border-dashed border-border bg-background text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Memuat data PokeLab
    </div>
  );
}
