const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const Engine = window.TaskEngine;

let db = { tasks: [], transcripts: [], settings: { minimizeToTray: true, reminderSound: true, repeatReminders: true, defaultOwner: 'Atakan' } };
let ui = { view: 'inbox', filter: 'open', project: '', search: '', sort: 'due' };
let candidates = [];
let duplicateTranscript = null;
let reanalyzeId = '';
let viewerId = '';
let saveTimer;
let saveChain = Promise.resolve();
let renderedDay = '';
const dirty = { transcriptModal: false, taskModal: false };

const projectColors = ['#567b68', '#6676a1', '#b47b45', '#8b6c92', '#4c8390', '#9b6a62'];
const priorityRank = { high: 0, medium: 1, low: 2 };
const priorityLabel = { high: 'YÜKSEK ÖNCELİK', medium: 'NORMAL ÖNCELİK', low: 'DÜŞÜK ÖNCELİK' };

/* ---------- Yardımcılar ---------- */

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function localISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfToday() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}

function parseLocalDate(value) {
  if (!/^\d{4}-\d\d-\d\d/.test(value || '')) return null;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function dayDiff(value) {
  const date = parseLocalDate(value);
  return date ? Math.round((date - startOfToday()) / 86400000) : null;
}

// Kalıcı metinlerde kullanılacak, güne göre değişmeyen tarih ("6 Eki 2026").
function absoluteDate(value) {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tarih yok';
}

function humanDate(value, withYear = false) {
  const date = parseLocalDate(value);
  if (!date) return 'Tarih yok';
  const diff = dayDiff(value);
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff === -1) return 'Dün';
  return date.toLocaleDateString('tr-TR', { day:'numeric', month:'short', ...(withYear || date.getFullYear() !== new Date().getFullYear() ? { year:'numeric' } : {}) });
}

function dayKey(value) {
  const diff = dayDiff(value);
  if (diff === null) return 'TARİHSİZ';
  if (diff < 0) return 'GECİKEN';
  if (diff === 0) return 'BUGÜN';
  if (diff === 1) return 'YARIN';
  if (diff <= 7) return 'BU HAFTA';
  return 'DAHA SONRA';
}

const wordCount = text => (text.trim().match(/\S+/g) || []).length;
const sourcesOf = task => task.sourceIds || (task.transcriptId ? [task.transcriptId] : []);
const defaultOwner = () => (db.settings.defaultOwner ?? 'Atakan').trim();

function toast(title, message = '', action = null) {
  const item = document.createElement('div');
  item.className = 'toast';
  item.innerHTML = `<div><strong>${esc(title)}</strong>${message ? `<span>${esc(message)}</span>` : ''}</div>`;
  if (action) {
    const button = document.createElement('button');
    button.textContent = action.label;
    button.addEventListener('click', () => { item.remove(); action.run(); });
    item.appendChild(button);
  }
  const stack = $('#toastStack');
  stack.appendChild(item);
  while (stack.children.length > 3) stack.firstElementChild.remove();
  setTimeout(() => item.remove(), action ? 6500 : 3400);
}

function setSaveStatus(ok, detail) {
  $('#saveStatus').textContent = ok ? 'Otomatik kaydediliyor' : 'Kaydedilemedi';
  $('#saveDetail').textContent = detail || 'Görevlerin bu bilgisayarda korunur.';
  $('#savePulse').classList.toggle('error', !ok);
}

async function persist(immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    const snapshot = structuredClone(db);
    const attempt = saveChain.then(() => window.hafiza.save(snapshot));
    // Bir kayıt başarısız olsa da sıradaki kayıtlar denenebilsin.
    saveChain = attempt.then(() => setSaveStatus(true), () => {});
    return attempt.catch(error => {
      setSaveStatus(false, 'Son değişiklik dosyaya yazılamadı.');
      toast('Kaydetme hatası', error?.message || 'Veri dosyası yazılamadı.');
      throw error;
    });
  };
  if (immediate) await write(); else saveTimer = setTimeout(() => write().catch(() => {}), 180);
}

/* ---------- Görev listesi ---------- */

function projectList() {
  return [...new Set(db.tasks.map(t => t.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
}

function updateNavigation() {
  const today = localISO();
  const open = db.tasks.filter(t => t.status !== 'done');
  $('#navInboxCount').textContent = open.length;
  $('#navTodayCount').textContent = open.filter(t => t.dueDate === today).length;
  $('#navUpcomingCount').textContent = open.filter(t => t.dueDate && t.dueDate > today).length;
  $('#navCompletedCount').textContent = db.tasks.filter(t => t.status === 'done').length;
  $('#navTranscriptCount').textContent = db.transcripts.length;

  const projects = projectList();
  if (ui.project && !projects.includes(ui.project)) ui.project = '';
  $('#projectNav').innerHTML = projects.map((name, index) => {
    const count = open.filter(t => t.project === name).length;
    return `<button class="project-link ${ui.project === name ? 'active' : ''}" data-project="${esc(name)}" title="${esc(name)}"><span class="project-dot" style="background:${projectColors[index % projectColors.length]}"></span><span>${esc(name)}</span><small>${count}</small></button>`;
  }).join('') || '<div class="project-empty">Henüz proje yok</div>';
  $$('.project-link', $('#projectNav')).forEach(btn => btn.addEventListener('click', () => {
    ui.view = 'inbox'; ui.project = ui.project === btn.dataset.project ? '' : btn.dataset.project; activateNav('inbox'); render();
  }));

  const options = projects.map(p => `<option value="${esc(p)}"></option>`).join('');
  $('#projectFilter').innerHTML = `<option value="">Tüm projeler</option>${projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}`;
  $('#projectFilter').value = ui.project;
  $('#projectOptions').innerHTML = options;
  $('#candidateProjects').innerHTML = options;
}

function visibleTasks() {
  const today = localISO();
  let tasks = [...db.tasks];
  if (ui.view === 'today') tasks = tasks.filter(t => t.dueDate === today && t.status !== 'done');
  else if (ui.view === 'upcoming') tasks = tasks.filter(t => t.dueDate && t.dueDate > today && t.status !== 'done');
  else if (ui.view === 'completed') tasks = tasks.filter(t => t.status === 'done');
  else if (ui.filter === 'open') tasks = tasks.filter(t => t.status !== 'done');
  else if (ui.filter === 'high') tasks = tasks.filter(t => t.priority === 'high' && t.status !== 'done');
  if (ui.project) tasks = tasks.filter(t => t.project === ui.project);
  if (ui.search.trim()) {
    // Engine.fold büyük/küçük harf ve Türkçe karakter farkını yok sayar ("linkedin" → "LinkedIn", "isik" → "ışık").
    const terms = Engine.fold(ui.search).split(' ').filter(Boolean);
    tasks = tasks.filter(t => {
      const haystack = Engine.fold(`${t.title} ${t.notes || ''} ${t.project || ''} ${t.owner || ''}`);
      return terms.every(term => haystack.includes(term));
    });
  }
  const byDue = (a, b) => (a.dueDate || '9999-99-99').localeCompare(b.dueDate || '9999-99-99') || (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
  const byPriority = (a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
  tasks.sort((a, b) => {
    const doneOrder = (a.status === 'done') - (b.status === 'done');
    if (doneOrder) return doneOrder;
    if (a.status === 'done') return (b.completedAt || '').localeCompare(a.completedAt || '');
    if (ui.sort === 'priority') return byPriority(a, b) || byDue(a, b);
    if (ui.sort === 'created') return (b.createdAt || '').localeCompare(a.createdAt || '');
    return byDue(a, b) || byPriority(a, b);
  });
  return tasks;
}

// Sıralamaya uygun grup başlığı; aynı başlık listede yalnızca bir kez görünür.
function groupOf(task) {
  if (task.status === 'done') return 'TAMAMLANANLAR';
  if (ui.sort === 'priority') return priorityLabel[task.priority] || priorityLabel.medium;
  if (ui.sort === 'created') return 'SON EKLENENLER';
  return dayKey(task.dueDate);
}

function taskCard(task) {
  const overdue = task.status !== 'done' && dayDiff(task.dueDate) < 0 && task.dueDate;
  const sources = sourcesOf(task).map(id => db.transcripts.find(t => t.id === id)).filter(Boolean);
  const source = db.transcripts.find(t => t.id === task.transcriptId) || sources.at(-1);
  const priority = task.priority === 'high' ? '<span class="pill high">Yüksek öncelik</span>' : task.priority === 'low' ? '<span class="pill low">Düşük</span>' : '';
  const sourceLabel = source ? `${source.title}${sources.length > 1 ? ` +${sources.length - 1}` : ''}` : '';
  return `<article class="task-card ${task.status === 'done' ? 'done' : ''}" data-id="${esc(task.id)}" tabindex="0">
    <input class="task-check" type="checkbox" ${task.status === 'done' ? 'checked' : ''} aria-label="Tamamlandı olarak işaretle" />
    <div class="task-content"><div class="task-title" title="${esc(task.title)}">${esc(task.title)}</div><div class="task-meta">
      ${task.project ? `<span class="pill project">${esc(task.project)}</span>` : ''}${priority}
      <span class="due ${overdue ? 'overdue' : ''}">${task.dueDate ? `${overdue ? '⚠ ' : '◷ '}${esc(humanDate(task.dueDate))}${task.dueTime ? ` · ${esc(task.dueTime)}` : ''}` : 'Tarih belirlenmedi'}</span>
      ${task.owner ? `<span>· ${esc(task.owner)}</span>` : ''}
    </div></div>
    ${source ? `<div class="task-source" title="${esc(sources.map(s => s.title).join('\n'))}">${esc(sourceLabel)}</div>` : '<div></div>'}
  </article>`;
}

function renderTasks() {
  const tasks = visibleTasks();
  const list = $('#taskList');
  const empty = $('#emptyState');
  $('#statusTabs').classList.toggle('hidden', ui.view !== 'inbox');
  if (!tasks.length) {
    list.innerHTML = ''; empty.classList.remove('hidden');
    const filtered = Boolean(ui.search.trim() || ui.project);
    $('#emptyTitle').textContent = ui.search.trim() ? 'Aramana uygun görev yok' : ui.view === 'completed' ? 'Henüz tamamlanan görev yok' : db.tasks.length ? 'Her şey yolunda' : 'Henüz görev yok';
    $('#emptyText').textContent = ui.search.trim() ? 'Başka bir arama sözcüğü deneyebilirsin.' : filtered ? 'Bu projede bu görünüme uyan görev yok.' : db.tasks.length ? 'Bu görünümde görev bulunmuyor.' : 'Bir toplantı deşifresi ekleyerek başlayabilirsin.';
    return;
  }
  empty.classList.add('hidden');
  const groups = new Map();
  for (const task of tasks) {
    const key = groupOf(task);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  list.innerHTML = [...groups].map(([label, items]) => `<div class="task-group-label">${label} <small>${items.length}</small></div>${items.map(taskCard).join('')}`).join('');
  $$('.task-card', list).forEach(card => {
    card.addEventListener('click', e => { if (!e.target.classList.contains('task-check')) openTask(card.dataset.id); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === card) openTask(card.dataset.id); });
    $('.task-check', card).addEventListener('change', e => toggleTask(card.dataset.id, e.target.checked));
  });
}

function renderSummary() {
  const today = localISO();
  const todayAll = db.tasks.filter(t => t.dueDate === today);
  const todayDone = todayAll.filter(t => t.status === 'done').length;
  const progress = todayAll.length ? Math.round(todayDone / todayAll.length * 100) : 0;
  $('#progressRing').style.setProperty('--progress', `${progress * 3.6}deg`);
  $('#progressPercent').textContent = `${progress}%`;
  $('#progressText').textContent = todayAll.length ? `${todayDone} / ${todayAll.length} görev tamamlandı` : 'Bugün için görev yok';
  $('#progressSub').textContent = todayAll.length ? (progress === 100 ? 'Harika, günün planı tamamlandı.' : `${todayAll.length - todayDone} görev seni bekliyor.`) : 'Tarihsiz görevlerini planlayabilirsin.';
  $('#metricToday').textContent = todayAll.length - todayDone;
  $('#metricOverdue').textContent = db.tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  $('#metricDone').textContent = db.tasks.filter(t => t.status === 'done' && t.completedAt && new Date(t.completedAt) >= weekAgo).length;
}

function renderTranscripts() {
  const grid = $('#transcriptGrid'); const empty = $('#transcriptEmpty');
  if (!db.transcripts.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = [...db.transcripts].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '')).map(t => {
    const count = db.tasks.filter(task => sourcesOf(task).includes(t.id)).length;
    return `<article class="transcript-card" data-id="${esc(t.id)}" tabindex="0"><div class="transcript-date">${esc(absoluteDate(t.date).toLocaleUpperCase('tr-TR'))}</div><h3>${esc(t.title)}</h3><div class="transcript-preview">${esc(t.text.replace(/\s+/g, ' ').slice(0, 330))}</div><div class="transcript-footer"><span>${(t.wordCount || wordCount(t.text)).toLocaleString('tr-TR')} kelime</span><strong>${count} görev</strong></div></article>`;
  }).join('');
  $$('.transcript-card', grid).forEach(card => {
    card.addEventListener('click', () => openViewer(card.dataset.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openViewer(card.dataset.id); });
  });
}

function render() {
  renderedDay = localISO();
  updateNavigation();
  const transcriptMode = ui.view === 'transcripts';
  $('#dashboardView').classList.toggle('hidden', transcriptMode);
  $('#transcriptView').classList.toggle('hidden', !transcriptMode);
  const titles = { inbox:'Görevler', today:'Bugün', upcoming:'Yaklaşan görevler', completed:'Tamamlananlar', transcripts:'Deşifreler' };
  $('#viewTitle').textContent = titles[ui.view] || 'Görevler';
  $('#viewEyebrow').textContent = ui.project && !transcriptMode ? ui.project.toLocaleUpperCase('tr-TR') : transcriptMode ? 'KAYIT ARŞİVİ' : 'ÇALIŞMA ALANI';
  if (transcriptMode) renderTranscripts(); else { renderSummary(); renderTasks(); }
}

function activateNav(view) {
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
}

async function toggleTask(id, done) {
  const task = db.tasks.find(t => t.id === id); if (!task) return;
  task.status = done ? 'done' : 'open';
  task.completedAt = done ? new Date().toISOString() : null;
  render();
  await persist(true);
  if (done) toast('Görev tamamlandı', task.title, { label: 'Geri al', run: () => toggleTask(id, false) });
}

/* ---------- Pencereler ---------- */

function openModal(id) { $(`#${id}`).classList.remove('hidden'); }

// force=false iken kaydedilmemiş deşifre çalışması için onay ister.
function closeModal(id, force = false) {
  if (!force && id === 'transcriptModal' && dirty.transcriptModal && !confirm('Kaydedilmemiş deşifre çalışması kapatılsın mı?')) return false;
  $(`#${id}`).classList.add('hidden');
  if (id in dirty) dirty[id] = false;
  return true;
}

/* ---------- Görev düzenleme ---------- */

function openTask(id = null) {
  const task = id ? db.tasks.find(t => t.id === id) : null;
  if (id && !task) { toast('Görev bulunamadı', 'Silinmiş olabilir.'); return; }
  $('#taskModalTitle').textContent = task ? 'Görevi düzenle' : 'Yeni görev';
  $('#taskId').value = task?.id || '';
  $('#taskTitle').value = task?.title || '';
  $('#taskDueDate').value = task?.dueDate || '';
  $('#taskDueTime').value = task?.dueTime || '';
  $('#taskPriority').value = task?.priority || 'medium';
  $('#taskProject').value = task?.project || ui.project || '';
  $('#taskOwner').value = task ? task.owner || '' : defaultOwner();
  $('#taskReminder').value = task?.reminderAt ? task.reminderAt.slice(0, 16) : '';
  $('#taskStatus').value = task?.status || 'open';
  $('#taskNotes').value = task?.notes || '';
  $('#taskDueDate').dataset.previous = task?.dueDate || '';
  const sources = task ? sourcesOf(task).map(sourceId => db.transcripts.find(source => source.id === sourceId)).filter(Boolean) : [];
  $('#taskHistory').classList.toggle('hidden', !sources.length);
  $('#taskHistory').innerHTML = sources.length ? `<strong>İlgili görüşmeler</strong><div>${sources.map(source => `<button type="button" data-transcript="${esc(source.id)}">${esc(source.title)} · ${esc(absoluteDate(source.date))}</button>`).join('')}</div>` : '';
  $$('#taskHistory button').forEach(btn => btn.addEventListener('click', () => { closeModal('taskModal', true); openViewer(btn.dataset.transcript); }));
  $('#deleteTaskBtn').classList.toggle('hidden', !task);
  $('#remindTomorrowBtn').classList.toggle('hidden', !task || task.status === 'done');
  dirty.taskModal = false;
  openModal('taskModal'); setTimeout(() => $('#taskTitle').focus(), 50);
}

// Son tarih değişince, kullanıcı özel bir hatırlatma yazmadıysa hatırlatmayı o gün 09.00'a getir.
function syncDefaultReminder() {
  const input = $('#taskDueDate'), reminder = $('#taskReminder');
  const previous = input.dataset.previous || '';
  if (!reminder.value || reminder.value === `${previous}T09:00`) reminder.value = input.value ? `${input.value}T09:00` : '';
  input.dataset.previous = input.value;
}

async function saveTask() {
  const title = $('#taskTitle').value.trim();
  if (!title) { toast('Görev adı gerekli'); $('#taskTitle').focus(); return false; }
  const id = $('#taskId').value;
  const existing = db.tasks.find(t => t.id === id);
  const status = $('#taskStatus').value;
  const reminderAt = $('#taskReminder').value || '';
  const task = {
    ...(existing || {}), id: existing ? id : uid('task'), title,
    dueDate: $('#taskDueDate').value, dueTime: $('#taskDueTime').value,
    priority: $('#taskPriority').value, project: $('#taskProject').value.trim(),
    owner: $('#taskOwner').value.trim(), reminderAt,
    status, notes: $('#taskNotes').value.trim(), createdAt: existing?.createdAt || new Date().toISOString(),
    completedAt: status === 'done' ? existing?.completedAt || new Date().toISOString() : null,
    notifiedAt: existing && (existing.reminderAt || '') === reminderAt ? existing.notifiedAt || null : null
  };
  if (!existing) { task.key ||= ''; task.sourceIds ||= []; }
  if (existing) Object.assign(existing, task); else db.tasks.push(task);
  await persist(true); closeModal('taskModal', true); render(); toast(existing ? 'Görev güncellendi' : 'Görev eklendi', title);
  return true;
}

async function deleteTask() {
  const id = $('#taskId').value; const task = db.tasks.find(t => t.id === id); if (!task) return;
  if (!confirm(`“${task.title}” görevi silinsin mi?`)) return;
  db.tasks = db.tasks.filter(t => t.id !== id); await persist(true); closeModal('taskModal', true); render(); toast('Görev silindi');
}

/* ---------- Deşifre arşivi ---------- */

function openViewer(id) {
  const transcript = db.transcripts.find(t => t.id === id);
  if (!transcript) return;
  viewerId = id;
  const linked = db.tasks.filter(task => sourcesOf(task).includes(id));
  $('#viewerDate').textContent = absoluteDate(transcript.date).toLocaleUpperCase('tr-TR');
  $('#viewerTitle').textContent = transcript.title;
  $('#viewerStats').textContent = `${(transcript.wordCount || wordCount(transcript.text)).toLocaleString('tr-TR')} kelime · ${linked.length} görev (${linked.filter(t => t.status === 'done').length} tamamlandı)`;
  $('#viewerText').textContent = transcript.text;
  $('#viewerTasks').innerHTML = linked.length
    ? linked.map(task => `<button type="button" class="viewer-task ${task.status === 'done' ? 'done' : ''}" data-id="${esc(task.id)}"><span>${task.status === 'done' ? '✓' : '○'}</span>${esc(task.title)}</button>`).join('')
    : '<p>Bu görüşmeye bağlı görev yok.</p>';
  $$('.viewer-task', $('#viewerTasks')).forEach(btn => btn.addEventListener('click', () => { closeModal('viewerModal', true); openTask(btn.dataset.id); }));
  openModal('viewerModal');
  $('.viewer-body').scrollTop = 0;
}

async function deleteTranscript() {
  const transcript = db.transcripts.find(t => t.id === viewerId);
  if (!transcript) return;
  const linked = db.tasks.filter(task => sourcesOf(task).includes(transcript.id)).length;
  if (!confirm(`“${transcript.title}” deşifresi silinsin mi?\n\n${linked ? `Bu görüşmeden çıkan ${linked} görev silinmez; yalnızca görüşme bağlantısı kaldırılır.` : 'Bu görüşmeye bağlı görev yok.'}`)) return;
  db.transcripts = db.transcripts.filter(t => t.id !== transcript.id);
  for (const task of db.tasks) {
    if (task.sourceIds) task.sourceIds = task.sourceIds.filter(id => id !== transcript.id);
    if (task.transcriptId === transcript.id) task.transcriptId = task.sourceIds?.at(-1) || '';
  }
  await persist(true); closeModal('viewerModal', true); render(); toast('Deşifre silindi', transcript.title);
}

/* ---------- Yeni deşifre ---------- */

function showStep(results) {
  $('.source-step').classList.toggle('hidden', results);
  $('#analysisResults').classList.toggle('hidden', !results);
  $('#analyzeBtn').classList.toggle('hidden', results);
  $('#saveCandidatesBtn').classList.toggle('hidden', !results);
  $('#backToTextBtn').classList.toggle('hidden', !results || Boolean(reanalyzeId));
}

function openTranscript(reanalyze = null) {
  reanalyzeId = reanalyze?.id || '';
  candidates = [];
  duplicateTranscript = null;
  $('#transcriptTitle').value = reanalyze?.title || '';
  $('#transcriptDate').value = reanalyze?.date || localISO();
  $('#transcriptText').value = reanalyze?.text || '';
  $('#transcriptEyebrow').textContent = reanalyze ? 'KAYITLI DEŞİFRE' : 'YENİ KAYIT';
  $('#transcriptModalTitle').textContent = reanalyze ? 'Deşifreyi yeniden analiz et' : 'Deşifreyi görevlere dönüştür';
  $('#transcriptIntro').textContent = reanalyze
    ? 'Bu görüşmeden daha önce çıkarılmış görevler atlanır; yalnızca eksik kalanları ekleyebilirsin.'
    : 'Konuşma metnini olduğu gibi yapıştır. Görevleri kaydetmeden önce gözden geçirebilirsin.';
  updateWordCount();
  showStep(false);
  dirty.transcriptModal = false;
  openModal('transcriptModal');
  if (reanalyze) analyzeTranscript();
  else setTimeout(() => $('#transcriptTitle').focus(), 50);
}

function updateWordCount() {
  const text = $('#transcriptText').value.trim();
  $('#transcriptStats').textContent = `${wordCount(text).toLocaleString('tr-TR')} kelime · ${text.length.toLocaleString('tr-TR')} karakter`;
}

function loadTranscriptFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { toast('Dosya çok büyük', 'En fazla 5 MB düz metin dosyası yüklenebilir.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '').replace(/^﻿/, '');
    if (text.includes('\u0000')) { toast('Bu dosya okunamadı', 'Yalnızca düz metin (.txt) dosyaları desteklenir.'); return; }
    $('#transcriptText').value = text;
    if (!$('#transcriptTitle').value.trim()) $('#transcriptTitle').value = file.name.replace(/\.[^.]+$/, '');
    dirty.transcriptModal = true;
    updateWordCount(); toast('Dosya yüklendi', file.name);
  };
  reader.onerror = () => toast('Dosya okunamadı', file.name);
  reader.readAsText(file, 'utf-8');
}

// Aday için mevcut görev eşleşmesini ve varsayılan işlemi belirler.
function computeMatch(c) {
  const manual = c.manualMatchId ? db.tasks.find(t => t.id === c.manualMatchId) : null;
  const match = manual || (c.manualCleared ? null : Engine.findMatch(c, db.tasks));
  c.matchId = match?.id || '';
  if (c.decisionMatchId === c.matchId) return;
  c.decisionMatchId = c.matchId;
  if (manual) c.decision = 'update';
  else if (c.manualCleared) c.decision = 'update';
  else if (!match) c.decision = 'new';
  // Bitmiş işi yeniden açma; yeniden analizde bu görüşmeden zaten çıkmış işi tekrarlama.
  else c.decision = match.status === 'done' || (reanalyzeId && sourcesOf(match).includes(reanalyzeId)) ? 'skip' : 'update';
}

function matchLabel(c) {
  const match = db.tasks.find(t => t.id === c.matchId);
  if (!match) return c.decision === 'update' ? '<div class="candidate-new">Bağlanacak görevi yukarıdan seç.</div>' : '<div class="candidate-new">Yeni görev</div>';
  const done = match.status === 'done';
  const already = reanalyzeId && sourcesOf(match).includes(reanalyzeId);
  const heading = already ? 'Bu görüşmeden zaten çıkarılmış' : done ? 'Tamamlanmış görev bulundu' : 'Mevcut görev bulundu';
  const dateNote = match.dueDate && c.dueDate && match.dueDate !== c.dueDate ? ` · <b>Tarih farklı:</b> kayıtlı ${esc(absoluteDate(match.dueDate))} / yeni ${esc(absoluteDate(c.dueDate))} (kayıtlı tarih değişmez)` : '';
  const outcome = c.decision === 'skip' ? (done ? ' — tamamlandığı için atlanacak.' : ' — atlanacak.') : c.decision === 'update' ? ' — yeni not eklenecek.' : ' — yine de ayrı bir görev oluşturulacak.';
  return `<div class="candidate-match ${done ? 'finished' : ''}"><strong>${heading}:</strong> ${esc(match.title)}${outcome}${dateNote}</div>`;
}

function updateAnalysisSummary() {
  const matched = candidates.filter(c => c.matchId).length;
  $('#analysisCount').textContent = `${candidates.length} görev bulundu · ${matched} eşleşme`;
  $('#analysisHelp').textContent = duplicateTranscript
    ? `Bu deşifre daha önce kaydedilmiş (“${duplicateTranscript.title}”). Tekrar kaydedilemez; eksik görevler için Deşifreler ekranından “Yeniden analiz et” kullanılabilir.`
    : 'Her başlığı ve eşleşmeyi kontrol et. Tamamlanan görevler varsayılan olarak atlanır.';
  $('#saveCandidatesBtn').disabled = Boolean(duplicateTranscript) || !candidates.length;
}

// Satırı yeniden oluşturmadan günceller; böylece yazarken odak ve tıklamalar kaybolmaz.
function syncRow(row, c) {
  $('.candidate-decision', row).value = c.decision;
  const link = $('.candidate-link', row);
  link.classList.toggle('hidden', c.decision !== 'update');
  if (c.decision === 'update') {
    const select = $('.candidate-target', row);
    if (select.options.length <= 1) {
      const sorted = [...db.tasks].sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.title.localeCompare(b.title, 'tr'));
      select.insertAdjacentHTML('beforeend', sorted.map(task => `<option value="${esc(task.id)}">${esc(task.title)}${task.status === 'done' ? ' · tamamlandı' : ''}</option>`).join(''));
    }
    select.value = c.matchId;
  }
  $('.candidate-status', row).innerHTML = matchLabel(c);
  row.classList.toggle('unselected', !c.selected);
}

function autoGrow(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

function renderCandidates() {
  candidates.forEach(computeMatch);
  updateAnalysisSummary();
  const hasTasks = db.tasks.length > 0;
  $('#candidateList').innerHTML = candidates.map(c => `<div class="candidate" data-id="${c.id}">
      <div class="candidate-top"><input type="checkbox" class="candidate-selected" ${c.selected ? 'checked' : ''} aria-label="Görevi seç" />
        <textarea class="candidate-title" rows="1" aria-label="Görev adı">${esc(c.title)}</textarea>
        <button class="candidate-remove" title="Önizlemeden kaldır" aria-label="Önizlemeden kaldır">×</button></div>
      <div class="candidate-bottom"><input type="text" class="candidate-project" list="candidateProjects" value="${esc(c.project || '')}" placeholder="Proje" aria-label="Proje" />
        <input type="text" class="candidate-owner" value="${esc(c.owner || '')}" placeholder="Sorumlu" aria-label="Sorumlu" />
        <input type="date" class="candidate-date" value="${esc(c.dueDate || '')}" aria-label="Son tarih" />
        <select class="candidate-priority" aria-label="Öncelik"><option value="high" ${c.priority==='high'?'selected':''}>Yüksek</option><option value="medium" ${c.priority==='medium'?'selected':''}>Normal</option><option value="low" ${c.priority==='low'?'selected':''}>Düşük</option></select>
        <select class="candidate-decision" aria-label="Eşleşme işlemi"><option value="new">Yeni görev</option>${hasTasks ? '<option value="update">Mevcut görevi güncelle</option>' : ''}<option value="skip">Atla</option></select></div>
      <div class="candidate-link hidden"><span>Bağlanacak görev</span><select class="candidate-target" aria-label="Mevcut görevi seç"><option value="">Görev seçin…</option></select></div>
      <div class="candidate-status"></div>
      <div class="candidate-context">${esc((c.notes || '').slice(0, 260))}</div>
    </div>`).join('');
  $$('.candidate', $('#candidateList')).forEach(row => {
    const item = candidates.find(c => c.id === row.dataset.id);
    const title = $('.candidate-title', row);
    const rematch = () => { computeMatch(item); syncRow(row, item); updateAnalysisSummary(); };
    syncRow(row, item);
    autoGrow(title);
    $('.candidate-selected', row).addEventListener('change', e => { item.selected = e.target.checked; row.classList.toggle('unselected', !item.selected); });
    title.addEventListener('input', () => { item.title = title.value.replace(/\s*\n\s*/g, ' '); autoGrow(title); });
    title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
    title.addEventListener('change', rematch);
    $('.candidate-project', row).addEventListener('change', e => { item.project = e.target.value.trim(); rematch(); });
    $('.candidate-owner', row).addEventListener('change', e => { item.owner = e.target.value.trim(); });
    $('.candidate-date', row).addEventListener('change', e => { item.dueDate = e.target.value; syncRow(row, item); });
    $('.candidate-priority', row).addEventListener('change', e => { item.priority = e.target.value; });
    $('.candidate-decision', row).addEventListener('change', e => { item.decision = e.target.value; syncRow(row, item); });
    $('.candidate-target', row).addEventListener('change', e => { item.manualMatchId = e.target.value; item.manualCleared = !e.target.value; rematch(); });
    $('.candidate-remove', row).addEventListener('click', () => { candidates = candidates.filter(c => c.id !== item.id); row.remove(); updateAnalysisSummary(); });
  });
}

function analyzeTranscript() {
  const text = $('#transcriptText').value.trim();
  if (text.length < 30 || wordCount(text) < 6) { toast('Biraz daha metin gerekli', 'Deşifre en az birkaç cümle içermeli.'); return; }
  const folded = Engine.fold(text);
  duplicateTranscript = reanalyzeId ? null : db.transcripts.find(t => Engine.fold(t.text) === folded) || null;
  candidates = Engine.extract(text, $('#transcriptDate').value, { defaultOwner: defaultOwner(), knownProjects: projectList() })
    .map(item => ({ id: uid('candidate'), selected: true, ...item }));
  if (!candidates.length) {
    candidates = [{ id:uid('candidate'), selected:true, title:'Görüşme notlarını gözden geçir', notes:text.slice(0, 520), source:'', dueDate:'', dueTime:'', priority:'medium', project:'Genel', owner:defaultOwner(), key:'' }];
    toast('Açık bir eylem bulunamadı', 'Gözden geçirme görevi önerildi; istersen düzenleyebilirsin.');
  }
  renderCandidates();
  showStep(true);
  dirty.transcriptModal = true;
  $('.transcript-body').scrollTop = 0;
  if (duplicateTranscript) toast('Bu deşifre zaten kayıtlı', duplicateTranscript.title);
}

function applyUpdate(existing, c, transcript) {
  const header = `[${absoluteDate(transcript.date)} · ${transcript.title}]`;
  const additions = [];
  if (!existing.dueDate && c.dueDate) {
    existing.dueDate = c.dueDate;
    if (!existing.dueTime && c.dueTime) existing.dueTime = c.dueTime;
    if (!existing.reminderAt) { existing.reminderAt = `${c.dueDate}T09:00`; existing.notifiedAt = null; }
  } else if (existing.dueDate && c.dueDate && existing.dueDate !== c.dueDate) {
    // Kayıtlı tarihi sessizce değiştirme; yeni tarihi nota yaz, karar kullanıcıda kalsın.
    additions.push(`Bu görüşmede geçen tarih: ${absoluteDate(c.dueDate)} (kayıtlı son tarih: ${absoluteDate(existing.dueDate)}).`);
  }
  const isLegacyTitle = /^(TMA Ödemesi Takibi|E-posta CC Kuralı|Halkbank & Sponsor Stant Masaları|Katılımcı Sayısı ve E-mailing Kampanyası|İlk Tur Davetiyeler.*|İkinci Tur Davetiyeler|LinkedIn Reklam Bütçesi ve Dağıtımı|Raporlama)$/i.test(existing.title);
  if (isLegacyTitle) existing.title = c.title.trim();
  const known = Engine.fold(existing.notes);
  const note = (c.notes || '').trim();
  const sentence = Engine.fold(c.source || note);
  if (note && !(sentence && known.includes(sentence))) additions.unshift(note);
  if (additions.length) existing.notes = [existing.notes, `${header} ${additions.join(' ')}`].filter(Boolean).join('\n\n');
  // Öncelik yalnızca yükselir; sonraki bir not mevcut önceliği düşürmez.
  if (c.priority === 'high') existing.priority = 'high';
  existing.priority ||= c.priority || 'medium';
  existing.project ||= c.project;
  existing.owner ||= c.owner;
  existing.key ||= c.key || '';
  existing.sourceIds = [...new Set([...sourcesOf(existing), transcript.id])];
  existing.lastSeenAt = new Date().toISOString();
  if (existing.status !== 'done') existing.transcriptId = transcript.id;
}

async function saveCandidates() {
  if (duplicateTranscript) { toast('Deşifre zaten kayıtlı', duplicateTranscript.title); return; }
  const chosen = candidates.filter(c => c.selected);
  const active = chosen.filter(c => c.title.trim() && c.decision !== 'skip');
  const skipped = chosen.length - active.length;
  if (!chosen.length) { toast('En az bir görev seçmelisin'); return; }
  if (active.some(c => c.decision === 'update' && !db.tasks.some(t => t.id === c.matchId))) { toast('Eşleştirilecek görevi seç', 'Güncellenecek her aday için mevcut bir görev belirtmelisin.'); return; }

  const text = $('#transcriptText').value.trim();
  const date = $('#transcriptDate').value || localISO();
  let transcript = reanalyzeId ? db.transcripts.find(t => t.id === reanalyzeId) : null;
  if (!transcript) {
    transcript = { id: uid('transcript'), title: $('#transcriptTitle').value.trim() || `Görüşme — ${absoluteDate(date)}`, date, text, wordCount: wordCount(text), createdAt: new Date().toISOString() };
    db.transcripts.push(transcript);
  }
  let added = 0, updated = 0;
  for (const c of active) {
    const existing = c.decision === 'update' ? db.tasks.find(t => t.id === c.matchId) : null;
    if (existing) {
      applyUpdate(existing, c, transcript);
      updated++;
    } else {
      db.tasks.push({ id: uid('task'), title: c.title.trim(), notes: c.notes || '', dueDate: c.dueDate || '', dueTime: c.dueDate ? c.dueTime || '' : '', reminderAt: c.dueDate ? `${c.dueDate}T09:00` : '', priority: c.priority || 'medium', project: c.project || 'Genel', owner: c.owner || '', key: c.key || '', status: 'open', transcriptId: transcript.id, sourceIds: [transcript.id], createdAt: new Date().toISOString(), completedAt: null, notifiedAt: null });
      added++;
    }
  }
  await persist(true);
  closeModal('transcriptModal', true);
  ui.view = 'inbox'; ui.project = ''; activateNav('inbox'); render();
  toast('Deşifre işlendi', `${added} yeni görev eklendi, ${updated} görev güncellendi, ${skipped} aday atlandı.`);
}

/* ---------- Hatırlatmalar ---------- */

async function checkReminders() {
  // Uygulama günlerce açık kalabilir; gün değişince tarihe bağlı görünümleri yenile.
  if (renderedDay !== localISO()) render();
  const due = window.Reminders.due(db.tasks, new Date(), db.settings.repeatReminders !== false);
  if (!due.length) return;
  const stamp = new Date().toISOString();
  for (const message of window.Reminders.messages(due)) {
    try { await window.hafiza.notify(message); } catch (_) { /* Bildirim gösterilemese de kayıt sürsün. */ }
  }
  for (const task of due) task.notifiedAt = stamp;
  persist(true).catch(() => {});
}

/* ---------- Ayarlar ---------- */

async function openSettings() {
  $('#settingTray').checked = db.settings.minimizeToTray !== false;
  $('#settingSound').checked = db.settings.reminderSound !== false;
  $('#settingRepeat').checked = db.settings.repeatReminders !== false;
  $('#settingOwner').value = db.settings.defaultOwner ?? 'Atakan';
  openModal('settingsModal');
  const [location, autostart, info] = await Promise.all([window.hafiza.dataLocation(), window.hafiza.getAutostart(), window.hafiza.info()]);
  $('#dataPath').textContent = location;
  $('#settingAutostart').checked = autostart.enabled;
  $('#settingAutostart').disabled = !autostart.supported;
  if (!autostart.supported) $('#autostartHelp').textContent = 'Yalnızca .exe sürümünde kullanılabilir.';
  $('#appVersion').textContent = `Hafıza ${info.version}`;
}

async function importBackup() {
  await persist(true).catch(() => {});
  const result = await window.hafiza.importData();
  if (result.error) { toast('Geri yüklenemedi', result.error); return; }
  if (!result.restored) return;
  db = result.data;
  ui = { view: 'inbox', filter: 'open', project: '', search: '', sort: ui.sort };
  $('#searchInput').value = '';
  $$('#statusTabs button').forEach(b => b.classList.toggle('active', b.dataset.filter === 'open'));
  closeModal('settingsModal', true); activateNav('inbox'); render();
  toast('Yedek geri yüklendi', `${db.tasks.length} görev ve ${db.transcripts.length} deşifre yüklendi.`);
}

/* ---------- Olaylar ---------- */

function bindEvents() {
  $('#openTranscriptBtn').addEventListener('click', () => openTranscript());
  $('#emptyAction').addEventListener('click', () => openTranscript());
  $('#transcriptEmptyAction').addEventListener('click', () => openTranscript());
  $('#quickTaskBtn').addEventListener('click', () => openTask());

  $('#saveTaskBtn').addEventListener('click', saveTask);
  $('#deleteTaskBtn').addEventListener('click', deleteTask);
  $('#taskDueDate').addEventListener('change', syncDefaultReminder);
  $('#taskTitle').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveTask(); } });
  $('#remindTomorrowBtn').addEventListener('click', async () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    $('#taskReminder').value = `${localISO(tomorrow)}T09:00`;
    if (await saveTask()) toast('Hatırlatma ertelendi', 'Yarın 09:00’da bildirim gösterilecek.');
  });
  $('#taskModal').addEventListener('input', () => { dirty.taskModal = true; });

  $('#analyzeBtn').addEventListener('click', analyzeTranscript);
  $('#saveCandidatesBtn').addEventListener('click', saveCandidates);
  $('#backToTextBtn').addEventListener('click', () => showStep(false));
  $('#loadSampleBtn').addEventListener('click', async () => {
    $('#transcriptText').value = await window.hafiza.loadSample();
    if (!$('#transcriptTitle').value.trim()) $('#transcriptTitle').value = 'Örnek Derneği haftalık koordinasyon toplantısı';
    dirty.transcriptModal = true;
    updateWordCount(); toast('Örnek deşifre yüklendi');
  });
  $('#loadFileBtn').addEventListener('click', () => $('#transcriptFile').click());
  $('#transcriptFile').addEventListener('change', e => { loadTranscriptFile(e.target.files[0]); e.target.value = ''; });
  $('#transcriptText').addEventListener('input', () => { dirty.transcriptModal = true; updateWordCount(); });
  $('#transcriptText').addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  $('#transcriptText').addEventListener('drop', e => { if (e.dataTransfer?.files.length) { e.preventDefault(); loadTranscriptFile(e.dataTransfer.files[0]); } });

  $('#deleteTranscriptBtn').addEventListener('click', deleteTranscript);
  $('#reanalyzeBtn').addEventListener('click', () => {
    const transcript = db.transcripts.find(t => t.id === viewerId);
    if (transcript) { closeModal('viewerModal', true); openTranscript(transcript); }
  });
  $('#copyTranscriptBtn').addEventListener('click', async () => {
    const transcript = db.transcripts.find(t => t.id === viewerId);
    if (!transcript) return;
    try { await navigator.clipboard.writeText(transcript.text); toast('Metin panoya kopyalandı'); } catch (_) { toast('Kopyalanamadı', 'Metni seçip Ctrl+C ile kopyalayabilirsin.'); }
  });

  $$('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  // Boşluğa yanlışlıkla tıklamak yarım kalan işi silmesin.
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('mousedown', e => { if (e.target === backdrop && !dirty[backdrop.id]) closeModal(backdrop.id); }));
  document.addEventListener('keydown', e => {
    const open = $$('.modal-backdrop:not(.hidden)').at(-1);
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape' && open) { closeModal(open.id); return; }
    if (ctrl && e.key === 'Enter' && open) {
      e.preventDefault();
      if (open.id === 'taskModal') saveTask();
      else if (open.id === 'transcriptModal') ($('#analyzeBtn').classList.contains('hidden') ? saveCandidates() : analyzeTranscript());
      return;
    }
    if (open || !ctrl) return;
    const key = e.key.toLocaleLowerCase('en-US');
    if (key === 'n' && e.shiftKey) { e.preventDefault(); openTranscript(); }
    else if (key === 'n') { e.preventDefault(); openTask(); }
    else if (key === 'f') { e.preventDefault(); if (ui.view === 'transcripts') { ui.view = 'inbox'; activateNav('inbox'); render(); } $('#searchInput').focus(); $('#searchInput').select(); }
  });

  $$('.nav-item').forEach(btn => btn.addEventListener('click', () => { ui.view = btn.dataset.view; ui.project = ''; activateNav(ui.view); render(); }));
  $$('#statusTabs button').forEach(btn => btn.addEventListener('click', () => { $$('#statusTabs button').forEach(b => b.classList.remove('active')); btn.classList.add('active'); ui.filter = btn.dataset.filter; renderTasks(); }));
  $('#projectFilter').addEventListener('change', e => { ui.project = e.target.value; render(); });
  $('#sortSelect').addEventListener('change', e => { ui.sort = e.target.value; renderTasks(); });
  $('#searchInput').addEventListener('input', e => { ui.search = e.target.value; if (ui.view === 'transcripts') return; renderTasks(); });

  $('#openSettingsBtn').addEventListener('click', openSettings);
  $('#settingTray').addEventListener('change', e => { db.settings.minimizeToTray = e.target.checked; persist(); });
  $('#settingSound').addEventListener('change', e => { db.settings.reminderSound = e.target.checked; persist(); });
  $('#settingRepeat').addEventListener('change', e => { db.settings.repeatReminders = e.target.checked; persist(); });
  $('#settingOwner').addEventListener('change', e => { db.settings.defaultOwner = e.target.value.trim(); persist(); });
  $('#settingAutostart').addEventListener('change', async e => {
    const state = await window.hafiza.setAutostart(e.target.checked);
    e.target.checked = state.enabled;
    toast(state.enabled ? 'Windows açılışında başlatılacak' : 'Otomatik başlatma kapatıldı');
  });
  $('#openDataFolderBtn').addEventListener('click', () => window.hafiza.openDataFolder());
  $('#exportDataBtn').addEventListener('click', async () => {
    await persist(true);
    const result = await window.hafiza.exportData();
    if (result.saved) toast('Yedek kaydedildi', result.path);
  });
  $('#importDataBtn').addEventListener('click', importBackup);
  $('#quitAppBtn').addEventListener('click', async () => { await persist(true).catch(() => {}); window.hafiza.quit(); });

  window.hafiza.onRefresh(() => { if (renderedDay !== localISO()) render(); });
  window.hafiza.onOpenTask(taskId => {
    if ($$('.modal-backdrop:not(.hidden)').length) return;
    if (db.tasks.some(t => t.id === taskId)) openTask(taskId);
  });
}

async function init() {
  const { data, status } = await window.hafiza.load();
  db = data;
  db.tasks ||= []; db.transcripts ||= [];
  db.settings = { minimizeToTray: true, reminderSound: true, repeatReminders: true, defaultOwner: 'Atakan', ...(db.settings || {}) };
  bindEvents(); render();
  if (status === 'recovered') {
    toast('Veriler yedekten kurtarıldı', 'Ana dosya okunamadı; son geçerli .bak kopyası yüklendi.');
    persist(true).catch(() => {});
  } else if (status === 'damaged') {
    setSaveStatus(false, 'Veri dosyası okunamadı.');
    toast('Veri dosyası okunamadı', 'Bozuk dosya veri klasöründe saklanacak. “Yedekten geri yükle” ile eski bir kopyayı açabilirsin.');
  }
  checkReminders(); setInterval(checkReminders, 30000);
}

init();
