import { PlateTracker, plateOf, platesIn } from './plate';

describe('plateOf', () => {
  it('läser en gammal och en ny skylt', () => {
    expect(plateOf('ABC123')).toBe('ABC123');
    expect(plateOf('ABC12D')).toBe('ABC12D');
  });

  it('klarar mellanslag, bindestreck och EU-remsan', () => {
    expect(plateOf('ABC 123')).toBe('ABC123');
    expect(plateOf('abc-12d')).toBe('ABC12D');
    expect(plateOf('S ABC 123')).toBe('ABC123');
    expect(plateOf('5ABC123')).toBe('ABC123');
  });

  it('rättar felläsningar efter plats', () => {
    expect(plateOf('A8C123')).toBe('ABC123');
    expect(plateOf('ABC1O3')).toBe('ABC103');
    expect(plateOf('ABCI23')).toBe('ABC123');
    expect(plateOf('KLM5S4')).toBe('KLM554');
    expect(plateOf('ABC12Q')).toBe('ABC120');
  });

  it('godtar inte det som inte är en skylt', () => {
    expect(plateOf('VOLVO')).toBeNull();
    expect(plateOf('ART-00042')).toBeNull();
    expect(plateOf('ABC1234')).toBeNull();
    expect(plateOf('AB1234')).toBeNull();
    expect(plateOf('12345678')).toBeNull();
    expect(plateOf('')).toBeNull();
  });

  it('godtar inte bokstäver som aldrig finns på skyltar', () => {
    expect(plateOf('VBC123')).toBeNull();
    expect(plateOf('ABQ123')).toBeNull();
    expect(plateOf('ÅBC123')).toBeNull();
  });
});

describe('platesIn', () => {
  it('plockar skyltar ur en bildrutas rader och ignorerar resten', () => {
    expect(platesIn(['VOLVO', 'ABC 123', 'www.bilforetag.se', 'ABC123', 'XYZ45K'])).toEqual([
      'ABC123',
      'XYZ45K',
    ]);
  });
});

describe('PlateTracker', () => {
  it('kräver samma nummer i två bildrutor i rad', () => {
    const t = new PlateTracker();
    expect(t.push(['ABC123'])).toBeNull();
    expect(t.push(['ABC123'])).toBe('ABC123');
  });

  it('en felläsning eller en tom ruta börjar om', () => {
    const t = new PlateTracker();
    expect(t.push(['ABC123'])).toBeNull();
    expect(t.push(['ABD123'])).toBeNull();
    expect(t.push([])).toBeNull();
    expect(t.push(['ABD123'])).toBeNull();
    expect(t.push(['ABD123'])).toBe('ABD123');
  });

  it('håller fast vid numret som setts när flera bilar syns', () => {
    const t = new PlateTracker();
    expect(t.push(['ABC123', 'XYZ789'])).toBeNull();
    expect(t.push(['XYZ789', 'ABC123'])).toBe('ABC123');
  });

  it('ger samma nummer igen först efter nya bildrutor', () => {
    const t = new PlateTracker();
    t.push(['ABC123']);
    expect(t.push(['ABC123'])).toBe('ABC123');
    expect(t.push(['ABC123'])).toBeNull();
  });
});
