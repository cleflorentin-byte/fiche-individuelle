// ---------------------------------------------------------------------------
// Règles de calcul extraites de l'accord collectif du 07/06/2016 (SNCF Réseau)
// Titre II (personnel sédentaire), art. 38 §5 (agents de réserve), 7h45/j.
// Périmètre couvert : régime "Service non fixé" agent de réserve.
// À étendre si d'autres régimes de travail doivent être pris en charge.
// ---------------------------------------------------------------------------

export function timeToMin(str) {
  if (!str) return null;
  const raw = str.split(" ")[0]; // ignorer les annotations type "(AECP)"
  const parts = raw.split(":");
  if (parts.length < 2) return null;
  const h = parseFloat(parts[0]);
  const m = parseFloat(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function intervalOverlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// Période nocturne Titre II : 21h30-6h30 (art. 23 §6).
// Calcul par chevauchement d'intervalles, gère le passage à minuit dans les
// deux sens. Les horaires de prise/fin varient selon le LPA : on ne fige
// donc aucun horaire type, seul le chevauchement réel PS/FS x fenêtre
// nocturne compte.
export function calcNightMinutes(schedule) {
  const ps = (schedule || []).find(([tag]) => tag === "PS");
  const fs = (schedule || []).find(([tag]) => tag === "FS");
  if (!ps || !fs) return 0;
  const psMin = timeToMin(ps[1]);
  let fsMin = timeToMin(fs[1]);
  if (psMin === null || fsMin === null) return 0;
  if (fsMin <= psMin) fsMin += 1440; // service traversant minuit
  const NIGHT_WINDOWS = [
    [-150, 390], // 21h30 (veille) -> 6h30
    [1290, 1830], // 21h30 (jour même) -> 6h30 (lendemain)
  ];
  let nightMin = 0;
  NIGHT_WINDOWS.forEach(([ws, we]) => {
    nightMin += intervalOverlap(psMin, fsMin, ws, we);
  });
  return Math.round(nightMin);
}

// RN : 2% des minutes nocturnes (art. 54, Titre II)
export function calcRNDeltaMin(schedule) {
  return Math.round(calcNightMinutes(schedule) * 0.02);
}

// Durée effective en minutes (PS -> FS moins coupures K)
export function calcServiceDuration(schedule) {
  const ps = (schedule || []).find(([tag]) => tag === "PS");
  const fs = (schedule || []).find(([tag]) => tag === "FS");
  if (!ps || !fs) return null;
  const start = timeToMin(ps[1]);
  let end = timeToMin(fs[1]);
  if (start === null || end === null) return null;
  if (end <= start) end += 1440;
  let duration = end - start;
  (schedule || [])
    .filter(([tag]) => tag === "K")
    .forEach(([, val]) => {
      const parts = val.split(/[ –-]/).filter(Boolean);
      if (parts.length >= 2) {
        const ks = timeToMin(parts[0]);
        let ke = timeToMin(parts[1]);
        if (ks !== null && ke !== null) {
          if (ke <= ks) ke += 1440;
          duration -= ke - ks;
        }
      }
    });
  return Math.max(0, duration);
}

// TQ : dépassement vs 7h45 = 465 min (art. 51)
export function calcTQDeltaMin(schedule) {
  const dur = calcServiceDuration(schedule);
  if (dur === null) return 0;
  return Math.max(0, dur - 465);
}

// CT : 1 repos pour 38 journées travaillées (art. 55 + 38 §5)
export const CT_JOURNEES_PAR_REPOS = 38;

export function fmtMin(minutes) {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${h}h${String(m).padStart(2, "0")}`;
}

// Compteurs potentiellement impactés par un changement de jour (sans valeur)
export function computeImpacts(oldDay, newDay) {
  const impacts = new Set();
  if (!oldDay || !newDay) return [];
  const catChanged = oldDay.category !== newDay.category;
  const codeChanged = oldDay.code !== newDay.code;
  if (!catChanged && !codeChanged) return [];
  if (oldDay.category === "repos" || newDay.category === "repos") {
    ["RP", "RD", "RPSD", "WERP", "WE"].forEach((c) => impacts.add(c));
  }
  if (oldDay.category === "syndical" || newDay.category === "syndical") {
    impacts.add("AH");
  }
  if (oldDay.category === "travail" || newDay.category === "travail") {
    impacts.add("TQ");
    impacts.add("CT");
    const oldNight = calcNightMinutes(oldDay.schedule || []);
    const newNight = calcNightMinutes(newDay.schedule || []);
    if (oldNight > 0 || newNight > 0) impacts.add("RN");
  }
  if (oldDay.category === "compteur" || newDay.category === "compteur") {
    impacts.add("TQ");
    impacts.add("CT");
  }
  return [...impacts];
}

// Delta théorique des compteurs calculables automatiquement
export function computeCounterDeltas(oldDay, newDay) {
  const deltas = {};
  const wasWork = oldDay.category === "travail";
  const isWork = newDay.category === "travail";
  const wasRepos = oldDay.category === "repos";
  const isRepos = newDay.category === "repos";

  const oldTQ = wasWork ? calcTQDeltaMin(oldDay.schedule || []) : 0;
  const newTQ = isWork ? calcTQDeltaMin(newDay.schedule || []) : 0;
  if (oldTQ !== newTQ) deltas.TQ = fmtMin(newTQ - oldTQ);

  const oldRN = wasWork ? calcRNDeltaMin(oldDay.schedule || []) : 0;
  const newRN = isWork ? calcRNDeltaMin(newDay.schedule || []) : 0;
  if (oldRN !== newRN) deltas.RN = fmtMin(newRN - oldRN);

  if (wasWork !== isWork) {
    deltas.CT = isWork ? `+1/${CT_JOURNEES_PAR_REPOS} j` : `-1/${CT_JOURNEES_PAR_REPOS} j`;
  }

  if (wasRepos && !isRepos) deltas.RP = "-1";
  if (!wasRepos && isRepos) deltas.RP = "+1";

  return deltas;
}
