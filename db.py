import sqlite3

DB_NAME = "usersdata.db"

def create_table():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            insta TEXT,
            mobile TEXT,
            follow_status TEXT
        )
    """)

    conn.commit()
    conn.close()


def insert_data(name, insta, mobile, follow_status):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO entries (name, insta, mobile, follow_status)
        VALUES (?, ?, ?, ?)
    """, (name, insta, mobile, follow_status))

    conn.commit()
    conn.close()