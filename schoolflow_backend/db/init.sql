-- ============================================================
-- DREEM PERFORMANCE OS — PRODUCTION DATABASE SCHEMA
-- "The Infrastructure of Schools Themselves"
-- ============================================================

-- ===== CORE IDENTITY =====

CREATE TABLE IF NOT EXISTS schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    region VARCHAR(100),
    subsystem VARCHAR(20) DEFAULT 'bilingual', -- anglophone, francophone, bilingual
    academic_year VARCHAR(20) DEFAULT '2025-2026',
    term_current INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id),
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin','teacher','bursar','student','parent')),
    email VARCHAR(255),
    phone VARCHAR(20),
    lang_pref VARCHAR(2) DEFAULT 'EN',
    avatar_initials VARCHAR(3),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ACADEMIC STRUCTURE =====

CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id),
    name VARCHAR(50) NOT NULL,          -- 'Form 4A'
    level VARCHAR(20),                   -- 'Form 4'
    stream VARCHAR(20),                  -- 'Science', 'Arts', 'General'
    academic_year VARCHAR(20),
    class_teacher_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id),
    name VARCHAR(100) NOT NULL,          -- 'Mathematics'
    code VARCHAR(10),                    -- 'MATH'
    language VARCHAR(2) DEFAULT 'EN',
    syllabus_source VARCHAR(50) DEFAULT 'MINESEC'
);

CREATE TABLE IF NOT EXISTS class_subjects (
    id SERIAL PRIMARY KEY,
    class_id INTEGER REFERENCES classes(id),
    subject_id INTEGER REFERENCES subjects(id),
    teacher_id INTEGER REFERENCES users(id),
    periods_per_week INTEGER DEFAULT 3
);

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    class_id INTEGER REFERENCES classes(id),
    matricule VARCHAR(30) UNIQUE,
    parent_id INTEGER REFERENCES users(id),
    enrollment_date DATE DEFAULT CURRENT_DATE,
    is_boarder BOOLEAN DEFAULT FALSE
);

-- ===== SYLLABUS & CURRICULUM =====

CREATE TABLE IF NOT EXISTS syllabus_topics (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER REFERENCES subjects(id),
    topic_name VARCHAR(255) NOT NULL,
    topic_order INTEGER,
    term INTEGER,
    estimated_hours DECIMAL DEFAULT 2.0,
    difficulty VARCHAR(20) DEFAULT 'medium',
    content_url TEXT,                     -- link to lesson material
    content_type VARCHAR(20)             -- 'video','pdf','interactive'
);

CREATE TABLE IF NOT EXISTS syllabus_progress (
    id SERIAL PRIMARY KEY,
    class_subject_id INTEGER REFERENCES class_subjects(id),
    topic_id INTEGER REFERENCES syllabus_topics(id),
    status VARCHAR(20) DEFAULT 'not_started', -- not_started, in_progress, completed
    date_started DATE,
    date_completed DATE,
    teacher_notes TEXT
);

-- ===== STUDENT MASTERY & LEARNING =====

CREATE TABLE IF NOT EXISTS mastery_scores (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    topic_id INTEGER REFERENCES syllabus_topics(id),
    score_percentage INTEGER DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    time_spent_minutes INTEGER DEFAULT 0,
    mastery_level VARCHAR(20) DEFAULT 'not_started', -- not_started, emerging, developing, mastered
    last_attempt_at TIMESTAMP,
    ai_analyzed BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS assessment_results (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    subject_id INTEGER REFERENCES subjects(id),
    assessment_type VARCHAR(30) NOT NULL, -- 'quiz','test','exam','sequence','cognitive_lab'
    title VARCHAR(255),
    score_obtained DECIMAL,
    score_total DECIMAL,
    percentage DECIMAL GENERATED ALWAYS AS (CASE WHEN score_total > 0 THEN (score_obtained / score_total) * 100 ELSE 0 END) STORED,
    graded_by INTEGER REFERENCES users(id),
    graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ai_feedback TEXT
);

CREATE TABLE IF NOT EXISTS cognitive_lab_results (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    module_name VARCHAR(50) NOT NULL,    -- 'insight_reader','mental_math','clarity_hub','pattern_mastery'
    skill_area VARCHAR(30),              -- 'reading','math','writing','logic'
    speed_score INTEGER,                 -- WPM for reading, calculations/min for math
    accuracy_percentage INTEGER,
    cognitive_level INTEGER DEFAULT 1,   -- 1-10 difficulty level
    session_duration_sec INTEGER,
    bottleneck_detected VARCHAR(100),    -- 'inference','vocabulary','calculation_speed','pattern_recognition'
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== INSTITUTIONAL MEMORY (THE KILLER FEATURE) =====

CREATE TABLE IF NOT EXISTS student_dna (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    academic_year VARCHAR(20),
    learning_style VARCHAR(50),          -- 'visual','auditory','kinesthetic','reading'
    strongest_subjects TEXT,             -- JSON array
    weakest_subjects TEXT,               -- JSON array
    effective_strategies TEXT,           -- JSON: what teaching methods worked
    risk_factors TEXT,                   -- JSON: attendance issues, fee problems, etc
    teacher_notes TEXT,                  -- Free-form notes from teachers
    ai_summary TEXT,                     -- AI-generated year-end brief
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bridge_briefings (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    generated_for INTEGER REFERENCES users(id), -- teacher/tutor who receives it
    subject_id INTEGER REFERENCES subjects(id),
    bottleneck_type VARCHAR(50),
    question_1 TEXT,
    question_2 TEXT,
    question_3 TEXT,
    context_note TEXT,                   -- "Amara struggles with inference in FR texts"
    status VARCHAR(20) DEFAULT 'pending', -- pending, reviewed, applied
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== FINANCIAL SYSTEM =====

CREATE TABLE IF NOT EXISTS fee_structures (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id),
    academic_year VARCHAR(20),
    class_level VARCHAR(20),
    fee_type VARCHAR(50),                -- 'tuition','registration','exam','uniform'
    amount DECIMAL NOT NULL,
    is_mandatory BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS fees_ledger (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    fee_structure_id INTEGER REFERENCES fee_structures(id),
    total_due DECIMAL DEFAULT 0.00,
    amount_paid DECIMAL DEFAULT 0.00,
    balance DECIMAL GENERATED ALWAYS AS (total_due - amount_paid) STORED,
    last_payment_date TIMESTAMP,
    days_overdue INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'unpaid', -- unpaid, partial, paid, waived
    payment_plan_active BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    ledger_id INTEGER REFERENCES fees_ledger(id),
    amount DECIMAL NOT NULL,
    method VARCHAR(20) NOT NULL,         -- 'cash','momo_mtn','momo_orange','bank_transfer'
    reference_code VARCHAR(100),
    received_by INTEGER REFERENCES users(id), -- bursar who recorded it
    receipt_number VARCHAR(50),
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reconciled BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS merit_proposals (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    proposed_by VARCHAR(20),             -- 'system','bursar','teacher'
    proposal_type VARCHAR(30),           -- 'scholarship','discount','waiver','payment_plan'
    mastery_evidence TEXT,               -- JSON: subject scores backing the case
    financial_gap DECIMAL,
    recommendation TEXT,
    admin_decision VARCHAR(20) DEFAULT 'pending', -- pending, approved, denied
    decided_by INTEGER REFERENCES users(id),
    decided_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ATTENDANCE =====

CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    class_id INTEGER REFERENCES classes(id),
    date DATE NOT NULL,
    status VARCHAR(10) DEFAULT 'present', -- present, absent, late, excused
    marked_by INTEGER REFERENCES users(id),
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== THE RULE ENGINE (ADMIN'S BRAIN) =====

CREATE TABLE IF NOT EXISTS school_rules (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id),
    rule_name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_condition TEXT NOT NULL,      -- JSON: {field, operator, value}
    trigger_source VARCHAR(30),          -- 'attendance','mastery','fees','teacher_activity'
    action_type VARCHAR(30) NOT NULL,    -- 'alert','restrict_access','notify_parent','flag_admin','auto_remediation'
    action_target TEXT,                  -- JSON: who gets notified/affected
    severity VARCHAR(10) DEFAULT 'info', -- info, warning, critical
    is_active BOOLEAN DEFAULT TRUE,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rule_executions (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER REFERENCES school_rules(id),
    triggered_by_entity VARCHAR(30),     -- 'student','teacher','class'
    entity_id INTEGER,
    execution_result TEXT,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== COMMUNICATION =====

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    from_user_id INTEGER REFERENCES users(id),
    to_user_id INTEGER REFERENCES users(id),
    subject VARCHAR(255),
    body TEXT,
    message_type VARCHAR(20) DEFAULT 'general', -- general, pride_prompt, alert, briefing
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pride_prompts (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id),
    parent_id INTEGER REFERENCES users(id),
    trigger_event VARCHAR(100),          -- 'mastered_prime_numbers'
    prompt_text TEXT NOT NULL,           -- "Ask Amara about the pattern she found today!"
    context_data TEXT,                   -- JSON: scores, topic, improvement delta
    delivered_via VARCHAR(20) DEFAULT 'app', -- app, sms, whatsapp
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== AGENT & AUDIT =====

CREATE TABLE IF NOT EXISTS agent_actions_log (
    id SERIAL PRIMARY KEY,
    agent_tier INTEGER NOT NULL,         -- 1=Gemma(Ops), 2=Qwen(Pedagogy), 3=Gemini(Strategy)
    action_type VARCHAR(100) NOT NULL,
    target_role VARCHAR(20),
    target_entity_id INTEGER,
    action_details TEXT,
    human_approved BOOLEAN DEFAULT FALSE,
    approved_by INTEGER REFERENCES users(id),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS abuse_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    abuse_type VARCHAR(50) NOT NULL,     -- 'off_hours_class','unauthorized_access','data_tampering'
    details TEXT,
    ip_address VARCHAR(50),
    severity VARCHAR(10) DEFAULT 'warning',
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_trail (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,        -- 'updated_grade','deleted_payment','changed_rule'
    entity_type VARCHAR(50),
    entity_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(50),
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== LIVE CLASS SESSIONS =====

CREATE TABLE IF NOT EXISTS live_sessions (
    id SERIAL PRIMARY KEY,
    class_subject_id INTEGER REFERENCES class_subjects(id),
    teacher_id INTEGER REFERENCES users(id),
    session_type VARCHAR(20) DEFAULT 'scheduled', -- scheduled, remediation, revision
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    is_approved BOOLEAN DEFAULT TRUE,    -- admin pre-approval for scheduled classes
    recording_url TEXT,
    student_count INTEGER DEFAULT 0
);

-- ===== SCHOOL HEALTH METRICS (ADMIN VIEW) =====

CREATE TABLE IF NOT EXISTS school_health_snapshots (
    id SERIAL PRIMARY KEY,
    school_id INTEGER REFERENCES schools(id),
    snapshot_date DATE DEFAULT CURRENT_DATE,
    academic_score DECIMAL,              -- weighted avg mastery across all classes
    financial_score DECIMAL,             -- % fees collected
    attendance_score DECIMAL,            -- % avg attendance
    teacher_effectiveness DECIMAL,       -- student improvement under teachers
    overall_health DECIMAL,              -- composite score
    risk_level VARCHAR(10) DEFAULT 'low', -- low, medium, high, critical
    ai_summary TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED DATA (DEMO SCHOOL)
-- ============================================================

INSERT INTO schools (name, code, region, subsystem) VALUES
('Lycée Bilingue de Yaoundé', 'LBY-001', 'Centre', 'bilingual');

INSERT INTO users (school_id, full_name, role, phone, lang_pref, avatar_initials) VALUES
(1, 'Principal Abah', 'admin', '+237670000001', 'EN', 'PA'),
(1, 'Mr. Foncha', 'bursar', '+237670000002', 'EN', 'MF'),
(1, 'Mme Ngozi', 'teacher', '+237670000003', 'EN', 'MN'),
(1, 'Amara Mbeki', 'student', NULL, 'EN', 'AM'),
(1, 'Jean-Pierre Manga', 'student', NULL, 'FR', 'JP'),
(1, 'Grace Akono', 'student', NULL, 'EN', 'GA'),
(1, 'M. Mbeki', 'parent', '+237670000004', 'EN', 'MM'),
(1, 'M. Manga', 'parent', '+237670000005', 'FR', 'MG');

INSERT INTO classes (school_id, name, level, stream, academic_year, class_teacher_id) VALUES
(1, 'Form 4A', 'Form 4', 'Science', '2025-2026', 3),
(1, 'Form 3B', 'Form 3', 'General', '2025-2026', 3);

INSERT INTO subjects (school_id, name, code, language) VALUES
(1, 'Mathematics', 'MATH', 'EN'),
(1, 'Mathématiques', 'MATHS', 'FR'),
(1, 'English Language', 'ENG', 'EN'),
(1, 'Physics', 'PHY', 'EN');

INSERT INTO class_subjects (class_id, subject_id, teacher_id, periods_per_week) VALUES
(1, 1, 3, 5),
(2, 2, 3, 5);

INSERT INTO students (user_id, class_id, matricule, parent_id) VALUES
(4, 1, 'LBY-2025-0001', 7),
(5, 2, 'LBY-2025-0002', 8),
(6, 1, 'LBY-2025-0003', NULL);

INSERT INTO syllabus_topics (subject_id, topic_name, topic_order, term, estimated_hours, difficulty) VALUES
(1, 'Integers & Number Lines', 1, 1, 2.0, 'easy'),
(1, 'Fractions & Operations', 2, 1, 3.0, 'medium'),
(1, 'Decimals & Conversions', 3, 1, 2.0, 'easy'),
(1, 'Percentages', 4, 1, 2.0, 'medium'),
(1, 'Ratio & Proportion', 5, 1, 3.0, 'medium'),
(1, 'Algebra Basics', 6, 1, 4.0, 'medium'),
(1, 'Linear Equations', 7, 2, 4.0, 'hard'),
(1, 'Prime Numbers & Factorization', 8, 2, 3.0, 'hard'),
(1, 'Geometry I', 9, 2, 5.0, 'hard'),
(1, 'Statistics & Probability', 10, 3, 4.0, 'hard');

INSERT INTO mastery_scores (student_id, topic_id, score_percentage, attempts, mastery_level) VALUES
(1, 1, 100, 2, 'mastered'), (1, 2, 100, 3, 'mastered'), (1, 3, 100, 1, 'mastered'),
(1, 4, 100, 2, 'mastered'), (1, 5, 100, 2, 'mastered'), (1, 6, 100, 3, 'mastered'),
(1, 7, 100, 4, 'mastered'), (1, 8, 35, 2, 'emerging'),
(2, 1, 60, 3, 'developing'), (2, 2, 30, 4, 'emerging');

INSERT INTO fee_structures (school_id, academic_year, class_level, fee_type, amount) VALUES
(1, '2025-2026', 'Form 4', 'tuition', 120000),
(1, '2025-2026', 'Form 4', 'exam', 15000),
(1, '2025-2026', 'Form 4', 'registration', 15000),
(1, '2025-2026', 'Form 3', 'tuition', 100000);

INSERT INTO fees_ledger (student_id, fee_structure_id, total_due, amount_paid, days_overdue, status) VALUES
(1, 1, 150000, 125000, 0, 'partial'),
(2, 4, 100000, 25000, 45, 'partial'),
(3, 1, 150000, 150000, 0, 'paid');

-- Demo Rule: "Brilliant but Absent" detection
INSERT INTO school_rules (school_id, rule_name, description, trigger_condition, trigger_source, action_type, action_target, severity) VALUES
(1, 'Brilliant but Absent',
 'Flag students with high mastery but low attendance for parent interview',
 '{"field":"attendance_rate","operator":"<","value":70,"AND":{"field":"avg_mastery","operator":">","value":80}}',
 'attendance', 'flag_admin', '{"notify":["admin","parent"]}', 'warning'),
(1, 'Pedagogical Over-Speeding',
 'Alert when syllabus coverage is fast but class mastery is below 70%',
 '{"field":"topics_completed_rate","operator":">","value":80,"AND":{"field":"class_avg_mastery","operator":"<","value":70}}',
 'mastery', 'alert', '{"notify":["admin","teacher"]}', 'critical'),
(1, 'Star at Risk',
 'Flag top-performing students who have unpaid fees for merit scholarship consideration',
 '{"field":"avg_mastery","operator":">","value":85,"AND":{"field":"fee_balance","operator":">","value":50000}}',
 'fees', 'flag_admin', '{"notify":["admin","bursar"],"action":"generate_merit_proposal"}', 'warning'),
(1, 'Shadow Education Prevention',
 'Block and log any attempt to start live classes outside approved school hours',
 '{"field":"session_time","operator":"outside","value":"07:00-17:00 Mon-Fri"}',
 'live_sessions', 'restrict_access', '{"log":"abuse_logs","notify":["admin"]}', 'critical');

-- Demo Cognitive Lab data
INSERT INTO cognitive_lab_results (student_id, module_name, skill_area, speed_score, accuracy_percentage, cognitive_level, session_duration_sec, bottleneck_detected) VALUES
(1, 'insight_reader', 'reading', 92, 88, 4, 300, NULL),
(1, 'mental_math', 'math', 45, 91, 5, 180, NULL),
(1, 'pattern_mastery', 'logic', 38, 72, 3, 240, 'pattern_recognition'),
(2, 'insight_reader', 'reading', 55, 60, 2, 360, 'inference');

-- Demo Bridge Briefing
INSERT INTO bridge_briefings (student_id, generated_for, subject_id, bottleneck_type, question_1, question_2, question_3, context_note) VALUES
(1, 3, 1, 'pattern_recognition',
 'Can you explain why 17 is prime but 15 is not?',
 'What pattern do you see in the sequence 2, 3, 5, 7, 11?',
 'If I give you 91, how would you check if it is prime?',
 'Amara scores 91% in calculation speed but drops to 72% on pattern recognition. Focus on "why" questions, not "what" questions.');

-- Demo Pride Prompt
INSERT INTO pride_prompts (student_id, parent_id, trigger_event, prompt_text, context_data) VALUES
(1, 7, 'mastered_linear_equations',
 'Tonight, ask Amara: "I heard you cracked Linear Equations today — can you teach me how to solve one?" She will light up.',
 '{"topic":"Linear Equations","score":100,"attempts":4,"improvement":"+35% this week"}');

-- Demo School Health
INSERT INTO school_health_snapshots (school_id, academic_score, financial_score, attendance_score, teacher_effectiveness, overall_health, risk_level, ai_summary) VALUES
(1, 74.5, 68.0, 91.2, 82.0, 78.9, 'medium',
 'Academic performance is strong in Form 4A but Form 3B is lagging. Fee collection at 68% is below target. Recommend: targeted parent outreach for Form 3B defaulters and a Remediation Week for Equations Linéaires.');
