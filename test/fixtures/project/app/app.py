from flask import render_template


def users():
    return render_template("users.j2")
