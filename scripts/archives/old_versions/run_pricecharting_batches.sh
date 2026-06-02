#!/bin/bash

# Run all batches for PriceCharting scraping
# 679 products / 50 per batch = 14 batches

echo "=========================================="
echo "🚀 PRICECHARTING BATCH SCRAPER"
echo "=========================================="
echo ""

# Run 14 batches
for i in $(seq 0 50 650); do
    batch_num=$((i / 50 + 1))
    remaining=$((679 - i))
    
    if [ $remaining -lt 50 ]; then
        count=$remaining
    else
        count=50
    fi
    
    echo ""
    echo "=========================================="
    echo "📦 BATCH $batch_num (index $i, count $count)"
    echo "=========================================="
    
    python3 pricecharting_scraper.py $i $count
    
    echo "⏳ Waiting 5 seconds before next batch..."
    sleep 5
done

echo ""
echo "=========================================="
echo "🎉 ALL BATCHES COMPLETED!"
echo "=========================================="

# Merge results
echo ""
echo "📊 Merging results..."
python3 merge_pricecharting_results.py
