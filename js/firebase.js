// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
// SETUP REQUIRED:
//   1. Go to https://console.firebase.google.com
//   2. Create a new project (e.g. "partplaner")
//   3. Click "Add app" → Web → register the app
//   4. Copy the firebaseConfig object below and replace the placeholder values
//   5. Go to Firestore Database → Create database → Start in test mode
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            "REPLACE_WITH_YOUR_API_KEY",
  authDomain:        "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId:         "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ============================================================
// TIME SLOTS
// ============================================================

/** Default time slots when creating a new party */
export const DEFAULT_TIMES = [
  '21:00','21:30','22:00','22:30',
  '23:00','23:30','00:00','00:30',
  '01:00','01:30','02:00','02:30',
];

export const ROLES = ['bar', 'shot'];

export { db };

/** Sort time strings, treating 00:xx–05:xx as after-midnight (24+) */
export function sortTimes(times) {
  return [...times].sort((a, b) => {
    const toMin = t => {
      const [h, m] = t.split(':').map(Number);
      return (h < 6 ? h + 24 : h) * 60 + m;
    };
    return toMin(a) - toMin(b);
  });
}

// ============================================================
// PARTIES
// ============================================================

/** Create a new party with default time slots */
export async function createParty(name, date) {
  const partyRef = await addDoc(collection(db, 'parties'), {
    name,
    date,
    isActive: false,
    registrationOpen: false,
    times: DEFAULT_TIMES,
    createdAt: serverTimestamp(),
  });

  await _generateShifts(partyRef.id, DEFAULT_TIMES);
  return partyRef.id;
}

async function _generateShifts(partyId, times) {
  const batch = [];
  for (const role of ROLES) {
    for (const time of times) {
      batch.push(
        setDoc(doc(db, 'parties', partyId, 'shifts', `${role}_${time.replace(':', '')}`), {
          role,
          time,
          person: null,
        })
      );
    }
  }
  await Promise.all(batch);
}

/** Fetch all parties (newest first) */
export async function getParties() {
  const snap = await getDocs(query(collection(db, 'parties'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Listen for real-time party updates */
export function onParties(callback) {
  return onSnapshot(
    query(collection(db, 'parties'), orderBy('createdAt', 'desc')),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Update fields on a party */
export async function updateParty(partyId, fields) {
  await updateDoc(doc(db, 'parties', partyId), fields);
}

/** Deactivate all parties, then set one as active */
export async function setActiveParty(partyId) {
  const parties = await getParties();
  await Promise.all(
    parties.map(p => updateParty(p.id, { isActive: p.id === partyId }))
  );
}

/** Delete a party and all its shifts */
export async function deleteParty(partyId) {
  const shiftsSnap = await getDocs(collection(db, 'parties', partyId, 'shifts'));
  await Promise.all(shiftsSnap.docs.map(d => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'parties', partyId));
}

// ============================================================
// TIME SLOT MANAGEMENT (admin)
// ============================================================

/** Add a new time slot to a party (creates shift docs for both roles) */
export async function addTimeSlot(partyId, time) {
  const partyRef = doc(db, 'parties', partyId);
  const partySnap = await getDoc(partyRef);
  const times = partySnap.data().times || DEFAULT_TIMES;

  if (times.includes(time)) throw new Error('Time slot already exists');

  const newTimes = sortTimes([...times, time]);
  await updateDoc(partyRef, { times: newTimes });
  await _generateShifts(partyId, [time]);
}

/** Remove a time slot from a party (deletes shift docs for both roles) */
export async function removeTimeSlot(partyId, time) {
  const partyRef = doc(db, 'parties', partyId);
  const partySnap = await getDoc(partyRef);
  const times = (partySnap.data().times || DEFAULT_TIMES).filter(t => t !== time);

  await updateDoc(partyRef, { times });

  await Promise.all(
    ROLES.map(role =>
      deleteDoc(doc(db, 'parties', partyId, 'shifts', `${role}_${time.replace(':', '')}`))
    )
  );
}

// ============================================================
// SHIFTS
// ============================================================

/** Listen for real-time shift updates for a party */
export function onShifts(partyId, callback) {
  return onSnapshot(
    collection(db, 'parties', partyId, 'shifts'),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/**
 * Claim a shift slot.
 * Rules:
 *   - Slot must be empty
 *   - User may hold at most 2 slots (= 1 hour) per role per party
 */
export async function claimShift(partyId, role, time, personName) {
  const shiftId = `${role}_${time.replace(':', '')}`;
  const ref = doc(db, 'parties', partyId, 'shifts', shiftId);

  // Check slot is empty
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().person !== null) {
    throw new Error('Slot already taken');
  }

  // Check 1-hour limit: count existing slots for this user+role
  const allSnap = await getDocs(collection(db, 'parties', partyId, 'shifts'));
  const userSlots = allSnap.docs.filter(d => {
    const s = d.data();
    return s.role === role && s.person?.toLowerCase() === personName.toLowerCase();
  });

  if (userSlots.length >= 2) {
    throw new Error('limit');
  }

  await updateDoc(ref, { person: personName });
}

/** Clear a shift slot (admin only) */
export async function clearShift(partyId, role, time) {
  const shiftId = `${role}_${time.replace(':', '')}`;
  await updateDoc(doc(db, 'parties', partyId, 'shifts', shiftId), { person: null });
}

/** Set a shift slot to a specific person (admin edit) */
export async function editShift(partyId, role, time, personName) {
  const shiftId = `${role}_${time.replace(':', '')}`;
  await updateDoc(doc(db, 'parties', partyId, 'shifts', shiftId), {
    person: personName || null,
  });
}

// ============================================================
// ACTIVE PARTY HELPER
// ============================================================

/** Get the currently active party, or null */
export async function getActiveParty() {
  const snap = await getDocs(
    query(collection(db, 'parties'), where('isActive', '==', true))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}
