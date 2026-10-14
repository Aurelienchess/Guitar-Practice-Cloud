import { Injectable, signal } from '@angular/core';

export interface EqBandConfig {
  frequency: number;
  type: BiquadFilterType;
  label: string;
}

export const EQ_BANDS_CONFIG: EqBandConfig[] = [
  { frequency: 60, type: 'lowshelf', label: '60 Hz' },
  { frequency: 250, type: 'peaking', label: '250 Hz' },
  { frequency: 1000, type: 'peaking', label: '1 kHz' },
  { frequency: 4000, type: 'peaking', label: '4 kHz' },
  { frequency: 12000, type: 'highshelf', label: '12 kHz' },
];

export interface EqPreset {
  name: string;
  gains: number[]; // dB pour chaque bande [-12, +12]
}

export const EQ_PRESETS: EqPreset[] = [
  { name: 'Neutre (Flat)', gains: [0, 0, 0, 0, 0] },
  { name: 'Bass Boost', gains: [7, 4, 0, -1, -2] },
  { name: 'Rock / Solo', gains: [5, 2, -2, 4, 6] },
  { name: 'Clarté / Aigus', gains: [-3, -1, 1, 5, 8] },
  { name: 'Acoustique', gains: [4, 1, -1, 3, 5] },
  { name: 'Vocal Presence', gains: [-4, 0, 5, 4, -1] },
];

/**
 * Service moteur audio basé sur la Web Audio API.
 * Gère le graphe de traitement complet :
 * - Distorsion harmonique (WaveShaper)
 * - Égaliseur graphique 5 bandes
 * - Filtre résonant multimode (Lowpass / Highpass / Bandpass) avec fréquence de coupure et résonance
 * - Écho / Delay spatialisé (Delay + Feedback)
 * - Réverbération acoustique algorithmique (Convolver)
 * - Balance gauche / droite panoramique (StereoPanner)
 * - Séparation des canaux stéréo (ChannelSplitter) avec mesures Crête (Peak) et Efficace (RMS)
 * - Analyseur spectral & oscilloscopique (AnalyserNode) pour le canvas HTML5
 */
@Injectable({
  providedIn: 'root',
})
export class AudioEngineService {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;

  // Noeuds du graphe
  private distortionNode!: WaveShaperNode;
  private distortionDry!: GainNode;
  private distortionWet!: GainNode;

  private eqNodes: BiquadFilterNode[] = [];

  private filterNode!: BiquadFilterNode;
  private filterDry!: GainNode;
  private filterWet!: GainNode;

  private delayNode!: DelayNode;
  private delayFeedbackGain!: GainNode;
  private delayDry!: GainNode;
  private delayWet!: GainNode;

  private convolverNode!: ConvolverNode;
  private reverbDry!: GainNode;
  private reverbWet!: GainNode;

  private pannerNode!: StereoPannerNode;

  private splitterNode!: ChannelSplitterNode;
  private analyserLeft!: AnalyserNode;
  private analyserRight!: AnalyserNode;
  private masterAnalyser!: AnalyserNode;

  private masterGainNode!: GainNode;

  // Buffers d'analyse
  private timeDataBufferLeft = new Float32Array(new ArrayBuffer(512 * 4));
  private timeDataBufferRight = new Float32Array(new ArrayBuffer(512 * 4));
  private waveformDataBuffer = new Uint8Array(new ArrayBuffer(2048));
  private frequencyDataBuffer = new Uint8Array(new ArrayBuffer(1024));

  // État réactif (Signals) pour l'interface de mixage
  readonly isInitialized = signal<boolean>(false);

  // Balance Panoramique (-1 = Gauche, 0 = Centre, 1 = Droite)
  readonly pan = signal<number>(0);

  // Égaliseur multi-bandes (valeurs en dB de -12 à +12)
  readonly eqGains = signal<number[]>([0, 0, 0, 0, 0]);

  // Filtre résonant
  readonly filterType = signal<BiquadFilterType>('lowpass');
  readonly filterCutoff = signal<number>(20000); // 20 Hz .. 20 000 Hz
  readonly filterResonance = signal<number>(1.0); // Q: 0.1 .. 20
  readonly filterBypass = signal<boolean>(true);

  // Distorsion harmonique
  readonly distortionDrive = signal<number>(0); // 0 .. 100
  readonly distortionBypass = signal<boolean>(true);

  // Écho / Delay spatialisé
  readonly delayTime = signal<number>(0.3); // 0.05s .. 1.5s
  readonly delayFeedback = signal<number>(0.35); // 0.0 .. 0.85
  readonly delayMix = signal<number>(0); // 0% .. 100%
  readonly delayBypass = signal<boolean>(true);

  // Réverbération acoustique
  readonly reverbDecay = signal<number>(2.5); // 0.5s .. 6s
  readonly reverbMix = signal<number>(0); // 0% .. 100%
  readonly reverbBypass = signal<boolean>(true);

  // Volume Master (0 .. 1.5)
  readonly masterVolume = signal<number>(1.0);

  // Mesures stéréo instantanées (Peak & RMS normalisés [0..1])
  readonly meterPeakL = signal<number>(0);
  readonly meterRmsL = signal<number>(0);
  readonly meterPeakR = signal<number>(0);
  readonly meterRmsR = signal<number>(0);

  /**
   * Initialise le graphe Web Audio à partir de l'élément HTMLAudioElement
   */
  init(audioEl: HTMLAudioElement): void {
    if (this.isInitialized()) return;
    if (typeof window === 'undefined') return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      console.warn('Web Audio API non supportée dans cet environnement.');
      return;
    }

    try {
      this.audioCtx = new AudioContextClass();

      // 1. Source élément média
      this.sourceNode = this.audioCtx.createMediaElementSource(audioEl);

      // 2. Étage Distorsion Harmonique
      this.distortionNode = this.audioCtx.createWaveShaper();
      this.distortionNode.oversample = '4x';
      this.distortionNode.curve = this.makeDistortionCurve(0);

      this.distortionDry = this.audioCtx.createGain();
      this.distortionWet = this.audioCtx.createGain();
      this.distortionDry.gain.value = 1;
      this.distortionWet.gain.value = 0;

      const distortionIn = this.audioCtx.createGain();
      const distortionOut = this.audioCtx.createGain();

      this.sourceNode.connect(distortionIn);
      distortionIn.connect(this.distortionDry);
      distortionIn.connect(this.distortionNode);
      this.distortionNode.connect(this.distortionWet);
      this.distortionDry.connect(distortionOut);
      this.distortionWet.connect(distortionOut);

      // 3. Étage Égaliseur 5 bandes en série
      this.eqNodes = EQ_BANDS_CONFIG.map((cfg) => {
        const filter = this.audioCtx!.createBiquadFilter();
        filter.type = cfg.type;
        filter.frequency.value = cfg.frequency;
        filter.gain.value = 0;
        if (cfg.type === 'peaking') {
          filter.Q.value = 1.0;
        }
        return filter;
      });

      distortionOut.connect(this.eqNodes[0]);
      for (let i = 0; i < this.eqNodes.length - 1; i++) {
        this.eqNodes[i].connect(this.eqNodes[i + 1]);
      }
      const eqOut = this.eqNodes[this.eqNodes.length - 1];

      // 4. Étage Filtre Résonant (Cutoff & Q)
      this.filterNode = this.audioCtx.createBiquadFilter();
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 20000;
      this.filterNode.Q.value = 1.0;

      this.filterDry = this.audioCtx.createGain();
      this.filterWet = this.audioCtx.createGain();
      this.filterDry.gain.value = 1; // Bypass par défaut
      this.filterWet.gain.value = 0;

      const filterIn = this.audioCtx.createGain();
      const filterOut = this.audioCtx.createGain();

      eqOut.connect(filterIn);
      filterIn.connect(this.filterDry);
      filterIn.connect(this.filterNode);
      this.filterNode.connect(this.filterWet);
      this.filterDry.connect(filterOut);
      this.filterWet.connect(filterOut);

      // 5. Étage Delay / Écho Spatialisé
      this.delayNode = this.audioCtx.createDelay(5.0);
      this.delayNode.delayTime.value = 0.3;

      this.delayFeedbackGain = this.audioCtx.createGain();
      this.delayFeedbackGain.gain.value = 0.35;

      this.delayDry = this.audioCtx.createGain();
      this.delayWet = this.audioCtx.createGain();
      this.delayDry.gain.value = 1;
      this.delayWet.gain.value = 0;

      const delayIn = this.audioCtx.createGain();
      const delayOut = this.audioCtx.createGain();

      filterOut.connect(delayIn);
      delayIn.connect(this.delayDry);
      delayIn.connect(this.delayNode);

      // Boucle de réinjection (feedback)
      this.delayNode.connect(this.delayFeedbackGain);
      this.delayFeedbackGain.connect(this.delayNode);
      this.delayNode.connect(this.delayWet);

      this.delayDry.connect(delayOut);
      this.delayWet.connect(delayOut);

      // 6. Étage Réverbération Acoustique (Convolver)
      this.convolverNode = this.audioCtx.createConvolver();
      this.updateReverbBuffer(this.reverbDecay());

      this.reverbDry = this.audioCtx.createGain();
      this.reverbWet = this.audioCtx.createGain();
      this.reverbDry.gain.value = 1;
      this.reverbWet.gain.value = 0;

      const reverbIn = this.audioCtx.createGain();
      const reverbOut = this.audioCtx.createGain();

      delayOut.connect(reverbIn);
      reverbIn.connect(this.reverbDry);
      reverbIn.connect(this.convolverNode);
      this.convolverNode.connect(this.reverbWet);

      this.reverbDry.connect(reverbOut);
      this.reverbWet.connect(reverbOut);

      // 7. Étage Balance Panoramique Gauche / Droite
      this.pannerNode = this.audioCtx.createStereoPanner();
      this.pannerNode.pan.value = 0;
      reverbOut.connect(this.pannerNode);
      const postPannerNode: AudioNode = this.pannerNode;

      // 8. Étage d'Analyse Globale (Oscilloscope & Spectre pour le Canvas)
      this.masterAnalyser = this.audioCtx.createAnalyser();
      this.masterAnalyser.fftSize = 2048;
      this.masterAnalyser.smoothingTimeConstant = 0.85;
      postPannerNode.connect(this.masterAnalyser);

      // 9. Séparation des canaux stéréo (Vu-mètres Gauche et Droit)
      this.splitterNode = this.audioCtx.createChannelSplitter(2);
      this.analyserLeft = this.audioCtx.createAnalyser();
      this.analyserLeft.fftSize = 512;
      this.analyserLeft.smoothingTimeConstant = 0.75;

      this.analyserRight = this.audioCtx.createAnalyser();
      this.analyserRight.fftSize = 512;
      this.analyserRight.smoothingTimeConstant = 0.75;

      postPannerNode.connect(this.splitterNode);
      this.splitterNode.connect(this.analyserLeft, 0); // Canal Gauche
      this.splitterNode.connect(this.analyserRight, 1); // Canal Droit

      // 10. Volume Master & Sortie vers Destination (Haut-parleurs)
      this.masterGainNode = this.audioCtx.createGain();
      this.masterGainNode.gain.value = 1.0;
      postPannerNode.connect(this.masterGainNode);
      this.masterGainNode.connect(this.audioCtx.destination);

      this.isInitialized.set(true);

      // Démarrage de la boucle de mesure des Vu-mètres
      this.startMeterLoop();
    } catch (err) {
      console.error("Erreur lors de l'initialisation du moteur Web Audio :", err);
    }
  }

  /**
   * Assure la reprise du contexte audio lors d'une interaction utilisateur
   */
  resume(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch((err) => {
        console.warn('Impossible de réactiver le contexte audio :', err);
      });
    }
  }

  /**
   * Retourne le contexte Web Audio natif pour les extensions éventuelles
   */
  getAudioContext(): AudioContext | null {
    return this.audioCtx;
  }

  /**
   * Retourne le nœud d'analyse audio master pour les visualiseurs (Butterchurn)
   */
  getMasterNode(): AudioNode | null {
    return this.masterAnalyser || this.masterGainNode || null;
  }

  /**
   * Réglage de la balance panoramique (-1 = Tout à gauche, +1 = Tout à droite)
   */
  setPan(val: number): void {
    const clamped = Math.max(-1, Math.min(1, val));
    this.pan.set(clamped);
    if (this.pannerNode && this.pannerNode.pan) {
      this.pannerNode.pan.setTargetAtTime(clamped, this.audioCtx?.currentTime ?? 0, 0.02);
    }
  }

  /**
   * Réglage du gain d'une bande de l'égaliseur (bandIndex: 0..4, gainDb: -12..+12)
   */
  setEqBand(bandIndex: number, gainDb: number): void {
    if (bandIndex < 0 || bandIndex >= this.eqNodes.length) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));

    const currentGains = [...this.eqGains()];
    currentGains[bandIndex] = clamped;
    this.eqGains.set(currentGains);

    if (this.eqNodes[bandIndex]) {
      this.eqNodes[bandIndex].gain.setTargetAtTime(clamped, this.audioCtx?.currentTime ?? 0, 0.02);
    }
  }

  /**
   * Applique un preset complet d'égalisation
   */
  applyEqPreset(preset: EqPreset): void {
    preset.gains.forEach((gain, index) => {
      this.setEqBand(index, gain);
    });
  }

  /**
   * Réglage du filtre résonant
   */
  setFilter(params: {
    type?: BiquadFilterType;
    cutoff?: number;
    resonance?: number;
    bypass?: boolean;
  }): void {
    if (params.type !== undefined) {
      this.filterType.set(params.type);
      if (this.filterNode) {
        this.filterNode.type = params.type;
      }
    }

    if (params.cutoff !== undefined) {
      const clamped = Math.max(20, Math.min(20000, params.cutoff));
      this.filterCutoff.set(clamped);
      if (this.filterNode) {
        this.filterNode.frequency.setTargetAtTime(clamped, this.audioCtx?.currentTime ?? 0, 0.02);
      }
    }

    if (params.resonance !== undefined) {
      const clamped = Math.max(0.1, Math.min(20, params.resonance));
      this.filterResonance.set(clamped);
      if (this.filterNode) {
        this.filterNode.Q.setTargetAtTime(clamped, this.audioCtx?.currentTime ?? 0, 0.02);
      }
    }

    if (params.bypass !== undefined) {
      this.filterBypass.set(params.bypass);
      this.updateFilterMix();
    }
  }

  private updateFilterMix(): void {
    const isBypass = this.filterBypass();
    const now = this.audioCtx?.currentTime ?? 0;
    if (this.filterDry && this.filterWet) {
      this.filterDry.gain.setTargetAtTime(isBypass ? 1 : 0, now, 0.02);
      this.filterWet.gain.setTargetAtTime(isBypass ? 0 : 1, now, 0.02);
    }
  }

  /**
   * Réglage de la distorsion harmonique
   */
  setDistortion(params: { drive?: number; bypass?: boolean }): void {
    if (params.drive !== undefined) {
      const clamped = Math.max(0, Math.min(100, params.drive));
      this.distortionDrive.set(clamped);
      if (this.distortionNode) {
        this.distortionNode.curve = this.makeDistortionCurve(clamped);
      }
    }

    if (params.bypass !== undefined) {
      this.distortionBypass.set(params.bypass);
    }

    const isBypass = this.distortionBypass() || this.distortionDrive() === 0;
    const now = this.audioCtx?.currentTime ?? 0;
    if (this.distortionDry && this.distortionWet) {
      this.distortionDry.gain.setTargetAtTime(isBypass ? 1 : 0, now, 0.02);
      this.distortionWet.gain.setTargetAtTime(isBypass ? 0 : 1, now, 0.02);
    }
  }

  /**
   * Génère une courbe sigmoïde non linéaire simulant la saturation harmonique d'un ampli à lampes
   */
  private makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
    const k = amount * 4;
    const n_samples = 44100;
    const buffer = new ArrayBuffer(n_samples * 4);
    const curve = new Float32Array(buffer);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      if (k === 0) {
        curve[i] = x;
      } else {
        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
      }
    }
    return curve;
  }

  /**
   * Réglage de l'écho / delay spatialisé
   */
  setDelay(params: {
    time?: number;
    feedback?: number;
    mix?: number;
    bypass?: boolean;
  }): void {
    const now = this.audioCtx?.currentTime ?? 0;

    if (params.time !== undefined) {
      const clamped = Math.max(0.05, Math.min(1.5, params.time));
      this.delayTime.set(clamped);
      if (this.delayNode) {
        this.delayNode.delayTime.setTargetAtTime(clamped, now, 0.02);
      }
    }

    if (params.feedback !== undefined) {
      const clamped = Math.max(0, Math.min(0.85, params.feedback));
      this.delayFeedback.set(clamped);
      if (this.delayFeedbackGain) {
        this.delayFeedbackGain.gain.setTargetAtTime(clamped, now, 0.02);
      }
    }

    if (params.mix !== undefined) {
      this.delayMix.set(Math.max(0, Math.min(100, params.mix)));
    }

    if (params.bypass !== undefined) {
      this.delayBypass.set(params.bypass);
    }

    const isBypass = this.delayBypass();
    const wetRatio = isBypass ? 0 : this.delayMix() / 100;
    const dryRatio = 1 - wetRatio * 0.5;

    if (this.delayDry && this.delayWet) {
      this.delayDry.gain.setTargetAtTime(dryRatio, now, 0.02);
      this.delayWet.gain.setTargetAtTime(wetRatio, now, 0.02);
    }
  }

  /**
   * Réglage de la réverbération acoustique
   */
  setReverb(params: {
    decay?: number;
    mix?: number;
    bypass?: boolean;
  }): void {
    const now = this.audioCtx?.currentTime ?? 0;

    if (params.decay !== undefined) {
      const clamped = Math.max(0.5, Math.min(6.0, params.decay));
      this.reverbDecay.set(clamped);
      this.updateReverbBuffer(clamped);
    }

    if (params.mix !== undefined) {
      this.reverbMix.set(Math.max(0, Math.min(100, params.mix)));
    }

    if (params.bypass !== undefined) {
      this.reverbBypass.set(params.bypass);
    }

    const isBypass = this.reverbBypass();
    const wetRatio = isBypass ? 0 : this.reverbMix() / 100;
    const dryRatio = 1 - wetRatio * 0.4;

    if (this.reverbDry && this.reverbWet) {
      this.reverbDry.gain.setTargetAtTime(dryRatio, now, 0.02);
      this.reverbWet.gain.setTargetAtTime(wetRatio, now, 0.02);
    }
  }

  /**
   * Synthèse algorithmique d'une réponse impulsionnelle stéréo pour la réverbération
   */
  private updateReverbBuffer(decaySeconds: number): void {
    if (!this.audioCtx || !this.convolverNode) return;
    const rate = this.audioCtx.sampleRate;
    const length = Math.floor(rate * decaySeconds);
    const impulse = this.audioCtx.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.exp(-t * (4 + decaySeconds));
      // Bruit blanc filtré avec décroissance exponentielle et déphasage stéréo
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }

    this.convolverNode.buffer = impulse;
  }

  /**
   * Réglage du volume Master (0..1.5)
   */
  setMasterVolume(val: number): void {
    const clamped = Math.max(0, Math.min(1.5, val));
    this.masterVolume.set(clamped);
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(clamped, this.audioCtx?.currentTime ?? 0, 0.02);
    }
  }

  /**
   * Fournit les données temporelles instantanées (oscilloscope) pour le rendu Canvas
   */
  getWaveformData(outputArray: Uint8Array<ArrayBuffer>): void {
    if (this.masterAnalyser) {
      this.masterAnalyser.getByteTimeDomainData(outputArray);
    } else {
      outputArray.fill(128);
    }
  }

  /**
   * Fournit les données fréquentielles instantanées (spectre FFT) pour le rendu Canvas
   */
  getFrequencyData(outputArray: Uint8Array<ArrayBuffer>): void {
    if (this.masterAnalyser) {
      this.masterAnalyser.getByteFrequencyData(outputArray);
    } else {
      outputArray.fill(0);
    }
  }

  /**
   * Boucle continue d'échantillonnage pour le calcul des Vu-mètres L / R (Peak & RMS)
   */
  private startMeterLoop(): void {
    const tick = () => {
      if (this.analyserLeft && this.analyserRight) {
        this.analyserLeft.getFloatTimeDomainData(this.timeDataBufferLeft);
        this.analyserRight.getFloatTimeDomainData(this.timeDataBufferRight);

        const leftStats = this.calculateMeterStats(this.timeDataBufferLeft);
        const rightStats = this.calculateMeterStats(this.timeDataBufferRight);

        this.meterPeakL.set(leftStats.peak);
        this.meterRmsL.set(leftStats.rms);
        this.meterPeakR.set(rightStats.peak);
        this.meterRmsR.set(rightStats.rms);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Calcule le niveau Crête (Peak) et la valeur Efficace (RMS)
   */
  private calculateMeterStats(buffer: Float32Array): { peak: number; rms: number } {
    let peak = 0;
    let sumSq = 0;
    const len = buffer.length;

    for (let i = 0; i < len; i++) {
      const absVal = Math.abs(buffer[i]);
      if (absVal > peak) {
        peak = absVal;
      }
      sumSq += absVal * absVal;
    }

    const rms = Math.sqrt(sumSq / len);
    // Normalisation lissée entre 0 et 1 (avec une marge au-delà pour le clip)
    return {
      peak: Math.min(1.2, peak),
      rms: Math.min(1.0, rms * 1.4),
    };
  }
}

