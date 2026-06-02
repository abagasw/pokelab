#!/usr/bin/env python3
"""
Cardtell Scraper dengan Infinite Scroll
Scroll ke bawah untuk memuat semua produk
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


class CardtellScrollScraper:
    """Scraper Cardtell dengan infinite scroll"""
    
    def __init__(self, output_dir: str = "cardtell_output"):
        self.output_dir = output_dir
        import os
        os.makedirs(output_dir, exist_ok=True)
        self.products = []
    
    async def scroll_and_load(self, page, max_scrolls: int = 50):
        """Scroll ke bawah untuk memuat semua produk"""
        print(f"\n📜 Scrolling untuk memuat produk (max {max_scrolls} scrolls)...")
        
        last_height = await page.evaluate('document.body.scrollHeight')
        scroll_count = 0
        all_links = []
        
        while scroll_count < max_scrolls:
            # Scroll ke bawah
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            await page.wait_for_timeout(2000)  # Tunggu konten load
            
            # Cek produk yang sudah terload
            links = await page.eval_on_selector_all('a[href*="/products/"]', '''
                links => links.map(link => ({
                    url: link.href,
                    text: link.textContent?.trim()?.substring(0, 100) || ''
                }))
            ''')
            
            # Tambahkan link baru
            current_urls = {p['url'] for p in all_links}
            new_links = [l for l in links if l['url'] not in current_urls]
            
            if new_links:
                all_links.extend(new_links)
                print(f"   Scroll {scroll_count + 1}: +{len(new_links)} produk (total: {len(all_links)})")
            
            # Cek apakah sudah sampai bawah
            new_height = await page.evaluate('document.body.scrollHeight')
            if new_height == last_height:
                # Coba scroll lagi untuk konfirmasi
                await page.wait_for_timeout(3000)
                new_height = await page.evaluate('document.body.scrollHeight')
                if new_height == last_height:
                    print(f"   ✅ Sudah sampai bawah setelah {scroll_count + 1} scrolls")
                    break
            
            last_height = new_height
            scroll_count += 1
        
        print(f"\n📊 Total produk ditemukan: {len(all_links)}")
        return all_links
    
    async def scrape_product_detail(self, page, url: str) -> dict:
        """Scrape detail produk"""
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await page.wait_for_timeout(3000)
            
            # Scroll dalam halaman produk untuk load harga
            for _ in range(3):
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await page.wait_for_timeout(1000)
            
            # Ambil semua data
            data = await page.evaluate('''() => {
                const result = {
                    title: '',
                    prices: [],
                    set_name: '',
                    card_number: '',
                    seller: '',
                    condition: '',
                    bid_info: {},
                    all_text: document.body.innerText.substring(0, 2000)
                };
                
                // Title
                const h1 = document.querySelector('h1');
                if (h1) result.title = h1.textContent.trim();
                
                // Cari semua elemen yang mengandung Rp
                const allElements = document.querySelectorAll('*');
                for (let el of allElements) {
                    const text = el.textContent;
                    if (text.includes('Rp') && text.match(/Rp[\s\d.,]+/)) {
                        const match = text.match(/Rp[\s\d.,]+/g);
                        if (match) {
                            result.prices.push(...match);
                        }
                    }
                }
                
                // Hapus duplikat
                result.prices = [...new Set(result.prices)].slice(0, 5);
                
                return result;
            }''')
            
            # Extract info dari text
            text = data.get('all_text', '')
            
            # Cari set name
            set_match = re.search(r'(Evolusi Mega|Ledakan Peniada|Kobaran Biru|Impian EX|Pedang & Perisai|Scarlet|Violet)[^\n]{0,50}', text)
            set_name = set_match.group(0) if set_match else ''
            
            # Cari card number
            number_match = re.search(r'(\d{1,3})[/\\/](\d{1,3})', text)
            card_number = number_match.group(0) if number_match else ''
            
            return {
                'title': data.get('title', ''),
                'prices': data.get('prices', []),
                'set_name': set_name,
                'card_number': card_number,
                'url': url
            }
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {'title': '', 'prices': [], 'url': url}
    
    async def scrape_all(self, max_products: int = 200):
        """Scrape semua produk dengan scroll"""
        print("="*70)
        print("🇮🇩 CARDTELL.ID - INFINITE SCROLL SCRAPER")
        print("="*70)
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                locale='id-ID'
            )
            page = await context.new_page()
            
            try:
                # Buka homepage
                print("\n📥 Membuka Cardtell.id...")
                await page.goto('https://cardtell.id/', wait_until='domcontentloaded')
                await page.wait_for_timeout(5000)
                
                # Scroll untuk memuat semua produk
                product_links = await self.scroll_and_load(page, max_scrolls=50)
                
                if not product_links:
                    print("❌ Tidak ada produk ditemukan!")
                    await context.close()
                    await browser.close()
                    return
                
                # Batasi jumlah produk
                product_links = product_links[:max_products]
                
                # Scrape detail setiap produk
                print("\n" + "="*70)
                print("📥 SCRAPING DETAIL PRODUK")
                print("="*70)
                
                for i, prod in enumerate(product_links, 1):
                    print(f"\n[{i}/{len(product_links)}] {prod['url'][:50]}...")
                    
                    data = await self.scrape_product_detail(page, prod['url'])
                    
                    if data['title']:
                        self.products.append(data)
                        print(f"   ✅ {data['title'][:50]}")
                        if data['prices']:
                            print(f"   💰 {', '.join(data['prices'][:2])}")
                    else:
                        print(f"   ⚠️  Tidak ada data")
                
                await context.close()
                await browser.close()
                
            except Exception as e:
                print(f"\n❌ Fatal error: {e}")
                import traceback
                traceback.print_exc()
                await context.close()
                await browser.close()
        
        # Simpan hasil
        self._save_results()
    
    def _save_results(self):
        """Simpan hasil scraping"""
        print("\n" + "="*70)
        print("💾 MENYIMPAN HASIL")
        print("="*70)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Simpan JSON
        json_file = f"{self.output_dir}/cardtell_scroll_{timestamp}.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump({
                "source": "Cardtell.id",
                "scraped_at": datetime.now().isoformat(),
                "total_products": len(self.products),
                "products": self.products
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✅ JSON: {json_file}")
        
        # Simpan CSV
        import csv
        csv_file = f"{self.output_dir}/cardtell_scroll_{timestamp}.csv"
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['Name', 'Set', 'Card Number', 'Price 1', 'Price 2', 'Price 3', 'URL'])
            for prod in self.products:
                prices = prod.get('prices', ['', '', ''])
                writer.writerow([
                    prod.get('title', ''),
                    prod.get('set_name', ''),
                    prod.get('card_number', ''),
                    prices[0] if len(prices) > 0 else '',
                    prices[1] if len(prices) > 1 else '',
                    prices[2] if len(prices) > 2 else '',
                    prod.get('url', '')
                ])
        
        print(f"✅ CSV: {csv_file}")
        
        # Statistik
        print("\n" + "="*70)
        print("📊 STATISTIK")
        print("="*70)
        print(f"Total produk: {len(self.products)}")
        
        # Analisis harga
        if self.products:
            all_prices = []
            for prod in self.products:
                for price_str in prod.get('prices', []):
                    try:
                        # Ekstrak angka dari string harga
                        clean = re.sub(r'[^\d]', '', price_str)
                        if clean:
                            all_prices.append(int(clean))
                    except:
                        pass
            
            if all_prices:
                print(f"\n💰 Statistik Harga:")
                print(f"   Termurah: Rp {min(all_prices):,}")
                print(f"   Termahal: Rp {max(all_prices):,}")
                print(f"   Rata-rata: Rp {sum(all_prices)//len(all_prices):,}")


async def main():
    scraper = CardtellScrollScraper()
    await scraper.scrape_all(max_products=150)


if __name__ == "__main__":
    asyncio.run(main())
