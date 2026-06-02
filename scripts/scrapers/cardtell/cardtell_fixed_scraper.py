#!/usr/bin/env python3
"""
Cardtell Fixed Scraper - Intercept redirects properly
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape batch dengan proper redirect handling"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL FIXED SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    with open('cardtell_parsed.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data.get('products', [])
    batch = products[start_idx:start_idx + count]
    
    print(f"Total produk: {len(products)}")
    print(f"Batch ini: {len(batch)} produk")
    print(f"{'='*70}\n")
    
    results = []
    errors = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
            ]
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
                
                # Track navigation
                external_link = None
                platform = None
                
                # Setup handler untuk navigasi
                async def handle_navigate(nav_page):
                    nonlocal external_link, platform
                    try:
                        await nav_page.wait_for_load_state('domcontentloaded', timeout=10000)
                        url = nav_page.url
                        if 'cardtell.id' not in url and not url.startswith('chrome-error'):
                            external_link = url
                            platform = identify_platform(url)
                    except:
                        pass
                
                # Buka halaman produk
                await page.goto(product_url, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(3000)
                
                # METHOD 1: Scan semua link
                links = await page.query_selector_all('a[href*="tokopedia"], a[href*="shopee"], a[href*="facebook"], a[href*="wa.me"]')
                if links:
                    href = await links[0].get_attribute('href')
                    if href:
                        external_link = href
                        platform = identify_platform(href)
                
                # METHOD 2: Klik tombol dan intercept dengan popup
                if not external_link:
                    try:
                        # Cari dan klik tombol Beli Sekarang
                        buy_button = await page.query_selector('text=Beli Sekarang')
                        if not buy_button:
                            buy_button = await page.query_selector('button:has-text("Beli")')
                        
                        if buy_button:
                            # Tunggu popup/event
                            async with context.expect_page(timeout=10000) as new_page_info:
                                await buy_button.click()
                            
                            try:
                                new_page = await new_page_info.value
                                await new_page.wait_for_load_state('domcontentloaded', timeout=10000)
                                external_link = new_page.url
                                platform = identify_platform(external_link)
                                await new_page.close()
                            except:
                                pass
                    except:
                        pass
                
                # METHOD 3: Klik dan cek URL current page
                if not external_link:
                    try:
                        buy_button = await page.query_selector('text=Beli Sekarang')
                        if buy_button:
                            await buy_button.click()
                            await page.wait_for_timeout(4000)
                            
                            # Cek apakah URL berubah
                            current_url = page.url
                            if 'cardtell.id' not in current_url and not current_url.startswith('chrome-error'):
                                external_link = current_url
                                platform = identify_platform(external_link)
                    except:
                        pass
                
                # METHOD 4: Extract onclick/href via JS
                if not external_link:
                    try:
                        external_link = await page.evaluate('''() => {
                            const btn = document.querySelector('button:has-text("Beli Sekarang")') ||
                                       document.querySelector('a:has-text("Beli Sekarang")');
                            if (btn) {
                                return btn.href || btn.getAttribute('href') || 
                                       btn.dataset.url || btn.getAttribute('onclick');
                            }
                            // Cari di semua button/link
                            const all = document.querySelectorAll('button, a');
                            for (const el of all) {
                                if (el.textContent.includes('Beli')) {
                                    return el.href || el.getAttribute('href');
                                }
                            }
                            return null;
                        }''')
                        if external_link:
                            platform = identify_platform(external_link)
                    except:
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
                errors.append({'index': i, 'name': product.get('name'), 'error': str(e)})
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
            'errors': errors,
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
        print("Usage: python3 cardtell_fixed_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_fixed_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
