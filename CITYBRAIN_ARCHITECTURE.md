# AsTeck CityBrain: Architecture & Orchestration

*This document serves as the persistent brain context for future AI agents working on the AsTeck Traffic Intelligence project. Please read this before modifying the intelligence core.*

## 1. The Optimus AI Dispatcher (CityBrain)
The CityBrain is the central live reaction layer, transforming raw data into an indispensable infrastructure ecosystem. 

**Key Responsibilities:**
- **Proactive Suggestions:** E.g., "Your usual trip to Akwa is jammed, driver is 3 mins away on Alternative Route B."
- **Demand Spike Handling:** Detects surges in localized reporting/bookings and alerts idle operators.
- **Fatigue Monitoring:** Tracks operator hours and nudges them to rest.
- **Hybrid Task Execution:** Combines `scheduler.ts` (for background polling like weather/fatigue) with instant Webhook responses for live reactions.

## 2. Hybrid AI Model Matrix (The Elite Stack)
We actively route tasks to the best-suited model to maximize capacity and minimize API costs, utilizing OpenRouter and Groq.

| Role | Model | Provider | Function |
| :--- | :--- | :--- | :--- |
| **Transcription** | Groq Whisper | Groq | Lightning-fast audio parsing (especially for Pidgin/French accents). |
| **Extraction** | Groq Llama 3.3 70B | Groq | Instant, structured data extraction (`ParsedIncident`) from raw textual data. |
| **Orchestration** | Gemma 4 (26B/31B), Gemini 3 Flash | OpenRouter / Google | Multi-step agentic workflows and tool-calling (The primary dispatcher reaction engine). |
| **Logic & Prediction** | **QWN 3.6 PLUS** | OpenRouter | The true elite logic engine. Handles high-volume, deep-reasoning tasks like predicting demand spikes, analyzing complex traffic maps, and orchestrating massive mathematical routing at scalable cost. |

*Note: The Model Factory (`src/models/factory.ts`) natively handles task routing using `getModelForTask('prediction' | 'orchestration' | 'extraction')`. OpenRouter slugs: `qwen/qwen3.6-plus:free` and `google/gemma-4-26b-a4b-it`.*

## 3. Data Integrity: The Cross-Check System
To prevent the map from becoming chaotic:
1. **Feeder Channels:** All inbound reports—whether from Telegram, WhatsApp, or IntelligenceBridge SMS—must strictly enter Supabase with `status: 'pending'` and `confirmations: 0`.
2. **Principal Dashboard:** MobilityOS (the frontend dashboard) is the "Principal Interface". It visually handles the rendering of pending/verified incidents, ensuring raw, unverified location pins don't pollute the active feed until they cross the community confirmation threshold or operator approval system.

## 4. Geographic Wiring
- The system heavily relies on `GeoService.reverseGeocode` to attach human-readable addresses to absolute Long/Lat coordinate drops.
- Both Telegram (`bot.on('location')`) and WhatsApp interactions must parse raw coordinates via `GeoService` before finalizing `incidentData` to ensure rich display in the dashboard.

## 5. Google Maps Traffic Cross-Check (Silent Verification)
The `VerifierAgent` (`src/core/verify.ts`) now uses a **hybrid verification** system:
- **3 community confirms** → Verified (original rule).
- **1 community confirm + Google Maps traffic data agrees** → Verified (new rule).

`DirectionsService.getTrafficCondition(location)` silently probes the Google Distance Matrix API. If `duration_in_traffic` exceeds 1.4x normal duration at that location, it confirms the report is real. Users never see this check.

Only traffic-checkable types (`accident`, `traffic_jam`, `road_works`, `protest`, `roadblock`, `flooding`) are eligible for this cross-check. Other types (e.g., `police_control`) still require community-only verification.

## 6. AFAT Guidance (Invisible AI Persona)
The frontend AI Copilot is branded as **"AFAT Guidance"** — never "AI", never model names. 
- Uses Signal Zero's "Street Wisdom" language (short, calm, local phrasing).
- Internally powered by the Hybrid AI Matrix (Groq, Gemini, Qwen, Gemma) but all technical details are hidden from the user.
- The `CityPulse.tsx` widget shows live city health status without any technical jargon.
