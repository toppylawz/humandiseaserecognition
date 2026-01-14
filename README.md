Skin Disease Recognition System

This is a web-based artificial intelligence system for preliminary skin disease recognition using deep learning.
The system integrates a two-stage model pipeline to ensure safer and more reliable predictions.

🔍 How It Works

Input Validation (Gate Model)
Filters non-human or invalid images (e.g. objects, animals, backgrounds) before analysis.

Disease Classification Model
Predicts one of 34 dermatological conditions (including healthy skin) and returns Top-1 and Top-5 confidence scores.

Only images confirmed as valid human skin are passed to the disease model.

✨ Key Features

Image upload and webcam-based prediction

Human-skin validation before classification

Confidence-aware rejection of uncertain inputs

Django backend with REST endpoints

Responsive web interface

HTTPS-enabled production deployment

🧠 Technology Stack

Backend: Python, Django

AI Models: YOLO (classification mode)

Frontend: HTML, CSS, JavaScript

Deployment: DigitalOcean, Nginx, Gunicorn

⚠️ Disclaimer

This system is for research and educational purposes only.
It is not a medical diagnostic tool and must not replace professional medical advice.

📌 Future Work

Larger-scale input validation training

Health recommendation system

Model explainability and interpretability

Continuous performance evaluation

👤 Author

Adeolu Temitope Olofintuyi
MSc Research Project title: Building a Human Disease Identification Model by image-based classification of dermatological conditions
