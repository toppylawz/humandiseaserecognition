// Toast Notification System
function showToast(message, type = 'info', duration = 5000) {
    const toastRoot = document.getElementById('toastRoot');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    toastRoot.appendChild(toast);
    
    const timer = setTimeout(() => {
        toast.remove();
    }, duration);
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(timer);
        toast.remove();
    });
}

// Set loading state on button
function setLoading(button, isLoading) {
    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.innerHTML = '<span style="margin-right: 8px;">⏳</span>' + button.textContent;
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeFileUpload();
    initializeWebcam();
    
    // Show welcome message
    setTimeout(() => {
        showToast('Welcome to Skin Disease Classifier!', 'info', 3000);
    }, 1000);
});

// File Upload Handler
function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const predictBtn = document.getElementById('btnPredictUpload');
    const uploadResult = document.getElementById('uploadResult');
    
    predictBtn.addEventListener('click', async function() {
        const file = fileInput.files[0];
        if (!file) {
            showToast('Please select an image first.', 'warning', 3000);
            return;
        }
        
        setLoading(predictBtn, true);
        
        try {
            const form = new FormData();
            form.append("image", file);
            
            showToast('Analyzing image...', 'info', 2000);
            
            const response = await fetch("/predict/", {
                method: "POST",
                body: form
            });
            
            if (!response.ok) {
                throw new Error('Prediction failed');
            }
            
            const data = await response.json();
            
            // Display results
            const top1 = data.top1;
            const confPct = (top1.confidence * 100).toFixed(2);

            let html = `<b>🔍 Diagnosis Result:</b><br>`;
            html += `<div style="background: #667eea; color: white; padding: 10px; border-radius: 8px; margin: 10px 0;">
                       <strong>${top1.label}</strong><br>
                       <span style="font-size: 1.2em;">${confPct}% confidence</span>
                     </div>`;
            html += `<b>📊 Top 5 Predictions:</b><ol>`;
            data.top5.forEach((x, index) => {
                html += `<li>${x.label} (${(x.confidence*100).toFixed(2)}%)</li>`;
            });
            html += `</ol>`;
            
            uploadResult.innerHTML = html;
            uploadResult.style.display = "block";
            
            showToast('Analysis complete!', 'success', 3000);
        } catch (error) {
            showToast('Error: ' + error.message, 'error', 4000);
        } finally {
            setLoading(predictBtn, false);
        }
    });
}

// Webcam Handler
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
        setLoading(btnStart, true);
        
        try {
            // Try to get user media
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'environment' // Use rear camera on mobile
                },
                audio: false
            };
            
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            
            // Wait for video to load
            await new Promise(resolve => {
                video.onloadedmetadata = resolve;
            });
            
            btnStart.disabled = true;
            btnStop.disabled = false;
            btnLive.disabled = false;
            
            showToast('Webcam started successfully!', 'success', 3000);
            
        } catch (error) {
            console.error('Webcam error:', error);
            
            // Try with simpler constraints if the first attempt fails
            try {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true, 
                    audio: false 
                });
                video.srcObject = stream;
                
                btnStart.disabled = true;
                btnStop.disabled = false;
                btnLive.disabled = false;
                
                showToast('Webcam started!', 'success', 3000);
            } catch (secondError) {
                showToast('Could not access camera. Please check permissions.', 'error', 5000);
            }
        } finally {
            setLoading(btnStart, false);
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
        
        showToast('Webcam stopped', 'info', 3000);
    });
    
    // Live Prediction
    btnLive.addEventListener('click', async function() {
        if (!stream) {
            showToast('Please start webcam first.', 'warning', 3000);
            return;
        }
        
        if (!isLivePredicting) {
            isLivePredicting = true;
            liveTimer = setInterval(sendFrame, 700);
            btnLive.textContent = "Stop Live Predict";
            btnLive.style.background = 'linear-gradient(90deg, #f56565 0%, #e53e3e 100%)';
            showToast('Live prediction started', 'success', 3000);
        } else {
            isLivePredicting = false;
            clearInterval(liveTimer);
            liveTimer = null;
            btnLive.textContent = "Start Live Predict";
            btnLive.style.background = 'linear-gradient(90deg, #ed8936 0%, #dd6b20 100%)';
            showToast('Live prediction stopped', 'info', 3000);
        }
    });
    
    async function sendFrame() {
        if (!stream || !isLivePredicting) return;
        
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
                
                // Display results
                const top1 = data.top1;
                const confPct = (top1.confidence * 100).toFixed(2);

                let html = `<b>🔍 Live Diagnosis:</b><br>`;
                html += `<div style="background: #667eea; color: white; padding: 10px; border-radius: 8px; margin: 10px 0;">
                           <strong>${top1.label}</strong><br>
                           <span style="font-size: 1.2em;">${confPct}% confidence</span>
                         </div>`;
                html += `<b>📊 Top 5:</b><ol>`;
                data.top5.forEach((x, index) => {
                    html += `<li>${x.label} (${(x.confidence*100).toFixed(2)}%)</li>`;
                });
                html += `</ol>`;
                
                camResult.innerHTML = html;
                camResult.style.display = "block";
            }
        } catch (error) {
            console.error('Frame prediction error:', error);
        }
    }
}

// Add CSS for toasts
const style = document.createElement('style');
style.textContent = `
.toast-root {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
}

.toast {
    padding: 12px 16px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease;
}

.toast.info {
    background: linear-gradient(90deg, #4299e1 0%, #3182ce 100%);
}

.toast.success {
    background: linear-gradient(90deg, #48bb78 0%, #38a169 100%);
}

.toast.warning {
    background: linear-gradient(90deg, #ed8936 0%, #dd6b20 100%);
}

.toast.error {
    background: linear-gradient(90deg, #f56565 0%, #e53e3e 100%);
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}

.toast-close {
    background: none;
    border: none;
    color: white;
    margin-left: 10px;
    cursor: pointer;
    font-size: 1.2em;
}
`;
document.head.appendChild(style);