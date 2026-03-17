import { onParties } from './firebase.js';

// ── Chart.js global defaults (dark theme) ────────────────
Chart.defaults.color       = '#606060';
Chart.defaults.borderColor = 'rgba(255,255,255,0.08)';
Chart.defaults.font.family = 'Helvetica, Arial, sans-serif';
Chart.defaults.font.size   = 12;

// ── Colour palette ────────────────────────────────────────
const C = {
  max:       '#22c55e',                    // green
  min:       '#ef4444',                    // red
  actual:    '#3b82f6',                    // blue
  effective: '#584dff',                    // purple (dots only)
  minFill:   'rgba(239, 68, 68, 0.08)',    // red area under min
};

// ── State ─────────────────────────────────────────────────
let chartInstance = null;

// ── Real-time subscription ────────────────────────────────
onParties(parties => {
  const sorted = [...parties].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  renderChart(sorted);
});

// ── Chart ─────────────────────────────────────────────────
function renderChart(parties) {
  const card = document.getElementById('analytics-chart-card');

  const hasData = parties.some(p =>
    p.minRevenue != null || p.maxRevenue != null ||
    p.actualRevenue != null || p.inventoryValue != null
  );

  const emptyEl = document.getElementById('analytics-empty');
  if (!hasData) {
    card.style.display  = 'none';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  card.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  const labels = parties.map(p =>
    p.date
      ? new Date(p.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : p.name
  );

  const datasets = [
    // Max expected — green line
    {
      label: 'Max expected',
      data: parties.map(p => p.maxRevenue ?? null),
      borderColor: C.max,
      backgroundColor: C.max,
      pointBackgroundColor: C.max,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: false,
    },
    // Min expected — red line + red fill to zero
    {
      label: 'Min expected',
      data: parties.map(p => p.minRevenue ?? null),
      borderColor: C.min,
      backgroundColor: C.minFill,
      pointBackgroundColor: C.min,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      fill: 'origin',
      spanGaps: false,
    },
    // Actual revenue — blue line
    {
      label: 'Actual revenue',
      data: parties.map(p => p.actualRevenue ?? null),
      borderColor: C.actual,
      backgroundColor: C.actual,
      pointBackgroundColor: C.actual,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: false,
    },
    // Effective revenue (actual + inventory) — purple dots only
    {
      label: 'Effective revenue',
      data: parties.map(p =>
        p.actualRevenue != null && p.inventoryValue != null
          ? p.actualRevenue + p.inventoryValue
          : null
      ),
      borderColor: C.effective,
      backgroundColor: C.effective,
      pointBackgroundColor: C.effective,
      pointRadius: 7,
      pointHoverRadius: 9,
      showLine: false,
      spanGaps: false,
    },
  ];

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#606060',
        padding: 12,
        callbacks: {
          label: ctx => {
            const v = ctx.parsed.y;
            return v == null ? null : ` ${ctx.dataset.label}: € ${v.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#606060', font: { size: 12 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.06)' },
        ticks: { color: '#606060', font: { size: 12 }, callback: v => `€ ${v}` },
        beginAtZero: true,
      },
    },
  };

  if (chartInstance) {
    chartInstance.data.labels   = labels;
    chartInstance.data.datasets = datasets;
    chartInstance.update();
  } else {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    chartInstance = new Chart(ctx, { type: 'line', data: { labels, datasets }, options });
  }
}
