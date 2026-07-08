import { Calendar, List, FileText, TrendingUp, Upload, LogOut, UserCheck } from "lucide-react";
import { SLATE, ORANGE, INK } from "../lib/categories";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";

const NAV = [
  { href: "/", label: "Calendrier", icon: Calendar },
  { href: "/registre", label: "Registre", icon: List },
  { href: "/fia", label: "Fiches FIA", icon: FileText },
  { href: "/recap", label: "Récapitulatif annuel", icon: TrendingUp },
  { href: "/import-salarie", label: "Import données salarié", icon: UserCheck },
  { href: "/import", label: "Import CPS", icon: Upload, accent: true },
];

export default function Layout({ title, subtitle, current, profile, children }) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div style={{ background: "#F7F3EC", color: INK, minHeight: "100vh" }}>
      <header style={{ background: SLATE, borderTop: `5px solid ${ORANGE}` }} className="px-4 sm:px-8 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="board-font text-xs uppercase tracking-widest" style={{ color: ORANGE }}>
              CFDT EIC LORCA
            </p>
            <h1 className="board-font text-2xl sm:text-3xl font-bold uppercase tracking-wide text-white">{title}</h1>
            {subtitle && <p className="text-xs text-white opacity-60 mt-1">{subtitle}</p>}
          </div>
          {profile && (
            <div className="text-right">
              <p className="text-sm text-white opacity-90">{profile.full_name || "Agent"}</p>
              <p className="text-xs text-white opacity-60">{profile.cp_number ? `N° CP ${profile.cp_number}` : ""}</p>
              <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-white opacity-60 mt-1 ml-auto">
                <LogOut size={12} /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="px-4 sm:px-8 py-6 max-w-5xl mx-auto">
        <nav className="flex gap-2 mb-6 flex-wrap">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = current === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium"
                style={
                  isActive
                    ? { background: item.accent ? ORANGE : SLATE, color: "white" }
                    : { background: "white", color: INK, border: `1px solid ${item.accent ? ORANGE : "#DCD5C5"}` }
                }
              >
                <Icon size={16} /> {item.label}
              </a>
            );
          })}
        </nav>
        {children}
      </main>
    </div>
  );
}
