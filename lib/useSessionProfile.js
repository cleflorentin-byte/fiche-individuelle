import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "./supabaseClient";

// Récupère la session active et le profil associé. Redirige vers /login si
// personne n'est connecté. `loading` reste true pendant la vérification.
export function useSessionProfile() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!isMounted) return;
      if (!sessionData.session) {
        setLoading(false);
        router.replace("/login");
        return;
      }
      setSession(sessionData.session);
      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", sessionData.session.user.id)
        .single();
      if (!isMounted) return;
      if (!error) setProfile(profileData);
      setLoading(false);
    }

    load();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) router.replace("/login");
      setSession(newSession);
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [router]);

  return { session, profile, loading };
}
