import { getActiveParty, onShifts, claimShift, sortTimes } from './firebase.js';

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

    // Real-time shift updates
    onShifts(party.id, shifts => {
      renderGrid(party, shifts);
    });

    // Poll party doc every 15s to catch registration toggle changes
    setInterval(async () => {
      const updated = await getActiveParty();
      if (!updated) return;
      currentParty     = updated;
      registrationOpen = updated.registrationOpen;
      bannerEl.style.display = registrationOpen ? 'none' : '';
    }, 15000);

  } catch (err) {
    titleEl.textContent = 'Connection error';
    dateEl.textContent  = 'Check your Firebase configuration.';
    console.error(err);
  }
}

// ── Render grid ───────────────────────────────────────────
function renderGrid(party, shifts) {
  const times = sortTimes(party.times || []);
  const index = {};
  shifts.forEach(s => { index[`${s.role}_${s.time}`] = s; });

  // Count this user's existing slots per role for the limit indicator
  const userBarCount  = shifts.filter(s => s.role === 'bar'  && s.person?.toLowerCase() === userName.toLowerCase()).length;
  const userShotCount = shifts.filter(s => s.role === 'shot' && s.person?.toLowerCase() === userName.toLowerCase()).length;

  container.innerHTML = `
    <div class="shift-scroll-wrapper">
      <div class="shift-grid">
        <div class="shift-grid__header">Time</div>
        <div class="shift-grid__header">
          Bar
          <span class="slot-counter">${userBarCount}/2</span>
        </div>
        <div class="shift-grid__header">
          Shot Shift
          <span class="slot-counter">${userShotCount}/2</span>
        </div>
        ${times.map(time => `
          <div class="shift-grid__time">${time}</div>
          ${['bar','shot'].map(role => cellHtml(index, role, time, userBarCount, userShotCount)).join('')}
        `).join('')}
      </div>
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
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Sign up';
        if (err.message === 'limit') {
          alert(`You already have 1 hour (2 slots) in the ${role === 'bar' ? 'Bar' : 'Shot Shift'} — maximum reached.`);
        } else {
          alert('That slot was just taken. Please choose another.');
        }
      }
    });
  });
}

function cellHtml(index, role, time, userBarCount, userShotCount) {
  const slot    = index[`${role}_${time}`];
  const person  = slot?.person ?? null;
  const isSelf  = person?.toLowerCase() === userName.toLowerCase();
  const atLimit = role === 'bar' ? userBarCount >= 2 : userShotCount >= 2;

  if (person) {
    return `
      <div class="shift-grid__cell">
        <span style="${isSelf ? 'color:var(--accent);' : 'color:var(--gray300);'}">
          ${escHtml(person)}${isSelf ? ' (you)' : ''}
        </span>
      </div>`;
  }

  if (!registrationOpen) {
    return `<div class="shift-grid__cell"><span class="shift-locked">🔒</span></div>`;
  }

  if (atLimit) {
    return `<div class="shift-grid__cell"><span style="color:var(--gray250); font-size:1.2rem;">Max reached</span></div>`;
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
