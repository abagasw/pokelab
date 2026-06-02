import { BookOpen, Brain, ChevronRight, FileText, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatIDR } from '@utils/formatters';

export interface DeckGuideCard {
  card_id: string;
  card_name: string;
  category?: string;
  card_type?: string;
  required_count?: number;
  count?: number;
  owned_count?: number;
  missing_count?: number;
  coverage_pct?: number;
  role?: string;
  importance_score?: number;
  importance?: number;
  buy_priority?: string;
  estimated_price_idr?: number;
  total_missing_cost_idr?: number;
  usage_note?: string;
  substitutes?: string[];
  statistics?: {
    deck_share_pct?: number;
    meta_deck_appearances?: number;
    avg_copies_when_seen?: number;
    ownership_status?: string;
  };
}

export interface DeckGuideSource {
  player_name?: string;
  tournament_name?: string;
  tournament_date?: string;
  placement?: number;
  decklist_name?: string;
}

interface GuideSection {
  group: string;
  title: string;
  body: string[];
}

interface DeckGuidePanelProps {
  deckName: string;
  archetype?: string;
  source?: DeckGuideSource;
  cards: DeckGuideCard[];
  totalCopies?: number;
  pokemonCopies?: number;
  trainerCopies?: number;
  energyCopies?: number;
  completenessPct?: number;
  upgradeCostIdr?: number;
  keyCards?: string[];
  matchupNotes?: string[];
  aiAnswer?: string;
  aiLoading?: boolean;
  onAskAI?: () => void;
}

const matchupTemplates = [
  'Dragapult tanpa Dusknoir',
  'Dragapult dengan Dusknoir',
  'Raging Bolt',
  'Slop Box',
  "Rocket's Mewtwo",
  'Festival Lead',
  'Zoroark',
  'Mega Lucario',
  "Cynthia's Garchomp",
  'Alakazam',
];

export default function DeckGuidePanel({
  deckName,
  archetype,
  source,
  cards,
  totalCopies,
  pokemonCopies,
  trainerCopies,
  energyCopies,
  completenessPct,
  upgradeCostIdr,
  keyCards,
  matchupNotes,
  aiAnswer,
  aiLoading,
  onAskAI,
}: DeckGuidePanelProps) {
  const normalizedCards = cards
    .map(normalizeCard)
    .sort((a, b) => b.importance - a.importance || b.count - a.count || a.card_name.localeCompare(b.card_name));
  const sections = buildGuideSections({
    deckName,
    archetype,
    source,
    cards: normalizedCards,
    totalCopies,
    pokemonCopies,
    trainerCopies,
    energyCopies,
    completenessPct,
    upgradeCostIdr,
    keyCards,
    matchupNotes,
  });
  const grouped = sections.reduce<Record<string, GuideSection[]>>((acc, section) => {
    acc[section.group] = acc[section.group] || [];
    acc[section.group].push(section);
    return acc;
  }, {});
  const topCards = normalizedCards.slice(0, 8);

  return (
    <section className="border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 inline-flex h-8 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wide text-primary">
            <BookOpen className="mr-2 h-4 w-4" />
            Complete Deck Guide
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{deckName} Playbook</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Guide bergaya artikel kompetitif: overview list, gameplan, matchup theory, opsi tech, dan pembahasan tiap kartu berdasarkan representative decklist.
          </p>
        </div>
        {onAskAI && (
          <button
            onClick={onAskAI}
            disabled={aiLoading}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {aiLoading ? <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> : <Brain className="mr-2 h-4 w-4" />}
            Generate AI Deep Guide
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <GuideMeta source={source} totalCopies={totalCopies} completenessPct={completenessPct} upgradeCostIdr={upgradeCostIdr} />
          <div className="border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Guide Index</p>
            <div className="mt-3 space-y-4">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="mb-2 text-xs font-semibold text-primary">{group}</p>
                  <div className="space-y-1">
                    {items.map((section) => (
                      <a key={section.title} href={`#${sectionId(section.title)}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                        <span className="truncate">{section.title}</span>
                        <span className="shrink-0 font-mono">{countWords(section.body.join(' '))} words</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          {aiAnswer && (
            <article className="border border-primary/25 bg-primary/10 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <Brain className="h-4 w-4" />
                OpenRouter AI Deep Guide
              </div>
              <div className="whitespace-pre-line text-sm leading-7 text-foreground/90">{aiAnswer}</div>
            </article>
          )}

          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-lg font-semibold tracking-tight">{group}</h3>
              </div>
              {items.map((section) => (
                <article key={section.title} id={sectionId(section.title)} className="border border-border bg-background p-5">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <h4 className="text-lg font-semibold tracking-tight">{section.title}</h4>
                    <span className="inline-flex w-fit rounded-full border border-border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground">
                      {countWords(section.body.join(' '))} words
                    </span>
                  </div>
                  <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                    {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </article>
              ))}
            </div>
          ))}

          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <ChevronRight className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold tracking-tight">Card-by-Card Deep Notes</h3>
            </div>
            <div className="grid gap-3">
              {normalizedCards.map((card) => <CardGuideItem key={card.card_id} card={card} topCards={topCards} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GuideMeta({ source, totalCopies, completenessPct, upgradeCostIdr }: { source?: DeckGuideSource; totalCopies?: number; completenessPct?: number; upgradeCostIdr?: number }) {
  return (
    <div className="grid gap-2 border border-border bg-background p-4">
      <MetaRow icon={BookOpen} label="Source" value={source?.decklist_name || source?.tournament_name || 'Representative list'} />
      <MetaRow icon={FileText} label="Player" value={source?.player_name || 'System / scraped list'} />
      <MetaRow icon={ChevronRight} label="Rank" value={source?.placement ? `#${source.placement}` : '-'} />
      <MetaRow icon={Sparkles} label="Cards" value={totalCopies ? `${totalCopies}/60 copies` : '-'} />
      {typeof completenessPct === 'number' && <MetaRow icon={BookOpen} label="Inventory" value={`${completenessPct}% ready`} />}
      {typeof upgradeCostIdr === 'number' && <MetaRow icon={BookOpen} label="Upgrade" value={formatIDR(upgradeCostIdr)} />}
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

function CardGuideItem({ card, topCards }: { card: NormalizedGuideCard; topCards: NormalizedGuideCard[] }) {
  const synergy = topCards
    .filter((candidate) => candidate.card_id !== card.card_id && candidate.role !== card.role)
    .slice(0, 3)
    .map((candidate) => candidate.card_name)
    .join(', ');
  const missing = card.missing_count > 0 ? `${card.missing_count} copy belum dimiliki.` : 'Inventory sudah menutup kebutuhan copy kartu ini.';

  return (
    <article className="border border-border bg-background p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold">{card.card_name}</h4>
            <Badge>{card.count}x</Badge>
            <Badge tone={roleTone(card.role)}>{card.role}</Badge>
            <Badge tone={card.importance >= 85 ? 'amber' : 'slate'}>{card.importance}/100 importance</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{card.category}{card.card_type ? ` / ${card.card_type}` : ''}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs md:w-72">
          <Mini label="Deck Share" value={`${card.deck_share_pct}%`} />
          <Mini label="Meta Seen" value={`${card.meta_deck_appearances}x`} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm leading-6 text-muted-foreground lg:grid-cols-3">
        <p><span className="font-semibold text-foreground">Peran.</span> {cardRoleExplanation(card)} {card.usage_note}</p>
        <p><span className="font-semibold text-foreground">Sequencing.</span> Mainkan {card.card_name} saat fungsinya mengubah tempo: setup board, membuka prize map, atau menjaga attack timing. Jangan buang copy penting sebelum tahu resource lawan.</p>
        <p><span className="font-semibold text-foreground">Deck need.</span> {missing} {synergy ? `Biasanya paling bernilai saat dipasangkan dengan ${synergy}.` : 'Nilainya ditentukan oleh kebutuhan game plan utama deck.'}</p>
      </div>

      {card.substitutes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Alternatif:</span>
          {card.substitutes.map((substitute) => <Badge key={substitute} tone="blue">{substitute}</Badge>)}
        </div>
      )}
    </article>
  );
}

function buildGuideSections(input: {
  deckName: string;
  archetype?: string;
  source?: DeckGuideSource;
  cards: NormalizedGuideCard[];
  totalCopies?: number;
  pokemonCopies?: number;
  trainerCopies?: number;
  energyCopies?: number;
  completenessPct?: number;
  upgradeCostIdr?: number;
  keyCards?: string[];
  matchupNotes?: string[];
}): GuideSection[] {
  const topCards = input.cards.slice(0, 8);
  const attackers = input.cards.filter((card) => card.role === 'attacker').slice(0, 4);
  const engine = input.cards.filter((card) => ['engine', 'search', 'draw'].includes(card.role)).slice(0, 5);
  const gust = input.cards.filter((card) => card.role === 'gust').slice(0, 3);
  const disruption = input.cards.filter((card) => ['disruption', 'stadium'].includes(card.role)).slice(0, 4);
  const sourceLine = [input.source?.player_name, input.source?.tournament_name, input.source?.placement ? `rank #${input.source.placement}` : ''].filter(Boolean).join(' / ') || 'representative scraped list';
  const keyLine = (input.keyCards && input.keyCards.length > 0 ? input.keyCards : topCards.map((card) => card.card_name)).slice(0, 6).join(', ') || 'kartu inti belum terdeteksi';
  const total = input.totalCopies || input.cards.reduce((sum, card) => sum + card.count, 0);
  const pokemon = input.pokemonCopies ?? input.cards.filter((card) => card.category === 'Pokemon').reduce((sum, card) => sum + card.count, 0);
  const trainer = input.trainerCopies ?? input.cards.filter((card) => card.category !== 'Pokemon' && card.category !== 'Energy').reduce((sum, card) => sum + card.count, 0);
  const energy = input.energyCopies ?? input.cards.filter((card) => card.category === 'Energy').reduce((sum, card) => sum + card.count, 0);
  const matchupBase = input.matchupNotes && input.matchupNotes.length > 0 ? input.matchupNotes : matchupTemplates.map((name) => matchupText(name, attackers, disruption, gust));

  return [
    {
      group: 'Deck Overview',
      title: `${input.source?.tournament_name || 'Representative'} List Overview`,
      body: [
        `${input.deckName} adalah ${input.archetype || 'archetype'} yang dibaca dari ${sourceLine}. List ini memuat ${total}/60 copy dengan komposisi ${pokemon} Pokemon, ${trainer} Trainer, dan ${energy} Energy. Struktur tersebut memberi gambaran apakah deck condong ke board pressure, setup engine, atau resource trading yang lebih panjang.`,
        `Kartu yang paling menentukan arah list ini adalah ${keyLine}. Saat membaca list, jangan hanya melihat attacker terbesar; perhatikan juga jumlah search, draw, switch, dan gust karena bagian itu yang menentukan seberapa sering game plan bisa muncul di ronde turnamen nyata.`,
      ],
    },
    {
      group: 'Deck Overview',
      title: 'Potential Inclusions',
      body: [
        `Slot potensial biasanya datang dari tiga tempat: search tambahan untuk menaikkan consistency, tech disruption untuk matchup tertentu, atau attacker/utility Pokemon yang memperbaiki prize trade. Dalam list ini, engine utama terlihat dari ${engine.map((card) => card.card_name).join(', ') || 'kartu engine yang tersedia di list'}.`,
        `Kalau meta lokal banyak deck cepat, prioritas inclusion biasanya bukan kartu paling flashy, tetapi kartu yang membuat opening turn lebih stabil. Jika meta banyak deck lambat atau setup berat, tech seperti disruption dan gust menjadi lebih bernilai karena bisa memaksa lawan bermain dari posisi tidak nyaman.`,
      ],
    },
    {
      group: 'Deck Overview',
      title: 'Why no Hero\'s Cape / Mega Frosslass ex?',
      body: [
        `Jika kartu tech tertentu tidak muncul, alasan paling umum adalah opportunity cost. Deck kompetitif jarang punya slot kosong; setiap kartu non-engine harus mengalahkan nilai search, draw, energy, atau gust yang sudah menjaga konsistensi 60 kartu.`,
        `Untuk ${input.deckName}, keputusan memasukkan tech harus diuji terhadap dua pertanyaan: apakah kartu itu memperbaiki matchup yang benar-benar sering ditemui, dan apakah ia tetap berguna saat tidak bertemu matchup target. Kalau jawabannya tidak, list yang lebih ramping biasanya lebih baik.`,
      ],
    },
    {
      group: 'Deck Overview',
      title: 'Alternative List',
      body: [
        `Versi alternatif bisa dibangun dengan menaikkan copy kartu role ${engine[0]?.role || 'engine'} atau menambah attacker pendukung agar prize map lebih fleksibel. Kartu prioritas testing: ${topCards.slice(0, 5).map((card) => card.card_name).join(', ') || 'belum cukup data'}.`,
        `Saat membuat list alternatif, ubah sedikit saja per sesi testing. Satu sampai tiga slot cukup untuk membaca apakah perubahan benar-benar menaikkan win rate atau hanya terasa bagus di satu game tertentu.`,
      ],
    },
    {
      group: 'Core Gameplan',
      title: 'Overall Matchup / Gameplay Theory',
      body: [
        `Game plan utama deck ini adalah membuat board yang bisa menyerang stabil sambil menjaga resource supaya tidak kalah tempo di mid game. Attacker inti yang perlu diprioritaskan adalah ${attackers.map((card) => card.card_name).join(', ') || topCards.slice(0, 3).map((card) => card.card_name).join(', ') || 'belum terdeteksi'}.`,
        `Dalam testing, ukur deck dari tiga indikator: seberapa sering setup berjalan di dua turn pertama, seberapa sering attacker siap tepat waktu, dan apakah kartu gust/disruption tersedia saat prize map sudah terbuka. Kalau salah satu indikator lemah, adjustment list harus diarahkan ke role tersebut.`,
      ],
    },
    {
      group: 'Core Gameplan',
      title: 'Vs Decks that CANNOT consistently OHKO main attacker',
      body: [
        `Melawan deck yang tidak konsisten OHKO attacker utama, tujuanmu adalah memaksa trade yang tidak seimbang. Jangan terlalu cepat mengambil risiko dengan bench penuh jika lawan tidak bisa menekan balik; cukup bangun attacker kedua dan simpan gust untuk target bernilai tinggi.`,
        `Kartu seperti ${gust.map((card) => card.card_name).join(', ') || 'gust effect'} menjadi penutup game, bukan sekadar tombol agresif di awal. Gunakan saat prize map sudah membuat lawan sulit recover.`,
      ],
    },
    {
      group: 'Core Gameplan',
      title: 'Vs Decks that CAN consistently OHKO main attacker',
      body: [
        `Melawan deck yang bisa OHKO konsisten, kamu tidak boleh hanya berharap attacker besar bertahan. Fokus pada sequencing, cadangan attacker, dan tempo resource. Pertahankan hand agar setelah attacker jatuh, kamu tetap punya follow-up langsung.`,
        `Di matchup seperti ini, kartu search dan draw punya nilai lebih tinggi dari tech situasional. Kalau opening gagal, deck OHKO biasanya menghukum dengan sangat cepat.`,
      ],
    },
    {
      group: 'Core Gameplan',
      title: `Optimizing Your Odds: When to use ${engine[0]?.card_name || topCards[0]?.card_name || 'Engine Card'}`,
      body: [
        `${engine[0]?.card_name || topCards[0]?.card_name || 'Kartu engine'} sebaiknya dipakai saat kamu tahu resource apa yang sedang dicari: attacker, energy, switch, atau gust. Kesalahan umum adalah memakai engine hanya karena tersedia, padahal board state belum memberi informasi cukup.`,
        `Gunakan engine untuk mengunci sequencing: cari bagian yang membuat turn sekarang berjalan, lalu sisakan opsi untuk turn berikutnya. Dalam deck kompetitif, satu keputusan engine yang terlalu agresif bisa membuat late game kehilangan jawaban.`,
      ],
    },
    {
      group: 'Core Gameplan',
      title: 'Finding Opportunities to use Boss\'s Orders',
      body: [
        `Gust effect paling kuat saat lawan punya target yang mengubah prize map: Pokemon support, attacker belum siap, atau Pokemon dengan retreat cost berat. Jangan selalu mengejar knockout terbesar; kadang menarik Pokemon pasif memberi satu turn ekstra yang lebih berharga.`,
        `Jika list memainkan ${gust.map((card) => card.card_name).join(', ') || 'Boss effect'}, simpan minimal satu akses untuk mid-to-late game. Early gust boleh dilakukan hanya jika langsung mematahkan setup lawan atau memastikan tempo dua turn ke depan.`,
      ],
    },
    ...matchupBase.slice(0, 10).map((text, index) => ({
      group: 'Individual Matchups',
      title: matchupTemplates[index] || `Matchup ${index + 1}`,
      body: [text],
    })),
    {
      group: 'Conclusion',
      title: 'Conclusion',
      body: [
        `${input.deckName} layak dipelajari sebagai list kompetitif karena memberi data lengkap tentang struktur ${input.archetype || 'archetype'}, prioritas card role, dan pola matchup. Gunakan guide ini sebagai baseline testing, lalu catat perubahan setelah 10 sampai 20 game agar adjustment tidak hanya berdasarkan feeling.`,
      ],
    },
  ];
}

function matchupText(name: string, attackers: NormalizedGuideCard[], disruption: NormalizedGuideCard[], gust: NormalizedGuideCard[]) {
  const mainAttacker = attackers[0]?.card_name || 'attacker utama';
  const disruptionLine = disruption.length > 0 ? ` Manfaatkan ${disruption.map((card) => card.card_name).slice(0, 2).join(' dan ')} untuk memotong tempo lawan.` : '';
  const gustLine = gust.length > 0 ? ` Simpan ${gust[0].card_name} untuk target support atau attacker yang belum siap.` : '';
  return `Melawan ${name}, rencana dasar adalah menjaga ${mainAttacker} tetap online sambil membaca apakah lawan sedang menuju setup besar atau pressure cepat.${disruptionLine}${gustLine} Jika lawan punya jalur knockout cepat, prioritaskan follow-up attacker dan jangan menghabiskan resource search hanya untuk board yang terlihat kuat tetapi rapuh.`;
}

type NormalizedGuideCard = Required<Pick<DeckGuideCard, 'card_id' | 'card_name'>> & {
  category: string;
  card_type: string;
  count: number;
  owned_count: number;
  missing_count: number;
  coverage_pct: number;
  role: string;
  importance: number;
  deck_share_pct: number;
  meta_deck_appearances: number;
  usage_note: string;
  substitutes: string[];
};

function normalizeCard(card: DeckGuideCard): NormalizedGuideCard {
  return {
    card_id: card.card_id,
    card_name: card.card_name,
    category: card.category || 'Unknown',
    card_type: card.card_type || '',
    count: card.required_count || card.count || 0,
    owned_count: card.owned_count || 0,
    missing_count: card.missing_count || 0,
    coverage_pct: card.coverage_pct || 0,
    role: card.role || 'support',
    importance: Math.round(card.importance_score || card.importance || 50),
    deck_share_pct: card.statistics?.deck_share_pct || 0,
    meta_deck_appearances: card.statistics?.meta_deck_appearances || 0,
    usage_note: card.usage_note || '',
    substitutes: card.substitutes || [],
  };
}

function cardRoleExplanation(card: NormalizedGuideCard) {
  const explanation: Record<string, string> = {
    attacker: 'Kartu ini adalah sumber pressure atau bagian line yang mengubah prize trade.',
    engine: 'Kartu ini menjaga setup dan membuat deck tidak kehabisan tempo.',
    search: 'Kartu ini menaikkan akses ke Pokemon, evolution, atau resource penting.',
    draw: 'Kartu ini menjaga kualitas hand dan memperbaiki turn yang kekurangan opsi.',
    gust: 'Kartu ini mengubah target knockout dan membuka jalur prize map.',
    disruption: 'Kartu ini mengganggu resource lawan dan memaksa sequencing lawan memburuk.',
    switch: 'Kartu ini memperbaiki posisi active dan menjaga attack timing.',
    stadium: 'Kartu ini mengubah kondisi board dan menambah tekanan matchup tertentu.',
    energy: 'Kartu ini adalah resource attack timing; jumlah copy menentukan stabilitas serangan.',
    support: 'Kartu ini mengisi fungsi utility agar list tetap fleksibel.',
  };
  return explanation[card.role] || explanation.support;
}

function sectionId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'purple' }) {
  const toneClass = {
    slate: 'border-border bg-secondary/50 text-muted-foreground',
    blue: 'border-primary/25 bg-primary/10 text-primary',
    green: 'border-green-500/25 bg-green-500/10 text-green-400',
    amber: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-300',
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
