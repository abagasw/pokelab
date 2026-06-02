import sqlite3
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

decks = [
    {
        "id": "2026-zoroark-n-ex",
        "name": "N's Zoroark (Full N-Engine)",
        "archetype": "Zoroark N ex",
        "description": "Tier S+ — Versi paling optimal dengan Full N-Engine (Zekrom N, PP Up N, dll).",
        "format": "Standard",
        "cards": [
            ("Zoroark N ex", "MA3", 3),
            ("Zorua N", "MA3", 4),
            ("Zekrom N", "MA3", 2),
            ("Reshiram N", "MA3", 1),
            ("Darmanitan N", "MA3", 1),
            ("Darumaka N", "MA3", 1),
            ("Pecharunt ex", "MA3", 1),
            ("Fezandipiti ex", "MA3", 1),
            ("Tatsugiri", "SV8s", 1),
            ("Budew", "MA3", 1),
            ("Munkidori", "MA3", 1),
            ("Teknik Rahasia Janine", "MA3", 5),
            ("Plot N", "MA3", 4),
            ("PP Up N", "MA3", 2),
            ("Istana N", "MA3", 2),
            ("Menara Pemantau Tim Roket", "MA3", 1),
            ("Bola Ultra", "MAAL", 4),
            ("Poffin Bersahabat", "MA3", 4),
            ("Tandu Malam", "MA3", 3),
            ("Moci Rantai", "SV8a", 2),
            ("Hilda", "MA3", 2),
            ("Ketetapan Hati Lillie", "MAAL", 2),
            ("MC Pemeriah Acara", "MAAL", 2),
            ("Judge", "MAAL", 2),
            ("Energi Dasar [Kegelapan]", "", 8)
        ]
    }
]

def find_card(cursor, name, exp):
    cursor.execute("SELECT id FROM cards WHERE (name_id = ? OR name_en = ?) AND expansion_code = ?", (name, name, exp))
    res = cursor.fetchone()
    if res: return res[0]
    cursor.execute("SELECT id FROM cards WHERE name_id = ? OR name_en = ? LIMIT 1", (name, name))
    res = cursor.fetchone()
    if res: return res[0]
    cursor.execute("SELECT id FROM cards WHERE name_id LIKE ? LIMIT 1", ('%'+name+'%',))
    res = cursor.fetchone()
    return res[0] if res else None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for deck in decks:
        print(f"Updating Zoroark to Tier S+: {deck['name']}")
        cursor.execute("UPDATE decks SET name = ?, description = ? WHERE id = ?", (deck['name'], deck['description'], deck['id']))
        decklist_id = f"list-{deck['id']}"
        cursor.execute("DELETE FROM deck_cards WHERE deck_id = ?", (decklist_id,))
        total = 0
        for name, exp, count in deck['cards']:
            cid = find_card(cursor, name, exp)
            if cid:
                cursor.execute("INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?, ?, ?, ?)", (decklist_id, cid, count, 0))
                total += count
        print(f"  Total cards: {total}")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()
