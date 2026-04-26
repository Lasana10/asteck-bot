# 🚦 AsTeck Traffic Intelligence — MISSION

You are the lead architect building **"AsTeck Traffic Intelligence"** — the world's most advanced, award-winning, community-driven traffic safety and intelligence platform for Cameroon (Yaoundé and Douala priority, nationwide scale).

## Core Mission & Principles

- **Empower** citizens with hyper-local, real-time, verified traffic intelligence to save lives, reduce commute time, and improve road safety.
- **Fully community-driven**: users report and confirm incidents; the system learns and improves autonomously.
- **Strictly neutral and respectful**: especially for "contrôles routiers" (road checkpoints). NEVER imply evasion or disrespect for authorities. ALWAYS include disclaimer: _"Respect all authorities and traffic laws. Report only from a safe, stopped location. This is community-shared information for awareness only — drive responsibly."_
- **Bilingual**: All user-facing responses in French AND English (auto-detect or default both).
- **Low-data, inclusive**: Telegram-first (works on basic phones), voice/photo/location support, no app download required.
- **Award-winning quality**: Hyper-accurate predictions, fair "antigravity" routing, proactive alerts, SOS rapid response.

## Incident Types

1. 🚗 Accident / Accident de circulation
2. 🚦 Traffic jam / Embouteillage
3. 🌊 Flooding / Inondation
4. 🚧 Road works / Travaux routiers
5. 👮 Road checkpoint observed / Contrôle routier observé → **ALWAYS add disclaimer**
6. ⚠️ Hazard (fallen tree, debris) / Danger sur la route
7. ✊ Protest or blockage / Manifestation ou barrage
8. 🕳️ Road damage / Route endommagée
9. 🆘 Emergency / Urgence
10. ❓ Other / Autre (free text)

## Multi-Agent Workflow

| Agent | Role |
|-------|------|
| **Observer** | Monitor Telegram webhook/cron for new reports |
| **Parser** | Multimodal extraction (Gemini): type, location, severity, timestamp, photo/voice |
| **Verifier** | 2+ community confirmations + trust score 0–100 |
| **Predictor** | Forecasts using historical patterns (% confidence + citations) |
| **Router** | "Antigravity" balanced routes (fair alternatives to prevent cascades) |
| **Alerter** | Morning briefs, personalized alerts, broadcast to @AsteckTrafficLive |
| **SOS Handler** | High-severity → rapid broadcast + optional authority ping |
| **Meta/Learner** | Daily self-review, propose improvements, evolve skills |

## Tech Stack & Architecture

- **Context Reference**: See `CITYBRAIN_ARCHITECTURE.md` for the exact AI Matrix routing logic.
- **AI Matrix**: Groq Whisper, Groq Llama 3.3, Gemma 4, and **QWN 3.6 PLUS** (via OpenRouter) powering the CityBrain Dispatcher.
- **Telegram** (Telegraf): send/receive, inline buttons, voice/photo handling
- **Supabase**: PostgreSQL DB for incidents, users, trust scores, and webhooks
- **Routing & Maps**: OpenStreetMap Nominatim for Reverse Geocoding.
- **OpenStreetMap Nominatim**: reverse geocoding (free)
- **OpenWeatherMap** (free tier): weather enrichment for flood warnings
- **Future**: Web frontend (Leaflet live map), premium API for transport companies

## Safety & Ethics

- Follow privacy laws — anonymize all users
- Anti-spam: low-trust users limited
- Inclusivity: voice reports for all literacy levels
- Never lock safety behind payment

## MVP → Full Platform

1. **MVP**: Report menu → AI parse → verify → broadcast with disclaimer → store
2. **v2**: Predictions, routing, weather enrichment
3. **v3**: Web map, SOS authority integration, monetization hooks

---

_Make this the most impactful public safety AI system in Africa — award-winning, life-saving, community-trusted._ 🚀
