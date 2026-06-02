#!/usr/bin/env python3
"""
LimitlessTCG - Scrape decklists from tournament standings
Scrape detail kartu dari setiap standing
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class LimitlessTCGStandingsDecklistsScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.decklists = {}  # list_id -> decklist
    
    async def scrape_decklist(self, page, list_id: str) -> dict:
        """Scrape single decklist"""
        
        url = f"{self.BASE_URL}/decks/list/{list_id}"
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(2)
            
            body = await page.query_selector('body')
            if not body:
                return None
            
            text = await body.text_content()
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            
            return self.parse_decklist(lines)
            
        except:
            return None
    
    def parse_decklist(self, lines: list) -> dict:
        """Parse decklist from lines"""
        
        decklist = {'pokemon': [], 'trainer': [], 'energy': [], 'total_cards': 0}
        current_category = None
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            if re.match(r'^Pok[ée]mon\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'pokemon'
                i += 1
                continue
            elif re.match(r'^Trainer\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'trainer'
                i += 1
                continue
            elif re.match(r'^Energy\s*\(\d+\)', line, re.IGNORECASE):
                current_category = 'energy'
                i += 1
                continue
            
            if current_category and i + 2 < len(lines):
                count_match = re.match(r'^(\d+)$', line)
                if count_match:
                    count = int(count_match.group(1))
                    name = lines[i + 1]
                    price_line = lines[i + 2]
                    
                    if not re.match(r'^\$|\d+\.\d+', name) and len(name) > 1:
                        price_match = re.search(r'\$([\d\.]+)', price_line)
                        price = float(price_match.group(1)) if price_match else None
                        
                        decklist[current_category].append({
                            'count': count,
                            'name': name,
                            'price_usd': price
                        })
                        i += 3
                        continue
            
            i += 1
        
        decklist['total_cards'] = (
            sum(c['count'] for c in decklist['pokemon']) +
            sum(c['count'] for c in decklist['trainer']) +
            sum(c['count'] for c in decklist['energy'])
        )
        
        return decklist
    
    async def scrape_from_tournaments(self, max_standings: int = None, top_n_per_tournament: int = None):
        """
        Scrape decklists from tournament standings
        
        Args:
            max_standings: Maximum total standings to scrape
            top_n_per_tournament: Only scrape top N from each tournament (e.g., top 32)
        """
        
        # Load tournaments data
        with open('limitlesstcg_tournaments_20260408_044801.json', 'r') as f:
            data = json.load(f)
        
        tournaments = data['tournaments']
        
        # Collect list_ids to scrape
        list_ids_to_scrape = []
        
        for t in tournaments:
            standings = t['standings']
            
            # Filter to top N if specified
            if top_n_per_tournament:
                standings = standings[:top_n_per_tournament]
            
            for s in standings:
                if s['list_url']:
                    list_id = s['list_url'].split('/')[-1]
                    if list_id not in [lid for lid, _ in list_ids_to_scrape]:
                        list_ids_to_scrape.append((list_id, {
                            'tournament_id': t['tournament_id'],
                            'tournament_title': t['title'],
                            'rank': s['rank'],
                            'player': s['player'],
                            'country': s['country'],
                            'deck_name': s['deck_name']
                        }))
        
        # Apply max limit
        if max_standings and len(list_ids_to_scrape) > max_standings:
            list_ids_to_scrape = list_ids_to_scrape[:max_standings]
        
        print("="*70)
        print("🚀 LIMITLESSTCG STANDINGS DECKLISTS SCRAPER")
        print("="*70)
        print(f"Total unique decklists to scrape: {len(list_ids_to_scrape)}")
        print(f"From {len(tournaments)} tournaments")
        if top_n_per_tournament:
            print(f"Top {top_n_per_tournament} per tournament")
        print("="*70)
        
        # Scrape decklists
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            results = []
            
            for i, (list_id, meta) in enumerate(list_ids_to_scrape, 1):
                print(f"\n[{i}/{len(list_ids_to_scrape)}] List {list_id}")
                print(f"  {meta['player']} - {meta['deck_name']}")
                print(f"  {meta['tournament_title']} - Rank {meta['rank']}")
                
                decklist = await self.scrape_decklist(page, list_id)
                
                if decklist:
                    print(f"  ✅ {decklist['total_cards']} cards")
                    results.append({
                        'list_id': list_id,
                        'meta': meta,
                        'decklist': decklist
                    })
                else:
                    print(f"  ❌ Failed")
                    results.append({
                        'list_id': list_id,
                        'meta': meta,
                        'decklist': None
                    })
                
                # Save progress every 10
                if i % 10 == 0:
                    self._save_progress(results, i)
                
                await asyncio.sleep(1.5)
            
            await browser.close()
        
        self._save_final(results)
        return results
    
    def _save_progress(self, results: list, count: int):
        """Save progress"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_standings_decklists_progress_{count}_{timestamp}.json'
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(results),
                'results': results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Progress saved: {len(results)} decklists")
    
    def _save_final(self, results: list):
        """Save final results"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_standings_decklists_{timestamp}.json'
        
        success = [r for r in results if r['decklist']]
        total_cards = sum(r['decklist']['total_cards'] for r in success)
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'total': len(results),
                'success': len(success),
                'total_cards': total_cards,
                'results': results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print(f"✅ COMPLETE: {filename}")
        print(f"📊 Total: {len(results)} | Success: {len(success)} | Cards: {total_cards}")
        print(f"{'='*70}")


async def main():
    import sys
    
    scraper = LimitlessTCGStandingsDecklistsScraper()
    
    # Parse args
    mode = sys.argv[1] if len(sys.argv) > 1 else 'top32'
    
    if mode == 'top32':
        # Scrape top 32 from each tournament
        await scraper.scrape_from_tournaments(top_n_per_tournament=32)
    elif mode == 'top8':
        # Scrape top 8 from each tournament
        await scraper.scrape_from_tournaments(top_n_per_tournament=8)
    elif mode == 'all':
        # Scrape all (warning: will take very long!)
        await scraper.scrape_from_tournaments()
    elif mode.isdigit():
        # Scrape N decklists
        await scraper.scrape_from_tournaments(max_standings=int(mode))
    else:
        print("Usage:")
        print("  python3 limitlesstcg_standings_decklists_scraper.py top32")
        print("  python3 limitlesstcg_standings_decklists_scraper.py top8")
        print("  python3 limitlesstcg_standings_decklists_scraper.py 100")
        print("  python3 limitlesstcg_standings_decklists_scraper.py all")


if __name__ == "__main__":
    asyncio.run(main())
