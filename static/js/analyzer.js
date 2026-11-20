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

const CLEAR_MATCH = 0.5;

function pct(value) {
  const p = value * 100;
  return p < 1 ? 'under 1%' : Math.round(p) + '%';
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
    ['resultPlate', 'heatControls', 'heatLegend', 'heatNote', 'resultSummary', 'resultNotice', 'trustLine'].forEach((id) => $(id).classList.add('hidden'));
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
    const clear = top.confidence >= CLEAR_MATCH;
    $('resultKicker').textContent = clear ? 'Most likely' : 'Result';
    $('topLabel').textContent = clear ? displayName(top.label) : 'No clear match';
    $('topConf').textContent = pct(top.confidence);
    $('topConf').classList.toggle('hidden', !clear);
    $('resultHint').textContent = clear ? '' : 'The model is not sure what this photo shows. Try a closer, sharper photo of the affected skin in daylight.';
    $('resultHint').classList.toggle('hidden', clear);
    $('listTitle').textContent = clear ? 'Other possibilities' : 'Possibilities';
    const list = $('differential');
    list.innerHTML = '';
    (data.top5 || []).slice(clear ? 1 : 0, 5).forEach((item) => {
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
    (clear ? xai.pins || [] : []).forEach(([x, y], i) => {
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
    if (!clear) {
      $('heatNote').textContent = 'The heatmap shows what influenced the first possibility, ' + displayName(top.label).toLowerCase() + '.';
      $('heatNote').classList.remove('hidden');
    }

    const f = xai.faithfulness;
    const healthy = top.label === 'Heathy' || top.label === 'Healthy';
    if (f && clear && !healthy) {
      const copy = {
        strong: ['\u2714', 'The model really used the highlighted area.', 'Covering it made the model much less sure.'],
        moderate: ['~', 'The highlighted area mattered, but so did the rest of the photo.', ''],
        weak: ['!', 'The highlighted area does not explain this answer well.', 'The model also relied on other parts of the photo. Treat this result with extra caution.']
      }[f.verdict];
      if (copy) {
        const mark = $('trustMark');
        mark.textContent = copy[0];
        mark.className = 'trust-mark ' + f.verdict;
        $('trustTitle').textContent = copy[1];
        $('trustText').textContent = copy[2];
        $('coverLabel').textContent = displayName(top.label).toLowerCase();
        [f.confidence_original, f.confidence_highlight_hidden, f.confidence_random_hidden].forEach((v, i) => {
          $('c' + i).textContent = pct(v);
          $('b' + i).style.width = Math.max(0, Math.min(100, v * 100)).toFixed(1) + '%';
        });
        $('trustLine').querySelector('details').open = false;
        $('trustLine').classList.remove('hidden');
      }
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
