#!/usr/bin/env python3
"""
Cardtell Stealth Scraper - Anti-detection
"""

import json
import asyncio
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_batch(start_idx: int, count: int):
    """Scrape batch dengan stealth mode"""
    
    print(f"\n{'='*70}")
    print(f"🚀 CARDTELL STEALTH SCRAPER - {start_idx} to {start_idx + count - 1}")
    print(f"{'='*70}")
    
    # Load data
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
        # Launch dengan stealth args
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-site-isolation-trials',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--window-size=1920,1080',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            ]
        )
        
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='id-ID',
            timezone_id='Asia/Jakarta',
            permissions=['geolocation'],
            geolocation={'latitude': -6.2088, 'longitude': 106.8456}
        )
        
        # Inject stealth script
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['id-ID', 'id', 'en-US', 'en']
            });
            window.chrome = { runtime: {} };
        """)
        
        page = await context.new_page()
        
        for i, product in enumerate(batch, start_idx + 1):
            try:
                product_url = product.get('url', '')
                product_name = product.get('name', '')
                
                print(f"[{i}/{len(products)}] {product_name[:45]}...", end=' ')
                
                # Buka halaman
                await page.goto(product_url, wait_until='domcontentloaded', timeout=60000)
                await page.wait_for_timeout(4000)
                
                external_link = None
                platform = None
                
                # METHOD 1: Cari semua link di halaman via JS
                links = await page.evaluate('''() => {
                    const allLinks = [];
                    document.querySelectorAll('a').forEach(a => {
                        if (a.href) {
                            allLinks.push({
                                href: a.href,
                                text: a.textContent.trim(),
                                outerHTML: a.outerHTML.substring(0, 200)
                            });
                        }
                    });
                    return allLinks;
                }''')
                
                # Cari link marketplace
                for link in links:
                    href = link['href'].lower()
                    if 'tokopedia.com' in href:
                        external_link = link['href']
                        platform = 'Tokopedia'
                        break
                    elif 'shopee' in href:
                        external_link = link['href']
                        platform = 'Shopee'
                        break
                    elif 'facebook.com' in href or 'fb.me' in href:
                        external_link = link['href']
                        platform = 'Facebook'
                        break
                    elif 'wa.me' in href or 'whatsapp' in href:
                        external_link = link['href']
                        platform = 'WhatsApp'
                        break
                
                # METHOD 2: Klik tombol "Beli Sekarang"
                if not external_link:
                    clicked = await page.evaluate('''() => {
                        const buttons = Array.from(document.querySelectorAll('button, a, span'));
                        const buyBtn = buttons.find(el => 
                            el.textContent.includes('Beli Sekarang') ||
                            el.textContent.includes('Beli') ||
                            el.textContent.includes('Buy Now')
                        );
                        if (buyBtn) {
                            // Simpan href jika ada
                            const href = buyBtn.href || buyBtn.closest('a')?.href;
                            buyBtn.click();
                            return { clicked: true, href: href };
                        }
                        return { clicked: false };
                    }''')
                    
                    if clicked.get('clicked'):
                        await page.wait_for_timeout(4000)
                        
                        # Cek URL setelah klik
                        current_url = page.url
                        if 'cardtell.id' not in current_url:
                            external_link = current_url
                            platform = identify_platform(external_link)
                        elif clicked.get('href'):
                            external_link = clicked['href']
                            platform = identify_platform(external_link)
                        else:
                            # Cek lagi semua link setelah klik
                            links_after = await page.evaluate('''() => {
                                const allLinks = [];
                                document.querySelectorAll('a').forEach(a => {
                                    if (a.href && (
                                        a.href.includes('tokopedia') ||
                                        a.href.includes('shopee') ||
                                        a.href.includes('facebook') ||
                                        a.href.includes('wa.me')
                                    )) {
                                        allLinks.push(a.href);
                                    }
                                });
                                return allLinks;
                            }''')
                            if links_after:
                                external_link = links_after[0]
                                platform = identify_platform(external_link)
                        
                        # Kembali ke halaman produk
                        await page.goto(product_url, wait_until='domcontentloaded')
                
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
        print("Usage: python3 cardtell_stealth_scraper.py <start_idx> <count>")
        print("Example: python3 cardtell_stealth_scraper.py 0 50")
        sys.exit(1)
    
    start_idx = int(sys.argv[1])
    count = int(sys.argv[2])
    
    asyncio.run(scrape_batch(start_idx, count))
