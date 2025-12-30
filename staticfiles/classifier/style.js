// Toast Notification System
class Toast {
    static show(message, type = 'info', duration = 5000) {
        const toastRoot = document.getElementById('toastRoot');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close">&times;</button>
        `;
        
        toastRoot.appendChild(toast);
        
        // Auto remove after duration
        const timer = setTimeout(() => {
            toast.remove();
        }, duration);
        
        // Close button
        toast.querySelector('.toast-close').addEventListener('click', () => {
            clearTimeout(timer);
            toast.remove();
        });
        
        return toast;
    }
}

// Loading State Manager
const LoadingState = {
    setLoading(button, isLoading) {
        if (isLoading) {
            button.dataset.originalText = button.textContent;
            button.innerHTML = `<span class="loading"></span>${button.textContent}`;
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
        }
    }
};

// Result Visualization with Animation
class ResultVisualizer {
    static animateConfidenceBars() {
        setTimeout(() => {
            document.querySelectorAll('.confidence-level').forEach(bar => {
                const width = bar.style.width;
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = width;
                }, 100);
            });
        }, 300);
    }
    
    static createResultHTML(data) {
        const top1 = data.top1;
        const confPct = (top1.confidence * 100).toFixed(2);
        
        let html = `
            <div style="margin-bottom: 20px;">
                <b style="font-size: 1.1rem;">🔍 Diagnosis Result:</b>
                <div style="display: flex; align-items: center; margin-top: 10px;">
                    <span style="background: #667eea; color: white; padding: 8px 16px; border-radius: 8px; font-weight: 600; margin-right: 15px;">
                        ${top1.label}
                    </span>
                    <span style="font-size: 1.2rem; font-weight: 700; color: #2d3748;">
                        ${confPct}%
                    </span>
                </div>
                <div class="confidence-bar">
                    <div class="confidence-level" style="width: ${confPct}%"></div>
                </div>
            </div>
            
            <b style="display: block; margin-bottom: 10px;">📊 Top 5 Predictions:</b>
            <ol style="list-style: none; padding: 0;">
        `;
        
        data.top5.forEach((x, index) => {
            const percentage = (x.confidence * 100).toFixed(2);
            const barWidth = Math.min(percentage, 100);
            html += `
                <li style="margin-bottom: 12px; padding: 10px; background: #f8fafc; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <span>
                            <span style="display: inline-block; width: 24px; height: 24px; background: #667eea; color: white; border-radius: 50%; text-align: center; line-height: 24px; margin-right: 10px;">
                                ${index + 1}
                            </span>
                            ${x.label}
                        </span>
                        <span style="font-weight: 600; color: #4a5568;">${percentage}%</span>
                    </div>
                    <div class="confidence-bar">
                        <div class="confidence-level" style="width: ${barWidth}%"></div>
                    </div>
                </li>
            `;
        });
        
        html += `</ol>`;
        return html;
    }
}

// Main Application Initialization
document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI elements
    initializeFileUpload();
    initializeWebcam();
    initializeButtons();
    initializeTheme();
});

function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const predictBtn = document.getElementById('btnPredictUpload');
    const uploadResult = document.getElementById('uploadResult');
    
    // Preview file before upload
    fileInput.addEventListener('change', function(e) {
        if (e.target.files[0]) {
            const fileName = e.target.files[0].name;
            Toast.show(`Selected: ${fileName}`, 'info', 3000);
            
            // Preview image
            const reader = new FileReader();
            reader.onload = function(e) {
                uploadResult.innerHTML = `
                    <div style="text-align: center; margin-bottom: 15px;">
                        <img src="${e.target.result}" style="max-width: 200px; max-height: 200px; border-radius: 10px; border: 3px solid #e2e8f0;">
                    </div>
                `;
                uploadResult.style.display = 'block';
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });
    
    // Predict button
    predictBtn.addEventListener('click', async function() {
        const file = fileInput.files[0];
        if (!file) {
            Toast.show('Please select an image first.', 'warning', 3000);
            return;
        }
        
        LoadingState.setLoading(predictBtn, true);
        
        try {
            const form = new FormData();
            form.append("image", file);
            
            Toast.show('Analyzing image...', 'info', 2000);
            
            const response = await fetch("/predict/", {
                method: "POST",
                body: form
            });
            
            if (!response.ok) {
                throw new Error('Prediction failed');
            }
            
            const data = await response.json();
            
            uploadResult.innerHTML = ResultVisualizer.createResultHTML(data);
            uploadResult.style.display = "block";
            
            ResultVisualizer.animateConfidenceBars();
            
            Toast.show('Analysis complete!', 'success', 3000);
        } catch (error) {
            Toast.show('Error: ' + error.message, 'error', 4000);
        } finally {
            LoadingState.setLoading(predictBtn, false);
        }
    });
}

function initializeWebcam() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnLive = document.getElementById('btnLive');
    const camResult = document.getElementById('camResult');
    
    let stream = null;
    let liveTimer = null;
    let isLivePredicting = false;
    
    // Start Webcam
    btnStart.addEventListener('click', async function() {
        try {
            LoadingState.setLoading(btnStart, true);
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'environment'
                }, 
                audio: false 
            });
            
            video.srcObject = stream;
            
            // Wait for video to load
            await new Promise(resolve => {
                video.onloadedmetadata = resolve;
            });
            
            btnStart.disabled = true;
            btnStop.disabled = false;
            btnLive.disabled = false;
            
            Toast.show('Webcam started successfully!', 'success', 3000);
        } catch (error) {
            Toast.show('Error accessing webcam: ' + error.message, 'error', 4000);
        } finally {
            LoadingState.setLoading(btnStart, false);
        }
    });
    
    // Stop Webcam
    btnStop.addEventListener('click', function() {
        if (isLivePredicting) {
            clearInterval(liveTimer);
            liveTimer = null;
            isLivePredicting = false;
            btnLive.textContent = "Start Live Predict";
        }
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        video.srcObject = null;
        btnStart.disabled = false;
        btnStop.disabled = true;
        btnLive.disabled = true;
        
        Toast.show('Webcam stopped', 'info', 3000);
    });
    
    // Live Prediction
    btnLive.addEventListener('click', function() {
        if (!stream) {
            Toast.show('Please start webcam first.', 'warning', 3000);
            return;
        }
        
        if (!isLivePredicting) {
            isLivePredicting = true;
            liveTimer = setInterval(sendFrame, 700);
            btnLive.textContent = "Stop Live Predict";
            btnLive.style.background = 'linear-gradient(90deg, #f56565 0%, #e53e3e 100%)';
            Toast.show('Live prediction started', 'success', 3000);
        } else {
            isLivePredicting = false;
            clearInterval(liveTimer);
            liveTimer = null;
            btnLive.textContent = "Start Live Predict";
            btnLive.style.background = 'linear-gradient(90deg, #ed8936 0%, #dd6b20 100%)';
            Toast.show('Live prediction stopped', 'info', 3000);
        }
    });
    
    async function sendFrame() {
        if (!stream) return;
        
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return;
        
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, w, h);
        
        try {
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', 0.85);
            });
            
            const form = new FormData();
            form.append("frame", blob, "frame.jpg");
            
            const response = await fetch("/predict-frame/", {
                method: "POST",
                body: form
            });
            
            if (response.ok) {
                const data = await response.json();
                camResult.innerHTML = ResultVisualizer.createResultHTML(data);
                camResult.style.display = "block";
                ResultVisualizer.animateConfidenceBars();
            }
        } catch (error) {
            console.error('Prediction error:', error);
        }
    }
}

function initializeButtons() {
    // Add ripple effect to all buttons
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const ripple = document.createElement('span');
            ripple.style.cssText = `
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.7);
                transform: scale(0);
                animation: ripple 0.6s linear;
                pointer-events: none;
                width: 100px;
                height: 100px;
                top: ${y - 50}px;
                left: ${x - 50}px;
            `;
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

function initializeTheme() {
    // Add CSS for ripple animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const btnStop = document.getElementById('btnStop');
            if (!btnStop.disabled) {
                btnStop.click();
            }
        }
        
        if (e.key === ' ' && e.target === document.body) {
            e.preventDefault();
            const btnLive = document.getElementById('btnLive');
            if (!btnLive.disabled) {
                btnLive.click();
            }
        }
    });
    
    // Add tooltips
    const tooltips = {
        'btnPredictUpload': 'Upload and analyze an image (Ctrl+U)',
        'btnStart': 'Start webcam (Ctrl+W)',
        'btnStop': 'Stop webcam (Esc)',
        'btnLive': 'Toggle live prediction (Space)',
        'fileInput': 'Select a skin image for analysis'
    };
    
    Object.entries(tooltips).forEach(([id, text]) => {
        const element = document.getElementById(id);
        if (element) {
            element.title = text;
        }
    });
}

// Export for global use
window.SkinDiseaseClassifier = {
    Toast,
    LoadingState,
    ResultVisualizer
};

// Show welcome message
window.addEventListener('load', function() {
    setTimeout(() => {
        Toast.show('Welcome to Skin Disease Classifier!', 'info', 4000);
    }, 1000);
});