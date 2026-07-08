const PROMPT = `Tu es un parseur de documents RH SNCF. Extrais les informations et retourne UNIQUEMENT un JSON valide, sans markdown, sans explication.

Format attendu :
{
  "agent": {
    "nom": "", "prenom": "", "matricule": "", "cp_number": "",
    "etablissement": "", "regime": "", "periode": "MM/YYYY"
  },
  "compteurs": {
    "rp": "", "rd": "", "rpsd": "", "we": "", "rn": "",
    "tq": "", "rq": "", "ru": "", "ct": "", "conges_n1": "", "conges_n": ""
  }
}

Règles : si une valeur est absente, laisse "". Conserve le format exact du document (ex: "27", "5h07", "3,0").
rp=repos périodiques cumul, rd=repos doubles cumul, rpsd=repos sam+dim cumul, we=dim accolés sam/lun cumul,
rn=repos compensateur nuit solde, tq=temps à compenser semestre solde, rq=temps RQ solde,
ru=repos supplémentaire solde, ct=compte temps solde, conges_n1=congés reliquat N-1, conges_n=congés dotation N.`;

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY non configurée. Obtiens une clé gratuite sur https://aistudio.google.com/app/apikey puis ajoute-la dans Vercel.",
    });
  }

  const { base64Data, mimeType } = req.body || {};
  if (!base64Data || !mimeType) {
    return res.status(400).json({ error: "Fichier manquant" });
  }

  const SUPPORTED = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (!SUPPORTED.includes(mimeType)) {
    return res.status(400).json({ error: "Format non supporté. Utilise PDF ou Word (.docx)." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64Data } },
              { text: PROMPT },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 1500 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: `Erreur API Gemini : ${errText}` });
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) {
      return res.status(502).json({ error: "Gemini n'a pas retourné de texte. Document illisible ou vide." });
    }

    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json({ parsed });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erreur lors du parsing" });
  }
}
