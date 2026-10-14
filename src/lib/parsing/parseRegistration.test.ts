import { describe, expect, it } from 'vitest'
import { parseRegistration } from './parseRegistration'

const card1 = `RÉPUBLIQUE FRANÇAISE
CERTIFICAT D'IMMATRICULATION
A AB-123-CD
B 15 03 2019
I 22/04/2019
C.1 DUPONT JEAN
C.4.1
D.1 RENAULT
D.2 BCM1C1
D.2.1 MA12345
D.3 CLIO
E VF15R0F0A12345678
F.1 1500
P.3 ES`

describe('parseRegistration – carte grise', () => {
  it('lit tous les champs d’une carte lisible', () => {
    const r = parseRegistration(card1)
    expect(r.plate.value).toBe('AB-123-CD')
    expect(r.firstRegistration.value).toBe('2019-03-15')
    expect(r.year.value).toBe(2019)
    expect(r.brand.value).toBe('Renault')
    expect(r.model.value).toBe('Clio')
    expect(r.vin.value).toBe('VF15R0F0A12345678')
    expect(r.fuel.value).toBe('essence')
    expect(r.brand.confidence).toBeGreaterThan(0.9)
  })

  it('ignore les libellés imprimés (Marque, Dénomination commerciale)', () => {
    const r = parseRegistration('D.1 Marque PEUGEOT\nD.3 Dénomination commerciale 208\nP.3 GO')
    expect(r.brand.value).toBe('Peugeot')
    expect(r.model.value).toBe('208')
    expect(r.fuel.value).toBe('diesel')
  })

  it('valeur sur la ligne suivant le code', () => {
    const r = parseRegistration('D.1\nCITROËN\nD.3\nC3 AIRCROSS')
    expect(r.brand.value).toBe('Citroën')
    expect(r.model.value).toBe('C3 Aircross')
  })

  it('date avec séparateurs variés', () => {
    expect(parseRegistration('B 01/12/2010').firstRegistration.value).toBe('2010-12-01')
    expect(parseRegistration('B. 1.7.2021').firstRegistration.value).toBe('2021-07-01')
    expect(parseRegistration('B : 05-09-2015').firstRegistration.value).toBe('2015-09-05')
  })

  it('sortie OCR réelle : date collée, « P3 Es », O pris pour 0 dans le VIN', () => {
    const r = parseRegistration("A AB-123-CD\n\nB 15032019\n\nD.1 RENAULT\n\nD.3 CLIO\n\nE VF15ROF0A12345678\n\nP3 Es\n")
    expect(r.firstRegistration.value).toBe('2019-03-15')
    expect(r.year.value).toBe(2019)
    expect(r.vin.value).toBe('VF15R0F0A12345678')
    expect(r.fuel.value).toBe('essence')
  })

  it('date invalide refusée', () => {
    expect(parseRegistration('B 31 02 2019').firstRegistration.value).toBeNull()
  })

  it('sans champ B : prend la date la plus ancienne avec une confiance faible', () => {
    const r = parseRegistration('Date 22/04/2019 et 15/03/2018')
    expect(r.firstRegistration.value).toBe('2018-03-15')
    expect(r.firstRegistration.confidence).toBeLessThan(0.6)
  })

  it('VIN : espaces ignorés, I/O/Q corrigés en 1/0/0', () => {
    const r = parseRegistration('E VF1 RJA00 X12 345 678')
    expect(r.vin.value).toBe('VF1RJA00X12345678')
    expect(parseRegistration('E VF1OJAO0X1234567I').vin.value).toBe('VF10JA00X12345671')
  })

  it('VIN trop court : ignoré', () => {
    expect(parseRegistration('E VF15R0F0A123').vin.value).toBeNull()
  })

  it('carburants : codes P.3', () => {
    expect(parseRegistration('P.3 EL').fuel.value).toBe('electrique')
    expect(parseRegistration('P.3 EH').fuel.value).toBe('hybride')
    expect(parseRegistration('P.3 GP').fuel.value).toBe('gpl')
    const unknown = parseRegistration('P.3 XX')
    expect(unknown.fuel.value).toBe('autre')
    expect(unknown.fuel.confidence).toBeLessThan(0.6)
  })

  it('plaque ancien format (FNI)', () => {
    expect(parseRegistration('A 1234 AB 56').plate.value).toBe('1234 AB 56')
  })

  it('plaque : tirets ou espaces, minuscules', () => {
    expect(parseRegistration('A ab 123 cd').plate.value).toBe('AB-123-CD')
  })

  it('marque inconnue du dictionnaire : gardée mais moins sûre', () => {
    const r = parseRegistration('D.1 TALBOT')
    expect(r.brand.value).toBe('Talbot')
    expect(r.brand.confidence).toBeLessThan(0.8)
  })

  it('marque retrouvée dans le texte sans code D.1, avec faible confiance', () => {
    const r = parseRegistration('Véhicule RENAULT couleur grise')
    expect(r.brand.value).toBe('Renault')
    expect(r.brand.confidence).toBeLessThan(0.6)
  })

  it('sigles de marque conservés en majuscules', () => {
    expect(parseRegistration('D.1 BMW').brand.value).toBe('BMW')
    expect(parseRegistration('D.1 LAND ROVER').brand.value).toBe('Land Rover')
  })

  it('texte vide ou illisible : aucun champ', () => {
    for (const t of ['', '   ', '@@@ ### %%']) {
      const r = parseRegistration(t)
      expect(r.brand.value).toBeNull()
      expect(r.plate.value).toBeNull()
      expect(r.vin.value).toBeNull()
      expect(r.fuel.value).toBeNull()
    }
  })
})
