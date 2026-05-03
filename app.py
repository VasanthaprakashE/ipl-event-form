import pandas as pd
from flask import Flask, render_template, request, send_file, jsonify
from db import create_table, insert_data, get_all_entries
import io
import openpyxl
from collections import defaultdict
from datetime import datetime
import traceback
import logging

# Setup logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)

INSTAGRAM_URL = "https://www.instagram.com/urbasersumeet/"

# Create table on startup
try:
    create_table()
    logger.info("Database table created/verified successfully")
except Exception as e:
    logger.error(f"Database initialization error: {e}")


@app.route("/")
def home():
    """Home page with form"""
    try:
        return render_template("form.html", insta=INSTAGRAM_URL)
    except Exception as e:
        logger.error(f"Home route error: {e}")
        return f"Error loading page: {e}", 500


@app.route("/submit", methods=["POST"])
def submit():
    """Handle form submission"""
    try:
        name = request.form.get("name")
        insta = request.form.get("insta")
        mobile = request.form.get("mobile")
        follow_status = request.form.get("follow_status")

        # VALIDATION
        if not name or not insta or not mobile or not follow_status:
            return "All fields are required", 400

        if not mobile.isdigit() or len(mobile) != 10:
            return "Invalid mobile number. Must be 10 digits.", 400

        # Clean Instagram handle (remove @ if present)
        insta = insta.strip().lstrip('@')
        
        # Insert data
        insert_data(name, insta, mobile, follow_status)
        logger.info(f"New entry added: {name} - {follow_status}")
        
        return render_template("success.html")
    
    except Exception as e:
        logger.error(f"Submit route error: {e}")
        logger.error(traceback.format_exc())
        return f"Error submitting form: {e}", 500


@app.route("/admin")
def admin():
    """Admin dashboard"""
    try:
        key = request.args.get("key")
        if key != "1234":
            return "Unauthorized Access", 401

        # Get all entries
        data = get_all_entries()
        logger.debug(f"Retrieved {len(data)} entries from database")
        
        if not data:
            # Return empty dashboard
            return render_template(
                "admin.html",
                entries=[],
                yes=0,
                no=0,
                total=0,
                daily={}
            )
        
        # Calculate stats
        # Data structure: (id, name, insta, mobile, follow_status, created_at)
        yes_count = sum(1 for d in data if d[4] == "yes")
        no_count = sum(1 for d in data if d[4] == "no")
        
        # DATE-WISE GROUPING
        daily = defaultdict(lambda: {"yes": 0, "no": 0})
        
        # Format entries for JSON serialization
        formatted_entries = []
        for d in data:
            try:
                # Handle date formatting from created_at field (index 5)
                created_at = str(d[5]) if d[5] else ""
                date = created_at[:10] if len(created_at) >= 10 else datetime.now().strftime("%Y-%m-%d")
                
                if d[4] == "yes":  # follow_status is at index 4
                    daily[date]["yes"] += 1
                else:
                    daily[date]["no"] += 1
                
                # Format entry for template
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
                logger.error(f"Error formatting entry {d}: {e}")
                continue
        
        # Sort entries by ID descending (newest first)
        formatted_entries.sort(key=lambda x: x['id'], reverse=True)
        
        # Convert daily to regular dict for JSON
        daily_dict = dict(daily)
        
        logger.info(f"Dashboard loaded: Total={len(data)}, Yes={yes_count}, No={no_count}")
        
        return render_template(
            "admin.html",
            entries=formatted_entries,
            yes=yes_count,
            no=no_count,
            total=len(data),
            daily=daily_dict
        )
    
    except Exception as e:
        logger.error(f"Admin route error: {e}")
        logger.error(traceback.format_exc())
        return f"Error loading admin dashboard: {e}", 500


@app.route("/export")
def export():
    """Export data to Excel"""
    try:
        key = request.args.get("key")
        if key != "1234":
            return jsonify({"error": "Unauthorized"}), 401

        from_date = request.args.get("from")
        to_date = request.args.get("to")
        
        logger.info(f"Export requested: from={from_date}, to={to_date}")
        
        # Get all entries
        data = get_all_entries()
        
        if not data:
            # Return empty Excel
            df = pd.DataFrame(columns=["ID", "Name", "Instagram", "Mobile", "Status", "Created At"])
        else:
            # FILTER BY DATE RANGE
            filtered_data = []
            for d in data:
                try:
                    # created_at is at index 5
                    date_str = str(d[5])[:10] if d[5] else ""
                    if from_date and to_date:
                        if from_date <= date_str <= to_date:
                            filtered_data.append(d)
                    else:
                        filtered_data.append(d)
                except Exception as e:
                    logger.error(f"Error filtering entry {d}: {e}")
                    continue
            
            # CREATE DATAFRAME with correct column names
            df = pd.DataFrame(filtered_data, columns=[
                "ID", "Name", "Instagram", "Mobile", "Status", "Created At"
            ])
        
        # EXPORT TO EXCEL
        output = io.BytesIO()
        
        # Use openpyxl engine for better Excel formatting
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Data')
            
            # Auto-adjust column widths
            worksheet = writer.sheets['Data']
            for column in df:
                column_width = max(df[column].astype(str).map(len).max(), len(column))
                col_idx = df.columns.get_loc(column)
                worksheet.column_dimensions[chr(65 + col_idx)].width = min(column_width + 2, 50)
        
        output.seek(0)
        
        # Generate filename
        if from_date and to_date:
            filename = f"filtered_data_{from_date}_to_{to_date}.xlsx"
        else:
            filename = f"all_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        logger.info(f"Export successful: {len(df)} records exported to {filename}")
        
        return send_file(
            output,
            download_name=filename,
            as_attachment=True,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    
    except Exception as e:
        logger.error(f"Export route error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"error": f"Export failed: {str(e)}"}), 500


@app.route("/api/filtered-data")
def api_filtered_data():
    """API endpoint for filtered dashboard data (AJAX)"""
    try:
        key = request.args.get("key")
        if key != "1234":
            return jsonify({"error": "Unauthorized"}), 401
        
        from_date = request.args.get("from")
        to_date = request.args.get("to")
        search = request.args.get("search", "").lower().strip()
        
        logger.debug(f"API filtered data request: from={from_date}, to={to_date}, search={search}")
        
        # Get all entries
        data = get_all_entries()
        
        if not data:
            return jsonify({
                "entries": [],
                "yes": 0,
                "no": 0,
                "total": 0,
                "daily": {}
            })
        
        # Apply filters
        filtered_data = []
        for d in data:
            try:
                # created_at is at index 5
                date_str = str(d[5])[:10] if d[5] else ""
                
                # Date filter
                if from_date and to_date:
                    if not (from_date <= date_str <= to_date):
                        continue
                
                # Search filter (search in name, insta, mobile)
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
            except Exception as e:
                logger.error(f"Error processing entry {d}: {e}")
                continue
        
        # Calculate stats
        yes_count = sum(1 for d in filtered_data if d["status"] == "yes")
        no_count = sum(1 for d in filtered_data if d["status"] == "no")
        
        # Daily grouping
        daily = defaultdict(lambda: {"yes": 0, "no": 0})
        for d in filtered_data:
            if d["status"] == "yes":
                daily[d["date"]]["yes"] += 1
            else:
                daily[d["date"]]["no"] += 1
        
        logger.debug(f"API response: {len(filtered_data)} records, yes={yes_count}, no={no_count}")
        
        return jsonify({
            "entries": filtered_data,
            "yes": yes_count,
            "no": no_count,
            "total": len(filtered_data),
            "daily": dict(daily)
        })
    
    except Exception as e:
        logger.error(f"API filtered-data error: {e}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/api/stats")
def api_stats():
    """API endpoint for quick stats (for dashboard widgets)"""
    try:
        key = request.args.get("key")
        if key != "1234":
            return jsonify({"error": "Unauthorized"}), 401
        
        data = get_all_entries()
        
        total = len(data)
        yes_count = sum(1 for d in data if d[4] == "yes")
        no_count = sum(1 for d in data if d[4] == "no")
        
        # Get today's entries (created_at is at index 5)
        today = datetime.now().strftime("%Y-%m-%d")
        today_entries = sum(1 for d in data if str(d[5])[:10] == today)
        
        return jsonify({
            "total": total,
            "followers": yes_count,
            "non_followers": no_count,
            "today_entries": today_entries,
            "conversion_rate": round((yes_count / total * 100), 2) if total > 0 else 0
        })
    
    except Exception as e:
        logger.error(f"API stats error: {e}")
        return jsonify({"error": str(e)}), 500


# Error handlers
@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({"error": "Resource not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {error}")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    # Run with debug mode for development
    app.run(debug=True, host='0.0.0.0', port=5000)