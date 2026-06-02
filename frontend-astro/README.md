# Pokemon TCG Indonesia Frontend

Frontend untuk Pokemon TCG Indonesia API menggunakan Astro + React.

## 🚀 Tech Stack

| Technology | Purpose |
|------------|---------|
| **Astro** | Static site generation + Islands architecture |
| **React** | Interactive components |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Styling |
| **Zustand** | State management |
| **TanStack Query** | Data fetching (optional) |
| **Lucide React** | Icons |

## 📁 Project Structure

```
frontend-astro/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # UI components
│   │   ├── cards/          # Card-related components
│   │   ├── decks/          # Deck builder components
│   │   ├── prices/         # Price tracker components
│   │   ├── battle/         # Battle simulator components
│   │   └── layout/         # Layout components
│   ├── layouts/            # Astro layouts
│   ├── pages/              # Astro pages (file-based routing)
│   ├── stores/             # Zustand stores
│   ├── api/                # API client
│   ├── types/              # TypeScript types
│   ├── utils/              # Utility functions
│   └── styles/             # Global styles
├── public/                 # Static assets
├── astro.config.mjs        # Astro config
├── tailwind.config.js      # Tailwind config
└── package.json
```

## 🛠️ Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🏗️ Architecture

### Islands Architecture (Astro)

```
Static HTML (Astro) + Interactive Islands (React)
     │                           │
     ▼                           ▼
┌─────────┐              ┌─────────────┐
│ Layout  │              │ CardSearch  │
│ Header  │              │ DeckBuilder │
│ Footer  │              │ BattleSim   │
│ SEO     │              │ (hydrated)  │
└─────────┘              └─────────────┘
     │                           │
     └──────────┬────────────────┘
                ▼
         ┌─────────────┐
         │   Client    │
         └─────────────┘
```

**Benefits:**
- ⚡ Fast initial load (static HTML)
- 🎯 Hydrate only interactive parts
- 🔍 Great SEO
- 💰 Lower hosting costs

### State Management (Zustand)

```
┌─────────────────────────────────────┐
│           Zustand Stores            │
├─────────────────────────────────────┤
│  useCardStore    - Card data        │
│  useDeckStore    - Deck building    │
│  usePriceStore   - Price tracking   │
│  useBattleStore  - Battle sim       │
└─────────────────────────────────────┘
```

### Component Hierarchy

```
Layout.astro (Shell)
    │
    ├── pages/*.astro (Routes)
    │       │
    │       └── React Components (client:*)
    │               │
    │               ├── UI Components
    │               ├── API Calls
    │               └── State Management
    │
    └── Nav, Footer (Static)
```

## 📡 API Integration

### API Client

```typescript
// src/api/client.ts
import { api } from '@api/client';

// Usage
const cards = await api.searchCards({ q: 'Pikachu' });
const deck = await api.buildDeck({ name: 'My Deck', budget: 500000 });
```

### Environment Variables

```bash
# .env
PUBLIC_API_URL=http://localhost:8080
```

## 🎨 Styling

### Tailwind CSS + Custom Theme

```css
/* src/styles/global.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    /* ... */
  }
}

/* Pokemon type colors */
.type-fire { @apply bg-red-500 text-white; }
.type-water { @apply bg-blue-500 text-white; }
/* ... */
```

## 📄 Pages

| Route | Description | Features |
|-------|-------------|----------|
| `/` | Home | Hero, stats, quick search |
| `/cards` | Card database | Search, filter, pagination |
| `/cards/[id]` | Card detail | Info, prices, AI explanation |
| `/decks` | AI Deck Builder | Budget, preferences, build |
| `/prices` | Price tracker | Arbitrage opportunities |
| `/battle` | Battle simulator | Card vs card, type chart |

## 🧩 Key Components

### CardSearch
- Search dengan debounce
- Filter by category, type, rarity
- Pagination
- Card grid dengan lazy loading

### DeckBuilder
- Form konfigurasi deck
- Budget slider
- Regulation mark selector
- AI-powered recommendations

### PriceTracker
- Arbitrage opportunity finder
- Price comparison IDR/USD
- Profit margin calculator

### BattleSimulator
- Card selector modal
- Battle animation
- Damage calculation
- Type advantage analysis

## 🔄 Data Flow

```
User Action
    │
    ▼
React Component
    │
    ▼
Zustand Store (State update)
    │
    ▼
API Client (Axios)
    │
    ▼
Backend API
    │
    ▼
Response → Store update → UI re-render
```

## 🚀 Deployment

### Static Build (Recommended)

```bash
# Build static files
npm run build

# Deploy to any static host
# - Vercel
# - Netlify
# - Cloudflare Pages
# - GitHub Pages
```

### SSR Mode (if needed)

```javascript
// astro.config.mjs
export default defineConfig({
  output: 'server', // Enable SSR
  adapter: vercel(), // or netlify(), node()
});
```

## 🔧 Development Tips

### Add New Page

```astro
---
// src/pages/my-page.astro
import Layout from '@layouts/Layout.astro';
import MyComponent from '@components/MyComponent';
---

<Layout title="My Page">
  <MyComponent client:load />
</Layout>
```

### Add New Store

```typescript
// src/stores/myStore.ts
import { create } from 'zustand';

interface MyState {
  data: any[];
  loading: boolean;
  fetchData: () => Promise<void>;
}

export const useMyStore = create<MyState>((set) => ({
  data: [],
  loading: false,
  fetchData: async () => {
    set({ loading: true });
    // API call...
    set({ data: result, loading: false });
  },
}));
```

### Client Directives

```astro
<!-- Hydrate immediately -->
<Component client:load />

<!-- Hydrate when visible -->
<Component client:visible />

<!-- Hydrate on media query -->
<Component client:media="(max-width: 768px)" />

<!-- Never hydrate (static only) -->
<Component />
```

## 📚 Best Practices

1. **Use client directives wisely**
   - Only hydrate interactive components
   - Use `client:visible` for below-fold content

2. **Keep stores focused**
   - One store per domain (cards, decks, etc)
   - Don't put everything in one store

3. **Type everything**
   - Use TypeScript strict mode
   - Define types in `src/types/`

4. **Optimize images**
   - Use Astro's image optimization
   - Lazy load below-fold images

5. **Handle errors gracefully**
   - Show loading states
   - Display user-friendly errors

## 🔗 Related

- [Backend API](../backend-go/)
- [Architecture Docs](../backend-go/ARCHITECTURE.md)
- [API Client](../backend-go/api/)

## 📄 License

MIT
