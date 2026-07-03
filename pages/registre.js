import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Layout from "../components/Layout";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { CATEGORY_STYLES } from "../lib/categories";
import { MONTH_NAMES, toIsoDate } from "../lib/dateUtils";

export default function Registre() {
  const { session, profile, loading } = useSessionProfile();
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!session) return;
    fetchMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, viewDate]);

  async function fetchMonth() {
    const start = toIsoDate(viewDate.year, viewDate.monthIndex, 1);
    const lastDay = new Date(viewDate.year, viewDate.monthIndex + 1, 0).getDate();
    const end = toIsoDate(viewDate.year, viewDate.monthIndex, lastDay);
    const { data, error } = await supabase
      .from("days")
      .select("*")
      .eq("user_id", session.user.id)
      .neq("category", "none")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true });
    if (!error && data) setRows(data);
  }

  function changeMonth(delta) {
    setViewDate(({ year, monthIndex }) => {
      let m = monthIndex + delta;
      let y = year;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { year: y, monthIndex: m };
    });
  }

  if (loading) return null;

  return (
    <Layout title="Registre" subtitle="Vue tableau de l'historique" current="/registre" profile={profile}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => changeMonth(-1)} className="p-2 rounded-md" style={{ border: "1px solid #DCD5C5" }}>
          <ChevronLeft size={18} />
        </button>
        <p className="board-font text-lg font-bold uppercase tracking-wide">
          {MONTH_NAMES[viewDate.monthIndex]} {viewDate.year}
        </p>
        <button onClick={() => changeMonth(1)} className="p-2 rounded-md" style={{ border: "1px solid #DCD5C5" }}>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid #DCD5C5" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#1F2B30" }}>
              <th className="text-left px-3 py-2 text-white text-xs uppercase tracking-wide">Date</th>
              <th className="text-left px-3 py-2 text-white text-xs uppercase tracking-wide">Code</th>
              <th className="text-left px-3 py-2 text-white text-xs uppercase tracking-wide">Libellé</th>
              <th className="text-left px-3 py-2 text-white text-xs uppercase tracking-wide">Horaires</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const style = CATEGORY_STYLES[row.category] || CATEGORY_STYLES.none;
              const d = new Date(row.date + "T00:00:00");
              return (
                <tr key={row.id} style={{ background: i % 2 === 0 ? "white" : "#FBF9F4" }}>
                  <td className="px-3 py-2 mono-font whitespace-nowrap" style={{ borderLeft: `3px solid ${style.border}` }}>
                    {d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </td>
                  <td className="px-3 py-2 font-medium" style={{ color: style.text }}>{row.code}</td>
                  <td className="px-3 py-2">{row.libelle}</td>
                  <td className="px-3 py-2 mono-font text-xs opacity-80">
                    {(row.schedule || []).map(([tag, time]) => `${tag} ${time}`).join("  ·  ")}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm opacity-50">
                  Aucune donnée pour ce mois.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
