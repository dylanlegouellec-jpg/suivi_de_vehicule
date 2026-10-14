import { describe, expect, it } from 'vitest'
import { amountsIn, LOW_CONFIDENCE, parseDate, parseInvoice, parseKm } from './parseInvoice'

const inv1 = `GARAGE DUPONT AUTOMOBILES
12 rue des Lilas 75012 Paris
Tel : 01 23 45 67 89
SIRET 123 456 789 00012 - TVA intracom FR12345678901

FACTURE N° 2025-0345
Date : 12/03/2025
Immatriculation : AB-123-CD
Kilométrage : 85 432 km

Vidange moteur 5W30 - huile moteur 5L      65,00
Filtre à huile                              12,50
Main d'oeuvre                               45,00
Total HT                                   122,50
TVA 20 %                                    24,50
Total TTC                                  147,00 €`

const inv2 = `Norauto
Centre auto de Lyon Vaise
Facture du 3 février 2024
Véhicule : GH-456-JK
Kms : 120 350
4 pneus Michelin 205/55 R16 montage équilibrage
Montant HT : 410,83
TVA (20%) : 82,17
Net à payer : 493,00 EUR`

const inv3 = `SPEEDY
FACTURE
Date de facture 28.11.2023
Plaquettes de frein avant
Disques de frein avant
Liquide de frein
Total H.T. 289,17
T.V.A. 20,00 % 57,83
TOTAL T.T.C. 347,00`

const inv4 = `AUTOSUR
Procès-verbal de contrôle technique
Date du contrôle : 15/09/2024
Immatriculation : FG-789-HJ
Prochaine échéance : 15/09/2026
Kilométrage au compteur : 142 000
Prix du contrôle technique : 79,90 € TTC
Total TTC 79,90`

const inv5 = `Carrosserie Martin SARL
Remplacement pare-chocs avant et peinture
Date d'émission : 5 août 2022
Total HT 1 250,00
TVA 250,00
Total TTC 1 500,00`

const inv6 = `Garage du Centre
Révision complète - vidange - filtre à air - filtre habitacle
Facture du 01/04/25
Kilométrage 64000 km
TOTAL A PAYER 235,40`

const inv7 = `PEUGEOT CONCESSION BERNARD
Remplacement kit de distribution + pompe à eau + courroie accessoires
Facture n° 99812 du 20 juin 2023
Immat. KL-321-MN  Km : 98 765
Montant HT          683,33
TVA 20%             136,67
Montant TTC         820,00`

const inv8 = `Euromaster
Facture 17-10-2021
2 pneus Continental 195/65 R15
Total ttc : 1 234,56 €`

const inv9 = `Auto Services 33
Facture le 9 janv. 2025
Remplacement batterie
Total TTC 189,90`

const inv10 = `Midas
Date : 30/12/2024
Géométrie parallélisme
Total HT 79,17
TVA 15,83
Total TTC 95,00
Date d'échéance : 30/01/2025`

const inv11 = `Dekra Contrôle
Contre-visite contrôle technique
Date : 02/07/2023
Immat : 4567 ABC 33
Tarif TTC 25,00`

const inv12 = `GARAGE LEROY
Vidange huile moteur
facture 14/02/2026
Total ttc 98,50`

const inv13 = `Feu Vert
Montage 4 pneus
Date: 22/05/2024
Kilométrage : 77.250
Total HT 320,00
TVA 64,00
Total TTC 384,00`

const inv14 = `Sarl Dupont Automobiles
Remplacement rétroviseur droit et portière
Date : 11/11/2024
Km au compteur : 51 200 km
Total TTC : 612,40`

const inv15 = `Centre Auto Express
Facture 27/08/2020
Remplacement disque et plaquettes
Date de première mise en circulation : 10/05/2015
Total HT 150,00
TVA 30,00
Total TTC 180,00`

const inv16 = `Garage Moderne
Facture du 8 mars 2025
Total HT 100,00
TVA 20 %
Total TTC 120,00`

describe('parseInvoice – factures réalistes', () => {
  it('1. vidange complète (tous champs, cohérence HT+TVA=TTC)', () => {
    const r = parseInvoice(inv1)
    expect(r.date.value).toBe('2025-03-12')
    expect(r.amountTTC.value).toBe(147)
    expect(r.amountHT.value).toBe(122.5)
    expect(r.vat.value).toBe(24.5)
    expect(r.km.value).toBe(85432)
    expect(r.plate.value).toBe('AB-123-CD')
    expect(r.garage.value).toBe('GARAGE DUPONT AUTOMOBILES')
    expect(r.type.value).toBe('vidange')
    expect(r.amountTTC.confidence).toBeGreaterThan(0.9)
  })

  it('2. pneus, date en toutes lettres, « Kms : », net à payer', () => {
    const r = parseInvoice(inv2)
    expect(r.date.value).toBe('2024-02-03')
    expect(r.km.value).toBe(120350)
    expect(r.plate.value).toBe('GH-456-JK')
    expect(r.amountHT.value).toBe(410.83)
    expect(r.vat.value).toBe(82.17)
    expect(r.amountTTC.value).toBe(493)
    expect(r.type.value).toBe('pneus')
    expect(r.garage.value).toBe('Norauto')
  })

  it('3. freins, date avec points, libellés H.T./T.V.A./T.T.C.', () => {
    const r = parseInvoice(inv3)
    expect(r.date.value).toBe('2023-11-28')
    expect(r.amountHT.value).toBe(289.17)
    expect(r.vat.value).toBe(57.83)
    expect(r.amountTTC.value).toBe(347)
    expect(r.type.value).toBe('freins')
    expect(r.garage.value).toBe('SPEEDY')
  })

  it('4. contrôle technique : ignore la date d’échéance', () => {
    const r = parseInvoice(inv4)
    expect(r.date.value).toBe('2024-09-15')
    expect(r.km.value).toBe(142000)
    expect(r.plate.value).toBe('FG-789-HJ')
    expect(r.amountTTC.value).toBe(79.9)
    expect(r.type.value).toBe('controle_technique')
  })

  it('5. carrosserie avec montant à séparateur de milliers', () => {
    const r = parseInvoice(inv5)
    expect(r.date.value).toBe('2022-08-05')
    expect(r.amountHT.value).toBe(1250)
    expect(r.vat.value).toBe(250)
    expect(r.amountTTC.value).toBe(1500)
    expect(r.type.value).toBe('carrosserie')
    expect(r.garage.value).toBe('Carrosserie Martin SARL')
  })

  it('6. année sur 2 chiffres, « TOTAL A PAYER », km sans espace', () => {
    const r = parseInvoice(inv6)
    expect(r.date.value).toBe('2025-04-01')
    expect(r.km.value).toBe(64000)
    expect(r.amountTTC.value).toBe(235.4)
    expect(r.type.value).toBe('vidange')
  })

  it('7. distribution : courroie malgré « pompe à eau » et concession', () => {
    const r = parseInvoice(inv7)
    expect(r.date.value).toBe('2023-06-20')
    expect(r.plate.value).toBe('KL-321-MN')
    expect(r.km.value).toBe(98765)
    expect(r.amountHT.value).toBe(683.33)
    expect(r.vat.value).toBe(136.67)
    expect(r.amountTTC.value).toBe(820)
    expect(r.type.value).toBe('courroie')
    expect(r.garage.value).toBe('PEUGEOT CONCESSION BERNARD')
  })

  it('8. montant 1 234,56 € et date avec tirets, sans HT/TVA', () => {
    const r = parseInvoice(inv8)
    expect(r.date.value).toBe('2021-10-17')
    expect(r.amountTTC.value).toBe(1234.56)
    expect(r.amountHT.value).toBeNull()
    expect(r.type.value).toBe('pneus')
  })

  it('9. mois abrégé « janv. » ; type inconnu → autre à faible confiance', () => {
    const r = parseInvoice(inv9)
    expect(r.date.value).toBe('2025-01-09')
    expect(r.amountTTC.value).toBe(189.9)
    expect(r.type.value).toBe('autre')
    expect(r.type.confidence).toBeLessThan(LOW_CONFIDENCE)
  })

  it('10. ignore la date d’échéance et déduit la cohérence', () => {
    const r = parseInvoice(inv10)
    expect(r.date.value).toBe('2024-12-30')
    expect(r.amountTTC.value).toBe(95)
    expect(r.amountHT.value).toBe(79.17)
    expect(r.vat.value).toBe(15.83)
    expect(r.type.value).toBe('pneus') // géométrie / parallélisme
  })

  it('11. plaque ancien format (FNI) et contre-visite', () => {
    const r = parseInvoice(inv11)
    expect(r.date.value).toBe('2023-07-02')
    expect(r.plate.value).toBe('4567 ABC 33')
    expect(r.plate.confidence).toBeLessThan(0.8)
    expect(r.type.value).toBe('controle_technique')
  })

  it('12. « total ttc » en minuscules', () => {
    const r = parseInvoice(inv12)
    expect(r.date.value).toBe('2026-02-14')
    expect(r.amountTTC.value).toBe(98.5)
    expect(r.type.value).toBe('vidange')
  })

  it('13. kilométrage avec point séparateur', () => {
    const r = parseInvoice(inv13)
    expect(r.km.value).toBe(77250)
    expect(r.amountTTC.value).toBe(384)
    expect(r.garage.value).toBe('Feu Vert')
  })

  it('14. « Km au compteur » et carrosserie (rétroviseur/portière)', () => {
    const r = parseInvoice(inv14)
    expect(r.km.value).toBe(51200)
    expect(r.amountTTC.value).toBe(612.4)
    expect(r.type.value).toBe('carrosserie')
  })

  it('15. ignore la date de mise en circulation', () => {
    const r = parseInvoice(inv15)
    expect(r.date.value).toBe('2020-08-27')
    expect(r.amountTTC.value).toBe(180)
    expect(r.type.value).toBe('freins')
  })

  it('16. TVA à 20 % sans montant : TVA déduite de TTC − HT avec confiance moyenne', () => {
    const r = parseInvoice(inv16)
    expect(r.date.value).toBe('2025-03-08')
    expect(r.amountHT.value).toBe(100)
    expect(r.amountTTC.value).toBe(120)
    expect(r.vat.value).toBe(20)
  })

  it('17. incohérence HT + TVA ≠ TTC : confiance abaissée', () => {
    const r = parseInvoice(`Garage X\nFacture 01/02/2025\nTotal HT 100,00\nTVA 20,00\nTotal TTC 150,00`)
    expect(r.amountTTC.value).toBe(150)
    expect(r.amountTTC.confidence).toBeLessThan(LOW_CONFIDENCE)
  })

  it('18. totaux sur une seule ligne (sortie OCR)', () => {
    const r = parseInvoice('Total HT 100,00 TVA 20% 20,00 Total TTC 120,00')
    expect(r.amountHT.value).toBe(100)
    expect(r.vat.value).toBe(20)
    expect(r.amountTTC.value).toBe(120)
  })

  it('19. montant sur la ligne suivant le libellé', () => {
    const r = parseInvoice('Garage Y\nTotal TTC\n256,80 €')
    expect(r.amountTTC.value).toBe(256.8)
  })

  it('20. texte vide ou illisible : aucun champ, confiance nulle', () => {
    for (const t of ['', '   \n  ', '@@## %%']) {
      const r = parseInvoice(t)
      expect(r.date.value).toBeNull()
      expect(r.amountTTC.value).toBeNull()
      expect(r.km.value).toBeNull()
      expect(r.plate.value).toBeNull()
      expect(r.amountTTC.confidence).toBe(0)
    }
  })

  it('21. sans mot-clé de total : plus grand montant, faible confiance', () => {
    const r = parseInvoice('Garage Z\n12/05/2024\nFiltre 12,00\nHuile 45,50')
    expect(r.amountTTC.value).toBe(45.5)
    expect(r.amountTTC.confidence).toBeLessThan(LOW_CONFIDENCE)
  })
})

describe('formats français', () => {
  it('montants', () => {
    expect(amountsIn('1 234,56 €')).toEqual([1234.56])
    expect(amountsIn('1.234,56')).toEqual([1234.56])
    expect(amountsIn('1234.56')).toEqual([1234.56])
    expect(amountsIn('12,5')).toEqual([])
    expect(amountsIn('TVA 20,00 %')).toEqual([])
    expect(amountsIn('12/03/2025 et 12.03.2025')).toEqual([])
  })
  it('dates', () => {
    expect(parseDate('12/03/2025').value).toBe('2025-03-12')
    expect(parseDate('12 mars 2025').value).toBe('2025-03-12')
    expect(parseDate('1er décembre 2024').value).toBe('2024-12-01')
    expect(parseDate('31/02/2025').value).toBeNull()
    expect(parseDate('12/03/1850').value).toBeNull()
  })
  it('kilométrage', () => {
    expect(parseKm('85 432 km').value).toBe(85432)
    expect(parseKm('85432 kms').value).toBe(85432)
    expect(parseKm('Kilométrage : 85.432').value).toBe(85432)
    expect(parseKm('consommation 6 L/100 km').value).toBeNull()
    expect(parseKm('vitesse 130 km/h').value).toBeNull()
  })
})
