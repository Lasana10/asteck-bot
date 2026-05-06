/**
 * @ada/document-engine: Variable Mapper
 * Maps raw case facts into standardized template variables for TSIDKENU Heritage templates.
 */

export interface CaseFacts {
  clientName: string;
  clientType: string;
  clientAddress: string;
  lawyerName: string;
  adversaryName: string;
  adversaryAddress: string;
  contractDate: string;
  serviceType: string;
  totalAmount: string;
  noticeDate: string;
  damagesAmount: string;
}

export class DocumentMapper {
  /**
   * Cleans and formats raw intelligence data into a standardized facts object.
   */
  static mapToTemplate(rawData: any): CaseFacts {
    return {
      clientName: rawData.client_name || "N/A",
      clientType: rawData.client_type || "Particulier",
      clientAddress: rawData.client_address || "Douala, Cameroun",
      lawyerName: rawData.lawyer_name || "Maître TSIDKENU",
      adversaryName: rawData.adversary_name || "N/A",
      adversaryAddress: rawData.adversary_address || "Inconnu",
      contractDate: rawData.contract_date || "N/A",
      serviceType: rawData.service_type || "Prestations de services",
      totalAmount: rawData.total_amount || "0",
      noticeDate: rawData.notice_date || "N/A",
      damagesAmount: rawData.damages_amount || "500,000",
    };
  }

  /**
   * Injects the mapped facts into the raw template text.
   */
  static injectVariables(template: string, facts: CaseFacts): string {
    let output = template;
    const entries = Object.entries(facts);
    
    entries.forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      output = output.replace(new RegExp(placeholder, 'g'), value);
    });

    // Add metadata
    output = output.replace(/{{currentDate}}/g, new Date().toLocaleDateString('fr-FR'));
    
    return output;
  }
}
