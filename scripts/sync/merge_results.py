#!/usr/bin/env python3
"""
Merge all batch results into single file
"""

import json
import glob
from datetime import datetime
import csv


def merge_results():
    print("="*70)
    print("📊 MERGING BATCH RESULTS")
    print("="*70)
    
    # Find all batch files
    batch_files = sorted(glob.glob('cardtell_batch_*.json'))
    print(f"Found {len(batch_files)} batch files")
    
    all_results = []
    platform_stats = {}
    
    for filename in batch_files:
        print(f"\n📁 Processing: {filename}")
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
            results = data.get('results', [])
            print(f"   - {len(results)} products")
            all_results.extend(results)
    
    print(f"\n{'='*70}")
    print(f"📊 STATISTICS")
    print(f"{'='*70}")
    print(f"Total products: {len(all_results)}")
    
    # Platform stats
    for r in all_results:
        platform = r.get('platform', 'none')
        platform_stats[platform] = platform_stats.get(platform, 0) + 1
    
    print(f"\nPlatform distribution:")
    for platform, count in sorted(platform_stats.items(), key=lambda x: -x[1]):
        pct = count / len(all_results) * 100
        print(f"  - {platform}: {count} ({pct:.1f}%)")
    
    # Save merged JSON
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_file = f'cardtell_external_links_{timestamp}.json'
    
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            'total_products': len(all_results),
            'platform_stats': platform_stats,
            'products': all_results,
            'merged_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Saved JSON: {json_file}")
    
    # Save CSV
    csv_file = f'cardtell_external_links_{timestamp}.csv'
    
    with open(csv_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'id', 'name', 'set', 'set_code', 'card_number', 'prices',
            'platform', 'external_link', 'cardtell_url'
        ])
        writer.writeheader()
        
        for r in all_results:
            writer.writerow({
                'id': r.get('id'),
                'name': r.get('name'),
                'set': r.get('set'),
                'set_code': r.get('set_code'),
                'card_number': r.get('card_number'),
                'prices': str(r.get('prices', [])),
                'platform': r.get('platform'),
                'external_link': r.get('external_link'),
                'cardtell_url': r.get('cardtell_url')
            })
    
    print(f"✅ Saved CSV: {csv_file}")
    print(f"{'='*70}")
    
    return all_results


if __name__ == "__main__":
    merge_results()
