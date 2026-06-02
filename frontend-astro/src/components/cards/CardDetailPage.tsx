import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Card } from '../../types';
import { api } from '../../api/client';
import CardDetail from './CardDetail';

interface DeckCard {
  card_id: string;
  card_name: string;
  category?: string;
  card_type?: string;
  count: number;
}

interface Decklist {
  id: string;
  deck_id: string;
  name?: string;
  player_name?: string;
  tournament_name?: string;
  tournament_date?: string;
  placement?: number;
  cards?: DeckCard[];
}

export interface CardDeckUsageContext {
  deck_id: string;
  deck_name: string;
  decklist_id?: string;
  decklist_name?: string;
  player_name?: string;
  tournament_name?: string;
  tournament_date?: string;
  placement?: number;
  required_count: number;
  deck_share_pct: number;
  role: string;
  importance_score: number;
  usage_note: string;
}

export default function CardDetailPage() {
  const [card, setCard] = useState<Card | null>(null);
  const [deckUsage, setDeckUsage] = useState<CardDeckUsageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCard = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      let cardId = urlParams.get('id');
      const deckId = urlParams.get('deck_id');
      const decklistId = urlParams.get('decklist_id');
      
      if (!cardId) {
        setError('ID Kartu tidak valid');
        setLoading(false);
        return;
      }
      
      // URL decode the ID (in case it was encoded)
      cardId = decodeURIComponent(cardId);
      console.log('Loading card with ID:', cardId);

      try {
        let foundCard: Card | null = null;
        
        // Try 1: Direct getCardById
        console.log('Attempt 1: getCardById');
        const response = await api.getCardById(cardId);
        if (response.success && response.data) {
          foundCard = response.data;
          console.log('Found via getCardById');
        }
        
        // Try 2: Parse ID and search by expansion + name
        if (!foundCard) {
          console.log('Attempt 2: expansion + name search');
          const match = cardId.match(/^([^-]+)-/);
          const nameMatch = cardId.match(/-(.+)$/);
          
          if (match && nameMatch) {
            const expansion = match[1];
            const name = nameMatch[1].replace(/_/g, ' ');
            
            console.log(`Searching: expansion=${expansion}, name=${name}`);
            const searchResponse = await api.searchCards({ 
              expansion, 
              q: name,
              limit: 50 
            });
            
            if (searchResponse.success && searchResponse.data) {
              foundCard = searchResponse.data.cards.find(c => c.id === cardId) || null;
              if (foundCard) console.log('Found via expansion+name search');
            }
          }
        }
        
        // Try 3: Search by name only
        if (!foundCard) {
          console.log('Attempt 3: name only search');
          const nameMatch = cardId.match(/-(.+)$/);
          if (nameMatch) {
            const name = nameMatch[1].replace(/_/g, ' ');
            console.log(`Searching by name: ${name}`);
            const searchResponse = await api.searchCards({ 
              q: name,
              limit: 50 
            });
            
            if (searchResponse.success && searchResponse.data) {
              foundCard = searchResponse.data.cards.find(c => c.id === cardId) || null;
              if (foundCard) console.log('Found via name search');
            }
          }
        }
        
        // Try 4: Search by expansion only and filter
        if (!foundCard) {
          console.log('Attempt 4: expansion only');
          const expansionMatch = cardId.match(/^([^-]+)-/);
          if (expansionMatch) {
            const expansion = expansionMatch[1];
            const searchResponse = await api.searchCards({ 
              expansion,
              limit: 100 
            });
            
            if (searchResponse.success && searchResponse.data) {
              foundCard = searchResponse.data.cards.find(c => c.id === cardId) || null;
              if (foundCard) console.log('Found via expansion only');
            }
          }
        }
        
        if (foundCard) {
          setCard(foundCard);
          if (deckId) {
            const context = await loadDeckUsageContext(deckId, decklistId, foundCard.id);
            setDeckUsage(context);
          }
        } else {
          setError('Kartu tidak ditemukan');
        }
      } catch (err: any) {
        console.error('Error loading card:', err);
        setError('Gagal memuat data kartu: ' + (err.message || 'Unknown error'));
      } finally {
        setLoading(false);
      }
    };

    loadCard();
  }, []);

  if (loading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Memuat kartu...</span>
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="container py-8">
        <a
          href="/cards"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Kembali ke daftar kartu
        </a>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-2">{error || 'Kartu tidak ditemukan'}</h1>
          <p className="text-muted-foreground">Silakan coba lagi atau pilih kartu lain</p>
          <a href="/cards" className="mt-4 inline-block text-primary hover:underline">
            Lihat semua kartu
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <a
        href="/cards"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Kembali ke daftar kartu
      </a>
      <CardDetail card={card} deckUsage={deckUsage || undefined} />
    </div>
  );
}

async function loadDeckUsageContext(deckId: string, decklistId: string | null, cardId: string): Promise<CardDeckUsageContext | null> {
  try {
    const [deckResponse, decklistsResponse] = await Promise.all([
      api.getDeckById(deckId),
      api.getDeckDecklists(deckId),
    ]);
    if (!decklistsResponse.success || !decklistsResponse.data) {
      return null;
    }

    const decklists = decklistsResponse.data as Decklist[];
    const representative =
      (decklistId ? decklists.find((decklist) => decklist.id === decklistId) : undefined) ||
      decklists.find((decklist) => (decklist.cards?.length || 0) > 0 && (decklist.tournament_name || (decklist.placement || 0) > 0)) ||
      decklists.find((decklist) => (decklist.cards?.length || 0) > 0) ||
      decklists[0];

    if (!representative?.cards?.length) {
      return null;
    }

    const totalCopies = representative.cards.reduce((sum, item) => sum + (item.count || 0), 0);
    const usageCard = representative.cards.find((item) => item.card_id === cardId);
    if (!usageCard) {
      return null;
    }

    const role = inferDeckRole(usageCard);
    const importance = inferDeckImportance(usageCard, role);
    return {
      deck_id: deckId,
      deck_name: deckResponse.success && deckResponse.data ? deckResponse.data.name : representative.deck_id,
      decklist_id: representative.id,
      decklist_name: representative.name,
      player_name: representative.player_name,
      tournament_name: representative.tournament_name,
      tournament_date: representative.tournament_date,
      placement: representative.placement,
      required_count: usageCard.count || 0,
      deck_share_pct: totalCopies > 0 ? Math.round((usageCard.count / totalCopies) * 1000) / 10 : 0,
      role,
      importance_score: importance,
      usage_note: deckUsageNote(usageCard, role),
    };
  } catch {
    return null;
  }
}

function inferDeckRole(card: DeckCard): string {
  const name = card.card_name.toLowerCase();
  const category = card.category || (name.includes('energy') ? 'Energy' : 'Trainer');
  const type = (card.card_type || '').toLowerCase();

  if (category === 'Energy') return 'energy';
  if (name.includes('stadium')) return 'stadium';
  if (name.includes('boss') || name.includes('catcher')) return 'gust';
  if (name.includes('switch') || name.includes('cart') || name.includes('escape')) return 'switch';
  if (name.includes('research') || name.includes('iono') || name.includes('draw') || name.includes('professor')) return 'draw';
  if (name.includes('ball') || name.includes('ultra') || name.includes('nest') || name.includes('buddy') || name.includes('search')) return 'search';
  if (name.includes('vacuum') || name.includes('hammer') || name.includes('stamp')) return 'disruption';
  if (category === 'Pokemon' && (name.includes('ex') || type.includes('stage') || card.count >= 2)) return 'attacker';
  if (category === 'Pokemon') return 'engine';
  return 'support';
}

function inferDeckImportance(card: DeckCard, role: string): number {
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
  return Math.min(99, (roleBase[role] || 50) + Math.min(10, (card.count || 0) * 2));
}

function deckUsageNote(card: DeckCard, role: string): string {
  if (card.count >= 4) return 'Core consistency card. Biasanya wajib lengkap 4 copy karena deck ingin melihat kartu ini sesering mungkin.';
  if (card.count === 3) return 'High priority card. Tiga copy berarti kartu ini sering diperlukan tetapi masih memberi ruang untuk tech lain.';
  if (card.count === 2) return 'Support line atau utility penting. Dua copy biasanya menjaga akses tanpa memenuhi slot deck terlalu banyak.';
  if (role === 'gust' || role === 'disruption' || role === 'stadium') return 'Tech situasional. Satu copy dipakai untuk matchup atau turn tertentu.';
  return 'Single-copy utility. Dicari saat situasi cocok, bukan kartu yang selalu harus dibuka di early game.';
}
