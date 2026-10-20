/** Every detection and analysis tunable lives here. Values marked (CP1) get set from real recordings. */
export const PARAMS = {
  /** Band the tag's single in-band mode is searched in (Hz). */
  bandLoHz: 9000,
  bandHiHz: 15500,
  /** FE-predicted tone for goBILDA 1501, 46 mm (Hz). Real tags differ by a few percent. */
  nominalToneHz: 13305,
  /** Onset: band energy this far above the adaptive floor (dB). */
  onsetRiseDb: 10,
  /** Event is over when band energy is back within this of the floor (dB). */
  eventEndDb: 6,
  /** Floor time constant (s) and warm-up (s). */
  floorTauS: 1.0,
  floorWarmupS: 0.3,
  /** Skip this long after onset before analysing the ringdown (the click) (ms). (CP1) */
  clickSkipMs: 3,
  /** Zero-padded FFT length for peak refinement. */
  peakFftSize: 32768,
  /** Guard: neighbour ranges as fractions of the peak frequency, and the required margin (dB). */
  guardInner: 0.02,
  guardOuter: 0.04,
  guardMarginDb: 10,
  /** SNR gate (dB) and the band around the peak used for the noise estimate (fraction of f, each side). */
  snrGateDb: 12,
  snrBandFrac: 0.01,
  /** Pre-onset noise segment length (ms). */
  noiseWindowMs: 100,
  /** Refractory after an onset (ms). */
  refractoryMs: 300,
  /** Onset also watches overlapping sub-bands (width as a fraction of the nominal tone) so a narrowband ring stands out; rise (dB) for them. */
  tileWidthFrac: 0.08,
  tileRiseDb: 8,
  /** The ring must end (fall back to within eventEndDb of the floor) within this long after onset, and fall at least minDropDb. */
  maxRingMs: 120,
  minDropDb: 3,
  /** Analyse this long after the onset (ms): must cover maxRingMs plus the envelope tail. */
  analyzeAfterMs: 150,
  /** The ringdown window is measured, then clamped to these bounds (ms after the click skip). */
  windowMinMs: 6,
  windowMaxMs: 60,
  /** Ringdown gate: R² of the dB-vs-time fit and the minimum number of 1 ms frames above the floor. */
  decayR2Min: 0.7,
  minRingFrames: 3,
  /** R² only judges the ringdown when the ring starts at least this far above the envelope floor (dB); below it the fit is noise. */
  r2HeadroomDb: 15,
  /** Tolerance: max(tolMinFrac, tolSpreadMult × calibration spread), capped at tolMaxFrac. */
  tolMinFrac: 0.006,
  tolMaxFrac: 0.025,
  tolSpreadMult: 4,
  /** Calibration: rings required and how closely each must agree with the median (fraction). */
  calibRings: 5,
  calibAgreeFrac: 0.005,
  /** Multi-listener dedupe: collect reports this long, and treat reports within this window as one event (ms). */
  dedupeCollectMs: 300,
  dedupeWindowMs: 1000,
} as const;

export type Params = typeof PARAMS;
