import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, FileCheck, UserCheck } from "lucide-react";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { ORANGE, GREEN, SLATE, INK, CREAM } from "../lib/categories";
import { MONTH_NAMES } from "../lib/dateUtils";

const FIELD_LABELS = {
  rp: "RP — Repos périodique",
  rd: "RD — Repos double",
  rpsd: "RPSD — Repos Sam+Dim",
  we: "WE — Dim accolé Sam/Lun",
  rn: "RN — Repos compensateur nuit",
  tq: "TQ — Temps à compenser semestre",
  rq: "RQ — Temps RQ",
  ru: "RU — Repos supplémentaire",
  ct: "CT — Compte temps",
  conges_n1: "Congés reliquat N-1",
  conges_n: "Congés dotation année en cours",
};

export default function ImportSalarie() {
  const { session, profile, loading } = useSessionProfile();
  const [state, setState] = useState("idle"); // idle | loading | review | saving | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { agent, compteurs }
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
  const [editableCompteurs, setEditableCompteurs] = useState({});

  async function handleFile(file) {
    setState("loading");
    setError(null);
    setResult(null);

    const SUPPORTED_TYPES = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError("Format non supporté. Utilise un fichier PDF ou Word (.docx) exporté depuis l'interface salarié SNCF.");
      setState("error");
      return;
    }

    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/parse-salarie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, mimeType: file.type }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erreur d'extraction");

      const { parsed } = body;

      // Pré-remplir le mois/année si détectés dans le document
      if (parsed.agent?.periode) {
        const parts = parsed.agent.periode.split("/");
        if (parts.length === 2) {
          const m = parseInt(parts[0], 10);
          const y = parseInt(parts[1], 10);
          if (!isNaN(m) && m >= 1 && m <= 12) setTargetMonth(m);
          if (!isNaN(y) && y >= 2020) setTargetYear(y);
        }
      }

      setResult(parsed);
      setEditableCompteurs(parsed.compteurs || {});
      setState("review");
    } catch (err) {
      setError(err.message || "Erreur inconnue lors du parsing");
      setState("error");
    }
  }

  async function handleApply() {
    setState("saving");
    const payload = {
      user_id: session.user.id,
      year: targetYear,
      month: targetMonth,
      data: editableCompteurs,
    };
    const { error: upsertError } = await supabase
      .from("fia_months")
      .upsert(payload, { onConflict: "user_id,year,month" });

    if (upsertError) {
      setError(upsertError.message);
      setState("error");
    } else {
      setState("done");
    }
  }

  if (loading) return null;

  return (
    <Layout
      title="Import données salarié"
      subtitle="Remplissage automatique de la FIA depuis un document SNCF"
      current="/import-salarie"
      profile={profile}
    >
      {/* Explication */}
      <div className="rounded-lg p-4 mb-5" style={{ background: "#E8F0E6", border: `1px solid ${GREEN}` }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "#2F4A37" }}>Comment ça marche ?</p>
        <p className="text-sm" style={{ color: "#2F4A37" }}>
          Télécharge n'importe quel document officiel SNCF contenant tes compteurs : export de l'interface salarié
          (ESS / HR Access), FIA scannée, Chronotime, ou tout autre document RH.
          L'outil lit le document automatiquement et pré-remplit ta fiche FIA — tu peux vérifier et corriger avant
          d'enregistrer.
        </p>
        <p className="text-xs mt-2 opacity-70" style={{ color: "#2F4A37" }}>
          Formats acceptés : PDF ou Word (.docx). Taille max : 10 Mo.
        </p>
      </div>

      {/* Zone de dépôt */}
      {(state === "idle" || state === "error") && (
        <>
          <label
            className="flex flex-col items-center justify-center rounded-xl p-10 cursor-pointer mb-4"
            style={{ border: `2px dashed ${GREEN}`, background: "#F7F3EC" }}
          >
            <UserCheck size={36} style={{ color: GREEN, marginBottom: 12 }} />
            <p className="board-font text-sm uppercase tracking-wide" style={{ color: GREEN }}>
              Déposer le document SNCF (PDF ou Word)
            </p>
            <p className="text-xs opacity-60 mt-1">ou cliquer pour sélectionner un fichier</p>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
            />
          </label>

          {state === "error" && (
            <div className="rounded-lg p-4 mb-4 flex gap-2" style={{ background: "#F7E2DF", border: "1px solid #B23A2E" }}>
              <AlertCircle size={18} style={{ color: "#B23A2E", flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#7A2419" }}>Erreur</p>
                <p className="text-xs mt-0.5" style={{ color: "#7A2419" }}>{error}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Chargement */}
      {state === "loading" && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2"
            style={{ borderColor: GREEN, borderTopColor: "transparent" }} />
          <p className="text-sm opacity-60">Lecture du document en cours…</p>
        </div>
      )}

      {/* Revue + correction */}
      {(state === "review" || state === "saving") && result && (
        <div>
          {/* Informations agent détectées */}
          {result.agent && Object.values(result.agent).some(Boolean) && (
            <div className="rounded-lg p-4 mb-4" style={{ background: "white", border: "1px solid #DCD5C5" }}>
              <p className="board-font text-xs uppercase tracking-widest opacity-60 mb-2">Informations agent détectées</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {result.agent.nom && <div><span className="opacity-50">Nom : </span>{result.agent.nom} {result.agent.prenom}</div>}
                {result.agent.matricule && <div><span className="opacity-50">Matricule : </span><span className="mono-font">{result.agent.matricule}</span></div>}
                {result.agent.cp_number && <div><span className="opacity-50">N° CP : </span><span className="mono-font">{result.agent.cp_number}</span></div>}
                {result.agent.etablissement && <div><span className="opacity-50">Établissement : </span>{result.agent.etablissement}</div>}
                {result.agent.regime && <div><span className="opacity-50">Régime : </span>{result.agent.regime}</div>}
                {result.agent.periode && <div><span className="opacity-50">Période : </span>{result.agent.periode}</div>}
              </div>
            </div>
          )}

          {/* Sélection du mois cible */}
          <div className="rounded-lg p-4 mb-4" style={{ background: "white", border: "1px solid #DCD5C5" }}>
            <p className="board-font text-xs uppercase tracking-widest opacity-60 mb-2">
              Mois à remplir dans la FIA
            </p>
            <div className="flex gap-3 flex-wrap">
              <select value={targetMonth} onChange={(e) => setTargetMonth(Number(e.target.value))}
                className="text-sm rounded-md px-3 py-2" style={{ border: "1px solid #DCD5C5" }}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input type="number" value={targetYear} onChange={(e) => setTargetYear(Number(e.target.value))}
                className="text-sm rounded-md px-3 py-2 w-24 mono-font" style={{ border: "1px solid #DCD5C5" }} />
            </div>
          </div>

          {/* Compteurs extraits — éditables */}
          <div className="rounded-lg p-4 mb-4" style={{ background: "white", border: "1px solid #DCD5C5" }}>
            <p className="board-font text-xs uppercase tracking-widest opacity-60 mb-3">
              Compteurs extraits — vérifie et corrige si nécessaire
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(FIELD_LABELS).map(([key, label]) => (
                <label key={key} className="text-xs block">
                  <span className="opacity-60 block mb-1">{label}</span>
                  <div className="flex items-center gap-2">
                    <input
                      value={editableCompteurs[key] || ""}
                      onChange={(e) => setEditableCompteurs({ ...editableCompteurs, [key]: e.target.value })}
                      className="w-full text-sm rounded-md px-2 py-1.5 mono-font"
                      style={{ border: "1px solid #DCD5C5" }}
                    />
                    {editableCompteurs[key] && (
                      <CheckCircle2 size={14} style={{ color: GREEN, flexShrink: 0 }} />
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-3 mt-4 flex-wrap">
              <button
                onClick={handleApply}
                disabled={state === "saving"}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md"
                style={{ background: GREEN, color: "white", opacity: state === "saving" ? 0.6 : 1 }}
              >
                <FileCheck size={15} />
                {state === "saving" ? "Enregistrement..." : `Enregistrer dans la FIA — ${MONTH_NAMES[targetMonth - 1]} ${targetYear}`}
              </button>
              <button
                onClick={() => { setState("idle"); setResult(null); }}
                className="text-sm font-medium px-4 py-2 rounded-md"
                style={{ background: "white", color: INK, border: "1px solid #DCD5C5" }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation */}
      {state === "done" && (
        <div className="rounded-lg p-6 text-center" style={{ background: "#E8F0E6", border: `1px solid ${GREEN}` }}>
          <CheckCircle2 size={36} style={{ color: GREEN, margin: "0 auto 12px" }} />
          <p className="board-font text-sm uppercase tracking-wide" style={{ color: "#2F4A37" }}>
            FIA mise à jour — {MONTH_NAMES[targetMonth - 1]} {targetYear}
          </p>
          <p className="text-xs mt-2 opacity-70" style={{ color: "#2F4A37" }}>
            Les compteurs ont été enregistrés. Tu peux les retrouver dans l'onglet "Fiches FIA" et générer le PDF.
          </p>
          <div className="flex gap-3 justify-center mt-4">
            <a href="/fia" className="text-sm font-medium px-4 py-2 rounded-md"
              style={{ background: GREEN, color: "white" }}>
              Voir la FIA
            </a>
            <button
              onClick={() => { setState("idle"); setResult(null); setEditableCompteurs({}); }}
              className="text-sm font-medium px-4 py-2 rounded-md"
              style={{ background: "white", color: INK, border: "1px solid #DCD5C5" }}
            >
              Importer un autre document
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
