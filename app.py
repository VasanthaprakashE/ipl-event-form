import os
import sys
import pandas as pd
from flask import Flask, render_template, request, send_file, jsonify, session, redirect, url_for, flash
from functools import wraps
from collections import defaultdict
from datetime import datetime, timedelta
import io
import logging

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import database functions
from db import (
    create_table, insert_data, get_all_entries,
    create_first_admin, verify_admin_login,
    create_login_history_table, log_login_attempt,
    get_login_history, get_current_sessions
)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Session configuration
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(32))
app.permanent_session_lifetime = timedelta(minutes=30)
app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(minutes=30)
)

INSTAGRAM_URL = "https://www.instagram.com/urbasersumeet/"

# Initialize database
try:
    create_table()
    create_login_history_table()
    create_first_admin()
    logger.info("✅ Database initialized successfully")
except Exception as e:
    logger.error(f"❌ Database error: {e}")

# Rate limiting
login_attempts = {}

def is_rate_limited(ip):
    if ip in login_attempts:
        attempts, timestamp = login_attempts[ip]
        if datetime.now().timestamp() - timestamp < 900:
            if attempts >= 5:
                return True
        else:
            login_attempts[ip] = [0, datetime.now().timestamp()]
    else:
        login_attempts[ip] = [0, datetime.now().timestamp()]
    return False

def record_login_attempt(ip, success=False):
    if ip in login_attempts:
        if success:
            login_attempts[ip] = [0, datetime.now().timestamp()]
        else:
            login_attempts[ip][0] += 1

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            flash('⚠️ Please login to access the admin dashboard', 'warning')
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# ============ ROUTES ============

@app.route("/")
def home():
    try:
        return render_template("form.html", insta=INSTAGRAM_URL)
    except Exception as e:
        logger.error(f"Home error: {e}")
        return f"Error: {str(e)}", 500

@app.route("/submit", methods=["POST"])
def submit():
    try:
        name = request.form.get("name", "").strip()
        insta = request.form.get("insta", "").strip()
        mobile = request.form.get("mobile", "").strip()
        follow_status = request.form.get("follow_status", "").strip()

        if not name or not insta or not mobile or not follow_status:
            return "All fields are required", 400

        if not mobile.isdigit() or len(mobile) != 10:
            return "Invalid mobile number. Must be 10 digits.", 400

        name = name.replace('<', '&lt;').replace('>', '&gt;')
        insta = insta.lstrip('@').replace('<', '&lt;').replace('>', '&gt;')
        
        insert_data(name, insta, mobile, follow_status)
        logger.info(f"✅ New submission: {name[:20]}")
        
        return render_template("success.html")
    
    except Exception as e:
        logger.error(f"Submit error: {e}")
        return f"Error: {str(e)}", 500

@app.route("/login", methods=['GET', 'POST'])
def login():
    if session.get('logged_in'):
        return redirect(url_for('admin'))
    
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    if request.method == 'POST':
        if is_rate_limited(client_ip):
            flash('Too many login attempts. Please wait 15 minutes.', 'error')
            return render_template('login.html')
        
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        admin = verify_admin_login(username, password, client_ip)
        
        if admin:
            session.permanent = True
            session['logged_in'] = True
            session['user_id'] = admin['id']
            session['username'] = admin['username']
            session['role'] = admin['role']
            session['login_time'] = datetime.now().isoformat()
            
            log_login_attempt(username, 'login', client_ip, user_agent, 'success', admin['id'])
            record_login_attempt(client_ip, success=True)
            
            logger.info(f"✅ Login: {username} from {client_ip}")
            flash(f'✅ Welcome back, {username}!', 'success')
            return redirect(url_for('admin'))
        else:
            log_login_attempt(username, 'login', client_ip, user_agent, 'failed', None)
            record_login_attempt(client_ip, success=False)
            logger.warning(f"❌ Failed login: {username} from {client_ip}")
            flash('❌ Invalid username or password!', 'error')
    
    return render_template('login.html')

@app.route("/logout")
def logout():
    username = session.get('username', 'Unknown')
    user_id = session.get('user_id')
    client_ip = request.remote_addr
    user_agent = request.headers.get('User-Agent', 'Unknown')
    
    if user_id:
        log_login_attempt(username, 'logout', client_ip, user_agent, 'success', user_id)
    
    logger.info(f"User {username} logged out")
    session.clear()
    flash('✅ Logged out successfully', 'success')
    return redirect(url_for('login'))

@app.route("/admin-dashboard")
@login_required
def admin():
    try:
        data = get_all_entries()
        
        if not data:
            return render_template("admin.html", entries=[], yes=0, no=0, total=0, daily={}, username=session.get('username'))
        
        yes_count = sum(1 for d in data if d[4] == "yes")
        no_count = sum(1 for d in data if d[4] == "no")
        
        daily = defaultdict(lambda: {"yes": 0, "no": 0})
        formatted_entries = []
        
        for d in data:
            try:
                created_at = str(d[5]) if d[5] else ""
                date = created_at[:10] if len(created_at) >= 10 else datetime.now().strftime("%Y-%m-%d")
                
                if d[4] == "yes":
                    daily[date]["yes"] += 1
                else:
                    daily[date]["no"] += 1
                
                formatted_entries.append({
                    "id": d[0],
                    "name": str(d[1]),
                    "instagram": str(d[2]),
                    "mobile": str(d[3]),
                    "status": d[4],
                    "time": created_at,
                    "date": date
                })
            except Exception as e:
                continue
        
        formatted_entries.sort(key=lambda x: x['id'], reverse=True)
        
        return render_template(
            "admin.html",
            entries=formatted_entries,
            yes=yes_count,
            no=no_count,
            total=len(data),
            daily=dict(daily),
            username=session.get('username')
        )
    
    except Exception as e:
        logger.error(f"Admin error: {e}")
        return f"Error: {str(e)}", 500

@app.route("/login-history")
@login_required
def login_history():
    history = get_login_history(100)
    active_sessions = get_current_sessions()
    return render_template('login_history.html', history=history, active_sessions=active_sessions, username=session.get('username'))

@app.route("/export")
@login_required
def export():
    try:
        from_date = request.args.get("from", "")
        to_date = request.args.get("to", "")
        
        data = get_all_entries()
        
        if not data:
            df = pd.DataFrame(columns=["ID", "Name", "Instagram", "Mobile", "Status", "Created At"])
        else:
            filtered_data = []
            for d in data:
                date_str = str(d[5])[:10] if d[5] else ""
                if from_date and to_date:
                    if from_date <= date_str <= to_date:
                        filtered_data.append(d)
                else:
                    filtered_data.append(d)
            
            df = pd.DataFrame(filtered_data, columns=["ID", "Name", "Instagram", "Mobile", "Status", "Created At"])
        
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        filename = f"export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return send_file(
            output,
            download_name=filename,
            as_attachment=True,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    
    except Exception as e:
        logger.error(f"Export error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/filtered-data")
@login_required
def api_filtered_data():
    try:
        from_date = request.args.get("from", "")
        to_date = request.args.get("to", "")
        search = request.args.get("search", "").lower().strip()
        
        data = get_all_entries()
        
        if not data:
            return jsonify({"entries": [], "yes": 0, "no": 0, "total": 0, "daily": {}})
        
        filtered_data = []
        for d in data:
            date_str = str(d[5])[:10] if d[5] else ""
            
            if from_date and to_date:
                if not (from_date <= date_str <= to_date):
                    continue
            
            if search:
                name_match = search in str(d[1]).lower()
                insta_match = search in str(d[2]).lower()
                mobile_match = search in str(d[3]).lower()
                if not (name_match or insta_match or mobile_match):
                    continue
            
            filtered_data.append({
                "id": d[0],
                "name": str(d[1]),
                "instagram": str(d[2]),
                "mobile": str(d[3]),
                "status": d[4],
                "time": str(d[5]) if d[5] else "",
                "date": date_str
            })
        
        yes_count = sum(1 for d in filtered_data if d["status"] == "yes")
        no_count = sum(1 for d in filtered_data if d["status"] == "no")
        
        daily = defaultdict(lambda: {"yes": 0, "no": 0})
        for d in filtered_data:
            if d["status"] == "yes":
                daily[d["date"]]["yes"] += 1
            else:
                daily[d["date"]]["no"] += 1
        
        return jsonify({
            "entries": filtered_data,
            "yes": yes_count,
            "no": no_count,
            "total": len(filtered_data),
            "daily": dict(daily)
        })
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/health")
def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}, 200

@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)

application = app