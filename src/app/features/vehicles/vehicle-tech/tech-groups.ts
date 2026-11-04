import { VEHICLE_CLASS_LABELS, type Vehicle, type VehicleTech } from '../../../core/models';

export interface TechRow {
  label: string;
  value: string;
}

export interface TechGroup {
  title: string;
  rows: TechRow[];
}

/** 241570 → "241 570" (vanligt blanksteg, så texten är lika överallt). */
export const spaced = (n: number): string =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const unit = (v: number | null | undefined, u: string): string | null =>
  v == null ? null : `${spaced(v)} ${u}`;

const yesNo = (v: boolean | null | undefined): string | null =>
  v == null ? null : v ? 'Ja' : 'Nej';

/** "BENSIN" → "Bensin". */
const title = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

const row = (label: string, value: string | null | undefined): TechRow | null =>
  value ? { label, value } : null;

const rows = (...r: (TechRow | null)[]): TechRow[] => r.filter((x): x is TechRow => x !== null);

/**
 * Registerrader som en typad rad redan visar. En rad döljs bara när det typade värdet finns,
 * så att inget som registret berättar försvinner om en tolkning missar.
 */
const SHOWN_ELSEWHERE: Record<string, (t: VehicleTech) => unknown> = {
  Modellår: () => true,
  Chassinummer: () => true,
  'Däckdimension fram': (t) => t.axles[0]?.tyre,
  'Däckdimension bak': (t) => t.axles.length > 1,
  'Fälgdimension fram': (t) => t.axles[0]?.rim,
  'Fälgdimension bak': (t) => t.axles.length > 1,
  Fordonsstatus: (t) => t.statusText,
  'Första registrering': (t) => t.firstRegisteredAt,
  'I trafik Sverige': (t) => t.inTrafficSwedenAt,
  Tillverkningsdatum: (t) => t.manufacturedAt,
  Typgodkännandenummer: (t) => t.typeApprovalNo,
  Fordonstyp: (t) => t.vehicleType,
  'Fordonskategori EU': (t) => t.euCategory,
  Kaross: (t) => t.bodyText,
  'Nästa besiktning senast': (t) => t.inspectionDue,
  'Senast besiktigad': (t) => t.inspectionLast,
  Besiktningsstatus: (t) => t.inspectionStatus,
  'Föregående besiktningsdatum': (t) => t.previousInspection,
  'Föregående mätarställning': (t) => t.previousOdometerKm,
  Bredd: (t) => t.widthMm,
  Längd: (t) => t.lengthMm,
  Höjd: (t) => t.heightMm,
  Totalvikt: (t) => t.grossWeightKg,
  Tjänstevikt: (t) => t.serviceWeightKg,
  'Max lastvikt': (t) => t.maxLoadKg,
  'Max släpvagnsvikt': (t) => t.maxTrailerBrakedKg,
  'Max hastighet': (t) => t.maxSpeedKmh,
  'El/hybrid': (t) => t.electrified,
  Fyrhjulsdrift: (t) => t.fourWheelDrive,
  Drivmedel: (t) => t.fuels.length,
  Växellåda: (t) => t.gearbox,
  'Antal sittplatser': (t) => t.seats,
  Motoreffekt: (t) => t.powerKw ?? t.powerHp,
};

const shownElsewhere = (label: string, t: VehicleTech | null): boolean => {
  if (!t) return label === 'Modellår' || label === 'Chassinummer';
  if (label.startsWith('Mätarställning')) return t.odometerKm != null;
  const has = SHOWN_ELSEWHERE[label];
  return !!has && has(t) != null && has(t) !== false;
};

/** Däck och fälg: ett mått när fram och bak är lika, annars var för sig. */
function tyreRows(v: Vehicle): TechRow[] {
  const t = v.tech ?? null;
  const front = t?.axles[0];
  const rear = t && t.axles.length > 1 ? t.axles[t.axles.length - 1] : null;
  const frontTyre = front?.tyre?.raw ?? v.tyreSize ?? null;
  const frontRim = front?.rim?.raw ?? v.rimSize ?? null;
  const rearTyre = rear?.tyre?.raw ?? v.tyreSizeRear ?? null;
  const rearRim = rear?.rim?.raw ?? v.rimSizeRear ?? null;
  const alike = (rearTyre ?? frontTyre) === frontTyre && (rearRim ?? frontRim) === frontRim;
  const axles = rear || v.tyreSizeRear || v.rimSizeRear ? ' fram och bak' : '';
  return alike
    ? rows(
        row(`Däck${axles}`, frontTyre),
        row(`Fälg${axles}`, frontRim),
        row('Max axeltryck fram', unit(front?.maxLoadKg, 'kg')),
        row('Max axeltryck bak', unit(rear?.maxLoadKg, 'kg')),
      )
    : rows(
        row('Däck fram', frontTyre),
        row('Däck bak', rearTyre),
        row('Fälg fram', frontRim),
        row('Fälg bak', rearRim),
        row('Max axeltryck fram', unit(front?.maxLoadKg, 'kg')),
        row('Max axeltryck bak', unit(rear?.maxLoadKg, 'kg')),
      );
}

/**
 * Allt registret berättar om bilen, i grupper. Sist kommer "Övrigt från registret" med de
 * rader som ingen grupp visar, så att en ny rad på källsidan syns utan att något byggs om.
 */
export function techGroups(v: Vehicle): TechGroup[] {
  const t = v.tech ?? null;
  const specs = Object.entries(v.specs ?? {});
  const groups: TechGroup[] = [];
  const add = (groupTitle: string, r: TechRow[]) => {
    if (r.length) groups.push({ title: groupTitle, rows: r });
  };

  add('Däck och fälg', tyreRows(v));
  if (t) {
    add(
      'Motor och drivlina',
      rows(
        row('Drivmedel', t.fuels.map(title).join(', ')),
        row(
          'Effekt',
          t.powerKw != null
            ? `${t.powerHp != null ? `${spaced(t.powerHp)} hk ` : ''}(${spaced(t.powerKw)} kW)`
            : t.powerHp != null
              ? `${spaced(t.powerHp)} hk`
              : null,
        ),
        row('Slagvolym', unit(t.displacementCc, 'cm³')),
        row('Växellåda', t.gearbox),
        row('Fyrhjulsdrift', yesNo(t.fourWheelDrive)),
        row('El/hybrid', yesNo(t.electrified)),
        row('Max hastighet', unit(t.maxSpeedKmh, 'km/h')),
        row('Sittplatser', t.seats != null ? String(t.seats) : null),
      ),
    );
    add(
      'Vikt och mått',
      rows(
        row('Tjänstevikt', unit(t.serviceWeightKg, 'kg')),
        row('Totalvikt', unit(t.grossWeightKg, 'kg')),
        row('Max last', unit(t.maxLoadKg, 'kg')),
        row('Max släp, bromsat', unit(t.maxTrailerBrakedKg, 'kg')),
        row('Max släp, obromsat', unit(t.maxTrailerUnbrakedKg, 'kg')),
        row('Längd', unit(t.lengthMm, 'mm')),
        row('Bredd', unit(t.widthMm, 'mm')),
        row('Höjd', unit(t.heightMm, 'mm')),
        row('Axelavstånd', unit(t.wheelbaseMm, 'mm')),
      ),
    );
    add(
      'Besiktning',
      rows(
        row('Nästa besiktning senast', t.inspectionDue),
        row('Senast besiktigad', t.inspectionLast),
        row('Status', t.inspectionStatus),
        row(
          'Mätarställning',
          t.odometerKm != null
            ? `${spaced(t.odometerKm)} km${t.odometerAt ? ` (${t.odometerAt})` : ''}`
            : null,
        ),
        row('Föregående besiktning', t.previousInspection),
        row('Föregående mätarställning', unit(t.previousOdometerKm, 'km')),
      ),
    );
    add(
      'Registrering',
      rows(
        row(
          'Prisklass',
          `${VEHICLE_CLASS_LABELS[v.classOverride ?? t.vehicleClass]}${v.classOverride ? ' (satt för hand)' : ''}`,
        ),
        row('Fordonstyp', t.vehicleType),
        row('EU-kategori', t.euCategory),
        row('Kaross', t.bodyText ?? t.bodyCode),
        row('Fordonsstatus', t.statusText),
        row('Första registrering', t.firstRegisteredAt),
        row('I trafik i Sverige', t.inTrafficSwedenAt),
        row('Tillverkad', t.manufacturedAt),
        row('Typgodkännande', t.typeApprovalNo),
      ),
    );
  }
  add(
    t ? 'Övrigt från registret' : 'Uppgifter från registret',
    specs
      .filter(([label, value]) => !!value && !shownElsewhere(label, t))
      .map(([label, value]) => ({ label, value })),
  );
  return groups;
}
