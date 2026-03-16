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
const TIMES = [
  '21:00','21:30','22:00','22:30',
  '23:00','23:30','00:00','00:30',
  '01:00','01:30','02:00','02:30',
];
const ROLES = ['bar', 'shot'];

export { db, TIMES, ROLES };

// ============================================================
// PARTIES
// ============================================================

/** Create a new party and pre-generate all 24 shift slots */
export async function createParty(name, date) {
  const partyRef = await addDoc(collection(db, 'parties'), {
    name,
    date,
    isActive: false,
    registrationOpen: false,
    createdAt: serverTimestamp(),
  });

  // Pre-generate shifts
  const batch = [];
  for (const role of ROLES) {
    for (const time of TIMES) {
      batch.push(
        setDoc(doc(db, 'parties', partyRef.id, 'shifts', `${role}_${time.replace(':', '')}`), {
          role,
          time,
          person: null,
        })
      );
    }
  }
  await Promise.all(batch);
  return partyRef.id;
}

/** Fetch all parties (array, newest first) */
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

/** Update fields on a party (e.g. isActive, registrationOpen) */
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
// SHIFTS
// ============================================================

/** Listen for real-time shift updates for a party */
export function onShifts(partyId, callback) {
  return onSnapshot(
    collection(db, 'parties', partyId, 'shifts'),
    snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Claim a shift slot — only if currently empty */
export async function claimShift(partyId, role, time, personName) {
  const shiftId = `${role}_${time.replace(':', '')}`;
  const ref = doc(db, 'parties', partyId, 'shifts', shiftId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().person !== null) {
    throw new Error('Slot already taken');
  }
  await updateDoc(ref, { person: personName });
}

/** Clear a shift slot (admin only) */
export async function clearShift(partyId, role, time) {
  const shiftId = `${role}_${time.replace(':', '')}`;
  await updateDoc(doc(db, 'parties', partyId, 'shifts', shiftId), { person: null });
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
