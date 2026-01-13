from django import forms
from .models import ContactMessage

class ContactForm(forms.ModelForm):
    class Meta:
        model = ContactMessage
        fields = ["name", "email", "organization", "collaboration_type", "message"]

    def clean_message(self):
        msg = (self.cleaned_data.get("message") or "").strip()
        if len(msg) < 10:
            raise forms.ValidationError("Message is too short. Please provide more details.")
        return msg