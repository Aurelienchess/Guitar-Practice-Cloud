import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-knob',
  imports: [],
  templateUrl: './knob.component.html',
  styleUrl: './knob.component.css',
})
export class KnobComponent {
  @Input() label = '';
  @Input() value = 0;
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() unit = '';
  @Input() size = 68; // taille en pixels
  @Input() disabled = false;
  @Input() displayFn?: (val: number) => string;

  @Output() valueChange = new EventEmitter<number>();

  private isDragging = false;
  private startY = 0;
  private startVal = 0;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  get formattedValue(): string {
    if (this.displayFn) {
      return this.displayFn(this.value);
    }
    const val = Number(this.value.toFixed(1));
    return `${val} ${this.unit}`.trim();
  }

  /**
   * Angle de rotation en degrés (de -135° à +135°, total 270°)
   */
  get rotationAngle(): number {
    const range = this.max - this.min;
    if (range <= 0) return 0;
    const norm = Math.max(0, Math.min(1, (this.value - this.min) / range));
    return -135 + norm * 270;
  }

  /**
   * Calcul du tracé SVG pour l'arc de valeur active
   */
  get strokeDashoffset(): number {
    const range = this.max - this.min;
    if (range <= 0) return 188;
    const norm = Math.max(0, Math.min(1, (this.value - this.min) / range));
    // Périmètre d'un cercle R=28: 2 * PI * 28 = 175.9. Arc 270° = 175.9 * 0.75 = 131.9
    const totalArc = 132;
    return totalArc * (1 - norm);
  }

  onMouseDown(e: MouseEvent): void {
    if (this.disabled) return;
    this.isDragging = true;
    this.startY = e.clientY;
    this.startVal = this.value;
    e.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(e: MouseEvent): void {
    if (!this.isDragging || this.disabled) return;
    const deltaY = this.startY - e.clientY; // Glisser vers le haut = augmenter
    const range = this.max - this.min;
    const stepRatio = range / 160; // 160px de déplacement pour balayer toute la plage
    const nextVal = this.startVal + deltaY * stepRatio;
    this.updateValue(nextVal);
  }

  @HostListener('window:mouseup')
  onMouseUp(): void {
    this.isDragging = false;
  }

  onWheel(e: WheelEvent): void {
    if (this.disabled) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? this.step : -this.step;
    this.updateValue(this.value + delta);
  }

  onKeyDown(e: KeyboardEvent): void {
    if (this.disabled) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.updateValue(this.value + this.step);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      this.updateValue(this.value - this.step);
    }
  }

  private updateValue(rawVal: number): void {
    let clamped = Math.max(this.min, Math.min(this.max, rawVal));
    if (this.step > 0) {
      clamped = Math.round(clamped / this.step) * this.step;
      clamped = Math.max(this.min, Math.min(this.max, clamped));
    }
    // Évite les imprécisions flottantes
    const rounded = parseFloat(clamped.toFixed(3));
    if (rounded !== this.value) {
      this.value = rounded;
      this.valueChange.emit(this.value);
    }
  }
}

