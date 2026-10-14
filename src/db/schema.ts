export type Fuel = 'essence' | 'diesel' | 'gpl' | 'hybride' | 'electrique' | 'autre'

export interface Vehicle {
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
  createdAt: number
}

export type EntryType =
  | 'vidange' | 'pneus' | 'freins' | 'courroie' | 'controle_technique'
  | 'carrosserie' | 'assurance' | 'carburant' | 'reparation' | 'autre'

export interface DocumentRecord {
  id?: number
  name: string
  mime: string
  blob: Blob
  createdAt: number
}

export interface Entry {
  id?: number
  vehicleId: number
  type: EntryType
  date: string // ISO
  amount: number | null // TTC
  km: number | null
  garage: string
  notes: string
  documentId: number | null
}

export interface FuelLog {
  id?: number
  vehicleId: number
  date: string
  liters: number
  total: number
  km: number | null
  full: boolean
}

export interface ReminderRule {
  id?: number
  vehicleId: number
  type: EntryType | 'personnalise'
  label: string
  everyMonths: number | null
  everyKm: number | null
}

export interface SettingRecord {
  key: string
  value: unknown
}

export const FUEL_LABELS: Record<Fuel, string> = {
  essence: 'Essence', diesel: 'Diesel', gpl: 'GPL',
  hybride: 'Hybride', electrique: 'Électrique', autre: 'Autre',
}
