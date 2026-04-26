/* ===== DREEM App Engine ===== */

// ===== PAGE & NAV MANAGEMENT =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('app-' + (page === 'landing' ? 'landing' : 'dashboard')).classList.add('active');
  window.scrollTo(0, 0);
}

function showLogin() { showDashboard('admin'); }

function showDashboard(role) {
  showPage('dashboard');
  switchRole(role);
}

// ===== LIVE CLASS (LOCAL PI NETWORK) WITH ANTI-ABUSE =====
function startLiveClass() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isSchoolHours = (day >= 1 && day <= 5) && (hour >= 7 && hour <= 17);

  if (!isSchoolHours) {
    alert('🔒 Live Class BLOCKED\n\nLive classes can only be started during Admin-approved school hours (Mon-Fri, 7:00-17:00).\n\nThis attempt has been logged and flagged to the Headteacher.');
    logAbuseAttempt('live_class_outside_hours');
    return;
  }

  // Log the session to the agent_actions_log for full audit transparency
  logClassSession();

  // On the real Pi, this opens the local Jitsi Meet instance
  // running on the Pi's own Wi-Fi mesh (no internet required)
  const jitsiUrl = 'https://dreem.local/meet/form4a-maths';
  
  // For demo: show confirmation
  const confirmed = confirm(
    '📡 Start Live Class on LOCAL Pi Network\n\n' +
    'Room: Form 4A — Mathematics\n' +
    'Teacher: Mme Ngozi\n' +
    'Network: DREEM-SchoolBox-WiFi (Offline)\n\n' +
    '⚠️ This session will be logged and visible to the Admin.\n\n' +
    'Proceed?'
  );
  if (confirmed) {
    window.open(jitsiUrl, '_blank');
  }
}

function logAbuseAttempt(type) {
  // In production: POST to /api/intelligence/log-abuse
  console.warn(`[SHADOW PREVENTION] Blocked attempt: ${type} at ${new Date().toISOString()}`);
  fetch('http://localhost:3000/api/intelligence/log-abuse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, timestamp: new Date().toISOString() })
  }).catch(() => console.log('Abuse log queued for next sync'));
}

function logClassSession() {
  fetch('http://localhost:3000/api/intelligence/log-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacher: 'mme_ngozi', class: 'Form 4A', timestamp: new Date().toISOString() })
  }).catch(() => console.log('Session log queued'));
}

function toggleMenu() {
  document.getElementById('mobile-menu').classList.toggle('open');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

function setLang(lang) {
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

// Scroll to section
function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

// Navbar scroll effect
window.addEventListener('scroll', () => {
  const nav = document.getElementById('navbar');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ===== ROLE DATA =====
const roles = {
  admin: {
    name: 'Principal Abah',
    role: 'Headteacher / Admin',
    avatar: 'PA',
    navItems: [
      { icon: '📊', label: 'Dashboard', active: true },
      { icon: '👤', label: 'Students' },
      { icon: '👩‍🏫', label: 'Teachers' },
      { icon: '💰', label: 'Finance Overview' },
      { icon: '📋', label: 'Reports' },
      { icon: '⚙️', label: 'Settings' },
    ]
  },
  bursar: {
    name: 'Mr. Foncha',
    role: 'Bursar / Finance',
    avatar: 'MF',
    navItems: [
      { icon: '📊', label: 'Dashboard', active: true },
      { icon: '💳', label: 'Collect Fees' },
      { icon: '⚠️', label: 'Defaulters' },
      { icon: '🧾', label: 'Receipts' },
      { icon: '📈', label: 'Reconciliation' },
      { icon: '⚙️', label: 'Settings' },
    ]
  },
  teacher: {
    name: 'Mme Ngozi',
    role: 'Teacher — Mathematics',
    avatar: 'MN',
    navItems: [
      { icon: '📊', label: 'Dashboard', active: true },
      { icon: '📝', label: 'My Classes' },
      { icon: '🎯', label: 'Mastery Insights' },
      { icon: '📖', label: 'Lesson Planner' },
      { icon: '💬', label: 'Messages' },
      { icon: '❤️', label: 'Wellbeing' },
    ]
  },
  student: {
    name: 'Amara Mbeki',
    role: 'Student — Form 4A',
    avatar: 'AM',
    navItems: [
      { icon: '📊', label: 'My Progress', active: true },
      { icon: '📚', label: 'Exercises' },
      { icon: '🏆', label: 'Badges' },
      { icon: '📝', label: 'Exams' },
      { icon: '💬', label: 'Ask Teacher' },
    ]
  },
  parent: {
    name: 'M. Mbeki',
    role: 'Parent / Guardian',
    avatar: 'MM',
    navItems: [
      { icon: '📊', label: 'Overview', active: true },
      { icon: '💰', label: 'Pay Fees' },
      { icon: '📝', label: 'Grades' },
      { icon: '💬', label: 'Messages' },
    ]
  }
};

// ===== SWITCH ROLE =====
function switchRole(role) {
  const r = roles[role];
  if (!r) return;

  // Update select
  const sel = document.getElementById('role-select');
  if (sel) sel.value = role;

  // Sidebar user
  document.getElementById('sb-user').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="dh-avatar">${r.avatar}</div>
      <div>
        <div class="sb-user-name">${r.name}</div>
        <div class="sb-user-role">${r.role}</div>
      </div>
    </div>`;

  // Sidebar nav
  document.getElementById('sb-nav').innerHTML = r.navItems.map(n =>
    `<div class="sb-nav-item${n.active ? ' active' : ''}"><span>${n.icon}</span><span>${n.label}</span></div>`
  ).join('');

  // Avatar
  document.getElementById('dh-avatar').textContent = r.avatar;
  document.getElementById('dh-breadcrumb').textContent = r.navItems[0].label;

  // Render content
  const renderers = { admin: renderAdmin, bursar: renderBursar, teacher: renderTeacher, student: renderStudent, parent: renderParent };
  const content = document.getElementById('dash-content');
  content.innerHTML = '';
  if (renderers[role]) {
      renderers[role](content);
      // Fire dynamic AI Router query
      fetchDashboardInsight(role, { action: "page_load", current_view: role });
  }

  closeSidebar();
}

// ===== DYNAMIC AI ROUTER =====
async function fetchDashboardInsight(role, payload) {
  // We don't fetch AI for parents directly yet
  if (role === 'parent') return; 

  const boxTitle = document.getElementById('ai-insight-title');
  const boxContent = document.getElementById('ai-insight-content');
  
  if (!boxContent) return;
  
  // Store fallback content
  const originalHtml = boxContent.innerHTML;
  boxContent.innerHTML = '<span style="opacity:0.6;font-size:13px"><span class="loader"></span> Connecting to local Tri-Model Router...</span>';

  try {
    const res = await fetch('http://localhost:3000/api/intelligence/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, task_type: 'dashboard_insight', payload })
    });
    
    if (res.ok) {
      const data = await res.json();
      // If it's a teacher agent feed, inject HTML directly
      if (role === 'teacher' && data.is_agent_action) {
         boxContent.innerHTML = data.insight;
      } else {
         boxContent.innerHTML = `<p>${data.insight}</p>`;
      }
      
      if (boxTitle && data.tier_used) {
        const models = { 1: "Operations Agent (Gemma 4)", 2: "Pedagogy Agent (Qwen3)", 3: "Chief of Staff (Gemini 3.0)" };
        boxTitle.innerHTML = `🤖 ${models[data.tier_used] || 'Autonomous Agent'}`;
      }
    } else {
      boxContent.innerHTML = originalHtml; // Revert if failed
    }
  } catch(e) {
    console.log("Agents offline, showing cache.", e);
    // Silent fail -> just show the hardcoded cached insight so the demo doesn't look broken
    boxContent.innerHTML = originalHtml;
  }
}


// ===== ADMIN DASHBOARD — THE COMMAND CENTER =====
function renderAdmin(el) {
  el.innerHTML = `
    <div class="dash-greeting">
      <h2>Good morning, Principal Abah 👋</h2>
      <p>Monday, April 7, 2026 — Term 2, Week 6 · Last sync: 2 min ago</p>
    </div>

    <!-- SCHOOL HEALTH RING -->
    <div class="dash-grid-2" style="margin-bottom:24px">
      <div class="dash-card" style="text-align:center">
        <h4>🏥 School Health Score</h4>
        <div class="health-ring" style="background:conic-gradient(#22c55e 0deg 284deg, rgba(255,255,255,0.06) 284deg 360deg)">
          <div class="hr-inner">
            <div class="hr-score" style="background:var(--gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent">78.9</div>
            <div class="hr-label">/ 100</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:16px;text-align:left">
          <div style="font-size:12px;color:var(--text-muted)">📚 Academic: <strong style="color:#22c55e">74.5%</strong></div>
          <div style="font-size:12px;color:var(--text-muted)">💰 Financial: <strong style="color:var(--orange)">68.0%</strong></div>
          <div style="font-size:12px;color:var(--text-muted)">📅 Attendance: <strong style="color:#22c55e">91.2%</strong></div>
          <div style="font-size:12px;color:var(--text-muted)">👩‍🏫 Teachers: <strong style="color:#22c55e">82.0%</strong></div>
        </div>
      </div>
      <div class="dash-card">
        <h4>⚙️ Rule Engine — Active Rules</h4>
        <div class="rule-card">
          <div class="rc-info"><div class="rc-name">🧠 Brilliant but Absent</div><div class="rc-desc">High mastery + low attendance → flag for parent interview</div></div>
          <span class="status-badge status-paid">0 matches</span>
        </div>
        <div class="rule-card" style="border-color:var(--red)">
          <div class="rc-info"><div class="rc-name">📉 Pedagogical Over-Speeding</div><div class="rc-desc">Syllabus done but mastery <70% → draft Remediation Week</div></div>
          <span class="status-badge status-overdue">1 match ⚠️</span>
        </div>
        <div class="rule-card" style="border-color:var(--orange)">
          <div class="rc-info"><div class="rc-name">⭐ Star at Risk</div><div class="rc-desc">Top mastery + high debt → generate Merit Waiver case</div></div>
          <span class="status-badge status-partial">2 matches</span>
        </div>
        <div class="rule-card">
          <div class="rc-info"><div class="rc-name">🛡️ Shadow Prevention</div><div class="rc-desc">Off-hours class attempts → block & log to audit</div></div>
          <span class="status-badge status-overdue">2 blocked</span>
        </div>
        <button class="qa-btn" style="width:100%;margin-top:8px;justify-content:center;border-color:var(--blue);color:var(--blue)" onclick="openRuleBuilder()">+ Create New Rule</button>
      </div>
    </div>

    <div class="metrics-grid">
      ${metricCard('💰', '68%', 'Fee Collection', '↑ +12%', 'up')}
      ${metricCard('📚', '74.5%', 'Avg Mastery', '↑ +2.3', 'up')}
      ${metricCard('👩‍🏫', '94%', 'Teacher Attendance', '→ Stable', 'neutral')}
      ${metricCard('🛡️', '2', 'Abuse Flags', 'Mr. Tabi', 'down')}
    </div>

    <div class="insight-box">
      <div class="ib-title" id="ai-insight-title">🤖 Chief of Staff Agent — Gemini 3.0</div>
      <div id="ai-insight-content">
        <p><strong>Policy Drafted:</strong> Detected correlation between Form 4A attendance drop (-8%) and unpaid fees (3 students, 45+ days).
        Drafted "Academic Merit Waiver" for Amara Mbeki and "Parent Interview Request" for Jean-Pierre M. Awaiting your signature.</p>
      </div>
    </div>

    <!-- SYLLABUS VELOCITY RADAR -->
    <h3 class="section-title">📉 Syllabus Velocity Radar</h3>
    <div class="dash-card" style="margin-bottom:24px">
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:14px">Comparing syllabus <span style="color:var(--blue);font-weight:700">coverage speed</span> against actual <span style="color:#22c55e;font-weight:700">student mastery</span>. Red gap = Over-Speeding.</div>
      <div class="velocity-bar"><span class="vb-label">Form 1 Math</span><div class="vb-track"><div class="vb-fill vb-mastery" style="width:88%"></div></div><span style="font-size:11px;color:var(--text-dim);width:40px;text-align:right">88%</span></div>
      <div class="velocity-bar"><span class="vb-label">Form 2 Math</span><div class="vb-track"><div class="vb-fill vb-mastery" style="width:82%"></div></div><span style="font-size:11px;color:var(--text-dim);width:40px;text-align:right">82%</span></div>
      <div class="velocity-bar"><span class="vb-label">Form 3B Math</span><div class="vb-track"><div class="vb-fill vb-danger" style="width:30%"></div></div><span style="font-size:11px;color:var(--red);font-weight:700;width:40px;text-align:right">30%⚠️</span></div>
      <div class="velocity-bar"><span class="vb-label">Form 4A Math</span><div class="vb-track"><div class="vb-fill vb-danger" style="width:64%"></div></div><span style="font-size:11px;color:var(--orange);font-weight:700;width:40px;text-align:right">64%⚠️</span></div>
      <div style="margin-top:12px;padding:10px;background:var(--red-bg);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-sm)">
        <div style="font-size:12px;font-weight:700;color:var(--red)">⚠️ Over-Speeding Alert: Form 3B & Form 4A</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px">Syllabus marked 70% complete, but avg mastery at 30-64%. Remediation Week auto-drafted for teacher approval.</div>
      </div>
    </div>

    <!-- DROPOUT HEATMAP -->
    <h3 class="section-title">📉 Dropout Risk Heatmap</h3>
    <div class="dash-card" style="padding:15px;margin-bottom:24px">
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:14px">Cross-referencing Mastery Velocity, Fee Debt, and Attendance.</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px">
        <div class="risk-cell low">F1<div class="risk-label">92% Safe</div></div>
        <div class="risk-cell low">F2<div class="risk-label">88% Safe</div></div>
        <div class="risk-cell med">F3<div class="risk-label">65% Watch</div></div>
        <div class="risk-cell high">F4<div class="risk-label">42% 🚩</div></div>
        <div class="risk-cell med">F5<div class="risk-label">74% Watch</div></div>
      </div>
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:12px;font-weight:700;color:var(--red)">🚩 Form 4: 3 students at HIGH dropout risk</div>
        <div style="font-size:11px;color:var(--text-dim);margin:4px 0">Fee debt >45 days + mastery below 50%. Merit Waivers drafted for 2 star students.</div>
      </div>
    </div>

    <!-- SHADOW PREVENTION -->
    <div class="insight-box" style="border-color:var(--red);background:rgba(239,68,68,0.04)">
      <div class="ib-title" style="color:var(--red)">🛡️ Shadow Education Prevention Engine</div>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.6">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
          <div style="padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <div style="font-size:11px;color:var(--text-dim);font-weight:600">LIVE CLASS SESSIONS (THIS WEEK)</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--green)">14</div>
            <div style="font-size:11px;color:var(--text-dim)">All within approved schedule ✅</div>
          </div>
          <div style="padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <div style="font-size:11px;color:var(--text-dim);font-weight:600">OFF-HOURS ATTEMPTS BLOCKED</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--red)">2</div>
            <div style="font-size:11px;color:var(--text-dim)">Mr. Tabi (Sat 15:00, Sun 10:00) 🚩</div>
          </div>
        </div>
      </div>
    </div>

    <!-- MERIT PROPOSALS PENDING -->
    <h3 class="section-title" style="margin-top:24px">⭐ Merit Waiver Proposals (Awaiting Signature)</h3>
    <div class="merit-card">
      <div class="merit-icon">🏆</div>
      <div class="merit-info">
        <strong>Amara Mbeki — Form 4A</strong>
        <span>Top 5% Mathematics (91% mastery) · Balance: 25,000 FCFA · Proposal: 10% Star Student Discount</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="qa-btn" style="padding:6px 12px;font-size:11px;border-color:var(--green);color:var(--green)">✓ Approve</button>
        <button class="qa-btn" style="padding:6px 12px;font-size:11px">✏️ Edit</button>
      </div>
    </div>
    <div class="merit-card">
      <div class="merit-icon">📚</div>
      <div class="merit-info">
        <strong>Jean-Pierre Manga — Form 3B</strong>
        <span>Struggling (30% mastery) · Balance: 75,000 FCFA · Proposal: Parent Interview + Payment Plan</span>
      </div>
      <div style="display:flex;gap:6px">
        <button class="qa-btn" style="padding:6px 12px;font-size:11px;border-color:var(--orange);color:var(--orange)">📞 Schedule</button>
      </div>
    </div>

    <h3 class="section-title" style="margin-top:24px">📋 Quick Actions</h3>
    <div class="quick-actions">
      <button class="qa-btn">📄 Generate Impact Report</button>
      <button class="qa-btn">👩‍🏫 View Teacher Loads</button>
      <button class="qa-btn">⚠️ Review Defaulters</button>
      <button class="qa-btn">📊 Class Performance Map</button>
      <button class="qa-btn" style="border-color:var(--blue);color:var(--blue)">📅 Manage Schedules</button>
    </div>

    <div class="dash-grid-2">
      <div class="dash-card">
        <h4>📈 Fee Collection by Class</h4>
        ${progressItem('Form 1', 92, 'green')}
        ${progressItem('Form 2', 85, 'green')}
        ${progressItem('Form 3', 65, 'orange')}
        ${progressItem('Form 4', 68, 'orange')}
        ${progressItem('Form 5', 54, 'orange')}
      </div>
      <div class="dash-card">
        <h4>🎯 Mastery by Subject</h4>
        ${progressItem('Mathematics', 74, 'green')}
        ${progressItem('English', 81, 'green')}
        ${progressItem('French', 78, 'green')}
        ${progressItem('Science', 62, 'blue')}
        ${progressItem('History/Geo', 69, 'orange')}
      </div>
    </div>

    <h3 class="section-title">👩‍🏫 Teacher Performance & Audit</h3>
    <table class="data-table">
      <thead><tr><th>Teacher</th><th>Classes/Week</th><th>Student Improvement</th><th>Load</th><th>Live Class Audit</th></tr></thead>
      <tbody>
        <tr><td>Mme Ngozi</td><td>26</td><td><span class="status-badge status-paid">+14% avg ⭐</span></td><td><span class="status-badge status-ok">Normal</span></td><td><span class="status-badge status-paid">Clean ✅</span></td></tr>
        <tr><td>Mr. Tabi</td><td>30</td><td><span class="status-badge status-partial">+3% avg</span></td><td><span class="status-badge status-partial">High</span></td><td><span class="status-badge status-overdue">2 Flags 🚩</span></td></tr>
        <tr><td>Mme Eto'o</td><td>22</td><td><span class="status-badge status-paid">+11% avg</span></td><td><span class="status-badge status-ok">Normal</span></td><td><span class="status-badge status-paid">Clean ✅</span></td></tr>
        <tr><td>Mr. Ndi</td><td>34</td><td><span class="status-badge status-partial">+5% avg</span></td><td><span class="status-badge status-overdue">Overloaded ⚠️</span></td><td><span class="status-badge status-paid">Clean ✅</span></td></tr>
      </tbody>
    </table>

    <h3 class="section-title">🧾 Audit Trail (Last 24h)</h3>
    <table class="data-table">
      <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th></tr></thead>
      <tbody>
        <tr><td>10:42</td><td>Mr. Foncha</td><td>Recorded payment: 25,000 FCFA</td><td>Amara Mbeki</td></tr>
        <tr><td>09:15</td><td>System</td><td>Rule triggered: "Star at Risk"</td><td>Amara Mbeki, Jean-Pierre M.</td></tr>
        <tr><td>08:00</td><td>Mme Ngozi</td><td>Marked topic complete: Linear Equations</td><td>Form 4A</td></tr>
        <tr><td>Sat 15:00</td><td>Mr. Tabi</td><td><span style="color:var(--red)">BLOCKED: Off-hours class attempt</span></td><td>Form 4A</td></tr>
      </tbody>
    </table>`;
}
}

// ===== BURSAR DASHBOARD: THE MERIT-RETENTION BRIDGE =====
function renderBursar(el) {
  el.innerHTML = `
    <div class="dash-greeting">
      <h2>Bursar Dashboard — Mr. Foncha 💳</h2>
      <p>Fee Collection Period: Term 2, 2025-2026 · Currency: FCFA</p>
    </div>

    <div class="metrics-grid">
      ${metricCard('💰', '4,180,000', 'Total Due (FCFA)', '', 'neutral')}
      ${metricCard('✅', '3,260,400', 'Collected', '78% of target', 'up')}
      ${metricCard('⚠️', '12', 'Defaulters', '↓ -3 this week', 'up')}
      ${metricCard('🏆', '3', 'Pending Waivers', 'Action Auth', 'neutral')}
    </div>

    <!-- MERIT-RETENTION BRIDGE -->
    <div class="insight-box" style="border-color:var(--orange);background:rgba(245,158,11,0.05)">
      <div class="ib-title" id="ai-insight-title" style="color:var(--orange)">⚠️ AI Pattern: Merit-Retention Alert</div>
      <div id="ai-insight-content">
        <p>3 students in the top 10% of mastery have crossed the 30-day debt threshold. History shows <strong>80% dropout risk</strong> when high-performers are sent home for fees.</p>
        <div style="padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:10px">
           <div style="font-size:12px;font-weight:700">Agent Action Drafted: 'Academic Merit Waiver'</div>
           <div style="font-size:12px;color:var(--text-dim);margin-top:4px">Proposing 10-15% discount for families of Amara Mbeki and two others, funded by the Gov Subsidy Pool.</div>
           <div style="display:flex;gap:10px;margin-top:10px">
             <button class="qa-btn" style="border-color:var(--orange);color:var(--orange)">Review & Send to Principal</button>
           </div>
        </div>
      </div>
    </div>

    <h3 class="section-title">💳 Quick Collection</h3>
    <div class="quick-actions">
      <button class="qa-btn" style="background:#ffcc00;color:#000;border:none">📱 Scan MTN MoMo</button>
      <button class="qa-btn" style="background:#ff6600;color:#fff;border:none">📱 Scan Orange Money</button>
      <button class="qa-btn">💵 Cash Payment</button>
      <button class="qa-btn">🖨️ Print Receipt</button>
    </div>

    <h3 class="section-title">⚖️ Defaulter Management Pipeline</h3>
    <table class="data-table">
      <thead><tr><th>Student</th><th>Class</th><th>Balance (FCFA)</th><th>Days Overdue</th><th>Mastery</th><th>AI Recommendation</th></tr></thead>
      <tbody>
        <tr><td>Amara Mbeki</td><td>Form 4A</td><td>25,000</td><td>32</td><td><span class="status-badge status-paid">Top 5% ⭐</span></td><td><button class="qa-btn" style="padding:5px 10px;font-size:11px;border-color:var(--green);color:var(--green)">🏆 Propose Merit Waiver</button></td></tr>
        <tr><td>Jean-Pierre M.</td><td>Form 3A</td><td>75,000</td><td>45</td><td><span class="status-badge status-overdue">Bottleneck</span></td><td><button class="qa-btn" style="padding:5px 10px;font-size:11px">📞 Call Parent (Warning)</button></td></tr>
        <tr><td>Emmanuel N.</td><td>Form 4A</td><td>50,000</td><td>30</td><td><span class="status-badge status-partial">Average</span></td><td><button class="qa-btn" style="padding:5px 10px;font-size:11px">📱 Send MoMo Prompt</button></td></tr>
        <tr><td>Marie F.</td><td>Form 1A</td><td>100,000</td><td>60</td><td><span class="status-badge status-ok">Good</span></td><td><button class="qa-btn" style="padding:5px 10px;font-size:11px;color:var(--red);border-color:var(--red)">⛔ Restrict Access</button></td></tr>
      </tbody>
    </table>

    <div class="dash-grid-2">
      <div class="dash-card">
        <h4>💰 Today's Ledger</h4>
        ${progressItem('MoMo Payments', 62, 'green')}
        ${progressItem('Orange Money', 18, 'orange')}
        ${progressItem('Cash Payments', 20, 'blue')}
        <div style="margin-top:14px;font-size:13px;color:var(--text-dim);border-top:1px solid var(--border);padding-top:10px">
          <div style="display:flex;justify-content:space-between"><span>Total Received Today:</span> <strong style="color:var(--green);font-size:16px">185,000 FCFA</strong></div>
          <div style="display:flex;justify-content:space-between;margin-top:4px"><span>Receipts Printed:</span> <strong>12</strong></div>
        </div>
      </div>
      <div class="dash-card">
        <h4>📈 Collection Velocity</h4>
        ${progressItem('Week 1 (Start)', 45, 'orange')}
        ${progressItem('Week 3', 58, 'blue')}
        ${progressItem('Week 5', 72, 'green')}
        ${progressItem('Week 6 (Now)', 78, 'green')}
        <div style="font-size:11px;color:var(--text-dim);margin-top:10px;text-align:center">Trailing 12% ahead of last semester.</div>
      </div>
    </div>`;
}

// ===== TEACHER DASHBOARD =====
function renderTeacher(el) {
  // Time-lock logic: Only allow Live Class during Admin-approved hours
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0=Sun, 6=Sat
  const isSchoolHours = (day >= 1 && day <= 5) && (hour >= 7 && hour <= 17);
  const liveClassBtn = isSchoolHours 
    ? `<button class="qa-btn" style="background:var(--blue);color:#fff;border:none" onclick="startLiveClass()">
         <span class="sync-dot" style="background:#fff"></span> Start Live Class (Local Pi Network)
       </button>`
    : `<button class="qa-btn" style="opacity:0.4;cursor:not-allowed" disabled>
         🔒 Live Class Locked (Outside School Hours)
       </button>`;

  el.innerHTML = `
    <div class="dash-greeting">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h2>Welcome back, Mme Ngozi 👩‍🏫</h2>
          <p>Monday, April 7 — You have 4 classes today · 26 classes this week</p>
        </div>
        ${liveClassBtn}
      </div>
    </div>

    <div class="wellbeing-strip">
      <div class="wb-text">❤️ Weekly Load: <strong>26 classes</strong> + 8 defaulter follow-ups · Feeling overloaded?</div>
      <button class="wb-btn">🚩 Flag to Headteacher</button>
    </div>

    <div class="metrics-grid">
      ${metricCard('📚', '4', 'Classes Today', '2 done', 'up')}
      ${metricCard('🎯', '7.8/10', 'Avg Class Mastery', '↑ +0.4', 'up')}
      ${metricCard('⚠️', '6', 'Students Need Help', '3 flagged', 'down')}
      ${metricCard('🤖', '2', 'Agent Actions Pending', 'Awaiting Approval', 'neutral')}
    </div>

    <div class="insight-box" style="border-color:var(--orange)">
      <div class="ib-title" id="ai-insight-title" style="color:var(--orange)">🤖 Pedagogy Agent — Action Queue</div>
      <div id="ai-insight-content">
        <div style="padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:12px;color:var(--text-dim);font-weight:700">🧠 Cognitive Lab Alert: Amara Mbeki (Logic Drop)</div>
            <span class="status-badge status-partial">Pending Approval</span>
          </div>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.5"><strong>Drafted Action (Qwen3):</strong> Assign 'Pattern Mastery Mod 3' and send SMS to Parent explaining the intervention strategy.</p>
          <div style="display:flex;gap:10px">
            <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Approve & Execute</button>
            <button class="qa-btn" style="border-color:var(--red);color:var(--red)">✗ Deny</button>
            <button class="qa-btn">✏️ Edit Message</button>
          </div>
        </div>
      </div>
    </div>

    <h3 class="section-title">📅 Today's Schedule</h3>
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="metric-card" style="border-left:3px solid var(--green)">
        <div style="font-size:12px;color:var(--text-dim)">8:00 - 9:30</div>
        <div style="font-weight:700;margin:4px 0">Form 4A — Maths</div>
        <div style="font-size:12px;color:var(--green)">✓ Done</div>
      </div>
      <div class="metric-card" style="border-left:3px solid var(--green)">
        <div style="font-size:12px;color:var(--text-dim)">10:00 - 11:30</div>
        <div style="font-weight:700;margin:4px 0">Form 3B — Maths</div>
        <div style="font-size:12px;color:var(--green)">✓ Done</div>
      </div>
      <div class="metric-card" style="border-left:3px solid var(--blue)">
        <div style="font-size:12px;color:var(--text-dim)">13:00 - 14:30</div>
        <div style="font-weight:700;margin:4px 0">Form 2A — Maths</div>
        <div style="font-size:12px;color:var(--blue)">→ Next</div>
      </div>
      <div class="metric-card" style="border-left:3px solid var(--text-dim)">
        <div style="font-size:12px;color:var(--text-dim)">15:00 - 16:30</div>
        <div style="font-weight:700;margin:4px 0">Form 5A — Maths</div>
        <div style="font-size:12px;color:var(--text-dim)">Upcoming</div>
      </div>
    </div>

    <h3 class="section-title">⚠️ Students Needing Help</h3>
    <table class="data-table">
      <thead><tr><th>Student</th><th>Class</th><th>Topic</th><th>Mastery</th><th>AI Suggestion</th></tr></thead>
      <tbody>
        <tr><td>Jean-Pierre M.</td><td>4A</td><td>Prime Numbers</td><td>3/10</td><td>Exercise 7B-1 (FR) · 15 min</td></tr>
        <tr><td>Grace A.</td><td>4A</td><td>Factorization</td><td>4/10</td><td>Interactive Factor Trees · 10 min</td></tr>
        <tr><td>Emmanuel N.</td><td>3B</td><td>Equations</td><td>5/10</td><td>Guided practice set · 20 min</td></tr>
      </tbody>
    </table>

    <h3 class="section-title">📊 Class Mastery Overview — Form 4A</h3>
    <div class="dash-card">
      ${progressItem('Integers', 92, 'green')}
      ${progressItem('Fractions', 78, 'green')}
      ${progressItem('Decimals', 85, 'green')}
      ${progressItem('Algebra Basics', 81, 'green')}
      ${progressItem('Prime Factorization', 42, 'orange')}
      ${progressItem('Geometry I', 0, 'blue')}
    </div>

    <!-- SYLLABUS VELOCITY WARNING -->
    <div class="insight-box" style="border-color:var(--red);background:rgba(239,68,68,0.04);margin-top:24px">
      <div class="ib-title" style="color:var(--red)">⚠️ Syllabus Velocity Alert — Form 4A</div>
      <p>You've marked <strong>7/10 topics completed</strong>, but class average mastery is <strong style="color:var(--red)">64%</strong>. The system has detected <strong>Pedagogical Over-Speeding</strong>.</p>
      <div style="margin-top:10px;padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:12px;font-weight:700;margin-bottom:6px">📋 Drafted: Remediation Week Plan</div>
        <div style="font-size:12px;color:var(--text-dim)">Pause new topics. Focus week on: Prime Factorization review (3 sessions), Algebra reinforcement (2 sessions).</div>
        <div style="display:flex;gap:10px;margin-top:10px">
          <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Approve Remediation</button>
          <button class="qa-btn" style="border-color:var(--red);color:var(--red)">✗ Continue Syllabus</button>
          <button class="qa-btn">✏️ Modify Plan</button>
        </div>
      </div>
    </div>

    <!-- BRIDGE BRIEFINGS -->
    <h3 class="section-title" style="margin-top:24px">🧠 Bridge Briefings (AI-Drafted Curriculum Questions)</h3>
    <div class="dash-card" style="border-color:rgba(6,182,212,0.2);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-size:13px;font-weight:700">Amara Mbeki — Pattern Recognition Gap</div>
          <div style="font-size:11px;color:var(--text-dim)">Scores 91% calculation but 72% pattern recognition. Needs "why" reasoning.</div>
        </div>
        <span class="status-badge status-partial">Curriculum Action</span>
      </div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--cyan)">Tomorrow's 3 Targeted Questions:</div>
      <div style="font-size:13px;color:var(--text-muted);padding:4px 0">1. "Can you explain <em>why</em> 17 is prime but 15 is not?"</div>
      <div style="font-size:13px;color:var(--text-muted);padding:4px 0">2. "What pattern do you see in 2, 3, 5, 7, 11?"</div>
      <div style="font-size:13px;color:var(--text-muted);padding:4px 0">3. "How would you check if 91 is prime?"</div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Accept & Print</button>
        <button class="qa-btn">✏️ Edit Questions</button>
      </div>
    </div>
    <div class="dash-card" style="border-color:rgba(6,182,212,0.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <div style="font-size:13px;font-weight:700">Jean-Pierre Manga — Inference Weakness</div>
          <div style="font-size:11px;color:var(--text-dim)">Reading speed 55 WPM, accuracy 60%. Bottleneck: inference in French texts.</div>
        </div>
        <span class="status-badge status-overdue">Critical Gap</span>
      </div>
      <div style="font-size:12px;font-weight:700;margin-bottom:6px;color:var(--cyan)">Demain — 3 Questions Ciblées (FR):</div>
      <div style="font-size:13px;color:var(--text-muted);padding:4px 0">1. "Que veut dire l'auteur quand il dit...?"</div>
      <div style="font-size:13px;color:var(--text-muted);padding:4px 0">2. "Pourquoi le personnage a-t-il fait ce choix?"</div>
      <div style="font-size:13px;color:var(--text-muted);padding:4px 0">3. "Quel est le message principal du paragraphe?"</div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Accepter</button>
        <button class="qa-btn">✏️ Modifier</button>
      </div>
    </div>

    <h3 class="section-title" style="margin-top:24px">✏️ Quick Actions</h3>
    <div class="quick-actions">
      <button class="qa-btn">📝 Grade Form 4A Test</button>
      <button class="qa-btn">🤖 AI-Assisted Grading</button>
      <button class="qa-btn">📨 Message Parents</button>
      <button class="qa-btn">📖 Lesson Planner</button>
      <button class="qa-btn">📹 Upload Video Lesson</button>
    </div>`;
}

// ===== STUDENT DASHBOARD: THE LEARNING WORLD =====
function renderStudent(el) {
  el.innerHTML = `
    <div class="dash-greeting">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h2>Welcome, Amara! 🎒</h2>
          <p>Your personal academic control center · Form 4A</p>
        </div>
        <button class="qa-btn" style="border-color:var(--red);color:var(--red);animation:pulse 2s infinite">
          🔴 Join Live Class Now (Mathematics)
        </button>
      </div>
    </div>

    <!-- INTELLIGENT LEARNING FLOW -->
    <div class="dash-card" style="margin-bottom:24px;border-left:4px solid var(--blue)">
      <h4 style="color:var(--blue);display:flex;align-items:center;gap:8px">🎯 What You Must Learn Next</h4>
      <div style="display:flex;gap:16px;margin-top:14px;align-items:flex-start">
        <div style="font-size:32px">🔢</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:16px">Prime Factorization (Math)</div>
          <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">Why this matters: It is the foundation for solving complex algebraic equations next term.</div>
          <div style="display:flex;gap:10px">
             <button class="qa-btn" style="background:var(--blue);color:#fff;border:none">📹 Watch 5-min Video</button>
             <button class="qa-btn">✍️ Try 3 Practice Questions</button>
          </div>
        </div>
      </div>
    </div>

    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
      ${metricCard('🎯', '7 / 10', 'Math Mastered', '3 to go', 'up')}
      ${metricCard('🧠', '92 WPM', 'Reading Speed', 'Top 15%', 'up')}
      ${metricCard('🏆', 'Lvl 12', 'Current Level', '250 XP to Lvl 13', 'up')}
      ${metricCard('💳', '25k', 'Fees Balance', 'Action Required', 'down')}
    </div>

    <div class="dash-grid-2">
      <!-- PERFORMANCE VIEW -->
      <div class="dash-card">
        <h4>📊 Your Progress Map</h4>
        ${progressItem('✓ Decimals (Mastered)', 100, 'green')}
        ${progressItem('✓ Algebra Basics (Mastered)', 100, 'green')}
        ${progressItem('✓ Linear Equations (Mastered)', 100, 'green')}
        ${progressItem('⏳ Prime Numbers', 35, 'orange')}
        ${progressItem('🔒 Geometry I (Locked)', 0, 'blue')}
        
        <div style="margin-top:20px;padding:12px;background:var(--orange-bg);border:1px solid rgba(245,158,11,0.2);border-radius:var(--radius-sm)">
           <div style="font-size:11px;font-weight:700;color:var(--orange)">⚠️ Revision Priority</div>
           <div style="font-size:12px;color:var(--text-muted)">The system noticed you struggled with Prime Numbers. A simplified explanation has been unlocked for you.</div>
        </div>
      </div>

      <!-- COGNITIVE RADAR & FUTURE PATH -->
      <div class="dash-card">
        <h4>🧠 Cognitive Radar Chart</h4>
        <div class="radar-chart">
          <span class="radar-label rl-n">Reading</span>
          <span class="radar-label rl-s">Math</span>
          <span class="radar-label rl-e">Logic</span>
          <span class="radar-label rl-w">Clarity</span>
          <div class="radar-shape"></div>
        </div>
        
        <div style="margin-top:16px;padding:12px;background:rgba(168,85,247,0.05);border:1px solid rgba(168,85,247,0.2);border-radius:var(--radius-sm)">
          <div style="font-size:11px;font-weight:700;color:var(--purple)">🛤️ Future-Path Predictor</div>
          <div style="font-size:12px;color:var(--text-muted)">Logic and Math scores indicate 94% alignment with Scientific (Engineering) stream. Keep it up!</div>
        </div>
      </div>
    </div>

    <!-- ENGAGEMENT LAYER -->
    <h3 class="section-title">🏆 Mastery Board (Not Just XP, Real Competence)</h3>
    <div class="badge-shelf">
      <div class="game-badge earned">🌟 Fast Starter (7-Day Streak)</div>
      <div class="game-badge earned">📐 Algebra Ace (100% Exam Mode)</div>
      <div class="game-badge earned">📖 Speed Reader (90+ WPM)</div>
      <div class="game-badge">🔒 Geometry Genius</div>
      <div class="game-badge">🔒 Logic Grandmaster</div>
    </div>

    <div class="quick-actions" style="margin-top:24px;display:flex;justify-content:center">
      <button class="qa-btn" style="background:var(--gradient);color:#fff;border:none;padding:12px 30px;font-size:15px" onclick="renderCognitiveLab()">
        🧠 Enter Cognitive Lab
      </button>
    </div>`;
}

// ===== COGNITIVE LAB (THE TRAINING GROUND) =====
function renderCognitiveLab() {
  const el = document.getElementById('dash-content');
  el.innerHTML = `
    <div class="dash-greeting">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <h2>🧠 Cognitive Lab</h2>
          <p>Where you build speed, logic, and clarity.</p>
        </div>
        <button class="qa-btn" onclick="renderStudent(document.getElementById('dash-content'))">← Back to Dashboard</button>
      </div>
    </div>

    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="dash-card" style="text-align:center;padding:20px;border-top:3px solid var(--blue)">
        <div style="font-size:24px;margin-bottom:8px">📖</div>
        <div style="font-weight:700">Reading</div>
        <div style="font-size:11px;color:var(--text-dim)">92 WPM</div>
      </div>
      <div class="dash-card" style="text-align:center;padding:20px;border-top:3px solid var(--green)">
        <div style="font-size:24px;margin-bottom:8px">🔢</div>
        <div style="font-weight:700">Math</div>
        <div style="font-size:11px;color:var(--text-dim)">Lvl 14</div>
      </div>
      <div class="dash-card" style="text-align:center;padding:20px;border-top:3px solid var(--orange)">
        <div style="font-size:24px;margin-bottom:8px">🧩</div>
        <div style="font-weight:700">Logic</div>
        <div style="font-size:11px;color:var(--text-dim)">94th Pctl</div>
      </div>
      <div class="dash-card" style="text-align:center;padding:20px;border-top:3px solid var(--red)">
        <div style="font-size:24px;margin-bottom:8px">✍️</div>
        <div style="font-weight:700">Clarity</div>
        <div style="font-size:11px;color:var(--text-dim)">B+</div>
      </div>
    </div>

    <h3 class="section-title">🚀 Professional-Grade Training Modules</h3>
    <div class="dash-grid-2">
      <div class="cog-module" style="background:linear-gradient(135deg, rgba(58,123,213,0.05), transparent);border-color:rgba(58,123,213,0.2)">
        <div class="cm-icon">📖</div>
        <div class="cm-name" style="color:var(--blue)">The Insight Reader</div>
        <div class="cm-desc" style="margin-bottom:14px">Test your speed of synthesis and author bias detection. Improves WPM.</div>
        <button class="qa-btn" style="width:100%;justify-content:center;background:var(--blue);color:#fff;border:none">Train Now (3 Min)</button>
      </div>
      
      <div class="cog-module" style="background:linear-gradient(135deg, rgba(34,197,94,0.05), transparent);border-color:rgba(34,197,94,0.2)">
        <div class="cm-icon">🧮</div>
        <div class="cm-name" style="color:var(--green)">Mental Agility Center</div>
        <div class="cm-desc" style="margin-bottom:14px">High-speed calculations and logical problem solving.</div>
        <button class="qa-btn" style="width:100%;justify-content:center;background:var(--green);color:#fff;border:none">Train Now (5 Min)</button>
      </div>

      <div class="cog-module" style="background:linear-gradient(135deg, rgba(239,68,68,0.05), transparent);border-color:rgba(239,68,68,0.2)">
        <div class="cm-icon">✍️</div>
        <div class="cm-name" style="color:var(--red)">The Clarity Hub</div>
        <div class="cm-desc" style="margin-bottom:14px">Grammar, tone matching, and conciseness challenges.</div>
        <button class="qa-btn" style="width:100%;justify-content:center;background:var(--red);color:#fff;border:none">Train Now (4 Min)</button>
      </div>

      <div class="cog-module" style="background:linear-gradient(135deg, rgba(245,158,11,0.05), transparent);border-color:rgba(245,158,11,0.2)">
        <div class="cm-icon">🧩</div>
        <div class="cm-name" style="color:var(--orange)">Pattern Mastery</div>
        <div class="cm-desc" style="margin-bottom:14px">Critical thinking puzzles. The core of the Future-Path predictor.</div>
        <button class="qa-btn" style="width:100%;justify-content:center;background:var(--orange);color:#fff;border:none">Train Now (5 Min)</button>
      </div>
    </div>
  `;
}

// ===== PARENT DASHBOARD: THE ACCOMPANIMENT WORLD =====
function renderParent(el) {
  el.innerHTML = `
    <div class="dash-greeting">
      <h2>Welcome, M. Mbeki 👨‍👩‍👧</h2>
      <p>Viewing: Amara Mbeki — Form 4A</p>
    </div>

    <!-- STUDENT DNA (INSTITUTIONAL MEMORY) -->
    <div class="dash-card" style="margin-bottom:24px;border-left:4px solid var(--purple)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
        <h4 style="color:var(--purple);display:flex;align-items:center;gap:8px">🧬 Student DNA Profile</h4>
        <span class="status-badge" style="background:var(--purple-bg);color:var(--purple)">Form 4 Update</span>
      </div>
      <div style="display:flex;align-items:center;gap:20px">
        <div class="dh-avatar" style="width:64px;height:64px;font-size:20px;background:var(--purple)">AM</div>
        <div style="flex:1">
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">Based on 3 years of historic data, Amara is a <strong>Visual & Logical Learner</strong>.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><span style="font-size:11px;color:var(--text-dim);display:block">Strongest Core</span> <strong style="color:var(--green)">Calculation (94th Pctl)</strong></div>
            <div><span style="font-size:11px;color:var(--text-dim);display:block">Current Bottleneck</span> <strong style="color:var(--orange)">Pattern Recognition</strong></div>
            <div><span style="font-size:11px;color:var(--text-dim);display:block">Best Teaching Prep</span> <strong>Visual Models & "Why" logic</strong></div>
            <div><span style="font-size:11px;color:var(--text-dim);display:block">Risk Factors</span> <strong>None actively detected</strong></div>
          </div>
        </div>
      </div>
    </div>

    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      ${metricCard('🎯', '7/10', 'Topics Mastered', 'Doing well!', 'up')}
      ${metricCard('📉', '0', 'Classes Missed', '100% Attendance', 'up')}
      ${metricCard('🛤️', 'Scientific', 'Future-Path', '92% Suitability', 'up')}
    </div>

    <div class="dash-grid-2">
      <!-- PRIDE PROMPT -->
      <div class="insight-box" style="border-color:var(--green);background:rgba(67,160,71,0.05);margin-bottom:0">
        <div class="ib-title" style="color:var(--green)">💡 Tonight's Pride Prompt</div>
        <div id="ai-insight-content">
          <p>Amara just mastered <strong>Prime Factorization</strong> with a massive speed increase! This was a struggle point yesterday, but her determination conquered it.</p>
          <div style="padding:10px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin:12px 0">
            <strong style="display:block;font-size:12px;margin-bottom:4px">Ask her tonight:</strong>
            <em>"I heard you finally cracked the Factorization patterns today — can you show me the trick you used to solve them?"</em>
          </div>
          <div style="display:flex;gap:10px">
             <button class="qa-btn" style="border-color:var(--green);color:var(--green);font-size:11px">💬 Ask Teacher for Follow-up</button>
          </div>
        </div>
      </div>

      <!-- FEE BALANCE CARVE-OUT -->
      <div class="child-card" style="margin-bottom:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h4>💰 Fee Balance & Status</h4>
          <span class="status-badge status-partial">Pending</span>
        </div>
        <div style="display:flex;gap:20px;align-items:center;margin-bottom:14px">
          <div>
            <div style="font-size:12px;color:var(--text-dim)">Total Paid</div>
            <div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:var(--green)">125,000 F</div>
          </div>
          <div style="flex:1">
            <div style="font-size:12px;color:var(--text-dim)">Balance (Access Restricted Soon)</div>
            <div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:var(--orange)">25,000 F</div>
          </div>
        </div>
        ${progressItem('Tuition Progress', 83, 'green')}
        <button class="btn-momo" style="width:100%">📱 Pay 25,000 FCFA via MTN MoMo</button>
      </div>
    </div>

    <!-- COGNITIVE GROWTH AUDIT -->
    <h3 class="section-title" style="margin-top:24px">🧠 Cognitive Growth Audit</h3>
    <table class="data-table">
      <thead><tr><th>Skill Area</th><th>Latest Score</th><th>National Pctl</th><th>Agent Note</th></tr></thead>
      <tbody>
        <tr><td>Reading Speed</td><td><span class="status-badge status-paid">92 WPM</span></td><td>88th</td><td>"Excellent synthesis speed. Keep reading complex English texts."</td></tr>
        <tr><td>Mathematical Logic</td><td><span class="status-badge status-ok">Lvl 14</span></td><td>94th</td><td>"Elite calculation speed. Weakness identified in pattern reasoning."</td></tr>
        <tr><td>Clarity (Writing)</td><td><span class="status-badge status-partial">Grade B+</span></td><td>72nd</td><td>"Grammar is solid, needs work on conciseness."</td></tr>
      </tbody>
    </table>

    <div class="quick-actions" style="margin-top:24px">
      <button class="qa-btn">💬 Schedule Teacher Meeting</button>
      <button class="qa-btn">📄 Download Term Impact Report</button>
      <button class="qa-btn" style="border-color:var(--blue);color:var(--blue)">📅 View Exam Calendar</button>
    </div>`;
}

// ===== HELPERS =====
function metricCard(icon, value, label, trend, type) {
  return `<div class="metric-card">
    <div class="mc-header"><span class="mc-icon">${icon}</span>${trend ? `<span class="mc-trend ${type}">${trend}</span>` : ''}</div>
    <div class="mc-value">${value}</div>
    <div class="mc-label">${label}</div>
  </div>`;
}

function progressItem(label, pct, color) {
  return `<div class="prog-bar-container">
    <div class="prog-label"><span>${label}</span><span>${pct}%</span></div>
    <div class="prog-bg"><div class="prog-fill ${color}" style="width:${pct}%"></div></div>
  </div>`;
}

// ===== RULE BUILDER MODAL =====
function openRuleBuilder() {
  const root = document.getElementById('modal-root');
  if(!root) return;
  root.innerHTML = `
    <div class="modal-overlay" id="rule-modal" onclick="if(event.target===this) closeModal()">
      <div class="modal-box">
        <div class="modal-header">
          <h3>⚙️ Create New Intelligence Rule</h3>
          <button class="btn-close-modal" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-dim);margin-bottom:20px">Define autonomous triggers using live data streams.</p>
          
          <div class="rule-builder-group">
            <label style="font-size:12px;font-weight:700;color:var(--blue)">IF (Condition Focus)</label>
            <select class="rule-select">
              <optgroup label="Academic Data">
                <option>Student Mastery drops by > 15%</option>
                <option>Syllabus Completion > Class Mastery</option>
              </optgroup>
              <optgroup label="Financial Data">
                <option selected>Fee Debt > 30 Days</option>
                <option>Payment received</option>
              </optgroup>
              <optgroup label="Attendance Data">
                <option>Student absence > 3 consecutive days</option>
                <option>Teacher misses scheduled Live Class</option>
              </optgroup>
            </select>
          </div>

          <div class="rule-builder-group">
            <label style="font-size:12px;font-weight:700;color:var(--orange)">AND (Correlating Factor)</label>
            <select class="rule-select">
              <option selected>Student is Top 10% (Star Performer)</option>
              <option>Student is marked as Low Income</option>
              <option>Reading Speed is above 80 WPM</option>
              <option>None</option>
            </select>
          </div>

          <div class="rule-builder-group">
            <label style="font-size:12px;font-weight:700;color:var(--green)">THEN (Agent Action)</label>
            <select class="rule-select">
              <option>Draft 'Bridge Briefing' for Teacher</option>
              <option selected>Draft 'Merit Waiver Proposal' for Bursar</option>
              <option>Generate 'Pride Prompt' SMS to Parent</option>
              <option>Trigger 'Principal Alert' and Block Access</option>
            </select>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:24px">
            <button class="qa-btn" onclick="closeModal()">Cancel</button>
            <button class="qa-btn" style="background:var(--blue);color:#fff;border:none" onclick="saveRule()">Deploy to Chief of Staff Agent</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const root = document.getElementById('modal-root');
  if(root) root.innerHTML = '';
  document.body.style.overflow = 'auto';
}

function saveRule() {
  closeModal();
  alert("Rule saved and injected into Gemini 3.0 Pro context window!");
}
