#!/usr/bin/env python3
"""
LimitlessTCG Full Scraper
Scrape deck overview + semua decklist dari setiap deck
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class LimitlessTCGFullScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.results = []
    
    async def get_deck_list(self, page, page_num: int = 1) -> list:
        """Get list of decks dari halaman list"""
        
        url = f"{self.BASE_URL}/decks?page={page_num}"
        print(f"Fetching deck list page {page_num}...")
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            decks = []
            deck_links = await page.query_selector_all('a[href*="/decks/"]')
            
            for link in deck_links:
                href = await link.get_attribute('href')
                text = await link.text_content()
                
                if href and '/decks/' in href and text:
                    deck_url = self.BASE_URL + href if not href.startswith('http') else href
                    deck_name = text.strip()
                    deck_id = href.split('/')[-1] if '/' in href else None
                    
                    if deck_url not in [d['url'] for d in decks] and deck_name and deck_id and deck_id != 'lists':
                        decks.append({
                            'name': deck_name,
                            'url': deck_url,
                            'deck_id': deck_id
                        })
            
            print(f"  Found {len(decks)} decks")
            return decks
            
        except Exception as e:
            print(f"  Error: {e}")
            return []
    
    async def get_decklists_from_deck(self, page, deck_id: str) -> list:
        """Get semua decklist IDs dari satu deck"""
        
        url = f"{self.BASE_URL}/decks/{deck_id}"
        print(f"  Fetching deck overview: {url}")
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            # Cari link ke decklist
            links = await page.query_selector_all('a[href*="/decks/list/"]')
            
            decklists = []
            for link in links:
                href = await link.get_attribute('href')
                if href and '/decks/list/' in href:
                    list_id = href.split('/')[-1]
                    if list_id not in [d['list_id'] for d in decklists]:
                        decklists.append({
                            'list_id': list_id,
                            'url': self.BASE_URL + href if not href.startswith('http') else href
                        })
            
            print(f"    Found {len(decklists)} decklists")
            return decklists
            
        except Exception as e:
            print(f"    Error: {e}")
            return []
    
    async def scrape_decklist_detail(self, page, list_id: str) -> dict:
        """Scrape detail decklist"""
        
        url = f"{self.BASE_URL}/decks/list/{list_id}"
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            body = await page.query_selector('body')
            if not body:
                return None
            
            text = await body.text_content()
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            
            return self.parse_decklist(lines)
            
        except Exception as e:
            return None
    
    def parse_decklist(self, lines: list) -> dict:
        """Parse decklist dari lines"""
        
        decklist = {
            'pokemon': [],
            'trainer': [],
            'energy': [],
            'total_cards': 0
        }
        
        current_category = None
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            # Check category header
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
            
            # Parse card
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
    
    async def scrape_all(self, max_deck_pages: int = 3, max_decklists_per_deck: int = 5):
        """Scrape semua data"""
        
        print("="*70)
        print("🚀 LIMITLESSTCG FULL SCRAPER")
        print("="*70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Step 1: Get deck list
            print("\n📋 STEP 1: Getting deck list")
            all_decks = []
            for page_num in range(1, max_deck_pages + 1):
                decks = await self.get_deck_list(page, page_num)
                if not decks:
                    break
                all_decks.extend(decks)
                await asyncio.sleep(2)
            
            print(f"\n📊 Total decks: {len(all_decks)}")
            
            # Step 2: For each deck, get decklists
            print("\n📋 STEP 2: Getting decklists from each deck")
            for i, deck in enumerate(all_decks[:10], 1):  # Limit to 10 decks for demo
                print(f"\n[{i}/{min(10, len(all_decks))}] {deck['name']}")
                
                decklists = await self.get_decklists_from_deck(page, deck['deck_id'])
                
                # Step 3: Scrape each decklist
                decklist_details = []
                for dl in decklists[:max_decklists_per_deck]:
                    detail = await self.scrape_decklist_detail(page, dl['list_id'])
                    if detail:
                        decklist_details.append({
                            'list_id': dl['list_id'],
                            'cards': detail
                        })
                        print(f"    ✅ List {dl['list_id']}: {detail['total_cards']} cards")
                    else:
                        print(f"    ❌ List {dl['list_id']}: Failed")
                    
                    await asyncio.sleep(1)
                
                self.results.append({
                    'deck_id': deck['deck_id'],
                    'deck_name': deck['name'],
                    'deck_url': deck['url'],
                    'decklists': decklist_details
                })
                
                # Save progress
                if i % 5 == 0:
                    self._save_progress()
            
            await browser.close()
        
        self._save_final()
        return self.results
    
    def _save_progress(self):
        """Save progress"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_progress_{timestamp}.json'
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(self.results),
                'results': self.results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n💾 Progress saved: {len(self.results)} decks")
    
    def _save_final(self):
        """Save final results"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_complete_{timestamp}.json'
        
        total_decklists = sum(len(r['decklists']) for r in self.results)
        total_cards = sum(
            dl['cards']['total_cards']
            for r in self.results
            for dl in r['decklists']
        )
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'decks': len(self.results),
                'decklists': total_decklists,
                'total_cards': total_cards,
                'results': self.results,
                'scraped_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print(f"✅ COMPLETE! Saved: {filename}")
        print(f"📊 Decks: {len(self.results)} | Decklists: {total_decklists} | Cards: {total_cards}")
        print(f"{'='*70}")


async def main():
    scraper = LimitlessTCGFullScraper()
    await scraper.scrape_all(max_deck_pages=2, max_decklists_per_deck=3)


if __name__ == "__main__":
    asyncio.run(main())
