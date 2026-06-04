import { useState, useEffect } from 'react';
import { Heart, Plus, Minus, Package, BarChart3, Target, Trophy, TrendingUp } from 'lucide-react';
import type { Card, Collection, MetaPrediction } from '../../types';
import type { CardDeckUsageContext } from './CardDetailPage';
import { useCardStore } from '../../stores/cardStore';
import { useCollectionStore } from '../../stores/collectionStore';
import { useResearchStore } from '../../stores/researchStore';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../api/client';
import Button from '../ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/Dialog';
import { cardImageSrc, setPlaceholderImage } from '../../utils/images';

interface CardDetailProps {
  card: Card;
  deckUsage?: CardDeckUsageContext;
}

export default function CardDetail({ card, deckUsage }: CardDetailProps) {
  const { selectedCard } = useCardStore();
  const { collections, fetchCollections, addToCollection } = useCollectionStore();
  const { isAuthenticated } = useAuthStore();
  const { predictions, fetchPredictions, loading: researchLoading } = useResearchStore();
  const displayCard = card || selectedCard;
  const [quantity, setQuantity] = useState(1);
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [showAddSuccess, setShowAddSuccess] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [loadingAiExplanation, setLoadingAiExplanation] = useState(false);
  const [aiExplanationError, setAiExplanationError] = useState<string | null>(null);

  const safeCollections = Array.isArray(collections) ? collections : [];

  useEffect(() => {
    if (isAuthenticated) {
      fetchCollections();
    }
  }, [fetchCollections, isAuthenticated]);

  useEffect(() => {
    if (displayCard?.category) {
      fetchPredictions(displayCard.category);
    }
  }, [displayCard?.category, displayCard?.id, fetchPredictions]);

  useEffect(() => {
    const fetchAiExplanation = async () => {
      if (!displayCard?.id) return;

      setLoadingAiExplanation(true);
      setAiExplanation(null);
      setAiExplanationError(null);
      try {
        const response = await api.explainCard(displayCard.id);
        if (response.success && response.data?.explanation) {
          setAiExplanation(response.data.explanation);
        } else {
          setAiExplanation(null);
          setAiExplanationError(response.error || 'AI analysis belum tersedia.');
        }
      } catch (err: any) {
        setAiExplanation(null);
        setAiExplanationError(err?.message || 'AI analysis gagal dimuat.');
      } finally {
        setLoadingAiExplanation(false);
      }
    };

    fetchAiExplanation();
  }, [displayCard?.id]);

  if (!displayCard) return null;

  const cardPrediction = predictions.find((prediction) =>
    prediction.card_id === displayCard.id ||
    normalizeCardName(prediction.card_name) === normalizeCardName(displayCard.name_id) ||
    normalizeCardName(prediction.card_name) === normalizeCardName(displayCard.name_en || '')
  ) || null;
  const metaInsight = buildMetaInsight(displayCard, deckUsage, cardPrediction);
  const loginHref = typeof window !== 'undefined'
    ? `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
    : '/login?redirect=/cards';

  const handleAddToCollection = async () => {
    if (!selectedCollection) return;
    
    setAddingToCollection(true);
    try {
      await addToCollection(selectedCollection, { 
        card_id: displayCard.id, 
        quantity 
      });
      setShowAddSuccess(true);
      setTimeout(() => setShowAddSuccess(false), 3000);
    } finally {
      setAddingToCollection(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/" className="hover:text-primary">Home</a>
        <span>/</span>
        <a href="/cards" className="hover:text-primary">Kartu</a>
        <span>/</span>
        <span className="text-foreground truncate max-w-[200px]">{displayCard.name_id}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Card Image */}
        <div className="flex justify-center">
          <div className="relative max-w-md w-full">
            {displayCard.image_url ? (
              <img
                src={cardImageSrc(displayCard.image_url)}
                alt={displayCard.name_id}
                className="w-full rounded-xl shadow-2xl"
                onError={(e) => setPlaceholderImage(e.currentTarget)}
              />
            ) : (
              <div className="aspect-[63/88] bg-muted rounded-xl flex items-center justify-center text-6xl">
                🃏
              </div>
            )}
          </div>
        </div>

        {/* Card Details */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 flex-wrap">
              <span className="px-2 py-1 bg-primary/10 text-primary rounded">
                {displayCard.expansion_code}
              </span>
              <span>•</span>
              <span>{displayCard.rarity || 'Unknown'}</span>
              {displayCard.collector_number && (
                <>
                  <span>•</span>
                  <span>#{displayCard.collector_number}</span>
                </>
              )}
              {displayCard.regulation_mark && (
                <>
                  <span>•</span>
                  <span className="px-2 py-0.5 bg-secondary rounded text-xs">
                    {displayCard.regulation_mark}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-3xl font-bold">{displayCard.name_id}</h1>
            {displayCard.name_en && displayCard.name_en !== displayCard.name_id && (
              <p className="text-muted-foreground">{displayCard.name_en}</p>
            )}
          </div>

          {/* Card Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Kategori</p>
              <p className="text-xl font-bold">{displayCard.category}</p>
            </div>
            {displayCard.hp && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">HP</p>
                <p className="text-xl font-bold">{displayCard.hp}</p>
              </div>
            )}
            {displayCard.card_type && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Tipe</p>
                <p className="text-xl font-bold">{displayCard.card_type}</p>
              </div>
            )}
            {displayCard.retreat_cost !== undefined && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Retreat</p>
                <p className="text-xl font-bold">{displayCard.retreat_cost}</p>
              </div>
            )}
          </div>

          {deckUsage && <DeckUsagePanel usage={deckUsage} />}

          {/* Illustrator */}
          {displayCard.illustrator && (
            <div className="text-sm text-muted-foreground">
              Ilustrator: <span className="text-foreground">{displayCard.illustrator}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            {/* Add to Collection */}
            {isAuthenticated ? (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Package className="h-4 w-4 mr-2" />
                    Tambah ke Koleksi
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah ke Koleksi</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Pilih Koleksi</label>
                      <select
                        value={selectedCollection}
                        onChange={(e) => setSelectedCollection(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border"
                      >
                        <option value="">Pilih koleksi...</option>
                        {safeCollections.map((collection) => (
                          <option key={collection.id} value={collection.id}>
                            {collection.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Jumlah</label>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-12 text-center font-medium">{quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setQuantity(quantity + 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      onClick={handleAddToCollection}
                      disabled={!selectedCollection || addingToCollection}
                      className="w-full"
                    >
                      {addingToCollection ? 'Menambahkan...' : 'Tambahkan'}
                    </Button>
                    {showAddSuccess && (
                      <p className="text-green-600 text-sm text-center">
                        Berhasil ditambahkan ke koleksi!
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <a href={loginHref}>
                <Button variant="outline">
                  <Package className="h-4 w-4 mr-2" />
                  Login untuk Koleksi
                </Button>
              </a>
            )}

            {/* Add to Wishlist */}
            <Button variant="outline">
              <Heart className="h-4 w-4 mr-2" />
              Wishlist
            </Button>
          </div>
        </div>
      </div>

      <CardRulesPanel card={displayCard} deckUsage={deckUsage} metaInsight={metaInsight} />

      <MetaForecastPanel
        insight={metaInsight}
        loading={researchLoading}
        aiExplanation={aiExplanation}
        aiLoading={loadingAiExplanation}
        aiError={aiExplanationError}
      />

    </div>
  );
}

function DeckUsagePanel({ usage }: { usage: CardDeckUsageContext }) {
  const rank = usage.placement && usage.placement > 0 ? `Rank #${usage.placement}` : 'Rank -';
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/10 p-4">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Kebutuhan di Deck</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Copy Deck" value={`${usage.required_count}x`} />
        <MiniStat label="Deck Share" value={`${usage.deck_share_pct}%`} />
        <MiniStat label="Role" value={usage.role} />
        <MiniStat label="Importance" value={`${usage.importance_score}/99`} />
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deck Source</p>
          <a href={`/decks/detail?id=${encodeURIComponent(usage.deck_id)}`} className="mt-1 block font-semibold text-primary hover:underline">
            {usage.deck_name}
          </a>
          <p className="mt-1 text-xs text-muted-foreground">{usage.decklist_name || usage.decklist_id || '-'}</p>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tournament Context</p>
          <p className="mt-1 font-semibold">{usage.player_name || 'System'} / {rank}</p>
          <p className="mt-1 text-xs text-muted-foreground">{usage.tournament_name || 'Seed / System'}{usage.tournament_date ? `, ${usage.tournament_date}` : ''}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{usage.usage_note}</p>
    </div>
  );
}

function CardRulesPanel({ card, deckUsage, metaInsight }: { card: Card; deckUsage?: CardDeckUsageContext; metaInsight: MetaForecastInsight }) {
  const attacks = normalizeList(card.attacks);
  const abilities = normalizeList(card.abilities);
  const weakness = normalizeList(card.weakness);
  const resistance = normalizeList(card.resistance);
  const hasRules = attacks.length > 0 || abilities.length > 0 || weakness.length > 0 || resistance.length > 0 || hasPokedexData(card.pokedex);

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Informasi Lengkap Kartu</h2>
      </div>
      {hasRules ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RulesBlock kind="ability" title="Abilities" items={abilities} empty="Tidak ada ability terstruktur." />
            <RulesBlock kind="attack" title="Attacks" items={attacks} empty="Tidak ada attack terstruktur." />
            <RulesBlock kind="weakness" title="Weakness" items={weakness} empty="Tidak ada weakness terstruktur." />
            <RulesBlock kind="resistance" title="Resistance" items={resistance} empty="Tidak ada resistance terstruktur." />
          </div>
          {hasPokedexData(card.pokedex) && (
            <div className="mt-4 rounded-md border border-border bg-background p-4">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Trophy className="h-4 w-4 text-primary" />
                Pokedex / Flavor Data
              </p>
              <PokedexPanel pokedex={card.pokedex} />
            </div>
          )}
        </>
      ) : (
        <StructuredFallback card={card} deckUsage={deckUsage} metaInsight={metaInsight} />
      )}
    </section>
  );
}

function StructuredFallback({ card, deckUsage, metaInsight }: { card: Card; deckUsage?: CardDeckUsageContext; metaInsight: MetaForecastInsight }) {
  const inferredRole = deckUsage?.role || inferCardProfileRole(card);
  const printLine = [
    card.expansion_code || 'Unknown expansion',
    card.collector_number ? `#${card.collector_number}` : '',
    card.rarity || '',
    card.regulation_mark ? `Reg ${card.regulation_mark}` : '',
  ].filter(Boolean).join(' / ');

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm text-yellow-100">
        Rules text resmi untuk kartu ini belum tersimpan di database lokal. Supaya halaman tetap berguna, panel ini menampilkan profil kompetitif dari metadata, harga, dan konteks deck/turnamen yang tersedia.
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Kategori" value={card.category || '-'} />
        <MiniStat label="Print" value={printLine || '-'} />
        <MiniStat label="Nama EN" value={card.name_en || '-'} />
        <MiniStat label="Illustrator" value={card.illustrator || '-'} />
        <MiniStat label="HP" value={card.hp ? `${card.hp}` : '-'} />
        <MiniStat label="Tipe" value={card.card_type || '-'} />
        <MiniStat label="Evolution" value={card.evolution_stage || '-'} />
        <MiniStat label="Retreat" value={card.retreat_cost !== undefined ? `${card.retreat_cost}` : '-'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Profil Pemakaian</p>
          <p className="mt-2 text-sm leading-6">
            Role awal: <span className="font-semibold text-foreground">{inferredRole}</span>. {cardProfileExplanation(card, inferredRole)}
          </p>
          {deckUsage ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Di deck yang sedang dibuka, kartu ini dipakai <span className="font-semibold text-foreground">{deckUsage.required_count} copy</span> dengan deck share <span className="font-semibold text-foreground">{deckUsage.deck_share_pct}%</span>.
            </p>
          ) : (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Buka kartu ini dari detail deck agar sistem bisa menghitung copy yang dibutuhkan, role di deck tersebut, dan importance score yang lebih presisi.
            </p>
          )}
        </div>

        <div className="rounded-md border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status Meta</p>
          <p className="mt-2 text-sm leading-6">
            <span className="font-semibold text-foreground">{metaInsight.headline}</span> dengan score <span className="font-semibold text-foreground">{metaInsight.scoreLabel}</span> dan trend <span className="font-semibold text-foreground">{metaInsight.trendLabel}</span>.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{metaInsight.reason}</p>
        </div>
      </div>
    </div>
  );
}

function RulesBlock({ kind, title, items, empty }: { kind: 'ability' | 'attack' | 'weakness' | 'resistance'; title: string; items: any[]; empty: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <h3 className="font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((item, index) => (
            <RuleItem key={index} kind={kind} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleItem({ kind, item }: { kind: 'ability' | 'attack' | 'weakness' | 'resistance'; item: any }) {
  if (kind === 'attack') {
    return <AttackItem attack={item} />;
  }
  if (kind === 'ability') {
    return <AbilityItem ability={item} />;
  }
  return <MatchupModifierItem item={item} kind={kind} />;
}

function AttackItem({ attack }: { attack: any }) {
  if (!attack || typeof attack !== 'object') {
    return <PlainRuleText value={attack} />;
  }

  const energyCost = Array.isArray(attack.energy_cost) ? attack.energy_cost : [];
  return (
    <div className="rounded-md border border-border bg-muted/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{attack.name || 'Attack'}</p>
          {energyCost.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {energyCost.map((energy: string, index: number) => (
                <span key={`${energy}-${index}`} className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {energy}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">No energy cost</p>
          )}
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2 text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Damage</p>
          <p className="font-mono text-lg font-bold text-foreground">{attack.damage || '-'}</p>
        </div>
      </div>
      {attack.description && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{attack.description}</p>
      )}
    </div>
  );
}

function AbilityItem({ ability }: { ability: any }) {
  if (!ability || typeof ability !== 'object') {
    return <PlainRuleText value={ability} />;
  }

  return (
    <div className="rounded-md border border-border bg-muted/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold text-foreground">{ability.name || 'Ability'}</p>
        {(ability.type || ability.ability_type) && (
          <span className="rounded-full border border-green-500/25 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-400">
            {ability.type || ability.ability_type}
          </span>
        )}
      </div>
      {ability.description && (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{ability.description}</p>
      )}
    </div>
  );
}

function MatchupModifierItem({ item, kind }: { item: any; kind: 'weakness' | 'resistance' }) {
  if (!item || typeof item !== 'object') {
    return <PlainRuleText value={item} />;
  }

  const modifier = item.modifier || item.value || item.amount || '-';
  const type = item.type || item.card_type || '-';
  const tone = kind === 'weakness'
    ? 'border-red-500/25 bg-red-500/10 text-red-300'
    : 'border-green-500/25 bg-green-500/10 text-green-400';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/60 p-3">
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{type}</span>
      <span className="font-mono text-lg font-bold text-foreground">{modifier}</span>
    </div>
  );
}

function PokedexPanel({ pokedex }: { pokedex: any }) {
  if (!pokedex || typeof pokedex !== 'object') {
    return <PlainRuleText value={pokedex} />;
  }

  const stats = [
    pokedex.number ? { label: 'No.', value: `#${pokedex.number}` } : null,
    pokedex.height ? { label: 'Height', value: `${pokedex.height} m` } : null,
    pokedex.weight ? { label: 'Weight', value: `${pokedex.weight} kg` } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-md border border-border bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

function hasPokedexData(pokedex: any): boolean {
  if (!pokedex || typeof pokedex !== 'object') return false;
  return Boolean(pokedex.number || pokedex.height || pokedex.weight);
}

function PlainRuleText({ value }: { value: any }) {
  return (
    <div className="rounded-md bg-muted p-3 text-sm leading-6 text-muted-foreground">
      {formatRuleItem(value)}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold">{value}</p>
    </div>
  );
}

function inferCardProfileRole(card: Card): string {
  if (card.category === 'Energy') return 'energy resource';
  if (card.category === 'Trainer') {
    const name = `${card.name_id} ${card.name_en || ''}`.toLowerCase();
    if (name.includes('ball') || name.includes('search')) return 'search / consistency';
    if (name.includes('research') || name.includes('iono') || name.includes('draw')) return 'draw engine';
    if (name.includes('stadium')) return 'stadium control';
    if (name.includes('switch') || name.includes('cart')) return 'mobility';
    return 'utility trainer';
  }
  if (card.hp && card.hp >= 200) return 'main attacker / tank';
  if (card.evolution_stage && card.evolution_stage !== 'Basic') return 'evolution line';
  return 'setup pokemon';
}

function cardProfileExplanation(card: Card, role: string): string {
  if (role === 'energy resource') return 'Nilainya di deck ditentukan oleh kebutuhan attack timing dan stabilitas attachment.';
  if (role.includes('search')) return 'Biasanya penting untuk membuka setup dan mengurangi brick di early game.';
  if (role.includes('draw')) return 'Biasanya dipakai untuk refill hand dan menjaga sequencing turn.';
  if (role.includes('stadium')) return 'Biasanya memberi pressure area board atau mengganggu stadium lawan.';
  if (role.includes('main attacker')) return 'HP tinggi membuat kartu ini kandidat pusat prize trade atau pressure board.';
  if (role.includes('evolution')) return 'Kebutuhannya tergantung line evolusi dan seberapa cepat deck harus mencapai stage ini.';
  if (card.category === 'Pokemon') return 'Sebagai Pokemon, kebutuhan copy biasanya ditentukan oleh apakah kartu ini starter, engine, atau attacker pendukung.';
  return 'Peran pastinya perlu divalidasi dari decklist dan matchup, tetapi metadata ini cukup untuk evaluasi awal.';
}

function normalizeList(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return [value];
  return [value];
}

function formatRuleItem(value: any): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

type MetaForecastInsight = {
  headline: string;
  scoreLabel: string;
  trendLabel: string;
  reason: string;
  details: string[];
  factors: string[];
};

function buildMetaInsight(card: Card, deckUsage: CardDeckUsageContext | undefined, prediction: MetaPrediction | null): MetaForecastInsight {
  if (prediction) {
    return {
      headline: 'Meta signal dari deck meta',
      scoreLabel: `${prediction.prediction_score}/100`,
      trendLabel: prediction.trend,
      reason: prediction.reason,
      details: [
        `${prediction.appearances} decklist`,
        `${prediction.total_copies} total copy`,
        prediction.card_type ? `Tipe: ${prediction.card_type}` : `Kategori: ${prediction.category}`,
      ],
      factors: prediction.factors,
    };
  }

  const isPokemon = card.category === 'Pokemon';
  const hasDeckUsage = Boolean(deckUsage);
  const hasRules = hasUsefulRuleData(card);
  const coreCopies = deckUsage?.required_count || 0;
  const trendLabel = hasDeckUsage
    ? coreCopies >= 3
      ? 'rising'
      : coreCopies === 2
        ? 'watch'
        : 'stable'
    : isPokemon && (card.hp || hasRules)
      ? 'watch'
      : 'stable';

  const score = hasDeckUsage
    ? Math.min(92, 54 + coreCopies * 8 + Math.round((deckUsage?.importance_score || 0) / 6))
    : Math.min(78, 42 + (card.rarity?.toLowerCase().includes('rare') ? 10 : 0) + (isPokemon ? 8 : 0) + (hasRules ? 6 : 0));

  return {
    headline: hasDeckUsage ? 'Dipakai di deck terpilih' : 'Belum ada sinyal meta resmi',
    scoreLabel: `${score}/100`,
    trendLabel,
    reason: hasDeckUsage
      ? deckUsage?.usage_note || 'Kartu ini sudah muncul dalam decklist yang dianalisis sehingga layak dipantau untuk kebutuhan deck.'
      : hasRules
        ? 'Rules text kartu sudah tersedia, tetapi belum ada frekuensi turnamen yang cukup untuk menyebutnya staple. Jadikan kartu ini watchlist dan validasi dari decklist yang mulai memakai efeknya.'
        : 'Belum ada data turnamen yang cukup untuk menempatkan kartu ini sebagai staple. Pantau jika kartu ini sering muncul di decklist baru atau sinerginya makin kuat.',
    details: hasDeckUsage
      ? [
          `${coreCopies} copy di deck`,
          `${deckUsage?.deck_share_pct || 0}% share deck`,
          deckUsage?.role ? `Role: ${deckUsage.role}` : 'Role belum terklasifikasi',
        ]
      : [
          isPokemon ? 'Kategori agresif / board presence' : 'Kategori support / utility',
          hasRules ? 'Rules text tersedia untuk evaluasi efek' : 'Rules text belum lengkap',
          card.rarity ? `Rarity: ${card.rarity}` : 'Rarity belum tercatat',
          card.illustrator ? `Illustrator: ${card.illustrator}` : 'Ilustrator tidak tersedia',
        ],
    factors: hasDeckUsage
      ? [
          'Ada kontribusi langsung ke decklist yang dipilih',
          deckUsage?.role ? `Peran deck: ${deckUsage.role}` : 'Peran deck belum spesifik',
          `Importance score ${deckUsage?.importance_score || 0}/99`,
        ]
      : [
          hasRules ? 'Perlu diuji apakah efeknya cukup kuat untuk meta' : 'Belum muncul sebagai top signal di deck meta lokal',
          'Perlu pembuktian dari turnamen atau decklist tambahan',
        ],
  };
}

function hasUsefulRuleData(card: Card): boolean {
  return normalizeList(card.attacks).length > 0 ||
    normalizeList(card.abilities).length > 0 ||
    normalizeList(card.weakness).length > 0 ||
    normalizeList(card.resistance).length > 0;
}

function normalizeCardName(value: string): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function MetaForecastPanel({
  insight,
  loading,
  aiExplanation,
  aiLoading,
  aiError,
}: {
  insight: MetaForecastInsight;
  loading: boolean;
  aiExplanation?: string | null;
  aiLoading?: boolean;
  aiError?: string | null;
}) {
  const hasDetailedAnalysis = Boolean(aiExplanation?.trim());
  const metaUsage = extractMetaUsage(aiExplanation || '');
  const statusLabel = metaUsage.appearances > 0
    ? 'Meta usage terdeteksi'
    : hasDetailedAnalysis
      ? 'Analisis detail tersedia'
      : insight.headline;
  const scoreLabel = metaUsage.appearances > 0
    ? `${Math.min(96, 68 + Math.round(Math.sqrt(metaUsage.appearances) * 2))}/100`
    : insight.scoreLabel;
  const trendLabel = metaUsage.appearances > 25
    ? 'rising'
    : metaUsage.appearances > 0
      ? 'watch'
      : hasDetailedAnalysis && insight.trendLabel === 'stable'
        ? 'scouted'
        : insight.trendLabel;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-5 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Meta / Deck Need Forecast</h2>
      </div>

      {loading ? (
        <div className="rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
          Mengambil sinyal meta terbaru...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
              <p className="mt-1 font-semibold capitalize">{statusLabel}</p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Score</p>
              <p className="mt-1 font-semibold">{scoreLabel}</p>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Trend</p>
              <p className="mt-1 font-semibold capitalize">{trendLabel}</p>
            </div>
          </div>

          {aiLoading ? (
            <div className="rounded-md border border-primary/25 bg-primary/10 p-4">
              <p className="text-xs uppercase tracking-wide text-primary">Kenapa kartu ini dianggap begitu</p>
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-primary/20" />
                <div className="h-3 w-10/12 animate-pulse rounded bg-primary/20" />
                <div className="h-3 w-8/12 animate-pulse rounded bg-primary/20" />
              </div>
            </div>
          ) : hasDetailedAnalysis ? (
            <div className="rounded-md border border-primary/25 bg-primary/10 p-4">
              <p className="text-xs uppercase tracking-wide text-primary">Kenapa kartu ini dianggap begitu</p>
              <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {aiExplanation}
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-md border border-border bg-background p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Kenapa kartu ini dianggap begitu</p>
                <p className="mt-2 text-sm leading-6 text-foreground">{aiError || insight.reason}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sinyal pendukung</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {insight.details.map((detail) => (
                      <li key={detail}>- {detail}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Faktor meta</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {insight.factors.map((factor) => (
                      <li key={factor}>- {factor}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function extractMetaUsage(text: string): { appearances: number; totalCopies: number } {
  const match = text.match(/Terdeteksi di\s+(\d+)\s+decklist(?:\s+dengan total\s+(\d+)\s+copy)?/i);
  if (!match) return { appearances: 0, totalCopies: 0 };
  return {
    appearances: Number(match[1] || 0),
    totalCopies: Number(match[2] || 0),
  };
}

// Render helper for Astro
export function renderCardDetail(container: HTMLElement, card: Card) {
  const root = document.createElement('div');
  container.innerHTML = '';
  container.appendChild(root);
  
  import('react-dom/client').then(({ createRoot }) => {
    const reactRoot = createRoot(root);
    reactRoot.render(<CardDetail card={card} />);
  });
}
