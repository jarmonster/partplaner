import {
  createParty,
  onParties,
  onParty,
  updateParty,
  setActiveParty,
  deleteParty,
  onShifts,
  clearShift,
  editShift,
  addTimeSlot,
  removeTimeSlot,
  sortTimes,
} from './firebase.js';

// ── Auth guard ────────────────────────────────────────────
const userName = sessionStorage.getItem('pp_name');
if (!userName || userName.toLowerCase() !== 'jarmonster') {
  window.location.href = 'index.html';
}

// ── Tab switching ─────────────────────────────────────────
const tabs         = document.querySelectorAll('.nav__tab');
const tabParty     = document.getElementById('tab-parties');
const tabCalc      = document.getElementById('tab-calculator');
const tabAnalytics = document.getElementById('tab-analytics');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    tabParty.style.display     = tab.dataset.tab === 'parties'    ? '' : 'none';
    tabCalc.style.display      = tab.dataset.tab === 'calculator' ? '' : 'none';
    tabAnalytics.style.display = tab.dataset.tab === 'analytics'  ? '' : 'none';
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
  partiesList.querySelectorAll('.party-card').forEach(el => el.remove());

  if (parties.length === 0) {
    partiesEmpty.style.display = '';
    return;
  }
  partiesEmpty.style.display = 'none';

  parties.forEach(party => {
    partiesList.appendChild(buildPartyCard(party));
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
    <div class="flex justify-between items-center" style="flex-wrap:wrap; gap:1rem;">
      <div>
        <div class="party-card__title">${escHtml(party.name)}</div>
        <div class="party-card__date">${escHtml(dateFormatted)}</div>
      </div>
      <div class="flex gap-8" style="flex-wrap:wrap;">
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
      <div class="flex gap-8" style="flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm js-view-shifts">View shifts</button>
        <button class="btn btn-danger btn-sm js-delete">Delete</button>
      </div>
    </div>
  `;

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

  card.querySelector('.js-view-shifts').addEventListener('click', () => openShiftModal(party));
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

let _unsubModal    = null; // combined unsub for modal listeners
let currentPartyId = null;

modalClose.addEventListener('click', closeShiftModal);
modal.addEventListener('click', e => { if (e.target === modal) closeShiftModal(); });

function closeShiftModal() {
  modal.style.display = 'none';
  if (_unsubModal) { _unsubModal(); _unsubModal = null; }
  modalBody.innerHTML = '';
  currentPartyId = null;
}

function openShiftModal(initialParty) {
  modalTitle.textContent = `${initialParty.name} – Shifts`;
  currentPartyId = initialParty.id;
  modal.style.display = '';

  // Keep fresh copies updated by their own listeners
  let latestParty  = { ...initialParty };
  let latestShifts = [];

  const unsubParty  = onParty(initialParty.id, freshParty => {
    latestParty = freshParty;
    renderShiftGrid(latestParty, latestShifts);
  });

  const unsubShifts = onShifts(initialParty.id, shifts => {
    latestShifts = shifts;
    renderShiftGrid(latestParty, shifts);
  });

  _unsubModal = () => { unsubParty(); unsubShifts(); };
}

function renderShiftGrid(party, shifts) {
  const times = sortTimes(party.times || currentTimes);
  const index = {};
  shifts.forEach(s => { index[`${s.role}_${s.time}`] = s; });

  modalBody.innerHTML = `
    <!-- Add time slot -->
    <div class="flex gap-8 items-center" style="margin-bottom:2rem; flex-wrap:wrap;">
      <input id="new-time-input" type="time" class="input" style="width:14rem; flex-shrink:0;" />
      <button id="add-time-btn" class="btn btn-ghost btn-sm">+ Add time slot</button>
      <span id="add-time-err" style="color:var(--danger); font-size:1.3rem; display:none;"></span>
    </div>

    <!-- Shift grid -->
    <div class="shift-scroll-wrapper">
      <div class="shift-grid shift-grid--admin">
        <div class="shift-grid__header">Time</div>
        <div class="shift-grid__header">Bar</div>
        <div class="shift-grid__header">Shot Shift</div>
        ${times.map(time => `
          <div class="shift-grid__time">
            <span>${time}</span>
            <button class="btn btn-danger btn-sm js-remove-slot"
              data-time="${time}" title="Remove slot"
              style="margin-left:0.4rem; padding:0.2rem 0.6rem; font-size:1rem;">−</button>
          </div>
          ${['bar','shot'].map(role => adminCellHtml(index, role, time)).join('')}
        `).join('')}
      </div>
    </div>
  `;

  // Add time slot
  document.getElementById('add-time-btn').addEventListener('click', async () => {
    const timeVal = document.getElementById('new-time-input').value;
    const errEl   = document.getElementById('add-time-err');
    if (!timeVal) { errEl.textContent = 'Pick a time first.'; errEl.style.display = ''; return; }

    // Normalise to HH:MM
    const [h, m] = timeVal.split(':');
    const formatted = `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
    errEl.style.display = 'none';
    try {
      await addTimeSlot(party.id, formatted);
      document.getElementById('new-time-input').value = '';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
    }
  });

  // Remove time slot
  modalBody.querySelectorAll('.js-remove-slot').forEach(btn => {
    btn.addEventListener('click', async () => {
      const time = btn.dataset.time;
      // Check both slots are empty
      const barTaken  = index[`bar_${time}`]?.person;
      const shotTaken = index[`shot_${time}`]?.person;
      if (barTaken || shotTaken) {
        if (!confirm(`Slot ${time} has ${[barTaken, shotTaken].filter(Boolean).join(' & ')} signed up. Remove anyway?`)) return;
      }
      await removeTimeSlot(party.id, time);
    });
  });

  // Edit / clear handlers (delegated via data attrs)
  modalBody.querySelectorAll('.js-edit-confirm').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { role, time } = btn.dataset;
      const input = btn.previousElementSibling;
      await editShift(party.id, role, time, input.value.trim());
    });
  });

  modalBody.querySelectorAll('.js-clear').forEach(btn => {
    btn.addEventListener('click', async () => {
      await clearShift(party.id, btn.dataset.role, btn.dataset.time);
    });
  });

  modalBody.querySelectorAll('.js-edit-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const cell    = btn.closest('.shift-grid__cell');
      const display = cell.querySelector('.shift-display');
      const editor  = cell.querySelector('.shift-editor');
      const isEdit  = editor.style.display === '';
      display.style.display = isEdit ? '' : 'none';
      editor.style.display  = isEdit ? 'none' : '';
      if (!isEdit) editor.querySelector('input').focus();
    });
  });
}

function adminCellHtml(index, role, time) {
  const slot   = index[`${role}_${time}`];
  const person = slot?.person ?? null;

  return `
    <div class="shift-grid__cell" style="flex-direction:column; align-items:flex-start; gap:0.6rem;">
      <div class="shift-display" style="display:flex; align-items:center; gap:0.6rem; width:100%;">
        <span class="${person ? 'shift-taken' : 'shift-empty'}" style="${person ? '' : 'color:var(--gray250);'}">
          ${person ? escHtml(person) : '—'}
        </span>
        <div style="margin-left:auto; display:flex; gap:0.4rem;">
          <button class="btn btn-ghost btn-sm js-edit-toggle" data-role="${role}" data-time="${time}"
            title="Edit">✎</button>
          ${person
            ? `<button class="btn btn-danger btn-sm js-clear" data-role="${role}" data-time="${time}"
                title="Clear">✕</button>`
            : ''
          }
        </div>
      </div>
      <div class="shift-editor" style="display:none; width:100%;">
        <div class="flex gap-8" style="width:100%;">
          <input type="text" class="input" style="flex:1; padding:0.6rem 1rem; font-size:1.3rem;"
            placeholder="Name or leave empty" value="${person ? escHtml(person) : ''}" />
          <button class="btn btn-primary btn-sm js-edit-confirm"
            data-role="${role}" data-time="${time}">✓</button>
        </div>
      </div>
    </div>
  `;
}

// ── Utility ───────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
