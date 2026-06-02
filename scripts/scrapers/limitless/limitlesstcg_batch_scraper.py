#!/usr/bin/env python3
"""
LimitlessTCG Batch Scraper - Fixed Version
Handle navigation errors properly
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class LimitlessTCGBatchScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.results = []
    
    async def get_all_decks(self, page) -> list:
        """Get semua deck dari semua halaman"""
        
        print("📋 Getting all decks...")
        all_decks = []
        page_num = 1
        
        while page_num <= 5:  # Max 5 pages
            url = f"{self.BASE_URL}/decks?page={page_num}"
            print(f"  Page {page_num}...", end=' ', flush=True)
            
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(2)
                
                # Get all deck links
                deck_links = await page.query_selector_all('a[href*="/decks/"]')
                
                decks_on_page = 0
                for link in deck_links:
                    try:
                        href = await link.get_attribute('href')
                        text = await link.text_content()
                        
                        if href and '/decks/' in href and text:
                            deck_id = href.split('/')[-1]
                            if deck_id and deck_id != 'lists' and deck_id not in [d['deck_id'] for d in all_decks]:
                                all_decks.append({
                                    'name': text.strip(),
                                    'deck_id': deck_id,
                                    'url': self.BASE_URL + href if not href.startswith('http') else href
                                })
                                decks_on_page += 1
                    except:
                        continue
                
                print(f"{decks_on_page} decks")
                
                if decks_on_page == 0:
                    break
                
                page_num += 1
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"Error: {e}")
                break
        
        print(f"\n📊 Total decks found: {len(all_decks)}")
        return all_decks
    
    async def scrape_deck_batch(self, page, decks: list, start_idx: int):
        """Scrape satu batch deck"""
        
        for i, deck in enumerate(decks, start_idx + 1):
            print(f"\n[{i}/{start_idx + len(decks)}] {deck['name']}")
            
            decklists = []
            
            try:
                # Get deck overview page
                url = f"{self.BASE_URL}/decks/{deck['deck_id']}"
                await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(2)
                
                # Find all decklist links
                list_links = []
                try:
                    links = await page.query_selector_all('a[href*="/decks/list/"]')
                    
                    for link in links:
                        try:
                            href = await link.get_attribute('href')
                            if href and '/decks/list/' in href:
                                list_id = href.split('/')[-1]
                                if list_id and list_id.isdigit():
                                    list_links.append(list_id)
                        except:
                            continue
                except:
                    pass
                
                # Remove duplicates while preserving order
                seen = set()
                unique_links = []
                for lid in list_links:
                    if lid not in seen:
                        seen.add(lid)
                        unique_links.append(lid)
                
                print(f"  Found {len(unique_links)} decklists")
                
                # Scrape max 3 decklists per deck
                for list_id in unique_links[:3]:
                    cards = await self.scrape_decklist(page, list_id)
                    
                    if cards:
                        decklists.append({
                            'list_id': list_id,
                            'cards': cards
                        })
                        print(f"    ✅ List {list_id}: {cards['total_cards']} cards")
                    else:
                        print(f"    ❌ List {list_id}: Failed")
                    
                    await asyncio.sleep(1.5)
                
                self.results.append({
                    'deck_id': deck['deck_id'],
                    'deck_name': deck['name'],
                    'deck_url': deck['url'],
                    'decklists': decklists
                })
                
            except Exception as e:
                print(f"  ❌ Error: {str(e)[:60]}")
                self.results.append({
                    'deck_id': deck['deck_id'],
                    'deck_name': deck['name'],
                    'deck_url': deck['url'],
                    'decklists': decklists,
                    'error': str(e)
                })
            
            # Save progress every 5 decks
            if i % 5 == 0:
                self._save_progress()
    
    async def scrape_decklist(self, page, list_id: str) -> dict:
        """Scrape satu decklist"""
        
        url = f"{self.BASE_URL}/decks/list/{list_id}"
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(2)
            
            # Get page content
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
        
        decklist = {'pokemon': [], 'trainer': [], 'energy': [], 'total_cards': 0}
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
                    
                    # Validate name
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
        
        # Calculate total
        decklist['total_cards'] = (
            sum(c['count'] for c in decklist['pokemon']) +
            sum(c['count'] for c in decklist['trainer']) +
            sum(c['count'] for c in decklist['energy'])
        )
        
        return decklist
    
    async def run(self, max_decks: int = None):
        """Run scraper"""
        
        print("="*70)
        print("🚀 LIMITLESSTCG BATCH SCRAPER")
        print("="*70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            # Get all decks
            all_decks = await self.get_all_decks(page)
            
            # Limit if specified
            if max_decks:
                all_decks = all_decks[:max_decks]
            
            # Save deck list
            with open('limitlesstcg_all_decks.json', 'w', encoding='utf-8') as f:
                json.dump({'decks': all_decks, 'count': len(all_decks)}, f, indent=2)
            
            print(f"\n💾 Deck list saved: limitlesstcg_all_decks.json")
            
            # Scrape all decklists
            print(f"\n📋 Scraping decklists for {len(all_decks)} decks...")
            await self.scrape_deck_batch(page, all_decks, 0)
            
            await browser.close()
        
        # Save final results
        self.save_results()
    
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
    
    def save_results(self):
        """Save final results"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_all_{timestamp}.json'
        
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
                'results': self.results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print(f"✅ COMPLETE: {filename}")
        print(f"📊 Decks: {len(self.results)} | Lists: {total_decklists} | Cards: {total_cards}")
        print(f"{'='*70}")


if __name__ == "__main__":
    import sys
    
    max_decks = int(sys.argv[1]) if len(sys.argv) > 1 else None
    
    scraper = LimitlessTCGBatchScraper()
    asyncio.run(scraper.run(max_decks))
