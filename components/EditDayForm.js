import { X } from "lucide-react";
import { CATEGORY_STYLES, ORANGE, GREEN, INK } from "../lib/categories";

const inputStyle = { border: "1px solid #DCD5C5" };

export default function EditDayForm({ form, setForm, onSave, onCancel, onDelete, busy }) {
  const updateField = (field, value) => setForm({ ...form, [field]: value });

  const updateSchedule = (i, key, value) => {
    const sched = form.schedule.map((s) => [...s]);
    if (key === "tag") sched[i][0] = value;
    else sched[i][1] = value;
    setForm({ ...form, schedule: sched });
  };
  const addRow = () => setForm({ ...form, schedule: [...form.schedule, ["", ""]] });
  const removeRow = (i) => setForm({ ...form, schedule: form.schedule.filter((_, idx) => idx !== i) });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs block">
          <span className="opacity-60 block mb-1">Catégorie</span>
          <select
            value={form.category}
            onChange={(e) => updateField("category", e.target.value)}
            className="w-full text-sm rounded-md px-2 py-1.5"
            style={inputStyle}
          >
            {Object.entries(CATEGORY_STYLES)
              .filter(([k]) => k !== "none")
              .map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs block">
          <span className="opacity-60 block mb-1">Code</span>
          <input
            value={form.code || ""}
            onChange={(e) => updateField("code", e.target.value)}
            className="w-full text-sm rounded-md px-2 py-1.5 mono-font"
            style={inputStyle}
          />
        </label>
      </div>

      <label className="text-xs block">
        <span className="opacity-60 block mb-1">Libellé</span>
        <input
          value={form.libelle || ""}
          onChange={(e) => updateField("libelle", e.target.value)}
          className="w-full text-sm rounded-md px-2 py-1.5"
          style={inputStyle}
        />
      </label>

      <div>
        <span className="text-xs opacity-60 block mb-1">Horaires</span>
        <div className="flex flex-col gap-2">
          {form.schedule.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={s[0]}
                onChange={(e) => updateSchedule(i, "tag", e.target.value)}
                placeholder="PS"
                className="text-xs rounded-md px-2 py-1 mono-font w-20"
                style={inputStyle}
              />
              <input
                value={s[1]}
                onChange={(e) => updateSchedule(i, "time", e.target.value)}
                placeholder="08:00"
                className="text-xs rounded-md px-2 py-1 mono-font flex-1"
                style={inputStyle}
              />
              <button onClick={() => removeRow(i)} aria-label="Supprimer la plage">
                <X size={14} className="opacity-50" />
              </button>
            </div>
          ))}
          <button onClick={addRow} className="text-xs font-medium self-start" style={{ color: ORANGE }}>
            + Ajouter une plage horaire
          </button>
        </div>
      </div>

      <div className="flex gap-2 mt-1 flex-wrap">
        <button
          onClick={onSave}
          disabled={busy}
          className="text-sm font-medium px-3 py-1.5 rounded-md"
          style={{ background: GREEN, color: "white", opacity: busy ? 0.6 : 1 }}
        >
          Enregistrer
        </button>
        <button onClick={onCancel} className="text-sm font-medium px-3 py-1.5 rounded-md" style={{ background: "white", color: INK, border: "1px solid #DCD5C5" }}>
          Annuler
        </button>
        {onDelete && (
          <button onClick={onDelete} className="text-sm font-medium px-3 py-1.5 rounded-md ml-auto" style={{ background: "#F7E2DF", color: "#7A2419" }}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
}
