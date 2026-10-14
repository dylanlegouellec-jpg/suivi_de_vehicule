/** Champs de synchronisation, posés automatiquement par les hooks Dexie (voir db.ts). */
export interface SyncFields {
  /** Identifiant global (UUID) : identique sur tous les appareils, contrairement à `id`. */
  uid?: string
  /** Date de dernière modification locale (ms) : sert à départager deux modifications (la plus récente gagne). */
  updatedAt?: number
  /** 1 = modification locale pas encore envoyée au serveur. */
  dirty?: 0 | 1
  /** Jeton aléatoire posé par la synchronisation sur ses propres écritures (elles ne doivent pas être renvoyées). */
  rw?: number
}

export type Fuel = 'essence' | 'diesel' | 'gpl' | 'hybride' | 'electrique' | 'autre'

export interface Vehicle extends SyncFields {
  id?: number
  name: string
  brand: string
  model: string
  year: number | null
  plate: string
  fuel: Fuel
  firstRegistration: string | null // ISO yyyy-mm-dd
  mileage: number | null
  photo: Blob | null
  /** Change à chaque nouvelle photo ; `photoSyncedVersion` = version déjà échangée avec le serveur. */
  photoVersion?: number | null
  photoSyncedVersion?: number | null
  createdAt: number
}

export type EntryType =
  | 'vidange' | 'pneus' | 'freins' | 'courroie' | 'controle_technique'
  | 'carrosserie' | 'assurance' | 'carburant' | 'reparation' | 'autre'

export interface DocumentRecord extends SyncFields {
  id?: number
  name: string
  mime: string
  /** null = document reçu d'un autre appareil, pas encore téléchargé. */
  blob: Blob | null
  /** Véhicule auquel appartient le document (pour la synchronisation et le partage). */
  vehicleId?: number
  /** true si le fichier est déjà sur le serveur (envoyé ou téléchargé). */
  blobSynced?: boolean
  createdAt: number
}

export interface Entry extends SyncFields {
  id?: number
  vehicleId: number
  type: EntryType
  date: string // ISO
  amount: number | null // TTC
  amountHT?: number | null
  vat?: number | null
  km: number | null
  garage: string
  notes: string
  documentId: number | null
  /** Document reçu avant son fichier de métadonnées : lien à établir à son arrivée. */
  pendingDocumentUid?: string | null
}

export interface FuelLog extends SyncFields {
  id?: number
  vehicleId: number
  date: string
  liters: number
  total: number
  km: number | null
  full: boolean
}

export interface ReminderRule extends SyncFields {
  id?: number
  vehicleId: number
  type: EntryType | 'personnalise'
  label: string
  everyMonths: number | null
  everyKm: number | null
  /** Dernière fois connue (utile sans historique, ou pour les rappels personnalisés). */
  baseDate?: string | null
  baseKm?: number | null
}

export type RuleType = EntryType | 'personnalise'

export interface SettingRecord {
  key: string
  value: unknown
}

export const FUEL_LABELS: Record<Fuel, string> = {
  essence: 'Essence', diesel: 'Diesel', gpl: 'GPL',
  hybride: 'Hybride', electrique: 'Électrique', autre: 'Autre',
}

/** Suppression locale à transmettre au serveur (les enregistrements supprimés n'existent plus pour le leur dire). */
export interface Tombstone {
  id?: number
  uid: string
  kind: 'vehicle' | 'entry' | 'fuel' | 'rule' | 'document'
  vehicleUid: string
  deletedAt: number
}
