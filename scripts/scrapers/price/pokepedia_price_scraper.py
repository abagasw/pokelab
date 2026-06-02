#!/usr/bin/env python3
"""
Pokepedia Price Scraper
Menggabungkan data kartu dari Pokepedia dengan harga dari PokemonTCG.io API
"""

import json
import os
import asyncio
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from scrapling import Fetcher
from scrapling.fetchers import AsyncFetcher

# API Configuration
POKEMONTCG_API = "https://api.pokemontcg.io/v2"

# Set mapping: Pokepedia Code -> PokemonTCG.io Set ID
# Ini diperlukan karena kode set bisa berbeda antara kedua platform
SET_MAPPING = {
    # Scarlet & Violet Series
    "SV1S": "sv1",        # Scarlet ex
    "SV1V": "sv1",        # Violet ex
    "SV1a": "sv1",        # Triplet Beat
    "SV2P": "sv2",        # Snow Hazard
    "SV2D": "sv2",        # Clay Burst
    "SV2a": "sv3pt5",     # Pokemon 151
    "SV3s": "sv3",        # Obsidian Flames / Black Flame
    "SV4s": "sv4",        # Paradox Rift
    "SV4a": "sv4pt5",     # Paldean Fates
    "SV5s": "sv5",        # Temporal Forces
    "SV6s": "sv6",        # Twilight Masquerade
    "SV7s": "sv7",        # Stellar Crown
    "SV8s": "sv8",        # Surging Sparks
    "SV8a": "sv8pt5",     # Prismatic Evolutions
    "SV9s": "sv9",        # Journey Together
    "SV10s": "sv10",      # Destined Rivals
    "SV11s": "sv11",      # Black Bolt / White Flare
    
    # Sword & Shield Series (Pedang & Perisai)
    "SC1a": "swsh1",      # Sword & Shield
    "SC1b": "swsh2",      # Rebel Clash
    "SC1D": "swsh1",      # V Starter Deck
    "S-P": "swshp",       # SWSH Promos
    
    # Sun & Moon Series (Matahari & Bulan)
    "AS1a": "sm1",        # Sun & Moon
    "AS1b": "sm2",        # Guardians Rising
    "AS1D": "sm1",        # GX Starter Deck
    "SM-P": "smp",        # SM Promos
    
    # Evolusi Mega / Mega Evolution
    "MA1": "me1",         # Mega Evolution
    "MA2": "me2",         # Phantasmal Flames
    "MA3": "me2pt5",      # Ascended Heroes
    "MA4": "me3",         # Perfect Order
}


class PokepediaPriceScraper:
    """Scraper untuk menggabungkan data Pokepedia dengan harga"""
    
    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        self.fetcher = Fetcher()
        self.async_fetcher = AsyncFetcher()
        
        # Load existing Pokepedia data
        self.pokepedia_data = self._load_pokepedia_data()
        
        # Cache for PokemonTCG data
        self.tcg_cache = {}
        
    def _load_pokepedia_data(self) -> List[Dict]:
        """Load existing Pokepedia data"""
        all_data_path = f"{self.output_dir}/all_data.json"
        if os.path.exists(all_data_path):
            with open(all_data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('data', [])
        return []
    
    def get_card_price_from_tcg(self, set_id: str, card_number: str) -> Optional[Dict]:
        """Get price data from PokemonTCG.io API"""
        cache_key = f"{set_id}-{card_number}"
        
        if cache_key in self.tcg_cache:
            return self.tcg_cache[cache_key]
        
        try:
            # Try to fetch card by set and number
            url = f"{POKEMONTCG_API}/cards?q=set.id:{set_id} number:\"{card_number}\""
            response = self.fetcher.get(url)
            data = response.json()
            
            if data.get('data') and len(data['data']) > 0:
                card = data['data'][0]
                price_data = {
                    'tcgplayer': card.get('tcgplayer', {}),
                    'cardmarket': card.get('cardmarket', {}),
                    'fetched_at': datetime.now().isoformat()
                }
                self.tcg_cache[cache_key] = price_data
                return price_data
            
            return None
            
        except Exception as e:
            print(f"   ⚠️  Error fetching price: {e}")
            return None
    
    def extract_card_number(self, collector_number: str) -> str:
        """Extract clean card number from collector_number field"""
        # Handle formats like "001/123", "TG01/TG30", "SV1"
        if '/' in collector_number:
            return collector_number.split('/')[0].strip()
        return collector_number.strip()
    
    def convert_usd_to_idr(self, usd_price: float, exchange_rate: float = 16000) -> int:
        """Convert USD to IDR with markup for import/shipping"""
        # Base conversion
        idr_base = usd_price * exchange_rate
        # Add 25% for shipping/import/tax
        idr_with_markup = idr_base * 1.25
        return int(idr_with_markup)
    
    def enrich_expansion_with_prices(self, expansion_data: Dict, exchange_rate: float = 16000) -> Dict:
        """Add price data to expansion cards"""
        expansion = expansion_data.get('expansion', {})
        cards = expansion_data.get('cards', [])
        
        pokepedia_code = expansion.get('code', '')
        tcg_set_id = SET_MAPPING.get(pokepedia_code)
        
        if not tcg_set_id:
            print(f"   ⚠️  No mapping for set: {pokepedia_code}")
            return expansion_data
        
        print(f"   Mapping: {pokepedia_code} -> {tcg_set_id}")
        
        enriched_cards = []
        cards_with_price = 0
        total_usd_value = 0
        
        for card in cards:
            collector_number = card.get('collector_number', '')
            clean_number = self.extract_card_number(collector_number)
            
            # Get price data
            price_data = self.get_card_price_from_tcg(tcg_set_id, clean_number)
            
            if price_data:
                tcgplayer = price_data.get('tcgplayer', {})
                prices = tcgplayer.get('prices', {})
                
                # Extract market price from available variants
                usd_price = None
                if prices:
                    # Try to get market price from any variant
                    for variant, pdata in prices.items():
                        if isinstance(pdata, dict) and pdata.get('market'):
                            usd_price = pdata['market']
                            break
                
                if usd_price:
                    idr_estimate = self.convert_usd_to_idr(usd_price, exchange_rate)
                    card['price'] = {
                        'usd': {
                            'market': usd_price,
                            'currency': 'USD'
                        },
                        'idr_estimate': {
                            'value': idr_estimate,
                            'currency': 'IDR',
                            'exchange_rate': exchange_rate,
                            'note': 'Estimated with 25% import/shipping markup'
                        },
                        'source': 'PokemonTCG.io',
                        'fetched_at': price_data.get('fetched_at')
                    }
                    cards_with_price += 1
                    total_usd_value += usd_price
                else:
                    card['price'] = None
                
                card['tcgplayer_url'] = tcgplayer.get('url')
                card['cardmarket_url'] = price_data.get('cardmarket', {}).get('url')
            else:
                card['price'] = None
            
            enriched_cards.append(card)
        
        # Update expansion data
        expansion_data['cards'] = enriched_cards
        expansion_data['price_summary'] = {
            'total_cards': len(cards),
            'cards_with_price': cards_with_price,
            'coverage_percent': round((cards_with_price / len(cards) * 100), 2) if cards else 0,
            'total_usd_value': round(total_usd_value, 2),
            'exchange_rate': exchange_rate,
            'currency': 'USD'
        }
        
        return expansion_data
    
    def scrape_prices(self, exchange_rate: float = 16000):
        """Scrape prices for all expansions"""
        print("=" * 70)
        print("💰 POKEPEDIA PRICE SCRAPER")
        print("=" * 70)
        print(f"Exchange Rate: 1 USD = {exchange_rate:,} IDR")
        print()
        
        if not self.pokepedia_data:
            print("❌ No Pokepedia data found. Run pokepedia_scraper.py first!")
            return
        
        enriched_data = []
        total_value_usd = 0
        total_cards_with_price = 0
        
        for i, expansion_data in enumerate(self.pokepedia_data, 1):
            expansion = expansion_data.get('expansion', {})
            name = expansion.get('name_id', 'Unknown')
            code = expansion.get('code', '')
            
            print(f"[{i}/{len(self.pokepedia_data)}] 💳 {name} ({code})")
            
            enriched = self.enrich_expansion_with_prices(expansion_data, exchange_rate)
            enriched_data.append(enriched)
            
            summary = enriched.get('price_summary', {})
            cards_with_price = summary.get('cards_with_price', 0)
            total_usd = summary.get('total_usd_value', 0)
            coverage = summary.get('coverage_percent', 0)
            
            total_cards_with_price += cards_with_price
            total_value_usd += total_usd
            
            print(f"   ✅ {cards_with_price} cards with price ({coverage}% coverage)")
            print(f"   💵 Set value: ${total_usd:.2f}")
            
            # Save individual enriched expansion
            safe_name = name.replace(" ", "_").replace("/", "_")
            filename = f"{self.output_dir}/expansion_{code}_{safe_name}_with_prices.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(enriched, f, indent=2, ensure_ascii=False)
        
        # Save combined enriched data
        final_data = {
            'expansions_count': len(enriched_data),
            'total_cards_with_price': total_cards_with_price,
            'total_estimated_value_usd': round(total_value_usd, 2),
            'exchange_rate': exchange_rate,
            'scraped_at': datetime.now().isoformat(),
            'data': enriched_data
        }
        
        with open(f"{self.output_dir}/all_data_with_prices.json", 'w', encoding='utf-8') as f:
            json.dump(final_data, f, indent=2, ensure_ascii=False)
        
        print()
        print("=" * 70)
        print("🎉 PRICE SCRAPING COMPLETE!")
        print("=" * 70)
        print(f"   📊 Total cards with price: {total_cards_with_price}")
        print(f"   💰 Total estimated value: ${total_value_usd:,.2f} USD")
        print(f"   💱 In IDR (est.): Rp {self.convert_usd_to_idr(total_value_usd, exchange_rate):,}")
        print(f"   📁 Output: {self.output_dir}/")
        
        return final_data


class AsyncPokepediaPriceScraper(PokepediaPriceScraper):
    """Async version for faster price fetching"""
    
    def __init__(self, output_dir: str = "output", max_concurrent: int = 10):
        super().__init__(output_dir)
        self.max_concurrent = max_concurrent
    
    async def get_card_price_async(self, set_id: str, card_number: str) -> Optional[Dict]:
        """Async fetch card price"""
        cache_key = f"{set_id}-{card_number}"
        
        if cache_key in self.tcg_cache:
            return self.tcg_cache[cache_key]
        
        try:
            url = f"{POKEMONTCG_API}/cards?q=set.id:{set_id} number:\"{card_number}\""
            response = await self.async_fetcher.get(url)
            data = response.json()
            
            if data.get('data') and len(data['data']) > 0:
                card = data['data'][0]
                price_data = {
                    'tcgplayer': card.get('tcgplayer', {}),
                    'cardmarket': card.get('cardmarket', {}),
                    'fetched_at': datetime.now().isoformat()
                }
                self.tcg_cache[cache_key] = price_data
                return price_data
            
            return None
            
        except Exception as e:
            return None
    
    async def process_cards_batch(self, cards: List[Dict], set_id: str, exchange_rate: float) -> Tuple[List[Dict], int, float]:
        """Process a batch of cards concurrently"""
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def process_card(card):
            async with semaphore:
                collector_number = card.get('collector_number', '')
                clean_number = self.extract_card_number(collector_number)
                
                price_data = await self.get_card_price_async(set_id, clean_number)
                
                if price_data:
                    tcgplayer = price_data.get('tcgplayer', {})
                    prices = tcgplayer.get('prices', {})
                    
                    usd_price = None
                    if prices:
                        for variant, pdata in prices.items():
                            if isinstance(pdata, dict) and pdata.get('market'):
                                usd_price = pdata['market']
                                break
                    
                    if usd_price:
                        idr_estimate = self.convert_usd_to_idr(usd_price, exchange_rate)
                        card['price'] = {
                            'usd': {
                                'market': usd_price,
                                'currency': 'USD'
                            },
                            'idr_estimate': {
                                'value': idr_estimate,
                                'currency': 'IDR',
                                'exchange_rate': exchange_rate,
                                'note': 'Estimated with 25% import/shipping markup'
                            },
                            'source': 'PokemonTCG.io',
                            'fetched_at': price_data.get('fetched_at')
                        }
                        card['tcgplayer_url'] = tcgplayer.get('url')
                        card['cardmarket_url'] = price_data.get('cardmarket', {}).get('url')
                        return card, usd_price
                
                card['price'] = None
                return card, 0
        
        tasks = [process_card(card) for card in cards]
        results = await asyncio.gather(*tasks)
        
        enriched_cards = []
        total_value = 0
        cards_with_price = 0
        
        for card, value in results:
            enriched_cards.append(card)
            if value > 0:
                cards_with_price += 1
                total_value += value
        
        return enriched_cards, cards_with_price, total_value
    
    async def scrape_prices_async(self, exchange_rate: float = 16000):
        """Async scrape prices for all expansions"""
        print("=" * 70)
        print("💰 POKEPEDIA PRICE SCRAPER (ASYNC)")
        print("=" * 70)
        print(f"Exchange Rate: 1 USD = {exchange_rate:,} IDR")
        print(f"Max concurrent: {self.max_concurrent}")
        print()
        
        if not self.pokepedia_data:
            print("❌ No Pokepedia data found!")
            return
        
        enriched_data = []
        total_value_usd = 0
        total_cards_with_price = 0
        
        for i, expansion_data in enumerate(self.pokepedia_data, 1):
            expansion = expansion_data.get('expansion', {})
            name = expansion.get('name_id', 'Unknown')
            code = expansion.get('code', '')
            cards = expansion_data.get('cards', [])
            
            tcg_set_id = SET_MAPPING.get(code)
            if not tcg_set_id:
                print(f"[{i}/{len(self.pokepedia_data)}] ⚠️  {name} ({code}) - No mapping")
                enriched_data.append(expansion_data)
                continue
            
            print(f"[{i}/{len(self.pokepedia_data)}] 💳 {name} ({code}) -> {tcg_set_id} ({len(cards)} cards)")
            
            # Process cards in batches
            enriched_cards, cards_with_price, total_usd = await self.process_cards_batch(
                cards, tcg_set_id, exchange_rate
            )
            
            expansion_data['cards'] = enriched_cards
            expansion_data['price_summary'] = {
                'total_cards': len(cards),
                'cards_with_price': cards_with_price,
                'coverage_percent': round((cards_with_price / len(cards) * 100), 2) if cards else 0,
                'total_usd_value': round(total_usd, 2),
                'exchange_rate': exchange_rate,
                'currency': 'USD'
            }
            
            enriched_data.append(expansion_data)
            total_cards_with_price += cards_with_price
            total_value_usd += total_usd
            
            print(f"   ✅ {cards_with_price}/{len(cards)} with price ({expansion_data['price_summary']['coverage_percent']}%)")
            
            # Save individual file
            safe_name = name.replace(" ", "_").replace("/", "_")
            filename = f"{self.output_dir}/expansion_{code}_{safe_name}_with_prices.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(expansion_data, f, indent=2, ensure_ascii=False)
        
        # Save combined data
        final_data = {
            'expansions_count': len(enriched_data),
            'total_cards_with_price': total_cards_with_price,
            'total_estimated_value_usd': round(total_value_usd, 2),
            'exchange_rate': exchange_rate,
            'scraped_at': datetime.now().isoformat(),
            'data': enriched_data
        }
        
        with open(f"{self.output_dir}/all_data_with_prices.json", 'w', encoding='utf-8') as f:
            json.dump(final_data, f, indent=2, ensure_ascii=False)
        
        print()
        print("=" * 70)
        print("🎉 PRICE SCRAPING COMPLETE!")
        print("=" * 70)
        print(f"   📊 Total cards with price: {total_cards_with_price}")
        print(f"   💰 Total estimated value: ${total_value_usd:,.2f} USD")
        print(f"   💱 In IDR (est.): Rp {self.convert_usd_to_idr(total_value_usd, exchange_rate):,}")
        
        return final_data


def main():
    """Main entry point"""
    import sys
    
    use_async = "--async" in sys.argv
    exchange_rate = 16000  # Default IDR rate
    
    # Parse exchange rate
    for i, arg in enumerate(sys.argv):
        if arg == "--rate" and i + 1 < len(sys.argv):
            exchange_rate = float(sys.argv[i + 1])
    
    print("\n" + "=" * 70)
    print("💰 Pokepedia Price Scraper")
    print("=" * 70)
    
    if use_async:
        print("Mode: Async (faster)")
        scraper = AsyncPokepediaPriceScraper(max_concurrent=15)
        asyncio.run(scraper.scrape_prices_async(exchange_rate))
    else:
        print("Mode: Sync (default)")
        print("Use --async for faster processing")
        scraper = PokepediaPriceScraper()
        scraper.scrape_prices(exchange_rate)
    
    print("=" * 70 + "\n")


if __name__ == "__main__":
    main()
