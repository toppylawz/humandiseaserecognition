from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("predict/", views.predict_upload, name="predict_upload"),
    path("predict-frame/", views.predict_frame, name="predict_frame"),
]
