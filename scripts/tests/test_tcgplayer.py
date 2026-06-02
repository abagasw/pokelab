#!/usr/bin/env python3
"""Debug TCGplayer structure"""

import asyncio
from playwright.async_api import async_playwright


async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Test search
        url = "https://www.tcgplayer.com/search/all/product?q=Pikachu+ex&ProductTypeName=Cards"
        print(f"Opening: {url}")
        
        await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        await asyncio.sleep(5)
        
        print(f"Current URL: {page.url}")
        
        # Check content
        content = await page.content()
        print(f"Content length: {len(content)}")
        
        # Check for product links
        links = await page.query_selector_all('a')
        print(f"\nTotal links: {len(links)}")
        
        product_links = []
        for link in links[:20]:
            href = await link.get_attribute('href')
            text = await link.text_content()
            if href and '/product/' in href:
                product_links.append((text[:50], href))
        
        print(f"\nProduct links found: {len(product_links)}")
        for text, href in product_links[:5]:
            print(f"  - {text}: {href}")
        
        # Check for prices
        prices = await page.query_selector_all('text=/\\$/')
        print(f"\nPrice elements: {len(prices)}")
        for p_elem in prices[:5]:
            text = await p_elem.text_content()
            print(f"  - {text}")
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(debug())
