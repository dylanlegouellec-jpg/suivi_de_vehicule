import type { RuleType } from '../../db/schema'

export interface RuleDefault {
  type: RuleType
  label: string
  everyMonths: number | null
  everyKm: number | null
}

/** Intervalles proposés par défaut (modifiables par l'utilisateur). */
export const DEFAULT_RULES: RuleDefault[] = [
  { type: 'vidange', label: 'Vidange', everyMonths: 12, everyKm: 15000 },
  { type: 'controle_technique', label: 'Contrôle technique', everyMonths: 24, everyKm: null },
  { type: 'pneus', label: 'Pneus', everyMonths: null, everyKm: 40000 },
  { type: 'courroie', label: 'Courroie de distribution', everyMonths: 60, everyKm: 120000 },
  { type: 'assurance', label: 'Assurance', everyMonths: 12, everyKm: null },
]

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  vidange: 'Vidange',
  controle_technique: 'Contrôle technique',
  pneus: 'Pneus',
  courroie: 'Courroie',
  assurance: 'Assurance',
  freins: 'Freins',
  carrosserie: 'Carrosserie',
  carburant: 'Carburant',
  reparation: 'Réparation',
  autre: 'Autre',
  personnalise: 'Personnalisé',
}

export const RULE_TYPES: RuleType[] = ['vidange', 'controle_technique', 'pneus', 'courroie', 'assurance', 'freins', 'personnalise']
