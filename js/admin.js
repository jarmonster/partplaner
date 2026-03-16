import {
  createParty,
  onParties,
  updateParty,
  setActiveParty,
  deleteParty,
  onShifts,
  clearShift,
  TIMES,
} from './firebase.js';

// ── Auth guard ────────────────────────────────────────────
const userName = sessionStorage.getItem('pp_name');
if (!userName || userName.toLowerCase() !== 'jarmonster') {
  window.location.href = 'index.html';
}

// ── Tab switching ─────────────────────────────────────────
const tabs     = document.querySelectorAll('.nav__tab');
const tabParty = document.getElementById('tab-parties');
const tabCalc  = document.getElementById('tab-calculator');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    tabParty.style.display = tab.dataset.tab === 'parties'    ? '' : 'none';
    tabCalc.style.display  = tab.dataset.tab === 'calculator' ? '' : 'none';
  });
});

// ── Logout ────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'index.html';
});

// ── New party form ────────────────────────────────────────
const newPartyBtn    = document.getElementById('new-party-btn');
const newPartyForm   = document.getElementById('new-party-form');
const savePartyBtn   = document.getElementById('save-party-btn');
const cancelPartyBtn = document.getElementById('cancel-party-btn');
const partyNameInput = document.getElementById('party-name');
const partyDateInput = document.getElementById('party-date');
const partyFormError = document.getElementById('party-form-error');

newPartyBtn.addEventListener('click', () => {
  newPartyForm.style.display = '';
  partyNameInput.focus();
});

cancelPartyBtn.addEventListener('click', () => {
  newPartyForm.style.display = 'none';
  partyNameInput.value = '';
  partyDateInput.value = '';
  partyFormError.style.display = 'none';
});

savePartyBtn.addEventListener('click', async () => {
  const name = partyNameInput.value.trim();
  const date = partyDateInput.value;
  if (!name || !date) {
    partyFormError.textContent = 'Please fill in both fields.';
    partyFormError.style.display = '';
    return;
  }
  partyFormError.style.display = 'none';
  savePartyBtn.disabled = true;
  savePartyBtn.textContent = 'Saving…';
  try {
    await createParty(name, date);
    newPartyForm.style.display = 'none';
    partyNameInput.value = '';
    partyDateInput.value = '';
  } catch (err) {
    partyFormError.textContent = 'Failed to save. Check Firebase config.';
    partyFormError.style.display = '';
    console.error(err);
  } finally {
    savePartyBtn.disabled = false;
    savePartyBtn.textContent = 'Save';
  }
});

// ── Party list (real-time) ────────────────────────────────
const partiesList  = document.getElementById('parties-list');
const partiesEmpty = document.getElementById('parties-empty');

onParties(parties => {
  // Remove existing cards (keep the empty-state div)
  partiesList.querySelectorAll('.party-card').forEach(el => el.remove());

  if (parties.length === 0) {
    partiesEmpty.style.display = '';
    return;
  }
  partiesEmpty.style.display = 'none';

  parties.forEach(party => {
    const card = buildPartyCard(party);
    partiesList.appendChild(card);
  });
});

function buildPartyCard(party) {
  const card = document.createElement('div');
  card.className = 'party-card';
  card.dataset.id = party.id;

  const dateFormatted = party.date
    ? new Date(party.date + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  card.innerHTML = `
    <div class="flex justify-between items-center">
      <div>
        <div class="party-card__title">${escHtml(party.name)}</div>
        <div class="party-card__date">${escHtml(dateFormatted)}</div>
      </div>
      <div class="flex gap-8">
        ${party.isActive
          ? '<span class="badge badge-green">Active</span>'
          : '<span class="badge badge-gray">Inactive</span>'
        }
        ${party.registrationOpen
          ? '<span class="badge badge-green">Reg. Open</span>'
          : '<span class="badge badge-red">Reg. Closed</span>'
        }
      </div>
    </div>

    <div class="party-card__controls">
      <div class="party-card__toggles">
        <label class="toggle">
          <input class="toggle__input" type="checkbox" data-field="isActive" ${party.isActive ? 'checked' : ''} />
          <span class="toggle__track"></span>
          <span class="toggle__label">Set as active party</span>
        </label>
        <label class="toggle">
          <input class="toggle__input" type="checkbox" data-field="registrationOpen" ${party.registrationOpen ? 'checked' : ''} />
          <span class="toggle__track"></span>
          <span class="toggle__label">Registration open</span>
        </label>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-ghost btn-sm js-view-shifts">View shifts</button>
        <button class="btn btn-danger btn-sm js-delete">Delete</button>
      </div>
    </div>
  `;

  // Toggle handlers
  card.querySelectorAll('.toggle__input').forEach(toggle => {
    toggle.addEventListener('change', async () => {
      const field = toggle.dataset.field;
      if (field === 'isActive' && toggle.checked) {
        await setActiveParty(party.id);
      } else {
        await updateParty(party.id, { [field]: toggle.checked });
      }
    });
  });

  // View shifts
  card.querySelector('.js-view-shifts').addEventListener('click', () => {
    openShiftModal(party);
  });

  // Delete
  card.querySelector('.js-delete').addEventListener('click', async () => {
    if (!confirm(`Delete "${party.name}"? This cannot be undone.`)) return;
    await deleteParty(party.id);
  });

  return card;
}

// ── Shift modal ───────────────────────────────────────────
const modal      = document.getElementById('shift-modal');
const modalTitle = document.getElementById('shift-modal-title');
const modalBody  = document.getElementById('shift-modal-body');
const modalClose = document.getElementById('shift-modal-close');

let unsubShifts = null;

modalClose.addEventListener('click', closeShiftModal);
modal.addEventListener('click', e => { if (e.target === modal) closeShiftModal(); });

function closeShiftModal() {
  modal.style.display = 'none';
  if (unsubShifts) { unsubShifts(); unsubShifts = null; }
  modalBody.innerHTML = '';
}

function openShiftModal(party) {
  modalTitle.textContent = `${party.name} – Shifts`;
  modal.style.display = '';

  unsubShifts = onShifts(party.id, shifts => {
    renderShiftGrid(modalBody, party, shifts);
  });
}

function renderShiftGrid(container, party, shifts) {
  // Index shifts by role+time for fast lookup
  const index = {};
  shifts.forEach(s => { index[`${s.role}_${s.time}`] = s; });

  container.innerHTML = `
    <div class="shift-grid">
      <div class="shift-grid__header">Time</div>
      <div class="shift-grid__header">Bar</div>
      <div class="shift-grid__header">Shot Shift</div>
      ${TIMES.map(time => `
        <div class="shift-grid__time">${time}</div>
        ${['bar','shot'].map(role => {
          const slot = index[`${role}_${time}`];
          const person = slot?.person ?? null;
          if (person) {
            return `
              <div class="shift-grid__cell">
                <span class="shift-taken">${escHtml(person)}</span>
                <button class="btn btn-danger btn-sm" style="margin-left:auto;"
                  data-role="${role}" data-time="${time}">✕</button>
              </div>`;
          }
          return `<div class="shift-grid__cell"><span class="shift-empty">—</span></div>`;
        }).join('')}
      `).join('')}
    </div>
  `;

  // Clear-slot buttons
  container.querySelectorAll('[data-role][data-time]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await clearShift(party.id, btn.dataset.role, btn.dataset.time);
    });
  });
}

// ── Utility ───────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
