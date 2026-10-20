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
} as const;

export type Params = typeof PARAMS;
