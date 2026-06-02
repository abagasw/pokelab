#!/usr/bin/env python3
"""
Cardtell Scraper dengan Wait untuk Dynamic Load
Menunggu produk load setelah scroll
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_cardtell():
    print("="*70)
    print("🇮🇩 CARDTELL.ID - WAIT & SCROLL SCRAPER")
    print("="*70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            locale='id-ID'
        )
        page = await context.new_page()
        
        products = []
        
        try:
            # Buka homepage dengan timeout lebih lama
            print("\n📥 Membuka Cardtell.id...")
            await page.goto('https://cardtell.id/', wait_until='load', timeout=60000)
            
            # Tunggu produk muncul
            print("⏳ Menunggu produk dimuat...")
            await page.wait_for_timeout(8000)
            
            # Cek apakah ada produk
            initial_links = await page.query_selector_all('a[href*="/products/"]')
            print(f"   Produk awal: {len(initial_links)}")
            
            # Scroll perlahan untuk trigger lazy load
            print("\n📜 Scrolling...")
            for i in range(10):
                await page.evaluate('window.scrollBy(0, 500)')
                await page.wait_for_timeout(1500)
                
                links = await page.query_selector_all('a[href*="/products/"]')
                print(f"   Scroll {i+1}: {len(links)} produk")
            
            # Ambil semua link produk unik
            print("\n🔍 Mengumpulkan link produk...")
            links = await page.query_selector_all('a[href*="/products/"]')
            
            unique_urls = []
            seen = set()
            for link in links:
                href = await link.get_attribute('href')
                if href and href not in seen:
                    seen.add(href)
                    text = await link.text_content()
                    unique_urls.append({'url': href, 'text': text[:100] if text else ''})
            
            print(f"   Total unique: {len(unique_urls)}")
            
            # Scrape setiap produk
            if unique_urls:
                print("\n" + "="*70)
                print("📥 SCRAPING DETAIL PRODUK")
                print("="*70)
                
                for i, prod in enumerate(unique_urls[:30], 1):
                    try:
                        full_url = f"https://cardtell.id{prod['url']}" if prod['url'].startswith('/') else prod['url']
                        print(f"\n[{i}/{len(unique_urls)}] {full_url[:50]}...")
                        
                        await page.goto(full_url, wait_until='load', timeout=30000)
                        await page.wait_for_timeout(4000)
                        
                        # Scroll dalam halaman
                        for _ in range(3):
                            await page.evaluate('window.scrollBy(0, 300)')
                            await page.wait_for_timeout(1000)
                        
                        # Ambil data
                        title = await page.title()
                        title = title.replace(' — CARDTELL', '')
                        
                        # Ambil harga dari elemen
                        price_elems = await page.query_selector_all('text=/Rp\\s*[\\d.,]+/')
                        prices = []
                        for elem in price_elems[:5]:
                            text = await elem.text_content()
                            if text and 'Rp' in text:
                                match = re.search(r'Rp[\s\d.,]+', text)
                                if match:
                                    prices.append(match.group())
                        
                        # Hapus duplikat
                        prices = list(dict.fromkeys(prices))
                        
                        product_data = {
                            'title': title,
                            'prices': prices,
                            'url': full_url
                        }
                        
                        products.append(product_data)
                        
                        if prices:
                            print(f"   ✅ {title[:50]}")
                            print(f"   💰 {', '.join(prices[:2])}")
                        else:
                            print(f"   📄 {title[:50]} (no price)")
                        
                    except Exception as e:
                        print(f"   ❌ Error: {e}")
            
        except Exception as e:
            print(f"\n❌ Fatal error: {e}")
            import traceback
            traceback.print_exc()
        
        await context.close()
        await browser.close()
    
    # Simpan hasil
    import os
    os.makedirs("cardtell_output", exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # JSON
    json_file = f"cardtell_output/cardtell_wait_{timestamp}.json"
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            "source": "Cardtell.id",
            "scraped_at": datetime.now().isoformat(),
            "total": len(products),
            "products": products
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 Saved: {json_file}")
    print(f"Total products: {len(products)}")
    
    # Print sample
    if products:
        print("\n📋 Sample:")
        for p in products[:5]:
            print(f"  • {p['title'][:50]}")
            if p['prices']:
                print(f"    💰 {p['prices'][0]}")


if __name__ == "__main__":
    asyncio.run(scrape_cardtell())
