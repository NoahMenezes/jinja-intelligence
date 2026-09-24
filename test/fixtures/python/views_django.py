from django.shortcuts import render

from .models import User


def profile(request):
    user = get_user(1)
    return render(request, "profile.html", {"user": user, "title": "P"})


def bare(request):
    return render(request, "bare.html", ctx)
