// Enhanced Toast System
class ToastSystem {
    static show(message, type = 'info', duration = 4000) {
        const toastRoot = document.getElementById('toastRoot');
        if (!toastRoot) return null;
        
        // Remove existing toasts if too many
        const existingToasts = toastRoot.querySelectorAll('.toast');
        if (existingToasts.length > 3) {
            existingToasts[0].remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close" aria-label="Close notification">&times;</button>
        `;
        
        toastRoot.appendChild(toast);
        
        // Close button functionality
        const closeBtn = toast.querySelector('.toast-close');
        const closeToast = () => {
            toast.classList.add('hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        };
        
        closeBtn.addEventListener('click', closeToast);
        
        // Auto-dismiss after duration
        const timer = setTimeout(closeToast, duration);
        
        // Pause timer on hover
        toast.addEventListener('mouseenter', () => {
            clearTimeout(timer);
        });
        
        toast.addEventListener('mouseleave', () => {
            setTimeout(closeToast, duration);
        });
        
        return toast;
    }
}

// Camera Manager with Front/Back Switching
// Camera Manager with Front/Back Switching (Mobile-safe)
class CameraManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.stream = null;

        this.availableDevices = [];
        this.devicesEnumerated = false;

        // Prefer facingMode switching on mobile
        this.currentFacingMode = 'user'; // 'user' (front) or 'environment' (back)

        this.isCameraActive = false;
    }

    async ensurePermission() {
        // Many browsers (esp iOS) will not fully reveal devices until permission is granted
        if (this.stream) return;

        try {
            const tmpStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            // Stop immediately; this is just to unlock enumerateDevices reliability
            tmpStream.getTracks().forEach(t => t.stop());
        } catch (e) {
            // If permission denied, bubble it up
            throw e;
        }
    }

    async enumerateDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableDevices = devices.filter(d => d.kind === 'videoinput');
            this.devicesEnumerated = true;
            console.log('Available cameras:', this.availableDevices);
            return this.availableDevices;
        } catch (error) {
            console.error('Error enumerating devices:', error);
            this.availableDevices = [];
            this.devicesEnumerated = false;
            return [];
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        this.stream = null;
        this.video.srcObject = null;
        this.isCameraActive = false;
    }

    async startCamera({ facingMode = null, deviceId = null } = {}) {
        // Stop existing stream first
        if (this.stream) {
            this.stopCamera();
        }

        // Ensure we have permission so enumerateDevices is reliable
        await this.ensurePermission();

        // Enumerate after permission
        await this.enumerateDevices();

        // Build constraints
        const baseVideo = {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
        };

        let constraints;

        if (deviceId) {
            // Use deviceId only when explicitly chosen as a fallback
            constraints = {
                video: { ...baseVideo, deviceId: { ideal: deviceId } },
                audio: false
            };
        } else {
            const mode = facingMode || this.currentFacingMode;

            // Prefer facingMode switching (most compatible on mobile)
            constraints = {
                video: { ...baseVideo, facingMode: { ideal: mode } },
                audio: false
            };
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.isCameraActive = true;

            // Update facingMode from actual track settings when available
            const track = this.stream.getVideoTracks()[0];
            const settings = track?.getSettings?.() || {};
            if (settings.facingMode) {
                this.currentFacingMode = settings.facingMode;
            }

            await new Promise(resolve => {
                if (this.video.readyState >= 3) resolve();
                else this.video.onloadedmetadata = resolve;
            });

            return true;
        } catch (error) {
            console.error('Camera start failed (primary):', error);

            // Strong fallback: try exact facingMode (some browsers behave better with exact)
            if (!deviceId) {
                try {
                    const mode = facingMode || this.currentFacingMode;
                    this.stream = await navigator.mediaDevices.getUserMedia({
                        video: { ...baseVideo, facingMode: { exact: mode } },
                        audio: false
                    });
                    this.video.srcObject = this.stream;
                    this.isCameraActive = true;
                    return true;
                } catch (e2) {
                    console.error('Camera start failed (exact facingMode):', e2);
                }
            }

            // Last resort fallback: just video:true
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            this.video.srcObject = this.stream;
            this.isCameraActive = true;
            return true;
        }
    }

    async switchCamera() {
        if (!this.isCameraActive) {
            ToastSystem.show('Please start the camera first', 'warning', 3000);
            return false;
        }

        // Attempt 1: toggle facingMode (best for mobile)
        const nextFacing = (this.currentFacingMode === 'user') ? 'environment' : 'user';

        try {
            await this.startCamera({ facingMode: nextFacing });
            this.currentFacingMode = nextFacing;
            return true;
        } catch (e) {
            console.error('FacingMode switch failed, falling back to deviceId rotation:', e);
        }

        // Attempt 2: fallback to rotating deviceId list (works better on some Android devices)
        await this.enumerateDevices();
        if (this.availableDevices.length < 2) {
            ToastSystem.show('Only one camera available on this device', 'info', 3000);
            return false;
        }

        // Find current deviceId if possible
        const currentTrack = this.stream?.getVideoTracks?.()[0];
        const currentSettings = currentTrack?.getSettings?.() || {};
        const currentDeviceId = currentSettings.deviceId;

        let idx = this.availableDevices.findIndex(d => d.deviceId === currentDeviceId);
        idx = (idx === -1) ? 0 : idx;
        const nextIdx = (idx + 1) % this.availableDevices.length;

        try {
            await this.startCamera({ deviceId: this.availableDevices[nextIdx].deviceId });
            return true;
        } catch (error) {
            console.error('Failed to switch camera (deviceId fallback):', error);
            ToastSystem.show('Failed to switch camera', 'error', 3000);
            return false;
        }
    }

    getCurrentCameraLabel() {
        // Labels are often empty on mobile; rely on facingMode where possible
        if (this.currentFacingMode === 'user') return 'Front Camera';
        if (this.currentFacingMode === 'environment') return 'Back Camera';
        return 'Camera';
    }

    isActive() {
        return this.isCameraActive;
    }
}

// Main Application
class DermatologyAIApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.btnStart = document.getElementById('btnStart');
        this.btnStop = document.getElementById('btnStop');
        this.btnLive = document.getElementById('btnLive');
        this.btnPredictUpload = document.getElementById('btnPredictUpload');
        this.btnSwitchCamera = document.getElementById('btnSwitchCamera');
        this.fileInput = document.getElementById('fileInput');
        this.filePreview = document.getElementById('filePreview');
        this.previewImage = document.getElementById('previewImage');
        this.uploadResult = document.getElementById('uploadResult');
        this.camResult = document.getElementById('camResult');
        this.scrollIndicator = document.getElementById('scrollIndicator');
        
        this.cameraManager = new CameraManager(this.video);
        this.liveTimer = null;
        this.isLivePredicting = false;
        this.currentFile = null;
        this.currentBlobUrl = null;
        
        this.init();
    }
    
    init() {
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup mobile scroll indicator
        this.setupScrollIndicator();
        
        // Show welcome message
        setTimeout(() => {
            ToastSystem.show('Welcome to Dermatology AI Assistant!', 'info', 3000);
        }, 1000);
    }
    
    setupEventListeners() {
        // File Upload
        this.btnPredictUpload.addEventListener('click', () => this.analyzeUpload());
        
        // File input change for preview
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this.currentFile = e.target.files[0];
                this.showFilePreview(this.currentFile);
            }
        });
        
        // Camera Controls
        this.btnStart.addEventListener('click', () => this.startCamera());
        this.btnStop.addEventListener('click', () => this.stopCamera());
        this.btnLive.addEventListener('click', () => this.toggleLiveAnalysis());
        this.btnSwitchCamera.addEventListener('click', () => this.switchCamera());
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.cameraManager.isActive()) {
                this.stopCamera();
                ToastSystem.show('Camera stopped due to page background', 'info', 3000);
            }
        });
        
        // Handle mobile orientation changes
        window.addEventListener('orientationchange', () => {
            // Small delay to allow orientation to complete
            setTimeout(() => {
                if (this.cameraManager.isActive()) {
                    this.stopCamera();
                    setTimeout(() => this.startCamera(), 300);
                }
            }, 300);
        });
    }
    
    setupScrollIndicator() {
        // Hide scroll indicator on scroll
        window.addEventListener('scroll', () => {
            if (window.scrollY > 100) {
                this.scrollIndicator.style.opacity = '0';
                this.scrollIndicator.style.transition = 'opacity 0.5s ease';
            }
        });
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.scrollIndicator.style.opacity = '0';
            this.scrollIndicator.style.transition = 'opacity 0.5s ease';
        }, 5000);
    }
    
    showFilePreview(file) {
        if (!file) return;
        
        // Check if it's an image
        if (!file.type.match('image.*')) {
            ToastSystem.show('Please select an image file', 'error', 3000);
            this.filePreview.style.display = 'none';
            return;
        }
        
        // Create blob URL for better mobile compatibility
        const blobUrl = URL.createObjectURL(file);
        this.previewImage.src = blobUrl;
        this.filePreview.style.display = 'block';
        
        // Clean up previous blob URL if exists
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
        }
        this.currentBlobUrl = blobUrl;
        
        // Mobile-specific adjustments
        this.previewImage.style.maxWidth = '100%';
        this.previewImage.style.maxHeight = '200px';
        this.previewImage.style.objectFit = 'contain';
        
        ToastSystem.show('Image loaded for preview', 'info', 2000);
    }
    
    async startCamera() {
        // Update button state
        this.setButtonLoading(this.btnStart, true, '<i class="fas fa-spinner fa-spin"></i> Starting...');
        
        try {
            await this.cameraManager.startCamera();
            
            // Update UI state
            this.btnStart.disabled = true;
            this.btnStop.disabled = false;
            this.btnLive.disabled = false;
            this.btnSwitchCamera.disabled = false;
            this.setButtonLoading(this.btnStart, false, '<i class="fas fa-play"></i> Start Camera');
            
            ToastSystem.show(`${this.cameraManager.getCurrentCameraLabel()} started successfully`, 'success', 2000);
            
        } catch (error) {
            console.error('Camera error:', error);
            this.setButtonLoading(this.btnStart, false, '<i class="fas fa-play"></i> Start Camera');
            
            let errorMessage = 'Could not access camera. ';
            if (error.name === 'NotAllowedError') {
                errorMessage += 'Please allow camera permissions.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No camera found on your device.';
            } else if (error.name === 'NotReadableError') {
                errorMessage += 'Camera is in use by another application.';
            } else {
                errorMessage += error.message;
            }
            
            ToastSystem.show(errorMessage, 'error', 4000);
            this.btnStart.disabled = false;
        }
    }
    
    stopCamera() {
        // Stop live analysis if running
        if (this.isLivePredicting) {
            this.toggleLiveAnalysis();
        }
        
        // Stop camera
        this.cameraManager.stopCamera();
        
        // Update UI state
        this.btnStart.disabled = false;
        this.btnStop.disabled = true;
        this.btnLive.disabled = true;
        this.btnSwitchCamera.disabled = true;
        this.btnLive.innerHTML = '<i class="fas fa-broadcast-tower"></i> Start Live Analysis';
        
        ToastSystem.show('Camera stopped', 'info', 2000);
    }
    
    async switchCamera() {
        if (!this.cameraManager.isActive()) {
            ToastSystem.show('Please start the camera first', 'warning', 3000);
            return;
        }
        
        // Disable button during switch
        this.btnSwitchCamera.disabled = true;
        this.setButtonLoading(this.btnSwitchCamera, true, '<i class="fas fa-sync-alt fa-spin"></i>');
        
        // Animate the switch button
        this.btnSwitchCamera.style.transform = 'rotate(180deg)';
        
        try {
            const success = await this.cameraManager.switchCamera();
            
            if (success) {
                ToastSystem.show(`Switched to ${this.cameraManager.getCurrentCameraLabel()}`, 'success', 2000);
            }
        } catch (error) {
            console.error('Camera switch error:', error);
            ToastSystem.show('Failed to switch camera', 'error', 3000);
        } finally {
            // Re-enable button
            setTimeout(() => {
                this.btnSwitchCamera.style.transform = 'rotate(0deg)';
                this.setButtonLoading(this.btnSwitchCamera, false, '<i class="fas fa-sync-alt"></i>');
                this.btnSwitchCamera.disabled = false;
            }, 500);
        }
    }
    
    async analyzeUpload() {
        if (!this.currentFile) {
            ToastSystem.show('Please select an image first', 'warning', 3000);
            return;
        }
        
        // Check file size (10MB max)
        if (this.currentFile.size > 10 * 1024 * 1024) {
            ToastSystem.show('File too large. Maximum size is 10MB.', 'error', 4000);
            return;
        }
        
        // Show loading state
        this.setButtonLoading(this.btnPredictUpload, true, '<i class="fas fa-spinner fa-spin"></i> Analyzing...');
        
        const formData = new FormData();
        formData.append("image", this.currentFile);
        
        try {
            const response = await fetch("/predict/", {
                method: "POST",
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Analysis failed');
            }
            
            const data = await response.json();
            
            // Check if it's a rejected image (non-skin or low confidence)
            if (data.rejected) {
                this.showRejectedResult(data);
                ToastSystem.show('Image may not be suitable for analysis', 'warning', 3000);
            } else if (data.error) {
                this.showErrorResult(data.error);
                ToastSystem.show('Analysis error: ' + data.error, 'error', 4000);
            } else {
                this.showAnalysisResult(data);
                ToastSystem.show('Analysis complete!', 'success', 3000);
            }
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showErrorResult(error.message);
            ToastSystem.show('Error: ' + error.message, 'error', 4000);
        } finally {
            this.setButtonLoading(this.btnPredictUpload, false, '<i class="fas fa-search"></i> Analyze Image');
        }
    }
    
    showRejectedResult(data) {
        const confPct = (data.confidence * 100).toFixed(2);
        this.uploadResult.innerHTML = `
            <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 20px; border-radius: 8px;">
                <h4 style="color: #ef6c00; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-triangle"></i> Predict
                </h4>
                <p style="color: #5d4037; margin-bottom: 8px;">
                    <strong>Result:</strong> ${data.label}
                </p>
                <p style="color: #5d4037; margin-bottom: 8px;">
                    <strong>Reason:</strong> Low confidence / uncertain image.
                </p>
                <p style="color: #5d4037; margin-bottom: 15px;">
                    <strong>Model confidence:</strong> ${confPct}%
                </p>
                <div class="confidence-meter">
                    <div class="confidence-fill" style="width: ${confPct}%"></div>
                </div>
                <div style="margin-top: 15px; padding: 12px; background: #fff8e1; border-radius: 6px;">
                    <p style="color: #5d4037; margin: 0; font-size: 0.9rem;">
                        <i class="fas fa-lightbulb"></i> 
                        <strong>Tip:</strong> Use a clear, close-up skin image with good lighting.
                    </p>
                </div>
            </div>
        `;
        this.uploadResult.classList.add('active');
        this.animateConfidenceBars();
    }
    
    showErrorResult(errorMessage) {
        this.uploadResult.innerHTML = `
            <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 20px; border-radius: 8px;">
                <h4 style="color: #d32f2f; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-circle"></i> Analysis Error
                </h4>
                <p style="color: #5d4037;">${errorMessage}</p>
            </div>
        `;
        this.uploadResult.classList.add('active');
    }
    
    showAnalysisResult(data) {
        const top1 = data.top1;
        const confPct = (top1.confidence * 100).toFixed(2);
        
        let html = `
            <div style="margin-bottom: 20px;">
                <h4 style="color: #2c3e50; margin-bottom: 15px;">
                    <i class="fas fa-diagnoses"></i> Primary Assessment
                </h4>
                <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; border-left: 4px solid #4caf50;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <span style="font-size: 1.1rem; font-weight: 600; color: #2e7d32;">${top1.label}</span>
                        <span style="font-size: 1.3rem; font-weight: 700; color: #1b5e20;">${confPct}%</span>
                    </div>
                    <div class="confidence-meter">
                        <div class="confidence-fill" style="width: ${confPct}%"></div>
                    </div>
                    <p style="color: #388e3c; margin-top: 10px; font-size: 0.9rem;">
                        <i class="fas fa-chart-line"></i> Model confidence level
                    </p>
                </div>
            </div>
            
            <div>
                <h4 style="color: #2c3e50; margin-bottom: 15px;">
                    <i class="fas fa-list-ol"></i> Differential Diagnosis (Top 5)
                </h4>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
                    <ol style="margin: 0; padding-left: 20px;">
        `;
        
        data.top5.forEach((x, index) => {
            const percentage = (x.confidence * 100).toFixed(2);
            const barWidth = Math.min(percentage, 100);
            html += `
                <li style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: ${index === data.top5.length - 1 ? 'none' : '1px solid #e0e0e0'};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-weight: 600; color: #37474f;">
                            <span style="display: inline-block; width: 24px; height: 24px; background: #3498db; color: white; border-radius: 50%; text-align: center; line-height: 24px; margin-right: 10px; font-size: 0.9rem;">
                                ${index + 1}
                            </span>
                            ${x.label}
                        </span>
                        <span style="font-weight: 700; color: #455a64;">${percentage}%</span>
                    </div>
                    <div class="confidence-meter">
                        <div class="confidence-fill" style="width: ${barWidth}%; background: linear-gradient(90deg, rgba(52, 152, 219, 0.8) 0%, rgba(41, 128, 185, 0.8) 100%);"></div>
                    </div>
                </li>
            `;
        });
        
        html += `
                    </ol>
                    <p style="color: #546e7a; margin-top: 15px; font-size: 0.9rem; font-style: italic;">
                        <i class="fas fa-info-circle"></i> Differential diagnoses listed by confidence level.
                    </p>
                </div>
            </div>
        `;
        
        this.uploadResult.innerHTML = html;
        this.uploadResult.classList.add('active');
        this.animateConfidenceBars();
    }
    
    toggleLiveAnalysis() {
        if (!this.cameraManager.isActive()) {
            ToastSystem.show('Please start camera first', 'warning', 3000);
            return;
        }
        
        if (this.isLivePredicting) {
            // Stop live analysis
            clearInterval(this.liveTimer);
            this.liveTimer = null;
            this.isLivePredicting = false;
            this.btnLive.innerHTML = '<i class="fas fa-broadcast-tower"></i> Start Live Analysis';
            ToastSystem.show('Live analysis stopped', 'info', 2000);
        } else {
            // Start live analysis
            this.isLivePredicting = true;
            this.liveTimer = setInterval(() => this.sendFrame(), 700);
            this.btnLive.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Live Analysis';
            ToastSystem.show('Live analysis started', 'success', 2000);
        }
    }
    
    async sendFrame() {
        if (!this.cameraManager.isActive() || !this.isLivePredicting) return;
        
        const w = this.video.videoWidth;
        const h = this.video.videoHeight;
        if (!w || !h) return;
        
        this.canvas.width = w;
        this.canvas.height = h;
        const ctx = this.canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0, w, h);
        
        try {
            const blob = await new Promise(resolve => {
                this.canvas.toBlob(resolve, 'image/jpeg', 0.85);
            });
            
            const formData = new FormData();
            formData.append("frame", blob, "frame.jpg");
            
            const response = await fetch("/predict-frame/", {
                method: "POST",
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.rejected) {
                    const confPct = (data.confidence * 100).toFixed(2);
                    this.camResult.innerHTML = `
                        <div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 20px; border-radius: 8px;">
                            <h4 style="color: #ef6c00; margin-bottom: 10px;">
                                <i class="fas fa-exclamation-triangle"></i> Predict
                            </h4>
                            <p style="color: #5d4037; margin-bottom: 8px;">
                                <strong>Result:</strong> ${data.label}
                            </p>
                            <p style="color: #5d4037; margin-bottom: 8px;">
                                <strong>Reason:</strong> Low confidence / uncertain image.
                            </p>
                            <p style="color: #5d4037; margin-bottom: 15px;">
                                <strong>Model confidence:</strong> ${confPct}%
                            </p>
                            <div class="confidence-meter">
                                <div class="confidence-fill" style="width: ${confPct}%"></div>
                            </div>
                        </div>
                    `;
                } else if (data.error) {
                    this.camResult.innerHTML = `
                        <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 20px; border-radius: 8px;">
                            <h4 style="color: #d32f2f; margin-bottom: 10px;">
                                <i class="fas fa-exclamation-circle"></i> Live Analysis Error
                            </h4>
                            <p style="color: #5d4037;">${data.error}</p>
                        </div>
                    `;
                } else {
                    const top1 = data.top1;
                    const confPct = (top1.confidence * 100).toFixed(2);
                    
                    let html = `
                        <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; border-left: 4px solid #4caf50;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <span style="font-size: 1.1rem; font-weight: 600; color: #2e7d32;">${top1.label}</span>
                                <span style="font-size: 1.3rem; font-weight: 700; color: #1b5e20;">${confPct}%</span>
                            </div>
                            <div class="confidence-meter">
                                <div class="confidence-fill" style="width: ${confPct}%"></div>
                            </div>
                            <p style="color: #388e3c; margin-top: 10px; font-size: 0.9rem;">
                                <i class="fas fa-chart-line"></i> Live confidence level
                            </p>
                        </div>
                    `;
                    this.camResult.innerHTML = html;
                }
                this.camResult.classList.add('active');
                this.animateConfidenceBars();
            }
        } catch (error) {
            console.error('Frame analysis error:', error);
        }
    }
    
    animateConfidenceBars() {
        setTimeout(() => {
            const bars = document.querySelectorAll('.confidence-fill');
            bars.forEach(bar => {
                const width = bar.style.width;
                bar.style.width = '0%';
                setTimeout(() => {
                    bar.style.width = width;
                }, 100);
            });
        }, 300);
    }
    
    setButtonLoading(button, isLoading, loadingText) {
        if (isLoading) {
            button.dataset.originalText = button.innerHTML;
            button.innerHTML = loadingText;
            button.disabled = true;
        } else {
            if (button.dataset.originalText) {
                button.innerHTML = button.dataset.originalText;
            }
            button.disabled = false;
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Create global app instance
    window.app = new DermatologyAIApp();
});