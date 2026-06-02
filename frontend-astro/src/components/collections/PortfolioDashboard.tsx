import { useEffect } from 'react';
import { useCollectionStore } from '@stores/index';
import { 
  TrendingUp, 
  Package, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart as PieIcon,
  BarChart3,
  Loader2
} from 'lucide-react';
import { formatIDR } from '@utils/formatters';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Pie, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function PortfolioDashboard({ collectionId }: { collectionId: string }) {
  const { currentInsight, loading, fetchCollectionInsight } = useCollectionStore();

  useEffect(() => {
    fetchCollectionInsight(collectionId);
  }, [collectionId, fetchCollectionInsight]);

  if (loading && !currentInsight) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
        <p className="text-muted-foreground animate-pulse">Menghitung statistik koleksi...</p>
      </div>
    );
  }

  if (!currentInsight) return null;

  // Chart Data: Value History
  const valueHistoryData = {
    labels: currentInsight.value_history.map(h => new Date(h.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })),
    datasets: [
      {
        label: 'Nilai Koleksi (IDR)',
        data: currentInsight.value_history.map(h => h.value),
        fill: true,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: 'rgb(59, 130, 246)',
      }
    ]
  };

  // Chart Data: Type Distribution
  const typeData = {
    labels: currentInsight.type_distribution.map(t => t.type),
    datasets: [
      {
        data: currentInsight.type_distribution.map(t => t.count),
        backgroundColor: [
          '#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', 
          '#c2410c', '#1e293b', '#6b7280', '#f472b6', '#4f46e5'
        ],
        borderWidth: 0,
      }
    ]
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Top Stats Overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Value" 
          value={formatIDR(currentInsight.value_history[currentInsight.value_history.length - 1].value)}
          icon={TrendingUp}
          trend="+5.4%"
          trendUp={true}
        />
        <StatCard 
          title="Total Cards" 
          value={currentInsight.type_distribution.reduce((acc, t) => acc + t.count, 0).toString()}
          icon={Package}
        />
        <StatCard 
          title="Unique Sets" 
          value={currentInsight.expansion_progress.length.toString()}
          icon={Layers}
        />
        <StatCard 
          title="Top Rarity" 
          value={currentInsight.rarity_distribution[0]?.rarity || '-'}
          icon={Trophy}
          subtitle={`${currentInsight.rarity_distribution[0]?.count || 0} cards`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Value Chart */}
        <div className="lg:col-span-2 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Growth Koleksi (30 Hari)
            </h3>
            <div className="flex gap-2">
              <span className="text-[10px] font-bold bg-green-500/10 text-green-500 px-2 py-0.5 rounded">LIVE</span>
            </div>
          </div>
          <div className="h-[300px]">
            <Line 
              data={valueHistoryData} 
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { 
                      font: { size: 10 },
                      callback: (val) => `Rp${(Number(val)/1000000).toFixed(1)}M`
                    }
                  },
                  x: { grid: { display: false }, ticks: { font: { size: 10 } } }
                }
              }} 
            />
          </div>
        </div>

        {/* Type Distribution */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <PieIcon className="h-5 w-5 text-purple-500" />
            Distribusi Tipe
          </h3>
          <div className="h-[250px] flex items-center justify-center">
            <Pie 
              data={typeData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10 }, color: '#94a3b8' }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Expansion Progress */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-amber-500" />
            Completion Progress
          </h3>
          <div className="space-y-5">
            {currentInsight.expansion_progress.map((exp) => (
              <div key={exp.code}>
                <div className="flex items-center justify-between text-sm mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{exp.code}</span>
                    <span className="text-muted-foreground truncate max-w-[150px]">{exp.name}</span>
                  </div>
                  <span className="font-mono font-bold text-xs">{exp.percentage.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden border">
                  <div 
                    className="h-full bg-primary transition-all duration-1000 ease-out" 
                    style={{ width: `${exp.percentage}%` }}
                  ></div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 font-medium">
                  {exp.collected} / {exp.total_cards} kartu terkumpul
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Notable Movements */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Notable Movements
          </h3>
          <div className="space-y-4">
            {currentInsight.notable_movements.map((move) => (
              <div key={move.card_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md ${move.trend === 'up' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    {move.trend === 'up' ? <ArrowUpRight className="h-4 w-4 text-green-500" /> : <ArrowDownRight className="h-4 w-4 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{move.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase font-black">{move.card_id}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold font-mono">{formatIDR(move.current_price)}</p>
                  <p className={`text-xs font-bold ${move.trend === 'up' ? 'text-green-500' : 'text-red-500'}`}>
                    {move.trend === 'up' ? '+' : ''}{move.change_percent}%
                  </p>
                </div>
              </div>
            ))}
            <div className="pt-4 text-center">
              <button className="text-xs font-bold text-primary uppercase tracking-widest hover:underline">
                Lihat Semua Perubahan Harga
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, trendUp, subtitle }: any) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 group">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
          <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
        {trend && (
          <span className={`text-xs font-bold ${trendUp ? 'text-green-500' : 'text-red-500'}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{title}</p>
        <h4 className="text-2xl font-black font-mono tracking-tighter">{value}</h4>
        {(subtitle || trend) && (
          <p className="text-[10px] text-muted-foreground mt-1 font-medium italic">
            {subtitle || 'Vs 30 hari lalu'}
          </p>
        )}
      </div>
    </div>
  );
}

function Trophy(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
