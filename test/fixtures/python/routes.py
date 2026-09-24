from flask import Blueprint, render_template

admin = Blueprint("admin", __name__)


@admin.route("/dashboard")
def dashboard():
    stats = load_stats()
    return render_template("admin/dashboard.html", stats=stats, user=current_user)
