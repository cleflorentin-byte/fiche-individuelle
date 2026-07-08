import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, FileDown } from "lucide-react";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { ORANGE, GREEN, SLATE, CREAM, INK } from "../lib/categories";
import { MONTH_NAMES } from "../lib/dateUtils";

const FIELDS = [
  { key: "rp", label: "RP — Repos périodique (cumul)" },
  { key: "rd", label: "RD — Repos double (cumul)" },
  { key: "rpsd", label: "RPSD — Repos Sam+Dim (cumul)" },
  { key: "we", label: "WE — Dim accolé Sam/Lun (cumul)" },
  { key: "rn", label: "RN — Repos compensateur nuit (solde)" },
  { key: "tq", label: "TQ — Temps à compenser, semestre (solde)" },
  { key: "rq", label: "RQ — Temps RQ (solde)" },
  { key: "ru", label: "RU — Repos supplémentaire (solde)" },
  { key: "ct", label: "CT — Compte temps (solde)" },
  { key: "conges_n1", label: "Congés reliquat année précédente (solde)" },
  { key: "conges_n", label: "Congés dotation année en cours (solde)" },
];

// ---------------------------------------------------------------------------
// Vérification de conformité — accord collectif du 07/06/2016
// Régime : personnel sédentaire, agent de réserve, art. 25§1c, 7h45/j
// ---------------------------------------------------------------------------
function checkConformity(data, month) {
  const alerts = [];
  const ok = [];

  const rp = parseFloat(data.rp);
  const rd = parseFloat(data.rd);
  const rpsd = parseFloat(data.rpsd);
  const we = parseFloat(data.we);
  const ct = parseFloat(data.ct);

  // Art. 38 §5 : agent de réserve = 125 repos/an dont 114 périodiques.
  // Rythme attendu : 114 / 12 ≈ 9,5 RP par mois cumulé.
  const rpAttenduCumul = Math.round((month / 12) * 114 * 10) / 10;
  if (!isNaN(rp)) {
    if (rp < rpAttenduCumul - 3) {
      alerts.push({
        code: "RP",
        ref: "Art. 38 §5 + Art. 32-II",
        msg: `RP cumulé (${rp}) inférieur au rythme attendu (${rpAttenduCumul} à fin mois ${month}). Vérifier l'attribution des repos périodiques.`,
      });
    } else {
      ok.push({ code: "RP", msg: `RP cumulé (${rp}) conforme au rythme annuel (114/an).` });
    }
  }

  // Art. 32-II §4 : minimum 52 repos doubles/an ≈ 4,3/mois + 14 RPSD/an.
  const rdAttenduCumul = Math.round((month / 12) * 52 * 10) / 10;
  if (!isNaN(rd) && rd < rdAttenduCumul - 2) {
    alerts.push({
      code: "RD",
      ref: "Art. 32-II §4",
      msg: `Repos doubles cumulés (${rd}) inférieurs au minimum (${rdAttenduCumul} à fin mois ${month}, soit 52/an).`,
    });
  } else if (!isNaN(rd)) {
    ok.push({ code: "RD", msg: `Repos doubles (${rd}) conformes au minimum annuel (52/an).` });
  }

  // Art. 32-II §4 : minimum 14 RPSD/an ≈ 1,2/mois.
  const rpsdAttenduCumul = Math.round((month / 12) * 14 * 10) / 10;
  if (!isNaN(rpsd) && rpsd < rpsdAttenduCumul - 1) {
    alerts.push({
      code: "RPSD",
      ref: "Art. 32-II §4",
      msg: `RPSD cumulés (${rpsd}) inférieurs au minimum (${rpsdAttenduCumul} à fin mois ${month}, soit 14/an dont 12 Sam+Dim consécutifs).`,
    });
  } else if (!isNaN(rpsd)) {
    ok.push({ code: "RPSD", msg: `RPSD (${rpsd}) conformes.` });
  }

  // Art. 55 + 38 §5 : CT ≤ 6 repos/an pour les agents de réserve.
  if (!isNaN(ct) && ct > 6) {
    alerts.push({
      code: "CT",
      ref: "Art. 55 + Art. 38 §5",
      msg: `Compte temps (${ct}) dépasse le plafond annuel de 6 jours pour les agents de réserve. Vérifier le report éventuel (max 7 j reportables N+1 — art. 55 §3).`,
    });
  } else if (!isNaN(ct)) {
    ok.push({ code: "CT", msg: `Compte temps (${ct}) dans le plafond (6/an).` });
  }

  // Art. 32-II §V : minimum 22 dimanches/an accolés à un autre repos.
  const weAttenduCumul = Math.round((month / 12) * 22 * 10) / 10;
  if (!isNaN(we) && we < weAttenduCumul - 2) {
    alerts.push({
      code: "WE",
      ref: "Art. 32-II §VII + Art. 18 §3",
      msg: `Dimanches accolés (${we}) inférieurs au minimum (${weAttenduCumul} à fin mois ${month}, soit 22/an).`,
    });
  } else if (!isNaN(we)) {
    ok.push({ code: "WE", msg: `Dimanches accolés (${we}) conformes (minimum 22/an).` });
  }

  return { alerts, ok };
}

// ---------------------------------------------------------------------------
// Génération PDF via impression navigateur (sans dépendance externe)
// ---------------------------------------------------------------------------
function exportPdf(data, year, month, agentName) {
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const fields = FIELDS.map((f) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;color:#666">${f.label}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:12px;font-family:monospace;font-weight:600;text-align:right">${data[f.key] || "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>FIA ${monthLabel} — ${agentName}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1C1A17; margin: 0; padding: 24px; }
  header { background: #1F2B30; color: white; padding: 14px 20px; border-top: 4px solid #E2611B; margin-bottom: 24px; }
  header p { margin: 0; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #E2611B; }
  header h1 { margin: 4px 0 0; font-size: 20px; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #1F2B30; color: white; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .agent { font-size: 12px; color: #666; margin-bottom: 16px; }
  .footer { margin-top: 32px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
<header>
  <p>CFDT EIC LORCA</p>
  <h1>Fiche individuelle d'utilisation — ${monthLabel}</h1>
</header>
<p class="agent">Agent : <strong>${agentName}</strong> · Régime : Service non fixé 7h45/j · Affectation : IN Varangeville PSV</p>
<table>
  <tr><th>Compteur</th><th style="text-align:right">Valeur (fin de mois)</th></tr>
  ${fields}
</table>
<div class="footer">
  Document généré le ${new Date().toLocaleDateString("fr-FR")} · Outil CFDT EIC LORCA · 
  Accord collectif temps de travail du 07/06/2016 · Données saisies par l'agent.
</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

export default function Fia() {
  const { session, profile, loading } = useSessionProfile();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [form, setForm] = useState({});
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showConformity, setShowConformity] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetchHistory();
    fetchCurrent();
    setSaved(false);
    setShowConformity(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, year, month]);

  async function fetchHistory() {
    const { data, error } = await supabase
      .from("fia_months")
      .select("*")
      .eq("user_id", session.user.id)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (!error && data) setHistory(data);
  }

  async function fetchCurrent() {
    const { data } = await supabase
      .from("fia_months")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    setForm(data?.data || {});
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const payload = { user_id: session.user.id, year, month, data: form };
    const { error } = await supabase.from("fia_months").upsert(payload, { onConflict: "user_id,year,month" });
    setSaving(false);
    if (!error) {
      setSaved(true);
      fetchHistory();
    }
  }

  const conformity = showConformity ? checkConformity(form, month) : null;

  if (loading) return null;

  return (
    <Layout title="Fiches FIA" subtitle="Saisie manuelle des compteurs mensuels" current="/fia" profile={profile}>
      <div className="rounded-lg p-4 mb-5" style={{ background: "#FBE9DF", border: `1px solid ${ORANGE}` }}>
        <p className="text-sm" style={{ color: "#7A3210" }}>
          La direction n'éditant plus les FIA depuis le 1er juillet 2026, ces valeurs sont à reporter depuis ta dernière
          fiche officielle puis à tenir à jour mois après mois. Tu peux aussi utiliser l'onglet{" "}
          <strong>Import données salarié</strong> pour remplir automatiquement depuis un document SNCF.
        </p>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
          className="text-sm rounded-md px-3 py-2" style={{ border: "1px solid #DCD5C5" }}>
          {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm rounded-md px-3 py-2 w-24 mono-font" style={{ border: "1px solid #DCD5C5" }} />
      </div>

      <div className="rounded-lg p-4 mb-5" style={{ background: "white", border: "1px solid #DCD5C5" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs block">
              <span className="opacity-60 block mb-1">{f.label}</span>
              <input value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full text-sm rounded-md px-2 py-1.5 mono-font" style={{ border: "1px solid #DCD5C5" }} />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button onClick={handleSave} disabled={saving} className="text-sm font-medium px-4 py-2 rounded-md"
            style={{ background: GREEN, color: "white", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Enregistrement..." : "Enregistrer ce mois"}
          </button>

          {saved && (
            <>
              <span className="text-xs flex items-center gap-1" style={{ color: GREEN }}>
                <CheckCircle2 size={14} /> Enregistré
              </span>
              <button
                onClick={() => exportPdf(form, year, month, profile?.full_name || "Agent")}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md"
                style={{ background: SLATE, color: "white" }}>
                <FileDown size={15} /> Exporter en PDF
              </button>
              <button
                onClick={() => setShowConformity((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md"
                style={{ background: "#EDEAF2", color: "#382F4D", border: "1px solid #5C5470" }}>
                <CheckCircle2 size={15} /> Vérifier la conformité (accord 07/06/2016)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bloc conformité */}
      {showConformity && conformity && (
        <div className="rounded-lg p-4 mb-5" style={{ border: "1px solid #DCD5C5", background: "white" }}>
          <p className="board-font text-xs uppercase tracking-widest mb-3" style={{ color: SLATE }}>
            Vérification de conformité — accord collectif 07/06/2016
          </p>
          <p className="text-xs opacity-60 mb-3">
            Régime : personnel sédentaire, agent de réserve (art. 38 §5), 7h45/j. Calculs effectués sur la base
            de {month} mois écoulés dans l'année.
          </p>

          {conformity.alerts.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold mb-2" style={{ color: "#B23A2E" }}>⚠ Alertes</p>
              {conformity.alerts.map((a) => (
                <div key={a.code} className="flex gap-2 items-start mb-2 rounded-md p-3"
                  style={{ background: "#F7E2DF", border: "1px solid #B23A2E" }}>
                  <AlertTriangle size={15} style={{ color: "#B23A2E", flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#7A2419" }}>
                      {a.code} <span className="font-normal opacity-70">— {a.ref}</span>
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#7A2419" }}>{a.msg}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {conformity.ok.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: GREEN }}>✓ Points conformes</p>
              {conformity.ok.map((o) => (
                <div key={o.code} className="flex gap-2 items-start mb-1">
                  <CheckCircle2 size={14} style={{ color: GREEN, flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs" style={{ color: "#2F4A37" }}>
                    <strong>{o.code}</strong> — {o.msg}
                  </p>
                </div>
              ))}
            </div>
          )}

          {conformity.alerts.length === 0 && conformity.ok.length === 0 && (
            <p className="text-xs opacity-60">Renseigne au moins RP, RD, RPSD, WE et CT pour lancer la vérification.</p>
          )}
        </div>
      )}

      {/* Historique */}
      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #DCD5C5" }}>
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr style={{ background: SLATE }}>
              <th className="text-left px-3 py-2 text-white uppercase tracking-wide text-[11px]">Mois</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">
                  {f.key.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.id} style={{ background: i % 2 === 0 ? "white" : "#FBF9F4" }}>
                <td className="px-3 py-2 font-medium mono-font whitespace-nowrap">
                  {MONTH_NAMES[h.month - 1].slice(0, 4)}. {h.year}
                </td>
                {FIELDS.map((f) => (
                  <td key={f.key} className="px-3 py-2 text-right mono-font">{h.data?.[f.key] || "—"}</td>
                ))}
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={FIELDS.length + 1} className="px-3 py-6 text-center text-sm opacity-50">
                  Aucun mois enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
