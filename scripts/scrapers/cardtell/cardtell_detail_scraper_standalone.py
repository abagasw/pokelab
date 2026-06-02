#!/usr/bin/env python3
"""
Cardtell Detail Page Scraper - STANDALONE
Scrape halaman detail produk untuk mendapatkan link eksternal (Tokopedia, FB, WA)

CARA PENGGUNAAN:
1. Simpan file ini
2. Install dependencies: pip install playwright beautifulsoup4
3. Install browser: playwright install chromium
4. Jalankan: python3 cardtell_detail_scraper_standalone.py

Proses akan memakan waktu ~1-2 jam untuk 679 produk
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_detail_pages(batch_size=50, batch_number=1):
    """
    Scrape halaman detail produk Cardtell
    
    Args:
        batch_size: Jumlah produk per batch (default 50)
        batch_number: Batch ke-berapa yang akan diproses (1, 2, 3, ...)
    """
    
    print("="*70)
    print("🚀 CARDTELL DETAIL PAGE SCRAPER - STANDALONE")
    print("="*70)
    print()
    
    # Load data produk
    try:
        with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("❌ Error: File 'cardtell_parsed.json' tidak ditemukan!")
        print("   Pastikan file ini ada di directory yang sama.")
        return
    
    products = data.get('products', [])
    total_products = len(products)
    
    print(f"📊 Total produk: {total_products}")
    print(f"📦 Batch size: {batch_size}")
    print(f"🔢 Batch number: {batch_number}")
    
    # Hitung range produk untuk batch ini
    start_index = (batch_number - 1) * batch_size
    end_index = min(start_index + batch_size, total_products)
    
    if start_index >= total_products:
        print(f"\n⚠️  Batch {batch_number} kosong (start_index {start_index} >= total {total_products})")
        return
    
    batch_products = products[start_index:end_index]
    
    print(f"\n📋 Produk yang akan diproses: {start_index + 1} - {end_index}")
    print(f"   Jumlah: {len(batch_products)}")
    print()
    
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,  # Ganti ke False jika ingin lihat browser
            args=['--disable-blink-features=AutomationControlled']
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        
        page = await context.new_page()
        
        # Proses setiap produk
        for i, product in enumerate(batch_products, start=start_index + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{end_index}] {product_name[:50]}")
                print(f"    URL: {product_url[:60]}...")
                
                # Buka halaman detail
                try:
                    await page.goto(product_url, wait_until='domcontentloaded', timeout=30000)
                    await page.wait_for_timeout(3000)
                except Exception as e:
                    print(f"    ⚠️  Timeout/Error loading page: {e}")
                    results.append({
                        'name': product_name,
                        'cardtell_url': product_url,
                        'external_link': None,
                        'platform': 'error_load',
                        'error': str(e)
                    })
                    continue
                
                # Cari tombol "Beli Sekarang" atau "Hubungi Penjual"
                external_link = None
                platform = None
                
                # Daftar selector yang akan dicoba
                selectors = [
                    'a:has-text("Beli Sekarang")',
                    'button:has-text("Beli Sekarang")',
                    'a:has-text("Hubungi Penjual")',
                    'button:has-text("Hubungi Penjual")',
                    'a:has-text("Chat Penjual")',
                    'button:has-text("Chat Penjual")',
                    'a[href*="tokopedia"]',
                    'a[href*="facebook"]',
                    'a[href*="wa.me"]',
                    'a[href*="whatsapp"]',
                    'a[href*="shopee"]',
                    '[class*="buy"]:not([class*="sub"])',
                    '[class*="contact"]',
                    '[class*="chat"]',
                ]
                
                for selector in selectors:
                    try:
                        element = await page.query_selector(selector)
                        if element:
                            # Cek apakah ini link (a tag)
                            tag_name = await element.evaluate('el => el.tagName.toLowerCase()')
                            
                            if tag_name == 'a':
                                href = await element.get_attribute('href')
                                if href and not href.startswith('javascript:'):
                                    external_link = href
                                    platform = identify_platform(href)
                                    print(f"    ✅ Found link: {href[:80]}...")
                                    print(f"    🌐 Platform: {platform}")
                                    break
                            else:
                                # Klik dan tunggu popup/navigasi
                                print(f"    🖱️  Clicking element: {selector}")
                                
                                # Setup listener untuk popup
                                popup_future = asyncio.create_task(
                                    page.wait_for_event('popup', timeout=5000)
                                )
                                
                                await element.click()
                                await page.wait_for_timeout(2000)
                                
                                # Cek apakah ada popup
                                try:
                                    popup = await asyncio.wait_for(popup_future, timeout=3)
                                    external_link = popup.url
                                    platform = identify_platform(external_link)
                                    await popup.close()
                                    print(f"    ✅ Popup: {external_link[:80]}...")
                                    print(f"    🌐 Platform: {platform}")
                                    break
                                except asyncio.TimeoutError:
                                    pass
                                
                                # Cek apakah URL berubah
                                current_url = page.url
                                if current_url != product_url and 'cardtell.id' not in current_url:
                                    external_link = current_url
                                    platform = identify_platform(external_link)
                                    print(f"    ✅ Navigated: {external_link[:80]}...")
                                    print(f"    🌐 Platform: {platform}")
                                    # Kembali ke halaman produk
                                    await page.goto(product_url, wait_until='domcontentloaded')
                                    break
                    
                    except Exception as e:
                        continue
                
                if not external_link:
                    # Coba cari dengan JavaScript - semua link yang mengandung kata kunci
                    print(f"    🔍 Searching with JavaScript...")
                    
                    js_links = await page.evaluate('''() => {
                        const links = [];
                        const keywords = ['tokopedia', 'facebook', 'whatsapp', 'shopee', 'bukalapak', 'instagram'];
                        
                        document.querySelectorAll('a').forEach(a => {
                            const href = a.href.toLowerCase();
                            const text = a.textContent.toLowerCase();
                            
                            // Cek apakah link mengandung keyword
                            for (let kw of keywords) {
                                if (href.includes(kw) || text.includes(kw)) {
                                    links.push({
                                        href: a.href,
                                        text: a.textContent.trim(),
                                        keyword: kw
                                    });
                                    break;
                                }
                            }
                        });
                        
                        return links;
                    }''')
                    
                    if js_links:
                        # Ambil link pertama yang ditemukan
                        link = js_links[0]
                        external_link = link['href']
                        platform = identify_platform(external_link)
                        print(f"    ✅ JS found: {external_link[:80]}...")
                        print(f"    🌐 Platform: {platform}")
                    else:
                        print(f"    ⚠️  No external link found")
                        platform = 'none'
                
                # Simpan hasil
                result = {
                    'name': product_name,
                    'cardtell_url': product_url,
                    'external_link': external_link,
                    'platform': platform,
                    'prices': product.get('prices', []),
                    'set_info': product.get('set_info', ''),
                    'seller': product.get('seller', ''),
                    'badge': product.get('badge', '')
                }
                
                results.append(result)
                
                # Progress indicator
                if i % 10 == 0:
                    print(f"    📊 Progress: {i}/{end_index} ({(i-start_index)/(end_index-start_index)*100:.1f}%)")
                
                # Delay untuk menghindari rate limiting
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"    ❌ Error: {e}")
                results.append({
                    'name': product.get('name', ''),
                    'cardtell_url': product_url,
                    'external_link': None,
                    'platform': 'error',
                    'error': str(e)
                })
                await asyncio.sleep(2)
        
        await context.close()
        await browser.close()
    
    # Simpan hasil
    save_batch_results(results, batch_number, start_index + 1, end_index)
    
    print("\n" + "="*70)
    print("✅ BATCH SELESAI!")
    print("="*70)


def identify_platform(url: str) -> str:
    """Identifikasi platform dari URL"""
    url_lower = url.lower()
    
    if 'tokopedia.com' in url_lower:
        return 'Tokopedia'
    elif 'facebook.com' in url_lower or 'fb.com' in url_lower or 'fb.me' in url_lower or 'm.me' in url_lower:
        return 'Facebook'
    elif 'wa.me' in url_lower or 'whatsapp.com' in url_lower or 'api.whatsapp' in url_lower:
        return 'WhatsApp'
    elif 'instagram.com' in url_lower or 'ig.me' in url_lower:
        return 'Instagram'
    elif 'shopee.co.id' in url_lower or 'shopee' in url_lower:
        return 'Shopee'
    elif 'bukalapak.com' in url_lower:
        return 'Bukalapak'
    elif 'telegram.me' in url_lower or 't.me' in url_lower:
        return 'Telegram'
    elif 'twitter.com' in url_lower or 'x.com' in url_lower:
        return 'Twitter/X'
    elif 'tiktok.com' in url_lower:
        return 'TikTok'
    elif 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'YouTube'
    elif 'cardtell.id' in url_lower:
        return 'Cardtell Internal'
    else:
        return 'Unknown'


def save_batch_results(results, batch_number, start_idx, end_idx):
    """Simpan hasil batch"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # JSON
    output = {
        'source': 'Cardtell.id - Detail Page Scraper',
        'scraped_at': datetime.now().isoformat(),
        'batch_number': batch_number,
        'range': f'{start_idx}-{end_idx}',
        'total_in_batch': len(results),
        'results': results
    }
    
    json_file = f'cardtell_detail_batch_{batch_number}_{timestamp}.json'
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\n💾 JSON: {json_file}")
    
    # CSV
    import csv
    csv_file = f'cardtell_detail_batch_{batch_number}_{timestamp}.csv'
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['Name', 'Set Info', 'Prices', 'Platform', 'External Link', 'Seller', 'Cardtell URL'])
        
        for r in results:
            writer.writerow([
                r.get('name', ''),
                r.get('set_info', ''),
                ', '.join(r.get('prices', [])),
                r.get('platform', ''),
                r.get('external_link', ''),
                r.get('seller', ''),
                r.get('cardtell_url', '')
            ])
    
    print(f"📄 CSV: {csv_file}")
    
    # Statistik
    platforms = {}
    for r in results:
        platform = r.get('platform', 'Unknown')
        platforms[platform] = platforms.get(platform, 0) + 1
    
    print(f"\n📊 Statistik Batch {batch_number}:")
    for platform, count in sorted(platforms.items(), key=lambda x: x[1], reverse=True):
        print(f"   {platform}: {count}")


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    
    # Parse arguments
    batch_size = 50  # Default
    batch_number = 1  # Default
    
    if len(sys.argv) > 1:
        try:
            batch_number = int(sys.argv[1])
        except ValueError:
            print("Usage: python3 cardtell_detail_scraper_standalone.py [batch_number] [batch_size]")
            print("Example: python3 cardtell_detail_scraper_standalone.py 1 50")
            sys.exit(1)
    
    if len(sys.argv) > 2:
        try:
            batch_size = int(sys.argv[2])
        except ValueError:
            pass
    
    # Run scraper
    asyncio.run(scrape_detail_pages(batch_size=batch_size, batch_number=batch_number))
    
    print("\n" + "="*70)
    print("📋 UNTUK MENJALANKAN BATCH BERIKUTNYA:")
    print("="*70)
    print(f"   python3 cardtell_detail_scraper_standalone.py {batch_number + 1} {batch_size}")
    print()
    print("Atau jalankan semua batch secara otomatis dengan script runner:")
    print("   for i in {{1..14}}; do")
    print(f"       python3 cardtell_detail_scraper_standalone.py $i {batch_size}")
    print("       sleep 5")
    print("   done")
