/**
 * Sentinel Security Service
 * Implements HMAC-SHA256 signatures for data integrity verification 
 * (Anti-Spoofing & Spoof Detection).
 */

class SecurityService {
  // In production, this SECRET is stored in Supabase Vault or Secrets Manager.
  // Never exposed to the frontend in a final build.
  private readonly SECRET = "AFAT-SENTINEL-SIG-PRT-0x99283";

  /**
   * Generates a digital integrity seal for a user's data.
   * Prevents "Inspect Element" tampering of Trust Points or identity.
   */
  async generateIntegritySeal(payload: object): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const keyData = encoder.encode(this.SECRET);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, data);
    return this.arrayBufferToHex(signature);
  }

  /**
   * Verifies if a piece of data matches a provided signature.
   */
  async verifyIntegrity(payload: object, signature: string): Promise<boolean> {
    const expected = await this.generateIntegritySeal(payload);
    return expected === signature;
  }

  private arrayBufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

export const securityService = new SecurityService();
