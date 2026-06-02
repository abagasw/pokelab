#!/usr/bin/env python3
"""
Complete Cardtell.id Scraper
Scrape all products with detailed information
"""

import json
import asyncio
import re
from datetime import datetime
from playwright.async_api import async_playwright
from typing import List, Dict, Optional


class CardtellCompleteScraper:
    """Scraper lengkap untuk Cardtell.id"""
    
    def __init__(self, output_dir: str = "cardtell_output"):
        self.output_dir = output_dir
        import os
        os.makedirs(output_dir, exist_ok=True)
        
        self.all_products = []
        self.stats = {
            "total_found": 0,
            "successfully_scraped": 0,
            "failed": 0
        }
    
    async def create_browser_context(self, browser):
        """Create browser context dengan settings optimal"""
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='id-ID',
            timezone_id='Asia/Jakarta',
        )
        return context
    
    async def get_all_product_links(self, page) -> List[Dict]:
        """Get all product links from homepage and subsequent pages"""
        print("🔍 Discovering all products...")
        
        all_links = []
        
        # Navigate to homepage
        try:
            await page.goto('https://cardtell.id/', wait_until='domcontentloaded', timeout=60000)
        except:
            # Try again with load
            await page.goto('https://cardtell.id/', wait_until='load', timeout=60000)
        await page.wait_for_timeout(8000)
        
        # Extract all product links
        links = await page.eval_on_selector_all('a[href*="/products/"]', '''
            links => {
                const unique = [];
                const seen = new Set();
                links.forEach(link => {
                    const href = link.href;
                    if (href.includes('/products/') && !seen.has(href)) {
                        seen.add(href);
                        unique.push({
                            url: href,
                            text: link.textContent?.trim()?.substring(0, 100) || ''
                        });
                    }
                });
                return unique;
            }
        ''')
        
        all_links.extend(links)
        
        # Try to find pagination or load more
        print(f"   Found {len(all_links)} products on homepage")
        
        # Try to click "Load More" or scroll to get more products
        for scroll_attempt in range(3):
            try:
                print(f"   Scrolling to load more... ({scroll_attempt + 1}/3)")
                
                # Scroll down
                await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await page.wait_for_timeout(3000)
                
                # Get new links
                new_links = await page.eval_on_selector_all('a[href*="/products/"]', '''
                    links => {
                        const unique = [];
                        const seen = new Set();
                        links.forEach(link => {
                            const href = link.href;
                            if (href.includes('/products/') && !seen.has(href)) {
                                seen.add(href);
                                unique.push({
                                    url: href,
                                    text: link.textContent?.trim()?.substring(0, 100) || ''
                                });
                            }
                        });
                        return unique;
                    }
                ''')
                
                # Add new unique links
                existing_urls = {l['url'] for l in all_links}
                new_unique = [l for l in new_links if l['url'] not in existing_urls]
                
                if new_unique:
                    print(f"   Found {len(new_unique)} new products")
                    all_links.extend(new_unique)
                else:
                    break
                    
            except Exception as e:
                print(f"   ⚠️  Scroll error: {e}")
                break
        
        self.stats['total_found'] = len(all_links)
        print(f"\n   ✅ Total unique products: {len(all_links)}")
        
        return all_links
    
    async def scrape_product_detail(self, page, url: str) -> Optional[Dict]:
        """Scrape detail produk dari URL"""
        try:
            await page.goto(url, wait_until='domcontentloaded')
            await page.wait_for_timeout(4000)
            
            # Extract all data using JavaScript
            data = await page.evaluate('''() => {
                const result = {
                    url: window.location.href,
                    title: '',
                    set_name: '',
                    card_number: '',
                    prices: [],
                    seller: '',
                    condition: '',
                    category: '',
                    description: '',
                    bid_info: {},
                    images: []
                };
                
                // Title - try multiple selectors
                const titleSelectors = ['h1', '[class*="title"]', '[class*="name"]', 'h2'];
                for (let sel of titleSelectors) {
                    const el = document.querySelector(sel);
                    if (el && el.textContent.trim()) {
                        result.title = el.textContent.trim();
                        break;
                    }
                }
                
                // Get all text content
                const bodyText = document.body.innerText;
                
                // Find prices - comprehensive search
                const priceMatches = bodyText.match(/Rp[\\s\\d.,]+/g);
                if (priceMatches) {
                    result.prices = [...new Set(priceMatches)].slice(0, 5);
                }
                
                // Find set information
                const setPatterns = [
                    /Set:\\s*([^\\n]+)/i,
                    /Set Name:\\s*([^\\n]+)/i,
                    /Expansion:\\s*([^\\n]+)/i,
                    /from\s+([A-Za-z0-9\s&]+(?:set|expansion)?)/i
                ];
                
                for (let pattern of setPatterns) {
                    const match = bodyText.match(pattern);
                    if (match) {
                        result.set_name = match[1].trim();
                        break;
                    }
                }
                
                // Find card number
                const numberMatch = bodyText.match(/#?(\\d{1,3})[/\\/](\\d{1,3})/);
                if (numberMatch) {
                    result.card_number = numberMatch[0];
                }
                
                // Find seller info
                const sellerPatterns = [
                    /(?:Penjual|Seller|Store):\\s*([^\\n]+)/i,
                    /oleh\s+([^\\n]+)/i,
                    /dari\s+([^\\n]+)/i
                ];
                
                for (let pattern of sellerPatterns) {
                    const match = bodyText.match(pattern);
                    if (match) {
                        result.seller = match[1].trim();
                        break;
                    }
                }
                
                // Find condition
                const conditionPatterns = [
                    /(?:Kondisi|Condition):\\s*([^\\n]+)/i,
                    /(Near Mint|NM|Mint|Excellent|Good|Played|Damaged)/i
                ];
                
                for (let pattern of conditionPatterns) {
                    const match = bodyText.match(pattern);
                    if (match) {
                        result.condition = match[1].trim();
                        break;
                    }
                }
                
                // Find bid/auction info
                const bidPatterns = [
                    /(?:Bid Tertinggi|Highest Bid):\\s*([Rp\\s\\d.,]+)/i,
                    /(?:Bid Saat Ini|Current Bid):\\s*([Rp\\s\\d.,]+)/i,
                    /(?:Buy Now|Beli Sekarang):\\s*([Rp\\s\\d.,]+)/i
                ];
                
                for (let pattern of bidPatterns) {
                    const match = bodyText.match(pattern);
                    if (match) {
                        result.bid_info.highest = match[1].trim();
                        break;
                    }
                }
                
                // Find time remaining
                const timeMatch = bodyText.match(/(?:Sisa Waktu|Time Left):\\s*([^\\n]+)/i);
                if (timeMatch) {
                    result.bid_info.time_remaining = timeMatch[1].trim();
                }
                
                // Get images
                const imgElements = document.querySelectorAll('img[src*="card"], img[src*="product"], img[alt*="pokemon"]');
                result.images = Array.from(imgElements).slice(0, 5).map(img => img.src);
                
                return result;
            }''')
            
            return data
            
        except Exception as e:
            print(f"   ❌ Error scraping {url}: {e}")
            return None
    
    async def scrape_all_products(self, max_products: int = 100):
        """Scrape semua produk"""
        print("="*70)
        print("🇮🇩 CARDTELL.ID - COMPLETE SCRAPER")
        print("="*70)
        print(f"Max products to scrape: {max_products}")
        print()
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await self.create_browser_context(browser)
            page = await context.new_page()
            
            try:
                # Step 1: Get all product links
                product_links = await self.get_all_product_links(page)
                
                if not product_links:
                    print("❌ No products found!")
                    await context.close()
                    await browser.close()
                    return
                
                # Step 2: Scrape each product
                print("\n" + "="*70)
                print("📥 SCRAPING PRODUCT DETAILS")
                print("="*70)
                
                for i, product in enumerate(product_links[:max_products], 1):
                    try:
                        print(f"\n[{i}/{min(len(product_links), max_products)}] {product['url'][:60]}...")
                        
                        data = await self.scrape_product_detail(page, product['url'])
                        
                        if data and data.get('title'):
                            self.all_products.append(data)
                            self.stats['successfully_scraped'] += 1
                            
                            # Print summary
                            print(f"   ✅ {data['title'][:50]}")
                            if data.get('prices'):
                                print(f"   💰 {', '.join(data['prices'][:2])}")
                            if data.get('set_name'):
                                print(f"   📦 Set: {data['set_name']}")
                        else:
                            self.stats['failed'] += 1
                            print(f"   ⚠️  No data extracted")
                        
                    except Exception as e:
                        self.stats['failed'] += 1
                        print(f"   ❌ Error: {e}")
                
                await context.close()
                await browser.close()
                
            except Exception as e:
                print(f"\n❌ Fatal error: {e}")
                import traceback
                traceback.print_exc()
                await context.close()
                await browser.close()
        
        # Save results
        self._save_results()
    
    def _save_results(self):
        """Save all results to files"""
        print("\n" + "="*70)
        print("💾 SAVING RESULTS")
        print("="*70)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save JSON
        json_file = f"{self.output_dir}/cardtell_complete_{timestamp}.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump({
                "source": "Cardtell.id",
                "scraped_at": datetime.now().isoformat(),
                "stats": self.stats,
                "total_products": len(self.all_products),
                "products": self.all_products
            }, f, indent=2, ensure_ascii=False)
        
        print(f"✅ JSON saved: {json_file}")
        
        # Save CSV
        csv_file = f"{self.output_dir}/cardtell_complete_{timestamp}.csv"
        import csv
        
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'Name', 'Set', 'Card Number', 'Price 1', 'Price 2', 'Price 3',
                'Seller', 'Condition', 'Time Remaining', 'URL'
            ])
            
            for prod in self.all_products:
                prices = prod.get('prices', ['', '', ''])
                bid_info = prod.get('bid_info', {})
                
                writer.writerow([
                    prod.get('title', ''),
                    prod.get('set_name', ''),
                    prod.get('card_number', ''),
                    prices[0] if len(prices) > 0 else '',
                    prices[1] if len(prices) > 1 else '',
                    prices[2] if len(prices) > 2 else '',
                    prod.get('seller', ''),
                    prod.get('condition', ''),
                    bid_info.get('time_remaining', ''),
                    prod.get('url', '')
                ])
        
        print(f"✅ CSV saved: {csv_file}")
        
        # Print statistics
        print("\n" + "="*70)
        print("📊 STATISTICS")
        print("="*70)
        print(f"Total found: {self.stats['total_found']}")
        print(f"Successfully scraped: {self.stats['successfully_scraped']}")
        print(f"Failed: {self.stats['failed']}")
        
        if self.all_products:
            # Price analysis
            prices = []
            for prod in self.all_products:
                for price_str in prod.get('prices', []):
                    try:
                        # Extract number from Rp string
                        price_num = int(re.sub(r'[^\d]', '', price_str))
                        if price_num > 0:
                            prices.append(price_num)
                    except:
                        pass
            
            if prices:
                print(f"\n💰 Price Statistics:")
                print(f"   Lowest: Rp {min(prices):,}")
                print(f"   Highest: Rp {max(prices):,}")
                print(f"   Average: Rp {sum(prices)//len(prices):,}")


async def main():
    scraper = CardtellCompleteScraper()
    await scraper.scrape_all_products(max_products=100)


if __name__ == "__main__":
    asyncio.run(main())
