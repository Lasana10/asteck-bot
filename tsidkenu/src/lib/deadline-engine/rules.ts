/**
 * @ada/deadline-engine: OHADA & CEMAC Procedural Rules
 * This defines the standard "délais" for various legal procedures.
 */

export interface DeadlineRule {
  id: string;
  name: string;
  days: number;
  type: 'CALENDAR' | 'WORKING' | 'FRANC'; // OHADA specific: "Franc" means you don't count the first or last day.
  triggerEvent: string;
  description: string;
}

export const OHADA_RULES: Record<string, DeadlineRule> = {
  ASSIGNATION_AU_FOND: {
    id: 'assignation_fond',
    name: 'Assignation au Fond (Civile)',
    days: 8,
    type: 'FRANC',
    triggerEvent: 'Date de Signification',
    description: 'Délai pour comparaître devant le Tribunal de Grande Instance.'
  },
  APPEL_CIVIL: {
    id: 'appel_civil',
    name: 'Appel en Matière Civile et Commerciale',
    days: 30,
    type: 'CALENDAR',
    triggerEvent: 'Signification de Jugement',
    description: 'Délai standard pour interjeter appel d\'un jugement contradictoire.'
  },
  OPPOSITION: {
    id: 'opposition',
    name: 'Opposition à Injonction de Payer',
    days: 15,
    type: 'CALENDAR',
    triggerEvent: 'Signification de l\'Ordonnance',
    description: 'Délai pour former opposition à une ordonnance d\'injonction de payer (AUPSRVE).'
  }
};
