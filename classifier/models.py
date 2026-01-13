from django.db import models

class ContactMessage(models.Model):
    INTEREST_CHOICES = [
        ("clinical", "Clinical Validation & Testing"),
        ("data", "Job offer"),
        ("technical", "Technical Development"),
        ("research", "Joint Research Project"),
        ("other", "Others"),
    ]

    name = models.CharField(max_length=120)
    email = models.EmailField()
    organization = models.CharField(max_length=180, blank=True)
    collaboration_type = models.CharField(max_length=30, choices=INTEREST_CHOICES)
    message = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)
    is_read = models.BooleanField(default=False)

    def __str__(self) -> str:
        return f"{self.name} ({self.email}) - {self.collaboration_type} @ {self.created_at:%Y-%m-%d}"
