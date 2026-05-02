from flask import Flask, render_template, request
from db import create_table, insert_data

app = Flask(__name__)

INSTAGRAM_URL = "https://www.instagram.com/urbasersumeet/"

create_table()


@app.route("/")
def home():
    return render_template("form.html", insta=INSTAGRAM_URL)


@app.route("/submit", methods=["POST"])
def submit():


    name = request.form.get("name")
    insta = request.form.get("insta")
    mobile = request.form.get("mobile")
    follow_status = request.form.get("follow_status")

    # VALIDATION
    if not name or not insta or not mobile or not follow_status:
        return "All fields are required", 400

    if not mobile.isdigit() or len(mobile) != 10:
        return "Invalid mobile number", 400

    insert_data(name, insta, mobile, follow_status)

    return render_template("success.html")


if __name__ == "__main__":
    app.run(debug=True)