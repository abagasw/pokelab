#!/usr/bin/env python3
"""
LimitlessTCG Deck Scraper menggunakan Playwright
Karena website menggunakan JS rendering
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class LimitlessTCGScraper:
    BASE_URL = "https://limitlesstcg.com"
    
    def __init__(self):
        self.decks = []
        
    async def get_deck_list(self, page, page_num: int = 1) -> list:
        """Get list of decks dari halaman list"""
        
        url = f"{self.BASE_URL}/decks?page={page_num}"
        print(f"Fetching deck list page {page_num}...")
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            decks = []
            
            # Cari semua link deck
            deck_links = await page.query_selector_all('a[href*="/decks/"]')
            
            for link in deck_links:
                href = await link.get_attribute('href')
                text = await link.text_content()
                
                if href and '/decks/' in href and text:
                    deck_url = self.BASE_URL + href if not href.startswith('http') else href
                    deck_name = text.strip()
                    
                    # Skip duplicate
                    if deck_url not in [d['url'] for d in decks] and deck_name:
                        decks.append({
                            'name': deck_name,
                            'url': deck_url,
                            'deck_id': href.split('/')[-1] if '/' in href else None
                        })
            
            print(f"  Found {len(decks)} decks on page {page_num}")
            return decks
            
        except Exception as e:
            print(f"  Error fetching page {page_num}: {e}")
            return []
    
    async def scrape_all_decks(self, max_pages: int = None):
        """Scrape semua deck list"""
        
        print("="*70)
        print("🚀 LIMITLESSTCG DECK SCRAPER")
        print("="*70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()
            
            page_num = 1
            all_decks = []
            
            while True:
                if max_pages and page_num > max_pages:
                    break
                
                decks = await self.get_deck_list(page, page_num)
                
                if not decks:
                    print(f"  No more decks found on page {page_num}")
                    break
                
                all_decks.extend(decks)
                print(f"  Total decks so far: {len(all_decks)}")
                
                page_num += 1
                await asyncio.sleep(3)
            
            await browser.close()
        
        print(f"\n📊 Found {len(all_decks)} total decks")
        return all_decks
    
    def save_deck_list(self, decks: list):
        """Save deck list"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f'limitlesstcg_decks_{timestamp}.json'
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'total_decks': len(decks),
                'decks': decks,
                'scraped_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✅ Deck list saved: {filename}")
        return filename


async def main():
    import sys
    
    scraper = LimitlessTCGScraper()
    
    # Parse args
    max_pages = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    
    # Scrape deck list
    decks = await scraper.scrape_all_decks(max_pages)
    
    # Save
    scraper.save_deck_list(decks)


if __name__ == "__main__":
    asyncio.run(main())
