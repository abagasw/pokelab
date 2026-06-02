import sqlite3
import os

DB_PATH = 'backend-go/pokemon_tcg.db'

# New decks based on inventory
decks = [
    {
        "id": "2026-zoroark-n-ex",
        "name": "Zoroark N ex (Janine Engine)",
        "archetype": "Zoroark N ex",
        "description": "Counter Meta — Menggunakan sinergi Pecharunt ex + Teknik Rahasia Janine dari inventory.",
        "format": "Standard",
        "cards": [
            ("Zoroark N ex", "MA3", 3),
            ("Zorua N", "MA3", 4),
            ("Pecharunt ex", "MA3", 2),
            ("Fezandipiti ex", "MA3", 1),
            ("Tatsugiri", "SV8s", 1),
            ("Audino", "MA3", 2),
            ("Komala", "MA3", 2),
            ("Teknik Rahasia Janine", "MA3", 5),
            ("Plot N", "MA3", 4),
            ("Istana N", "MA3", 3),
            ("Pokégear 3.0", "MAAL", 4),
            ("Moci Rantai", "SV8a", 2),
            ("Tandu Malam", "MA3", 2),
            ("Bola Ultra", "MAAL", 1),
            ("Bola Pokémon", "", 1),
            ("Judge", "MAAL", 2),
            ("Urbain", "MAAL", 4),
            ("Semangat Tarung Iris", "MAAL", 2),
            ("Dawn", "", 2),
            ("Cheren", "", 4),
            ("Scramble Switch", "SV8s", 1),
            ("Energi Dasar [Kegelapan]", "", 8)
        ]
    },
    {
        "id": "2026-ceruledge-ex",
        "name": "Ceruledge ex Fire Discard",
        "archetype": "Ceruledge ex",
        "description": "Aggro — Fokus discard energy menggunakan Bimbingan Penjelajah dari inventory.",
        "format": "Standard",
        "cards": [
            ("Ceruledge ex", "MA3", 3),
            ("Charcadet", "MA3", 4),
            ("Ceruledge", "MA3", 2),
            ("Armarouge", "SV8s", 2),
            ("Entei", "MA3", 2),
            ("Reshiram", "", 2),
            ("Castform", "SV8s", 1),
            ("Bimbingan Penjelajah", "SV8a", 4),
            ("Pemulihan Energi", "SV11s", 3),
            ("Energi Recycle", "MA3", 5),
            ("Heat Burner", "MA2", 2),
            ("Pengalih Energi", "MA2", 2),
            ("Poké Pad", "MA4", 2),
            ("Pokémon Catcher", "MAAL", 2),
            ("Bola Ultra", "MAAL", 1),
            ("Teman-teman Paldea", "SV8a", 4),
            ("Kemurnian Hati Bianca", "", 3),
            ("Pemberat Kekuatan Cynthia", "", 2),
            ("Energi Dasar [Api]", "", 8),
            ("Energi Dasar [Psikis]", "", 6)
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
    
    # Delete old Armarouge deck from DB if replacing
    cursor.execute("DELETE FROM decks WHERE id = '2026-armarouge-fire'")
    cursor.execute("DELETE FROM decklists WHERE deck_id = '2026-armarouge-fire'")

    for deck in decks:
        print(f"Updating deck: {deck['name']}")
        cursor.execute("""
            INSERT INTO decks (id, name, archetype, description, format, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                archetype = excluded.archetype,
                description = excluded.description,
                updated_at = CURRENT_TIMESTAMP
        """, (deck['id'], deck['name'], deck['archetype'], deck['description'], deck['format']))
        
        decklist_id = f"list-{deck['id']}"
        cursor.execute("""
            INSERT INTO decklists (id, deck_id, name, player_name, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET name = excluded.name
        """, (decklist_id, deck['id'], f"Inventory Build - {deck['name']}", "Inventory"))

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
