import sqlite3
from datetime import datetime
import pytz

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
            follow_status TEXT,
            created_at TEXT
        )
    """)

    conn.commit()
    conn.close()


def insert_data(name, insta, mobile, follow_status):
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

     # SET LOCAL TIMEZONE (IST example)
    tz = pytz.timezone("Asia/Kolkata")
    now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")


    cursor.execute("""
        INSERT INTO entries (name, insta, mobile, follow_status,created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (name, insta, mobile, follow_status, now))

    conn.commit()
    conn.close()


def get_all_entries():
    conn = sqlite3.connect(DB_NAME)
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM entries ORDER BY id DESC")
    data = cursor.fetchall()

    conn.close()
    return data