import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import { SLATE, ORANGE, INK, CREAM } from "../lib/categories";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpError) throw signUpError;
        setInfo(
          "Compte créé. Ton accès doit être validé manuellement par ton délégué CFDT avant de pouvoir consulter tes données — tu recevras une confirmation."
        );
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push("/");
      }
    } catch (err) {
      setError(err.message || "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: CREAM, minHeight: "100vh" }} className="flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div style={{ background: SLATE, borderTop: `5px solid ${ORANGE}` }} className="rounded-t-lg px-6 py-5">
          <p className="board-font text-xs uppercase tracking-widest" style={{ color: ORANGE }}>
            CFDT EIC LORCA
          </p>
          <h1 className="board-font text-xl font-bold uppercase tracking-wide text-white">Délégué Virtuel</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-lg p-6 flex flex-col gap-3" style={{ border: "1px solid #DCD5C5" }}>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="flex-1 text-sm font-medium py-1.5 rounded-md"
              style={mode === "signin" ? { background: SLATE, color: "white" } : { background: CREAM, color: INK }}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="flex-1 text-sm font-medium py-1.5 rounded-md"
              style={mode === "signup" ? { background: SLATE, color: "white" } : { background: CREAM, color: INK }}
            >
              Inscription
            </button>
          </div>

          {mode === "signup" && (
            <label className="text-xs block">
              <span className="opacity-60 block mb-1">Nom complet</span>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full text-sm rounded-md px-3 py-2"
                style={{ border: "1px solid #DCD5C5" }}
              />
            </label>
          )}

          <label className="text-xs block">
            <span className="opacity-60 block mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full text-sm rounded-md px-3 py-2"
              style={{ border: "1px solid #DCD5C5" }}
            />
          </label>

          <label className="text-xs block">
            <span className="opacity-60 block mb-1">Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full text-sm rounded-md px-3 py-2"
              style={{ border: "1px solid #DCD5C5" }}
            />
          </label>

          {error && <p className="text-xs" style={{ color: "#B23A2E" }}>{error}</p>}
          {info && <p className="text-xs" style={{ color: "#4F7A5B" }}>{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 text-sm font-medium py-2 rounded-md"
            style={{ background: ORANGE, color: "white", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "..." : mode === "signup" ? "Créer mon compte" : "Se connecter"}
          </button>
        </form>

        <p className="text-xs opacity-50 text-center mt-3">
          Outil réservé aux adhérents CFDT EIC LORCA. L'accès est validé manuellement après inscription.
        </p>
      </div>
    </div>
  );
}
