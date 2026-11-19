from PIL import Image
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.csrf import csrf_protect
from django.views.generic import TemplateView
from django.core.mail import send_mail
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from .forms import ContactForm

from .ml_model import predict_pil_image
from .xai_service import attach_explanation


def _wants_explanation(request, default: bool) -> bool:
    """explain=1/0 in the form data or query string; falls back to `default`."""
    v = request.POST.get("explain", request.GET.get("explain"))
    if v is None:
        return default
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def index(request):
    return render(request, "classifier/index.html")


@csrf_exempt
def predict(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    f = request.FILES.get("image")
    if not f:
        return JsonResponse({"error": "No image uploaded"}, status=400)

    try:
        img = Image.open(f).convert("RGB")
    except Exception as e:
        return JsonResponse({"error": f"Invalid image: {e}"}, status=400)

    pred = predict_pil_image(img, topk=5)
    # Heatmap and cover test; on by default for uploads
    if _wants_explanation(request, default=True):
        pred = attach_explanation(pred, img)
    return JsonResponse(pred, status=200 if "error" not in pred else 500)



@csrf_exempt
def predict_frame(request):
    """
    Receives a single webcam JPEG frame and returns prediction.
    Frontend calls this repeatedly.
    """
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    f = request.FILES.get("frame")
    if not f:
        return JsonResponse({"error": "No frame provided"}, status=400)

    try:
        img = Image.open(f).convert("RGB")
    except Exception as e:
        return JsonResponse({"error": f"Invalid frame: {e}"}, status=400)

    pred = predict_pil_image(img, topk=5)
    # Live frames stay fast; explanations only when requested
    if _wants_explanation(request, default=False):
        pred = attach_explanation(pred, img)
    return JsonResponse(pred, status=200 if "error" not in pred else 500)


class HomeView(TemplateView):
    template_name = 'index.html'

# class AboutView(TemplateView):
#     template_name = 'about.html'

class AnalyzerView(TemplateView):
    template_name = 'analyzer.html'

class ContactView(TemplateView):
    template_name = 'contact.html'

class PrivacyView(TemplateView):
    template_name = 'privacy.html'

@require_POST
def contact_submit(request):
    form = ContactForm(request.POST)

    if not form.is_valid():
        return JsonResponse(
            {"ok": False, "errors": form.errors},
            status=400
        )

    msg_obj = form.save()

    # email notification
    try:
        subject = f"New Dermopsis message: {msg_obj.get_collaboration_type_display()} - {msg_obj.name}"
        body = (
            f"Name: {msg_obj.name}\n"
            f"Email: {msg_obj.email}\n"
            f"Organisation: {msg_obj.organization}\n"
            f"Interest: {msg_obj.get_collaboration_type_display()}\n\n"
            f"Message:\n{msg_obj.message}\n"
        )
        recipient = getattr(settings, "CONTACT_RECEIVER_EMAIL", None) or getattr(settings, "DEFAULT_FROM_EMAIL", None)
        if recipient:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [recipient], fail_silently=True)
    except Exception:
        # Do not fail the request if email fails
        pass

    return JsonResponse({"ok": True, "message": "Message received. We will respond within 2–3 business days."})