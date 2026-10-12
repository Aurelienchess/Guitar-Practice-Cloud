import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-vu-meter',
  imports: [],
  templateUrl: './vu-meter.component.html',
  styleUrl: './vu-meter.component.css',
})
export class VuMeterComponent {
  @Input() peakL = 0; // 0..1+
  @Input() rmsL = 0;  // 0..1
  @Input() peakR = 0; // 0..1+
  @Input() rmsR = 0;  // 0..1

  get rmsPercentL(): number {
    return Math.min(100, Math.max(0, this.rmsL * 100));
  }

  get peakPercentL(): number {
    return Math.min(100, Math.max(0, this.peakL * 100));
  }

  get isClippingL(): boolean {
    return this.peakL >= 0.98;
  }

  get rmsPercentR(): number {
    return Math.min(100, Math.max(0, this.rmsR * 100));
  }

  get peakPercentR(): number {
    return Math.min(100, Math.max(0, this.peakR * 100));
  }

  get isClippingR(): boolean {
    return this.peakR >= 0.98;
  }
}

