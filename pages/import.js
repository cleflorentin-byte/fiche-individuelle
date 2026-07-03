import { useState } from "react";
import { Upload, AlertCircle, AlertTriangle, FileCheck } from "lucide-react";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { CATEGORY_STYLES, ORANGE, SLATE, GREEN, INK } from "../lib/categories";
import { guessCategory } from "../lib/categories";
import { computeImpacts, computeCounterDeltas } from "../lib/counters";

export default function Import() {
  const { session, profile, loading } = useSessionProfile();
  const [state, setState] = useState("idle"); // idle | loading | review | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { parsed, changes, allImpacts, fileName }
  const [applying, setApplying] = useState(false);

  async function handleFile(file) {
    setState("loading");
    setError(null);
    setResult(null);
    try {
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Lecture du fichier échouée"));
        reader.readAsDataURL(file);
      });

      const response = await fetch("/api/parse-cps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Erreur d'extraction");

      const parsed = body.parsed;
      const dates = parsed.jours.map((j) => j.date);
      const minDate = dates.reduce((a, b) => (a < b ? a : b));
      const maxDate = dates.reduce((a, b) => (a > b ? a : b));

      const { data: existingRows } = await supabase
        .from("days")
        .select("*")
        .eq("user_id", session.user.id)
        .gte("date", minDate)
        .lte("date", maxDate);

      const existingByDate = {};
      (existingRows || []).forEach((r) => { existingByDate[r.date] = r; });

      const changes = [];
      const allImpacts = new Set();
      parsed.jours.forEach((j) => {
        const existing = existingByDate[j.date] || { date: j.date, category: "none", code: null, libelle: null, schedule: [] };
        const newCategory = guessCategory(j.code);
        const newDay = { date: j.date, category: newCategory, code: j.code, libelle: j.libelle, schedule: j.horaires || [] };
        const hasChange = existing.code !== j.code || existing.category !== newCategory;
        const impacts = hasChange ? computeImpacts(existing, newDay) : [];
        impacts.forEach((i) => allImpacts.add(i));
        changes.push({ existing, newDay, hasChange, impacts });
      });

      setResult({ parsed, changes, allImpacts: [...allImpacts], fileName: file.name });
      setState("review");
    } catch (err) {
      setError(err.message || "Erreur inconnue");
      setState("error");
    }
  }

  async function applyImport() {
    setApplying(true);
    const payloads = result.changes.map(({ newDay }) => ({
      user_id: session.user.id,
      date: newDay.date,
      category: newDay.category,
      code: newDay.code,
      libelle: newDay.libelle,
      schedule: newDay.schedule,
      source: "import_cps",
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await supabase.from("days").upsert(payloads, { onConflict: "user_id,date" });
    setApplying(false);
    if (!upsertError) {
      setState("idle");
      setResult(null);
    } else {
      setError(upsertError.message);
    }
  }

  if (loading) return null;

  return (
    <Layout title="Import CPS" subtitle="Import et mise à jour à partir du bulletin de commande" current="/import" profile={profile}>
      {(state === "idle" || state === "error") && (
        <label className="flex flex-col items-center justify-center rounded-xl p-10 cursor-pointer mb-5" style={{ border: `2px dashed ${ORANGE}`, background: "#FBF9F4" }}>
          <Upload size={36} style={{ color: ORANGE, marginBottom: 12 }} />
          <p className="board-font text-sm uppercase tracking-wide" style={{ color: ORANGE }}>Déposer le bulletin CPS (PDF)</p>
          <p className="text-xs opacity-60 mt-1">ou cliquer pour sélectionner un fichier</p>
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
        </label>
      )}

      {state === "error" && (
        <div className="rounded-lg p-4 mb-5 flex gap-2" style={{ background: "#F7E2DF", border: "1px solid #B23A2E" }}>
          <AlertCircle size={18} style={{ color: "#B23A2E", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#7A2419" }}>Erreur lors de l'extraction</p>
            <p className="text-xs mt-0.5" style={{ color: "#7A2419" }}>{error}</p>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2" style={{ borderColor: ORANGE, borderTopColor: "transparent" }} />
          <p className="text-sm opacity-60">Lecture du bulletin en cours…</p>
        </div>
      )}

      {state === "review" && result && (
        <div>
          <div className="rounded-lg p-4 mb-4" style={{ background: "white", border: "1px solid #DCD5C5" }}>
            <p className="board-font text-xs uppercase tracking-widest opacity-60 mb-1">Bulletin importé</p>
            <p className="text-sm font-medium">{result.fileName}</p>
            <p className="text-xs opacity-60 mt-0.5">
              Période : {result.parsed.periode_debut} → {result.parsed.periode_fin} · {result.parsed.jours.length} jours parsés
            </p>
          </div>

          {result.allImpacts.length > 0 && (
            <div className="rounded-lg p-4 mb-4 flex gap-2" style={{ background: "#FBE9DF", border: `1px solid ${ORANGE}` }}>
              <AlertTriangle size={18} style={{ color: ORANGE, flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#7A3210" }}>Compteurs potentiellement impactés</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.allImpacts.map((c) => (
                    <span key={c} className="mono-font text-xs px-2 py-0.5 rounded" style={{ background: ORANGE, color: "white" }}>{c}</span>
                  ))}
                </div>
                <p className="text-xs mt-1 opacity-70">Calculs automatiques pour TQ/RN/CT/RP (accord 07/06/2016) ; les autres restent à vérifier manuellement.</p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg mb-5" style={{ border: "1px solid #DCD5C5" }}>
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr style={{ background: SLATE }}>
                  <th className="text-left px-3 py-2 text-white text-xs">Date</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Avant</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Après</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Δ Compteurs</th>
                </tr>
              </thead>
              <tbody>
                {result.changes.map(({ existing, newDay, hasChange }, i) => {
                  const deltas = hasChange ? computeCounterDeltas(existing, newDay) : {};
                  return (
                    <tr key={newDay.date} style={{ background: hasChange ? "#FBE9DF" : i % 2 === 0 ? "white" : "#FBF9F4" }}>
                      <td className="px-3 py-2 mono-font whitespace-nowrap">{newDay.date}</td>
                      <td className="px-3 py-2">
                        {existing.code ? (
                          <span className="mono-font font-medium" style={{ color: hasChange ? "#9A9384" : CATEGORY_STYLES[existing.category]?.text }}>{existing.code}</span>
                        ) : (
                          <span className="opacity-40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="mono-font font-semibold" style={{ color: CATEGORY_STYLES[newDay.category]?.text || INK }}>{newDay.code}</span>
                        {hasChange && <span className="ml-1 text-[10px]" style={{ color: ORANGE }}>↑ modifié</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          {Object.entries(deltas).map(([k, v]) => (
                            <span key={k} className="mono-font text-[10px]" style={{ color: v.toString().startsWith("+") ? GREEN : "#B23A2E" }}>
                              {k} {v}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button onClick={applyImport} disabled={applying} className="text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2" style={{ background: GREEN, color: "white", opacity: applying ? 0.6 : 1 }}>
              <FileCheck size={15} /> {applying ? "Application..." : "Appliquer les modifications"}
            </button>
            <button onClick={() => { setState("idle"); setResult(null); }} className="text-sm font-medium px-4 py-2 rounded-md" style={{ background: "white", color: INK, border: "1px solid #DCD5C5" }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
