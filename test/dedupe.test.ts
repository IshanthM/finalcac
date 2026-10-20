import { describe, expect, it } from 'vitest';
import { Deduper, kindFor, type Report } from '../src/dsp/dedupe.ts';

const rep = (zone: string, snrDb: number, zoneType: Report['zoneType'] = 'fitting'): Report => ({ zone, zoneType, snrDb, freqHz: 13300 });
let n = 0;
const make = () => new Deduper({ collectMs: 300, windowMs: 1000, makeId: () => `i${++n}` });

describe('Deduper', () => {
  it('a lone report becomes one incident after the collect window, not before', () => {
    const d = make();
    expect(d.report(rep('Fitting Room 2', 20), 1000)).toEqual([]);
    expect(d.nextDeadline()).toBe(1300);
    expect(d.tick(1299)).toEqual([]);
    const fx = d.tick(1300);
    expect(fx).toHaveLength(1);
    expect(fx[0]!.type).toBe('incident');
    expect(fx[0]!.incident).toMatchObject({ zone: 'Fitting Room 2', kind: 'tamper', alsoHeardBy: [], at: 1000 });
    expect(d.nextDeadline()).toBeNull();
  });

  it('attributes to the highest SNR and lists the others, best first', () => {
    const d = make();
    d.report(rep('Floor', 14, 'floor'), 1000);
    d.report(rep('Fitting Room 2', 26), 1120);
    d.report(rep('Fitting Room 1', 19), 1200);
    const inc = d.tick(1300)[0]!.incident;
    expect(inc.zone).toBe('Fitting Room 2');
    expect(inc.alsoHeardBy.map((h) => h.zone)).toEqual(['Fitting Room 1', 'Floor']);
  });

  it('a report after the collect window but inside 1 s only extends "also heard by"; attribution does not move', () => {
    const d = make();
    d.report(rep('Fitting Room 2', 15), 1000);
    expect(d.tick(1300)[0]!.incident.zone).toBe('Fitting Room 2');
    const fx = d.report(rep('Floor', 30, 'floor'), 1600);
    expect(fx).toHaveLength(1);
    expect(fx[0]!.type).toBe('update');
    expect(fx[0]!.incident.zone).toBe('Fitting Room 2');
    expect(fx[0]!.incident.alsoHeardBy).toEqual([{ zone: 'Floor', snrDb: 30 }]);
  });

  it('a repeat from an already-listed zone changes nothing', () => {
    const d = make();
    d.report(rep('A', 20), 0); d.tick(300);
    d.report(rep('B', 10), 400);
    expect(d.report(rep('B', 12), 500)).toEqual([]);
    expect(d.report(rep('A', 25), 600)).toEqual([]);
  });

  it('a report more than 1 s after the first starts a new incident', () => {
    const d = make();
    d.report(rep('A', 20), 0); d.tick(300);
    expect(d.report(rep('A', 20), 1000)).toEqual([]);
    const fx = d.tick(1300);
    expect(fx).toHaveLength(1);
    expect(fx[0]!.incident.at).toBe(1000);
  });

  it('two phones in the same zone count once, with the better SNR', () => {
    const d = make();
    d.report(rep('Fitting Room 2', 12), 0);
    d.report(rep('Fitting Room 2', 22), 50);
    const inc = d.tick(300)[0]!.incident;
    expect(inc.snrDb).toBe(22);
    expect(inc.alsoHeardBy).toEqual([]);
  });

  it('register zones make a quiet checkout, but only when the register is the loudest', () => {
    expect(kindFor('register')).toBe('checkout');
    expect(kindFor('fitting')).toBe('tamper');
    const d = make();
    d.report(rep('Register 1', 25, 'register'), 0);
    d.report(rep('Floor', 12, 'floor'), 40);
    const a = d.tick(300)[0]!.incident;
    expect(a).toMatchObject({ kind: 'checkout', zone: 'Register 1' });
    expect(a.alsoHeardBy).toEqual([{ zone: 'Floor', snrDb: 12 }]);
    const d2 = make();
    d2.report(rep('Register 1', 10, 'register'), 0);
    d2.report(rep('Fitting Room 2', 24), 40);
    expect(d2.tick(300)[0]!.incident).toMatchObject({ kind: 'tamper', zone: 'Fitting Room 2' });
  });

  it('carries the delayed flag from the winning report', () => {
    const d = make();
    d.report({ ...rep('A', 20), delayed: true }, 0);
    expect(d.tick(300)[0]!.incident.delayed).toBe(true);
  });
});
