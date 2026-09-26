# Generated for the existing ContactMessage table in the legacy deployment.

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ContactMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("email", models.EmailField(max_length=254)),
                ("organization", models.CharField(blank=True, max_length=180)),
                (
                    "collaboration_type",
                    models.CharField(
                        choices=[
                            ("clinical", "Clinical Validation & Testing"),
                            ("data", "Job offer"),
                            ("technical", "Technical Development"),
                            ("research", "Joint Research Project"),
                            ("other", "Others"),
                        ],
                        max_length=30,
                    ),
                ),
                ("message", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("is_read", models.BooleanField(default=False)),
            ],
        ),
    ]
