import requests
from bs4 import BeautifulSoup

url = "https://limitlesstcg.com/tournaments"
headers = {'User-Agent': 'Mozilla/5.0'}
resp = requests.get(url, headers=headers)
soup = BeautifulSoup(resp.text, 'html.parser')
links = soup.find_all('a', href=True)
tourney_links = [l.get('href') for l in links if '/tournaments/' in l.get('href')]
print(f"Found {len(tourney_links)} tournament links")
print(tourney_links[:5])
