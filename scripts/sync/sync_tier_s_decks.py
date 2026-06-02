import sqlite3
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

# New Tier S decks based on tournament data + inventory
decks = [
    {
        "id": "2026-zoroark-n-ex",
        "name": "N's Zoroark (Poison Chain)",
        "archetype": "Zoroark N ex",
        "description": "Tier S — Top 8 Houston Regional. Memanfaatkan sinergi Moci Rantai + Pecharunt ex.",
        "format": "Standard",
        "cards": [
            ("Zoroark N ex", "MA3", 3),
            ("Zorua N", "MA3", 4),
            ("Pecharunt ex", "MA3", 2),
            ("Fezandipiti ex", "MA3", 1),
            ("Tatsugiri", "SV8s", 2),
            ("Reshiram", "", 2),
            ("Alakazam", "", 1),
            ("Teknik Rahasia Janine", "MA3", 5),
            ("Plot N", "MA3", 4),
            ("Istana N", "MA3", 3),
            ("Pokégear 3.0", "MAAL", 4),
            ("Urbain", "MAAL", 2),
            ("Semangat Tarung Iris", "MAAL", 3),
            ("Moci Rantai", "SV8a", 2),
            ("Tandu Malam", "MA3", 2),
            ("Bola Ultra", "MAAL", 1),
            ("Bola Pokémon", "", 1),
            ("Judge", "MAAL", 2),
            ("Menara Pengacak", "MA3", 1),
            ("Bel Penyelamat", "MAAL", 2),
            ("Energi Dasar [Kegelapan]", "", 8),
            ("Energi Recycle", "MA3", 5)
        ]
    },
    {
        "id": "2026-mega-charizard-x",
        "name": "Mega Charizard X (Inferno Burst)",
        "archetype": "Charizard ex",
        "description": "Tier S — Boss Killer dengan HP 360. Potensi OHKO damage 360+.",
        "format": "Standard",
        "cards": [
            ("Mega Charizard X ex", "MA3", 2),
            ("Charmeleon", "MA3", 2),
            ("Charmander", "MA3", 3),
            ("Noctowl", "MA3", 2),
            ("Hoothoot", "MA3", 4),
            ("Entei", "MA3", 2),
            ("Ogerpon Topeng Teal", "SV5s", 1),
            ("Castform", "SV8s", 1),
            ("Volcarona", "", 1),
            ("Teman-teman Paldea", "SV8a", 4),
            ("Cheren", "", 4),
            ("Urbain", "MAAL", 4),
            ("Dawn", "", 2),
            ("Semangat Tarung Iris", "MAAL", 2),
            ("Kemurnian Hati Bianca", "", 3),
            ("Permen Langka", "MAAL", 2),
            ("Scramble Switch", "SV8s", 1),
            ("Poké Pad", "MA4", 2),
            ("Pemulihan Energi", "SV11s", 2),
            ("Pengalih Energi", "MA2", 2),
            ("Heat Burner", "MA2", 2),
            ("Pokégear 3.0", "MAAL", 1),
            ("Pemberat Kekuatan Cynthia", "", 3),
            ("Energi Dasar [Api]", "", 8)
        ]
    }
]

def find_card(cursor, name, expansion_code):
    if expansion_code:
        cursor.execute("SELECT id FROM cards WHERE (name_id = ? OR name_en = ?) AND expansion_code = ?", (name, name, expansion_code))
        res = cursor.fetchone()
        if res: return res[0]
    cursor.execute("SELECT id FROM cards WHERE name_id = ? OR name_en = ? ORDER BY (expansion_code IS NOT NULL) DESC LIMIT 1", (name, name))
    res = cursor.fetchone()
    if res: return res[0]
    cursor.execute("SELECT id FROM cards WHERE name_id LIKE ? OR name_en LIKE ? ORDER BY (expansion_code IS NOT NULL) DESC LIMIT 1", ('%'+name+'%', '%'+name+'%'))
    res = cursor.fetchone()
    return res[0] if res else None

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Remove old Ceruledge deck
    cursor.execute("DELETE FROM decks WHERE id = '2026-ceruledge-ex'")
    cursor.execute("DELETE FROM decklists WHERE deck_id = '2026-ceruledge-ex'")

    for deck in decks:
        print(f"Syncing Tier S deck: {deck['name']}")
        cursor.execute("""
            INSERT INTO decks (id, name, archetype, description, format, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                updated_at = CURRENT_TIMESTAMP
        """, (deck['id'], deck['name'], deck['archetype'], deck['description'], deck['format']))
        
        decklist_id = f"list-{deck['id']}"
        cursor.execute("""
            INSERT INTO decklists (id, deck_id, name, player_name, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
        """, (decklist_id, deck['id'], f"Tier S Build - {deck['name']}", "Tournament"))

        cursor.execute("DELETE FROM deck_cards WHERE deck_id = ?", (decklist_id,))
        
        total_count = 0
        for card_name, exp, count in deck['cards']:
            card_id = find_card(cursor, card_name, exp)
            if card_id:
                is_pokemon = False
                cursor.execute("SELECT category FROM cards WHERE id = ?", (card_id,))
                cat = cursor.fetchone()
                if cat and cat[0] == 'Pokemon': is_pokemon = True
                cursor.execute("INSERT INTO deck_cards (deck_id, card_id, count, is_pokemon) VALUES (?, ?, ?, ?)", (decklist_id, card_id, count, is_pokemon))
                total_count += count
            else:
                print(f"  Warning: '{card_name}' not found")
        print(f"  Total cards: {total_count}")
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()
