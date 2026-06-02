import type { Card } from '@/types/index';
import Loading from '@components/ui/Loading';
import EmptyState from '@components/ui/EmptyState';
import { cardImageSrc, setPlaceholderImage } from '@utils/images';
import { ImageIcon } from 'lucide-react';

interface CardGridProps {
  cards: Card[];
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  onCardClick?: (card: Card) => void;
}

export default function CardGrid({
  cards,
  loading,
  error,
  emptyTitle = 'Tidak ada kartu',
  emptyDescription = 'Belum ada kartu yang ditemukan',
  onCardClick,
}: CardGridProps) {
  if (loading) {
    return (
      <div className="border border-dashed border-border bg-card py-12">
        <Loading text="Memuat kartu..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/30 bg-destructive/10 py-12">
        <EmptyState
          icon="!"
          title="Terjadi Kesalahan"
          description={`${error}. Silakan refresh halaman atau coba lagi nanti.`}
        />
        <div className="mt-4 text-center">
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Refresh Halaman
          </button>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="border border-dashed border-border bg-card py-12">
        <EmptyState icon="Cards" title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {cards.map((card) => (
        <a
          key={card.id}
          href={`/cards/detail?id=${encodeURIComponent(card.id)}`}
          onClick={(event) => {
            if (onCardClick) {
              event.preventDefault();
              onCardClick(card);
            }
          }}
          className="group block border border-border bg-card p-2 transition-all hover:border-primary/60 hover:bg-accent/50"
        >
          <div className="relative aspect-[63/88] overflow-hidden rounded-md border border-border bg-background">
            {card.image_url ? (
              <img
                src={cardImageSrc(card.image_url)}
                alt={card.name_id}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                loading="lazy"
                onError={(event) => setPlaceholderImage(event.currentTarget)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            {card.category && (
              <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary shadow">
                {card.category}
              </span>
            )}
          </div>
          <div className="mt-2 min-w-0">
            <h3 className="truncate text-sm font-semibold leading-5 transition-colors group-hover:text-primary">{card.name_id}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>{card.expansion_code || 'No set'}</span>
              {card.collector_number && <span className="font-mono">{card.collector_number}</span>}
              {card.rarity && <span className="rounded border border-border px-1.5 py-0.5">{card.rarity}</span>}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
