const CLASS_DISPLAY_NAMES = {
    'Acne And Rosacea Photos': 'Acne and rosacea',
    'Actinic Keratosis Basal Cell Carcinoma And Other Malignant Lesions': 'Actinic keratosis, basal cell carcinoma and other malignant lesions',
    'Atopic Dermatitis Photos': 'Atopic dermatitis',
    'Ba  Cellulitis': 'Cellulitis (bacterial)',
    'Ba Impetigo': 'Impetigo (bacterial)',
    'Benign': 'Benign lesion',
    'Bullous Disease Photos': 'Bullous disease',
    'Cellulitis Impetigo And Other Bacterial Infections': 'Cellulitis, impetigo and other bacterial infections',
    'Eczema Photos': 'Eczema',
    'Exanthems And Drug Eruptions': 'Exanthems and drug eruptions',
    'Fu Athlete Foot': "Athlete's foot (fungal)",
    'Fu Nail Fungus': 'Nail fungus',
    'Fu Ringworm': 'Ringworm (fungal)',
    'Hair Loss Photos Alopecia And Other Hair Diseases': 'Hair loss, alopecia and other hair diseases',
    'Heathy': 'Healthy skin',
    'Herpes Hpv And Other Stds Photos': 'Herpes, HPV and other STIs',
    'Light Diseases And Disorders Of Pigmentation': 'Light-related and pigmentation disorders',
    'Lupus And Other Connective Tissue Diseases': 'Lupus and other connective tissue diseases',
    'Malignant': 'Malignant lesion',
    'Melanoma Skin Cancer Nevi And Moles': 'Melanoma, skin cancer, naevi and moles',
    'Nail Fungus And Other Nail Disease': 'Nail fungus and other nail diseases',
    'Pa Cutaneous Larva Migrans': 'Cutaneous larva migrans (parasitic)',
    'Poison Ivy Photos And Other Contact Dermatitis': 'Poison ivy and other contact dermatitis',
    'Psoriasis Pictures Lichen Planus And Related Diseases': 'Psoriasis, lichen planus and related diseases',
    'Rashes': 'Rashes',
    'Scabies Lyme Disease And Other Infestations And Bites': 'Scabies, Lyme disease and other infestations and bites',
    'Seborrheic Keratoses And Other Benign Tumors': 'Seborrhoeic keratoses and other benign tumours',
    'Systemic Disease': 'Systemic disease',
    'Tinea Ringworm Candidiasis And Other Fungal Infections': 'Tinea, ringworm, candidiasis and other fungal infections',
    'Urticaria Hives': 'Urticaria (hives)',
    'Vascular Tumors': 'Vascular tumours',
    'Vasculitis Photos': 'Vasculitis',
    'Vi Chickenpox': 'Chickenpox (viral)',
    'Vi Shingles': 'Shingles (viral)',
    'Warts Molluscum And Other Viral Infections': 'Warts, molluscum and other viral infections'
};

function displayName(label) {
  return CLASS_DISPLAY_NAMES[label] || label;
}

function pct(value) {
  const p = value * 100;
  return (p > 0 && p < 0.05 ? '<0.1' : p.toFixed(1)) + '%';
}

(() => {
  const root = document.getElementById('analyser');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const predictUrl = root.dataset.predictUrl;

  const fileInput = $('fileInput');
  const dropZone = $('dropZone');
  const preview = $('preview');
  const previewImg = $('previewImg');
  const analyseBtn = $('analyseBtn');
  const inputError = $('inputError');
  const video = $('video');
  const canvas = $('canvas');

  let photo = null;
  let stream = null;
  let facing = 'environment';

  function showError(message) {
    inputError.textContent = message;
    inputError.classList.toggle('hidden', !message);
  }

  function setPhoto(blob) {
    photo = blob;
    if (previewImg.src) URL.revokeObjectURL(previewImg.src);
    previewImg.src = URL.createObjectURL(blob);
    dropZone.classList.add('hidden');
    preview.classList.remove('hidden');
    analyseBtn.disabled = false;
    showError('');
  }

  function clearPhoto() {
    photo = null;
    fileInput.value = '';
    preview.classList.add('hidden');
    dropZone.classList.remove('hidden');
    analyseBtn.disabled = true;
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Choose an image file, such as a JPEG or PNG photo.');
      return;
    }
    setPhoto(file);
  });

  ['dragenter', 'dragover'].forEach((type) => dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((type) => dropZone.addEventListener(type, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag');
  }));
  dropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) setPhoto(file);
  });

  $('changePhoto').addEventListener('click', () => {
    clearPhoto();
    fileInput.click();
  });

  function stopCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.classList.add('hidden');
    $('cameraActions').classList.add('hidden');
    $('cameraIntro').classList.remove('hidden');
  }

  async function startCamera() {
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      video.srcObject = stream;
      video.classList.remove('hidden');
      $('cameraIntro').classList.add('hidden');
      $('cameraActions').classList.remove('hidden');
      showError('');
    } catch (e) {
      showError('The camera could not start. Allow camera access in your browser, or upload a photo instead.');
    }
  }

  $('startCamera').addEventListener('click', startCamera);
  $('switchCamera').addEventListener('click', () => {
    facing = facing === 'environment' ? 'user' : 'environment';
    startCamera();
  });
  $('takePhoto').addEventListener('click', () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      stopCamera();
      selectSource('upload');
      setPhoto(blob);
    }, 'image/jpeg', 0.92);
  });

  function selectSource(source) {
    document.querySelectorAll('[data-source]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.source === source)));
    $('uploadPanel').classList.toggle('hidden', source !== 'upload');
    $('cameraPanel').classList.toggle('hidden', source !== 'camera');
    if (source !== 'camera') stopCamera();
  }
  document.querySelectorAll('[data-source]').forEach((b) => b.addEventListener('click', () => selectSource(b.dataset.source)));

  function resetResult() {
    ['resultPlate', 'heatControls', 'heatLegend', 'resultSummary', 'resultNotice', 'coverTest'].forEach((id) => $(id).classList.add('hidden'));
    $('emptyPlate').classList.remove('hidden');
    $('resultPlate').querySelectorAll('.pin').forEach((p) => p.remove());
    $('resultPlate').classList.remove('heat-off');
    document.querySelectorAll('#heatControls [data-heat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.heat === 'on')));
  }

  function showNotice(title, text) {
    $('noticeTitle').textContent = title;
    $('noticeText').textContent = text;
    $('resultNotice').classList.remove('hidden');
  }

  function renderResult(data) {
    resetResult();
    if (data.error) {
      showNotice('Something went wrong', 'The photo could not be analysed. Please try again.');
      return;
    }
    if (data.rejected) {
      showNotice('This does not look like a clear photo of skin', 'Try a closer, sharper photo in good light, with the affected skin filling most of the frame.');
      return;
    }

    const top = data.top1;
    $('topLabel').textContent = displayName(top.label);
    $('topConf').textContent = pct(top.confidence);
    const list = $('differential');
    list.innerHTML = '';
    (data.top5 || []).slice(1, 5).forEach((item) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = displayName(item.label);
      const value = document.createElement('span');
      value.textContent = pct(item.confidence);
      const bar = document.createElement('i');
      const fill = document.createElement('b');
      fill.style.width = Math.max(0, Math.min(100, item.confidence * 100)).toFixed(1) + '%';
      bar.appendChild(fill);
      li.append(name, value, bar);
      list.appendChild(li);
    });
    $('resultSummary').classList.remove('hidden');

    const xai = data.xai;
    if (!xai) return;
    $('resultPhoto').src = xai.images.photo;
    $('resultHeat').src = xai.images.heat;
    const plate = $('resultPlate');
    (xai.pins || []).forEach(([x, y], i) => {
      const pin = document.createElement('div');
      pin.className = 'pin';
      pin.style.left = x + '%';
      pin.style.top = y + '%';
      const tag = document.createElement('span');
      tag.textContent = 'AB'[i];
      pin.appendChild(tag);
      plate.appendChild(pin);
    });
    $('emptyPlate').classList.add('hidden');
    plate.classList.remove('hidden');
    $('heatControls').classList.remove('hidden');
    $('heatLegend').classList.remove('hidden');

    const f = xai.faithfulness;
    if (f) {
      const copy = {
        strong: ['The explanation holds up', 'Hiding the marked fifth of the photo cuts the confidence far more than hiding a random fifth, so the model really used the marked areas.'],
        moderate: ['The explanation partly holds up', 'Hiding the marked fifth of the photo cuts the confidence more than hiding a random fifth, but not by much.'],
        weak: ['The explanation does not hold up', 'Hiding the marked fifth of the photo changes the confidence no more than hiding a random fifth. Treat this result with extra caution.']
      }[f.verdict] || ['', ''];
      $('coverTitle').textContent = copy[0];
      $('coverText').textContent = copy[1];
      $('c0').textContent = pct(f.confidence_original);
      $('c1').textContent = pct(f.confidence_highlight_hidden);
      $('c2').textContent = pct(f.confidence_random_hidden);
      $('coverBox').classList.toggle('verdict-weak', f.verdict === 'weak');
      $('coverTest').classList.remove('hidden');
    }
  }

  analyseBtn.addEventListener('click', async () => {
    if (!photo) return;
    analyseBtn.disabled = true;
    analyseBtn.textContent = 'Analysing...';
    showError('');
    const form = new FormData();
    form.append('image', photo, photo.name || 'photo.jpg');
    try {
      const response = await fetch(predictUrl, { method: 'POST', body: form });
      const data = await response.json();
      renderResult(data);
      if (window.matchMedia('(max-width: 900px)').matches) $('resultArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      resetResult();
      showNotice('Something went wrong', 'The photo could not be analysed. Check your connection and try again.');
    } finally {
      analyseBtn.disabled = !photo;
      analyseBtn.textContent = 'Analyse photo';
    }
  });
})();
