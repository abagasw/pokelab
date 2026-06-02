#!/usr/bin/env python3
"""
Pokepedia.id Scraper
Menggunakan Scrapling untuk scraping data kartu Pokemon
API: https://www.pokepedia.id/expansions
"""

import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from scrapling import Fetcher
from scrapling.fetchers import AsyncFetcher
import asyncio

# API Configuration
SUPABASE_URL = "https://tlauakxyrxpwnwgdywum.supabase.co/rest/v1"
API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsYXVha3h5cnhwd253Z2R5d3VtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4OTg2NzIsImV4cCI6MjA4ODQ3NDY3Mn0.cmXJnlBcDNzzJQyd1FPbKaveYlzWgAfGJ_2EijZkr4Q"

HEADERS = {
    "Accept": "application/json",
    "apikey": API_KEY,
    "Authorization": f"Bearer {API_KEY}",
    "Origin": "https://www.pokepedia.id",
    "Referer": "https://www.pokepedia.id/"
}


class PokepediaScraper:
    """Scraper untuk Pokepedia.id"""
    
    def __init__(self, output_dir: str = "output"):
        self.output_dir = output_dir
        self.fetcher = Fetcher()
        os.makedirs(output_dir, exist_ok=True)
        
    def _api_get(self, endpoint: str, params: str = "") -> List[Dict]:
        """Make API request to Supabase"""
        url = f"{SUPABASE_URL}/{endpoint}"
        if params:
            url = f"{url}?{params}"
        
        response = self.fetcher.get(url, headers=HEADERS)
        return response.json()
    
    def get_all_expansions(self) -> List[Dict]:
        """Get all expansions/sets"""
        print("📦 Mengambil daftar semua ekspansi...")
        expansions = self._api_get(
            "expansions",
            "select=*,series:series_id(name_id,name_en)&order=released_at.desc"
        )
        print(f"✅ Ditemukan {len(expansions)} ekspansi")
        return expansions
    
    def get_cards_by_expansion(self, expansion_code: str) -> List[Dict]:
        """Get all cards for a specific expansion"""
        cards = self._api_get(
            "cards",
            f"select=*&expansion_code=eq.{expansion_code}&order=collector_number.asc"
        )
        return cards
    
    def get_card_details(self, card_id: int) -> Optional[Dict]:
        """Get detailed information for a specific card"""
        cards = self._api_get(
            "cards",
            f"select=*&id=eq.{card_id}"
        )
        return cards[0] if cards else None
    
    def scrape_all(self):
        """Scrape all expansions and their cards"""
        # Get all expansions
        expansions = self.get_all_expansions()
        
        # Save expansions list
        with open(f"{self.output_dir}/expansions.json", "w", encoding="utf-8") as f:
            json.dump(expansions, f, indent=2, ensure_ascii=False)
        print(f"💾 Daftar ekspansi disimpan ke: {self.output_dir}/expansions.json")
        
        # Process each expansion
        all_data = []
        total_cards = 0
        
        for i, expansion in enumerate(expansions, 1):
            code = expansion.get("code")
            name = expansion.get("name_id", "Unknown")
            total_exp_cards = expansion.get("total_cards", 0)
            
            print(f"\n[{i}/{len(expansions)}] 🔍 Mengambil kartu dari: {name} ({code})")
            
            # Get cards for this expansion
            cards = self.get_cards_by_expansion(code)
            
            if cards:
                print(f"   ✅ Ditemukan {len(cards)} kartu")
                total_cards += len(cards)
                
                # Save individual expansion data
                expansion_data = {
                    "expansion": expansion,
                    "cards": cards,
                    "scraped_at": datetime.now().isoformat()
                }
                
                # Save to individual file
                safe_name = name.replace(" ", "_").replace("/", "_")
                filename = f"{self.output_dir}/expansion_{code}_{safe_name}.json"
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(expansion_data, f, indent=2, ensure_ascii=False)
                
                all_data.append(expansion_data)
            else:
                print(f"   ⚠️  Tidak ada kartu ditemukan")
        
        # Save all data combined
        with open(f"{self.output_dir}/all_data.json", "w", encoding="utf-8") as f:
            json.dump({
                "expansions_count": len(expansions),
                "total_cards": total_cards,
                "scraped_at": datetime.now().isoformat(),
                "data": all_data
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎉 Scraping selesai!")
        print(f"   📊 Total Ekspansi: {len(expansions)}")
        print(f"   🃏 Total Kartu: {total_cards}")
        print(f"   📁 Output direktori: {self.output_dir}/")
        
        return all_data


class AsyncPokepediaScraper(PokepediaScraper):
    """Async version of the scraper for faster scraping"""
    
    def __init__(self, output_dir: str = "output", max_concurrent: int = 5):
        super().__init__(output_dir)
        self.max_concurrent = max_concurrent
        self.async_fetcher = AsyncFetcher()
    
    async def _async_api_get(self, endpoint: str, params: str = "") -> List[Dict]:
        """Async API request"""
        url = f"{SUPABASE_URL}/{endpoint}"
        if params:
            url = f"{url}?{params}"
        
        response = await self.async_fetcher.get(url, headers=HEADERS)
        return response.json()
    
    async def get_cards_by_expansion_async(self, expansion_code: str) -> List[Dict]:
        """Async get cards"""
        return await self._async_api_get(
            "cards",
            f"select=*&expansion_code=eq.{expansion_code}&order=collector_number.asc"
        )
    
    async def scrape_expansion(self, expansion: Dict) -> Optional[Dict]:
        """Scrape a single expansion"""
        code = expansion.get("code")
        name = expansion.get("name_id", "Unknown")
        
        cards = await self.get_cards_by_expansion_async(code)
        
        if cards:
            return {
                "expansion": expansion,
                "cards": cards,
                "scraped_at": datetime.now().isoformat()
            }
        return None
    
    async def scrape_all_async(self):
        """Async scrape all expansions"""
        expansions = self.get_all_expansions()
        
        with open(f"{self.output_dir}/expansions.json", "w", encoding="utf-8") as f:
            json.dump(expansions, f, indent=2, ensure_ascii=False)
        
        print(f"\n🚀 Memulai async scraping dengan {self.max_concurrent} worker...")
        
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def scrape_with_limit(expansion, index):
            async with semaphore:
                code = expansion.get("code")
                name = expansion.get("name_id", "Unknown")
                print(f"[{index}/{len(expansions)}] 🔍 {name} ({code})")
                
                result = await self.scrape_expansion(expansion)
                
                if result:
                    safe_name = name.replace(" ", "_").replace("/", "_")
                    filename = f"{self.output_dir}/expansion_{code}_{safe_name}.json"
                    with open(filename, "w", encoding="utf-8") as f:
                        json.dump(result, f, indent=2, ensure_ascii=False)
                    print(f"   ✅ {len(result['cards'])} kartu")
                else:
                    print(f"   ⚠️  Tidak ada kartu")
                
                return result
        
        tasks = [
            scrape_with_limit(exp, i+1) 
            for i, exp in enumerate(expansions)
        ]
        
        results = await asyncio.gather(*tasks)
        
        # Filter out None results and calculate totals
        valid_results = [r for r in results if r]
        total_cards = sum(len(r["cards"]) for r in valid_results)
        
        with open(f"{self.output_dir}/all_data.json", "w", encoding="utf-8") as f:
            json.dump({
                "expansions_count": len(expansions),
                "total_cards": total_cards,
                "scraped_at": datetime.now().isoformat(),
                "data": valid_results
            }, f, indent=2, ensure_ascii=False)
        
        print(f"\n🎉 Async scraping selesai!")
        print(f"   📊 Total Ekspansi: {len(expansions)}")
        print(f"   🃏 Total Kartu: {total_cards}")
        print(f"   📁 Output direktori: {self.output_dir}/")
        
        return valid_results


def main():
    """Main entry point"""
    import sys
    
    # Check for async flag
    use_async = "--async" in sys.argv
    output_dir = "output"
    
    # Check for custom output dir
    for i, arg in enumerate(sys.argv):
        if arg == "--output" and i + 1 < len(sys.argv):
            output_dir = sys.argv[i + 1]
    
    print("=" * 60)
    print("🎴 Pokepedia.id Scraper")
    print("=" * 60)
    
    if use_async:
        print("Mode: Async (cepat)")
        scraper = AsyncPokepediaScraper(output_dir=output_dir)
        asyncio.run(scraper.scrape_all_async())
    else:
        print("Mode: Sync (default)")
        print("Gunakan --async untuk mode cepat")
        scraper = PokepediaScraper(output_dir=output_dir)
        scraper.scrape_all()
    
    print("=" * 60)


if __name__ == "__main__":
    main()
