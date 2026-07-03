import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { GREEN, ORANGE, SLATE, PURPLE } from "../lib/categories";
import { MONTH_NAMES } from "../lib/dateUtils";

export default function Recap() {
  const { session, profile, loading } = useSessionProfile();
  const [rows, setRows] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!session) return;
    fetchYear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, year]);

  async function fetchYear() {
    const { data, error } = await supabase
      .from("fia_months")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("year", year)
      .order("month", { ascending: true });
    if (!error && data) {
      setRows(
        data.map((r) => ({
          label: `${MONTH_NAMES[r.month - 1].slice(0, 4)}.`,
          rp: Number(r.data?.rp) || 0,
          rd: Number(r.data?.rd) || 0,
          rpsd: Number(r.data?.rpsd) || 0,
          we: Number(r.data?.we) || 0,
          rn: r.data?.rn || "—",
          tq: r.data?.tq || "—",
          rq: r.data?.rq || "—",
          ru: r.data?.ru || "—",
          ct: r.data?.ct || "—",
        }))
      );
    }
  }

  if (loading) return null;

  return (
    <Layout title="Récapitulatif annuel" subtitle="Synthèse des fiches FIA enregistrées" current="/recap" profile={profile}>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-sm opacity-60">Année :</span>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm rounded-md px-3 py-2 w-24 mono-font"
          style={{ border: "1px solid #DCD5C5" }}
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg p-6 text-center" style={{ background: "white", border: "1px solid #DCD5C5" }}>
          <p className="text-sm opacity-60">
            Aucune fiche FIA enregistrée pour {year}. Renseigne-les depuis l'onglet « Fiches FIA ».
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg p-4 mb-5" style={{ background: "white", border: "1px solid #DCD5C5" }}>
            <p className="board-font text-xs uppercase tracking-widest opacity-60 mb-3">
              Évolution des repos (jours cumulés, fin de mois)
            </p>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={rows} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DCD5C5" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="rp" name="RP" fill={GREEN} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="rd" name="RD" fill={ORANGE} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="rpsd" name="RPSD" fill={SLATE} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="we" name="WE" fill={PURPLE} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #DCD5C5" }}>
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr style={{ background: SLATE }}>
                  <th className="text-left px-3 py-2 text-white uppercase tracking-wide text-[11px]">Mois</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">RP</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">RD</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">RPSD</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">WE</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">RN</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">RQ</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">TQ</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">RU</th>
                  <th className="text-right px-3 py-2 text-white uppercase tracking-wide text-[11px]">CT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.label + i} style={{ background: i % 2 === 0 ? "white" : "#FBF9F4" }}>
                    <td className="px-3 py-2 font-medium mono-font whitespace-nowrap">{r.label}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.rp}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.rd}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.rpsd}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.we}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.rn}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.rq}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.tq}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.ru}</td>
                    <td className="px-3 py-2 text-right mono-font">{r.ct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}
