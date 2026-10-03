import { useState, useEffect } from "react";
import {
  Upload, AlertCircle, AlertTriangle, FileCheck,
  CheckCircle2, ShieldAlert, ShieldCheck, Zap, Brain
} from "lucide-react";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { CATEGORY_STYLES, ORANGE, SLATE, GREEN, INK } from "../lib/categories";
import { guessCategory } from "../lib/categories";
import { computeImpacts, computeCounterDeltas } from "../lib/counters";
import { checkCPSCompliance } from "../lib/complianceCPS";

// ─────────────────────────────────────────────────────────────────────────────
// Parseur gratuit — extrait le texte du PDF via PDF.js puis analyse les
// patterns du bulletin CPS SNCF (document machine, structure prédictible).
// ─────────────────────────────────────────────────────────────────────────────

async function extractTextPDFjs(file) {
  const ab = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Regrouper les items par position Y (même ligne = même Y arrondi)
    const byY = {};
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!byY[y]) byY[y] = [];
      byY[y].push({ x: item.transform[4], str: item.str });
    });

    // Trier Y décroissant (haut → bas), X croissant (gauche → droite)
    Object.keys(byY)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach((y) => {
        const line = byY[y]
          .sort((a, b) => a.x - b.x)
          .map((i) => i.str)
          .join(" ")
          .trim();
        if (line) fullText += line + "\n";
      });
  }
  return fullText;
}

function parseCPSText(text) {
  const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

  // Période du bulletin
  let periode_debut = null, periode_fin = null;
  const periodM = text.match(
    /allant du\s+(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/
  );
  if (periodM) {
    periode_debut = periodM[1];
    periode_fin = periodM[2];
  }

  // Segmentation par blocs journaliers
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const segments = [];
  let cur = null;

  const SKIP_RE =
    /SOCIETE NATIONALE|^Page\s*:|BULLETIN DE COMMANDE|Edition le|allant du|^Agent\s*:|^N°\s*CP|Signature|^\*+|^IN\s+BLV|^RPP$/i;

  for (const line of lines) {
    const dm = line.match(DATE_RE);
    if (dm) {
      if (cur) segments.push(cur);
      cur = { iso: `${dm[3]}-${dm[2]}-${dm[1]}`, lines: [] };
    } else if (cur) {
      if (SKIP_RE.test(line)) continue;
      if (line.length <= 1) continue;
      cur.lines.push(line);
    }
  }
  if (cur) segments.push(cur);

  const jours = [];

  for (const { iso, lines: sl } of segments) {
    let code = null, libelle = "";
    const horaires = [];

    for (const line of sl) {
      let m;

      // ── Horaires ─────────────────────────────────────────────────────────
      if ((m = line.match(/^PS\s+(\d{2}:\d{2})/))) {
        horaires.push(["PS", m[1]]); continue;
      }
      if ((m = line.match(/^FS\s+(\d{2}:\d{2})/))) {
        horaires.push(["FS", m[1]]); continue;
      }
      if ((m = line.match(/^K\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/))) {
        horaires.push(["K", `${m[1]} ${m[2]}`]); continue;
      }
      if ((m = line.match(/^PRESENCE\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/))) {
        horaires.push(["Présence", `${m[1]}–${m[2]}`]); continue;
      }
      if ((m = line.match(/^(METRO|DAT)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})/))) {
        horaires.push([m[1], `${m[2]}–${m[3]}`]); continue;
      }

      // ── Code d'utilisation ───────────────────────────────────────────────
      if (!code) {
        // Forme : "CODE Jour" — ex. "DAUTRE Ven", "B57001R Dim", "PVARPSV Lun"
        if ((m = line.match(
          /^([A-Z][A-Z0-9]{0,20})\s+(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\b/
        ))) {
          code = m[1]; continue;
        }
        // Forme : "Jour CODE Description" — ex. "Sam RP Repos périodique"
        if ((m = line.match(
          /^(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\s+([A-Z][A-Z0-9]{0,20})(?:\s+(.+))?/
        ))) {
          code = m[2];
          libelle = (m[3] || "").replace(/RPP$/, "").trim();
          continue;
        }
      }
    }

    if (code) jours.push({ date: iso, code, libelle, horaires });
  }

  return { periode_debut, periode_fin, jours };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function Import() {
  const { session, profile, loading } = useSessionProfile();

  const [mode, setMode] = useState("free"); // "free" | "ai"
  const [pdfReady, setPdfReady] = useState(false);
  const [state, setState] = useState("idle"); // idle | loading | review | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [applying, setApplying] = useState(false);
  const [showCompliance, setShowCompliance] = useState(true);

  // Charger PDF.js depuis CDN (côté client uniquement)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.pdfjsLib) { setPdfReady(true); return; }

    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      setPdfReady(true);
    };
    script.onerror = () => {
      console.warn("PDF.js non chargé — mode gratuit indisponible");
    };
    document.head.appendChild(script);
  }, []);

  // ── Traitement du fichier uploadé ─────────────────────────────────────────
  async function handleFile(file) {
    setState("loading");
    setError(null);
    setResult(null);

    try {
      let parsed;

      if (mode === "free") {
        // ── Mode gratuit : PDF.js + regex ──────────────────────────────────
        if (!pdfReady) throw new Error(
          "PDF.js n'est pas encore chargé. Attends quelques secondes et réessaie."
        );
        const text = await extractTextPDFjs(file);
        parsed = parseCPSText(text);
        if (parsed.jours.length === 0) throw new Error(
          "Aucun jour reconnu dans le bulletin. " +
          "Le format de ce PDF est peut-être atypique — essaie le mode IA."
        );
      } else {
        // ── Mode IA : route API Anthropic ──────────────────────────────────
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
        if (!response.ok) throw new Error(body.error || "Erreur API");
        parsed = body.parsed;
      }

      // ── Comparaison avec les données existantes ────────────────────────
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
      const joursWithCategory = [];

      parsed.jours.forEach((j) => {
        const existing = existingByDate[j.date] || {
          date: j.date, category: "none", code: null, libelle: null, schedule: [],
        };
        const newCategory = guessCategory(j.code);
        const newDay = {
          date: j.date,
          category: newCategory,
          code: j.code,
          libelle: j.libelle || j.code,
          schedule: j.horaires || [],
        };
        joursWithCategory.push(newDay);
        const hasChange = existing.code !== j.code || existing.category !== newCategory;
        const impacts = hasChange ? computeImpacts(existing, newDay) : [];
        impacts.forEach((i) => allImpacts.add(i));
        changes.push({ existing, newDay, hasChange, impacts });
      });

      // ── Vérification de conformité accord 07/06/2016 ──────────────────
      const complianceAlerts = checkCPSCompliance(joursWithCategory);

      setResult({
        parsed,
        changes,
        allImpacts: [...allImpacts],
        fileName: file.name,
        complianceAlerts,
        parsedWithFreeMode: mode === "free",
      });
      setState("review");
    } catch (err) {
      setError(err.message || "Erreur inconnue");
      setState("error");
    }
  }

  // ── Application des modifications ─────────────────────────────────────────
  async function applyImport() {
    setApplying(true);
    const payloads = result.changes.map(({ newDay }) => ({
      user_id: session.user.id,
      date: newDay.date,
      category: newDay.category,
      code: newDay.code,
      libelle: newDay.libelle,
      schedule: newDay.schedule,
      source: result.parsedWithFreeMode ? "import_cps_free" : "import_cps",
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await supabase
      .from("days")
      .upsert(payloads, { onConflict: "user_id,date" });
    setApplying(false);
    if (!upsertError) {
      setState("idle");
      setResult(null);
    } else {
      setError(upsertError.message);
    }
  }

  if (loading) return null;

  const errAlerts = result?.complianceAlerts?.filter((a) => a.level === "error") || [];
  const warnAlerts = result?.complianceAlerts?.filter((a) => a.level === "warning") || [];
  const totalAlerts = errAlerts.length + warnAlerts.length;

  return (
    <Layout
      title="Import CPS"
      subtitle="Import et vérification de conformité du bulletin de commande"
      current="/import"
      profile={profile}
    >
      {/* ── Sélecteur de mode ────────────────────────────────────────────── */}
      {state === "idle" && (
        <div className="rounded-lg p-4 mb-5" style={{ background: "white", border: "1px solid #DCD5C5" }}>
          <p className="board-font text-xs uppercase tracking-widest opacity-60 mb-3">
            Mode d'import
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setMode("free")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium"
              style={
                mode === "free"
                  ? { background: GREEN, color: "white" }
                  : { background: "#E8F0E6", color: "#2F4A37", border: "1px solid #4F7A5B" }
              }
            >
              <Zap size={15} />
              Gratuit — analyse automatique
            </button>
            <button
              onClick={() => setMode("ai")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium"
              style={
                mode === "ai"
                  ? { background: SLATE, color: "white" }
                  : { background: "white", color: INK, border: "1px solid #DCD5C5" }
              }
            >
              <Brain size={15} />
              IA Anthropic — plus robuste (payant)
            </button>
          </div>
          <p className="text-xs opacity-50 mt-2">
            {mode === "free"
              ? "PDF.js lit le bulletin dans ton navigateur, un analyseur de patterns reconnaît les codes et horaires. Gratuit, sans envoi de données à un serveur externe."
              : "Claude lit le PDF côté serveur. Plus fiable sur les formats atypiques. Nécessite ANTHROPIC_API_KEY dans Vercel (~0,02€/import)."}
          </p>
          {mode === "free" && !pdfReady && (
            <p className="text-xs mt-1" style={{ color: ORANGE }}>
              ⏳ PDF.js en cours de chargement…
            </p>
          )}
          {mode === "free" && pdfReady && (
            <p className="text-xs mt-1" style={{ color: GREEN }}>
              ✓ PDF.js prêt
            </p>
          )}
        </div>
      )}

      {/* ── Zone de dépôt ────────────────────────────────────────────────── */}
      {(state === "idle" || state === "error") && (
        <label
          className="flex flex-col items-center justify-center rounded-xl p-10 cursor-pointer mb-5"
          style={{
            border: `2px dashed ${mode === "free" ? GREEN : ORANGE}`,
            background: "#FBF9F4",
            opacity: mode === "free" && !pdfReady ? 0.5 : 1,
            pointerEvents: mode === "free" && !pdfReady ? "none" : "auto",
          }}
        >
          <Upload
            size={36}
            style={{ color: mode === "free" ? GREEN : ORANGE, marginBottom: 12 }}
          />
          <p
            className="board-font text-sm uppercase tracking-wide"
            style={{ color: mode === "free" ? GREEN : ORANGE }}
          >
            Déposer le bulletin CPS (PDF)
          </p>
          <p className="text-xs opacity-60 mt-1">ou cliquer pour sélectionner un fichier</p>
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
          />
        </label>
      )}

      {state === "error" && (
        <div
          className="rounded-lg p-4 mb-5 flex gap-2"
          style={{ background: "#F7E2DF", border: "1px solid #B23A2E" }}
        >
          <AlertCircle size={18} style={{ color: "#B23A2E", flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "#7A2419" }}>
              Erreur lors de l'extraction
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#7A2419" }}>{error}</p>
            <button
              onClick={() => setState("idle")}
              className="text-xs underline mt-1"
              style={{ color: "#7A2419" }}
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {state === "loading" && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div
            className="animate-spin rounded-full h-10 w-10 border-2"
            style={{
              borderColor: mode === "free" ? GREEN : ORANGE,
              borderTopColor: "transparent",
            }}
          />
          <p className="text-sm opacity-60">
            {mode === "free"
              ? "Lecture du PDF dans le navigateur…"
              : "Envoi à l'API Anthropic…"}
          </p>
        </div>
      )}

      {state === "review" && result && (
        <div>
          {/* Résumé */}
          <div
            className="rounded-lg p-4 mb-4"
            style={{ background: "white", border: "1px solid #DCD5C5" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <p className="board-font text-xs uppercase tracking-widest opacity-60">
                Bulletin importé
              </p>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={
                  result.parsedWithFreeMode
                    ? { background: "#E8F0E6", color: "#2F4A37" }
                    : { background: "#E7ECEF", color: "#1C242A" }
                }
              >
                {result.parsedWithFreeMode ? "⚡ Mode gratuit" : "🤖 Mode IA"}
              </span>
            </div>
            <p className="text-sm font-medium">{result.fileName}</p>
            <p className="text-xs opacity-60 mt-0.5">
              Période : {result.parsed.periode_debut} → {result.parsed.periode_fin} ·{" "}
              {result.parsed.jours.length} jours parsés
            </p>
          </div>

          {/* ── Bloc conformité ──────────────────────────────────────────── */}
          <div
            className="rounded-lg overflow-hidden mb-4"
            style={{ border: `1px solid ${totalAlerts > 0 ? "#B23A2E" : GREEN}` }}
          >
            <button
              onClick={() => setShowCompliance((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3"
              style={{ background: totalAlerts > 0 ? "#F7E2DF" : "#E8F0E6" }}
            >
              <div className="flex items-center gap-2">
                {totalAlerts > 0
                  ? <ShieldAlert size={18} style={{ color: "#B23A2E" }} />
                  : <ShieldCheck size={18} style={{ color: GREEN }} />
                }
                <span
                  className="text-sm font-semibold"
                  style={{ color: totalAlerts > 0 ? "#7A2419" : "#2F4A37" }}
                >
                  {totalAlerts > 0
                    ? `Conformité accord 07/06/2016 — ${errAlerts.length} écart(s)${warnAlerts.length > 0 ? ` · ${warnAlerts.length} avertissement(s)` : ""}`
                    : "Conformité accord 07/06/2016 — aucun écart détecté ✓"}
                </span>
              </div>
              <span className="text-xs opacity-60">
                {showCompliance ? "▲ Réduire" : "▼ Afficher"}
              </span>
            </button>

            {showCompliance && (
              <div className="p-4" style={{ background: "white" }}>
                <p className="text-xs opacity-60 mb-3">
                  Accord collectif 07/06/2016 — Titre II personnel sédentaire,
                  art. 38 §5 agents de réserve, 7h45/j. Période nocturne : 21h30–6h30 (art. 23 §6).
                </p>

                {errAlerts.length > 0 && (
                  <div className="mb-3">
                    <p
                      className="text-xs font-bold mb-2 uppercase tracking-wide"
                      style={{ color: "#B23A2E" }}
                    >
                      ⛔ Écarts réglementaires
                    </p>
                    {errAlerts.map((a, i) => (
                      <div
                        key={i}
                        className="flex gap-2 items-start mb-2 rounded-md p-3"
                        style={{ background: "#F7E2DF", border: "1px solid #B23A2E" }}
                      >
                        <AlertTriangle
                          size={15}
                          style={{ color: "#B23A2E", flexShrink: 0, marginTop: 1 }}
                        />
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "#7A2419" }}>
                            {a.date && <span className="mono-font mr-2">{a.date}</span>}
                            {a.code && <span className="mr-2">{a.code}</span>}
                            <span className="opacity-70 font-normal">— {a.ref}</span>
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#7A2419" }}>
                            {a.msg}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {warnAlerts.length > 0 && (
                  <div className="mb-3">
                    <p
                      className="text-xs font-bold mb-2 uppercase tracking-wide"
                      style={{ color: "#7A3210" }}
                    >
                      ⚠ Avertissements
                    </p>
                    {warnAlerts.map((a, i) => (
                      <div
                        key={i}
                        className="flex gap-2 items-start mb-2 rounded-md p-3"
                        style={{ background: "#FBE9DF", border: `1px solid ${ORANGE}` }}
                      >
                        <AlertTriangle
                          size={15}
                          style={{ color: ORANGE, flexShrink: 0, marginTop: 1 }}
                        />
                        <div>
                          <p className="text-xs font-semibold" style={{ color: "#7A3210" }}>
                            {a.date && <span className="mono-font mr-2">{a.date}</span>}
                            <span className="opacity-70 font-normal">— {a.ref}</span>
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "#7A3210" }}>
                            {a.msg}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {totalAlerts === 0 && (
                  <div
                    className="flex gap-2 items-center rounded-md p-3"
                    style={{ background: "#E8F0E6", border: `1px solid ${GREEN}` }}
                  >
                    <CheckCircle2 size={15} style={{ color: GREEN }} />
                    <p className="text-xs" style={{ color: "#2F4A37" }}>
                      Tous les points vérifiés sont conformes : durée de service, amplitude,
                      repos journalier, grande période de travail, RPSD mensuel, délai de prévenance.
                    </p>
                  </div>
                )}

                <p className="text-[11px] opacity-40 mt-3">
                  Art. 26-1 (durée) · Art. 28 (amplitude) · Art. 31 (repos journalier) ·
                  Art. 34 (grande période) · Art. 38 §5 + Art. 32-II §V (RPSD) ·
                  Art. 24 §2 (délai de prévenance)
                </p>
              </div>
            )}
          </div>

          {/* Impact compteurs */}
          {result.allImpacts.length > 0 && (
            <div
              className="rounded-lg p-4 mb-4 flex gap-2"
              style={{ background: "#FBE9DF", border: `1px solid ${ORANGE}` }}
            >
              <AlertTriangle
                size={18}
                style={{ color: ORANGE, flexShrink: 0, marginTop: 2 }}
              />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#7A3210" }}>
                  Compteurs potentiellement impactés
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.allImpacts.map((c) => (
                    <span
                      key={c}
                      className="mono-font text-xs px-2 py-0.5 rounded"
                      style={{ background: ORANGE, color: "white" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
                <p className="text-xs mt-1 opacity-70">
                  Deltas TQ/RN/CT/RP calculés automatiquement (accord 07/06/2016).
                </p>
              </div>
            </div>
          )}

          {/* Tableau avant/après */}
          <div
            className="overflow-x-auto rounded-lg mb-5"
            style={{ border: "1px solid #DCD5C5" }}
          >
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr style={{ background: SLATE }}>
                  <th className="text-left px-3 py-2 text-white text-xs">Date</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Avant</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Après</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Δ Compteurs</th>
                  <th className="text-left px-3 py-2 text-white text-xs">Conformité</th>
                </tr>
              </thead>
              <tbody>
                {result.changes.map(({ existing, newDay, hasChange }, i) => {
                  const deltas = hasChange ? computeCounterDeltas(existing, newDay) : {};
                  const dayAlerts = (result.complianceAlerts || []).filter(
                    (a) => a.date === newDay.date
                  );
                  return (
                    <tr
                      key={newDay.date}
                      style={{
                        background: hasChange
                          ? "#FBE9DF"
                          : i % 2 === 0
                          ? "white"
                          : "#FBF9F4",
                      }}
                    >
                      <td className="px-3 py-2 mono-font whitespace-nowrap">
                        {newDay.date}
                      </td>
                      <td className="px-3 py-2">
                        {existing.code ? (
                          <span
                            className="mono-font font-medium"
                            style={{
                              color: hasChange
                                ? "#9A9384"
                                : CATEGORY_STYLES[existing.category]?.text,
                            }}
                          >
                            {existing.code}
                          </span>
                        ) : (
                          <span className="opacity-40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="mono-font font-semibold"
                          style={{ color: CATEGORY_STYLES[newDay.category]?.text || INK }}
                        >
                          {newDay.code}
                        </span>
                        {hasChange && (
                          <span
                            className="ml-1 text-[10px]"
                            style={{ color: ORANGE }}
                          >
                            ↑
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          {Object.entries(deltas).map(([k, v]) => (
                            <span
                              key={k}
                              className="mono-font text-[10px]"
                              style={{
                                color: v.toString().startsWith("+")
                                  ? GREEN
                                  : "#B23A2E",
                              }}
                            >
                              {k} {v}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {dayAlerts.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {dayAlerts.map((a, ai) => (
                              <span
                                key={ai}
                                className="text-[10px] font-medium"
                                style={{
                                  color: a.level === "error" ? "#B23A2E" : "#7A3210",
                                }}
                              >
                                {a.level === "error" ? "⛔" : "⚠"} {a.ref}
                              </span>
                            ))}
                          </div>
                        ) : newDay.category === "travail" ? (
                          <span className="text-[10px]" style={{ color: GREEN }}>✓</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={applyImport}
              disabled={applying}
              className="text-sm font-medium px-4 py-2 rounded-md flex items-center gap-2"
              style={{
                background: errAlerts.length > 0 ? "#B23A2E" : GREEN,
                color: "white",
                opacity: applying ? 0.6 : 1,
              }}
            >
              <FileCheck size={15} />
              {applying
                ? "Application..."
                : errAlerts.length > 0
                ? `Appliquer malgré ${errAlerts.length} écart(s) réglementaire(s)`
                : "Appliquer les modifications"}
            </button>
            <button
              onClick={() => { setState("idle"); setResult(null); }}
              className="text-sm font-medium px-4 py-2 rounded-md"
              style={{ background: "white", color: INK, border: "1px solid #DCD5C5" }}
            >
              Annuler
            </button>
          </div>

          {errAlerts.length > 0 && (
            <p className="text-xs mt-2 opacity-70" style={{ color: "#B23A2E" }}>
              Les écarts détectés seront conservés dans le planning tel que commandé —
              ils peuvent servir de base à une contestation syndicale.
            </p>
          )}
        </div>
      )}
    </Layout>
  );
}
