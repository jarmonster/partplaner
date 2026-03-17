import { onParties, updateParty } from './firebase.js';

// ── Chart.js global defaults (dark theme) ────────────────
Chart.defaults.color          = '#606060';
Chart.defaults.borderColor    = 'rgba(255,255,255,0.08)';
Chart.defaults.font.family    = 'Helvetica, Arial, sans-serif';
Chart.defaults.font.size      = 12;

// ── Dataset colour palette ────────────────────────────────
const COLORS = {
  max:       '#584dff',
  min:       'rgba(88,77,255,0.4)',
  actual:    '#22c55e',
  inventory: '#f59e0b',
};

// ── State ─────────────────────────────────────────────────
let chartInstance = null;
let latestParties = [];

// ── Real-time subscription ────────────────────────────────
onParties(parties => {
  // Sort chronologically by date
  latestParties = [...parties].sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  renderTable(latestParties);
  renderChart(latestParties);
});

// ── Input table ───────────────────────────────────────────
function renderTable(parties) {
  const wrap = document.getElementById('analytics-table-wrap');
  if (!parties.length) {
    wrap.innerHTML = '<div class="empty-state">No parties yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <table class="analytics-table">
      <thead>
        <tr>
          <th>Party</th>
          <th>Date</th>
          <th style="color:${COLORS.min};">Min expected (€)</th>
          <th style="color:${COLORS.max};">Max expected (€)</th>
          <th style="color:${COLORS.actual};">Actual revenue (€)</th>
          <th style="color:${COLORS.inventory};">Inventory value (€)</th>
        </tr>
      </thead>
      <tbody>
        ${parties.map(p => `
          <tr data-id="${p.id}">
            <td>${escHtml(p.name)}</td>
            <td style="color:var(--gray300);">${p.date ? fmtDate(p.date) : '—'}</td>
            <td><input class="input an-input" type="number" min="0" step="0.01"
              data-field="minRevenue" value="${p.minRevenue ?? ''}" placeholder="—" /></td>
            <td><input class="input an-input" type="number" min="0" step="0.01"
              data-field="maxRevenue" value="${p.maxRevenue ?? ''}" placeholder="—" /></td>
            <td><input class="input an-input" type="number" min="0" step="0.01"
              data-field="actualRevenue" value="${p.actualRevenue ?? ''}" placeholder="—" /></td>
            <td><input class="input an-input" type="number" min="0" step="0.01"
              data-field="inventoryValue" value="${p.inventoryValue ?? ''}" placeholder="—" /></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Save on blur — debounced per cell
  wrap.querySelectorAll('.an-input').forEach(input => {
    input.addEventListener('change', async () => {
      const row     = input.closest('tr');
      const partyId = row.dataset.id;
      const field   = input.dataset.field;
      const val     = input.value.trim() === '' ? null : parseFloat(input.value);
      await updateParty(partyId, { [field]: val });
    });
  });
}

// ── Chart ─────────────────────────────────────────────────
function renderChart(parties) {
  const card = document.getElementById('analytics-chart-card');

  // Only show chart when at least one party has any analytics data
  const hasData = parties.some(p =>
    p.minRevenue != null || p.maxRevenue != null ||
    p.actualRevenue != null || p.inventoryValue != null
  );

  if (!hasData) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const labels = parties.map(p =>
    p.date ? fmtDate(p.date) : escHtml(p.name)
  );

  const datasets = [
    {
      label: 'Max expected',
      data: parties.map(p => p.maxRevenue ?? null),
      borderColor: COLORS.max,
      backgroundColor: COLORS.max,
      pointBackgroundColor: COLORS.max,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: false,
    },
    {
      label: 'Min expected',
      data: parties.map(p => p.minRevenue ?? null),
      borderColor: COLORS.min,
      backgroundColor: COLORS.min,
      pointBackgroundColor: COLORS.min,
      borderWidth: 2,
      borderDash: [6, 3],
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: false,
    },
    {
      label: 'Actual revenue',
      data: parties.map(p => p.actualRevenue ?? null),
      borderColor: COLORS.actual,
      backgroundColor: COLORS.actual,
      pointBackgroundColor: COLORS.actual,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: false,
    },
    {
      label: 'Inventory value',
      data: parties.map(p => p.inventoryValue ?? null),
      borderColor: COLORS.inventory,
      backgroundColor: COLORS.inventory,
      pointBackgroundColor: COLORS.inventory,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.3,
      spanGaps: false,
    },
  ];

  const config = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false }, // using custom legend in HTML
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
          ticks: {
            color: '#606060',
            font: { size: 12 },
            callback: v => `€ ${v}`,
          },
          beginAtZero: true,
        },
      },
    },
  };

  if (chartInstance) {
    chartInstance.data.labels   = labels;
    chartInstance.data.datasets = datasets;
    chartInstance.update();
  } else {
    const ctx = document.getElementById('analytics-chart').getContext('2d');
    chartInstance = new Chart(ctx, config);
  }
}

// ── Utilities ─────────────────────────────────────────────
function fmtDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
