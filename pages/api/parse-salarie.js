// Route API : reçoit un document Word ou PDF de l'interface salarié SNCF
// (ESS, HR Access, export Chronotime…), l'envoie à Claude pour extraction
// des compteurs, et renvoie un objet JSON compatible avec le schéma FIA.

const PROMPT = `Tu es un parseur de documents RH SNCF (interface salarié, ESS, HR Access, export Chronotime, ou tout autre document officiel SNCF contenant des données d'utilisation personnelle).

Extrais les informations suivantes et retourne UNIQUEMENT un JSON valide, sans markdown, sans explication, sans texte avant ou après.

Format attendu :
{
  "agent": {
    "nom": "...",
    "prenom": "...",
    "matricule": "...",
    "cp_number": "...",
    "etablissement": "...",
    "regime": "...",
    "periode": "MM/YYYY"
  },
  "compteurs": {
    "rp": "...",
    "rd": "...",
    "rpsd": "...",
    "we": "...",
    "rn": "...",
    "tq": "...",
    "rq": "...",
    "ru": "...",
    "ct": "...",
    "conges_n1": "...",
    "conges_n": "..."
  }
}

Règles :
- Si une valeur n'est pas trouvée dans le document, laisse le champ vide ("").
- Conserve le format exact tel qu'il apparaît dans le document (ex : "27", "5h07", "3,0", "28,0").
- "rp" = repos périodiques (cumul annuel).
- "rd" = repos doubles (cumul).
- "rpsd" = repos samedi+dimanche (cumul).
- "we" = dimanches accolés à un samedi ou lundi (cumul).
- "rn" = repos compensateur de nuit (solde).
- "tq" = temps à compenser semestre en cours (solde).
- "rq" = temps RQ (solde).
- "ru" = repos supplémentaire (solde).
- "ct" = compte temps / repos supplémentaire compte temps (solde).
- "conges_n1" = congés reliquat année précédente (solde).
- "conges_n" = congés dotation année en cours (solde).`;

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Méthode non autorisée" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY non configurée. L'import automatique nécessite une clé API Anthropic (voir README).",
    });
  }

  const { base64Data, mimeType } = req.body || {};
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: "Fichier manquant (base64Data + mimeType requis)" });
  }

  // Seuls PDF et Word sont supportés nativement par Claude
  const SUPPORTED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!SUPPORTED.includes(mimeType)) {
    return res.status(400).json({
      error: `Format non supporté (${mimeType}). Utilise un fichier PDF ou Word (.docx).`,
    });
  }

  const sourceType = mimeType === "application/pdf" ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: sourceType, data: base64Data },
              },
              { type: "text", text: PROMPT },
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
    return res.status(500).json({ error: err.message || "Erreur lors du parsing du document" });
  }
}
