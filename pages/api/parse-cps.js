// Cette route s'exécute côté serveur (Vercel Serverless Function) : la clé
// ANTHROPIC_API_KEY n'est donc jamais exposée au navigateur.

const PROMPT_EXTRACTION = `Tu es un parseur de bulletins de commande SNCF émis par le CPS (Commande du Personnel).
Extrais les données du document et retourne UNIQUEMENT un JSON valide, sans markdown, sans explication, sans texte avant ou après.
Format attendu :
{
  "periode_debut": "DD/MM/YYYY",
  "periode_fin": "DD/MM/YYYY",
  "jours": [
    {
      "date": "YYYY-MM-DD",
      "code": "DAUTRE",
      "libelle": "Délégation autre",
      "horaires": [["PS","08:00"],["K","12:00 13:30"],["FS","17:15"]]
    }
  ]
}
Règles :
- "date" est la date complète au format ISO YYYY-MM-DD
- "code" est le code d'utilisation tel quel (DAUTRE, DD, RP, B57001R, etc.)
- Si un jour a plusieurs plages horaires, liste-les toutes dans "horaires"
- Si un jour est un repos (RP, RH…), horaires peut être []
- N'inclus que les jours présents dans le bulletin (pas les jours hors période)`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY non configurée sur le serveur. Voir .env.example.",
    });
  }

  const { base64Data } = req.body || {};
  if (!base64Data) {
    return res.status(400).json({ error: "Fichier PDF manquant (base64Data)" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
              { type: "text", text: PROMPT_EXTRACTION },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Erreur API Anthropic : ${errText}` });
    }

    const data = await response.json();
    const rawText = (data.content || []).find((c) => c.type === "text")?.text || "";
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json({ parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur inconnue lors du parsing" });
  }
}
