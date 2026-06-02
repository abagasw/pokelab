import requests
from bs4 import BeautifulSoup
import sys

# Sample decklist ID (taken from a real one if I can find it, or just try /decks/list/1)
url = "https://limitlesstcg.com/decks/list/1"
if len(sys.argv) > 1:
    url = f"https://limitlesstcg.com/decks/list/{sys.argv[1]}"

headers = {'User-Agent': 'Mozilla/5.0'}
resp = requests.get(url, headers=headers)
print(f"Status: {resp.status_code}")
# print(resp.text[:1000]) # Too much output
if "Pokémon" in resp.text or "Trainer" in resp.text:
    print("Found category headers in HTML!")
else:
    print("Category headers NOT found in HTML. Might need JS.")
