// ============================================================
// SUPABASE CONFIGURATION
// ============================================================
// The anon key below is a PUBLIC key — it is safe to commit.
// Access is controlled by Row Level Security (RLS) in Supabase.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://lymahxqaujxtuvkmtaio.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5bWFoeHFhdWp4dHV2a210YWlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMjQ1MzgsImV4cCI6MjA5MTYwMDUzOH0.gXITtlg2i5IAdAGSW3oxRFxMymphHYCF9PW5cv1kUVM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// TIME SLOTS
// ============================================================

export const DEFAULT_TIMES = [
  '21:00','21:30','22:00','22:30',
  '23:00','23:30','00:00','00:30',
  '01:00','01:30','02:00','02:30',
];

export const ROLES = ['bar', 'shot'];

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
// REAL-TIME HELPERS
// ============================================================

let _channelId = 0;

function realtimeList(table, fetchFn, callback) {
  let active = true;

  async function refresh() {
    if (!active) return;
    try {
      const data = await fetchFn();
      if (active) callback(data);
    } catch (err) {
      console.error(`[realtime ${table}]`, err);
    }
  }

  refresh();

  const channel = supabase
    .channel(`${table}-${++_channelId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => refresh())
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

function realtimeRecord(table, id, callback) {
  let active = true;

  async function refresh() {
    if (!active) return;
    try {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      if (error) throw error;
      if (active) callback(data);
    } catch (err) {
      console.error(`[realtime ${table}/${id}]`, err);
    }
  }

  refresh();

  const channel = supabase
    .channel(`${table}-${id}-${++_channelId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter: `id=eq.${id}` }, () => refresh())
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

// ============================================================
// PARTIES
// ============================================================

export async function createParty(name, date) {
  const { data, error } = await supabase
    .from('parties')
    .insert({ name, date, isActive: false, registrationOpen: false, times: DEFAULT_TIMES })
    .select()
    .single();

  if (error) throw error;

  await _generateShifts(data.id, DEFAULT_TIMES);
  return data.id;
}

async function _generateShifts(partyId, times) {
  const rows = [];
  for (const role of ROLES) {
    for (const time of times) {
      rows.push({ partyId, role, time, person: null });
    }
  }
  const { error } = await supabase.from('shifts').insert(rows);
  if (error) throw error;
}

export async function getParties() {
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .order('createdAt', { ascending: false });
  if (error) throw error;
  return data;
}

export function onParties(callback) {
  return realtimeList('parties', getParties, callback);
}

export function onParty(partyId, callback) {
  return realtimeRecord('parties', partyId, callback);
}

export async function updateParty(partyId, fields) {
  const { error } = await supabase.from('parties').update(fields).eq('id', partyId);
  if (error) throw error;
}

export async function setActiveParty(partyId) {
  const parties = await getParties();
  await Promise.all(
    parties.map(p => updateParty(p.id, { isActive: p.id === partyId }))
  );
}

export async function deleteParty(partyId) {
  // Shifts are deleted automatically via ON DELETE CASCADE
  const { error } = await supabase.from('parties').delete().eq('id', partyId);
  if (error) throw error;
}

// ============================================================
// TIME SLOT MANAGEMENT (admin)
// ============================================================

export async function addTimeSlot(partyId, time) {
  const { data: party, error } = await supabase
    .from('parties')
    .select('times')
    .eq('id', partyId)
    .single();
  if (error) throw error;

  const times = party.times || DEFAULT_TIMES;
  if (times.includes(time)) throw new Error('Time slot already exists');

  const newTimes = sortTimes([...times, time]);
  await updateParty(partyId, { times: newTimes });
  await _generateShifts(partyId, [time]);
}

export async function removeTimeSlot(partyId, time) {
  const { data: party, error } = await supabase
    .from('parties')
    .select('times')
    .eq('id', partyId)
    .single();
  if (error) throw error;

  const times = (party.times || DEFAULT_TIMES).filter(t => t !== time);
  await updateParty(partyId, { times });

  // Delete shift records for this time slot
  const { error: delErr } = await supabase
    .from('shifts')
    .delete()
    .eq('partyId', partyId)
    .eq('time', time);
  if (delErr) throw delErr;
}

// ============================================================
// SHIFTS
// ============================================================

async function fetchShifts(partyId) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('partyId', partyId);
  if (error) throw error;
  return data;
}

export function onShifts(partyId, callback) {
  return realtimeList('shifts', () => fetchShifts(partyId), callback);
}

export async function claimShift(partyId, role, time, personName) {
  // Find the shift
  const { data: shift, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('partyId', partyId)
    .eq('role', role)
    .eq('time', time)
    .single();

  if (error || !shift) throw new Error('Slot not found');
  if (shift.person) throw new Error('Slot already taken');

  // Check 1-hour limit
  const { data: allShifts } = await supabase
    .from('shifts')
    .select('*')
    .eq('partyId', partyId)
    .eq('role', role);

  const userSlots = (allShifts || []).filter(
    s => s.person && s.person.toLowerCase() === personName.toLowerCase()
  );

  if (userSlots.length >= 2) throw new Error('limit');

  const { error: upErr } = await supabase
    .from('shifts')
    .update({ person: personName })
    .eq('id', shift.id);
  if (upErr) throw upErr;
}

export async function clearShift(partyId, role, time) {
  const { error } = await supabase
    .from('shifts')
    .update({ person: null })
    .eq('partyId', partyId)
    .eq('role', role)
    .eq('time', time);
  if (error) throw error;
}

export async function editShift(partyId, role, time, personName) {
  const { error } = await supabase
    .from('shifts')
    .update({ person: personName || null })
    .eq('partyId', partyId)
    .eq('role', role)
    .eq('time', time);
  if (error) throw error;
}

// ============================================================
// ACTIVE PARTY HELPER
// ============================================================

export async function getActiveParty() {
  const { data, error } = await supabase
    .from('parties')
    .select('*')
    .eq('isActive', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
