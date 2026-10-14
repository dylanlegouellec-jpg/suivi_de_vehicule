import { addMonths } from './dates'

/** Contrôle technique (véhicule particulier) : 1re échéance 4 ans après la mise en circulation, puis tous les 2 ans. */
export const CT_FIRST_MONTHS = 48
export const CT_NEXT_MONTHS = 24

export function nextTechnicalInspection(
  firstRegistration: string | null,
  lastInspection: string | null,
): string | null {
  if (lastInspection) return addMonths(lastInspection, CT_NEXT_MONTHS)
  if (firstRegistration) return addMonths(firstRegistration, CT_FIRST_MONTHS)
  return null
}
