#!/usr/bin/env python3
"""
PriceCharting.com Scraper
Scrape harga Pokemon cards dari PriceCharting
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class PriceChartingScraper:
    BASE_URL = "https://www.pricecharting.com"
    
    def __init__(self):
        self.results = []
    
    async def search_card(self, page, card_name: str) -> dict:
        """Search card on PriceCharting"""
        
        search_term = card_name.replace('<', '').replace('>', '').strip()
        search_url = f"{self.BASE_URL}/search-products?q={search_term.replace(' ', '+')}&type=prices&console=pokemon-cards"
        
        try:
            await page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)
            
            # Cari hasil pertama
            product_links = await page.query_selector_all('a[href*="/game/"]')
            
            for link in product_links[:3]:
                href = await link.get_attribute('href')
                if href and '/game/pokemon-' in href:
                    if not href.startswith('http'):
                        href = self.BASE_URL + href
                    
                    # Buka halaman produk
                    await page.goto(href, wait_until='domcontentloaded', timeout=30000)
                    await asyncio.sleep(2)
                    
                    # Extract harga
                    prices = await self.extract_prices(page)
                    
                    if prices:
                        return {
                            'pricecharting_url': href,
                            'prices': prices
                        }
            
            return None
            
        except Exception as e:
            return None
    
    async def extract_prices(self, page) -> dict:
        """Extract price data dari halaman produk"""
        
        prices = {}
        
        try:
            # PriceCharting punya tabel harga
            # Coba ambil dari DOM
            price_rows = await page.query_selector_all('table tr')
            
            for row in price_rows:
                cells = await row.query_selector_all('td')
                if len(cells) >= 2:
                    label = await cells[0].text_content()
                    price = await cells[1].text_content()
                    
                    if label and price:
                        label_clean = label.lower().strip()
                        if 'ungraded' in label_clean or ' loose' in label_clean:
                            prices['ungraded'] = price.strip()
                        elif 'grade 7' in label_clean:
                            prices['psa7'] = price.strip()
                        elif 'grade 8' in label_clean:
                            prices['psa8'] = price.strip()
                        elif 'grade 9' in label_clean:
                            prices['psa9'] = price.strip()
                        elif 'grade 10' in label_clean or 'psa 10' in label_clean:
                            prices['psa10'] = price.strip()
            
            # Kalau tidak ketemu di tabel, coba regex
            if not prices:
                content = await page.content()
                
                # Cari pattern harga
                price_matches = re.findall(r'\$([\d,]+\.?\d*)', content)
                
                if price_matches:
                    values = []
                    for m in price_matches:
                        try:
                            val = float(m.replace(',', ''))
                            if 0.1 < val < 10000:
                                values.append(val)
                        except:
                            pass
                    
                    if values:
                        prices = {
                            'avg': f"${sum(values)/len(values):.2f}",
                            'low': f"${min(values):.2f}",
                            'high': f"${max(values):.2f}",
                        }
            
        except:
            pass
        
        return prices
    
    async def scrape_cards(self, cards: list, start_idx: int = 0, count: int = None):
        """Scrape multiple cards"""
        
        if count:
            cards = cards[start_idx:start_idx + count]
        
        print(f"\n{'='*70}")
        print(f"🚀 PRICECHARTING SCRAPER - {len(cards)} cards")
        print(f"{'='*70}\n")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            
            page = await context.new_page()
            
            for i, card in enumerate(cards, start_idx + 1):
                card_name = card.get('card_name', card.get('name', ''))
                set_info = card.get('set_info', '')
                
                print(f"[{i}/{start_idx + len(cards)}] {card_name[:40]}...", end=' ', flush=True)
                
                try:
                    result = await self.search_card(page, card_name)
                    
                    if result and result.get('prices'):
                        prices_str = str(result['prices'])[:50]
                        print(f"✅ {prices_str}")
                        self.results.append({
                            'cardtell_name': card_name,
                            'set_info': set_info,
                            'cardtell_prices': card.get('prices', []),
                            **result
                        })
                    else:
                        print(f"❌ Not found")
                        self.results.append({
                            'cardtell_name': card_name,
                            'set_info': set_info,
                            'cardtell_prices': card.get('prices', []),
                            'pricecharting_url': None,
                            'prices': None
                        })
                    
                    await asyncio.sleep(2)
                    
                except Exception as e:
                    print(f"❌ Error")
                    self.results.append({
                        'cardtell_name': card_name,
                        'set_info': set_info,
                        'cardtell_prices': card.get('prices', []),
                        'pricecharting_url': None,
                        'prices': None
                    })
            
            await context.close()
            await browser.close()
        
        await self.save_results(start_idx, count)
        return self.results
    
    async def save_results(self, start_idx: int, count: int):
        """Save results"""
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_num = (start_idx // count) + 1 if count else 1
        filename = f'pricecharting_batch_{batch_num}_{timestamp}.json'
        
        success_count = len([r for r in self.results if r.get('prices')])
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump({
                'batch': batch_num,
                'start_index': start_idx,
                'count': len(self.results),
                'success': success_count,
                'results': self.results,
                'scraped_at': datetime.now().isoformat()
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n{'='*70}")
        print(f"✅ Saved: {filename}")
        print(f"📊 Success: {success_count}/{len(self.results)}")
        print(f"{'='*70}")


async def main():
    import sys
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    
    start_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    scraper = PriceChartingScraper()
    await scraper.scrape_cards(products, start_idx, count)


if __name__ == "__main__":
    asyncio.run(main())
