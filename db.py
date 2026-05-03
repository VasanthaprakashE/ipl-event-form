import os
import sqlite3
from datetime import datetime
import pytz
import hashlib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "usersdata.db")

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def create_table():
    try:
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
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT,
                role TEXT DEFAULT 'admin',
                is_active INTEGER DEFAULT 1,
                created_at TEXT,
                last_login TEXT,
                last_ip TEXT
            )
        """)
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error creating tables: {e}")
        return False

def create_login_history_table():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER,
                username TEXT,
                action TEXT,
                ip_address TEXT,
                user_agent TEXT,
                status TEXT,
                timestamp TEXT
            )
        """)
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error creating login history: {e}")
        return False

def create_first_admin():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM admins")
        count = cursor.fetchone()[0]
        
        if count == 0:
            default_password = "admin123"
            password_hash = hash_password(default_password)
            tz = pytz.timezone("Asia/Kolkata")
            now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
            
            cursor.execute("""
                INSERT INTO admins (username, password_hash, role, created_at)
                VALUES (?, ?, ?, ?)
            """, ('admin', password_hash, 'super_admin', now))
            
            conn.commit()
            print("=" * 50)
            print("⚠️ DEFAULT ADMIN CREATED!")
            print("Username: admin")
            print("Password: admin123")
            print("=" * 50)
        
        conn.close()
        return True
    except Exception as e:
        print(f"Error creating admin: {e}")
        return False

def insert_data(name, insta, mobile, follow_status):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        tz = pytz.timezone("Asia/Kolkata")
        now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        
        cursor.execute("""
            INSERT INTO entries (name, insta, mobile, follow_status, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (name, insta, mobile, follow_status, now))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error inserting data: {e}")
        return False

def get_all_entries():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM entries ORDER BY id DESC")
        data = cursor.fetchall()
        conn.close()
        return data
    except Exception as e:
        print(f"Error fetching entries: {e}")
        return []

def verify_admin_login(username, password, ip_address):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        password_hash = hash_password(password)
        
        cursor.execute("""
            SELECT id, username, role, is_active 
            FROM admins 
            WHERE username = ? AND password_hash = ? AND is_active = 1
        """, (username, password_hash))
        
        admin = cursor.fetchone()
        
        if admin:
            tz = pytz.timezone("Asia/Kolkata")
            now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
            
            cursor.execute("UPDATE admins SET last_login = ?, last_ip = ? WHERE id = ?", (now, ip_address, admin[0]))
            conn.commit()
            conn.close()
            
            return {"id": admin[0], "username": admin[1], "role": admin[2], "is_active": admin[3]}
        
        conn.close()
        return None
    except Exception as e:
        print(f"Login error: {e}")
        return None

def log_login_attempt(username, action, ip_address, user_agent, status, admin_id=None):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        tz = pytz.timezone("Asia/Kolkata")
        now = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        
        cursor.execute("""
            INSERT INTO login_history (admin_id, username, action, ip_address, user_agent, status, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (admin_id, username, action, ip_address, user_agent, status, now))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error logging: {e}")
        return False

def get_login_history(limit=100):
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, username, action, ip_address, status, timestamp 
            FROM login_history 
            ORDER BY id DESC 
            LIMIT ?
        """, (limit,))
        
        history = cursor.fetchall()
        conn.close()
        
        return [{"id": h[0], "username": h[1], "action": h[2], "ip_address": h[3], "status": h[4], "timestamp": h[5]} for h in history]
    except Exception as e:
        print(f"Error fetching history: {e}")
        return []

def get_current_sessions():
    try:
        conn = sqlite3.connect(DB_NAME)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT username, ip_address, timestamp 
            FROM login_history 
            WHERE action = 'login' AND status = 'success'
            AND datetime(timestamp) >= datetime('now', '-30 minutes')
            ORDER BY timestamp DESC
        """)
        
        sessions = cursor.fetchall()
        conn.close()
        
        return [{"username": s[0], "ip_address": s[1], "timestamp": s[2]} for s in sessions]
    except Exception as e:
        print(f"Error fetching sessions: {e}")
        return []