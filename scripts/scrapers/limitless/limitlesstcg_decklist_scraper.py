#!/usr/bin/env python3
"""
LimitlessTCG Decklist Scraper
Scrape decklist detail (kartu) dari LimitlessTCG
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class LimitlessTCGDecklistScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.results = []
    
    async def scrape_deck_detail(self, page, deck_id: str) -> dict:
        """Scrape detail decklist dari deck ID"""
        
        url = f"{self.BASE_URL}/decks/list/{deck_id}"
        print(f"    Fetching: {url}")
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            # Get body text
            body = await page.query_selector('body')
            if not body:
                return None
            
            text = await body.text_content()
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            
            return self.parse_decklist(lines)
            
        except Exception as e:
            print(f"    Error: {e}")
            return None
    
    def parse_decklist(self, lines: list) -> dict:
        """Parse decklist dari array of lines"""
        
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
            
            # Check for category header
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
            
            # Try to parse card (format: count, name, price)
            if current_category and i + 2 < len(lines):
                # Check if current line is a number (count)
                count_match = re.match(r'^(\d+)$', line)
                if count_match:
                    count = int(count_match.group(1))
                    name = lines[i + 1]
                    price_line = lines[i + 2]
                    
                    # Validate name (should not be a price or number)
                    if not re.match(r'^\$|\d+\.\d+', name) and len(name) > 1:
                        # Extract price
                        price_match = re.search(r'\$([\d\.]+)', price_line)
                        price = float(price_match.group(1)) if price_match else None
                        
                        card = {
                            'count': count,
                            'name': name,
                            'price_usd': price
                        }
                        
                        decklist[current_category].append(card)
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
    
    async def scrape_decklists(self, deck_ids: list, start_idx: int = 0):
        """Scrape multiple decklists"""
        
        print(f"\n{'='*70}")
        print(f"📋 SCRAPING DECKLISTS - {len(deck_ids)} decks")
        print(f"{'='*70}\n")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            for i, deck_id in enumerate(deck_ids, start_idx + 1):
                print(f"[{i}/{start_idx + len(deck_ids)}] Deck ID: {deck_id}")
                
                decklist = await self.scrape_deck_detail(page, deck_id)
                
                if decklist:
                    total_cards = decklist.get('total_cards', 0)
                    pokemon = len(decklist.get('pokemon', []))
                    trainer = len(decklist.get('trainer', []))
                    energy = len(decklist.get('energy', []))
                    
                    print(f"    ✅ {total_cards} cards (P:{pokemon} T:{trainer} E:{energy})")
                    
                    self.results.append({
                        'deck_id': deck_id,
                        'decklist': decklist
                    })
                else:
                    print(f"    ❌ Failed")
                    self.results.append({
                        'deck_id': deck_id,
                        'decklist': None
                    })
                
                # Save progress every 5 decks
                if i % 5 == 0:
                    self._save_progress(i)
                
                await asyncio.sleep(2)
            
            await browser.close()
        
        return self.results
    
    def _save_progress(self, count: int):
        """Save progress"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_decklists_progress_{count}_{timestamp}.json'
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'count': len(self.results),
                'results': self.results,
                'saved_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"    💾 Progress saved: {len(self.results)} decks")
    
    def save_final_results(self):
        """Save final results"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_decklists_{timestamp}.json'
        
        # Calculate stats
        success = [r for r in self.results if r.get('decklist')]
        total_cards = sum(r['decklist']['total_cards'] for r in success)
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'total_decklists': len(self.results),
                'success': len(success),
                'total_cards': total_cards,
                'results': self.results,
                'scraped_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print(f"✅ FINAL RESULTS SAVED: {filename}")
        print(f"📊 Total: {len(self.results)} | Success: {len(success)} | Cards: {total_cards}")
        print(f"{'='*70}")


async def main():
    import sys
    
    # Load deck list
    with open('limitlesstcg_decks_20260408_040501.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        decks = data['decks']
    
    # Filter deck IDs yang valid (bukan 'lists')
    deck_ids = []
    for deck in decks:
        deck_id = deck.get('deck_id')
        if deck_id and deck_id != 'lists' and deck_id.isdigit():
            deck_ids.append(deck_id)
    
    print(f"Found {len(deck_ids)} valid deck IDs")
    
    # Parse args
    start_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    count = int(sys.argv[2]) if len(sys.argv) > 2 else len(deck_ids)
    
    deck_ids = deck_ids[start_idx:start_idx + count]
    
    scraper = LimitlessTCGDecklistScraper()
    await scraper.scrape_decklists(deck_ids, start_idx)
    scraper.save_final_results()


if __name__ == "__main__":
    asyncio.run(main())
