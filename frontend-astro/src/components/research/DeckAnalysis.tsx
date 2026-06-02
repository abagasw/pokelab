import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Brain,
  ChevronLeft,
  ClipboardList,
  Loader2,
  Package,
  Shield,
  Target,
  TrendingUp,
  Trophy,
  UserRound,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthStore, useCollectionStore, useResearchStore } from '@stores/index';
import { formatIDR } from '@utils/formatters';
import type { ResearchCardUsage, ResearchDeckAnalysis } from '@/types/index';
import DeckGuidePanel from './DeckGuidePanel';

const roleFilters = ['all', 'attacker', 'engine', 'search', 'draw', 'gust', 'disruption', 'switch', 'stadium', 'energy', 'support'];

export default function DeckAnalysis() {
  const { isAuthenticated, user } = useAuthStore();
  const { collections, fetchCollections } = useCollectionStore();
  const {
    selectedAnalysis,
    advisor,
    loading,
    error,
    fetchDeckAnalysis,
    askAdvisor,
  } = useResearchStore();

  const [collectionId, setCollectionId] = useState('');
  const [deckId, setDeckId] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCollectionId(params.get('collection_id') || '');
    setDeckId(params.get('deck_id') || '');
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchCollections();
    }
  }, [isAuthenticated, fetchCollections]);

  useEffect(() => {
    if (!collectionId && collections.length > 0) {
      setCollectionId(collections[0].id);
    }
  }, [collectionId, collections]);

  useEffect(() => {
    if (isAuthenticated && collectionId && deckId) {
      fetchDeckAnalysis(collectionId, deckId);
    }
  }, [isAuthenticated, collectionId, deckId, fetchDeckAnalysis]);

  const filteredCards = useMemo(() => {
    if (!selectedAnalysis) return [];
    if (roleFilter === 'all') return selectedAnalysis.card_usage;
    return selectedAnalysis.card_usage.filter((card) => card.role === roleFilter);
  }, [roleFilter, selectedAnalysis]);

  const aiContext = useMemo(() => {
    if (!selectedAnalysis) return '';
    return JSON.stringify({
      deck_id: selectedAnalysis.deck_id,
      deck_name: selectedAnalysis.deck_name,
      completeness_pct: selectedAnalysis.completeness_pct,
      meta_score: selectedAnalysis.meta_score,
      upgrade_plan: selectedAnalysis.upgrade_plan.slice(0, 8),
      tactical_profile: selectedAnalysis.tactical_profile,
      card_usage: selectedAnalysis.card_usage.map((card) => ({
        name: card.card_name,
        count: card.required_count,
        owned: card.owned_count,
        role: card.role,
        importance: card.importance_score,
        note: card.usage_note,
      })),
      source: selectedAnalysis.deck_source,
    });
  }, [selectedAnalysis]);

  if (!isAuthenticated) {
    return (
      <AnalysisShell>
        <EmptyState
          icon={Package}
          title="Login untuk membuka deck scout report"
          text="Analisis detail memakai inventory dari collection akun, jadi PokeLab perlu sesi login aktif."
          actionHref="/login"
          actionLabel="Login"
        />
      </AnalysisShell>
    );
  }

  if (!deckId) {
    return (
      <AnalysisShell>
        <EmptyState
          icon={ClipboardList}
          title="Deck belum dipilih"
          text="Buka ranking rekomendasi lalu pilih tombol Analisis pada deck yang ingin dibedah."
          actionHref="/lab/recommendations"
          actionLabel="Ke rekomendasi"
        />
      </AnalysisShell>
    );
  }

  return (
    <AnalysisShell
      collectionId={collectionId}
      collections={collections}
      onCollectionChange={setCollectionId}
      username={user?.username}
    >
      {error && (
        <div className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !selectedAnalysis ? (
        <div className="flex min-h-[360px] items-center justify-center border border-dashed border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Memuat scout report deck
        </div>
      ) : selectedAnalysis ? (
        <div className="space-y-6">
          <ScoutHeader analysis={selectedAnalysis} />

          {selectedAnalysis.data_quality_warnings.length > 0 && (
            <div className="space-y-2">
              {selectedAnalysis.data_quality_warnings.map((warning) => (
                <div key={warning} className="flex gap-2 border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          <DeckStatisticsPanel analysis={selectedAnalysis} />

          <DeckGuidePanel
            deckName={selectedAnalysis.deck_name}
            archetype={selectedAnalysis.archetype}
            source={selectedAnalysis.deck_source}
            cards={selectedAnalysis.card_usage}
            totalCopies={selectedAnalysis.deck_statistics.total_copies}
            pokemonCopies={selectedAnalysis.deck_statistics.pokemon_copies}
            trainerCopies={selectedAnalysis.deck_statistics.trainer_copies}
            energyCopies={selectedAnalysis.deck_statistics.energy_copies}
            completenessPct={selectedAnalysis.completeness_pct}
            upgradeCostIdr={selectedAnalysis.estimated_upgrade_cost_idr}
            keyCards={selectedAnalysis.tactical_profile.key_cards}
            matchupNotes={selectedAnalysis.tactical_profile.matchup_notes}
            aiAnswer={advisor?.answer}
            aiLoading={loading}
            onAskAI={() => askAdvisor(
              'Buat guide lengkap bergaya artikel kompetitif seperti Metafy untuk deck ini. Pakai struktur: Deck Overview, Potential Inclusions, Core Gameplan, matchup theory, individual matchups, card-by-card notes, dan conclusion. Gunakan Bahasa Indonesia, detail praktis, dan jangan mengubah angka scoring.',
              aiContext,
            )}
          />

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Inventory Readiness" description="Komposisi deck dibandingkan dengan collection aktif.">
              <div className="grid gap-3 md:grid-cols-3">
                {selectedAnalysis.category_breakdown.map((item) => (
                  <CategoryTile key={item.category} item={item} />
                ))}
              </div>
            </Panel>

            <Panel title="Tournament Signal" description="Sinyal kompetitif dari data deck meta yang tersedia.">
              <div className="grid grid-cols-3 gap-3">
                <StatBox label="Events" value={selectedAnalysis.tournament_stats.tournament_count} />
                <StatBox label="Wins" value={selectedAnalysis.tournament_stats.win_count} />
                <StatBox label="Top 8" value={selectedAnalysis.tournament_stats.top8_count} />
              </div>
              <DeckSourcePanel analysis={selectedAnalysis} />
            </Panel>
          </div>

          <Panel title="Card Usage Matrix" description="Semua kartu di representative decklist, jumlah copy, role, coverage inventory, dan priority.">
            <div className="mb-4 flex flex-wrap gap-2">
              {roleFilters.map((role) => (
                <button
                  key={role}
                  onClick={() => setRoleFilter(role)}
                  className={`h-9 rounded-md border px-3 text-xs font-semibold capitalize transition-colors ${
                    roleFilter === role
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            <CardUsageTable cards={filteredCards} />
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
            <Panel title="Upgrade War Room" description="Buylist prioritas berdasarkan role, missing count, dan biaya.">
              <UpgradePlan analysis={selectedAnalysis} />
            </Panel>

            <Panel title="AI Coach" description="OpenRouter menjelaskan hasil deterministik, bukan mengganti scoring.">
              <button
                onClick={() => askAdvisor('Jelaskan scout report deck ini seperti coach turnamen: prioritas beli, cara latihan, dan matchup yang perlu diwaspadai.', aiContext)}
                disabled={loading}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                Minta Coach Report
              </button>
              {advisor?.answer ? (
                <div className="mt-4 border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
                  {advisor.answer}
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Tanpa AI pun report ini tetap lengkap: angka readiness, role kartu, dan prioritas upgrade sudah dihitung backend.
                </p>
              )}
            </Panel>
          </div>

          <Panel title="Tactical Profile" description="Ringkasan game plan dan titik latihan dari komposisi deck.">
            <TacticalProfile analysis={selectedAnalysis} />
          </Panel>
        </div>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="Scout report belum tersedia"
          text="Pilih collection yang benar atau kembali ke ranking rekomendasi."
          actionHref="/lab/recommendations"
          actionLabel="Ke rekomendasi"
        />
      )}
    </AnalysisShell>
  );
}

function AnalysisShell({
  children,
  collections = [],
  collectionId = '',
  onCollectionChange,
  username,
}: {
  children: React.ReactNode;
  collections?: { id: string; name: string }[];
  collectionId?: string;
  onCollectionChange?: (value: string) => void;
  username?: string;
}) {
  const showControls = Boolean(onCollectionChange);

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-6">
        <a href="/lab/recommendations" className="mb-4 inline-flex items-center text-sm font-medium text-primary hover:underline">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Kembali ke ranking
        </a>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 inline-flex h-8 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wide text-primary">
              <BarChart3 className="mr-2 h-4 w-4" />
              Deck Scout Report
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">PokeLab Deck Analysis</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Analisis detail ala manager: semua copy kartu, role, inventory gap, biaya upgrade, dan tactical profile untuk deck rekomendasi.
            </p>
          </div>
          {showControls && (
            <div className="grid gap-2 sm:grid-cols-2 lg:w-[460px]">
              <Status label="Trainer" value={username || 'Research user'} icon={Target} />
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Collection</label>
                <select
                  value={collectionId}
                  onChange={(event) => onCollectionChange?.(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {collections.length === 0 && <option value="">Belum ada collection</option>}
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

function ScoutHeader({ analysis }: { analysis: ResearchDeckAnalysis }) {
  const source = analysis.deck_source;
  const sourceLabel = [
    source?.player_name || 'Unknown player',
    source?.placement ? `Rank #${source.placement}` : '',
    source?.tournament_name || '',
  ].filter(Boolean).join(' / ');

  return (
    <section className="border border-border bg-card p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">Tier {analysis.tier}</Badge>
            <Badge>{analysis.archetype || 'Flexible archetype'}</Badge>
            <Badge tone="green">{analysis.tactical_profile.playstyle}</Badge>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">{analysis.deck_name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {analysis.owned_cards}/{analysis.required_cards} kartu sudah siap dari inventory. Upgrade cost saat ini {formatIDR(analysis.estimated_upgrade_cost_idr)}.
          </p>
          <div className="mt-3 inline-flex max-w-full items-center rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            <UserRound className="mr-2 h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{sourceLabel || 'Sumber decklist belum tersedia'}</span>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 xl:w-[520px]">
          <Metric icon={Shield} label="Ready" value={`${analysis.completeness_pct}%`} detail="inventory coverage" />
          <Metric icon={TrendingUp} label="Meta" value={`${analysis.meta_score}`} detail="deterministic score" />
          <Metric icon={Wallet} label="Upgrade" value={formatIDR(analysis.estimated_upgrade_cost_idr)} detail="missing cost" />
        </div>
      </div>
    </section>
  );
}

function CardUsageTable({ cards }: { cards: ResearchCardUsage[] }) {
  if (cards.length === 0) {
    return <div className="border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">Tidak ada kartu pada filter ini.</div>;
  }

  return (
    <>
      <div className="space-y-3 md:hidden">
        {cards.map((card) => (
          <MobileCardUsage key={card.card_id} card={card} />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-3 pr-4 font-medium">Card</th>
            <th className="py-3 pr-4 font-medium">Role</th>
            <th className="py-3 pr-4 font-medium">Copies</th>
            <th className="py-3 pr-4 font-medium">Stats</th>
            <th className="py-3 pr-4 font-medium">Coverage</th>
            <th className="py-3 pr-4 font-medium">Importance</th>
            <th className="py-3 pr-4 font-medium">Cost</th>
            <th className="py-3 pr-4 font-medium">Usage Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {cards.map((card) => (
            <tr key={card.card_id} className="align-top">
              <td className="py-4 pr-4">
                <p className="font-semibold text-foreground">{card.card_name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{card.category}{card.card_type ? ` / ${card.card_type}` : ''}</p>
              </td>
              <td className="py-4 pr-4"><Badge tone={roleTone(card.role)}>{card.role}</Badge></td>
              <td className="py-4 pr-4 font-mono">
                {card.owned_count}/{card.required_count}
                {card.missing_count > 0 && <span className="ml-2 text-yellow-400">-{card.missing_count}</span>}
              </td>
              <td className="py-4 pr-4">
                <div className="grid min-w-[150px] grid-cols-2 gap-2 text-xs">
                  <MiniStat label="Rank" value={`#${card.statistics.overall_rank}`} />
                  <MiniStat label="Share" value={`${card.statistics.deck_share_pct}%`} />
                  <MiniStat label="Meta" value={`${card.statistics.meta_deck_appearances}x`} />
                  <MiniStat label="Avg" value={`${card.statistics.avg_copies_when_seen}`} />
                </div>
              </td>
              <td className="py-4 pr-4">
                <Progress value={card.coverage_pct} />
                <div className="mt-2">
                  <Badge tone={ownershipTone(card.statistics.ownership_status)}>{card.statistics.ownership_status}</Badge>
                </div>
              </td>
              <td className="py-4 pr-4 font-mono text-primary">{card.importance_score}</td>
              <td className="py-4 pr-4 font-mono">{formatIDR(card.total_missing_cost_idr)}</td>
              <td className="py-4 pr-4">
                <p className="max-w-md text-xs leading-5 text-muted-foreground">{card.usage_note}</p>
                {card.substitutes && card.substitutes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {card.substitutes.map((substitute) => <Badge key={substitute}>{substitute}</Badge>)}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

function MobileCardUsage({ card }: { card: ResearchCardUsage }) {
  return (
    <article className="border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{card.card_name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{card.category}{card.card_type ? ` / ${card.card_type}` : ''}</p>
        </div>
        <Badge tone={roleTone(card.role)}>{card.role}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label="Copies" value={`${card.owned_count}/${card.required_count}${card.missing_count > 0 ? ` (-${card.missing_count})` : ''}`} />
        <MiniStat label="Need Cost" value={formatIDR(card.total_missing_cost_idr)} />
        <MiniStat label="Importance" value={`${card.importance_score}`} />
        <MiniStat label="Meta Seen" value={`${card.statistics.meta_deck_appearances}x`} />
      </div>

      <div className="mt-4">
        <Progress value={card.coverage_pct} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={ownershipTone(card.statistics.ownership_status)}>{card.statistics.ownership_status}</Badge>
          <Badge tone={card.buy_priority === 'high' ? 'amber' : card.buy_priority === 'medium' ? 'blue' : 'slate'}>
            {card.buy_priority} priority
          </Badge>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">{card.usage_note}</p>
      {card.substitutes && card.substitutes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {card.substitutes.map((substitute) => <Badge key={substitute}>{substitute}</Badge>)}
        </div>
      )}
    </article>
  );
}

function DeckSourcePanel({ analysis }: { analysis: ResearchDeckAnalysis }) {
  const source = analysis.deck_source;
  if (!source || (!source.decklist_id && !source.player_name && !source.tournament_name)) {
    return (
      <div className="mt-4 border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
        Sumber player dan turnamen belum tersedia untuk decklist ini.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
      <SourceItem label="Player" value={source.player_name || 'Unknown player'} />
      <SourceItem label="Rank" value={source.placement ? `#${source.placement}` : '-'} />
      <SourceItem label="Tournament" value={source.tournament_name || 'Unknown tournament'} />
      <SourceItem label="Date" value={source.tournament_date || '-'} />
      <div className="sm:col-span-2">
        <SourceItem label="Decklist" value={source.decklist_name || source.decklist_id || '-'} />
      </div>
    </div>
  );
}

function SourceItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function DeckStatisticsPanel({ analysis }: { analysis: ResearchDeckAnalysis }) {
  const stats = analysis.deck_statistics;
  if (!stats) return null;

  const composition = [
    { label: 'Pokemon', value: stats.pokemon_copies, tone: 'green' as const },
    { label: 'Trainer', value: stats.trainer_copies, tone: 'blue' as const },
    { label: 'Energy', value: stats.energy_copies, tone: 'amber' as const },
  ];

  return (
    <Panel title="Deck Statistics" description="Ringkasan angka deck: komposisi, value, consistency, dan risiko missing card.">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unique Cards" value={`${stats.unique_cards}`} detail={`${stats.total_copies} total copies`} />
        <StatCard label="Avg Copies" value={`${stats.average_copies_per_card}`} detail={`max ${stats.max_copies} copy per card`} />
        <StatCard label="Consistency" value={`${stats.consistency_score}%`} detail="engine/search/draw share" />
        <StatCard label="Price Coverage" value={`${stats.price_coverage_pct}%`} detail="cards with IDR signal" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Composition</p>
          <div className="mt-3 space-y-3">
            {composition.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{item.label}</span>
                  <span className="font-mono text-muted-foreground">{item.value} copy</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${item.tone === 'green' ? 'bg-green-500' : item.tone === 'amber' ? 'bg-yellow-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, (item.value / Math.max(1, stats.total_copies)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard label="Deck Value" value={formatIDR(stats.deck_value_idr)} detail="estimated full list" />
          <StatCard label="Owned Value" value={formatIDR(stats.owned_value_idr)} detail="covered by inventory" />
          <StatCard label="Missing Copies" value={`${stats.missing_copies}`} detail={`${stats.missing_unique_cards} unique cards`} />
          <StatCard label="High Priority" value={`${stats.high_priority_missing_cards}`} detail="urgent missing cards" />
        </div>
      </div>
    </Panel>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-background/70 px-2 py-1">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-xs text-foreground">{value}</p>
    </div>
  );
}

function UpgradePlan({ analysis }: { analysis: ResearchDeckAnalysis }) {
  if (analysis.upgrade_plan.length === 0) {
    return <div className="border border-green-500/25 bg-green-500/10 p-4 text-sm text-green-300">Deck ini sudah ready dari inventory aktif.</div>;
  }

  return (
    <div className="divide-y divide-border border-y border-border">
      {analysis.upgrade_plan.map((step) => (
        <div key={step.card_id} className="grid gap-3 py-4 md:grid-cols-[1fr_120px] md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{step.missing_count}x {step.card_name}</h3>
              <Badge tone={step.priority === 'high' ? 'amber' : step.priority === 'medium' ? 'blue' : 'slate'}>{step.priority}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.reason}</p>
          </div>
          <p className="font-mono text-sm text-primary">{formatIDR(step.estimated_cost_idr)}</p>
        </div>
      ))}
    </div>
  );
}

function TacticalProfile({ analysis }: { analysis: ResearchDeckAnalysis }) {
  const groups = [
    { title: 'Game Plan', items: analysis.tactical_profile.game_plan },
    { title: 'Strengths', items: analysis.tactical_profile.strengths },
    { title: 'Weaknesses', items: analysis.tactical_profile.weaknesses },
    { title: 'Matchup Notes', items: analysis.tactical_profile.matchup_notes },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="border border-border bg-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key Cards</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysis.tactical_profile.key_cards.map((card) => <Badge key={card} tone="blue">{card}</Badge>)}
          {analysis.tactical_profile.key_cards.length === 0 && <span className="text-sm text-muted-foreground">Belum ada key card terdeteksi.</span>}
        </div>
      </div>
      {groups.map((group) => (
        <div key={group.title} className="border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {group.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CategoryTile({ item }: { item: { category: string; required_count: number; owned_count: number; missing_count: number; completeness_pct: number } }) {
  return (
    <div className="border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{item.category}</p>
        <Badge tone={item.missing_count === 0 ? 'green' : 'amber'}>{item.missing_count} missing</Badge>
      </div>
      <div className="mt-4">
        <Progress value={item.completeness_pct} />
        <p className="mt-2 font-mono text-xs text-muted-foreground">{item.owned_count}/{item.required_count} cards</p>
      </div>
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-card p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="border border-border bg-background p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background p-4">
      <Trophy className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

function Status({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="w-full max-w-36">
      <div className="mb-1 flex justify-between font-mono text-xs">
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  );
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'purple' }) {
  const toneClass = {
    slate: 'border-border bg-secondary/50 text-muted-foreground',
    blue: 'border-primary/25 bg-primary/10 text-primary',
    green: 'border-green-500/25 bg-green-500/10 text-green-500',
    amber: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
    purple: 'border-purple-500/25 bg-purple-500/10 text-purple-400',
  }[tone];

  return <span className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${toneClass}`}>{children}</span>;
}

function roleTone(role: string): 'slate' | 'blue' | 'green' | 'amber' | 'purple' {
  if (role === 'attacker' || role === 'gust') return 'amber';
  if (role === 'engine' || role === 'search' || role === 'draw') return 'blue';
  if (role === 'energy') return 'green';
  if (role === 'disruption') return 'purple';
  return 'slate';
}

function ownershipTone(status: string): 'slate' | 'blue' | 'green' | 'amber' | 'purple' {
  if (status === 'complete' || status === 'extra') return 'green';
  if (status === 'partial') return 'amber';
  if (status === 'missing') return 'purple';
  return 'slate';
}

function EmptyState({ icon: Icon, title, text, actionHref, actionLabel }: { icon: LucideIcon; title: string; text: string; actionHref: string; actionLabel: string }) {
  return (
    <section className="border-y border-border bg-card/40">
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
        <a href={actionHref} className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          {actionLabel}
        </a>
      </div>
    </section>
  );
}
