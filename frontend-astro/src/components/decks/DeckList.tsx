import type { Deck } from '../../types';
import Loading from '@components/ui/Loading';
import EmptyState from '@components/ui/EmptyState';
import { Calendar, ChevronRight, CircleDollarSign, Layers3, Shield, Trophy, Zap } from 'lucide-react';

interface DeckListProps {
  decks: Deck[];
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function DeckList({
  decks,
  loading,
  error,
  emptyTitle = 'Tidak ada deck',
  emptyDescription = 'Belum ada deck yang ditemukan',
}: DeckListProps) {
  if (loading) {
    return (
      <div className="border border-dashed border-border bg-card py-12">
        <Loading text="Memuat deck..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/30 bg-destructive/10 py-12">
        <EmptyState icon="!" title="Terjadi Kesalahan" description={`${error}. Silakan refresh halaman atau coba lagi nanti.`} />
        <div className="mt-4 text-center">
          <button onClick={() => window.location.reload()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Refresh Halaman
          </button>
        </div>
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <div className="border border-dashed border-border bg-card py-12">
        <EmptyState icon="Deck" title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      {decks.map((deck) => {
        const winRate = getWinRate(deck);
        const topSignal = (deck.top8_count || 0) > 0 || (deck.tournament_count || 0) > 0;

        return (
          <a
            key={deck.id}
            href={`/decks/detail?id=${encodeURIComponent(deck.id)}`}
            className="group grid min-h-[184px] border border-border bg-card transition-all hover:border-primary/60 hover:bg-accent/40 md:grid-cols-[120px_1fr]"
          >
            <div className="relative min-h-[120px] overflow-hidden border-b border-border bg-background md:border-b-0 md:border-r">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.28),transparent_36%),linear-gradient(135deg,rgba(15,23,42,0.35),rgba(30,41,59,0.95))]" />
              <div className="relative flex h-full min-h-[120px] flex-col justify-between p-4">
                <Shield className="h-6 w-6 text-primary" />
                <div>
                  <p className="font-mono text-2xl font-bold">{tierLabel(deck)}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meta Signal</p>
                </div>
              </div>
            </div>

            <div className="min-w-0 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {deck.format && <Badge>{deck.format}</Badge>}
                    {topSignal && <Badge tone="amber">Tournament</Badge>}
                  </div>
                  <h3 className="line-clamp-2 text-lg font-semibold leading-6 transition-colors group-hover:text-primary">{deck.name}</h3>
                  {deck.archetype && <p className="mt-1 truncate text-sm text-muted-foreground">{deck.archetype}</p>}
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </div>

              {deck.description && <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{deck.description}</p>}

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <DeckMetric icon={Trophy} label="Events" value={`${deck.tournament_count || 0}`} />
                <DeckMetric icon={Zap} label="Win" value={winRate !== null ? `${winRate}%` : '-'} />
                <DeckMetric icon={Layers3} label="Top 8" value={`${deck.top8_count || 0}`} />
                <DeckMetric icon={CircleDollarSign} label="Cost" value={deck.total_price_idr ? `Rp ${compactIDR(deck.total_price_idr)}` : '-'} />
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {deck.updated_at ? new Date(deck.updated_at).toLocaleDateString('id-ID') : 'PokeLab deck'}
                </span>
                <span className="rounded-md border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">View deck</span>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function getWinRate(deck: Deck) {
  if (!deck.win_count || !deck.tournament_count) return null;
  return Math.round((deck.win_count / Math.max(1, deck.tournament_count)) * 100);
}

function tierLabel(deck: Deck) {
  const score = (deck.tournament_count || 0) * 2 + (deck.top8_count || 0) * 8 + (deck.win_count || 0) * 5;
  if (score >= 80) return 'S';
  if (score >= 40) return 'A';
  if (score >= 12) return 'B';
  return 'C';
}

function compactIDR(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}rb`;
  return value.toLocaleString('id-ID');
}

function DeckMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="border border-border bg-background px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 text-primary" />
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function Badge({ children, tone = 'blue' }: { children: React.ReactNode; tone?: 'blue' | 'amber' }) {
  const toneClass = tone === 'amber'
    ? 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300'
    : 'border-primary/25 bg-primary/10 text-primary';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}
