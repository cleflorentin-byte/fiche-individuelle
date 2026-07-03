import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Layout from "../components/Layout";
import EditDayForm from "../components/EditDayForm";
import { useSessionProfile } from "../lib/useSessionProfile";
import { supabase } from "../lib/supabaseClient";
import { CATEGORY_STYLES, ORANGE, CREAM } from "../lib/categories";
import { WEEKDAYS, MONTH_NAMES, buildMonthGrid, toIsoDate } from "../lib/dateUtils";

export default function Dashboard() {
  const { session, profile, loading } = useSessionProfile();
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [days, setDays] = useState({}); // { iso: dayRow }
  const [fetching, setFetching] = useState(false);
  const [selectedIso, setSelectedIso] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [syndicalTotal, setSyndicalTotal] = useState(0);
  const [syndicalByCode, setSyndicalByCode] = useState({});

  const weeks = useMemo(() => buildMonthGrid(viewDate.year, viewDate.monthIndex), [viewDate]);

  useEffect(() => {
    if (!session) return;
    fetchMonth();
    fetchSyndicalStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, viewDate]);

  async function fetchMonth() {
    setFetching(true);
    const start = toIsoDate(viewDate.year, viewDate.monthIndex, 1);
    const lastDay = new Date(viewDate.year, viewDate.monthIndex + 1, 0).getDate();
    const end = toIsoDate(viewDate.year, viewDate.monthIndex, lastDay);
    const { data, error } = await supabase
      .from("days")
      .select("*")
      .eq("user_id", session.user.id)
      .gte("date", start)
      .lte("date", end);
    if (!error && data) {
      const map = {};
      data.forEach((row) => {
        map[row.date] = row;
      });
      setDays(map);
    }
    setFetching(false);
  }

  async function fetchSyndicalStats() {
    const yearStart = `${viewDate.year}-01-01`;
    const yearEnd = `${viewDate.year}-12-31`;
    const { data, error } = await supabase
      .from("days")
      .select("code")
      .eq("user_id", session.user.id)
      .eq("category", "syndical")
      .gte("date", yearStart)
      .lte("date", yearEnd);
    if (!error && data) {
      const byCode = {};
      data.forEach((row) => {
        if (row.code) byCode[row.code] = (byCode[row.code] || 0) + 1;
      });
      setSyndicalByCode(byCode);
      setSyndicalTotal(data.length);
    }
  }

  function changeMonth(delta) {
    setSelectedIso(null);
    setIsEditing(false);
    setViewDate(({ year, monthIndex }) => {
      let m = monthIndex + delta;
      let y = year;
      if (m < 0) { m = 11; y -= 1; }
      if (m > 11) { m = 0; y += 1; }
      return { year: y, monthIndex: m };
    });
  }

  function selectDay(iso) {
    setSelectedIso(iso);
    setIsEditing(false);
  }

  function startEditing() {
    const existing = days[selectedIso];
    setEditForm({
      category: existing && existing.category !== "none" ? existing.category : "syndical",
      code: existing?.code || "",
      libelle: existing && existing.category !== "none" ? existing.libelle : "",
      schedule: existing?.schedule ? existing.schedule.map((s) => [...s]) : [],
    });
    setIsEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    const payload = {
      user_id: session.user.id,
      date: selectedIso,
      category: editForm.category,
      code: editForm.code || null,
      libelle: editForm.libelle || null,
      schedule: editForm.schedule,
      source: "manuel",
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("days").upsert(payload, { onConflict: "user_id,date" });
    if (!error) {
      setDays((prev) => ({ ...prev, [selectedIso]: payload }));
      setIsEditing(false);
      fetchSyndicalStats();
    }
    setSaving(false);
  }

  async function deleteDay() {
    setSaving(true);
    const { error } = await supabase.from("days").delete().eq("user_id", session.user.id).eq("date", selectedIso);
    if (!error) {
      setDays((prev) => {
        const next = { ...prev };
        delete next[selectedIso];
        return next;
      });
      setIsEditing(false);
      fetchSyndicalStats();
    }
    setSaving(false);
  }

  if (loading) return null;
  if (profile && !profile.approved) return <PendingApproval profile={profile} />;

  const selectedDay = selectedIso ? days[selectedIso] : null;

  return (
    <Layout title="Calendrier" subtitle="Historique d'utilisation personnel" current="/" profile={profile}>
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

      {syndicalTotal >= 5 && (
        <div className="rounded-lg p-4 mb-5" style={{ background: "white", border: `1px solid ${ORANGE}` }}>
          <div className="flex items-center justify-between mb-2">
            <p className="board-font text-xs uppercase tracking-widest" style={{ color: ORANGE }}>
              Dégagements syndicaux — {viewDate.year}
            </p>
            <p className="mono-font text-2xl font-bold" style={{ color: ORANGE }}>{syndicalTotal}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(syndicalByCode).map(([code, count]) => (
              <span key={code} className="text-xs mono-font px-2 py-1 rounded" style={{ background: "#FBE9DF", color: "#7A3210" }}>
                {code} × {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="board-font text-center text-[11px] sm:text-xs uppercase tracking-wide opacity-60 py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1 sm:gap-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-2">
            {week.map((cell, ci) => {
              if (!cell) return <div key={ci} />;
              const row = days[cell.iso];
              const category = row?.category || "none";
              const style = CATEGORY_STYLES[category];
              const isSelected = selectedIso === cell.iso;
              return (
                <button
                  key={cell.iso}
                  onClick={() => selectDay(cell.iso)}
                  className="text-left rounded-md p-1.5 sm:p-2 transition-shadow"
                  style={{
                    background: style.bg,
                    borderLeft: `3px solid ${style.border}`,
                    boxShadow: isSelected ? `0 0 0 2px ${style.border}` : "none",
                    minHeight: 56,
                  }}
                >
                  <p className="mono-font text-xs sm:text-sm font-semibold" style={{ color: style.text }}>
                    {String(cell.day).padStart(2, "0")}
                  </p>
                  {row?.code && (
                    <p className="text-[10px] sm:text-[11px] font-medium truncate" style={{ color: style.text }}>
                      {row.code}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {selectedIso && (
        <div className="mt-4 rounded-lg p-4" style={{ background: "white", border: "1px solid #DCD5C5" }}>
          <div className="flex justify-between items-start mb-3">
            <p className="board-font text-sm uppercase tracking-wide opacity-60">
              {new Date(selectedIso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
            <button onClick={() => setSelectedIso(null)} aria-label="Fermer">
              <X size={18} className="opacity-50" />
            </button>
          </div>

          {!isEditing ? (
            <>
              {!selectedDay || selectedDay.category === "none" ? (
                <p className="text-sm opacity-60 mb-3">Aucune donnée pour ce jour.</p>
              ) : (
                <>
                  <p className="text-base font-semibold mb-2" style={{ color: CATEGORY_STYLES[selectedDay.category].text }}>
                    {selectedDay.code} — {selectedDay.libelle}
                  </p>
                  {selectedDay.schedule?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedDay.schedule.map(([tag, time], i) => (
                        <span key={i} className="mono-font text-xs px-2 py-1 rounded" style={{ background: CREAM, border: "1px solid #DCD5C5" }}>
                          {tag} {time}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
              <button onClick={startEditing} className="text-sm font-medium px-3 py-1.5 rounded-md" style={{ background: "#1F2B30", color: "white" }}>
                {!selectedDay || selectedDay.category === "none" ? "Ajouter une donnée" : "Modifier"}
              </button>
            </>
          ) : (
            <EditDayForm
              form={editForm}
              setForm={setEditForm}
              onSave={saveEdit}
              onCancel={() => setIsEditing(false)}
              onDelete={selectedDay && selectedDay.category !== "none" ? deleteDay : null}
              busy={saving}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-6">
        {Object.entries(CATEGORY_STYLES)
          .filter(([k]) => k !== "none")
          .map(([key, s]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs">
              <span className="w-3 h-3 rounded-sm" style={{ background: s.bg, border: `2px solid ${s.border}` }} />
              {s.label}
            </div>
          ))}
      </div>
    </Layout>
  );
}

function PendingApproval({ profile }) {
  return (
    <div style={{ background: CREAM, minHeight: "100vh" }} className="flex items-center justify-center px-4">
      <div className="max-w-sm text-center rounded-lg p-6" style={{ background: "white", border: "1px solid #DCD5C5" }}>
        <p className="board-font text-sm uppercase tracking-widest mb-2" style={{ color: ORANGE }}>
          En attente de validation
        </p>
        <p className="text-sm opacity-70">
          Bonjour {profile.full_name || ""}, ton compte a bien été créé mais doit être validé manuellement par ton délégué CFDT avant que tu puisses accéder à tes données.
        </p>
      </div>
    </div>
  );
}
