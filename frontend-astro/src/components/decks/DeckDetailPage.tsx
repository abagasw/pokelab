import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Brain,
  Calendar,
  ClipboardList,
  FlaskConical,
  Layers3,
  Package,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '@api/client';
import { formatIDR } from '@utils/formatters';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';
import type { Deck } from '@/types/index';
import DeckGuidePanel from '@components/research/DeckGuidePanel';

interface DeckCard {
  id?: number;
  deck_id: string;
  card_id: string;
  card_name: string;
  category?: string;
  card_type?: string;
  image_url?: string;
  count: number;
  is_pokemon?: boolean;
  price_idr?: number;
}

interface Decklist {
  id: string;
  deck_id: string;
  tournament_id?: string;
  tournament_name?: string;
  tournament_date?: string;
  name?: string;
  player_name?: string;
  placement?: number;
  win_count?: number;
  loss_count?: number;
  tie_count?: number;
  points?: number;
  cards?: DeckCard[];
}

interface DeckCardAnalysis extends DeckCard {
  role: string;
  importance: number;
  estimated_value_idr: number;
  deck_share_pct: number;
  usage_note: string;
}

interface DeckAnalysisSummary {
  decklists: Decklist[];
  representative?: Decklist;
  cards: DeckCardAnalysis[];
  totalCopies: number;
  uniqueCards: number;
  pokemonCopies: number;
  trainerCopies: number;
  energyCopies: number;
  estimatedValueIDR: number;
  consistencyScore: number;
  keyCards: DeckCardAnalysis[];
  warnings: string[];
}

export default function DeckDetailPage() {
  const [deckId, setDeckId] = useState('');
  const [deck, setDeck] = useState<Deck | null>(null);
  const [analysis, setAnalysis] = useState<DeckAnalysisSummary | null>(null);
  const [aiGuide, setAiGuide] = useState('');
  const [fullAnalysis, setFullAnalysis] = useState<any>(null);
  const [generatedDeckData, setGeneratedDeckData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [aiGuideLoading, setAiGuideLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const generatedId = params.get('generated');
    if (generatedId) {
      try {
        const data = localStorage.getItem('pokelab_generated_deck_' + generatedId);
        if (data) {
          const genDeck = JSON.parse(data);
          setGeneratedDeckData(genDeck);
          setDeckId(generatedId);
          setLoading(false);
          return;
        }
      } catch {}
    }
    const id = params.get('id') || window.location.pathname.split('/').filter(Boolean).pop() || '';
    setDeckId(id === 'detail' ? '' : id);
  }, []);

  useEffect(() => {
    if (!deckId) {
      setLoading(false);
      setError('Deck belum dipilih.');
      return;
    }

    // Skip API calls for generated decks (loaded from localStorage)
    if (deckId.startsWith('gen-')) {
      setLoading(false);
      return;
    }

    const loadDeck = async () => {
      setLoading(true);
      setError(null);
      try {
        const [deckResponse, decklistsResponse] = await Promise.all([
          api.getDeckById(deckId),
          api.getDeckDecklists(deckId),
        ]);
        if (deckResponse.success && deckResponse.data) {
          setDeck(deckResponse.data);
          if (decklistsResponse.success && decklistsResponse.data) {
            setAnalysis(buildDeckAnalysis(decklistsResponse.data as Decklist[]));
          } else {
            setAnalysis(buildDeckAnalysis([]));
          }
        } else {
          setError(deckResponse.error || 'Deck tidak ditemukan.');
        }
      } catch (err: any) {
        setError(err?.message || 'Deck tidak ditemukan.');
      }
      setLoading(false);
    };

    loadDeck();

    // Also load full analysis
    const loadAnalysis = async () => {
      setAnalysisLoading(true);
      try {
        const resp = await api.getDeckFullAnalysis(deckId); // now calls /decks/{id}/full-analysis
        if (resp.success && resp.data) setFullAnalysis(resp.data);
      } catch { /* ignore */ }
      setAnalysisLoading(false);
    };
    loadAnalysis();
  }, [deckId]);

  // Handle generated deck (from localStorage)
  if (generatedDeckData) {
    return <GeneratedDeckDetailPage deck={generatedDeckData} />;
  }

  if (loading) {
    return (
      <Shell>
        <div className="flex min-h-[260px] items-center justify-center border border-dashed border-border bg-card text-sm text-muted-foreground">
          Memuat detail deck...
        </div>
      </Shell>
    );
  }

  if (error || !deck) {
    return (
      <Shell>
        <div className="border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-semibold">Deck tidak bisa dibuka</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'Data deck tidak tersedia.'}</p>
          <a href="/decks" className="mt-5 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Kembali ke list deck
          </a>
        </div>
      </Shell>
    );
  }

  const winRate = deck.win_count && deck.tournament_count
    ? Math.round((deck.win_count / deck.tournament_count) * 100)
    : null;

  const requestAiGuide = async () => {
    if (!deck || !analysis) return;
    setAiGuideLoading(true);
    const context = JSON.stringify({
      deck: {
        id: deck.id,
        name: deck.name,
        archetype: deck.archetype,
        format: deck.format,
        tournament_count: deck.tournament_count,
        top8_count: deck.top8_count,
      },
      representative: analysis.representative,
      composition: {
        total: analysis.totalCopies,
        pokemon: analysis.pokemonCopies,
        trainer: analysis.trainerCopies,
        energy: analysis.energyCopies,
      },
      cards: analysis.cards.map((card) => ({
        name: card.card_name,
        count: card.count,
        role: card.role,
        importance: card.importance,
        note: card.usage_note,
      })),
    });
    const response = await api.askAI(
      'Buat guide lengkap bergaya artikel kompetitif seperti Metafy untuk deck ini. Strukturkan dengan Deck Overview, Potential Inclusions, Core Gameplan, individual matchups, card-by-card notes, dan Conclusion. Bahasa Indonesia, sangat praktis untuk testing turnamen.',
      context,
    );
    if (response.success && response.data?.answer) {
      setAiGuide(response.data.answer);
    } else {
      setAiGuide(response.error || 'AI guide belum tersedia. Guide deterministik tetap bisa dipakai.');
    }
    setAiGuideLoading(false);
  };

  return (
    <Shell deckName={deck.name}>
      <section className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {deck.format && <Badge>{deck.format}</Badge>}
              {deck.archetype && <Badge>{deck.archetype}</Badge>}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{deck.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {deck.description || 'Deck kompetitif dari database PokeLab. Gunakan detail ini sebagai pintu masuk ke analisis inventory dan anti-meta.'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat icon={Trophy} label="Tournament" value={`${deck.tournament_count || 0}`} />
        <Stat icon={TrendingUp} label="Win Rate" value={winRate !== null ? `${winRate}%` : '-'} />
        <Stat icon={Trophy} label="Top 8" value={`${deck.top8_count || 0}`} />
      </div>

      <section className="border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Informasi Deck</h2>
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <Info label="Deck ID" value={deck.id} />
          <Info label="External ID" value={deck.external_id || '-'} />
          <Info label="Format" value={deck.format || '-'} />
          <Info label="Archetype" value={deck.archetype || '-'} />
          {deck.created_at && <Info label="Dibuat" value={new Date(deck.created_at).toLocaleDateString('id-ID')} icon={Calendar} />}
          {deck.updated_at && <Info label="Diupdate" value={new Date(deck.updated_at).toLocaleDateString('id-ID')} icon={Calendar} />}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={`/lab/recommendations?deck_id=${encodeURIComponent(deck.id)}`}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            Analisis dari inventory
          </a>
          <a
            href={`/lab/anti-meta?target=${encodeURIComponent(deck.id)}`}
            className="inline-flex h-10 items-center rounded-md border border-border bg-background px-4 text-sm font-semibold hover:bg-accent"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Cari counter deck
          </a>
        </div>
      </section>

      <DeckAnalysisPanel
        deck={deck}
        analysis={analysis}
        aiGuide={aiGuide}
        aiGuideLoading={aiGuideLoading}
        onAskAI={requestAiGuide}
      />

      {/* ── Advanced Analysis Section (Turn Simulation, Meta Matchups, etc.) ── */}
      {fullAnalysis && <FullAnalysisPanel analysis={fullAnalysis} />}
      {analysisLoading && !fullAnalysis && (
        <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-12 text-sm text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Running advanced deck analysis...
        </div>
      )}

      <DeckGuidePanel
        deckName={deck.name}
        archetype={deck.archetype}
        source={{
          player_name: analysis?.representative?.player_name,
          tournament_name: analysis?.representative?.tournament_name,
          tournament_date: analysis?.representative?.tournament_date,
          placement: analysis?.representative?.placement,
          decklist_name: analysis?.representative?.name,
        }}
        cards={(analysis?.cards || []).map((card) => ({
          card_id: card.card_id,
          card_name: card.card_name,
          category: normalizeCategory(card),
          card_type: card.card_type,
          count: card.count,
          role: card.role,
          importance: card.importance,
          usage_note: card.usage_note,
          estimated_price_idr: card.price_idr,
          statistics: { deck_share_pct: card.deck_share_pct },
        }))}
        totalCopies={analysis?.totalCopies || 0}
        pokemonCopies={analysis?.pokemonCopies || 0}
        trainerCopies={analysis?.trainerCopies || 0}
        energyCopies={analysis?.energyCopies || 0}
        keyCards={(analysis?.keyCards || []).map((card) => card.card_name)}
        aiAnswer={aiGuide}
        aiLoading={aiGuideLoading}
        onAskAI={requestAiGuide}
      />
    </Shell>
  );
}

function buildDeckAnalysis(decklists: Decklist[]): DeckAnalysisSummary {
  const representative =
    decklists.find((decklist) => (decklist.cards?.length || 0) > 0 && (decklist.tournament_name || (decklist.placement || 0) > 0)) ||
    decklists.find((decklist) => (decklist.cards?.length || 0) > 0) ||
    decklists[0];
  const cardMap = new Map<string, DeckCard>();

  for (const card of representative?.cards || []) {
    if (!card.card_id || card.count <= 0) continue;
    const existing = cardMap.get(card.card_id);
    if (existing) {
      existing.count += card.count;
      existing.price_idr = existing.price_idr || card.price_idr;
      existing.category = existing.category || card.category;
      existing.card_type = existing.card_type || card.card_type;
    } else {
      cardMap.set(card.card_id, { ...card });
    }
  }

  const baseCards = Array.from(cardMap.values());
  const totalCopies = baseCards.reduce((sum, card) => sum + card.count, 0);
  const cards = baseCards
    .map((card) => {
      const role = inferRole(card);
      const price = card.price_idr || 0;
      return {
        ...card,
        role,
        importance: inferImportance(card, role),
        estimated_value_idr: price * card.count,
        deck_share_pct: totalCopies > 0 ? round((card.count / totalCopies) * 100) : 0,
        usage_note: usageNote(card, role),
      };
    })
    .sort((a, b) => b.importance - a.importance || b.count - a.count || a.card_name.localeCompare(b.card_name));

  const pokemonCopies = cards.filter((card) => normalizeCategory(card) === 'Pokemon').reduce((sum, card) => sum + card.count, 0);
  const energyCopies = cards.filter((card) => normalizeCategory(card) === 'Energy').reduce((sum, card) => sum + card.count, 0);
  const trainerCopies = Math.max(0, totalCopies - pokemonCopies - energyCopies);
  const consistencyCopies = cards
    .filter((card) => ['engine', 'search', 'draw', 'switch'].includes(card.role))
    .reduce((sum, card) => sum + card.count, 0);
  const estimatedValueIDR = cards.reduce((sum, card) => sum + card.estimated_value_idr, 0);
  const warnings: string[] = [];

  if (!representative) {
    warnings.push('Belum ada representative decklist untuk deck ini.');
  } else if (totalCopies === 0) {
    warnings.push('Representative decklist ditemukan, tetapi belum punya data kartu terstruktur.');
  } else if (totalCopies < 60) {
    warnings.push(`Representative decklist baru memuat ${totalCopies}/60 kartu; statistik tetap ditampilkan dengan data parsial.`);
  }

  if (cards.some((card) => !card.price_idr)) {
    warnings.push('Sebagian kartu belum punya harga IDR, jadi estimasi value bisa lebih rendah dari kondisi pasar.');
  }

  return {
    decklists,
    representative,
    cards,
    totalCopies,
    uniqueCards: cards.length,
    pokemonCopies,
    trainerCopies,
    energyCopies,
    estimatedValueIDR: round(estimatedValueIDR),
    consistencyScore: totalCopies > 0 ? round((consistencyCopies / totalCopies) * 100) : 0,
    keyCards: cards.slice(0, 8),
    warnings,
  };
}

function DeckAnalysisPanel({
  deck,
  analysis,
  aiGuide,
  aiGuideLoading,
  onAskAI,
}: {
  deck: Deck;
  analysis: DeckAnalysisSummary | null;
  aiGuide: string;
  aiGuideLoading: boolean;
  onAskAI: () => void;
}) {
  if (!analysis) return null;

  return (
    <div className="space-y-6">
      <section className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex h-8 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wide text-primary">
              <BarChart3 className="mr-2 h-4 w-4" />
              Deck Scout Report
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Analisa Detail {deck.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Representative list, komposisi, role kartu, jumlah copy, estimasi value, dan sinyal taktis. Untuk gap inventory personal, buka PokeLab recommendations.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[620px]">
            <Metric icon={ClipboardList} label="Representative" value={analysis.representative?.name || '-'} detail={decklistSourceLine(analysis.representative)} />
            <Metric icon={Trophy} label="Tournament" value={analysis.representative?.tournament_name || 'Seed / System'} detail={rankLabel(analysis.representative)} />
            <Metric icon={Target} label="Player" value={analysis.representative?.player_name || 'System'} detail={analysis.representative?.tournament_date || 'No event date'} />
            <Metric icon={Wallet} label="Deck Value" value={formatIDR(analysis.estimatedValueIDR)} detail="estimasi kartu yang punya harga" />
          </div>
        </div>
      </section>

      {analysis.warnings.length > 0 && (
        <div className="grid gap-2">
          {analysis.warnings.map((warning) => (
            <div key={warning} className="border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Package} label="Total Copies" value={`${analysis.totalCopies}/60`} />
        <Stat icon={Layers3} label="Unique Cards" value={`${analysis.uniqueCards}`} />
        <Stat icon={Target} label="Consistency" value={`${analysis.consistencyScore}%`} />
        <Stat icon={Trophy} label="Decklists" value={`${analysis.decklists.length}`} />
      </div>

      <Panel title="Tournament Provenance" description="Sumber list yang dipakai untuk analisa: player, turnamen, dan ranking.">
        <DecklistSourcesTable decklists={analysis.decklists} representativeId={analysis.representative?.id} />
      </Panel>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Komposisi Deck" description="Distribusi copy kartu dalam representative decklist.">
          <CompositionBar label="Pokemon" value={analysis.pokemonCopies} total={analysis.totalCopies} tone="green" />
          <CompositionBar label="Trainer" value={analysis.trainerCopies} total={analysis.totalCopies} tone="blue" />
          <CompositionBar label="Energy" value={analysis.energyCopies} total={analysis.totalCopies} tone="amber" />
        </Panel>

        <Panel title="Tactical Snapshot" description="Ringkasan play pattern awal dari role kartu yang paling penting.">
          <div className="grid gap-3 sm:grid-cols-2">
            <TacticalItem title="Game plan" text={gamePlan(deck, analysis)} />
            <TacticalItem title="Key cards" text={analysis.keyCards.map((card) => card.card_name).slice(0, 5).join(', ') || '-'} />
            <TacticalItem title="Strength" text={`Engine dan konsistensi berada di ${analysis.consistencyScore}% dari total copy.`} />
            <TacticalItem title="Watchout" text={analysis.totalCopies < 60 ? 'Data list parsial, cek ulang sebelum dipakai untuk turnamen.' : 'Latih sequencing kartu engine sebelum testing matchup.'} />
          </div>
        </Panel>
      </section>

      {/* ── Advanced Analysis (from /deck-full-analysis API) ── */}

      <Panel title="Visual Decklist" description="Galeri kartu dari representative list. Klik kartu untuk membuka detail kartu dan konteks kebutuhan di deck.">
        <CardImageGallery cards={analysis.cards} deckId={analysis.representative?.deck_id || deck.id} decklistId={analysis.representative?.id} />
      </Panel>

      <Panel title="Card Usage Matrix" description="Detail tiap kartu: berapa copy dipakai, role, kontribusi deck, harga, dan catatan penggunaan.">
        <CardUsageTable cards={analysis.cards} deckId={analysis.representative?.deck_id || deck.id} decklistId={analysis.representative?.id} />
      </Panel>
    </div>
  );
}

function CardImageGallery({ cards, deckId, decklistId }: { cards: DeckCardAnalysis[]; deckId: string; decklistId?: string }) {
  const visibleCards = cards.filter((card) => card.image_url);

  if (visibleCards.length === 0) {
    return (
      <div className="border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
        Belum ada image kartu untuk representative decklist ini.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
      {visibleCards.map((card) => (
        <a
          key={card.card_id}
          href={`/cards/detail?id=${encodeURIComponent(card.card_id)}&deck_id=${encodeURIComponent(deckId)}${decklistId ? `&decklist_id=${encodeURIComponent(decklistId)}` : ''}`}
          className="group min-w-0"
        >
          <div className="relative aspect-[63/88] overflow-hidden rounded-md border border-border bg-muted transition-colors group-hover:border-primary/70">
            <img
              src={cardImageSrc(card.image_url)}
              alt={card.card_name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
              onError={(event) => setPlaceholderImage(event.currentTarget)}
            />
            <span className="absolute left-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 font-mono text-xs font-bold text-primary shadow-sm">
              {card.count}x
            </span>
          </div>
          <div className="mt-2 min-w-0">
            <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary">{card.card_name}</p>
            <div className="mt-1 flex min-w-0 items-center justify-between gap-1">
              <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{card.role}</span>
              <span className="font-mono text-[10px] text-primary">{card.importance}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

function DecklistSourcesTable({ decklists, representativeId }: { decklists: Decklist[]; representativeId?: string }) {
  if (decklists.length === 0) {
    return (
      <div className="border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
        Belum ada sumber turnamen untuk deck ini.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-3 pr-4 font-medium">Source List</th>
            <th className="py-3 pr-4 font-medium">Player</th>
            <th className="py-3 pr-4 font-medium">Tournament</th>
            <th className="py-3 pr-4 font-medium">Rank</th>
            <th className="py-3 pr-4 font-medium">Record</th>
            <th className="py-3 pr-4 font-medium">Cards</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {decklists.map((decklist) => (
            <tr key={decklist.id} className="align-top">
              <td className="py-4 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{decklist.name || decklist.id}</span>
                  {decklist.id === representativeId && <Badge tone="green">Representative</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{decklist.deck_id}</p>
              </td>
              <td className="py-4 pr-4 font-medium">{decklist.player_name || 'System'}</td>
              <td className="py-4 pr-4">
                <p className="font-medium">{decklist.tournament_name || 'Seed / System'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{decklist.tournament_date || decklist.tournament_id || '-'}</p>
              </td>
              <td className="py-4 pr-4 font-mono">{rankLabel(decklist)}</td>
              <td className="py-4 pr-4 font-mono text-muted-foreground">{recordLabel(decklist)}</td>
              <td className="py-4 pr-4 font-mono">{decklist.cards?.reduce((sum, card) => sum + card.count, 0) || 0}/60</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardUsageTable({ cards, deckId, decklistId }: { cards: DeckCardAnalysis[]; deckId: string; decklistId?: string }) {
  if (cards.length === 0) {
    return (
      <div className="border border-dashed border-border bg-background p-8 text-center text-sm text-muted-foreground">
        Belum ada data kartu untuk deck ini. Data decklist bisa ditambahkan lewat import Limitless atau seed PokeLab.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-sm">
        <thead className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-3 pr-4 font-medium">Card</th>
            <th className="py-3 pr-4 font-medium">Category</th>
            <th className="py-3 pr-4 font-medium">Role</th>
            <th className="py-3 pr-4 font-medium">Copies</th>
            <th className="py-3 pr-4 font-medium">Deck Share</th>
            <th className="py-3 pr-4 font-medium">Importance</th>
            <th className="py-3 pr-4 font-medium">Value</th>
            <th className="py-3 pr-4 font-medium">Usage Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {cards.map((card) => (
            <tr key={card.card_id} className="align-top">
              <td className="py-4 pr-4">
                <a
                  href={`/cards/detail?id=${encodeURIComponent(card.card_id)}&deck_id=${encodeURIComponent(deckId)}${decklistId ? `&decklist_id=${encodeURIComponent(decklistId)}` : ''}`}
                  className="group flex min-w-[260px] items-center gap-3"
                >
                  <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {card.image_url ? (
                      <img
                        src={cardImageSrc(card.image_url)}
                        alt={card.card_name}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                        onError={(event) => setPlaceholderImage(event.currentTarget)}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">No img</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground transition-colors group-hover:text-primary">{card.card_name}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">{card.card_id}</p>
                    <p className="mt-1 text-xs text-primary">Buka detail kartu</p>
                  </div>
                </a>
              </td>
              <td className="py-4 pr-4 text-muted-foreground">{normalizeCategory(card)}{card.card_type ? ` / ${card.card_type}` : ''}</td>
              <td className="py-4 pr-4"><Badge tone={roleTone(card.role)}>{card.role}</Badge></td>
              <td className="py-4 pr-4 font-mono text-lg font-semibold">{card.count}x</td>
              <td className="py-4 pr-4">
                <div className="w-28">
                  <div className="mb-1 font-mono text-xs">{card.deck_share_pct}%</div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, card.deck_share_pct)}%` }} />
                  </div>
                </div>
              </td>
              <td className="py-4 pr-4 font-mono text-primary">{card.importance}</td>
              <td className="py-4 pr-4 font-mono">{formatIDR(card.estimated_value_idr)}</td>
              <td className="py-4 pr-4">
                <p className="max-w-md text-xs leading-5 text-muted-foreground">{card.usage_note}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Shell({ children, deckName }: { children: React.ReactNode; deckName?: string }) {
  return (
    <div className="container space-y-6 px-6 py-8 md:px-8">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/" className="hover:text-primary">Home</a>
        <span>/</span>
        <a href="/decks" className="hover:text-primary">Deck</a>
        {deckName && (
          <>
            <span>/</span>
            <span className="max-w-[220px] truncate text-foreground">{deckName}</span>
          </>
        )}
      </nav>
      <a href="/decks" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" />
        Kembali ke List Deck
      </a>
      {children}
    </div>
  );
}



function GeneratedDeckDetailPage({ deck }: { deck: any }) {
  const [resolvedCards, setResolvedCards] = useState<any[]>([]);
  const [resolving, setResolving] = useState(true);
  const [fullAnalysis, setFullAnalysis] = useState<any>(null);

  const cards = deck.cards || [];
  const missing = deck.missing_cards || [];
  const completeness = deck.completeness_pct || 0;

  const pokemon = cards.filter((c: any) => c.category === 'Pokemon');
  const trainers = cards.filter((c: any) => c.category === 'Trainer' || c.category === '');
  const energy = cards.filter((c: any) => c.category === 'Energy');

  const totalCopies = cards.reduce((s: number, c: any) => s + (c.count || 0), 0);
  const ownedCopies = cards.reduce((s: number, c: any) => s + (c.owned || 0), 0);

  // Resolve card images from DB on mount
  useEffect(() => {
    const resolve = async () => {
      const names = cards.map((c: any) => c.card_name).filter(Boolean);
      if (names.length === 0) { setResolving(false); return; }
      try {
        const resp = await api.resolveCardNames(names);
        if (resp.success && resp.data?.cards) {
          setResolvedCards(resp.data.cards);
        }
      } catch { /* ignore */ }
      setResolving(false);
    };
    resolve();
  }, []);

  // Compute basic analysis locally
  useEffect(() => {
    if (cards.length === 0) return;
    const basics = pokemon.filter((c: any) => !c.card_name?.toLowerCase().includes('stage')).reduce((s: number, c: any) => s + c.count, 0);
    const drawCards = trainers.filter((c: any) => {
      const n = c.card_name?.toLowerCase() || '';
      return n.includes('research') || n.includes('iono') || n.includes('draw') ||
             n.includes('hilda') || n.includes('dawn') || n.includes('judge') ||
             n.includes('professor') || n.includes('cheren') || n.includes('bianca') ||
             n.includes('poképad') || n.includes('pokepad') || n.includes('pad ');
    }).reduce((s: number, c: any) => s + c.count, 0);
    const searchCards = trainers.filter((c: any) => {
      const n = c.card_name?.toLowerCase() || '';
      return n.includes('ball') || n.includes('vessel') || n.includes('poffin') || n.includes('gear') ||
             n.includes('bola') || n.includes('pokégear') || n.includes('poképad') ||
             n.includes('poffin') || n.includes('ber') || n.includes('earthen') ||
             n.includes('candy') || n.includes('permen') || n.includes('rod') ||
             n.includes('night stretcher') || n.includes('tandu malam') ||
             n.includes('pal pad') || n.includes('abu suci');
    }).reduce((s: number, c: any) => s + c.count, 0);
    const switchCards = trainers.filter((c: any) => {
      const n = c.card_name?.toLowerCase() || '';
      return n.includes('switch') || n.includes('escape') || n.includes('rope') || n.includes('balloon') || n.includes('balon');
    }).reduce((s: number, c: any) => s + c.count, 0);
    const gustCards = trainers.filter((c: any) => {
      const n = c.card_name?.toLowerCase() || '';
      return n.includes('boss') || n.includes('catcher') || n.includes('perintah');
    }).reduce((s: number, c: any) => s + c.count, 0);

    const hyp = (k: number, N: number, K: number, n: number): number => {
      if (K > N || n > N || k > K || k > n) return k === 0 && K < n ? 1 : 0;
      const lnC = (a: number, b: number) => { let r = 0; for (let i = 1; i <= b; i++) r += Math.log(a - i + 1) - Math.log(i); return r; };
      return Math.exp(lnC(K, k) + lnC(N - K, n - k) - lnC(N, n));
    };

    const pBasic = basics > 0 ? 1 - hyp(0, 60, basics, 7) : 0;
    const pDraw = drawCards > 0 ? 1 - hyp(0, 60, drawCards, 7) : 0;
    const pSearch = searchCards > 0 ? 1 - hyp(0, 60, searchCards, 7) : 0;
    const pMulligan = basics > 0 ? hyp(0, 60, basics, 7) : 1;

    setFullAnalysis({
      consistency: {
        consistency_pct: Math.round((pBasic * 0.4 + pDraw * 0.35 + pSearch * 0.25) * 100),
        breakdown: [
          { name: 'Opening Basic', probability: Math.round(pBasic * 1000) / 1000, assessment: pBasic >= 0.85 ? 'Good' : pBasic >= 0.7 ? 'Acceptable' : 'Poor' },
          { name: 'Draw Support T1', probability: Math.round(pDraw * 1000) / 1000, assessment: pDraw >= 0.85 ? 'Good' : pDraw >= 0.7 ? 'Acceptable' : 'Poor' },
          { name: 'Search T1', probability: Math.round(pSearch * 1000) / 1000, assessment: pSearch >= 0.85 ? 'Good' : pSearch >= 0.7 ? 'Acceptable' : 'Poor' },
        ],
      },
      mulligan: {
        mulligan_rate: Math.round(pMulligan * 1000) / 1000,
        basic_count: basics,
        expected_mulligans: Math.round(pMulligan * 2 * 100) / 100,
        risk_level: pMulligan < 0.05 ? 'low' : pMulligan < 0.15 ? 'medium' : 'high',
        assessment: pMulligan < 0.05 ? 'Aman' : pMulligan < 0.15 ? 'Cukup aman' : 'Risiko mulligan tinggi',
      },
      brick: {
        brick_rate: Math.round((1 - pDraw) * 1000) / 1000,
        risk_level: (1 - pDraw) < 0.1 ? 'low' : (1 - pDraw) < 0.25 ? 'medium' : 'high',
        assessment: (1 - pDraw) < 0.1 ? 'Konsisten' : 'Perlu tambah draw support',
      },
      engine: {
        draw_cards: drawCards,
        search_cards: searchCards,
        switch_cards: trainers.filter((c: any) => (c.card_name?.toLowerCase() || '').includes('switch')).reduce((s: number, c: any) => s + c.count, 0),
        gust_cards: trainers.filter((c: any) => (c.card_name?.toLowerCase() || '').includes('boss') || (c.card_name?.toLowerCase() || '').includes('catcher')).reduce((s: number, c: any) => s + c.count, 0),
        switch_cards: switchCards,
        gust_cards: gustCards,
        engine_score: Math.min(10, Math.round((drawCards * 0.3 + searchCards * 0.25 + switchCards * 0.15 + gustCards * 0.15 + totalCopies / 60 * 1.5) * 10) / 10),
      },
    });
  }, [cards]);

  // Merge resolved card data (images, prices) into cards
  const enrichedCards = cards.map((c: any) => {
    const resolved = resolvedCards.find((r: any) => r.name?.toLowerCase() === c.card_name?.toLowerCase());
    return { ...c, image_url: resolved?.image_url, price_idr: resolved?.price_idr || c.price_idr, card_id: resolved?.card_id || c.card_id };
  });

  return (
    <Shell deckName={deck.name}>
      {/* Header — same as tournament deck detail */}
      <section className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone="amber">Hybrid Deck</Badge>
              {deck.archetype && <Badge>{deck.archetype}</Badge>}
              {deck.source_engine && <Badge tone="green">Engine: {deck.source_engine}</Badge>}
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{deck.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{deck.description}</p>
          </div>
        </div>
      </section>

      {/* Stats row — same style */}
      <div className="grid gap-3 md:grid-cols-4">
        <Stat icon={Trophy} label="Completeness" value={`${completeness}%`} />
        <Stat icon={Package} label="Total Cards" value={`${ownedCopies}/${totalCopies}`} />
        <Stat icon={Target} label="Missing" value={`${missing.length}`} />
        <Stat icon={Wallet} label="Est. Cost" value={formatIDR(deck.estimated_cost_idr || 0)} />
      </div>

      {/* Deck Scout Report — same as tournament */}
      <section className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex h-8 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wide text-primary">
              <BarChart3 className="mr-2 h-4 w-4" />
              Deck Scout Report — Hybrid
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Analisa Detail {deck.name}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Deck hybrid yang di-generate dari inventory kamu + proven tournament engine. Kartu ditandai owned/need untuk membantu planning upgrade.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[620px]">
            <Metric icon={Package} label="Core Pokemon" value={deck.source_pokemon || '-'} detail="dari inventory kamu" />
            <Metric icon={FlaskConical} label="Engine" value={deck.source_engine || '-'} detail="proven tournament engine" />
            <Metric icon={Target} label="Owned" value={`${ownedCopies} kartu`} detail={`${completeness}% dari total deck`} />
            <Metric icon={Wallet} label="Missing" value={`${missing.length} kartu`} detail={formatIDR(deck.estimated_cost_idr || 0)} />
          </div>
        </div>
      </section>

      {/* Progress Bar */}
      <div className="border border-border bg-card p-5">
        <h2 className="font-semibold mb-3">Deck Completeness</h2>
        <div className="h-4 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-all ${completeness >= 80 ? 'bg-green-500' : completeness >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: completeness + '%' }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>{ownedCopies} kartu dimiliki</span>
          <span>{totalCopies - ownedCopies} kartu perlu dibeli</span>
        </div>
      </div>

      {/* Composition — same as tournament */}
      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Komposisi Deck" description="Distribusi kartu dalam hybrid deck.">
          <CompositionBar label="Pokemon" value={pokemon.reduce((s: number, c: any) => s + c.count, 0)} total={totalCopies} tone="green" />
          <CompositionBar label="Trainer" value={trainers.reduce((s: number, c: any) => s + c.count, 0)} total={totalCopies} tone="blue" />
          <CompositionBar label="Energy" value={energy.reduce((s: number, c: any) => s + c.count, 0)} total={totalCopies} tone="amber" />
        </Panel>

        <Panel title="Tactical Snapshot" description="Kekuatan dan kelemahan hybrid deck.">
          <div className="grid gap-3 sm:grid-cols-2">
            <TacticalItem title="Core Pokemon" text={deck.source_pokemon ? `${deck.source_pokemon} dari inventory — kartu utama yang sudah kamu miliki.` : '-'} />
            <TacticalItem title="Engine" text={deck.source_engine ? `${deck.source_engine} engine — Trainer+Energy package proven dari tournament.` : '-'} />
            <TacticalItem title="Strength" text={(deck.strengths || []).join('. ') || '-'} />
            <TacticalItem title="Watchout" text={(deck.weaknesses || []).join('. ') || '-'} />
          </div>
        </Panel>
      </section>

      {/* Visual Decklist — same as tournament */}
      <Panel title="Visual Decklist" description="Galeri kartu dari hybrid deck. Klik kartu untuk membuka detail.">
        <CardImageGallery cards={enrichedCards.map((c: any) => ({ ...c, deck_share_pct: totalCopies > 0 ? (c.count / totalCopies) * 100 : 0, importance: 50, role: c.source || "card" }))} deckId="generated" />
      </Panel>

      {/* Card Usage Matrix — same as tournament */}
      <Panel title="Card Usage Matrix" description="Detail tiap kartu: copy, role, status owned/need, dan source.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-y border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-3 pr-4 font-medium">Card</th>
                <th className="py-3 pr-4 font-medium">Category</th>
                <th className="py-3 pr-4 font-medium">Source</th>
                <th className="py-3 pr-4 font-medium">Copies</th>
                <th className="py-3 pr-4 font-medium">Owned</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Deck Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrichedCards.map((c: any, i: number) => (
                <tr key={i} className="align-top">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {c.image_url ? <img src={c.image_url} alt={c.card_name} className="h-10 w-7 rounded border border-border object-cover" onError={(e: any) => e.target.style.display='none'} /> : <div className="h-10 w-7 rounded border border-border bg-muted flex items-center justify-center text-[8px] text-muted-foreground">?</div>}
                      <span className="font-semibold">{c.card_name}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{c.category || '-'}</td>
                  <td className="py-3 pr-4"><Badge tone={c.source === 'core' ? 'green' : c.source === 'engine' ? 'blue' : 'slate'}>{c.source}</Badge></td>
                  <td className="py-3 pr-4 font-mono text-lg font-semibold">{c.count}x</td>
                  <td className="py-3 pr-4 font-mono">{c.owned}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.is_owned ? 'bg-green-500/10 text-green-400 border border-green-500/25' : 'bg-red-500/10 text-red-400 border border-red-500/25'}`}>
                      {c.is_owned ? 'owned' : 'need'}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="w-28">
                      <div className="mb-1 font-mono text-xs">{totalCopies > 0 ? ((c.count / totalCopies) * 100).toFixed(1) : 0}%</div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, totalCopies > 0 ? (c.count / totalCopies) * 100 : 0)}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Advanced Analysis — consistency, mulligan, brick, engine */}
      {fullAnalysis && <FullAnalysisPanel analysis={fullAnalysis} />}

      {/* Missing Cards — same style as tournament */}
      {missing.length > 0 && (
        <Panel title="Missing Cards" description="Kartu yang perlu dibeli untuk melengkapi deck.">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {missing.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-3 rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
                <span className="font-mono text-amber-400 font-bold">{m.missing_count}x</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.card_name}</p>
                  <p className="text-xs text-muted-foreground">{m.category || 'Trainer'}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Resolving indicator */}
      {resolving && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card py-6 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Memuat data kartu...
        </div>
      )}

      {/* Back button */}
      <div className="flex gap-3">
        <a href="/lab/recommendations" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-accent">
          <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Recommendations
        </a>
      </div>
    </Shell>
  );
}

function FullAnalysisPanel({ analysis }: { analysis: any }) {
  const c = analysis.consistency || {};
  const m = analysis.mulligan || {};
  const b = analysis.brick || {};
  const e = analysis.engine || {};
  const matchups = analysis.matchups || [];
  const cards = analysis.cards || [];

  const riskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-400 bg-green-500/10 border-green-500/25';
      case 'medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/25';
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/25';
      case 'critical': return 'text-red-500 bg-red-500/20 border-red-500/40';
      default: return 'text-muted-foreground bg-muted border-border';
    }
  };

  const probColor = (p: number) => p >= 0.85 ? 'text-green-400' : p >= 0.70 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Advanced Deck Analysis</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">Consistency</p>
            <p className={`text-2xl font-black ${probColor((c.consistency_pct || 0) / 100)}`}>{(c.consistency_pct || 0).toFixed(0)}%</p>
          </div>
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">Mulligan Rate</p>
            <p className="text-2xl font-black">{((m.mulligan_rate || 0) * 100).toFixed(1)}%</p>
            <span className={`inline-block mt-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskColor(m.risk_level)}`}>{m.risk_level}</span>
          </div>
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">Brick Rate</p>
            <p className="text-2xl font-black">{((b.brick_rate || 0) * 100).toFixed(1)}%</p>
            <span className={`inline-block mt-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${riskColor(b.risk_level)}`}>{b.risk_level}</span>
          </div>
          <div className="rounded-lg border bg-background p-3 text-center">
            <p className="text-xs text-muted-foreground">Engine Score</p>
            <p className="text-2xl font-black">{(e.engine_score || 0).toFixed(1)}<span className="text-sm text-muted-foreground">/10</span></p>
          </div>
        </div>
      </div>

      {/* Consistency Breakdown */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-bold mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-blue-400" /> Consistency Simulation</h3>
        <p className="text-xs text-muted-foreground mb-4">Hypergeometric probability — peluang draw kartu kunci di opening hand.</p>
        <div className="space-y-3">
          {(c.breakdown || []).map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-40 text-sm font-medium">{item.name}</div>
              <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${item.probability >= 0.85 ? 'bg-green-500' : item.probability >= 0.70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${(item.probability * 100)}%` }} />
              </div>
              <div className={`w-16 text-right font-mono text-sm font-bold ${probColor(item.probability)}`}>{(item.probability * 100).toFixed(1)}%</div>
              <div className="w-20 text-xs text-muted-foreground">{item.assessment}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mulligan & Brick */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-bold mb-3">Mulligan Analysis</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Basic Pokemon</span><span className="font-bold">{m.basic_count}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Mulligan Rate</span><span className="font-bold">{((m.mulligan_rate || 0) * 100).toFixed(1)}%</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Expected per Game</span><span className="font-bold">{(m.expected_mulligans || 0).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Budew/Cleffa</span><span className="font-bold">{m.has_budew || m.has_cleffa ? 'Yes' : 'No'}</span></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{m.assessment}</p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-bold mb-3">Brick Potential</h3>
          <div className="space-y-2 text-sm">
            {(b.brick_scenarios || []).map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-border bg-background p-2">
                <span className={`inline-block h-2 w-2 mt-1.5 rounded-full ${s.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                <div>
                  <p className="font-medium">{s.scenario}</p>
                  <p className="text-xs text-muted-foreground">P = {(s.probability * 100).toFixed(1)}% — {s.prevention}</p>
                </div>
              </div>
            ))}
            {(!b.brick_scenarios || b.brick_scenarios.length === 0) && <p className="text-muted-foreground text-xs">Tidak ada brick scenario terdeteksi.</p>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{b.assessment}</p>
        </div>
      </div>

      {/* Engine */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="font-bold mb-3">Engine Analysis</h3>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="text-center"><p className="text-xs text-muted-foreground">Draw</p><p className="text-lg font-bold">{e.draw_cards || 0}</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">Search</p><p className="text-lg font-bold">{e.search_cards || 0}</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">Switch</p><p className="text-lg font-bold">{e.switch_cards || 0}</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">Gust</p><p className="text-lg font-bold">{e.gust_cards || 0}</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">Disruption</p><p className="text-lg font-bold">{e.disruption_cards || 0}</p></div>
          <div className="text-center"><p className="text-xs text-muted-foreground">Heal</p><p className="text-lg font-bold">{e.heal_cards || 0}</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {(e.strengths || []).map((s: string, i: number) => <span key={i} className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">{s}</span>)}
          {(e.weaknesses || []).map((w: string, i: number) => <span key={i} className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">{w}</span>)}
        </div>
      </div>

      {/* Matchups */}
      {matchups.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-bold mb-3">Meta Matchups (Tournament Data)</h3>
          <div className="space-y-2">
            {matchups.map((m: any, i: number) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                <div className={`w-3 h-3 rounded-full ${m.favored ? 'bg-green-500' : 'bg-red-500'}`} />
                <div className="flex-1">
                  <p className="font-medium text-sm">{m.opponent_archetype}</p>
                  <p className="text-xs text-muted-foreground">{m.strategy}</p>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-lg font-bold ${m.favored ? 'text-green-400' : 'text-red-400'}`}>{((m.win_rate || 0) * 100).toFixed(0)}%</p>
                  <p className="text-[10px] text-muted-foreground">n={m.sample_size}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Turn Simulation */}
      {analysis.turn_simulation && <TurnSimulationPanel sim={analysis.turn_simulation} />}

      {/* Meta Matchups */}
      {analysis.meta_matchups && analysis.meta_matchups.length > 0 && <MetaMatchupPanel matchups={analysis.meta_matchups} />}

      {/* AI Insights */}
      {analysis.ai_insights && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <h3 className="font-bold mb-3 flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> AI Analysis</h3>
          <div className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{analysis.ai_insights}</div>
        </div>
      )}
    </div>
  );
}


function TurnSimulationPanel({ sim }: { sim: any }) {
  if (!sim) return null;
  const t1 = sim.turn1 || {};
  const t2 = sim.turn2 || {};
  const recovery = sim.recovery_paths || [];

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'border-red-500/40 bg-red-500/10 text-red-400';
      case 'high': return 'border-orange-500/30 bg-orange-500/10 text-orange-400';
      case 'medium': return 'border-amber-500/25 bg-amber-500/10 text-amber-400';
      default: return 'border-border bg-background text-muted-foreground';
    }
  };

  return (
    <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <span className="text-orange-400 font-bold text-lg">⚡</span>
        <h3 className="font-bold text-lg">Simulasi T1 & T2 — Hand Ampas</h3>
      </div>
      <p className="text-xs text-muted-foreground">Peluang berbagai skenario hand buruk di Turn 1 dan Turn 2, beserta recovery path.</p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Turn 1 */}
        <div className="rounded-lg border bg-background p-4">
          <h4 className="font-bold mb-3 text-sm flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">T1</span>
            Turn 1 (7 kartu)
          </h4>
          <div className="space-y-2">
            {(t1.scenarios || []).map((s: any, i: number) => (
              <div key={i} className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${severityColor(s.severity)}`}>
                <div className="flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="opacity-80 mt-0.5">{s.description}</p>
                  <p className="opacity-60 mt-1 italic">Impact: {s.impact}</p>
                </div>
                <span className="font-mono font-bold text-sm whitespace-nowrap">{(s.probability * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            <p><strong>Best case:</strong> {t1.best_case}</p>
            <p><strong>Worst case:</strong> {t1.worst_case}</p>
          </div>
        </div>

        {/* Turn 2 */}
        <div className="rounded-lg border bg-background p-4">
          <h4 className="font-bold mb-3 text-sm flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">T2</span>
            Turn 2 (8 kartu)
          </h4>
          <div className="space-y-2">
            {(t2.scenarios || []).map((s: any, i: number) => (
              <div key={i} className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${severityColor(s.severity)}`}>
                <div className="flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="opacity-80 mt-0.5">{s.description}</p>
                  <p className="opacity-60 mt-1 italic">Impact: {s.impact}</p>
                </div>
                <span className="font-mono font-bold text-sm whitespace-nowrap">{(s.probability * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recovery Paths */}
      {recovery.length > 0 && (
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
          <h4 className="font-bold mb-2 text-sm text-green-400">🔄 Recovery Paths — Kartu Penyelamat</h4>
          <div className="space-y-2">
            {recovery.map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="font-mono font-bold text-green-400">{(r.probability * 100).toFixed(0)}%</span>
                <div>
                  <span className="font-semibold">{r.card_name}</span>: {r.action}
                  <span className="text-muted-foreground"> → {r.result}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overall Assessment */}
      <div className="rounded-lg border bg-background p-3">
        <p className="text-sm font-medium">Dead Hand Rate: <span className="font-mono font-bold text-orange-400">{((sim.dead_hand_rate || 0) * 100).toFixed(1)}%</span></p>
        <p className="text-xs text-muted-foreground mt-1">{sim.assessment}</p>
      </div>
    </div>
  );
}

function MetaMatchupPanel({ matchups }: { matchups: any[] }) {
  if (!matchups || matchups.length === 0) return null;

  const threatColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-400';
      case 'medium': return 'text-amber-400';
      case 'high': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-red-400 font-bold text-lg">🎯</span>
        <h3 className="font-bold text-lg">Meta Matchup Analysis — Detail per Deck</h3>
      </div>
      <p className="text-xs text-muted-foreground">Analisis mendalam melawan setiap top meta deck: threat cards, gameplan per fase, tech suggestions.</p>

      <div className="space-y-4">
        {matchups.map((m: any, i: number) => (
          <details key={i} className="rounded-lg border bg-background overflow-hidden group" open={i === 0}>
            <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className={`w-3 h-3 rounded-full ${m.favored ? 'bg-green-500' : 'bg-red-500'}`} />
              <div className="flex-1">
                <p className="font-bold">{m.opponent_archetype} <span className="text-xs text-muted-foreground font-normal">Tier {m.opponent_tier}</span></p>
              </div>
              <div className="text-right">
                <p className={`font-mono text-lg font-bold ${m.favored ? 'text-green-400' : 'text-red-400'}`}>{((m.win_rate || 0) * 100).toFixed(0)}%</p>
                <p className="text-[10px] text-muted-foreground">n={m.sample_size}</p>
              </div>
              <span className={`text-xs font-bold ${threatColor(m.threat_level)}`}>{m.threat_level} threat</span>
            </summary>

            <div className="border-t p-4 space-y-4 text-sm">
              {/* Game Plan */}
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">📋 Game Plan</h4>
                <p className="text-sm leading-6">{m.game_plan}</p>
              </div>

              {/* Key Threats */}
              {m.key_threats && m.key_threats.length > 0 && (
                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">⚠️ Key Threats</h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {m.key_threats.map((t: any, j: number) => (
                      <div key={j} className="rounded-md border border-border bg-card p-2.5 text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold">{t.name}</span>
                          <span className="font-mono text-red-400">Danger: {t.danger}/10</span>
                        </div>
                        <p className="text-muted-foreground">{t.threat}</p>
                        <p className="text-green-400 mt-1">Counter: {t.counter}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Turn by Turn */}
              {m.turn_by_turn && m.turn_by_turn.length > 0 && (
                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">⏱️ Turn-by-Turn Plan</h4>
                  <div className="space-y-1">
                    {m.turn_by_turn.map((tp: any, j: number) => (
                      <div key={j} className="flex items-start gap-3 rounded-md border border-border bg-card p-2 text-xs">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">{tp.turn}</span>
                        <div>
                          <span className="font-semibold">{tp.priority}:</span> {tp.action}
                          {tp.notes && <span className="text-muted-foreground ml-1">— {tp.notes}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Game Phases */}
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-md border border-green-500/20 bg-green-500/5 p-2.5 text-xs">
                  <p className="font-semibold text-green-400 mb-1">Early Game (T1-T2)</p>
                  <p className="text-muted-foreground">{m.early_game}</p>
                </div>
                <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs">
                  <p className="font-semibold text-amber-400 mb-1">Mid Game (T3-T5)</p>
                  <p className="text-muted-foreground">{m.mid_game}</p>
                </div>
                <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 text-xs">
                  <p className="font-semibold text-red-400 mb-1">Late Game (T6+)</p>
                  <p className="text-muted-foreground">{m.late_game}</p>
                </div>
              </div>

              {/* Tech Suggestions */}
              {m.tech_suggestions && m.tech_suggestions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">🔧 Tech Suggestions</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {m.tech_suggestions.map((s: string, j: number) => (
                      <span key={j} className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Side Deck */}
              {m.side_deck_advice && (
                <div className="rounded-md border border-border bg-card p-2.5 text-xs">
                  <p className="font-semibold mb-1">🃏 Side Deck Advice</p>
                  <p className="text-muted-foreground">{m.side_deck_advice}</p>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="border border-border bg-background p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Calendar }) {
  return (
    <div className="flex items-center gap-2 border border-border bg-background p-3">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
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

function CompositionBar({ label, value, total, tone }: { label: string; value: number; total: number; tone: 'green' | 'blue' | 'amber' }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const color = tone === 'green' ? 'bg-green-500' : tone === 'amber' ? 'bg-yellow-500' : 'bg-primary';

  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-muted-foreground">{value} copy</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function TacticalItem({ title, text }: { title: string; text: string }) {
  return (
    <div className="border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm leading-6">{text}</p>
    </div>
  );
}

function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'green' | 'amber' | 'slate' }) {
  const classes = {
    blue: 'border-primary/25 bg-primary/10 text-primary',
    green: 'border-green-500/25 bg-green-500/10 text-green-400',
    amber: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300',
    slate: 'border-border bg-secondary/50 text-muted-foreground',
  }[tone];

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>
      {children}
    </span>
  );
}

function inferRole(card: DeckCard): string {
  const name = card.card_name.toLowerCase();
  const category = normalizeCategory(card);
  const type = (card.card_type || '').toLowerCase();

  if (category === 'Energy') return 'energy';
  if (name.includes('stadium')) return 'stadium';
  if (name.includes('boss') || name.includes('counter catcher') || name.includes('catcher')) return 'gust';
  if (name.includes('switch') || name.includes('cart') || name.includes('escape')) return 'switch';
  if (name.includes('research') || name.includes('iono') || name.includes('draw') || name.includes('professor')) return 'draw';
  if (name.includes('ball') || name.includes('ultra') || name.includes('nest') || name.includes('buddy') || name.includes('search')) return 'search';
  if (name.includes('vacuum') || name.includes('hammer') || name.includes('jamming') || name.includes('stamp')) return 'disruption';
  if (category === 'Pokemon' && (name.includes('ex') || type.includes('stage') || card.count >= 2)) return 'attacker';
  if (category === 'Pokemon') return 'engine';
  if (category === 'Trainer') return 'support';
  return 'support';
}

function inferImportance(card: DeckCard, role: string): number {
  const roleBase: Record<string, number> = {
    attacker: 88,
    engine: 82,
    search: 78,
    draw: 76,
    gust: 72,
    disruption: 68,
    switch: 62,
    stadium: 58,
    energy: 54,
    support: 50,
  };
  return Math.min(99, (roleBase[role] || 50) + Math.min(10, card.count * 2));
}

function usageNote(card: DeckCard, role: string): string {
  const notes: Record<string, string> = {
    attacker: 'Ancaman utama atau bagian line Pokemon yang menentukan pressure deck.',
    engine: 'Menjaga setup dan tempo board agar deck tidak tersendat di early game.',
    search: 'Meningkatkan konsistensi akses Pokemon, evolusi, atau resource kunci.',
    draw: 'Menjaga refill hand dan memperbaiki sequencing saat resource menipis.',
    gust: 'Membuka jalur prize map dengan menarik target penting lawan.',
    disruption: 'Mengganggu resource, tool, atau tempo lawan di turn krusial.',
    switch: 'Menjaga mobilitas active Pokemon dan memperbaiki posisi board.',
    stadium: 'Mengubah kondisi board dan membantu game plan tertentu.',
    energy: 'Resource serangan; jumlah copy menentukan stabilitas attack timing.',
    support: 'Kartu fleksibel untuk menutup kebutuhan utility deck.',
  };
  return `${card.count} copy. ${notes[role] || notes.support}`;
}

function normalizeCategory(card: DeckCard): string {
  if (card.category) return card.category;
  if (card.is_pokemon) return 'Pokemon';
  if (card.card_name.toLowerCase().includes('energy')) return 'Energy';
  return 'Trainer';
}

function roleTone(role: string): 'blue' | 'green' | 'amber' | 'slate' {
  if (['attacker', 'engine'].includes(role)) return 'green';
  if (['search', 'draw', 'gust'].includes(role)) return 'blue';
  if (['disruption', 'stadium'].includes(role)) return 'amber';
  return 'slate';
}

function gamePlan(deck: Deck, analysis: DeckAnalysisSummary): string {
  const attackers = analysis.cards.filter((card) => card.role === 'attacker').slice(0, 3).map((card) => card.card_name);
  if (attackers.length > 0) {
    return `Bangun board menuju ${attackers.join(', ')} lalu jaga tempo dengan engine/search.`;
  }
  return `${deck.name} mengandalkan sequencing kartu utility dan konsistensi setup dari representative list.`;
}

function rankLabel(decklist?: Decklist): string {
  if (!decklist?.placement || decklist.placement <= 0) {
    return 'Rank -';
  }
  return `Rank #${decklist.placement}`;
}

function recordLabel(decklist: Decklist): string {
  const wins = decklist.win_count || 0;
  const losses = decklist.loss_count || 0;
  const ties = decklist.tie_count || 0;
  if (wins === 0 && losses === 0 && ties === 0) {
    return '-';
  }
  return `${wins}-${losses}-${ties}`;
}

function decklistSourceLine(decklist?: Decklist): string {
  if (!decklist) return 'No source list';
  const player = decklist.player_name || 'System';
  const tournament = decklist.tournament_name || 'Seed / System';
  return `${player} / ${tournament}`;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
