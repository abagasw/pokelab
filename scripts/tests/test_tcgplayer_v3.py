#!/usr/bin/env python3
"""Test TCGplayer with domcontentloaded"""

import asyncio
from playwright.async_api import async_playwright


async def debug():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        url = "https://www.tcgplayer.com/search/all/product?q=Pikachu+ex&ProductTypeName=Cards"
        print(f"Opening: {url}")
        
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(5)
            
            print(f"Current URL: {page.url}")
            print(f"Title: {await page.title()}")
            
            content = await page.content()
            print(f"Content length: {len(content)}")
            
            # Check if blocked
            if "access denied" in content.lower() or "blocked" in content.lower():
                print("\n⚠️  BLOCKED!")
            
            # Look for product container
            products = await page.query_selector_all('section, article, .product, [class*="product"]')
            print(f"\nProduct containers: {len(products)}")
            
            # Get all text
            texts = await page.query_selector_all('h2, h3, h4, span, div')
            print(f"\nText elements: {len(texts)}")
            
            # Print some text content
            for elem in texts[:10]:
                text = await elem.text_content()
                if text and len(text.strip()) > 3:
                    print(f"  - {text.strip()[:60]}")
                    
        except Exception as e:
            print(f"Error: {e}")
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(debug())
