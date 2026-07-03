import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { ORANGE, GREEN } from "../lib/categories";
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

export default function Fia() {
  const { session, profile, loading } = useSessionProfile();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [form, setForm] = useState({});
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetchHistory();
    fetchCurrent();
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

  if (loading) return null;

  return (
    <Layout title="Fiches FIA" subtitle="Saisie manuelle des compteurs mensuels" current="/fia" profile={profile}>
      <div className="rounded-lg p-4 mb-5" style={{ background: "#FBE9DF", border: `1px solid ${ORANGE}` }}>
        <p className="text-sm" style={{ color: "#7A3210" }}>
          La direction n'éditant plus les FIA, ces valeurs sont à reporter manuellement depuis ta dernière fiche
          officielle puis à tenir à jour toi-même mois après mois.
        </p>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="text-sm rounded-md px-3 py-2" style={{ border: "1px solid #DCD5C5" }}>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm rounded-md px-3 py-2 w-24 mono-font"
          style={{ border: "1px solid #DCD5C5" }}
        />
      </div>

      <div className="rounded-lg p-4 mb-5" style={{ background: "white", border: "1px solid #DCD5C5" }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <label key={f.key} className="text-xs block">
              <span className="opacity-60 block mb-1">{f.label}</span>
              <input
                value={form[f.key] || ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full text-sm rounded-md px-2 py-1.5 mono-font"
                style={{ border: "1px solid #DCD5C5" }}
              />
            </label>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-md"
            style={{ background: GREEN, color: "white", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Enregistrement..." : "Enregistrer ce mois"}
          </button>
          {saved && <span className="text-xs" style={{ color: GREEN }}>Enregistré ✓</span>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #DCD5C5" }}>
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr style={{ background: "#1F2B30" }}>
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
