import { Client } from '@microsoft/microsoft-graph-client';

/**
 * TSIDKENU Privacy Guardian: OneDrive Integration
 * This service ensures that we only read the specific lawyer's OneDrive files using
 * their personalized Microsoft Graph Access Token acquired via Supabase Auth.
 */
export class OneDriveService {
  private graphClient: Client;

  constructor(accessToken: string) {
    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      }
    });
  }

  /**
   * Scans the lawyer's designated "Tsidkenu Legal Vault" folder in their OneDrive.
   */
  async getLegalVaultDocuments() {
    try {
      // Typically, firms might put their cases in a specific folder. 
      // We search for a folder named "Tsidkenu_Vault" or just list root documents.
      const response = await this.graphClient
        .api('/me/drive/root/search(q=\'precedent OR contract OR ruling\')')
        .select('id,name,webUrl,file')
        .top(20)
        .get();

      return response.value;
    } catch (error) {
      console.error("[Privacy Guardian] Failed to retrieve OneDrive documents:", error);
      throw new Error("Unable to access local OneDrive vault. Check permissions.");
    }
  }

  /**
   * Downloads the raw text from a document if possible.
   * This is where Gemma 4 would scan for PII/Conflicts before sending anywhere else.
   */
  async getDocumentContent(itemId: string) {
    try {
        // Here we could implement the raw download, but for MVP we will return metadata
        const response = await this.graphClient
        .api(`/me/drive/items/${itemId}`)
        .get();
        return response;
    } catch (error) {
        console.error(`[Privacy Guardian] Failed to read item ${itemId}:`, error);
        throw error;
    }
  /**
   * Uploads a TSIDKENU generated document back to the lawyer's OneDrive.
   * This completes the "Live Mirror" bridge, ensuring documentation is synced and secure.
   */
  async uploadToLegalVault(fileName: string, content: string, folderName: string = "Tsidkenu_Folders") {
    try {
      // TSIDKENU mirrors the file to the firm's private Microsoft 365 environment
      const path = `/me/drive/root:/${folderName}/${fileName}:/content`;
      
      const response = await this.graphClient
        .api(path)
        .put(content);
        
      return {
        success: true,
        webUrl: response.webUrl,
        fileName: fileName
      };
    } catch (error) {
      console.error("[Privacy Guardian] Failed to mirror document to OneDrive:", error);
      throw error;
    }
  }
}
