// Fonction serverless Vercel : reçoit une photo de vêtement en base64, appelle l'API
// Anthropic (vision) et renvoie des métadonnées structurées pour pré-remplir le
// formulaire d'ajout. La clé API n'est jamais exposée côté client : elle est lue ici,
// côté serveur uniquement, depuis la variable d'environnement Vercel ANTHROPIC_API_KEY.

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const MAX_BASE64_LENGTH = 4_000_000; // reste sous la limite ~4.5 Mo des fonctions Vercel

const EXTRACT_TOOL = {
  name: 'extract_clothing_info',
  description:
    "Extrait les informations d'un vêtement à partir d'une photo, pour l'ajouter à un dressing numérique.",
  input_schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: "Nom court et descriptif du vêtement, en français (ex: 'Chemise en lin blanche').",
      },
      category: {
        type: 'string',
        enum: ['haut', 'bas', 'robe', 'veste', 'chaussures', 'accessoire'],
        description: 'Catégorie du vêtement.',
      },
      colorFamily: {
        type: 'string',
        enum: ['blanc', 'noir', 'gris', 'beige', 'marron', 'bleu', 'rose', 'rouge', 'vert', 'jaune', 'orange', 'violet', 'multicolore'],
        description: 'Famille de couleur dominante.',
      },
      color: {
        type: 'string',
        description: "Couleur dominante en code hexadécimal (ex: '#EDEAE2').",
      },
      material: {
        type: 'string',
        description: 'Matière estimée (ex: coton, laine, cuir, denim, lin, synthétique, soie).',
      },
      season: {
        type: 'string',
        enum: ['ete', 'hiver', 'mi-saison', 'toute-saison'],
        description: 'Saison la plus adaptée pour porter ce vêtement.',
      },
      warmth: {
        type: 'string',
        enum: ['leger', 'chaud'],
        description: "Niveau de chaleur du vêtement, déduit de la matière et de la saison.",
      },
    },
    required: ['name', 'category', 'colorFamily', 'color', 'material', 'season', 'warmth'],
  },
};

export default async function handler(req, res) {
  // L'app native (Capacitor) appelle cette fonction depuis sa propre origine locale
  // (capacitor://localhost sur iOS, https://localhost sur Android), donc en cross-origin
  // par rapport au domaine Vercel. Aucune donnée sensible n'est exposée par cet endpoint
  // (la clé API reste côté serveur) : un CORS permissif est sans risque ici.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Clé API Anthropic non configurée sur le serveur (ANTHROPIC_API_KEY manquante)." });
    return;
  }

  const { image, mediaType } = req.body || {};
  if (!image || typeof image !== 'string') {
    res.status(400).json({ error: 'Image manquante ou invalide.' });
    return;
  }
  if (image.length > MAX_BASE64_LENGTH) {
    res.status(413).json({ error: 'Image trop volumineuse.' });
    return;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 512,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_clothing_info' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType && mediaType.startsWith('image/') ? mediaType : 'image/jpeg',
                  data: image,
                },
              },
              {
                type: 'text',
                text: "Analyse ce vêtement et extrais ses informations avec l'outil fourni.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const isQuota = response.status === 429;
      res.status(isQuota ? 429 : 502).json({
        error: isQuota ? "Quota de l'API Claude dépassé, réessaie plus tard." : "Erreur de l'API Claude.",
        detail: detail.slice(0, 300),
      });
      return;
    }

    const data = await response.json();
    const toolUse = Array.isArray(data.content) ? data.content.find((block) => block.type === 'tool_use') : null;

    if (!toolUse) {
      res.status(502).json({ error: "Réponse inattendue de l'IA (aucune donnée structurée)." });
      return;
    }

    res.status(200).json(toolUse.input);
  } catch (err) {
    res.status(502).json({
      error: 'Impossible de contacter le service de reconnaissance photo.',
      detail: String(err?.message || err),
    });
  }
}
