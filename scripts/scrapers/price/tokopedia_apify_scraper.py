#!/usr/bin/env python3
"""
Tokopedia Scraper using Apify API
Using residential proxies to bypass anti-bot protection
"""

import json
import os
from datetime import datetime

from apify_client import ApifyClient


class TokopediaApifyScraper:
    """Scraper untuk Tokopedia menggunakan Apify"""

    def __init__(self, api_token: str, output_dir: str = "tokopedia_output"):
        self.client = ApifyClient(api_token)
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)

    def scrape_pokemon_cards(self, max_items: int = 10000):
        """
        Scrape kartu Pokemon dari Tokopedia

        Args:
            max_items: Jumlah maksimum produk yang akan di-scrape
        """
        print("=" * 70)
        print("🛍️  TOKOPEDIA SCRAPER - Using Apify API")
        print("=" * 70)
        print(f"Max items: {max_items}")
        print()

        # Prepare search URLs for Pokemon cards
        search_urls = [
            "https://www.tokopedia.com/search?st=product&q=pokemon%20card",
            "https://www.tokopedia.com/search?st=product&q=kartu%20pokemon",
            "https://www.tokopedia.com/search?st=product&q=pokemon%20tcg",
            "https://www.tokopedia.com/search?st=product&q=charizard%20card",
            "https://www.tokopedia.com/search?st=product&q=pikachu%20card",
        ]

        # Actor input configuration
        run_input = {
            "searchUrls": search_urls[:3],  # Use first 3 search URLs
            "maxItems": max_items,
            "proxyConfiguration": {
                "useApifyProxy": True,
                "apifyProxyGroups": ["RESIDENTIAL"],
                "apifyProxyCountry": "ID",  # Indonesia
            },
        }

        print("🚀 Starting Apify Actor...")
        print(f"   Actor ID: jMJRVlTt8SsWqtkuD")
        print(f"   Search queries: {len(run_input['searchUrls'])}")
        print(f"   Using RESIDENTIAL proxy from Indonesia")
        print()

        try:
            # Run the Actor
            run = self.client.actor("jMJRVlTt8SsWqtkuD").call(run_input=run_input)

            print(f"✅ Actor run completed!")
            print(f"   Run ID: {run['id']}")
            print(f"   Status: {run['status']}")
            print()

            # Fetch results from dataset
            print("📥 Fetching results from dataset...")

            items = []
            dataset_id = run["defaultDatasetId"]

            for item in self.client.dataset(dataset_id).iterate_items():
                items.append(item)

                # Print progress
                if len(items) % 10 == 0:
                    print(f"   Fetched {len(items)} items...")

            print(f"\n✅ Total items fetched: {len(items)}")

            # Process and save results
            processed_items = self._process_items(items)
            self._save_results(processed_items, run)

            return processed_items

        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback

            traceback.print_exc()
            return []

    def _process_items(self, items: list) -> list:
        """Process raw items into clean format"""
        print("\n🔍 Processing items...")

        processed = []

        for item in items:
            try:
                # Extract relevant fields
                processed_item = {
                    "name": item.get("name", ""),
                    "url": item.get("url", ""),
                    "price": item.get("price", ""),
                    "original_price": item.get("originalPrice", ""),
                    "discount": item.get("discount", ""),
                    "shop_name": item.get("shopName", ""),
                    "shop_location": item.get("shopLocation", ""),
                    "rating": item.get("rating", ""),
                    "sold_count": item.get("sold", ""),
                    "image_url": item.get("imageUrl", ""),
                    "category": item.get("category", ""),
                }

                # Only include items related to Pokemon
                name_lower = processed_item["name"].lower()
                category_lower = processed_item["category"].lower()

                if any(
                    x in name_lower or x in category_lower
                    for x in [
                        "pokemon",
                        "kartu",
                        "card",
                        "tcg",
                        "charizard",
                        "pikachu",
                        "blastoise",
                        "venusaur",
                    ]
                ):
                    processed.append(processed_item)

            except Exception as e:
                print(f"   ⚠️  Error processing item: {e}")
                continue

        print(f"   ✅ Processed {len(processed)} Pokemon-related items")
        return processed

    def _save_results(self, items: list, run_info: dict):
        """Save results to files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save as JSON
        json_filename = f"{self.output_dir}/tokopedia_pokemon_{timestamp}.json"

        output_data = {
            "source": "Tokopedia via Apify",
            "scraped_at": datetime.now().isoformat(),
            "apify_run_id": run_info.get("id"),
            "apify_status": run_info.get("status"),
            "total_items": len(items),
            "items": items,
        }

        with open(json_filename, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"\n💾 JSON saved: {json_filename}")

        # Save as CSV
        csv_filename = f"{self.output_dir}/tokopedia_pokemon_{timestamp}.csv"

        import csv

        with open(csv_filename, "w", newline="", encoding="utf-8") as f:
            if items:
                writer = csv.DictWriter(f, fieldnames=items[0].keys())
                writer.writeheader()
                writer.writerows(items)

        print(f"📄 CSV saved: {csv_filename}")

        # Print summary
        print("\n" + "=" * 70)
        print("📊 SUMMARY")
        print("=" * 70)
        print(f"Total items: {len(items)}")

        if items:
            # Calculate price statistics
            prices = []
            for item in items:
                try:
                    price_str = (
                        item.get("price", "")
                        .replace("Rp", "")
                        .replace(".", "")
                        .replace(",", "")
                        .strip()
                    )
                    if price_str:
                        prices.append(int(price_str))
                except:
                    pass

            if prices:
                print(f"Price range: Rp {min(prices):,} - Rp {max(prices):,}")
                print(f"Average price: Rp {sum(prices) // len(prices):,}")

    def scrape_with_multiple_searches(self, searches: list, items_per_search: int = 50):
        """
        Scrape dengan multiple search terms

        Args:
            searches: List of search keywords
            items_per_search: Items to scrape per search term
        """
        all_items = []

        for search_term in searches:
            print(f"\n{'=' * 70}")
            print(f"🔍 Searching: {search_term}")
            print(f"{'=' * 70}")

            # Build search URL
            from urllib.parse import quote

            search_url = (
                f"https://www.tokopedia.com/search?st=product&q={quote(search_term)}"
            )

            run_input = {
                "searchUrls": [search_url],
                "maxItems": items_per_search,
                "proxyConfiguration": {
                    "useApifyProxy": True,
                    "apifyProxyGroups": ["RESIDENTIAL"],
                    "apifyProxyCountry": "ID",
                },
            }

            try:
                run = self.client.actor("jMJRVlTt8SsWqtkuD").call(run_input=run_input)

                items = []
                for item in self.client.dataset(
                    run["defaultDatasetId"]
                ).iterate_items():
                    items.append(item)

                processed = self._process_items(items)
                all_items.extend(processed)

                print(f"   ✅ Got {len(processed)} items for '{search_term}'")

            except Exception as e:
                print(f"   ❌ Error: {e}")

        # Save combined results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        with open(
            f"{self.output_dir}/tokopedia_combined_{timestamp}.json",
            "w",
            encoding="utf-8",
        ) as f:
            json.dump(
                {
                    "source": "Tokopedia via Apify",
                    "scraped_at": datetime.now().isoformat(),
                    "total_items": len(all_items),
                    "items": all_items,
                },
                f,
                indent=2,
                ensure_ascii=False,
            )

        print(f"\n💾 Combined results saved!")
        print(f"   Total items across all searches: {len(all_items)}")

        return all_items


def main():
    """Main function"""
    # API Token from environment or placeholder
    API_TOKEN = os.getenv("APIFY_API_TOKEN", "YOUR_API_TOKEN_HERE")
    
    if API_TOKEN == "YOUR_API_TOKEN_HERE":
        print("❌ Error: APIFY_API_TOKEN environment variable not set")
        print("Please set your API token: export APIFY_API_TOKEN=your_token")
        return

    print("🚀 Tokopedia Pokemon Card Scraper")
    print("Using Apify with Residential Proxies")
    print()

    # Initialize scraper
    scraper = TokopediaApifyScraper(API_TOKEN)

    # Option 1: Single search with multiple URLs
    print("Option 1: Single run with multiple search URLs")
    items = scraper.scrape_pokemon_cards(max_items=10000)

    # Option 2: Multiple searches (uncomment to use)
    # print("\n" + "="*70)
    # print("Option 2: Multiple targeted searches")
    # searches = [
    #     "pokemon card",
    #     "kartu pokemon",
    #     "charizard",
    #     "pikachu card",
    #     "pokemon tcg"
    # ]
    # items = scraper.scrape_with_multiple_searches(searches, items_per_search=30)

    print("\n✅ Scraping completed!")


if __name__ == "__main__":
    main()
