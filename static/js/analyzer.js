//Dermatology AI Analyzer specific functionality

console.log('Dermatology AI Analyzer loaded');

// Enhanced Toast System (Keep this as it was working)
class ToastSystem {
    static show(message, type = 'info', duration = 4000) {
        const toastRoot = document.getElementById('toastRoot');
        if (!toastRoot) {
            console.warn('Toast root element not found');
            return null;
        }
        
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

// Camera Manager with Front Camera Default and Better Mobile Support
class CameraManager {
    constructor(videoElement) {
        this.video = videoElement;
        this.stream = null;
        this.currentCameraIndex = 0;
        this.availableDevices = [];
        this.isCameraActive = false;
        this.devicesEnumerated = false;
        this.currentFacingMode = 'user'; // Default to front camera
    }
    
    async enumerateDevices() {
        try {
            console.log('Enumerating devices...');
            
            // First, get user media to ensure we have permissions
            const tempStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 } },
                audio: false 
            });
            
            // Stop the temp stream
            tempStream.getTracks().forEach(track => track.stop());
            
            // Now enumerate devices with permissions granted
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableDevices = devices.filter(device => device.kind === 'videoinput');
            
            console.log('Found cameras:', this.availableDevices.length);
            
            // Try to identify front/back cameras better
            this.availableDevices.forEach((device, index) => {
                const label = device.label.toLowerCase();
                if (label.includes('front') || label.includes('user') || label.includes('face')) {
                    device.facingMode = 'user';
                } else if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                    device.facingMode = 'environment';
                } else if (index === 0) {
                    device.facingMode = 'user';
                } else {
                    device.facingMode = 'environment';
                }
            });
            
            // Sort devices so front cameras come first
            this.availableDevices.sort((a, b) => {
                const order = { 'user': 0, 'environment': 1 };
                const aOrder = order[a.facingMode] || 2;
                const bOrder = order[b.facingMode] || 2;
                return aOrder - bOrder;
            });
            
            console.log('Available cameras (sorted):', this.availableDevices);
            this.devicesEnumerated = true;
            return this.availableDevices;
        } catch (error) {
            console.error('Error enumerating devices:', error);
            // Fallback to basic enumeration
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                this.availableDevices = devices.filter(device => device.kind === 'videoinput');
                this.devicesEnumerated = true;
                console.log('Fallback enumeration found:', this.availableDevices.length, 'cameras');
                return this.availableDevices;
            } catch (fallbackError) {
                console.error('Fallback enumeration failed:', fallbackError);
                return [];
            }
        }
    }
    
    async startCamera(deviceId = null) {
        if (this.stream) {
            this.stopCamera();
        }
        
        // First, enumerate available devices if not done
        if (!this.devicesEnumerated) {
            await this.enumerateDevices();
        }
        
        if (this.availableDevices.length === 0) {
            throw new Error('No cameras found on device');
        }
        
        let constraints;
        
        // Try to find a front camera by default
        if (!deviceId) {
            const frontCamera = this.availableDevices.find(device => 
                device.facingMode === 'user' || 
                device.label.toLowerCase().includes('front') ||
                device.label.toLowerCase().includes('user')
            );
            
            if (frontCamera) {
                this.currentCameraIndex = this.availableDevices.findIndex(d => d.deviceId === frontCamera.deviceId);
                deviceId = frontCamera.deviceId;
            } else {
                // Fallback to first camera
                this.currentCameraIndex = 0;
                deviceId = this.availableDevices[0].deviceId;
            }
        }
        
        // Use deviceId for precise camera selection
        constraints = {
            video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };
        
        try {
            console.log('Starting camera with constraints:', constraints);
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;
            this.isCameraActive = true;
            
            // Try to detect current facing mode
            if (this.stream.getVideoTracks().length > 0) {
                const track = this.stream.getVideoTracks()[0];
                const settings = track.getSettings();
                this.currentFacingMode = settings.facingMode || null;
            }
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                if (this.video.readyState >= 3) {
                    resolve();
                } else {
                    this.video.onloadedmetadata = resolve;
                }
            });
            
            console.log('Camera started successfully');
            return true;
        } catch (error) {
            console.error('Camera start failed:', error);
            
            // Try fallback with facingMode
            try {
                constraints = {
                    video: {
                        facingMode: this.currentFacingMode || 'user',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    },
                    audio: false
                };
                
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.video.srcObject = this.stream;
                this.isCameraActive = true;
                console.log('Camera started with facingMode fallback');
                return true;
            } catch (facingModeError) {
                console.error('FacingMode fallback failed:', facingModeError);
                
                // Final fallback with simple constraints
                try {
                    this.stream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false
                    });
                    this.video.srcObject = this.stream;
                    this.isCameraActive = true;
                    console.log('Camera started with simple fallback');
                    return true;
                } catch (simpleError) {
                    console.error('Simple fallback failed:', simpleError);
                    throw simpleError;
                }
            }
        }
    }
    
    async switchCamera() {
        if (!this.isCameraActive) {
            ToastSystem.show('Please start the camera first', 'warning', 3000);
            return false;
        }
        
        if (this.availableDevices.length < 2) {
            ToastSystem.show('Only one camera available on this device', 'info', 3000);
            return false;
        }
        
        // Stop current stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        // Determine which camera to switch to
        const currentDevice = this.availableDevices[this.currentCameraIndex];
        const currentLabel = currentDevice.label.toLowerCase();
        
        let nextDevice;
        
        if (currentLabel.includes('front') || currentLabel.includes('user') || 
            (currentDevice.facingMode === 'user')) {
            // Currently on front camera, switch to back
            nextDevice = this.availableDevices.find(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('rear') ||
                device.label.toLowerCase().includes('environment') ||
                device.facingMode === 'environment'
            );
        } else {
            // Currently on back camera, switch to front
            nextDevice = this.availableDevices.find(device => 
                device.label.toLowerCase().includes('front') || 
                device.label.toLowerCase().includes('user') ||
                device.facingMode === 'user'
            );
        }
        
        // If no specific camera found, cycle to next
        if (!nextDevice) {
            this.currentCameraIndex = (this.currentCameraIndex + 1) % this.availableDevices.length;
            nextDevice = this.availableDevices[this.currentCameraIndex];
        } else {
            this.currentCameraIndex = this.availableDevices.findIndex(d => d.deviceId === nextDevice.deviceId);
        }
        
        // Update current facing mode
        this.currentFacingMode = nextDevice.facingMode || 
            (nextDevice.label.toLowerCase().includes('back') ? 'environment' : 'user');
        
        try {
            await this.startCamera(nextDevice.deviceId);
            return true;
        } catch (error) {
            console.error('Failed to switch camera:', error);
            
            // Try alternative approach
            try {
                this.currentFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user';
                await this.startCamera();
                return true;
            } catch (secondError) {
                console.error('Alternative switch also failed:', secondError);
                ToastSystem.show('Failed to switch camera', 'error', 3000);
                return false;
            }
        }
    }
    
    getCurrentCameraLabel() {
        if (this.availableDevices.length === 0) return 'Unknown Camera';
        
        const device = this.availableDevices[this.currentCameraIndex];
        const label = device.label || `Camera ${this.currentCameraIndex + 1}`;
        
        // Determine camera type
        if (label.toLowerCase().includes('front') || label.toLowerCase().includes('user') || 
            device.facingMode === 'user') {
            return 'Front Camera';
        }
        if (label.toLowerCase().includes('back') || label.toLowerCase().includes('rear') || 
            label.toLowerCase().includes('environment') || device.facingMode === 'environment') {
            return 'Back Camera';
        }
        
        // Guess based on index if multiple cameras
        if (this.availableDevices.length > 1) {
            return this.currentCameraIndex === 0 ? 'Front Camera' : 'Back Camera';
        }
        
        return label;
    }
    
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                track.stop();
            });
            this.stream = null;
        }
        this.video.srcObject = null;
        this.isCameraActive = false;
        this.currentFacingMode = 'user'; // Reset to front camera default
    }
    
    isActive() {
        return this.isCameraActive;
    }
}

// Main Application - Fixed version
class DermatologyAIApp {
    constructor() {
        // Get all elements with null checks
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
        this.cameraLabel = document.getElementById('cameraLabel');
        this.recordingIndicator = document.getElementById('recordingIndicator');
        this.browseBtn = document.getElementById('browseBtn');
        this.clearPreview = document.getElementById('clearPreview');
        this.uploadArea = document.getElementById('uploadArea');
        this.btnExplainFrame = document.getElementById('btnExplainFrame');

        const page = document.getElementById("analyzerPage");
        this.predictUrl = page?.dataset.predictUrl || "/predict/";
        this.predictFrameUrl = page?.dataset.predictFrameUrl || "/predict/predict-frame/";

        
        console.log('App initialized with elements:', {
            video: !!this.video,
            btnStart: !!this.btnStart,
            btnPredictUpload: !!this.btnPredictUpload,
            fileInput: !!this.fileInput
        });
        
        if (!this.video || !this.btnStart) {
            console.error('Critical elements missing! Check your HTML IDs.');
            return;
        }
        
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
        
        // Try to enumerate devices on startup
        this.enumerateDevicesOnStart();
        
        // Show welcome message
        setTimeout(() => {
            ToastSystem.show('Dermatology Analyzer ready. Start camera or upload an image.', 'info', 3000);
        }, 1000);
    }
    
    async enumerateDevicesOnStart() {
        try {
            await this.cameraManager.enumerateDevices();
            const deviceCount = this.cameraManager.availableDevices.length;
            console.log('Devices enumerated on startup:', deviceCount);
        } catch (error) {
            console.warn('Could not enumerate devices on startup:', error);
        }
    }
    
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // File Upload
        if (this.btnPredictUpload) {
            this.btnPredictUpload.addEventListener('click', () => {
                console.log('Analyze button clicked');
                this.analyzeUpload();
            });
        }
        
        // File input change for preview
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                console.log('File selected:', e.target.files[0]?.name);
                if (e.target.files[0]) {
                    this.currentFile = e.target.files[0];
                    this.showFilePreview(this.currentFile);
                }
            });
        }
        
        // Camera Controls
        if (this.btnStart) {
            this.btnStart.addEventListener('click', () => {
                console.log('Start camera clicked');
                this.startCamera();
            });
        }
        
        if (this.btnStop) {
            this.btnStop.addEventListener('click', () => {
                console.log('Stop camera clicked');
                this.stopCamera();
            });
        }
        
        if (this.btnLive) {
            this.btnLive.addEventListener('click', () => {
                console.log('Live analysis clicked');
                this.toggleLiveAnalysis();
            });
        }
        
        if (this.btnExplainFrame) {
            this.btnExplainFrame.addEventListener('click', () => {
                console.log('Explain frame clicked');
                this.explainFrame();
            });
        }
        
        if (this.btnSwitchCamera) {
            this.btnSwitchCamera.addEventListener('click', () => {
                console.log('Switch camera clicked');
                this.switchCamera();
            });
        }
        
        // Clear preview button
        if (this.clearPreview) {
            this.clearPreview.addEventListener('click', () => {
                console.log('Clear preview clicked');
                this.filePreview.style.display = 'none';
                this.previewImage.src = '';
                this.fileInput.value = '';
                this.currentFile = null;
            });
        }
        
        // Browse button
        if (this.browseBtn && this.fileInput) {
            this.browseBtn.addEventListener('click', () => {
                console.log('Browse button clicked');
                this.fileInput.click();
            });
        }
        
        // Drag and drop for upload area
        if (this.uploadArea && this.fileInput) {
            this.uploadArea.addEventListener('click', () => {
                console.log('Upload area clicked');
                this.fileInput.click();
            });
            
            this.uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.uploadArea.style.borderColor = 'var(--primary-color)';
                this.uploadArea.style.backgroundColor = 'var(--primary-light)';
            });
            
            this.uploadArea.addEventListener('dragleave', () => {
                this.uploadArea.style.borderColor = 'var(--gray-300)';
                this.uploadArea.style.backgroundColor = 'var(--gray-50)';
            });
            
            this.uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                this.uploadArea.style.borderColor = 'var(--gray-300)';
                this.uploadArea.style.backgroundColor = 'var(--gray-50)';
                
                if (e.dataTransfer.files.length) {
                    this.fileInput.files = e.dataTransfer.files;
                    const event = new Event('change', { bubbles: true });
                    this.fileInput.dispatchEvent(event);
                }
            });
        }
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.cameraManager.isActive()) {
                this.stopCamera();
                ToastSystem.show('Camera stopped due to page background', 'info', 3000);
            }
        });
        
        console.log('Event listeners setup complete');
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
            if (this.btnExplainFrame) this.btnExplainFrame.disabled = false;
            this.setButtonLoading(this.btnStart, false, '<i class="fas fa-play"></i> Start Camera');
            
            // Update camera label
            if (this.cameraLabel) {
                this.cameraLabel.textContent = this.cameraManager.getCurrentCameraLabel();
            }
            
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
        if (this.btnExplainFrame) this.btnExplainFrame.disabled = true;
        this.btnLive.innerHTML = '<i class="fas fa-broadcast-tower"></i> Start Live Analysis';
        
        // Hide recording indicator
        if (this.recordingIndicator) {
            this.recordingIndicator.classList.remove('active');
        }
        
        ToastSystem.show('Camera stopped', 'info', 2000);
    }
    
    async switchCamera() {
        if (!this.cameraManager.isActive()) {
            ToastSystem.show('Please start the camera first', 'warning', 3000);
            return;
        }
        
        this.btnSwitchCamera.disabled = true;
        this.btnSwitchCamera.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
        
        try {
            const success = await this.cameraManager.switchCamera();
            
            if (success) {
                // Update camera label
                if (this.cameraLabel) {
                    this.cameraLabel.textContent = this.cameraManager.getCurrentCameraLabel();
                }
                
                ToastSystem.show(`Switched to ${this.cameraManager.getCurrentCameraLabel()}`, 'success', 2000);
            }
        } catch (error) {
            console.error('Camera switch error:', error);
            ToastSystem.show('Failed to switch camera', 'error', 3000);
        } finally {
            setTimeout(() => {
                this.btnSwitchCamera.disabled = false;
                this.btnSwitchCamera.innerHTML = '<i class="fas fa-sync-alt"></i>';
            }, 500);
        }
    }
    
    async analyzeUpload() {
        console.log('Starting analysis...');
        
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
        formData.append("explain", "1");
        
        try {
            console.log('Sending request to /predict/');
            const response = await fetch(this.predictUrl, {
                method: "POST",
                body: formData
            });
            
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error:', errorText);
                throw new Error('Analysis failed with status ' + response.status);
            }
            
            const data = await response.json();
            console.log('Analysis result:', data);
            
            // Check if it's a rejected image (non-skin or low confidence)
            if (data.rejected) {
                this.showRejectedResult(data, this.uploadResult);
                ToastSystem.show('Image may not be suitable for analysis', 'warning', 3000);
            } else if (data.error) {
                this.showErrorResult(data.error, this.uploadResult);
                ToastSystem.show('Analysis error: ' + data.error, 'error', 4000);
            } else {
                this.showAnalysisResult(data, this.uploadResult);
                ToastSystem.show('Analysis complete!', 'success', 3000);
            }
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showErrorResult(error.message, this.uploadResult);
            ToastSystem.show('Error: ' + error.message, 'error', 4000);
        } finally {
            this.setButtonLoading(this.btnPredictUpload, false, '<i class="fas fa-search"></i> Analyze Image');
        }
    }
    
    showRejectedResult(data, container) {
        const confPct = (data.confidence * 100).toFixed(2);
        container.innerHTML = `
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
        container.classList.add('active');
        this.animateConfidenceBars();
    }
    
    showErrorResult(errorMessage, container) {
        container.innerHTML = `
            <div style="background: #ffebee; border-left: 4px solid #f44336; padding: 20px; border-radius: 8px;">
                <h4 style="color: #d32f2f; margin-bottom: 10px;">
                    <i class="fas fa-exclamation-circle"></i> Analysis Error
                </h4>
                <p style="color: #5d4037;">${errorMessage}</p>
            </div>
        `;
        container.classList.add('active');
    }
    
    showAnalysisResult(data, container) {
        const top1 = data.top1;
        const confPct = (top1.confidence * 100).toFixed(2);
        const topPredictions = data.top5 || [];
        
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
        `;
        
        if (topPredictions.length > 0) {
            html += `
                <div>
                    <h4 style="color: #2c3e50; margin-bottom: 15px;">
                        <i class="fas fa-list-ol"></i> Differential Diagnosis (Top ${topPredictions.length})
                    </h4>
                    <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
                        <ol style="margin: 0; padding-left: 20px;">
            `;
            
            topPredictions.forEach((x, index) => {
                const percentage = (x.confidence * 100).toFixed(2);
                const barWidth = Math.min(percentage, 100);
                html += `
                    <li style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: ${index === topPredictions.length - 1 ? 'none' : '1px solid #e0e0e0'};">
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
        }
        
        if (data.xai) {
            html += this.renderXaiPanel(data.xai);
        } else if (data.xai_error) {
            html += `<p class="xai-unavailable"><i class="fas fa-info-circle"></i> Explanation unavailable for this image.</p>`;
        }
        
        container.innerHTML = html;
        container.classList.add('active');
        if (data.xai) {
            this.bindXaiPanel(container, data.xai);
        }
        this.animateConfidenceBars();
    }
    
    // ---------------------------------------------------------------
    // Explainable AI panel (Grad-CAM and occlusion)
    // ---------------------------------------------------------------
    renderXaiPanel(xai) {
        const pct = (v) => (v * 100).toFixed(1);
        const imgs = xai.images || {};
        let faithHtml = '';
        let agreeHtml = '';
        
        if (xai.method_agreement) {
            const a = xai.method_agreement;
            agreeHtml = `<br><i class="fas fa-code-branch"></i> Grad-CAM and Occlusion agreement: <strong>${a.level}</strong> (Spearman &rho; = ${a.spearman_rho.toFixed(2)}).`;
        }
        
        if (xai.faithfulness) {
            const f = xai.faithfulness;
            const hiddenPct = Math.round((f.fraction_hidden || 0.2) * 100);
            const verdictText = {
                strong: 'Strong evidence: hiding the highlighted region removes most of the model\'s confidence, far more than hiding a random region of the same size. The model is relying on the highlighted area.',
                moderate: 'Moderate evidence: the highlighted region matters more than a random region, but the model also uses other parts of the image.',
                weak: 'Weak evidence: hiding the highlighted region changes the result little. The model may be using wider context, so interpret this heatmap with caution.'
            }[f.verdict] || '';
            
            faithHtml = `
                <div class="xai-faith xai-verdict-${f.verdict}">
                    <h5><i class="fas fa-vial"></i> Faithfulness check
                        <span class="xai-verdict-tag">${f.verdict}</span>
                    </h5>
                    <div class="xai-faith-grid">
                        <div><span class="xai-num">${pct(f.confidence_original)}%</span><span class="xai-cap">Original confidence</span></div>
                        <div><span class="xai-num">${pct(f.confidence_highlight_hidden)}%</span><span class="xai-cap">Top ${hiddenPct}% highlighted area hidden</span></div>
                        <div><span class="xai-num">${pct(f.confidence_random_hidden)}%</span><span class="xai-cap">Random ${hiddenPct}% area hidden</span></div>
                        <div><span class="xai-num">${pct(f.confidence_only_highlight)}%</span><span class="xai-cap">Only highlighted area shown</span></div>
                    </div>
                    <p class="xai-verdict-text">${verdictText}</p>
                </div>
            `;
        }
        
        return `
            <div class="xai-panel">
                <div class="xai-header">
                    <h4><i class="fas fa-eye"></i> Why this result? <span class="xai-sub-title">Explainable AI</span></h4>
                    <div class="xai-toggle" role="group" aria-label="Explanation method">
                        <button type="button" class="xai-method active" data-method="gradcam">Grad-CAM</button>
                        ${imgs.occlusion_heatmap ? '<button type="button" class="xai-method" data-method="occlusion">Occlusion</button>' : ''}
                    </div>
                </div>
                <p class="xai-intro">
                    The heatmap shows which parts of the image pushed the model towards
                    <strong>${xai.explained_class}</strong>. Red and yellow areas had the strongest influence; blue areas had little.
                </p>
                <div class="xai-images">
                    <figure>
                        <img src="${imgs.input}" alt="Image region analysed by the model">
                        <figcaption>What the model saw (${xai.input_size}&times;${xai.input_size} centre crop)</figcaption>
                    </figure>
                    <figure>
                        <div class="xai-stack">
                            <img src="${imgs.input}" alt="">
                            <img class="xai-heat" src="${imgs.gradcam_heatmap}" alt="Attention heatmap" style="opacity:0.5">
                        </div>
                        <figcaption>Attention heatmap</figcaption>
                    </figure>
                </div>
                <div class="xai-controls">
                    <label>Heatmap opacity
                        <input type="range" class="xai-opacity" min="0" max="100" value="50">
                    </label>
                    <a class="xai-download" download="explanation.jpg" href="${imgs.gradcam_overlay}">
                        <i class="fas fa-download"></i> Save overlay
                    </a>
                </div>
                <p class="xai-method-help">
                    <strong>Grad-CAM</strong> reads the model's internal gradients; <strong>Occlusion</strong> blurs one patch at a time
                    and measures how much the confidence falls. They work independently, so agreement between them adds trust.
                </p>
                <p class="xai-concentration">
                    <i class="fas fa-bullseye"></i>
                    ${pct(xai.concentration_top20 || 0)}% of the model's attention is concentrated in the top 20% of the image.
                    ${agreeHtml}
                </p>
                ${faithHtml}
                <p class="xai-note">
                    <i class="fas fa-info-circle"></i>
                    Heatmaps explain how the AI model reached its output; they are not a clinical marking of the lesion.
                    Method: ${xai.method}, ${xai.target_layer}.
                </p>
            </div>
        `;
    }
    
    bindXaiPanel(container, xai) {
        const panel = container.querySelector('.xai-panel');
        if (!panel) return;
        const heat = panel.querySelector('.xai-heat');
        const slider = panel.querySelector('.xai-opacity');
        const download = panel.querySelector('.xai-download');
        const imgs = xai.images || {};
        
        if (slider && heat) {
            slider.addEventListener('input', () => {
                heat.style.opacity = (slider.value / 100).toString();
            });
        }
        
        panel.querySelectorAll('.xai-method').forEach(btn => {
            btn.addEventListener('click', () => {
                panel.querySelectorAll('.xai-method').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const method = btn.dataset.method;
                if (heat && imgs[`${method}_heatmap`]) heat.src = imgs[`${method}_heatmap`];
                if (download && imgs[`${method}_overlay`]) download.href = imgs[`${method}_overlay`];
            });
        });
    }
    
    async explainFrame() {
        if (!this.cameraManager.isActive()) {
            ToastSystem.show('Please start camera first', 'warning', 3000);
            return;
        }
        
        // Pause live analysis so the explanation is not overwritten by the next frame
        if (this.isLivePredicting) {
            this.toggleLiveAnalysis();
        }
        
        const w = this.video.videoWidth;
        const h = this.video.videoHeight;
        if (!w || !h) return;
        
        this.canvas.width = w;
        this.canvas.height = h;
        this.canvas.getContext('2d').drawImage(this.video, 0, 0, w, h);
        
        this.setButtonLoading(this.btnExplainFrame, true, '<i class="fas fa-spinner fa-spin"></i> Explaining...');
        
        try {
            const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/jpeg', 0.9));
            const formData = new FormData();
            formData.append("frame", blob, "frame.jpg");
            formData.append("explain", "1");
            
            const response = await fetch(this.predictFrameUrl, { method: "POST", body: formData });
            if (!response.ok) {
                throw new Error('Explanation failed with status ' + response.status);
            }
            const data = await response.json();
            
            if (data.rejected) {
                this.showRejectedResult(data, this.camResult);
            } else if (data.error) {
                this.showErrorResult(data.error, this.camResult);
            } else {
                this.showAnalysisResult(data, this.camResult);
                ToastSystem.show('Explanation ready', 'success', 2000);
            }
            this.camResult.classList.add('active');
        } catch (error) {
            console.error('Explain frame error:', error);
            this.showErrorResult(error.message, this.camResult);
        } finally {
            this.setButtonLoading(this.btnExplainFrame, false, '<i class="fas fa-eye"></i> Explain Frame');
        }
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
            
            // Hide recording indicator
            if (this.recordingIndicator) {
                this.recordingIndicator.classList.remove('active');
            }
            
            ToastSystem.show('Live analysis stopped', 'info', 2000);
        } else {
            // Start live analysis
            this.isLivePredicting = true;
            this.liveTimer = setInterval(() => this.sendFrame(), 700);
            this.btnLive.innerHTML = '<i class="fas fa-stop-circle"></i> Stop Live Analysis';
            
            // Show recording indicator
            if (this.recordingIndicator) {
                this.recordingIndicator.classList.add('active');
            }
            
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
            
            console.log('Sending frame to /predict-frame/');
            const response = await fetch(this.predictFrameUrl, {
                method: "POST",
                body: formData
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Frame analysis result:', data);
                
                if (data.rejected) {
                    this.showRejectedResult(data, this.camResult);
                } else if (data.error) {
                    this.showErrorResult(data.error, this.camResult);
                } else {
                    this.showAnalysisResult(data, this.camResult);
                }
                this.camResult.classList.add('active');
                this.animateConfidenceBars();
            } else {
                console.error('Frame analysis failed:', response.status);
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
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing Dermatology AI Analyzer...');
    
    // Only initialize on analyzer page
    if (document.getElementById('video') && document.getElementById('btnStart')) {
        console.log('Analyzer page detected, initializing app...');
        window.app = new DermatologyAIApp();
    } else {
        console.log('Not on analyzer page, skipping app initialization');
    }
});