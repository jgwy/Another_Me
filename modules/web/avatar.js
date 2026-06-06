const form = document.querySelector('#avatarForm');
const grid = document.querySelector('#avatarGrid');
const statusNode = document.querySelector('#status');
const submitButton = document.querySelector('#submitButton');
const questionnaireToggle = document.querySelector('#questionnaireToggle');
const questionnairePanel = document.querySelector('#questionnairePanel');

const setStatus = (message, type = '') => {
  statusNode.textContent = message;
  statusNode.className = `status ${type}`.trim();
};

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const swatchColor = (color) => {
  const map = {
    'Lavender and black': '#cdb4ff',
    'Green and white': '#a7e8c0',
    'Yellow and blue': '#ffe27a',
    'Monochrome': '#9ca3af',
  };
  return map[color] || '#cdb4ff';
};

const renderProfile = (profile) => {
  const card = document.createElement('article');
  card.className = 'card';
  const swatchHtml = `<span class="swatch" style="background:${swatchColor(profile.color)}" aria-hidden="true"></span>`;
  const copyText = profile.imagePrompt || profile.prompt || '';
  card.innerHTML = `
    <div class="card-top">
      <span>${swatchHtml}${escapeHtml(profile.color)}</span>
      <b>${escapeHtml(profile.role)}</b>
    </div>
    <h3>${escapeHtml(profile.agentName)}</h3>
    <p class="tagline">${escapeHtml(profile.personality)}</p>
    <p class="description"><strong>Persona.</strong> ${escapeHtml(profile.persona || '')}</p>
    <p class="description"><strong>Skills.</strong> ${escapeHtml(profile.skills || '')}</p>
    <p class="description"><strong>Rules.</strong> ${escapeHtml(profile.rules || '')}</p>
    <details><summary>Image prompt</summary>
      <pre class="report">${escapeHtml(copyText)}</pre>
    </details>
    <div class="actions">
      <button type="button" class="button" data-copy="${escapeHtml(copyText)}">Copy prompt</button>
    </div>
  `;
  return card;
};

const loadProfiles = async () => {
  const response = await fetch('/api/module-avatar/profiles');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const profiles = await response.json();
  grid.replaceChildren(...profiles.map(renderProfile));
  setStatus(`Loaded ${profiles.length} avatar profile${profiles.length === 1 ? '' : 's'}.`, 'ok');
};

if (questionnaireToggle && questionnairePanel) {
  questionnaireToggle.addEventListener('click', () => {
    const open = !questionnairePanel.hasAttribute('hidden');
    if (open) {
      questionnairePanel.setAttribute('hidden', '');
      questionnaireToggle.setAttribute('aria-expanded', 'false');
      questionnaireToggle.textContent = 'Show precision questionnaire';
    } else {
      questionnairePanel.removeAttribute('hidden');
      questionnaireToggle.setAttribute('aria-expanded', 'true');
      questionnaireToggle.textContent = 'Hide precision questionnaire';
    }
  });
}

grid.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-copy]');
  if (!btn) return;
  const text = btn.getAttribute('data-copy') || '';
  let ok = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); ok = true; } catch { /* noop */ }
    ta.remove();
  }
  setStatus(ok ? 'Copied prompt.' : 'Could not copy prompt.', ok ? 'ok' : 'error');
  setTimeout(() => {
    if (statusNode.textContent === 'Copied prompt.' || statusNode.textContent === 'Could not copy prompt.') {
      setStatus('');
    }
  }, 1500);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  setStatus('Generating avatar card...');
  try {
    const raw = Object.fromEntries(new FormData(form).entries());
    const hobbies = String(raw.hobbies || '')
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const questionnaire = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('q_') && typeof value === 'string' && value.trim()) {
        questionnaire[key.slice(2)] = value.trim();
      }
    }
    const payload = {
      agentName: raw.agentName,
      role: raw.role,
      personality: raw.personality,
      visualStyle: raw.visualStyle,
      color: raw.color,
      expertise: raw.expertise || '',
      hobbies,
      questionnaire,
    };
    const response = await fetch('/api/module-avatar/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    form.reset();
    if (questionnairePanel && !questionnairePanel.hasAttribute('hidden')) {
      questionnairePanel.setAttribute('hidden', '');
      questionnaireToggle.setAttribute('aria-expanded', 'false');
      questionnaireToggle.textContent = 'Show precision questionnaire';
    }
    await loadProfiles();
    setStatus(`Generated avatar card for ${result.agentName}.`, 'ok');
  } catch (error) {
    setStatus(`Generation failed: ${error.message}`, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

loadProfiles().catch((error) => setStatus(`Could not load profiles: ${error.message}`, 'error'));
