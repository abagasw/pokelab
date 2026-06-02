#!/usr/bin/env python3
"""
Efficient Pokemon Price Scraper
Focus on working sources: PokemonTCG.io API & Cardtell.id
Optimized for speed and reliability
"""

import json
import asyncio
import os
import csv
from datetime import datetime
from typing import List, Dict
from scrapling import Fetcher
from scrapling.fetchers import AsyncFetcher
from playwright.async_api import async_playwright


class EfficientPriceScraper:
    """Scraper efisien untuk sumber yang terbukti berhasil"""
    
    def __init__(self, output_dir: str = "efficient_output"):
        self.output_dir = output_dir
        self.fetcher = Fetcher()
        self.async_fetcher = AsyncFetcher()
        
        os.makedirs(output_dir, exist_ok=True)
        
        self.stats = {
            "pokemontcg_sets": 0,
            "pokemontcg_cards": 0,
            "cardtell_products": 0
        }
    
    async def scrape_pokemontcg_popular_sets(self):
        """Scrape set-set populer dari PokemonTCG.io"""
        print("\n" + "="*70)
        print("🎴 POKEMONTCG.IO - POPULAR SETS")
        print("="*70)
        
        # Popular sets to scrape
        popular_set_ids = [
            "sv3pt5",    # Pokemon 151
            "sv1",       # Scarlet & Violet
            "sv4",       # Paradox Rift
            "sv5",       # Temporal Forces
            "sv8",       # Surging Sparks
            "sv9",       # Journey Together
            "me1",       # Mega Evolution
            "me2",       # Phantasmal Flames
            "me3",       # Perfect Order
            "swsh12",    # Silver Tempest
            "swsh10",    # Astral Radiance
            "base1",     # Base Set
        ]
        
        all_cards = []
        
        for set_id in popular_set_ids:
            try:
                print(f"📦 Fetching set: {set_id}")
                
                # Get set info
                set_response = await self.async_fetcher.get(
                    f'https://api.pokemontcg.io/v2/sets/{set_id}'
                )
                set_data = set_response.json()
                set_info = set_data.get('data', {})
                
                # Get all cards
                page = 1
                set_cards = []
                
                while True:
                    cards_response = await self.async_fetcher.get(
                        f'https://api.pokemontcg.io/v2/cards?q=set.id:{set_id}&pageSize=250&page={page}'
                    )
                    cards_data = cards_response.json()
                    
                    if not cards_data.get('data'):
                        break
                    
                    for card in cards_data['data']:
                        card_info = {
                            "id": card['id'],
                            "name": card['name'],
                            "set_id": set_id,
                            "set_name": set_info.get('name', ''),
                            "number": card['number'],
                            "rarity": card.get('rarity', ''),
                            "supertype": card.get('supertype', ''),
                            "types": card.get('types', []),
                            "images": {
                                "small": card.get('images', {}).get('small', ''),
                                "large": card.get('images', {}).get('large', '')
                            },
                            "prices": self._extract_prices(card)
                        }
                        set_cards.append(card_info)
                    
                    if len(cards_data['data']) < 250:
                        break
                    page += 1
                
                print(f"   ✅ {len(set_cards)} cards")
                all_cards.extend(set_cards)
                self.stats['pokemontcg_sets'] += 1
                self.stats['pokemontcg_cards'] += len(set_cards)
                
                # Save individual set
                with open(f"{self.output_dir}/pokemontcg_{set_id}.json", 'w', encoding='utf-8') as f:
                    json.dump({
                        "set_id": set_id,
                        "set_name": set_info.get('name'),
                        "cards": set_cards
                    }, f, indent=2, ensure_ascii=False)
                
                await asyncio.sleep(0.3)
                
            except Exception as e:
                print(f"   ❌ Error with {set_id}: {e}")
        
        # Save all cards
        with open(f"{self.output_dir}/pokemontcg_all_cards.json", 'w', encoding='utf-8') as f:
            json.dump({
                "source": "PokemonTCG.io",
                "scraped_at": datetime.now().isoformat(),
                "total_cards": len(all_cards),
                "cards": all_cards
            }, f, indent=2, ensure_ascii=False)
        
        # Export to CSV
        self._export_pokemontcg_csv(all_cards)
        
        print(f"\n✅ PokemonTCG.io: {self.stats['pokemontcg_sets']} sets, {self.stats['pokemontcg_cards']} cards")
        return all_cards
    
    def _extract_prices(self, card: Dict) -> Dict:
        """Extract and format prices"""
        tcgplayer = card.get('tcgplayer', {})
        cardmarket = card.get('cardmarket', {})
        
        prices = {}
        
        # TCGplayer prices
        if tcgplayer and tcgplayer.get('prices'):
            tcg_prices = tcgplayer['prices']
            for variant, pdata in tcg_prices.items():
                if isinstance(pdata, dict) and pdata.get('market'):
                    prices[f"tcgplayer_{variant}"] = pdata['market']
        
        # Cardmarket prices
        if cardmarket and cardmarket.get('prices'):
            cm_prices = cardmarket['prices']
            if cm_prices.get('averageSellPrice'):
                prices['cardmarket_avg'] = cm_prices['averageSellPrice']
            if cm_prices.get('trendPrice'):
                prices['cardmarket_trend'] = cm_prices['trendPrice']
        
        return prices
    
    def _export_pokemontcg_csv(self, cards: List[Dict]):
        """Export PokemonTCG data to CSV"""
        filename = f"{self.output_dir}/pokemontcg_prices.csv"
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Card ID', 'Name', 'Set', 'Set ID', 'Number', 'Rarity',
                'Type', 'TCGplayer Market', 'Cardmarket Avg', 'Image URL'
            ])
            
            for card in cards:
                prices = card.get('prices', {})
                
                # Get TCGplayer market price (any variant)
                tcg_market = ''
                for key, value in prices.items():
                    if key.startswith('tcgplayer_') and isinstance(value, (int, float)):
                        tcg_market = value
                        break
                
                writer.writerow([
                    card['id'],
                    card['name'],
                    card['set_name'],
                    card['set_id'],
                    card['number'],
                    card['rarity'],
                    ', '.join(card.get('types', [])),
                    tcg_market,
                    prices.get('cardmarket_avg', ''),
                    card['images'].get('small', '')
                ])
        
        print(f"📄 Exported: {filename}")
    
    async def scrape_cardtell_comprehensive(self):
        """Scrape Cardtell.id secara komprehensif"""
        print("\n" + "="*70)
        print("🇮🇩 CARDTELL.ID - COMPREHENSIVE")
        print("="*70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                locale='id-ID'
            )
            
            page = await context.new_page()
            
            try:
                # Load main page
                print("📥 Loading Cardtell...")
                await page.goto('https://cardtell.id/')
                await page.wait_for_timeout(5000)
                
                # Get all product links
                print("🔍 Discovering products...")
                links = await page.eval_on_selector_all('a[href*="/products/"]', '''
                    links => {
                        const unique = [];
                        const seen = new Set();
                        links.forEach(link => {
                            const href = link.href;
                            if (href.includes('/products/') && !seen.has(href)) {
                                seen.add(href);
                                unique.push({
                                    url: href,
                                    text: link.textContent?.trim() || ''
                                });
                            }
                        });
                        return unique;
                    }
                ''')
                
                print(f"   Found {len(links)} products")
                
                # Scrape each product
                products = []
                for i, link in enumerate(links[:30]):  # Limit to 30 for efficiency
                    try:
                        print(f"   📥 [{i+1}/30] Scraping...")
                        
                        await page.goto(link['url'])
                        await page.wait_for_timeout(3000)
                        
                        # Extract comprehensive data
                        data = await page.evaluate('''() => {
                            const title = document.querySelector('h1')?.textContent?.trim() || '';
                            const bodyText = document.body.innerText;
                            
                            // Find all prices
                            const priceMatches = bodyText.match(/Rp[\\s\\d.,]+/g) || [];
                            
                            // Find set info
                            const setMatch = bodyText.match(/Set:\\s*([^\\n]+)/i);
                            const setName = setMatch ? setMatch[1].trim() : '';
                            
                            // Find card number
                            const numberMatch = bodyText.match(/#?\\d{1,3}[/\\/]\\d{1,3}/);
                            const cardNumber = numberMatch ? numberMatch[0] : '';
                            
                            // Find seller info
                            const sellerMatch = bodyText.match(/(?:Penjual|Seller):\\s*([^\\n]+)/i);
                            const seller = sellerMatch ? sellerMatch[1].trim() : '';
                            
                            // Find condition
                            const conditionMatch = bodyText.match(/(?:Kondisi|Condition):\\s*([^\\n]+)/i);
                            const condition = conditionMatch ? conditionMatch[1].trim() : '';
                            
                            return {
                                title: title,
                                prices: priceMatches.slice(0, 3),
                                set_name: setName,
                                card_number: cardNumber,
                                seller: seller,
                                condition: condition,
                                url: window.location.href
                            };
                        }''')
                        
                        products.append(data)
                        
                        if data['prices']:
                            print(f"      ✅ {data['title'][:40]} - {data['prices'][0]}")
                        
                    except Exception as e:
                        print(f"      ❌ Error: {e}")
                
                # Save results
                with open(f"{self.output_dir}/cardtell_products.json", 'w', encoding='utf-8') as f:
                    json.dump({
                        "source": "Cardtell.id",
                        "scraped_at": datetime.now().isoformat(),
                        "total_products": len(products),
                        "products": products
                    }, f, indent=2, ensure_ascii=False)
                
                # Export CSV
                self._export_cardtell_csv(products)
                
                self.stats['cardtell_products'] = len(products)
                print(f"\n✅ Cardtell: {len(products)} products")
                
            except Exception as e:
                print(f"   ❌ Error: {e}")
            
            await page.close()
            await context.close()
            await browser.close()
        
        return products
    
    def _export_cardtell_csv(self, products: List[Dict]):
        """Export Cardtell data to CSV"""
        filename = f"{self.output_dir}/cardtell_prices.csv"
        
        with open(filename, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Name', 'Set', 'Card Number', 'Price 1', 'Price 2', 'Price 3',
                'Seller', 'Condition', 'URL'
            ])
            
            for prod in products:
                prices = prod.get('prices', ['', '', ''])
                writer.writerow([
                    prod.get('title', ''),
                    prod.get('set_name', ''),
                    prod.get('card_number', ''),
                    prices[0] if len(prices) > 0 else '',
                    prices[1] if len(prices) > 1 else '',
                    prices[2] if len(prices) > 2 else '',
                    prod.get('seller', ''),
                    prod.get('condition', ''),
                    prod.get('url', '')
                ])
        
        print(f"📄 Exported: {filename}")
    
    async def scrape_all(self):
        """Run all scrapers"""
        print("="*70)
        print("🚀 EFFICIENT PRICE SCRAPER")
        print("="*70)
        print(f"Started: {datetime.now().isoformat()}")
        
        await self.scrape_pokemontcg_popular_sets()
        await self.scrape_cardtell_comprehensive()
        
        # Summary
        print("\n" + "="*70)
        print("📊 FINAL STATISTICS")
        print("="*70)
        print(f"🎴 PokemonTCG.io: {self.stats['pokemontcg_sets']} sets, {self.stats['pokemontcg_cards']} cards")
        print(f"🇮🇩 Cardtell.id: {self.stats['cardtell_products']} products")
        print(f"\n💾 All data saved to: {self.output_dir}/")


async def main():
    scraper = EfficientPriceScraper()
    await scraper.scrape_all()


if __name__ == "__main__":
    asyncio.run(main())
