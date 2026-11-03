/** Prevent unsupported Cameroon checkout attempts from reserving a booking.
 * Credentials alone or a generic provider response do NOT establish real collection.
 */
export type ProviderAvailability = {
  configured: boolean;
  environment: string;
  cameroonAvailable: boolean;
};
export type CollectionReadiness = {
  collection_ready: boolean;
  reasons: string[];
};
export function evaluateCameroonCollectionReadiness(input: {
  provider: string;
  credentialsConfigured: boolean;
  environment: string;
  signedWebhookConfigured: boolean;
  unsignedCallbacksAllowed: boolean;
  availability: ProviderAvailability | null;
}): CollectionReadiness {
  const reasons: string[] = [];
  if(input.provider!=='pawapay')reasons.push('Provider is not PawaPay.');
  if(!input.credentialsConfigured)reasons.push('PawaPay credentials are missing.');
  if(input.environment!=='production')reasons.push('PawaPay is not in production mode.');
  if(!input.signedWebhookConfigured||input.unsignedCallbacksAllowed)
    reasons.push('A protected callback signature is required.');
  if(input.availability?.configured!==true||input.availability?.cameroonAvailable!==true)
    reasons.push('The provider has not confirmed Cameroon collection availability.');
  return {collection_ready:reasons.length===0,reasons};
}
