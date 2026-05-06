"""
Database Layer - All data operations for IPL Event
"""
import hashlib
from datetime import datetime
import pytz
from gsheet import GSheet

# ===== CONFIGURATION =====
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyHnUEozHl8-E0DvgT-phu-iHXTGWrAie6746nesCNUUpbiVRYPltCkCrPvCZtccOFK/exec"
API_KEY = "ipl2026eventdashboard"

# Initialize Google Sheets connection
db = GSheet(APPS_SCRIPT_URL, API_KEY)

# ===== UTILITY FUNCTIONS =====

def hash_password(password):
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def now_ist():
    """Get current time in IST"""
    tz = pytz.timezone("Asia/Kolkata")
    return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")

# ===== INITIALIZATION =====

def init_database():
    """Initialize database and create default admin if needed"""
    result = db.count('admins')
    if result.get('success') and result.get('data', {}).get('count', 0) == 0:
        create_default_admin()
    return True

def create_default_admin():
    """Create default admin account"""
    admin_data = {
        'username': 'admin',
        'password_hash': hash_password("admin123"),
        'role': 'super_admin',
        'is_active': '1',
        'created_at': now_ist()
    }
    db.insert('admins', admin_data)
    print("=" * 50)
    print("🔑 DEFAULT ADMIN: admin / admin123")
    print("=" * 50)

# ===== ENTRY OPERATIONS =====

def save_entry(name, insta, mobile, follow_status):
    """Save a new registration entry"""
    entry_data = {
        'name': name,
        'insta': insta,
        'mobile': mobile,
        'follow_status': follow_status,
        'created_at': now_ist()
    }
    result = db.insert('entries', entry_data)
    return result.get('success', False)

def get_all_entries():
    """Get all registration entries"""
    result = db.select('entries')
    
    if result.get('success') and result.get('data'):
        return [
            (
                e.get('id', ''),
                e.get('name', ''),
                e.get('insta', ''),
                e.get('mobile', ''),
                e.get('follow_status', ''),
                e.get('created_at', '')
            ) for e in result['data']
        ]
    return []

# ===== AUTH OPERATIONS =====

def verify_login(username, password, ip_address):
    """Verify admin login credentials"""
    result = db.select('admins', query={
        'username': username,
        'password_hash': hash_password(password)
    })
    
    if result.get('success') and result.get('data'):
        admin = result['data'][0]
        
        # Update last login info
        db.update('admins', admin['id'], {
            'last_login': now_ist(),
            'last_ip': ip_address
        })
        
        return {
            "id": admin['id'],
            "username": admin['username'],
            "role": admin.get('role', 'admin'),
            "is_active": int(admin.get('is_active', 1))
        }
    return None

# ===== LOGGING OPERATIONS =====

def log_activity(username, action, ip_address, user_agent, status, admin_id=None):
    """Log user activity"""
    log_data = {
        'admin_id': str(admin_id) if admin_id else '',
        'username': username,
        'action': action,
        'ip_address': ip_address,
        'user_agent': user_agent[:200] if user_agent else '',
        'status': status,
        'timestamp': now_ist()
    }
    result = db.insert('login_history', log_data)
    return result.get('success', False)

def get_activity_log(limit=100):
    """Get recent activity logs"""
    result = db.select('login_history', query={'limit': limit})
    if result.get('success') and result.get('data'):
        return result['data']
    return []

def get_active_sessions():
    """Get currently active sessions"""
    result = db.select('login_history', query={'limit': 50})
    if result.get('success') and result.get('data'):
        return [
            {
                "username": s.get('username', ''),
                "ip_address": s.get('ip_address', ''),
                "timestamp": s.get('timestamp', '')
            }
            for s in result['data']
            if s.get('status') == 'success' and s.get('action') == 'login'
        ]
    return []

# ===== COMPATIBILITY WRAPPERS =====
# These maintain compatibility with your original code

def create_table():
    return init_database()

def create_login_history_table():
    return True

def create_first_admin():
    return create_default_admin()

def insert_data(name, insta, mobile, follow_status):
    return save_entry(name, insta, mobile, follow_status)

def verify_admin_login(username, password, ip_address):
    return verify_login(username, password, ip_address)

def log_login_attempt(username, action, ip_address, user_agent, status, admin_id=None):
    return log_activity(username, action, ip_address, user_agent, status, admin_id)

def get_login_history(limit=100):
    return get_activity_log(limit)

def get_current_sessions():
    return get_active_sessions()