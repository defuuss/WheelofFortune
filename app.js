const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d');
const spinButton = document.getElementById('spin');
const resultEl = document.getElementById('result');
const historyEl = document.getElementById('history');
const toggleMenuBtn = document.getElementById('toggle-menu');
const menu = document.getElementById('menu');
const form = document.getElementById('forfeit-form');
const list = document.getElementById('forfeit-list');
const template = document.getElementById('forfeit-row-template');
const exportBtn = document.getElementById('export-forfeits');
const importInput = document.getElementById('import-forfeits');
const editDialog = document.getElementById('edit-dialog');
const editForm = document.getElementById('edit-form');
const closeMenuBtn = document.getElementById('close-menu');
const celebrationEl = document.getElementById('celebration');

const STORAGE_KEY = 'wheel-of-forfeits';
const HISTORY_KEY = 'wheel-of-forfeits-history';

let forfeits = loadFromStorage(STORAGE_KEY, []);
let selectionHistory = loadFromStorage(HISTORY_KEY, []);
let spinning = false;
let rotation = 0;

function getCompletedNames() {
  return new Set(selectionHistory.map((item) => item.name.toLowerCase()));
}

function updateMenuState() {
  const isOpen = !menu.classList.contains('hidden');
  document.body.classList.toggle('menu-open', isOpen);
}

function clone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return clone(fallback);
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (error) {
    console.error('Failed to parse storage', error);
    return clone(fallback);
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to storage', error);
  }
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `forfeit-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeForfeit(raw) {
  return {
    id: raw.id ?? createId(),
    name: raw.name?.trim() || 'Unnamed',
    weight: Math.max(0, Number.parseFloat(raw.weight ?? 1)) || 1,
    dependencies: Array.isArray(raw.dependencies)
      ? raw.dependencies.map((dep) => dep.trim()).filter(Boolean)
      : String(raw.dependencies || '')
          .split(',')
          .map((dep) => dep.trim())
          .filter(Boolean),
    removeOnSelect: Boolean(raw.removeOnSelect),
  };
}

function addForfeit(raw) {
  const forfeit = normalizeForfeit(raw);
  forfeits.push(forfeit);
  sync();
}

function updateForfeit(id, raw) {
  const index = forfeits.findIndex((f) => f.id === id);
  if (index === -1) return;
  forfeits[index] = { ...forfeits[index], ...normalizeForfeit({ ...forfeits[index], ...raw, id }) };
  sync();
}

function deleteForfeit(id) {
  forfeits = forfeits.filter((f) => f.id !== id);
  sync();
}

function sync() {
  saveToStorage(STORAGE_KEY, forfeits);
  drawWheel();
  renderList();
}

function renderList() {
  list.innerHTML = '';
  if (forfeits.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No forfeits yet. Add some to get spinning!';
    empty.className = 'empty-state';
    list.append(empty);
    return;
  }

  const dependenciesMet = getCompletedNames();

  for (const forfeit of forfeits) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = forfeit.id;
    node.querySelector('.forfeit-name').textContent = forfeit.name;

    const details = [];
    details.push(`Weight: ${forfeit.weight}`);
    if (forfeit.dependencies.length > 0) {
      const unmet = forfeit.dependencies.filter((dep) => !dependenciesMet.has(dep.toLowerCase()));
      const dependencyText = unmet.length
        ? `Dependencies: ${forfeit.dependencies.join(', ')} (unmet: ${unmet.join(', ')})`
        : `Dependencies: ${forfeit.dependencies.join(', ')}`;
      details.push(dependencyText);
    }
    details.push(forfeit.removeOnSelect ? 'Removed after selection' : 'Stays on wheel');
    node.querySelector('.forfeit-details').textContent = details.join(' • ');

    node.querySelector('.delete').addEventListener('click', () => deleteForfeit(forfeit.id));
    node.querySelector('.edit').addEventListener('click', () => openEditDialog(forfeit));

    list.append(node);
  }
}

function getSegments(list) {
  const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return [];
  let start = 0;
  return list.map((item, index) => {
    const proportion = item.weight / totalWeight;
    const angle = proportion * Math.PI * 2;
    const segment = {
      id: item.id,
      item,
      startAngle: start,
      endAngle: start + angle,
      index,
      proportion,
    };
    start += angle;
    return segment;
  });
}

function drawWheel() {
  const width = canvas.width;
  const height = canvas.height;
  const radius = Math.min(width, height) / 2;
  ctx.clearRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  if (!forfeits.length) {
    ctx.save();
    ctx.fillStyle = '#eee';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Add forfeits to spin', centerX, centerY);
    ctx.restore();
    drawPointer(centerX, centerY, radius);
    return;
  }

  const dependenciesMet = getCompletedNames();
  const segments = getSegments(forfeits);
  if (segments.length === 0) {
    ctx.save();
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Adjust weights to spin', centerX, centerY);
    ctx.restore();
    drawPointer(centerX, centerY, radius);
    return;
  }

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);

  segments.forEach((segment, index) => {
    const { item, startAngle, endAngle } = segment;
    const eligible = isEligible(item, dependenciesMet);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.fillStyle = eligible ? colorForIndex(index) : 'rgba(200, 200, 200, 0.5)';
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.fillStyle = eligible ? '#222' : '#666';
    ctx.rotate((startAngle + endAngle) / 2);
    ctx.textAlign = 'right';
    ctx.font = '16px sans-serif';
    ctx.fillText(item.name, radius - 10, 0);
    ctx.restore();
  });

  ctx.restore();
  drawPointer(centerX, centerY, radius);
}

function drawPointer(centerX, centerY, radius) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(0, -radius - 10);
  ctx.lineTo(-15, -radius + 20);
  ctx.lineTo(15, -radius + 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function colorForIndex(index) {
  const hue = (index * 137.508) % 360; // golden angle
  return `hsl(${hue}, 70%, 60%)`;
}

function isEligible(forfeit, dependenciesMet) {
  if (forfeit.weight <= 0) return false;
  if (!forfeit.dependencies || forfeit.dependencies.length === 0) return true;
  return forfeit.dependencies.every((depName) => dependenciesMet.has(depName.toLowerCase()));
}

function chooseForfeit() {
  const dependenciesMet = getCompletedNames();
  const eligible = forfeits.filter((f) => isEligible(f, dependenciesMet));
  if (!eligible.length) {
    return null;
  }
  const totalWeight = eligible.reduce((sum, item) => sum + item.weight, 0);
  let threshold = Math.random() * totalWeight;
  for (const forfeit of eligible) {
    threshold -= forfeit.weight;
    if (threshold <= 0) {
      return forfeit;
    }
  }
  return eligible[eligible.length - 1];
}

function getSegmentForForfeit(target) {
  const segments = getSegments(forfeits);
  return segments.find((segment) => segment.item.id === target.id);
}

function animateSpin(targetSegment) {
  return new Promise((resolve) => {
    const pointerAngle = -Math.PI / 2;
    const segmentCenter = (targetSegment.startAngle + targetSegment.endAngle) / 2;
    const finalRotation = pointerAngle - segmentCenter;
    const spins = 6 + Math.random() * 4;
    const startRotation = rotation;
    const targetRotation = finalRotation + spins * Math.PI * 2;
    const duration = 5200;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(progress);
      rotation = startRotation + (targetRotation - startRotation) * eased;
      drawWheel();
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        rotation = rotation % (Math.PI * 2);
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

function easeOutExpo(t) {
  if (t === 1) return 1;
  return 1 - Math.pow(2, -10 * t);
}

async function spin() {
  if (spinning || forfeits.length === 0) return;
  const selected = chooseForfeit();
  if (!selected) {
    resultEl.textContent = 'No eligible forfeits available yet.';
    return;
  }

  const segment = getSegmentForForfeit(selected);
  if (!segment) {
    console.warn('Segment not found for selection');
    return;
  }

  spinning = true;
  spinButton.disabled = true;
  resultEl.textContent = 'Spinning...';

  await animateSpin(segment);

  resultEl.textContent = `Result: ${selected.name}`;
  triggerCelebration(selected.name);
  selectionHistory.unshift({ id: selected.id, name: selected.name, timestamp: Date.now() });
  selectionHistory = selectionHistory.slice(0, 50);
  saveToStorage(HISTORY_KEY, selectionHistory);
  renderHistory();

  if (selected.removeOnSelect) {
    deleteForfeit(selected.id);
  }

  spinning = false;
  spinButton.disabled = false;
}

function renderHistory() {
  if (!selectionHistory.length) {
    historyEl.textContent = 'No spins yet.';
    return;
  }

  const lines = selectionHistory.map((entry) => {
    const date = new Date(entry.timestamp);
    return `${date.toLocaleTimeString()} – ${entry.name}`;
  });
  historyEl.innerHTML = `<strong>History</strong><br>${lines.join('<br>')}`;
}

function openEditDialog(forfeit) {
  editForm.name.value = forfeit.name;
  editForm.weight.value = forfeit.weight;
  editForm.dependencies.value = forfeit.dependencies.join(', ');
  editForm.removeOnSelect.checked = Boolean(forfeit.removeOnSelect);
  editDialog.returnValue = '';
  editDialog.showModal();

  function handleClose(event) {
    if (event.target.returnValue === 'confirm') {
      updateForfeit(forfeit.id, {
        name: editForm.name.value,
        weight: editForm.weight.value,
        dependencies: editForm.dependencies.value,
        removeOnSelect: editForm.removeOnSelect.checked,
      });
    }
    editDialog.removeEventListener('close', handleClose);
  }

  editDialog.addEventListener('close', handleClose);
}

function triggerCelebration(name) {
  if (!celebrationEl) return;
  celebrationEl.textContent = name;
  celebrationEl.classList.remove('hidden');
  celebrationEl.classList.remove('show');

  // Force reflow so the animation restarts even if the same name repeats
  void celebrationEl.offsetWidth;

  celebrationEl.classList.add('show');

  const handleAnimationEnd = () => {
    celebrationEl.classList.add('hidden');
    celebrationEl.classList.remove('show');
    celebrationEl.removeEventListener('animationend', handleAnimationEnd);
  };

  celebrationEl.addEventListener('animationend', handleAnimationEnd);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  addForfeit({
    name: formData.get('name'),
    weight: formData.get('weight'),
    dependencies: formData.get('dependencies'),
    removeOnSelect: formData.get('removeOnSelect') !== null,
  });
  form.reset();
  form.elements.weight.value = 1;
  form.elements.removeOnSelect.checked = true;
});

spinButton.addEventListener('click', spin);

toggleMenuBtn.addEventListener('click', () => {
  menu.classList.toggle('hidden');
  updateMenuState();
});

closeMenuBtn.addEventListener('click', () => {
  menu.classList.add('hidden');
  updateMenuState();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
    updateMenuState();
  }
});

exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(forfeits, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'forfeits.json';
  link.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid forfeits file');
    }
    const imported = parsed.map(normalizeForfeit);
    forfeits = imported;
    sync();
  } catch (error) {
    alert('Failed to import forfeits: ' + error.message);
  } finally {
    importInput.value = '';
  }
});

function init() {
  drawWheel();
  renderList();
  renderHistory();
  updateMenuState();
}

init();
