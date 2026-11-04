import type { AxleTech, Vehicle, VehicleTech } from '../../../core/models';
import { spaced, techGroups } from './tech-groups';

const axle = (tyre: string, rim: string): AxleTech => ({
  tyre: {
    raw: tyre,
    width: null,
    profile: null,
    diameter: null,
    loadIndex: null,
    speedIndex: null,
  },
  rim: { raw: rim, width: null, diameter: null, offset: null },
  maxLoadKg: null,
  trackMm: null,
});

const tech = (over: Partial<VehicleTech> = {}): VehicleTech => ({
  vehicleClass: 'passenger',
  vehicleType: 'Personbil',
  euCategory: 'M1',
  bodyCode: 'AC',
  bodyText: 'Stationsvagn (kombivagn)',
  fuels: ['BENSIN'],
  electrified: false,
  gearbox: 'Manuell',
  powerKw: 81,
  powerHp: 110,
  displacementCc: 1197,
  fourWheelDrive: false,
  seats: 5,
  maxSpeedKmh: 196,
  lengthMm: 4562,
  widthMm: 1799,
  heightMm: 1446,
  wheelbaseMm: 2620,
  serviceWeightKg: 1362,
  grossWeightKg: 1830,
  maxLoadKg: 468,
  maxTrailerBrakedKg: 1300,
  maxTrailerUnbrakedKg: 640,
  axles: [axle('195/65 R15 91H', '6Jx15 ET43'), axle('195/65 R15 91H', '6Jx15 ET43')],
  odometerKm: 241570,
  odometerAt: '2026-09-28',
  inspectionLast: '2026-09-28',
  inspectionDue: '2026-10-28',
  inspectionStatus: 'Föreläggande',
  previousInspection: '2025-07-17',
  previousOdometerKm: 221142,
  firstRegisteredAt: '2015-11-10',
  inTrafficSwedenAt: '2016-02-25',
  manufacturedAt: '2015-11',
  statusText: 'I trafik',
  typeApprovalNo: 'e1*2007/46*0627*16',
  ...over,
});

const car = (over: Partial<Vehicle> = {}): Vehicle =>
  ({
    id: 'v1',
    code: 'BIL-0001',
    number: 1,
    customerId: 'c1',
    regNo: 'ABC123',
    make: 'Volkswagen',
    model: 'Golf',
    year: 2015,
    vin: null,
    notes: null,
    active: true,
    customer: null,
    specs: {},
    tech: tech(),
    ...over,
  }) as Vehicle;

const group = (v: Vehicle, name: string) => techGroups(v).find((g) => g.title === name);
const value = (v: Vehicle, name: string, label: string) =>
  group(v, name)?.rows.find((r) => r.label === label)?.value;

describe('spaced', () => {
  it('groups thousands with a plain space', () => {
    expect(spaced(241570)).toBe('241 570');
    expect(spaced(999)).toBe('999');
    expect(spaced(1197)).toBe('1 197');
  });
});

describe('techGroups', () => {
  it('shows one tyre and one rim when front and rear are alike', () => {
    expect(group(car(), 'Däck och fälg')?.rows).toEqual([
      { label: 'Däck fram och bak', value: '195/65 R15 91H' },
      { label: 'Fälg fram och bak', value: '6Jx15 ET43' },
    ]);
  });

  it('shows front and rear apart when they differ', () => {
    const v = car({
      tech: tech({
        axles: [axle('225/45 R18 95Y', '8Jx18 ET45'), axle('255/40 R18 99Y', '9Jx18 ET48')],
      }),
    });
    const labels = group(v, 'Däck och fälg')?.rows.map((r) => `${r.label}=${r.value}`);
    expect(labels).toEqual([
      'Däck fram=225/45 R18 95Y',
      'Däck bak=255/40 R18 99Y',
      'Fälg fram=8Jx18 ET45',
      'Fälg bak=9Jx18 ET48',
    ]);
  });

  it('reads the saved sizes on a car that has no typed facts yet', () => {
    const v = car({ tech: undefined, tyreSize: '205/55 R16', rimSize: '6.5Jx16' });
    expect(group(v, 'Däck och fälg')?.rows).toEqual([
      { label: 'Däck', value: '205/55 R16' },
      { label: 'Fälg', value: '6.5Jx16' },
    ]);
  });

  it('writes the numbers with units and the odometer in km', () => {
    const v = car();
    expect(value(v, 'Motor och drivlina', 'Effekt')).toBe('110 hk (81 kW)');
    expect(value(v, 'Motor och drivlina', 'Slagvolym')).toBe('1 197 cm³');
    expect(value(v, 'Motor och drivlina', 'Drivmedel')).toBe('Bensin');
    expect(value(v, 'Motor och drivlina', 'Fyrhjulsdrift')).toBe('Nej');
    expect(value(v, 'Vikt och mått', 'Längd')).toBe('4 562 mm');
    expect(value(v, 'Besiktning', 'Mätarställning')).toBe('241 570 km (2026-09-28)');
    expect(value(v, 'Besiktning', 'Föregående mätarställning')).toBe('221 142 km');
    expect(value(v, 'Registrering', 'Prisklass')).toBe('Personbil');
  });

  it('shows a price class set by hand instead of the register’s', () => {
    expect(value(car({ classOverride: 'trailer' }), 'Registrering', 'Prisklass')).toBe(
      'Husvagn / släp (satt för hand)',
    );
  });

  it('leaves out what the register does not say', () => {
    const v = car({ tech: tech({ displacementCc: null, maxTrailerUnbrakedKg: null }) });
    expect(value(v, 'Motor och drivlina', 'Slagvolym')).toBeUndefined();
    expect(value(v, 'Vikt och mått', 'Max släp, obromsat')).toBeUndefined();
  });

  it('lists the rows no group shows, and hides the ones a typed row already shows', () => {
    const v = car({
      specs: {
        Modellår: '2015',
        Chassinummer: 'X',
        Totalvikt: '1830 kg',
        'Mätarställning (2026-09-28)': '24 157 mil',
        'Fordonets ursprung': 'Införd av registrerad importör',
        'Återanvänt regnr': 'Ja',
      },
    });
    expect(group(v, 'Övrigt från registret')?.rows).toEqual([
      { label: 'Fordonets ursprung', value: 'Införd av registrerad importör' },
      { label: 'Återanvänt regnr', value: 'Ja' },
    ]);
  });

  it('keeps a register row when its typed counterpart is missing', () => {
    const v = car({ tech: tech({ grossWeightKg: null }), specs: { Totalvikt: '1830 kg' } });
    expect(group(v, 'Övrigt från registret')?.rows).toEqual([
      { label: 'Totalvikt', value: '1830 kg' },
    ]);
  });

  it('falls back to every register row when there are no typed facts', () => {
    const v = car({ tech: undefined, specs: { Modellår: '2015', Totalvikt: '1830 kg' } });
    expect(group(v, 'Uppgifter från registret')?.rows).toEqual([
      { label: 'Totalvikt', value: '1830 kg' },
    ]);
  });

  it('has no groups for a car nothing is known about', () => {
    expect(techGroups(car({ tech: undefined, specs: null }))).toEqual([]);
  });
});
