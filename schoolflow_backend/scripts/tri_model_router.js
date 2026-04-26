const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const OLLAMA_URL = 'http://ollama:11434/api/generate';

// ============================================================
// DREEM AUTONOMOUS MULTI-AGENT CONTROLLER
// Tri-Model Brain: Gemma 4 (Ops) | Qwen3 (Pedagogy) | Gemini (Strategy)
// ============================================================

// Helper: Call Ollama (local AI on Raspberry Pi)
const callOllama = async (model, prompt) => {
    try {
        const response = await axios.post(OLLAMA_URL, {
            model: model,
            prompt: prompt,
            stream: false
        }, { timeout: 30000 });
        return response.data.response;
    } catch (e) {
        console.error(`[Agent Offline] ${model}: ${e.message}`);
        return null; // Falls back to cached/hardcoded response
    }
};

// ============================================================
// CORE INTELLIGENCE ROUTER
// ============================================================
app.post('/api/intelligence/route', async (req, res) => {
    const { role, task_type, payload } = req.body;
    console.log(`[AGENT] Role: ${role} | Task: ${task_type}`);

    try {
        let aiResponse = "";
        let isAgentAction = false;
        let tierUsed = 1;

        // ==============================
        // AGENT 1: Operations (Gemma 4)
        // Handles: Student, Bursar, Parent fast tasks
        // ==============================
        if (role === 'student' || role === 'bursar' || role === 'parent') {
            tierUsed = 1;

            if (task_type === 'pride_prompt') {
                return res.json({
                    status: "success", tier_used: 1,
                    insight: `<strong>Tonight's Conversation:</strong> Amara just mastered Linear Equations after 4 attempts! Ask her: "Can you teach me how to solve one?" She will light up.`
                });
            }

            if (task_type === 'merit_analysis') {
                return res.json({
                    status: "success", tier_used: 1,
                    insight: `<strong>Star at Risk:</strong> Amara Mbeki — Top 5% Mathematics, 25,000 FCFA balance. Recommendation: Generate Merit Waiver Business Case for Admin review.`
                });
            }

            if (task_type === 'cognitive_lab_result') {
                return res.json({
                    status: "success", tier_used: 1,
                    insight: `<strong>Pattern Detected:</strong> Your logic accuracy dropped to 72% on Pattern Mastery. Bottleneck: Pattern Recognition. Assigned: "Prime Factor Patterns" module (15 min). Your reading speed remains strong at 92 WPM.`
                });
            }

            if (task_type === 'fee_payment') {
                return res.json({
                    status: "success", tier_used: 1,
                    insight: `<strong>Payment Recorded:</strong> 25,000 FCFA via MTN MoMo (Ref: MO-2026-0415). Remaining balance: 0 FCFA. Receipt #LBY-R-0847 dispatched to parent via SMS.`
                });
            }

            // Fallback: dashboard insight
            aiResponse = await callOllama('gemma', `You are the Operations Agent for a Cameroonian school. Role: ${role}. Context: ${JSON.stringify(payload)}. Give one actionable insight.`);
            if (!aiResponse) {
                if (role === 'bursar') aiResponse = `<strong>Daily Summary:</strong> 3 MoMo payments received today (75,000 FCFA total). 2 students flagged as "Star at Risk" — high mastery but unpaid. See Merit Proposals.`;
                else if (role === 'parent') aiResponse = `<strong>Pride Prompt:</strong> Amara's reading speed improved by 12% this week (92 WPM). Her logic accuracy needs a small boost. Ask her about the patterns she's been learning.`;
                else aiResponse = `<strong>Your Focus Today:</strong> Prime Numbers — you're at 35%. Try the Pattern Mastery game first (10 min), then attempt Exercise 8A. You're 1 topic away from unlocking Geometry!`;
            }
        }

        // ==============================
        // AGENT 2: Pedagogy (Qwen3)
        // Handles: Teacher accompaniment, Bridge Briefings, Syllabus Velocity
        // ==============================
        else if (role === 'teacher') {
            tierUsed = 2;
            isAgentAction = true;

            if (task_type === 'bridge_briefing') {
                return res.json({
                    status: "success", tier_used: 2, is_agent_action: true,
                    insight: `
                    <div style="padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:10px">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div style="font-size:13px;font-weight:700;color:var(--cyan)">🧠 Bridge Briefing: Amara Mbeki (Pattern Recognition Gap)</div>
                        <span class="status-badge status-partial">Curriculum Action</span>
                      </div>
                      <p style="margin:0 0 10px;font-size:13px;color:var(--text-muted)"><strong>Bottleneck:</strong> Scores 91% on calculation but 72% on pattern recognition. She solves "what" but not "why."</p>
                      <div style="margin-bottom:12px">
                        <div style="font-size:12px;font-weight:700;margin-bottom:6px">Tomorrow's 3 Questions:</div>
                        <div style="font-size:13px;color:var(--text-muted);padding:4px 0">1. "Can you explain <em>why</em> 17 is prime but 15 is not?"</div>
                        <div style="font-size:13px;color:var(--text-muted);padding:4px 0">2. "What pattern do you see in 2, 3, 5, 7, 11?"</div>
                        <div style="font-size:13px;color:var(--text-muted);padding:4px 0">3. "How would you check if 91 is prime?"</div>
                      </div>
                      <div style="display:flex;gap:10px">
                        <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Accept & Print</button>
                        <button class="qa-btn">✏️ Edit Questions</button>
                      </div>
                    </div>`
                });
            }

            if (task_type === 'syllabus_velocity') {
                return res.json({
                    status: "success", tier_used: 2, is_agent_action: true,
                    insight: `
                    <div style="padding:16px;background:var(--bg-card);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-sm);margin-top:10px">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div style="font-size:13px;font-weight:700;color:var(--red)">⚠️ Pedagogical Over-Speeding Detected</div>
                        <span class="status-badge status-overdue">Critical</span>
                      </div>
                      <p style="margin:0 0 10px;font-size:13px;color:var(--text-muted)"><strong>Form 4A Mathematics:</strong> 7/10 topics marked as "Completed" but class average mastery is only 64%. 3 students below 40%.</p>
                      <p style="margin:0 0 14px;font-size:13px;color:var(--text-muted)"><strong>Drafted Action:</strong> Schedule "Remediation Week" — pause new topics, focus on Prime Factorization and Algebra review exercises.</p>
                      <div style="display:flex;gap:10px">
                        <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Approve Remediation</button>
                        <button class="qa-btn" style="border-color:var(--red);color:var(--red)">✗ Deny</button>
                        <button class="qa-btn">✏️ Modify Plan</button>
                      </div>
                    </div>`
                });
            }

            // Default teacher insight
            aiResponse = await callOllama('qwen3', `You are the Pedagogy Agent. Analyze this teacher's class data: ${JSON.stringify(payload)}. Draft one approval-required action.`);
            if (!aiResponse) {
                aiResponse = `
                <div style="padding:14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);margin-top:10px">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <div style="font-size:12px;color:var(--text-dim);font-weight:700">🧠 Bridge Briefing Ready: Amara Mbeki</div>
                    <span class="status-badge status-partial">Pending Review</span>
                  </div>
                  <p style="margin:0 0 14px;font-size:13px;line-height:1.5"><strong>Drafted (Qwen3):</strong> 3 targeted questions for tomorrow's session based on Cognitive Lab results. Pattern Recognition is 72% — needs "why" reasoning, not "what" drills.</p>
                  <div style="display:flex;gap:10px">
                    <button class="qa-btn" style="border-color:var(--green);color:var(--green)">✓ Approve & Print</button>
                    <button class="qa-btn" style="border-color:var(--red);color:var(--red)">✗ Deny</button>
                    <button class="qa-btn">✏️ Edit</button>
                  </div>
                </div>`;
            }
        }

        // ==============================
        // AGENT 3: Chief of Staff (Gemini 3.0 Cloud)
        // Handles: Admin strategy, Rule Engine, School Health
        // ==============================
        else if (role === 'admin') {
            tierUsed = 3;

            if (task_type === 'school_health') {
                return res.json({
                    status: "success", tier_used: 3,
                    insight: `<strong>School Health: 78.9/100 (Medium Risk)</strong><br/>Academic: 74.5% | Financial: 68% | Attendance: 91.2% | Teacher Effectiveness: 82%<br/><br/><em>Recommendation:</em> Fee collection is 12% below target. Form 3B Equations mastery critical (30%). Trigger: "Star at Risk" rule activated for 2 students.`
                });
            }

            if (task_type === 'rule_execution') {
                return res.json({
                    status: "success", tier_used: 3,
                    insight: `<strong>Rule Engine Report:</strong><br/>• "Brilliant but Absent" — 0 matches this week ✅<br/>• "Pedagogical Over-Speeding" — 1 match: Form 4A Maths (7/10 done, 64% mastery) ⚠️<br/>• "Star at Risk" — 2 matches: Amara Mbeki, Jean-Pierre M. 🔴<br/>• "Shadow Prevention" — 2 blocked attempts (Mr. Tabi, Sat/Sun) 🛡️`
                });
            }

            if (task_type === 'dropout_heatmap') {
                return res.json({
                    status: "success", tier_used: 3,
                    insight: `<strong>Dropout Risk Analysis:</strong><br/>Form 1: LOW (92%) | Form 2: LOW (88%) | Form 3: MEDIUM (65%) | <span style="color:var(--red);font-weight:800">Form 4: HIGH (41%)</span> | Form 5: MEDIUM (74%)<br/><br/><em>Action:</em> Form 4 risk driven by 3 students with fee debt >45 days AND mastery <50%. Merit Waiver drafted for 2.`
                });
            }

            // Default admin insight
            aiResponse = `<strong>Policy Drafted:</strong> Detected correlation between Form 4A attendance drop (-8%) and unpaid fees (3 students, 45+ days). Drafted "Academic Merit Waiver" for Amara Mbeki and "Parent Interview Request" for Jean-Pierre M. Awaiting your signature.`;
        }

        else {
            return res.status(400).json({ error: "Unknown role." });
        }

        return res.json({
            status: "success",
            tier_used: tierUsed,
            is_agent_action: isAgentAction,
            insight: aiResponse
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Agent controller failed." });
    }
});

// ============================================================
// ABUSE LOGGING ENDPOINT
// ============================================================
app.post('/api/intelligence/log-abuse', (req, res) => {
    const { type, timestamp, user_id } = req.body;
    console.warn(`[SHADOW PREVENTION] Type: ${type} | Time: ${timestamp} | User: ${user_id || 'unknown'}`);
    // In production: INSERT INTO abuse_logs
    res.json({ status: "logged", type });
});

// ============================================================
// SESSION LOGGING ENDPOINT
// ============================================================
app.post('/api/intelligence/log-session', (req, res) => {
    const { teacher, class: className, timestamp } = req.body;
    console.log(`[SESSION LOG] Teacher: ${teacher} | Class: ${className} | Time: ${timestamp}`);
    // In production: INSERT INTO live_sessions
    res.json({ status: "logged" });
});

// ============================================================
// RULE ENGINE EVALUATION ENDPOINT
// ============================================================
app.post('/api/intelligence/evaluate-rules', async (req, res) => {
    const { school_id } = req.body;
    console.log(`[RULE ENGINE] Evaluating rules for school: ${school_id}`);

    // In production: SELECT * FROM school_rules WHERE school_id = $1 AND is_active = true
    // Then evaluate each rule against live data
    // For demo: return hardcoded results
    const results = [
        { rule: "Brilliant but Absent", matches: 0, severity: "info" },
        { rule: "Pedagogical Over-Speeding", matches: 1, severity: "critical", details: "Form 4A Maths" },
        { rule: "Star at Risk", matches: 2, severity: "warning", details: "Amara Mbeki, Jean-Pierre M." },
        { rule: "Shadow Prevention", matches: 2, severity: "critical", details: "Mr. Tabi (Sat 15:00, Sun 10:00)" }
    ];

    res.json({ status: "evaluated", rules_checked: 4, results });
});

// ============================================================
// MERIT PROPOSAL GENERATOR
// ============================================================
app.post('/api/intelligence/generate-merit-proposal', async (req, res) => {
    const { student_id } = req.body;
    console.log(`[MERIT BRIDGE] Generating proposal for student: ${student_id}`);

    // In production: query mastery_scores + fees_ledger, generate case
    const proposal = {
        student: "Amara Mbeki",
        class: "Form 4A",
        avg_mastery: "91%",
        fee_balance: "25,000 FCFA",
        recommendation: "10% Star Student Discount",
        evidence: "Top 5% in Mathematics. 7/10 topics mastered. Cognitive Lab Logic: 72% (rising). Reading: 92 WPM.",
        proposed_action: "Approve partial waiver of 15,000 FCFA and assign Payment Plan for remaining 10,000 FCFA."
    };

    res.json({ status: "generated", proposal });
});

// ============================================================
// BRIDGE BRIEFING GENERATOR
// ============================================================
app.post('/api/intelligence/generate-briefing', async (req, res) => {
    const { student_id, subject_id } = req.body;
    console.log(`[BRIDGE BRIEFING] Generating for student: ${student_id}`);

    // In production: query cognitive_lab_results + mastery_scores, use Qwen3
    const briefing = {
        student: "Amara Mbeki",
        bottleneck: "Pattern Recognition (72%)",
        strength: "Calculation Speed (91%)",
        questions: [
            "Can you explain why 17 is prime but 15 is not?",
            "What pattern do you see in 2, 3, 5, 7, 11?",
            "How would you check if 91 is prime?"
        ],
        teaching_note: "Focus on 'why' questions. She solves 'what' easily but struggles with reasoning. Use visual patterns."
    };

    res.json({ status: "generated", briefing });
});

// ============================================================
// SCHOOL HEALTH SNAPSHOT
// ============================================================
app.get('/api/intelligence/school-health/:schoolId', (req, res) => {
    // In production: compute from live data
    res.json({
        academic_score: 74.5,
        financial_score: 68.0,
        attendance_score: 91.2,
        teacher_effectiveness: 82.0,
        overall_health: 78.9,
        risk_level: "medium",
        ai_summary: "Academic performance strong in Form 4A but Form 3B lagging. Fee collection 12% below target. Recommend targeted parent outreach for Form 3B defaulters."
    });
});

app.listen(3000, () => {
    console.log('🧠 DREEM Autonomous Multi-Agent Controller listening on port 3000');
    console.log('   Agent 1: Operations (Gemma 4) — Student/Bursar/Parent');
    console.log('   Agent 2: Pedagogy (Qwen3) — Teacher/Cognitive Lab');
    console.log('   Agent 3: Chief of Staff (Gemini 3.0) — Admin/Strategy');
});
