import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  ClipboardList,
  FlaskConical,
  Layers3,
  Package,
  ShieldCheck,
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
  const [aiGuideLoading, setAiGuideLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || window.location.pathname.split('/').filter(Boolean).pop() || '';
    setDeckId(id === 'detail' ? '' : id);
  }, []);

  useEffect(() => {
    if (!deckId) {
      setLoading(false);
      setError('Deck belum dipilih.');
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
  }, [deckId]);

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

      <Panel title="Visual Decklist" description="Galeri kartu dari representative list. Klik kartu untuk membuka detail kartu dan konteks kebutuhan di deck.">
        <CardImageGallery cards={analysis.cards} deckId={analysis.representative?.deck_id || deck.id} decklistId={analysis.representative?.id} />
      </Panel>

      <DeckGuidePanel
        deckName={deck.name}
        archetype={deck.archetype}
        source={{
          player_name: analysis.representative?.player_name,
          tournament_name: analysis.representative?.tournament_name,
          tournament_date: analysis.representative?.tournament_date,
          placement: analysis.representative?.placement,
          decklist_name: analysis.representative?.name,
        }}
        cards={analysis.cards.map((card) => ({
          card_id: card.card_id,
          card_name: card.card_name,
          category: normalizeCategory(card),
          card_type: card.card_type,
          count: card.count,
          role: card.role,
          importance: card.importance,
          usage_note: card.usage_note,
          estimated_price_idr: card.price_idr,
          statistics: {
            deck_share_pct: card.deck_share_pct,
          },
        }))}
        totalCopies={analysis.totalCopies}
        pokemonCopies={analysis.pokemonCopies}
        trainerCopies={analysis.trainerCopies}
        energyCopies={analysis.energyCopies}
        keyCards={analysis.keyCards.map((card) => card.card_name)}
        aiAnswer={aiGuide}
        aiLoading={aiGuideLoading}
        onAskAI={onAskAI}
      />

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
