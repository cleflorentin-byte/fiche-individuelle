// ---------------------------------------------------------------------------
// Vérification de conformité du bulletin de commande (CPS)
// Accord collectif SNCF sur l'organisation du temps de travail — 07/06/2016
// Périmètre : Titre II — Personnel sédentaire, agent de réserve, art. 38 §5
// Régime : service non fixé 7h45/j, période nocturne 21h30-6h30 (art. 23 §6)
// ---------------------------------------------------------------------------

// Import des fonctions de calcul horaire depuis le module existant
// (copie inline pour éviter les dépendances circulaires côté page)

function timeToMin(str) {
  if (!str) return null;
  const raw = str.split(" ")[0];
  const parts = raw.split(":");
  if (parts.length < 2) return null;
  const h = parseFloat(parts[0]);
  const m = parseFloat(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function intervalOverlap(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function calcNightMinutes(schedule) {
  const ps = (schedule || []).find(([tag]) => tag === "PS");
  const fs = (schedule || []).find(([tag]) => tag === "FS");
  if (!ps || !fs) return 0;
  const psMin = timeToMin(ps[1]);
  let fsMin = timeToMin(fs[1]);
  if (psMin === null || fsMin === null) return 0;
  if (fsMin <= psMin) fsMin += 1440;
  // Fenêtres nocturnes 21h30(1290)-6h30(390+1440=1830) sur frise continue
  const WINDOWS = [[-150, 390], [1290, 1830]];
  return Math.round(WINDOWS.reduce((acc, [ws, we]) => acc + intervalOverlap(psMin, fsMin, ws, we), 0));
}

function calcServiceDuration(schedule) {
  const ps = (schedule || []).find(([tag]) => tag === "PS");
  const fs = (schedule || []).find(([tag]) => tag === "FS");
  if (!ps || !fs) return null;
  const start = timeToMin(ps[1]);
  let end = timeToMin(fs[1]);
  if (start === null || end === null) return null;
  if (end <= start) end += 1440;
  let duration = end - start;
  (schedule || []).filter(([tag]) => tag === "K").forEach(([, val]) => {
    const parts = val.replace(/[–-]/g, " ").split(" ").filter(Boolean);
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

// Poste de nuit (art. 23 §2) : plus de 2h30 dans la période nocturne 21h30-6h30
function isNightPost(day) {
  return calcNightMinutes(day.schedule || []) > 150;
}

function fmtMin(minutes) {
  if (minutes === null || isNaN(minutes)) return "?";
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function dayOfWeek(isoDate) {
  // 0=dim, 1=lun, ..., 6=sam
  return new Date(isoDate + "T00:00:00").getDay();
}

function dateDiffDays(iso1, iso2) {
  return Math.round((new Date(iso2 + "T00:00:00") - new Date(iso1 + "T00:00:00")) / 86400000);
}

// ---------------------------------------------------------------------------
// Fonction principale — reçoit le tableau de jours parsé depuis le bulletin
// CPS (catégorie + horaires déjà classés) et retourne un tableau d'alertes.
// ---------------------------------------------------------------------------
export function checkCPSCompliance(jours) {
  const alerts = [];

  // Trier par date croissante
  const sorted = [...jours].sort((a, b) => a.date.localeCompare(b.date));

  // Séparer les services réels (avec horaires PS/FS) des repos et autres
  const services = sorted.filter(
    (d) => d.category === "travail" && (d.schedule || []).some(([tag]) => tag === "PS")
  );

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 1 — Durée de service journalière (art. 26-1 Titre II)
  // Max 10h (ou 8h30 si >2h30 dans la période nocturne)
  // ──────────────────────────────────────────────────────────────────────────
  for (const day of services) {
    const dur = calcServiceDuration(day.schedule || []);
    if (dur === null) continue;
    const nuit = isNightPost(day);
    const maxDur = nuit ? 510 : 600; // 8h30=510, 10h=600
    if (dur > maxDur) {
      alerts.push({
        level: "error",
        date: day.date,
        code: day.code,
        ref: "Art. 26-1 (Titre II)",
        msg: `Durée de service ${fmtMin(dur)} dépasse le maximum autorisé de ${nuit ? "8h30 (poste de nuit : >2h30 en période nocturne)" : "10h"}.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 2 — Amplitude journalière (art. 28 Titre II) : max 11h
  // Amplitude = FS − PS sans déduire les coupures
  // ──────────────────────────────────────────────────────────────────────────
  for (const day of services) {
    const ps = (day.schedule || []).find(([tag]) => tag === "PS");
    const fs = (day.schedule || []).find(([tag]) => tag === "FS");
    if (!ps || !fs) continue;
    const psMin = timeToMin(ps[1]);
    let fsMin = timeToMin(fs[1]);
    if (psMin === null || fsMin === null) continue;
    if (fsMin <= psMin) fsMin += 1440;
    const amplitude = fsMin - psMin;
    if (amplitude > 660) {
      alerts.push({
        level: "error",
        date: day.date,
        code: day.code,
        ref: "Art. 28 (Titre II)",
        msg: `Amplitude de ${fmtMin(amplitude)} dépasse le maximum de 11h00. PS ${ps[1]} → FS ${fs[1]}.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 3 — Repos journalier entre deux services consécutifs (art. 31 Titre II)
  // Min 12h en règle générale ; 14h si le service précédent est un poste de nuit
  // (poste de nuit = >2h30 dans la période nocturne 21h30-6h30, art. 23 §2)
  // ──────────────────────────────────────────────────────────────────────────
  for (let i = 0; i < services.length - 1; i++) {
    const d1 = services[i];
    const d2 = services[i + 1];
    const fs = (d1.schedule || []).find(([tag]) => tag === "FS");
    const ps2 = (d2.schedule || []).find(([tag]) => tag === "PS");
    if (!fs || !ps2) continue;
    const fsMin = timeToMin(fs[1]);
    const ps2Min = timeToMin(ps2[1]);
    if (fsMin === null || ps2Min === null) continue;
    const diff = dateDiffDays(d1.date, d2.date);
    if (diff <= 0) continue;
    // Écart réel entre fin de service et prise du lendemain
    const gap = diff * 1440 + ps2Min - fsMin;
    const nuit = isNightPost(d1);
    const minRest = nuit ? 840 : 720; // 14h=840, 12h=720
    if (gap < minRest) {
      alerts.push({
        level: "error",
        date: d2.date,
        code: d2.code,
        ref: "Art. 31 (Titre II)",
        msg: `Repos journalier de ${fmtMin(gap)} insuffisant entre le service du ${d1.date} (FS ${fs[1]}) et celui du ${d2.date} (PS ${ps2[1]}). Minimum requis : ${nuit ? "14h00 (service précédent = poste de nuit, art. 23 §2)" : "12h00"}.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 4 — Grande période de travail (art. 34 Titre II)
  // Max 6 jours de service entre deux repos périodiques
  // (Pour les agents de réserve, le repos périodique est tout jour classé "repos")
  // ──────────────────────────────────────────────────────────────────────────
  let consecutif = 0;
  let gptStart = null;
  const JOURS_TRAVAILLES = new Set(["travail", "syndical", "greve", "compteur"]);

  for (const day of sorted) {
    if (day.category === "repos") {
      if (consecutif > 6) {
        alerts.push({
          level: "error",
          date: day.date,
          code: null,
          ref: "Art. 34 (Titre II)",
          msg: `Grande période de travail de ${consecutif} jours depuis le ${gptStart} : dépasse le maximum de 6 jours consécutifs entre deux repos périodiques.`,
        });
      }
      consecutif = 0;
      gptStart = null;
    } else if (JOURS_TRAVAILLES.has(day.category)) {
      if (!gptStart) gptStart = day.date;
      consecutif++;
    }
  }
  // Signaler si la période se termine sur une série non clôturée par un repos
  if (consecutif > 6) {
    alerts.push({
      level: "warning",
      date: null,
      code: null,
      ref: "Art. 34 (Titre II)",
      msg: `Grande période de travail de ${consecutif} jours depuis le ${gptStart} dépassant 6 jours — la période couverte par ce bulletin ne permet pas de vérifier si un repos clôture correctement cette séquence.`,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 5 — Repos Sa+Di mensuel (art. 38 §5 + art. 32-II §V)
  // Les agents de réserve doivent bénéficier chaque mois civil d'au moins
  // un repos périodique placé sur un samedi et un dimanche consécutifs.
  // ──────────────────────────────────────────────────────────────────────────
  const byMonth = {};
  for (const day of sorted) {
    const m = day.date.substring(0, 7);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(day);
  }

  for (const [month, days] of Object.entries(byMonth)) {
    // Ne vérifier que si le bulletin couvre au moins 14 jours du mois
    if (days.length < 14) continue;
    let hasSaDi = false;
    for (let i = 0; i < days.length - 1; i++) {
      const d1 = days[i];
      const d2 = days[i + 1];
      if (d1.category === "repos" && d2.category === "repos") {
        const diff = dateDiffDays(d1.date, d2.date);
        if (diff === 1) {
          const dow1 = dayOfWeek(d1.date); // 6=sam, 0=dim
          const dow2 = dayOfWeek(d2.date);
          if (dow1 === 6 && dow2 === 0) {
            hasSaDi = true;
            break;
          }
        }
      }
    }
    if (!hasSaDi) {
      alerts.push({
        level: "warning",
        date: null,
        code: null,
        ref: "Art. 38 §5 + Art. 32-II §V",
        msg: `Mois de ${month} : aucun repos périodique Sam+Dim consécutifs détecté sur la période couverte. Les agents de réserve doivent bénéficier d'au moins un RPSD par mois.`,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CHECK 6 — Délai de prévenance (art. 24 §2)
  // Toute modification du tableau de roulement requiert 10 jours calendaires de préavis
  // (sauf perturbation prévisible art. L.1222-2 : 24h minimum — art. 24 §2bis)
  // On signale si la période du bulletin commence dans moins de 10 jours
  // ──────────────────────────────────────────────────────────────────────────
  if (sorted.length > 0) {
    const firstDate = sorted[0].date;
    const today = new Date().toISOString().substring(0, 10);
    const daysUntilStart = dateDiffDays(today, firstDate);
    if (daysUntilStart >= 0 && daysUntilStart < 10) {
      alerts.push({
        level: "warning",
        date: firstDate,
        code: null,
        ref: "Art. 24 §2 (Titre II)",
        msg: `Ce bulletin prend effet dans ${daysUntilStart} jour(s) calendaire(s). Le délai réglementaire de prévenance est de 10 jours (sauf perturbation prévisible : 24h minimum). Vérifier si la règle est respectée.`,
      });
    }
  }

  return alerts;
}
