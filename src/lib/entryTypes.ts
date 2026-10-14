import type { EntryType } from '../db/schema'

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  vidange: 'Vidange',
  pneus: 'Pneus',
  freins: 'Freins',
  courroie: 'Courroie',
  controle_technique: 'Contrôle technique',
  carrosserie: 'Carrosserie',
  assurance: 'Assurance',
  carburant: 'Carburant',
  reparation: 'Réparation',
  autre: 'Autre',
}

export type Category = 'carburant' | 'entretien' | 'reparations' | 'assurance' | 'controle_technique' | 'autre'

export const CATEGORY_LABELS: Record<Category, string> = {
  carburant: 'Carburant',
  entretien: 'Entretien',
  reparations: 'Réparations',
  assurance: 'Assurance',
  controle_technique: 'Contrôle technique',
  autre: 'Autre',
}

export function categoryOf(type: EntryType): Category {
  switch (type) {
    case 'carburant': return 'carburant'
    case 'vidange': case 'pneus': case 'freins': case 'courroie': return 'entretien'
    case 'reparation': case 'carrosserie': return 'reparations'
    case 'assurance': return 'assurance'
    case 'controle_technique': return 'controle_technique'
    default: return 'autre'
  }
}

export const ENTRY_TYPES = Object.keys(ENTRY_TYPE_LABELS) as EntryType[]
