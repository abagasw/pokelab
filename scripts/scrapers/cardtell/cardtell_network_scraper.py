#!/usr/bin/env python3
"""
Cardtell Network Scraper - Intercept network requests
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape dengan intercept network"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL NETWORK SCRAPER - {start_idx} to {start_idx + count - 1}")
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
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ', flush=True)
                
                context = await browser.new_context()
                page = await context.new_page()
                
                # Track external URLs
                external_urls = []
                
                # Intercept navigation
                page.on('framenavigated', lambda frame: asyncio.create_task(
                    capture_nav(frame, external_urls)
                ))
                
                # Intercept requests
                def handle_route(route, request):
                    url = request.url
                    if any(x in url.lower() for x in ['tokopedia', 'shopee', 'facebook', 'wa.me']):
                        external_urls.append(url)
                    route.continue_()
                
                await page.route('**/*', handle_route)
                
                # Buka halaman
                await page.goto(product_url, wait_until='networkidle', timeout=60000)
                await asyncio.sleep(2)
                
                # Klik tombol
                await page.evaluate('''() => {
                    const buttons = Array.from(document.querySelectorAll('button, a, span'));
                    for (const btn of buttons) {
                        if (btn.textContent.includes('Beli Sekarang')) {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                }''')
                
                await asyncio.sleep(5)
                
                # Cek URL saat ini juga
                current_url = page.url
                if 'cardtell.id' not in current_url and not current_url.startswith('chrome'):
                    external_urls.append(current_url)
                
                await context.close()
                
                # Pilih URL terbaik
                external_link = None
                platform = 'none'
                
                for url in external_urls:
                    if url and not url.startswith('chrome'):
                        external_link = url
                        platform = identify_platform(url)
                        break
                
                if external_link:
                    print(f"✅ {platform}")
                else:
                    print(f"❌ No link")
                
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


async def capture_nav(frame, urls):
    """Capture navigation URL"""
    url = frame.url
    if url and any(x in url.lower() for x in ['tokopedia', 'shopee', 'facebook', 'wa.me']):
        if url not in urls:
            urls.append(url)


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
    return 'Unknown'


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 cardtell_network_scraper.py <start_idx> <count>")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
