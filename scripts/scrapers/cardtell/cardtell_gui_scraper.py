#!/usr/bin/env python3
"""
Cardtell GUI Scraper - Jalan dengan browser terbuka (headless=False)
Jalankan ini di komputer lokal Anda, bukan di server.

Cara pakai:
  python3 cardtell_gui_scraper.py 0 50
  
Atau untuk jalanin semua:
  ./run_gui_batches.sh
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape dengan browser GUI terbuka"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL GUI SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk")
    print(f"⚠️  Browser akan terbuka, jangan ditutup!")
    print(f"{'='*70}\n")
    
    results = []
    
    async with async_playwright() as p:
        # Buka browser dengan GUI (headless=False)
        browser = await p.chromium.launch(
            headless=False,  # <-- Ini penting!
            args=['--disable-blink-features=AutomationControlled']
        )
        
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 720}
        )
        
        page = await context.new_page()
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ', flush=True)
                
                external_link = None
                platform = None
                
                # Buka halaman
                await page.goto(product_url, wait_until='networkidle', timeout=60000)
                await asyncio.sleep(2)
                
                # Klik tombol Beli Sekarang
                try:
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
                        
                        # Cek URL
                        current_url = page.url
                        
                        if 'cardtell.id' not in current_url:
                            external_link = current_url
                            platform = identify_platform(current_url)
                        
                        # Kembali ke halaman produk untuk item berikutnya
                        if i < start_idx + count:
                            await page.goto('about:blank')
                except:
                    pass
                
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
    filename = f'cardtell_gui_batch_{batch_num}_{timestamp}.json'
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump({
            'batch': batch_num,
            'start_index': start_idx,
            'count': len(results),
            'results': results,
            'scraped_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    success_count = len([r for r in results if r.get('external_link')])
    
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
        print("Usage: python3 cardtell_gui_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_gui_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
