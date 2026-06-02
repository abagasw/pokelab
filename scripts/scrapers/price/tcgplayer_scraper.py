#!/usr/bin/env python3
"""
TCGplayer Price Scraper
Scrape harga kartu Pokemon dari TCGplayer.com
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


# Mapping nama kartu Indonesia -> English (untuk kartu dengan nama berbeda)
NAME_MAPPING = {
    'peselancar': 'surging sparks',
    'ledakan peniada': 'paradox rift',
    'impian mega ex': 'mega ex dream',
    'api abadi': 'eternal flames',
    'massimera': 'mew',
    'kekuatan magma': 'magma power',
    'penjaga super': 'super guardian',
    'penguasa bencana': 'disaster ruler',
    'misteri palem': 'palm mystery',
}


class TCGplayerScraper:
    BASE_URL = "https://www.tcgplayer.com"
    
    def __init__(self):
        self.results = []
        
    async def search_card(self, page, card_name: str, set_name: str = None) -> dict:
        """Search card on TCGplayer and get price"""
        
        # Clean card name untuk search
        search_term = self.clean_card_name(card_name)
        
        # Buat URL search
        search_url = f"{self.BASE_URL}/search/all/product?q={search_term.replace(' ', '+')}&view=grid&ProductTypeName=Cards"
        
        try:
            await page.goto(search_url, wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)
            
            # Cari hasil pertama yang cocok
            results = await page.query_selector_all('a[data-testid="product-card__image--link"]')
            
            if not results:
                # Coba selector lain
                results = await page.query_selector_all('.search-result a')
            
            if not results:
                return None
            
            # Ambil hasil pertama
            first_result = results[0]
            product_url = await first_result.get_attribute('href')
            if product_url and not product_url.startswith('http'):
                product_url = self.BASE_URL + product_url
            
            # Buka halaman produk untuk ambil harga
            await page.goto(product_url, wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)
            
            # Extract harga
            price_data = await self.extract_prices(page)
            
            return {
                'tcgplayer_url': product_url,
                'prices': price_data
            }
            
        except Exception as e:
            print(f"    Error searching: {e}")
            return None
    
    async def extract_prices(self, page) -> dict:
        """Extract price data dari halaman produk"""
        
        prices = {}
        
        try:
            # Cari elemen harga dengan berbagai selector
            # Market Price
            market_price = await page.query_selector('[data-testid="market-price"] .price')
            if market_price:
                prices['market'] = await market_price.text_content()
            
            # Low Price
            low_price = await page.query_selector('[data-testid="low-price"] .price')
            if low_price:
                prices['low'] = await low_price.text_content()
            
            # Mid Price
            mid_price = await page.query_selector('[data-testid="mid-price"] .price')
            if mid_price:
                prices['mid'] = await mid_price.text_content()
            
            # High Price
            high_price = await page.query_selector('[data-testid="high-price"] .price')
            if high_price:
                prices['high'] = await high_price.text_content()
            
            # Kalau tidak ketemu, coba regex dari HTML
            if not prices:
                content = await page.content()
                
                # Cari pattern harga
                price_patterns = [
                    r'\$([\d,]+\.\d{2})',
                    r'\$([\d,]+)',
                ]
                
                found_prices = []
                for pattern in price_patterns:
                    matches = re.findall(pattern, content)
                    for m in matches:
                        try:
                            price_val = float(m.replace(',', ''))
                            if 0.1 < price_val < 10000:  # Filter harga yang masuk akal
                                found_prices.append(price_val)
                        except:
                            pass
                
                if found_prices:
                    prices = {
                        'market': f"${sum(found_prices)/len(found_prices):.2f}",
                        'low': f"${min(found_prices):.2f}",
                        'high': f"${max(found_prices):.2f}",
                        '_raw_count': len(found_prices)
                    }
            
        except Exception as e:
            print(f"    Error extracting prices: {e}")
        
        return prices
    
    def clean_card_name(self, name: str) -> str:
        """Bersihkan nama kartu untuk search"""
        # Hapus special chars
        name = re.sub(r'<[^>]+>', '', name)  # Hapus <Erika> dll
        name = re.sub(r'[^\w\s]', '', name)  # Hapus karakter non-alphanumeric
        
        # Coba translate nama Indonesia ke English
        name_lower = name.lower().strip()
        if name_lower in NAME_MAPPING:
            return NAME_MAPPING[name_lower]
        
        return name.strip()
    
    async def scrape_cards(self, cards: list, start_idx: int = 0, count: int = None):
        """Scrape multiple cards"""
        
        if count:
            cards = cards[start_idx:start_idx + count]
        
        print(f"\n{'='*70}")
        print(f"🚀 TCGPLAYER SCRAPER - {len(cards)} cards")
        print(f"{'='*70}\n")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--disable-blink-features=AutomationControlled']
            )
            
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            
            page = await context.new_page()
            
            for i, card in enumerate(cards, start_idx + 1):
                card_name = card.get('card_name', card.get('name', ''))
                set_info = card.get('set_info', '')
                
                print(f"[{i}/{start_idx + len(cards)}] {card_name[:40]}...", end=' ', flush=True)
                
                try:
                    result = await self.search_card(page, card_name, set_info)
                    
                    if result:
                        print(f"✅ {result.get('prices', {})}")
                        self.results.append({
                            'cardtell_name': card_name,
                            'set_info': set_info,
                            **result
                        })
                    else:
                        print(f"❌ Not found")
                        self.results.append({
                            'cardtell_name': card_name,
                            'set_info': set_info,
                            'tcgplayer_url': None,
                            'prices': None
                        })
                    
                    await asyncio.sleep(2)  # Rate limiting
                    
                except Exception as e:
                    print(f"❌ Error: {str(e)[:40]}")
                    self.results.append({
                        'cardtell_name': card_name,
                        'set_info': set_info,
                        'tcgplayer_url': None,
                        'prices': None,
                        'error': str(e)
                    })
            
            await context.close()
            await browser.close()
        
        # Save results
        await self.save_results(start_idx, count)
        
        return self.results
    
    async def save_results(self, start_idx: int, count: int):
        """Save results to file"""
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_num = (start_idx // count) + 1 if count else 1
        filename = f'tcgplayer_batch_{batch_num}_{timestamp}.json'
        
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
    """Main function"""
    import sys
    
    # Load cardtell data
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    
    # Parse args
    start_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    
    scraper = TCGplayerScraper()
    await scraper.scrape_cards(products, start_idx, count)


if __name__ == "__main__":
    asyncio.run(main())
