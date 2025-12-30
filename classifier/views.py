import io
import json
from PIL import Image
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from .ml_model import predict_pil_image

def index(request):
    return render(request, "classifier/index.html")


@csrf_exempt
def predict_upload(request):
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
    return JsonResponse(pred)


@csrf_exempt
def predict_frame(request):
    """
    Receives a single webcam JPEG frame (blob) and returns prediction.
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
    return JsonResponse(pred)