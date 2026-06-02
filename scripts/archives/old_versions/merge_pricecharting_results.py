#!/usr/bin/env python3
"""
Merge all PriceCharting batch results
"""

import json
import glob
import csv
from datetime import datetime


def merge_results():
    print("="*70)
    print("📊 MERGING PRICECHARTING RESULTS")
    print("="*70)
    
    # Find all batch files
    batch_files = sorted(glob.glob('pricecharting_batch_*.json'))
    
    if not batch_files:
        print("❌ No batch files found!")
        return
    
    print(f"Found {len(batch_files)} batch files")
    
    all_results = []
    
    for filename in batch_files:
        print(f"\n📁 Processing: {filename}")
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
                results = data.get('results', [])
                print(f"   - {len(results)} products")
                all_results.extend(results)
        except Exception as e:
            print(f"   - Error: {e}")
    
    print(f"\n{'='*70}")
    print(f"📊 STATISTICS")
    print(f"{'='*70}")
    print(f"Total products: {len(all_results)}")
    
    # Success stats
    success_count = len([r for r in all_results if r.get('prices')])
    print(f"Success: {success_count}/{len(all_results)} ({success_count/len(all_results)*100:.1f}%)")
    
    # Save merged JSON
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_file = f'pricecharting_merged_{timestamp}.json'
    
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump({
            'total_products': len(all_results),
            'success_count': success_count,
            'products': all_results,
            'merged_at': datetime.now().isoformat()
        }, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Saved JSON: {json_file}")
    
    # Save CSV
    csv_file = f'pricecharting_merged_{timestamp}.csv'
    
    with open(csv_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'cardtell_name', 'set_info', 'cardtell_prices',
            'ungraded', 'psa7', 'psa8', 'psa9', 'psa10',
            'pricecharting_url'
        ])
        writer.writeheader()
        
        for r in all_results:
            prices = r.get('prices', {}) or {}
            writer.writerow({
                'cardtell_name': r.get('cardtell_name'),
                'set_info': r.get('set_info'),
                'cardtell_prices': str(r.get('cardtell_prices', [])),
                'ungraded': prices.get('ungraded', ''),
                'psa7': prices.get('psa7', ''),
                'psa8': prices.get('psa8', ''),
                'psa9': prices.get('psa9', ''),
                'psa10': prices.get('psa10', ''),
                'pricecharting_url': r.get('pricecharting_url')
            })
    
    print(f"✅ Saved CSV: {csv_file}")
    print(f"{'='*70}")
    
    return all_results


if __name__ == "__main__":
    merge_results()
