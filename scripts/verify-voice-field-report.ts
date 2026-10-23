import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const client=readFileSync('dashboard/src/components/shared/VoiceReporter.tsx','utf8');
const routes=readFileSync('src/api/routes.ts','utf8');
const voice=routes.slice(routes.indexOf("router.post('/intelligence/voice-report'"),routes.indexOf('// ── PAYMENT CHECKOUT'));
const report=client.slice(client.indexOf('const send=async()=>'),client.indexOf('return <div'));
for(const unsafe of ['Accident signalé près du carrefour Bastos','confidence: 0.85','Mock Mode','Processing with Groq Whisper...']){
 assert.equal(voice.includes(unsafe),false,'Server must not invent a voice transcription or classification');
}
assert.ok(voice.includes('requireAuthRole(req,res)'),'Voice API must authenticate');
assert.ok(voice.includes("res.status(501)"),'No mock model response');
assert.ok(client.includes('SpeechRecognition'),'Use real browser transcription when available');
assert.ok(client.includes('captureCurrentFieldGps()'),'Voice field reports require captured live device GNSS');
assert.ok(report.includes("turnstileToken"),'Protected incident submission requires challenge response');
assert.ok(report.includes("verification_hint:'pending'"),'Transcript is not independently verified');
assert.ok(report.includes("source:'app'"),'Use existing secured incident reporting and Turnstile enforcement');
assert.ok(!client.includes("latitude: 3.848")&&!client.includes("longitude: 11.502"),'No default city-centre position');
assert.ok(!client.includes("Threat Logged (Verified Intel)"),'Do not call unreviewed reports verified');
console.log('PASS AFAT voice-assisted incident → measured GPS → protected pending human review; no invented transcription');
