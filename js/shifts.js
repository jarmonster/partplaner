import { getActiveParty, onShifts, claimShift, TIMES } from './firebase.js';

// ── Auth / session ────────────────────────────────────────
const userName = sessionStorage.getItem('pp_name');
if (!userName) {
  window.location.href = 'index.html';
}

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'index.html';
});

// ── Load active party ─────────────────────────────────────
const titleEl   = document.getElementById('party-title');
const dateEl    = document.getElementById('party-date');
const bannerEl  = document.getElementById('reg-closed-banner');
const container = document.getElementById('shift-container');

let currentParty     = null;
let unsubShifts      = null;
let registrationOpen = false;

async function init() {
  try {
    const party = await getActiveParty();
    if (!party) {
      titleEl.textContent = 'No active party';
      dateEl.textContent  = 'The admin hasn\'t opened a party yet.';
      return;
    }

    currentParty     = party;
    registrationOpen = party.registrationOpen;

    titleEl.textContent = party.name;
    dateEl.textContent  = party.date
      ? new Date(party.date + 'T00:00:00').toLocaleDateString('en-GB', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
      : '';

    bannerEl.style.display = registrationOpen ? 'none' : '';

    // Subscribe to real-time shift updates
    unsubShifts = onShifts(party.id, shifts => {
      registrationOpen = currentParty.registrationOpen;
      renderGrid(shifts);
    });

    // Also watch the party doc itself for registration toggle changes
    // (onShifts doesn't cover party-level changes — use a lightweight poll via re-init)
    // For simplicity, we re-fetch the party every 15s to catch toggle changes.
    setInterval(async () => {
      const updated = await getActiveParty();
      if (!updated) return;
      currentParty     = updated;
      registrationOpen = updated.registrationOpen;
      bannerEl.style.display = registrationOpen ? 'none' : '';
      // Grid re-renders on next shift snapshot, or force re-render:
      const lastShifts = window._lastShifts;
      if (lastShifts) renderGrid(lastShifts);
    }, 15000);

  } catch (err) {
    titleEl.textContent = 'Connection error';
    dateEl.textContent  = 'Check your Firebase configuration.';
    console.error(err);
  }
}

// ── Render grid ───────────────────────────────────────────
function renderGrid(shifts) {
  window._lastShifts = shifts;

  const index = {};
  shifts.forEach(s => { index[`${s.role}_${s.time}`] = s; });

  container.innerHTML = `
    <div class="shift-grid">
      <div class="shift-grid__header">Time</div>
      <div class="shift-grid__header">Bar</div>
      <div class="shift-grid__header">Shot Shift</div>
      ${TIMES.map(time => `
        <div class="shift-grid__time">${time}</div>
        ${['bar','shot'].map(role => cellHtml(index, role, time)).join('')}
      `).join('')}
    </div>
  `;

  // Attach sign-up handlers
  container.querySelectorAll('.js-signup').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { role, time } = btn.dataset;
      btn.disabled = true;
      btn.textContent = '…';
      try {
        await claimShift(currentParty.id, role, time, userName);
      } catch {
        btn.disabled = false;
        btn.textContent = 'Sign up';
        alert('That slot was just taken. Please choose another.');
      }
    });
  });
}

function cellHtml(index, role, time) {
  const slot   = index[`${role}_${time}`];
  const person = slot?.person ?? null;

  if (person) {
    // Taken — highlight if it's the current user
    const isSelf = person.toLowerCase() === userName.toLowerCase();
    return `
      <div class="shift-grid__cell">
        <span class="${isSelf ? '' : 'shift-taken'}" style="${isSelf ? 'color:var(--accent);' : ''}">
          ${escHtml(person)}${isSelf ? ' (you)' : ''}
        </span>
      </div>`;
  }

  if (!registrationOpen) {
    return `<div class="shift-grid__cell"><span class="shift-locked">🔒</span></div>`;
  }

  return `
    <div class="shift-grid__cell">
      <button class="btn btn-ghost btn-sm js-signup" data-role="${role}" data-time="${time}">
        Sign up
      </button>
    </div>`;
}

// ── Utility ───────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

init();
