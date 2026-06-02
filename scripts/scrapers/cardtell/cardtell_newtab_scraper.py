#!/usr/bin/env python3
"""
Cardtell NewTab Scraper - Buka link di tab baru
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape dengan new tab approach"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL NEWTAB SCRAPER - {start_idx} to {start_idx + count - 1}")
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
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
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
                
                external_link = None
                platform = None
                
                # Buka halaman produk
                await page.goto(product_url, wait_until='networkidle', timeout=60000)
                await asyncio.sleep(2)
                
                # Dapatkan URL tombol Beli Sekarang via JS
                # Tapi buka di tab baru
                link_info = await page.evaluate('''() => {
                    const buttons = Array.from(document.querySelectorAll('button, a, span'));
                    for (const btn of buttons) {
                        if (btn.textContent.includes('Beli Sekarang') || 
                            btn.textContent.includes('Beli')) {
                            // Cari link terdekat
                            let el = btn;
                            while (el && el.tagName !== 'A') {
                                el = el.parentElement;
                            }
                            if (el && el.href) {
                                return { href: el.href, method: 'parent' };
                            }
                            // Cek onclick attribute
                            const onclick = btn.getAttribute('onclick');
                            if (onclick) {
                                const match = onclick.match(/window\.open\\(['"]([^'"]+)/);
                                if (match) return { href: match[1], method: 'onclick' };
                            }
                            // Cek data attributes
                            const dataUrl = btn.getAttribute('data-url') || 
                                          btn.getAttribute('data-href') ||
                                          btn.getAttribute('data-link');
                            if (dataUrl) return { href: dataUrl, method: 'data' };
                        }
                    }
                    return null;
                }''')
                
                if link_info and link_info.get('href'):
                    external_link = link_info['href']
                    platform = identify_platform(external_link)
                
                # Kalau tidak ketemu, coba klik dengan ctrl+click (buka tab baru)
                if not external_link:
                    try:
                        # Setup listener untuk tab baru
                        new_page_promise = context.wait_for_event('page', timeout=10000)
                        
                        # Klik tombol
                        await page.evaluate('''() => {
                            const buttons = Array.from(document.querySelectorAll('button, a, span'));
                            for (const btn of buttons) {
                                if (btn.textContent.includes('Beli Sekarang')) {
                                    // Simulasi ctrl+click
                                    const event = new MouseEvent('click', {
                                        ctrlKey: true,
                                        bubbles: true
                                    });
                                    btn.dispatchEvent(event);
                                    // Fallback: click biasa
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        }''')
                        
                        try:
                            new_page = await asyncio.wait_for(new_page_promise, timeout=8)
                            await new_page.wait_for_load_state('domcontentloaded', timeout=10000)
                            external_link = new_page.url
                            platform = identify_platform(external_link)
                            await new_page.close()
                        except asyncio.TimeoutError:
                            pass
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
    return 'Unknown'


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 cardtell_newtab_scraper.py <start_idx> <count>")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
