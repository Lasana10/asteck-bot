/**
 * TSIDKENU: OpenClaw Agent Gateway
 * The core engine that runs autonomously. It uses Gemini 3.0 Flash to "think" 
 * and LegalSkills to "do".
 */
import { LegalSkills } from './skills/legal_skills';

export class OpenClawGateway {
  
  /**
   * The "Heartbeat" function. 
   * Runs autonomously every X minutes to execute background tasks without a user prompt.
   */
  static async runAutonomousHeartbeat() {
    console.log("[OpenClaw Gateway] Autonomous Heartbeat initiated.");
    
    // Array to capture the agent's internal thought/action loop
    const activityLog = [];
    
    activityLog.push({ time: new Date().toLocaleTimeString(), action: "Waking up. Scanning Firm OneDrive..." });

    // 1. Agent independently executes the scan_onedrive skill (Hands)
    const scanResult = await LegalSkills.scan_onedrive({ id: "firm_global" });
    activityLog.push({ time: new Date().toLocaleTimeString(), action: `Scanned ${scanResult.scannedFiles} documents. Found ${scanResult.actionableItems.length} requiring audit.` });

    // 2. Agent processes actionable items found during the scan
    for (const doc of scanResult.actionableItems) {
      if (doc.status === "needs_compliance_audit") {
        activityLog.push({ time: new Date().toLocaleTimeString(), action: `Triggering LegalSkill: audit_compliance on [${doc.title}]` });
        
        // Execute the sub-skill
        const auditResult = await LegalSkills.audit_compliance(doc.title);
        
        if (auditResult.status === "flagged") {
          activityLog.push({ 
            time: new Date().toLocaleTimeString(), 
            action: `⚠️ COBAC Violation Detected in [${doc.title}]. Auto-drafting alert.`,
            critical: true
          });
        }
      }
    }

    return activityLog; // Fed to the FirmDashboard UI to show the firm what the OS is doing
  }
}
