import MLDashboard from '@components/ml/MLDashboard';
import { Brain, Shield, BarChart3, FlaskConical } from 'lucide-react';

export default function MLLabPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex h-8 items-center rounded-md border border-primary/25 bg-primary/10 px-3 text-xs font-semibold uppercase tracking-wide text-primary">
              <FlaskConical className="mr-2 h-4 w-4" />
              Machine Learning Lab
            </div>
            <h1 className="text-3xl font-black tracking-tight">ML Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Visualisasi data meta, deck performance, tier distribution, dan prediction signals.
            </p>
          </div>
          <nav className="flex gap-2">
            <a href="/lab" className="inline-flex h-10 items-center rounded-md border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground">
              <BarChart3 className="mr-2 h-4 w-4" /> Dashboard
            </a>
            <a href="/lab/predictions" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-accent">
              <Brain className="mr-2 h-4 w-4" /> Predictions
            </a>
            <a href="/lab/anti-meta" className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-accent">
              <Shield className="mr-2 h-4 w-4" /> Anti-Meta
            </a>
          </nav>
        </div>
      </header>

      <MLDashboard />
    </div>
  );
}
