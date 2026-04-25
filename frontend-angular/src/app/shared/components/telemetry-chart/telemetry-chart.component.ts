import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

interface ChartPoint {
  value: number;
  label?: string | null;
}

@Component({
  selector: 'app-telemetry-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './telemetry-chart.component.html',
  styleUrl: './telemetry-chart.component.scss'
})
export class TelemetryChartComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
  readonly tone = input<'teal' | 'amber' | 'rose'>('teal');
  readonly unit = input<string>('');
  readonly points = input<ChartPoint[]>([]);

  readonly path = computed(() => {
    const points = this.points();
    if (!points.length) return '';

    const values = points.map((point) => Number(point.value || 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);

    return values
      .map((value, index) => {
        const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 76 - 12;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  });

  readonly areaPath = computed(() => {
    const line = this.path();
    if (!line) return '';
    return `${line} L 100 100 L 0 100 Z`;
  });

  readonly peakValue = computed(() => {
    const values = this.points().map((point) => Number(point.value || 0));
    return values.length ? Math.max(...values) : 0;
  });
}
