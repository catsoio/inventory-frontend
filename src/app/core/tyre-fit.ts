import { Vehicle } from './models';

/** En däckdimension att söka på: 205/55 R16. */
export interface FitSize {
  width: number;
  profile: number;
  diameter: number;
  /** "205/55 R16" */
  label: string;
  /** Var på bilen storleken sitter. `all` när bilen har samma runt om. */
  where: 'front' | 'rear' | 'all';
  /** Så många däck behövs för att bilen ska få en full uppsättning av just den här storleken. */
  quantity: number;
}

/** Läser "205/55 R16", "205/55R16", "205/55 ZR16 91V" och "205/55-16". Allt annat ger null. */
export function parseTyreSize(
  raw: string | null | undefined,
): Pick<FitSize, 'width' | 'profile' | 'diameter'> | null {
  if (!raw) return null;
  const m = /(\d{3})\s*\/\s*(\d{2})\s*(?:[A-Z]{0,2}\s*R|[A-Z]{1,2}|-)?\s*(\d{2})(?!\d)/i.exec(raw);
  if (!m) return null;
  const [width, profile, diameter] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (width < 125 || width > 405 || profile < 20 || profile > 95 || diameter < 10 || diameter > 30)
    return null;
  return { width, profile, diameter };
}

export const sizeLabel = (s: Pick<FitSize, 'width' | 'profile' | 'diameter'>): string =>
  `${s.width}/${s.profile} R${s.diameter}`;

const key = (s: Pick<FitSize, 'width' | 'profile' | 'diameter'>) =>
  `${s.width}/${s.profile}/${s.diameter}`;

/**
 * De dimensioner bilen kan ha, fram först. Registrets axelrader har företräde; saknas de används
 * bilens sparade däckmått fram och bak. Har bilen samma storlek på alla axlar blir det en rad med
 * fyra däck, annars två rader med två däck var.
 */
export function fittingSizes(
  v: Pick<Vehicle, 'tech' | 'tyreSize' | 'tyreSizeRear'> | null | undefined,
): FitSize[] {
  if (!v) return [];
  const raw: { size: Pick<FitSize, 'width' | 'profile' | 'diameter'> }[] = [];
  const axles = v.tech?.axles ?? [];
  for (const a of axles) {
    const t = a.tyre?.width && a.tyre.profile && a.tyre.diameter ? a.tyre : null;
    const size = t
      ? { width: t.width!, profile: t.profile!, diameter: t.diameter! }
      : parseTyreSize(a.tyre?.raw);
    if (size) raw.push({ size });
  }
  if (!raw.length) {
    const front = parseTyreSize(v.tyreSize);
    const rear = parseTyreSize(v.tyreSizeRear);
    if (front) raw.push({ size: front });
    if (rear) raw.push({ size: rear });
  }
  if (!raw.length) return [];

  const distinct: Pick<FitSize, 'width' | 'profile' | 'diameter'>[] = [];
  for (const { size } of raw) if (!distinct.some((d) => key(d) === key(size))) distinct.push(size);

  if (distinct.length === 1) {
    return [{ ...distinct[0], label: sizeLabel(distinct[0]), where: 'all', quantity: 4 }];
  }
  return distinct.slice(0, 2).map((s, i) => ({
    ...s,
    label: sizeLabel(s),
    where: i === 0 ? ('front' as const) : ('rear' as const),
    quantity: 2,
  }));
}
