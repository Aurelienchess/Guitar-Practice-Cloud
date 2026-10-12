import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AudioPlayerService } from '../../shared/services/audio-player.service';
import {
  AudioEngineService,
  EQ_BANDS_CONFIG,
  EQ_PRESETS,
  EqPreset,
} from '../../shared/services/audio-engine.service';
import { KnobComponent } from '../../shared/components/knob/knob.component';
import { VuMeterComponent } from '../../shared/components/vu-meter/vu-meter.component';

@Component({
  selector: 'app-studio-page',
  imports: [CommonModule, RouterLink, KnobComponent, VuMeterComponent],
  templateUrl: './studio-page.html',
  styleUrl: './studio-page.css',
})
export class StudioPageComponent implements AfterViewInit, OnDestroy {
  readonly audioPlayer = inject(AudioPlayerService);
  readonly audioEngine = inject(AudioEngineService);

  readonly eqBands = EQ_BANDS_CONFIG;
  readonly presets = EQ_PRESETS;
  readonly activePresetName = signal<string>('Neutre (Flat)');

  readonly visualizerMode = signal<'waveform' | 'spectrum'>('waveform');

  @ViewChild('visualizerCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  private animFrameId: number | null = null;
  private timeBuffer = new Uint8Array(new ArrayBuffer(2048));
  private freqBuffer = new Uint8Array(new ArrayBuffer(1024));

  ngAfterViewInit(): void {
    this.startCanvasAnimation();
  }

  ngOnDestroy(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  // --- Contrôles de lecture ---
  togglePlay(): void {
    this.audioPlayer.togglePlay();
  }

  onSeek(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.audioPlayer.seek(parseFloat(input.value));
  }

  formatTime(secs: number): string {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // --- Égaliseur ---
  onEqChange(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const gainDb = parseFloat(input.value);
    this.audioEngine.setEqBand(index, gainDb);
    this.activePresetName.set('Personnalisé');
  }

  applyPreset(preset: EqPreset): void {
    this.audioEngine.applyEqPreset(preset);
    this.activePresetName.set(preset.name);
  }

  resetEq(): void {
    this.applyPreset(this.presets[0]);
  }

  // --- Balance Panoramique ---
  onPanChange(val: number): void {
    this.audioEngine.setPan(val);
  }

  formatPan(val: number): string {
    if (Math.abs(val) < 0.05) return 'Centre';
    if (val < 0) return `L ${Math.round(Math.abs(val) * 100)}%`;
    return `R ${Math.round(val * 100)}%`;
  }

  // --- Filtre Résonant ---
  setFilterType(type: BiquadFilterType): void {
    this.audioEngine.setFilter({ type });
  }

  toggleFilterBypass(): void {
    this.audioEngine.setFilter({ bypass: !this.audioEngine.filterBypass() });
  }

  onFilterCutoffChange(val: number): void {
    this.audioEngine.setFilter({ cutoff: val });
  }

  onFilterResonanceChange(val: number): void {
    this.audioEngine.setFilter({ resonance: val });
  }

  formatHz(val: number): string {
    if (val >= 1000) return `${(val / 1000).toFixed(1)} kHz`;
    return `${Math.round(val)} Hz`;
  }

  // --- Distorsion ---
  toggleDistortionBypass(): void {
    this.audioEngine.setDistortion({ bypass: !this.audioEngine.distortionBypass() });
  }

  onDistortionDriveChange(val: number): void {
    this.audioEngine.setDistortion({ drive: val });
  }

  // --- Delay / Écho ---
  toggleDelayBypass(): void {
    this.audioEngine.setDelay({ bypass: !this.audioEngine.delayBypass() });
  }

  onDelayTimeChange(val: number): void {
    this.audioEngine.setDelay({ time: val });
  }

  onDelayFeedbackChange(val: number): void {
    this.audioEngine.setDelay({ feedback: val });
  }

  onDelayMixChange(val: number): void {
    this.audioEngine.setDelay({ mix: val });
  }

  formatSeconds(val: number): string {
    return `${Math.round(val * 1000)} ms`;
  }

  formatPercent(val: number): string {
    return `${Math.round(val)} %`;
  }

  // --- Réverbération ---
  toggleReverbBypass(): void {
    this.audioEngine.setReverb({ bypass: !this.audioEngine.reverbBypass() });
  }

  onReverbDecayChange(val: number): void {
    this.audioEngine.setReverb({ decay: val });
  }

  onReverbMixChange(val: number): void {
    this.audioEngine.setReverb({ mix: val });
  }

  // --- Volume Master ---
  onMasterVolumeChange(val: number): void {
    this.audioEngine.setMasterVolume(val);
  }

  // --- Mode Visualiseur ---
  setVisualizerMode(mode: 'waveform' | 'spectrum'): void {
    this.visualizerMode.set(mode);
  }

  // --- Canvas Animation Loop ---
  private startCanvasAnimation(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Fond sombre avec quadrillage subtil style oscilloscope de laboratoire
      ctx.fillStyle = '#08110e';
      ctx.fillRect(0, 0, width, height);

      this.drawOscilloscopeGrid(ctx, width, height);

      if (this.visualizerMode() === 'waveform') {
        this.drawWaveform(ctx, width, height);
      } else {
        this.drawSpectrum(ctx, width, height);
      }

      this.animFrameId = requestAnimationFrame(render);
    };

    this.animFrameId = requestAnimationFrame(render);
  }

  private drawOscilloscopeGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = 'rgba(0, 245, 180, 0.07)';
    ctx.lineWidth = 1;

    // Lignes verticales
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Lignes horizontales
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Ligne centrale horizontale
    ctx.strokeStyle = 'rgba(0, 245, 180, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  private drawWaveform(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.audioEngine.getWaveformData(this.timeBuffer);

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00f5b4';
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f5b4';

    ctx.beginPath();
    const sliceWidth = w / this.timeBuffer.length;
    let x = 0;

    for (let i = 0; i < this.timeBuffer.length; i++) {
      const v = this.timeBuffer[i] / 128.0; // 128 = centre
      const y = (v * h) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();
    ctx.shadowBlur = 0; // Reset ombre
  }

  private drawSpectrum(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.audioEngine.getFrequencyData(this.freqBuffer);

    // Dessin de 64 barres regroupées
    const numBars = 64;
    const barWidth = (w / numBars) - 2;
    const step = Math.floor(this.freqBuffer.length / numBars / 2); // basse et moyenne fréquences privilégiées

    for (let i = 0; i < numBars; i++) {
      const freqVal = this.freqBuffer[i * step] || 0;
      const barHeight = (freqVal / 255) * (h - 20);
      const x = i * (barWidth + 2);
      const y = h - barHeight;

      const grad = ctx.createLinearGradient(0, y, 0, h);
      grad.addColorStop(0, '#00f5b4');
      grad.addColorStop(0.7, '#009d75');
      grad.addColorStop(1, '#0c3529');

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }
}

