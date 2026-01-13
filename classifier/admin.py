from django.contrib import admin
from .models import ContactMessage

@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "name", "email", "collaboration_type", "is_read")
    list_filter = ("collaboration_type", "is_read", "created_at")
    search_fields = ("name", "email", "organization", "message")
    ordering = ("-created_at",)
