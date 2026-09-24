from flask import render_template


@app.route("/")
def home():
    return render_template(
        "index.html",
        user=user,
        products=products,
    )


@app.route("/about")
def about():
    return render_template("about.html", title="About")
