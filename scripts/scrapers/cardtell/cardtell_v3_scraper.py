#!/usr/bin/env python3
"""
Cardtell V3 Scraper - Klik tombol + capture redirect
Versi yang lebih stabil dengan proper error handling
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape batch dengan klik tombol"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL V3 SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk")
    print(f"{'='*70}\n")
    
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ', flush=True)
                
                page = await context.new_page()
                
                # Track URL berubah
                original_url = product_url
                external_link = None
                platform = None
                
                # Buka halaman
                await page.goto(product_url, wait_until='networkidle', timeout=60000)
                await asyncio.sleep(3)
                
                # Klik tombol Beli Sekarang
                try:
                    # Cari tombol dengan berbagai selector
                    selectors = [
                        'button:has-text("Beli Sekarang")',
                        'a:has-text("Beli Sekarang")',
                        'span:has-text("Beli Sekarang")',
                        'button:has-text("Beli")',
                        '[class*="buy"]',
                    ]
                    
                    clicked = False
                    for selector in selectors:
                        try:
                            elem = await page.query_selector(selector)
                            if elem:
                                await elem.click(timeout=5000)
                                clicked = True
                                break
                        except:
                            continue
                    
                    if not clicked:
                        # Coba dengan JavaScript
                        clicked = await page.evaluate('''() => {
                            const buttons = Array.from(document.querySelectorAll('button, a, span'));
                            for (const btn of buttons) {
                                if (btn.textContent.includes('Beli Sekarang') || 
                                    btn.textContent.includes('Beli')) {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }''')
                    
                    if clicked:
                        # Tunggu redirect
                        await asyncio.sleep(4)
                        
                        # Cek URL saat ini
                        current_url = page.url
                        
                        # Kalau URL berubah dan bukan error page
                        if current_url != original_url and 'cardtell.id' not in current_url:
                            if not current_url.startswith('chrome-error'):
                                external_link = current_url
                                platform = identify_platform(external_link)
                        
                        # Kalau masih di cardtell, coba lagi setelah delay
                        if not external_link and 'cardtell.id' in current_url:
                            await asyncio.sleep(3)
                            current_url = page.url
                            if current_url != original_url and 'cardtell.id' not in current_url:
                                if not current_url.startswith('chrome-error'):
                                    external_link = current_url
                                    platform = identify_platform(external_link)
                
                except Exception as e:
                    pass
                
                await page.close()
                
                if external_link:
                    print(f"✅ {platform}")
                else:
                    print(f"❌ No link")
                    platform = 'none'
                
                results.append({
                    'id': product.get('id'),
                    'name': product_name,
                    'cardtell_url': product_url,
                    'external_link': external_link,
                    'platform': platform,
                    'set': product.get('set'),
                    'set_code': product.get('set_code'),
                    'card_number': product.get('card_number'),
                    'prices': product.get('prices', [])
                })
                
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"❌ Error: {str(e)[:40]}")
                results.append({
                    'id': product.get('id'),
                    'name': product.get('name', ''),
                    'cardtell_url': product.get('url', ''),
                    'external_link': None,
                    'platform': 'error',
                    'set': product.get('set'),
                    'set_code': product.get('set_code'),
                    'card_number': product.get('card_number'),
                    'prices': product.get('prices', [])
                })
        
        await context.close()
        await browser.close()
    
    # Simpan hasil
    batch_num = start_idx // count + 1
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f'cardtell_batch_{batch_num}_{timestamp}.json'
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump({
            'batch': batch_num,
            'start_index': start_idx,
            'count': len(results),
            'results': results,
            'scraped_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    success_count = len([r for r in results if r.get('external_link') and r.get('platform') != 'none'])
    
    print(f"\n{'='*70}")
    print(f"✅ Batch {batch_num} selesai!")
    print(f"📁 Saved: {filename}")
    print(f"📊 Success: {success_count}/{len(results)}")
    print(f"{'='*70}")
    
    return results


def identify_platform(url):
    if not url:
        return 'none'
    url_lower = url.lower()
    if 'tokopedia.com' in url_lower:
        return 'Tokopedia'
    elif 'shopee' in url_lower:
        return 'Shopee'
    elif 'facebook.com' in url_lower or 'fb.me' in url_lower:
        return 'Facebook'
    elif 'wa.me' in url_lower or 'whatsapp' in url_lower:
        return 'WhatsApp'
    elif 'instagram.com' in url_lower:
        return 'Instagram'
    return 'Unknown'


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 cardtell_v3_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_v3_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
