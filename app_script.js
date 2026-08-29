// =========================================================
// KONFIGURATION — hier eure eigenen Supabase-Zugangsdaten eintragen
// Zu finden in Supabase: Project Settings -> API
// =========================================================
const SUPABASE_URL = "https://gpklreewjcrgdmywpzfv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwa2xyZWV3amNyZ2RteXdwemZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMzU5MDEsImV4cCI6MjEwMzYxMTkwMX0.mncPz5iNyILOqhUeSQJlAI2UDiwmDD-LRw8gnk060PU";
// =========================================================

const CONFIG_MISSING = SUPABASE_URL.includes('DEINE_') || SUPABASE_ANON_KEY.includes('DEIN_');
let sb = null;
if (!CONFIG_MISSING) {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const TABLES = { tasks: 'tasks', social: 'social_posts', newsletter: 'newsletters', support: 'support_tickets' };
const ACTIVE_MEMBER_KEY = 'niloa_active_member_id';

let data = { tasks: [], social: [], newsletter: [], support: [], documents: [] };
let team = [];
let expanded = {};
let archiveOpen = { tasks:false, social:false, newsletter:false, support:false };
let userName = '';
let userId = null;
let viewMode = { social: 'table', newsletter: 'table' };
let calState = { social: currentMonthObj(), newsletter: currentMonthObj() };
let calOpenId = { social: null, newsletter: null };
function currentMonthObj() { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; }

const SECTIONS = {
  tasks: {
    statusLabels: { offen:'Offen', arbeit:'In Arbeit', fertig:'Erledigt' },
    primaryField: 'title', dateField: 'deadline',
    csvFields: ['title','owner','category','priority','deadline','status']
  },
  social: {
    statusLabels: { offen:'Idee', arbeit:'In Produktion', fertig:'Freigegeben' },
    primaryField: 'note', dateField: 'date',
    csvFields: ['date','platform','type','owner','note','status']
  },
  newsletter: {
    statusLabels: { offen:'Entwurf', arbeit:'In Review', fertig:'Versendet' },
    primaryField: 'topic', dateField: 'date',
    csvFields: ['date','topic','segment','note','status']
  },
  support: {
    statusLabels: { offen:'Offen', arbeit:'In Bearbeitung', fertig:'Erledigt' },
    primaryField: 'customer_name', dateField: null,
    csvFields: ['customer_name','order_number','issue','owner','note','status']
  }
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayISO() { return new Date().toISOString().slice(0,10); }
function escapeHtml(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function formatDate(iso) { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }); }
function formatDateTime(ts) { const d = new Date(ts); return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}); }

function setSync(state) {
  const dot = document.getElementById('syncDot'); const text = document.getElementById('syncText');
  dot.classList.remove('saving','error');
  if (state === 'saving') { dot.classList.add('saving'); text.textContent = 'Speichert …'; }
  else if (state === 'error') { dot.classList.add('error'); text.textContent = 'Fehler beim Speichern'; }
  else { text.textContent = 'Live verbunden'; }
}

// ---------- CONFIG CHECK ----------
function showConfigWarningIfNeeded() {
  if (!CONFIG_MISSING) return;
  document.getElementById('loginOverlay').innerHTML = `
    <div class="login-box">
      <div class="brand" style="margin-bottom:4px;">niloa <span>workspace</span></div>
      <p class="hint">⚠️ Supabase ist noch nicht konfiguriert.</p>
      <p style="font-size:13.5px; line-height:1.6;">
        Öffnet <code>app_script.js</code> und tragt oben unter <code>SUPABASE_URL</code> und
        <code>SUPABASE_ANON_KEY</code> eure eigenen Werte ein (zu finden in Supabase unter
        <strong>Project Settings → API</strong>). Danach diese Seite neu laden.
      </p>
    </div>`;
}

// ---------- TEAM / LOGIN ----------
async function fetchTeam() {
  const { data: rows, error } = await sb.from('team_members_public').select('*').order('name');
  if (error) { console.error(error); return; }
  team = rows || [];
}

function renderTeamList() {
  const listEl = document.getElementById('teamList');
  if (!team.length) { listEl.innerHTML = '<div class="meta-line">Noch niemand angelegt — füge dich unten hinzu.</div>'; return; }
  listEl.innerHTML = team.map(m => `
    <div class="team-member-btn" onclick="selectMember('${m.id}')">
      <span>👤 ${escapeHtml(m.name)}</span>
      <span class="lock">${m.has_pin ? '🔒 PIN' : 'ohne PIN'}</span>
    </div>
    <div id="pin-row-${m.id}" class="pin-inline" style="display:none;">
      <input type="text" id="pin-input-${m.id}" maxlength="4" placeholder="PIN">
      <button class="btn small" onclick="confirmPin('${m.id}')">Los</button>
    </div>
  `).join('');
}

function selectMember(id) {
  const m = team.find(x => x.id === id);
  if (!m) return;
  document.getElementById('loginError').textContent = '';
  if (m.has_pin) {
    document.querySelectorAll('.pin-inline').forEach(el => el.style.display = 'none');
    const row = document.getElementById('pin-row-' + id);
    row.style.display = 'flex';
    document.getElementById('pin-input-' + id).focus();
  } else {
    attemptLogin(id, null);
  }
}
function confirmPin(id) {
  const entered = document.getElementById('pin-input-' + id).value.trim();
  attemptLogin(id, entered);
}
async function attemptLogin(id, pin) {
  const { data: ok, error } = await sb.rpc('verify_login', { p_id: id, p_pin: pin });
  if (error) { document.getElementById('loginError').textContent = 'Fehler beim Login. Nochmal versuchen.'; console.error(error); return; }
  if (!ok) { document.getElementById('loginError').textContent = 'Falsche PIN.'; return; }
  const m = team.find(x => x.id === id);
  loginAs(m);
}

async function addTeamMember() {
  const name = document.getElementById('newMemberName').value.trim();
  const pin = document.getElementById('newMemberPin').value.trim();
  if (!name) { document.getElementById('loginError').textContent = 'Bitte einen Namen eingeben.'; return; }
  if (pin && !/^\d{4}$/.test(pin)) { document.getElementById('loginError').textContent = 'PIN muss 4-stellig sein, oder leer lassen.'; return; }
  const { data: rows, error } = await sb.rpc('add_team_member', { p_name: name, p_pin: pin || null });
  if (error) {
    document.getElementById('loginError').textContent = error.message.includes('duplicate') || error.message.includes('unique')
      ? 'Dieser Name existiert schon — wähle ihn aus der Liste.' : 'Fehler: ' + error.message;
    return;
  }
  const newMember = rows[0];
  document.getElementById('newMemberName').value = '';
  document.getElementById('newMemberPin').value = '';
  loginAs({ id: newMember.id, name: newMember.name });
}

function loginAs(member) {
  userName = member.name; userId = member.id;
  try { localStorage.setItem(ACTIVE_MEMBER_KEY, member.id); } catch(e) {}
  document.getElementById('whoPill').textContent = '👤 ' + userName;
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('loginError').textContent = '';
  bootApp();
}

async function showLoginGate() {
  await fetchTeam();
  renderTeamList();
  document.getElementById('loginOverlay').classList.remove('hidden');
}

async function tryAutoLogin() {
  await fetchTeam();
  let activeId = null;
  try { activeId = localStorage.getItem(ACTIVE_MEMBER_KEY); } catch(e) {}
  const member = team.find(m => m.id === activeId);
  if (member) {
    userName = member.name; userId = member.id;
    document.getElementById('whoPill').textContent = '👤 ' + userName;
    document.getElementById('loginOverlay').classList.add('hidden');
    bootApp();
  } else {
    renderTeamList();
    document.getElementById('loginOverlay').classList.remove('hidden');
  }
}

// ---------- LOAD / REALTIME ----------
async function bootApp() {
  await Promise.all([
    fetchSection('tasks'), fetchSection('social'), fetchSection('newsletter'), fetchSection('support'), fetchDocuments()
  ]);
  Object.keys(SECTIONS).forEach(renderSection);
  renderDocuments();
  renderDashboard();
  subscribeRealtime();
}

async function fetchSection(section) {
  setSync('saving');
  const { data: rows, error } = await sb.from(TABLES[section]).select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); setSync('error'); return; }
  const cfg = SECTIONS[section];
  data[section] = rows || [];
  if (cfg.dateField) data[section].sort((a,b) => (a[cfg.dateField]||'').localeCompare(b[cfg.dateField]||''));
  setSync('ok');
}
async function fetchDocuments() {
  const { data: rows, error } = await sb.from('documents').select('*').order('added_at', { ascending: false });
  if (error) { console.error(error); return; }
  data.documents = rows || [];
}

function subscribeRealtime() {
  ['tasks','social_posts','newsletters','support_tickets','documents'].forEach(table => {
    sb.channel('changes-' + table)
      .on('postgres_changes', { event: '*', schema: 'public', table }, async () => {
        const sectionKey = Object.keys(TABLES).find(k => TABLES[k] === table);
        if (sectionKey) { await fetchSection(sectionKey); renderSection(sectionKey); renderDashboard(); }
        else if (table === 'documents') { await fetchDocuments(); renderDocuments(); }
      })
      .subscribe();
  });
}

function log(item, text) {
  const arr = item.log ? [...item.log] : [];
  arr.push({ text, author: userName || 'Team', at: Date.now() });
  return arr;
}

// ---------- TABS ----------
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'overview') renderDashboard();
    });
  });
});

// ---------- ADD ----------
async function addItem(section) {
  let payload = { status: 'offen', created_by: userName || 'Team' };
  if (section === 'tasks') {
    const title = document.getElementById('task-title').value.trim();
    if (!title) return;
    payload.title = title;
    payload.owner = document.getElementById('task-owner').value.trim();
    payload.category = document.getElementById('task-category').value;
    payload.priority = document.getElementById('task-priority').value;
    payload.deadline = document.getElementById('task-deadline').value || null;
    payload.link = document.getElementById('task-link').value.trim();
    payload.log = [{ text: 'Angelegt von ' + payload.created_by, author: payload.created_by, at: Date.now() }];
    ['task-title','task-owner','task-deadline','task-link'].forEach(id => document.getElementById(id).value = '');
  } else if (section === 'social') {
    const date = document.getElementById('social-date').value;
    if (!date) return;
    payload.date = date;
    payload.platform = document.getElementById('social-platform').value;
    payload.type = document.getElementById('social-type').value;
    payload.owner = document.getElementById('social-owner').value.trim();
    payload.note = document.getElementById('social-note').value.trim();
    payload.link = document.getElementById('social-link').value.trim();
    payload.log = [{ text: 'Angelegt von ' + payload.created_by, author: payload.created_by, at: Date.now() }];
    ['social-date','social-owner','social-note','social-link'].forEach(id => document.getElementById(id).value = '');
  } else if (section === 'newsletter') {
    const date = document.getElementById('news-date').value;
    const topic = document.getElementById('news-topic').value.trim();
    if (!date || !topic) return;
    payload.date = date; payload.topic = topic;
    payload.segment = document.getElementById('news-segment').value.trim();
    payload.note = document.getElementById('news-note').value.trim();
    payload.link = document.getElementById('news-link').value.trim();
    payload.log = [{ text: 'Angelegt von ' + payload.created_by, author: payload.created_by, at: Date.now() }];
    ['news-date','news-topic','news-segment','news-note','news-link'].forEach(id => document.getElementById(id).value = '');
  } else if (section === 'support') {
    const name = document.getElementById('sup-name').value.trim();
    if (!name) return;
    payload.customer_name = name;
    payload.order_number = document.getElementById('sup-order').value.trim();
    payload.issue = document.getElementById('sup-issue').value;
    payload.owner = document.getElementById('sup-owner').value.trim();
    payload.note = document.getElementById('sup-note').value.trim();
    payload.log = [{ text: 'Angelegt von ' + payload.created_by, author: payload.created_by, at: Date.now() }];
    ['sup-name','sup-order','sup-owner','sup-note'].forEach(id => document.getElementById(id).value = '');
  }
  setSync('saving');
  const { data: rows, error } = await sb.from(TABLES[section]).insert(payload).select();
  if (error) { console.error(error); setSync('error'); return; }
  data[section].unshift(rows[0]);
  renderSection(section); setSync('ok');
}

// ---------- STATUS / DELETE / EXPAND ----------
function statusCycle(current) { const order = ['offen','arbeit','fertig']; return order[(order.indexOf(current)+1) % order.length]; }

async function toggleStatus(section, id, ev) {
  if (ev) ev.stopPropagation();
  const item = data[section].find(x => x.id === id);
  if (!item) return;
  const from = item.status;
  const newStatus = statusCycle(item.status);
  const newLog = log(item, 'Status: ' + SECTIONS[section].statusLabels[from] + ' → ' + SECTIONS[section].statusLabels[newStatus] + ' (' + (userName||'Team') + ')');
  const patch = { status: newStatus, completed_at: newStatus === 'fertig' ? new Date().toISOString() : null, log: newLog };
  setSync('saving');
  const { data: rows, error } = await sb.from(TABLES[section]).update(patch).eq('id', id).select();
  if (error) { console.error(error); setSync('error'); return; }
  Object.assign(item, rows[0]);
  renderSection(section); setSync('ok');
}

async function deleteItem(section, id, ev) {
  if (ev) ev.stopPropagation();
  if (!confirm('Diesen Eintrag wirklich löschen?')) return;
  setSync('saving');
  const { error } = await sb.from(TABLES[section]).delete().eq('id', id);
  if (error) { console.error(error); setSync('error'); return; }
  data[section] = data[section].filter(x => x.id !== id);
  delete expanded[section+id];
  renderSection(section); setSync('ok');
}
function toggleExpand(section, id) { expanded[section+id] = !expanded[section+id]; renderSection(section); }
function toggleArchive(section) { archiveOpen[section] = !archiveOpen[section]; renderSection(section); }

async function addComment(section, id) {
  const ta = document.getElementById('comment-' + section + '-' + id);
  const text = ta.value.trim();
  if (!text) return;
  const item = data[section].find(x => x.id === id);
  const newLog = log(item, text);
  setSync('saving');
  const { data: rows, error } = await sb.from(TABLES[section]).update({ log: newLog }).eq('id', id).select();
  if (error) { console.error(error); setSync('error'); return; }
  Object.assign(item, rows[0]);
  ta.value = '';
  renderSection(section); setSync('ok');
}

async function saveEdit(section, id) {
  const item = data[section].find(x => x.id === id);
  if (!item) return;
  const prefix = 'edit-' + section + '-' + id + '-';
  const cfgFields = {
    tasks: ['title','owner','category','priority','deadline','link'],
    social: ['date','platform','type','owner','note','link'],
    newsletter: ['date','topic','segment','note','link'],
    support: ['customer_name','order_number','issue','owner','note']
  }[section];
  const patch = {};
  cfgFields.forEach(f => {
    const el = document.getElementById(prefix + f);
    if (el) patch[f] = el.value.trim ? el.value.trim() : el.value;
  });
  patch.log = log(item, 'Bearbeitet von ' + (userName || 'Team'));
  setSync('saving');
  const { data: rows, error } = await sb.from(TABLES[section]).update(patch).eq('id', id).select();
  if (error) { console.error(error); setSync('error'); return; }
  Object.assign(item, rows[0]);
  expanded[section+id] = false;
  renderSection(section); setSync('ok');
}

// ---------- OVERDUE ----------
function isOverdue(section, item) {
  const df = SECTIONS[section].dateField;
  if (!df || !item[df] || item.status === 'fertig') return false;
  return item[df] < todayISO();
}

// ---------- FILTER + SEARCH ----------
function getFiltered(section) {
  const search = (document.getElementById(section+'-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById(section+'-filter-status')?.value || '';
  const catFilter = document.getElementById(section+'-filter-category')?.value
    || document.getElementById(section+'-filter-platform')?.value
    || document.getElementById(section+'-filter-issue')?.value || '';
  const catKey = { tasks:'category', social:'platform', support:'issue' }[section];

  let items = data[section].filter(item => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (catFilter && catKey && item[catKey] !== catFilter) return false;
    if (search) {
      const hay = Object.values(item).filter(v => typeof v === 'string').join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const cutoff = Date.now() - 14*24*60*60*1000;
  const archivedCount = items.filter(i => i.status==='fertig' && i.completed_at && new Date(i.completed_at).getTime() < cutoff).length;
  if (!archiveOpen[section]) {
    items = items.filter(i => !(i.status==='fertig' && i.completed_at && new Date(i.completed_at).getTime() < cutoff));
  }
  return { items, archivedCount };
}
function getFilteredRaw(section) {
  const search = (document.getElementById(section+'-search')?.value || '').toLowerCase();
  const statusFilter = document.getElementById(section+'-filter-status')?.value || '';
  const catFilter = document.getElementById(section+'-filter-platform')?.value || '';
  let items = data[section].filter(item => {
    if (statusFilter && item.status !== statusFilter) return false;
    if (catFilter && item.platform !== catFilter) return false;
    if (search) {
      const hay = Object.values(item).filter(v => typeof v === 'string').join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
  return { items };
}

// ---------- RENDER ----------
function badge(status, labels) { return `<span class="badge ${status}">${labels[status]}</span>`; }
function prioBadge(p) { const map = { hoch:'Hoch', mittel:'Mittel', niedrig:'Niedrig' }; return `<span class="badge prio-${p}">${map[p]||p}</span>`; }

function renderSection(section) {
  const cfg = SECTIONS[section];
  const { items, archivedCount } = getFiltered(section);
  const body = document.getElementById(section + '-body');
  const empty = document.getElementById(section + '-empty');
  const countEl = document.getElementById(section + '-count');
  const archBtn = document.getElementById(section + '-archive-toggle');

  countEl.textContent = items.length + (items.length===1 ? ' Eintrag' : ' Einträge');
  archBtn.textContent = archiveOpen[section] ? '▲ Archiv ausblenden' : (archivedCount ? `▼ Archiv anzeigen (${archivedCount})` : '');
  archBtn.style.display = (archivedCount || archiveOpen[section]) ? 'inline-block' : 'none';

  if (!items.length) { body.innerHTML = ''; empty.style.display = viewMode[section]==='calendar' ? 'none' : 'block'; }
  else { empty.style.display = 'none'; body.innerHTML = items.map(item => renderRow(section, item, cfg)).join(''); }

  if (cfg.dateField !== undefined && (section === 'social' || section === 'newsletter')) {
    renderStats(section);
    if (viewMode[section] === 'calendar') renderCalendar(section);
  }
}

function renderRow(section, item, cfg) {
  const overdue = isOverdue(section, item);
  const key = section + item.id;
  const isOpen = !!expanded[key];
  let cells = '';

  if (section === 'tasks') {
    cells = `
      <td data-label=""><span onclick="toggleStatus('tasks','${item.id}',event)">${badge(item.status,cfg.statusLabels)}</span></td>
      <td data-label="Aufgabe"><strong>${escapeHtml(item.title)}</strong>${overdue?' <span class="badge overdue-flag">Überfällig</span>':''}</td>
      <td data-label="Verantwortlich">${escapeHtml(item.owner)||'—'}</td>
      <td data-label="Kategorie"><span class="cat-tag">${escapeHtml(item.category)}</span></td>
      <td data-label="Priorität">${prioBadge(item.priority)}</td>
      <td data-label="Deadline">${item.deadline?formatDate(item.deadline):'—'}</td>`;
  } else if (section === 'social') {
    cells = `
      <td data-label="Datum">${formatDate(item.date)}${overdue?' <span class="badge overdue-flag">Überfällig</span>':''}</td>
      <td data-label="Plattform">${escapeHtml(item.platform)}</td>
      <td data-label="Typ">${escapeHtml(item.type)}</td>
      <td data-label="Status"><span onclick="toggleStatus('social','${item.id}',event)">${badge(item.status,cfg.statusLabels)}</span></td>
      <td data-label="Verantwortlich">${escapeHtml(item.owner)||'—'}</td>
      <td data-label="Notiz" class="note-cell">${escapeHtml(item.note)||'—'}</td>`;
  } else if (section === 'newsletter') {
    cells = `
      <td data-label="Datum">${formatDate(item.date)}${overdue?' <span class="badge overdue-flag">Überfällig</span>':''}</td>
      <td data-label="Thema"><strong>${escapeHtml(item.topic)}</strong></td>
      <td data-label="Segment">${escapeHtml(item.segment)||'—'}</td>
      <td data-label="Status"><span onclick="toggleStatus('newsletter','${item.id}',event)">${badge(item.status,cfg.statusLabels)}</span></td>
      <td data-label="Notiz" class="note-cell">${escapeHtml(item.note)||'—'}</td>`;
  } else if (section === 'support') {
    cells = `
      <td data-label=""><span onclick="toggleStatus('support','${item.id}',event)">${badge(item.status,cfg.statusLabels)}</span></td>
      <td data-label="Kunde"><strong>${escapeHtml(item.customer_name)}</strong></td>
      <td data-label="Bestellnr.">${escapeHtml(item.order_number)||'—'}</td>
      <td data-label="Anliegen"><span class="cat-tag">${escapeHtml(item.issue)}</span></td>
      <td data-label="Zuständig">${escapeHtml(item.owner)||'—'}</td>
      <td data-label="Notiz" class="note-cell">${escapeHtml(item.note)||'—'}</td>`;
  }

  const expandCell = `<td onclick="toggleExpand('${section}','${item.id}')" style="cursor:pointer;color:rgba(26,22,19,0.3)">${isOpen?'▲':'▼'}</td>${cells}`;
  const row = `<tr class="item-row ${overdue?'overdue':''}" onclick="toggleExpand('${section}','${item.id}')">${expandCell}<td onclick="event.stopPropagation()"><span class="delete-x" onclick="deleteItem('${section}','${item.id}',event)">✕</span></td></tr>`;
  const detail = `<tr class="detail-row ${isOpen?'open':''}"><td colspan="10">${isOpen ? renderDetail(section, item) : ''}</td></tr>`;
  return row + detail;
}

function renderDetail(section, item) {
  const editFieldsMap = {
    tasks: [
      {k:'title', l:'Aufgabe', t:'text'}, {k:'owner', l:'Verantwortlich', t:'text'},
      {k:'category', l:'Kategorie', t:'select', opts:['Design & Website','Compliance & Legal','Marketing & Social','Logistik & Versand','Produkt & Sortiment','Sonstiges']},
      {k:'priority', l:'Priorität', t:'select', opts:['hoch','mittel','niedrig']},
      {k:'deadline', l:'Deadline', t:'date'}, {k:'link', l:'Link', t:'text'}
    ],
    social: [
      {k:'date', l:'Datum', t:'date'}, {k:'platform', l:'Plattform', t:'select', opts:['Instagram','TikTok','Beide']},
      {k:'type', l:'Typ', t:'select', opts:['Post','Story','Reel','Live']}, {k:'owner', l:'Verantwortlich', t:'text'},
      {k:'note', l:'Notiz', t:'textarea'}, {k:'link', l:'Link', t:'text'}
    ],
    newsletter: [
      {k:'date', l:'Datum', t:'date'}, {k:'topic', l:'Thema', t:'text'}, {k:'segment', l:'Segment', t:'text'},
      {k:'note', l:'Notiz', t:'textarea'}, {k:'link', l:'Link', t:'text'}
    ],
    support: [
      {k:'customer_name', l:'Kunde', t:'text'}, {k:'order_number', l:'Bestellnr.', t:'text'}, {k:'issue', l:'Anliegen', t:'select', opts:['Adressänderung','Retoure','Lieferverzögerung','Allgemeine Frage','Sonstiges']},
      {k:'owner', l:'Zuständig', t:'text'}, {k:'note', l:'Notiz', t:'textarea'}
    ]
  };
  const prefix = 'edit-' + section + '-' + item.id + '-';
  const fieldsHtml = editFieldsMap[section].map(f => {
    const val = escapeHtml(item[f.k] || '');
    if (f.t === 'select') {
      const opts = f.opts.map(o => `<option value="${o}" ${item[f.k]===o?'selected':''}>${o}</option>`).join('');
      return `<label class="field">${f.l}<select id="${prefix}${f.k}">${opts}</select></label>`;
    }
    if (f.t === 'textarea') return `<label class="field">${f.l}<textarea id="${prefix}${f.k}">${val}</textarea></label>`;
    return `<label class="field">${f.l}<input type="${f.t}" id="${prefix}${f.k}" value="${val}"></label>`;
  }).join('');

  const linkHtml = item.link ? `<a class="link-chip" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">🔗 ${escapeHtml(item.link)}</a>` : '';
  const logHtml = (item.log||[]).slice().reverse().map(l => `
    <div class="log-item">${escapeHtml(l.text)}<div class="log-meta">${escapeHtml(l.author)} · ${formatDateTime(l.at)}</div></div>
  `).join('') || '<div class="meta-line">Noch keine Einträge.</div>';

  return `
    <div class="detail-grid">
      <div class="detail-section">
        <h4>Bearbeiten</h4>
        <div class="form-grid">${fieldsHtml}</div>
        ${linkHtml}
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn small" onclick="saveEdit('${section}','${item.id}')">Speichern</button>
          <button class="btn ghost small" onclick="toggleExpand('${section}','${item.id}')">Schließen</button>
        </div>
        <div class="meta-line" style="margin-top:10px;">Angelegt von ${escapeHtml(item.created_by)} am ${formatDateTime(item.created_at)}</div>
      </div>
      <div class="detail-section">
        <h4>Verlauf &amp; Kommentare</h4>
        <div class="log-list">${logHtml}</div>
        <div class="comment-row">
          <textarea id="comment-${section}-${item.id}" placeholder="Kommentar hinzufügen ..."></textarea>
          <button class="btn small" onclick="addComment('${section}','${item.id}')">Senden</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- VIEW TOGGLE ----------
function setView(section, mode) {
  viewMode[section] = mode;
  document.getElementById(section + '-view-table').classList.toggle('active', mode === 'table');
  document.getElementById(section + '-view-calendar').classList.toggle('active', mode === 'calendar');
  document.getElementById(section + '-table-view').style.display = mode === 'table' ? 'table' : 'none';
  document.getElementById(section + '-empty').style.display = 'none';
  document.getElementById(section + '-archive-toggle').style.display = mode === 'table' ? '' : 'none';
  document.getElementById(section + '-calendar-view').style.display = mode === 'calendar' ? 'block' : 'none';
  if (mode === 'calendar') renderCalendar(section);
}

// ---------- CALENDAR ----------
const MONTH_NAMES = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const DAY_LABELS = ['Mo','Di','Mi','Do','Fr','Sa','So'];

function changeMonth(section, delta) {
  const st = calState[section];
  let m = st.month + delta, y = st.year;
  if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
  calState[section] = { year: y, month: m };
  calOpenId[section] = null;
  renderCalendar(section);
}

function renderCalendar(section) {
  const { year, month } = calState[section];
  document.getElementById(section + '-cal-title').textContent = MONTH_NAMES[month] + ' ' + year;

  const { items } = getFilteredRaw(section);
  const dateField = SECTIONS[section].dateField;
  const byDate = {};
  items.forEach(it => { if (it[dateField]) { (byDate[it[dateField]] = byDate[it[dateField]] || []).push(it); } });

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayStr = todayISO();

  let cells = DAY_LABELS.map(l => `<div class="cal-daylabel">${l}</div>`).join('');
  for (let i = 0; i < startWeekday; i++) {
    const dayNum = daysInPrevMonth - startWeekday + i + 1;
    cells += `<div class="cal-cell outside"><div class="cal-daynum">${dayNum}</div></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayItems = byDate[iso] || [];
    const isToday = iso === todayStr;
    const chips = dayItems.slice(0,3).map(it => {
      const label = it[SECTIONS[section].primaryField] || it.platform || it.topic || '';
      return `<div class="cal-chip ${it.status}" onclick="calendarItemClick('${section}','${it.id}')" title="${escapeHtml(label)}">${escapeHtml((label||'').slice(0,16))}</div>`;
    }).join('');
    const more = dayItems.length > 3 ? `<div class="meta-line">+${dayItems.length-3} mehr</div>` : '';
    cells += `<div class="cal-cell ${isToday?'today':''}"><div class="cal-daynum">${d}</div>${chips}${more}</div>`;
  }
  const totalCellsSoFar = startWeekday + daysInMonth;
  const trailing = (7 - (totalCellsSoFar % 7)) % 7;
  for (let i = 1; i <= trailing; i++) cells += `<div class="cal-cell outside"><div class="cal-daynum">${i}</div></div>`;

  document.getElementById(section + '-cal-grid').innerHTML = cells;

  const detailWrap = document.getElementById(section + '-cal-detail');
  if (calOpenId[section]) {
    const item = data[section].find(x => x.id === calOpenId[section]);
    detailWrap.innerHTML = item ? renderDetail(section, item) : '';
  } else { detailWrap.innerHTML = ''; }
}
function calendarItemClick(section, id) { calOpenId[section] = calOpenId[section] === id ? null : id; renderCalendar(section); }

// ---------- STATISTICS ----------
function statBar(label, count, max) {
  const pct = max ? Math.round((count/max)*100) : 0;
  return `<div class="stat-bar-row"><span class="stat-bar-label">${escapeHtml(label)}</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div><span class="stat-bar-num">${count}</span></div>`;
}
function renderStats(section) {
  const items = data[section];
  const el = document.getElementById(section + '-stats');
  if (!el) return;
  const total = items.length;
  const cfg = SECTIONS[section];

  const statusCounts = { offen:0, arbeit:0, fertig:0 };
  items.forEach(i => statusCounts[i.status] = (statusCounts[i.status]||0)+1);
  const maxStatus = Math.max(1, ...Object.values(statusCounts));
  let statusHtml = Object.keys(statusCounts).map(s => statBar(cfg.statusLabels[s], statusCounts[s], maxStatus)).join('');

  let secondaryHtml = '', secondaryTitle = '';
  if (section === 'social') {
    secondaryTitle = 'Nach Plattform';
    const counts = {}; items.forEach(i => counts[i.platform] = (counts[i.platform]||0)+1);
    const max = Math.max(1, ...Object.values(counts));
    secondaryHtml = Object.keys(counts).length ? Object.entries(counts).map(([k,v]) => statBar(k, v, max)).join('') : '<div class="meta-line">Noch keine Daten.</div>';
  } else if (section === 'newsletter') {
    secondaryTitle = 'Nach Segment';
    const counts = {}; items.forEach(i => { const seg = i.segment || 'Ohne Segment'; counts[seg] = (counts[seg]||0)+1; });
    const max = Math.max(1, ...Object.values(counts));
    secondaryHtml = Object.keys(counts).length ? Object.entries(counts).map(([k,v]) => statBar(k, v, max)).join('') : '<div class="meta-line">Noch keine Daten.</div>';
  }

  const now = new Date();
  const months = [];
  for (let off = -2; off <= 3; off++) {
    const d = new Date(now.getFullYear(), now.getMonth()+off, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), label: MONTH_NAMES[d.getMonth()].slice(0,3) + ' ' + String(d.getFullYear()).slice(2) });
  }
  const monthCounts = months.map(m => {
    const count = items.filter(i => { if (!i[cfg.dateField]) return false; const d = new Date(i[cfg.dateField] + 'T00:00:00'); return d.getFullYear() === m.year && d.getMonth() === m.month; }).length;
    return { label: m.label, count };
  });
  const maxMonth = Math.max(1, ...monthCounts.map(m => m.count));
  const monthHtml = monthCounts.map(m => statBar(m.label, m.count, maxMonth)).join('');

  el.innerHTML = `
    <div class="stat-block"><div class="stat-total">${total}</div><div class="meta-line" style="margin-bottom:14px;">Einträge insgesamt</div><h4>Nach Status</h4>${statusHtml}</div>
    <div class="stat-block"><h4>${secondaryTitle}</h4>${secondaryHtml}</div>
    <div class="stat-block"><h4>Zeitverlauf (6 Monate)</h4>${monthHtml}</div>
  `;
}

// ---------- DOCUMENTS ----------
async function addDocument() {
  const title = document.getElementById('doc-title').value.trim();
  const link = document.getElementById('doc-link').value.trim();
  if (!title || !link) return;
  const payload = {
    title, category: document.getElementById('doc-category').value, link,
    note: document.getElementById('doc-note').value.trim(), added_by: userName || 'Team'
  };
  setSync('saving');
  const { data: rows, error } = await sb.from('documents').insert(payload).select();
  if (error) { console.error(error); setSync('error'); return; }
  data.documents.unshift(rows[0]);
  document.getElementById('doc-title').value = '';
  document.getElementById('doc-link').value = '';
  document.getElementById('doc-note').value = '';
  renderDocuments(); setSync('ok');
}
async function deleteDocument(id) {
  if (!confirm('Diesen Dokument-Link wirklich entfernen?')) return;
  setSync('saving');
  const { error } = await sb.from('documents').delete().eq('id', id);
  if (error) { console.error(error); setSync('error'); return; }
  data.documents = data.documents.filter(x => x.id !== id);
  renderDocuments(); setSync('ok');
}
function renderDocuments() {
  const search = (document.getElementById('documents-search')?.value || '').toLowerCase();
  const catFilter = document.getElementById('documents-filter-category')?.value || '';
  let items = data.documents.filter(d => {
    if (catFilter && d.category !== catFilter) return false;
    if (search) { const hay = (d.title + ' ' + (d.note||'') + ' ' + d.category).toLowerCase(); if (!hay.includes(search)) return false; }
    return true;
  });
  const body = document.getElementById('documents-body');
  const empty = document.getElementById('documents-empty');
  document.getElementById('documents-count').textContent = items.length + (items.length===1?' Dokument':' Dokumente');
  if (!items.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = items.map(d => `
    <tr>
      <td data-label="Titel"><strong>${escapeHtml(d.title)}</strong></td>
      <td data-label="Kategorie"><span class="cat-tag">${escapeHtml(d.category)}</span></td>
      <td data-label="Link"><a class="link-chip" href="${escapeHtml(d.link)}" target="_blank" rel="noopener">🔗 Öffnen</a></td>
      <td data-label="Notiz" class="note-cell">${escapeHtml(d.note) || '—'}</td>
      <td data-label="Hinzugefügt">${escapeHtml(d.added_by)}<div class="meta-line">${formatDateTime(d.added_at)}</div></td>
      <td><span class="delete-x" onclick="deleteDocument('${d.id}')">✕</span></td>
    </tr>
  `).join('');
}

// ---------- CSV EXPORT ----------
function exportCSV(section) {
  const cfg = SECTIONS[section];
  const rows = [cfg.csvFields.join(';')];
  data[section].forEach(item => {
    rows.push(cfg.csvFields.map(f => {
      let v = item[f] === undefined || item[f] === null ? '' : String(item[f]);
      v = v.replace(/"/g,'""');
      if (v.includes(';') || v.includes('\n')) v = '"' + v + '"';
      return v;
    }).join(';'));
  });
  const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'niloa-' + section + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- DASHBOARD ----------
function renderDashboard() {
  const stats = document.getElementById('dash-stats');
  let statsHtml = '';
  Object.keys(SECTIONS).forEach(section => {
    const items = data[section];
    const open = items.filter(i => i.status !== 'fertig').length;
    const label = { tasks:'Offene Aufgaben', social:'Geplanter Content', newsletter:'Offene Kampagnen', support:'Offene Tickets' }[section];
    statsHtml += `<div class="dash-stat"><div class="num">${open}</div><div class="lbl">${label}</div></div>`;
  });
  stats.innerHTML = statsHtml;

  let overdueHtml = '';
  Object.keys(SECTIONS).forEach(section => {
    data[section].forEach(item => {
      if (isOverdue(section, item)) {
        const label = item[SECTIONS[section].primaryField] || '(ohne Titel)';
        overdueHtml += `<div class="dash-list-item"><span>${escapeHtml(label)} <span class="cat-tag">${sectionLabel(section)}</span></span><span style="color:var(--red);font-weight:600;">${formatDate(item[SECTIONS[section].dateField])}</span></div>`;
      }
    });
  });
  document.getElementById('dash-overdue').innerHTML = overdueHtml || '<div class="meta-line">Nichts überfällig — sauber.</div>';

  const in7 = new Date(); in7.setDate(in7.getDate()+7);
  const in7ISO = in7.toISOString().slice(0,10);
  let upcoming = [];
  Object.keys(SECTIONS).forEach(section => {
    const df = SECTIONS[section].dateField;
    if (!df) return;
    data[section].forEach(item => {
      if (item.status !== 'fertig' && item[df] && item[df] >= todayISO() && item[df] <= in7ISO) upcoming.push({ section, item });
    });
  });
  upcoming.sort((a,b) => a.item[SECTIONS[a.section].dateField].localeCompare(b.item[SECTIONS[b.section].dateField]));
  document.getElementById('dash-upcoming').innerHTML = upcoming.length
    ? upcoming.map(u => `<div class="dash-list-item"><span>${escapeHtml(u.item[SECTIONS[u.section].primaryField]||'(ohne Titel)')} <span class="cat-tag">${sectionLabel(u.section)}</span></span><span>${formatDate(u.item[SECTIONS[u.section].dateField])}</span></div>`).join('')
    : '<div class="meta-line">Nichts in den nächsten 7 Tagen.</div>';

  let activity = [];
  Object.keys(SECTIONS).forEach(section => {
    data[section].forEach(item => { (item.log||[]).forEach(l => activity.push({ section, label: item[SECTIONS[section].primaryField], ...l })); });
  });
  activity.sort((a,b) => b.at - a.at);
  activity = activity.slice(0,10);
  document.getElementById('dash-activity').innerHTML = activity.length
    ? activity.map(a => `<div class="dash-list-item"><span>${escapeHtml(a.text)} <span class="cat-tag">${sectionLabel(a.section)}</span></span><span class="meta-line">${a.author} · ${formatDateTime(a.at)}</span></div>`).join('')
    : '<div class="meta-line">Noch keine Aktivität.</div>';
}
function sectionLabel(s) { return { tasks:'Aufgabe', social:'Social', newsletter:'Newsletter', support:'Support' }[s]; }

// ---------- INIT ----------
showConfigWarningIfNeeded();
if (!CONFIG_MISSING) { tryAutoLogin(); }
