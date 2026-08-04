import { useState, useRef, useEffect, useMemo, useContext, createContext } from 'react';
import {
  Home, Shirt, Sparkles, Heart, User, Plus, Camera, Upload, Check,
  ArrowLeft, Send, Calendar, Sun, CloudSun, Cloud, CloudRain, Wind,
  Footprints, Watch, ChevronRight, TrendingUp, Clock, Lightbulb,
  Loader2, MapPin, RefreshCw, Trash2, X, createLucideIcon, Mail, Lock, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from './src/supabaseClient.js';

// lucide-react ne fournit pas d'icônes pantalon/robe/veste dédiées (seulement "shirt" et
// "sport-shoe") : on les dessine avec le même helper que la librairie utilise en interne
// pour ses propres icônes, afin qu'elles héritent exactement du même style (trait,
// épaisseur, coins arrondis) et des mêmes props (size, className, etc.).
const Pants = createLucideIcon('pants', [
  ['path', { d: 'M6 3H18l-1 18h-2l-2-14-1 2-1-2-2 14H7Z', key: 'pants-1' }],
]);
const Dress = createLucideIcon('dress', [
  ['path', { d: 'M10 3 12 6 14 3 19 21H5Z', key: 'dress-1' }],
]);
const Blazer = createLucideIcon('blazer', [
  ['path', { d: 'M5 4h14l-1 17H6Z', key: 'blazer-1' }],
  ['path', { d: 'M9 4 12 10 15 4', key: 'blazer-2' }],
]);
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';

const STORAGE_KEYS = {
  clothes: 'athena.clothes',
  outfits: 'athena.outfits',
  favorites: 'athena.favorites',
  week: 'athena.week',
  events: 'athena.events',
  weatherPrefs: 'athena.weatherPrefs',
  measurements: 'athena.measurements',
  stylePrefs: 'athena.stylePrefs',
  notif: 'athena.notif',
};

// @capacitor/preferences utilise localStorage sous le capot dans un navigateur (aucun
// code supplémentaire requis) : c'est ce qui fournit le fallback web demandé pendant le dev.
async function loadJSON(key, fallback) {
  const { value } = await Preferences.get({ key });
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  Preferences.set({ key, value: JSON.stringify(value) });
}

// Écrit la photo sur le système de fichiers de l'appareil (@capacitor/filesystem, avec
// son propre shim web basé sur IndexedDB en navigateur) et retourne un chemin — jamais
// le base64 lui-même — à stocker dans les métadonnées du vêtement.
async function savePhotoFile(dataUrl, fileName) {
  const base64Data = dataUrl.split(',')[1] ?? dataUrl;
  await Filesystem.writeFile({ path: fileName, data: base64Data, directory: Directory.Data });
  return fileName;
}

const CLOTHING_PHOTOS_BUCKET = 'clothing-photos';

// Les chemins locaux (générés par savePhotoFile, ex: "local-123.jpg") ne contiennent
// jamais de "/". Les chemins cloud sont toujours de la forme "{user_id}/{fichier}" (voir
// supabase/schema.sql, storage.foldername) : la présence d'un "/" suffit à les distinguer,
// sans avoir besoin d'une colonne séparée.
function isCloudPhotoPath(path) {
  return typeof path === 'string' && path.includes('/');
}

async function resolvePhotoSrc(path) {
  if (!path) return null;
  if (isCloudPhotoPath(path)) {
    if (!supabase) return null;
    try {
      const { data, error } = await withTimeout(
        supabase.storage.from(CLOTHING_PHOTOS_BUCKET).createSignedUrl(path, 3600),
        8000,
      );
      if (error) throw error;
      return data.signedUrl;
    } catch {
      return null;
    }
  }
  try {
    if (Capacitor.isNativePlatform()) {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      return Capacitor.convertFileSrc(uri);
    }
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    return `data:image/jpeg;base64,${data}`;
  } catch {
    return null;
  }
}

async function deletePhotoFile(path) {
  if (!path) return;
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});
}

// Envoie une photo déjà compressée (dataURL) vers le bucket privé clothing-photos, sous
// {user_id}/{fichier} — la convention attendue par les policies RLS de storage.objects.
// fetch() sur une dataURL ne fait aucun appel réseau : c'est juste une façon standard
// d'obtenir un Blob à partir du base64 déjà en mémoire.
async function uploadClothingPhoto(dataUrl, userId, fileName) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/${fileName}`;
  const { error } = await supabase.storage
    .from(CLOTHING_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: true });
  if (error) throw error;
  return path;
}

// Point d'entrée unique pour supprimer la photo d'un vêtement, qu'elle soit locale ou
// cloud — pour ne jamais laisser de fichier orphelin ni dans le Filesystem ni dans le
// bucket Supabase.
async function deleteClothingPhotoAny(path) {
  if (!path) return;
  if (isCloudPhotoPath(path)) {
    if (supabase) await supabase.storage.from(CLOTHING_PHOTOS_BUCKET).remove([path]).catch(() => {});
  } else {
    await deletePhotoFile(path);
  }
}

// Passerelle entre le modèle JS (camelCase, utilisé partout dans l'app) et les colonnes
// Supabase (snake_case, voir supabase/schema.sql). photo_path reste pour l'instant un
// chemin de fichier LOCAL à l'appareil (pas encore une photo Supabase Storage — ce sera
// l'étape suivante) : les photos ne sont donc pas encore visibles d'un appareil à l'autre.
function clothingRowToItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    photo: row.photo_path,
    color: row.color ?? undefined,
    colorFamily: row.color_family ?? undefined,
    material: row.material ?? undefined,
    season: row.season ?? undefined,
    warmth: row.warmth,
    laundry: row.laundry,
    wearCount: row.wear_count,
    monthsSinceWorn: row.months_since_worn,
  };
}

function clothingItemToRow(item, userId) {
  return {
    user_id: userId,
    name: item.name,
    category: item.category,
    photo_path: item.photo ?? null,
    color: item.color ?? null,
    color_family: item.colorFamily ?? null,
    material: item.material ?? null,
    season: item.season ?? null,
    warmth: item.warmth ?? 'leger',
    laundry: item.laundry ?? false,
    wear_count: item.wearCount ?? 0,
    months_since_worn: item.monthsSinceWorn ?? null,
  };
}

// Pour une mise à jour PARTIELLE (fiche détail), à la différence de clothingItemToRow :
// seuls les champs réellement présents dans `patch` sont convertis. Un champ absent (ex:
// `photo`, que la fiche détail ne modifie jamais) ne doit surtout pas être envoyé comme
// `null` à Supabase, sous peine d'effacer une valeur existante à chaque enregistrement.
function clothingPatchToRow(patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name;
  if ('category' in patch) row.category = patch.category;
  if ('photo' in patch) row.photo_path = patch.photo ?? null;
  if ('color' in patch) row.color = patch.color ?? null;
  if ('colorFamily' in patch) row.color_family = patch.colorFamily ?? null;
  if ('material' in patch) row.material = patch.material ?? null;
  if ('season' in patch) row.season = patch.season ?? null;
  if ('warmth' in patch) row.warmth = patch.warmth ?? 'leger';
  if ('laundry' in patch) row.laundry = patch.laundry ?? false;
  return row;
}

// Timeout garanti en JS, comme pour la géolocalisation et l'analyse photo : en réseau
// coupé ou instable, le client Supabase peut mettre plusieurs secondes à abandonner tout
// seul (nouvelles tentatives internes) avant de rejeter — sans ça, l'app resterait bloquée
// sur l'écran de chargement au lieu de basculer rapidement sur le cache local.
async function fetchCloudClothes(timeoutMs = 8000) {
  const { data, error } = await supabase
    .from('clothes')
    .select('*')
    .order('created_at')
    .abortSignal(AbortSignal.timeout(timeoutMs));
  if (error) throw error;
  return data.map(clothingRowToItem);
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Délai dépassé')), ms)),
  ]);
}

const PhotoSrcContext = createContext({});

const CATEGORIES = [
  { id: 'haut', label: 'Haut', icon: Shirt },
  { id: 'bas', label: 'Bas', icon: Pants },
  { id: 'robe', label: 'Robe', icon: Dress },
  { id: 'veste', label: 'Veste', icon: Blazer },
  { id: 'chaussures', label: 'Chaussures', icon: Footprints },
  { id: 'accessoire', label: 'Accessoire', icon: Watch },
];

const PLACEHOLDER_COLORS = {
  haut: '#957882',
  bas: '#335056',
  robe: '#E3CCCA',
  veste: '#AEC1C1',
  chaussures: '#C9B79C',
  accessoire: '#8B5E3C',
};

const COLOR_FAMILY_OPTIONS = [
  { id: 'blanc', label: 'Blanc', hex: '#FFFFFF' },
  { id: 'noir', label: 'Noir', hex: '#26241F' },
  { id: 'gris', label: 'Gris', hex: '#9CA3AF' },
  { id: 'beige', label: 'Beige', hex: '#D8C3A5' },
  { id: 'marron', label: 'Marron', hex: '#8B5E3C' },
  { id: 'bleu', label: 'Bleu', hex: '#4A6FA5' },
  { id: 'rose', label: 'Rose', hex: '#E3937C' },
  { id: 'rouge', label: 'Rouge', hex: '#B5473F' },
  { id: 'vert', label: 'Vert', hex: '#6B8E63' },
  { id: 'jaune', label: 'Jaune', hex: '#E0C468' },
  { id: 'orange', label: 'Orange', hex: '#D98A47' },
  { id: 'violet', label: 'Violet', hex: '#8B6BA5' },
  { id: 'multicolore', label: 'Multicolore', hex: null },
];

const SEASON_OPTIONS = [
  { id: 'ete', label: 'Été' },
  { id: 'hiver', label: 'Hiver' },
  { id: 'mi-saison', label: 'Mi-saison' },
  { id: 'toute-saison', label: 'Toute saison' },
];

const WARMTH_OPTIONS = [
  { id: 'leger', label: 'Léger' },
  { id: 'chaud', label: 'Chaud' },
];

// Familles de couleurs "neutres" : elles se coordonnent avec n'importe quelle autre
// couleur, donc ne pénalisent pas la compatibilité d'une tenue ni le choix des pièces.
const NEUTRAL_COLOR_FAMILIES = ['blanc', 'noir', 'gris', 'beige', 'marron'];

// À partir de la couleur réellement détectée d'une pièce déjà choisie, renvoie les
// familles de couleurs compatibles à privilégier pour le reste de la tenue (elle-même,
// plus les neutres). Renvoie undefined si la pièce est neutre ou inconnue : dans ce cas
// n'importe quelle couleur se coordonne, donc aucun filtre n'est appliqué.
function compatibleColorFamilies(colorFamily) {
  if (!colorFamily || NEUTRAL_COLOR_FAMILIES.includes(colorFamily)) return undefined;
  return [colorFamily, ...NEUTRAL_COLOR_FAMILIES];
}

// Redimensionne et compresse la photo côté client (~1000px de large max, JPEG) avant
// tout envoi réseau, pour réduire le coût et le temps de réponse de l'analyse IA, et
// alléger ce qui est ensuite écrit sur le système de fichiers de l'appareil.
function compressImage(dataUrl, maxWidth = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error("Impossible de lire l'image."));
    img.src = dataUrl;
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));
    reader.readAsDataURL(file);
  });
}

// Nombre d'analyses IA menées en parallèle en mode "ajout rapide", pour ne pas saturer
// le réseau ni la fonction serverless quand plusieurs photos sont ajoutées d'un coup.
const QUICK_ADD_CONCURRENCY = 3;

// Appelle la fonction serverless /api/analyze-clothing (jamais l'API Anthropic
// directement depuis le client, pour ne jamais exposer la clé API). Timeout garanti en
// JS pour ne jamais bloquer l'écran si le réseau ou le service est indisponible — voir
// le repli manuel dans AddItemScreen.
// En app native (Capacitor), le WebView tourne sur sa propre origine locale
// (capacitor://localhost) — un fetch relatif n'atteindrait jamais la fonction
// serverless déployée sur Vercel. VITE_API_BASE_URL permet de pointer vers le
// déploiement au build ; vide par défaut (chemin relatif, correct pour le web).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function analyzeClothingPhoto(dataUrl, timeoutMs = 15000) {
  const [prefix, base64] = dataUrl.split(',');
  const mediaType = prefix?.match(/data:(.*);base64/)?.[1] || 'image/jpeg';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/api/analyze-clothing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: base64, mediaType }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'Analyse indisponible.');
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

const WEATHER_ICONS = {
  soleil: Sun,
  nuageux: CloudSun,
  couvert: Cloud,
  pluie: CloudRain,
  venteux: Wind,
};

const WEATHER_LABELS = {
  soleil: 'Ensoleillé',
  nuageux: 'Nuageux',
  couvert: 'Couvert',
  pluie: 'Pluvieux',
  venteux: 'Venteux',
};

const NAV_ITEMS = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'dressing', label: 'Dressing', icon: Shirt },
  { id: 'ai', label: 'IA', icon: Sparkles },
  { id: 'favorites', label: 'Favoris', icon: Heart },
  { id: 'profile', label: 'Profil', icon: User },
];

const SENSITIVITY_OPTIONS = [
  { id: 'froid', label: "J'ai souvent froid" },
  { id: 'normal', label: "Je suis à l'aise" },
  { id: 'chaud', label: "J'ai souvent chaud" },
];

const MEASUREMENT_FIELDS = [
  { id: 'height', label: 'Taille (cm)', placeholder: 'Ex : 168' },
  { id: 'chest', label: 'Tour de poitrine (cm)', placeholder: 'Ex : 90' },
  { id: 'waist', label: 'Tour de taille (cm)', placeholder: 'Ex : 70' },
  { id: 'shoeSize', label: 'Pointure', placeholder: 'Ex : 38' },
];

const STYLE_OPTIONS = ['Casual', 'Chic', 'Bohème', 'Sportswear', 'Minimaliste'];

const PRIVACY_CONTACT_EMAIL = 'marie.brunette35@gmail.com';

const PRIVACY_SECTIONS = [
  {
    title: "1. Éditeur de l'application",
    body: [
      `Athena Style est développée et éditée par Marie Brunette (entreprise individuelle), joignable à l'adresse : ${PRIVACY_CONTACT_EMAIL}`,
    ],
  },
  {
    title: '2. Données que nous traitons',
    subsections: [
      {
        title: '2.1 Photos de vêtements',
        body: [
          "Lorsque vous ajoutez un vêtement à votre dressing, l'application peut accéder à l'appareil photo ou à la galerie de votre téléphone pour capturer ou importer une image. Ces photos sont stockées localement sur votre appareil et ne sont pas transmises à nos serveurs ni à des tiers.",
        ],
      },
      {
        title: '2.2 Localisation',
        body: [
          "Avec votre autorisation, l'application utilise votre position approximative pour afficher la météo locale et adapter les suggestions de tenues. Cette donnée est transmise au service météo tiers Open-Meteo (voir section 4) uniquement pour obtenir les données météorologiques, et n'est pas conservée par nos soins.",
        ],
      },
      {
        title: '2.3 Informations de profil',
        body: [
          "Les informations que vous renseignez volontairement dans l'application (préférences de style, taille et mensurations, préférences météo) sont stockées localement sur votre appareil.",
        ],
      },
      {
        title: "2.4 Données d'usage",
        body: [
          "L'application peut enregistrer localement des statistiques d'utilisation de votre dressing (fréquence de port des vêtements) afin de vous fournir des suggestions personnalisées. Ces données restent sur votre appareil.",
        ],
      },
    ],
  },
  {
    title: '3. Ce que nous NE faisons PAS',
    list: [
      'Nous ne vendons pas vos données à des tiers.',
      'Nous ne partageons pas vos photos de vêtements avec des tiers.',
      "Nous n'utilisons pas vos données à des fins publicitaires.",
      'Nous ne créons pas de profil publicitaire vous concernant.',
    ],
  },
  {
    title: '4. Services tiers',
    body: [
      "L'application utilise le service Open-Meteo pour récupérer les données météorologiques en fonction de votre position approximative. Consultez leur politique de confidentialité sur open-meteo.com pour en savoir plus sur le traitement de cette donnée par ce service tiers.",
    ],
  },
  {
    title: '5. Conservation des données',
    body: [
      "Les données de l'application (dressing, préférences, statistiques) sont actuellement stockées localement sur votre appareil. Si vous désinstallez l'application, ces données sont supprimées.",
    ],
  },
  {
    title: '6. Vos droits',
    body: [
      "Conformément au Règlement Général sur la Protection des Données (RGPD) pour les utilisateurs européens, vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Étant donné que les données sont stockées localement sur votre appareil, vous pouvez les supprimer à tout moment en désinstallant l'application.",
      `Pour toute question relative à vos données, vous pouvez nous contacter à : ${PRIVACY_CONTACT_EMAIL}`,
    ],
  },
  {
    title: '7. Confidentialité des mineurs',
    body: [
      "L'application n'est pas destinée aux enfants de moins de 13 ans, et nous ne collectons pas sciemment de données auprès d'eux.",
    ],
  },
  {
    title: '8. Modifications de cette politique',
    body: [
      "Cette politique de confidentialité peut être mise à jour à mesure que l'application évolue (par exemple, si nous ajoutons un système de compte ou de sauvegarde en ligne). Toute modification substantielle vous sera communiquée via l'application.",
    ],
  },
  {
    title: '9. Contact',
    body: [`Pour toute question concernant cette politique de confidentialité, contactez-nous à : ${PRIVACY_CONTACT_EMAIL}`],
  },
];

const WEATHER_SCENARIOS = [
  { id: 'doux', label: 'Doux', weather: { temp: 21, condition: 'soleil' } },
  { id: 'pluie', label: 'Pluie', weather: { temp: 15, condition: 'pluie' } },
  { id: 'froid', label: 'Froid', weather: { temp: 4, condition: 'nuageux' } },
];

const DEFAULT_LOCATION = { name: 'Valence', latitude: 44.9334, longitude: 4.8924 };

const RAIN_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99,
]);

function mapWeatherCode(code, windSpeed) {
  if (RAIN_WEATHER_CODES.has(code)) return 'pluie';
  if ((windSpeed ?? 0) >= 30) return 'venteux';
  if (code === 0 || code === 1) return 'soleil';
  if (code === 3 || code === 45 || code === 48) return 'couvert';
  return 'nuageux';
}

// Timeout garanti côté JS : certaines WebViews (notamment iOS sans clé Info.plist, voir
// NSLocationWhenInUseUsageDescription) n'invoquent jamais le callback d'erreur et ignorent
// l'option `timeout` native de l'API — on ne peut donc pas compter dessus seule.
function getBrowserLocation(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Géolocalisation non disponible'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Délai de géolocalisation dépassé'));
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
      { timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeCity(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=fr&format=json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Géocodage indisponible');
  const data = await res.json();
  const match = data?.results?.[0];
  if (!match) return null;
  return { name: match.name, latitude: match.latitude, longitude: match.longitude };
}

async function fetchWeatherForLocation({ latitude, longitude }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Météo indisponible');
  const data = await res.json();
  return {
    temp: Math.round(data.current.temperature_2m),
    condition: mapWeatherCode(data.current.weather_code, data.current.wind_speed_10m),
    tempMax: Math.round(data.daily.temperature_2m_max[0]),
    tempMin: Math.round(data.daily.temperature_2m_min[0]),
  };
}

const seedClothes = [
  { id: 'c1', name: 'Chemise en lin blanche', category: 'haut', photo: null, color: '#EDEAE2', colorFamily: 'blanc', warmth: 'leger', laundry: false, wearCount: 14, monthsSinceWorn: 1 },
  { id: 'c2', name: 'Pull col rond mauve', category: 'haut', photo: null, color: '#957882', colorFamily: 'rose', warmth: 'chaud', laundry: false, wearCount: 22, monthsSinceWorn: 0 },
  { id: 'c3', name: 'Jean droit brut', category: 'bas', photo: null, color: '#3E4A5C', colorFamily: 'bleu', warmth: 'chaud', laundry: false, wearCount: 18, monthsSinceWorn: 0 },
  { id: 'c4', name: 'Pantalon tailleur', category: 'bas', photo: null, color: '#335056', colorFamily: 'bleu', warmth: 'leger', laundry: false, wearCount: 9, monthsSinceWorn: 2 },
  { id: 'c5', name: 'Robe fluide rose poudré', category: 'robe', photo: null, color: '#E3CCCA', colorFamily: 'rose', warmth: 'leger', laundry: false, wearCount: 3, monthsSinceWorn: 3 },
  { id: 'c6', name: 'Veste en jean', category: 'veste', photo: null, color: '#AEC1C1', colorFamily: 'bleu', warmth: 'leger', laundry: false, wearCount: 6, monthsSinceWorn: 1 },
  { id: 'c7', name: 'Trench beige', category: 'veste', photo: null, color: '#D8CFC0', colorFamily: 'beige', warmth: 'chaud', laundry: false, wearCount: 1, monthsSinceWorn: 8 },
  { id: 'c8', name: 'Baskets blanches', category: 'chaussures', photo: null, color: '#F2F2F2', colorFamily: 'blanc', warmth: 'leger', laundry: false, wearCount: 20, monthsSinceWorn: 0 },
  { id: 'c9', name: 'Mocassins bruns', category: 'chaussures', photo: null, color: '#8B5E3C', colorFamily: 'marron', warmth: 'chaud', laundry: false, wearCount: 5, monthsSinceWorn: 4 },
  { id: 'c10', name: 'Sac cabas naturel', category: 'accessoire', photo: null, color: '#C9B79C', colorFamily: 'beige', warmth: 'leger', laundry: false, wearCount: 8, monthsSinceWorn: 1 },
  { id: 'c11', name: 'Écharpe mauve', category: 'accessoire', photo: null, color: '#957882', colorFamily: 'rose', warmth: 'chaud', laundry: false, wearCount: 2, monthsSinceWorn: 5 },
  { id: 'c12', name: 'Débardeur côtelé', category: 'haut', photo: null, color: '#E3CCCA', colorFamily: 'rose', warmth: 'leger', laundry: false, wearCount: 0, monthsSinceWorn: null },
];

function computeStyleScores(items, weather) {
  if (!items.length) {
    return { colorMatch: 50, weatherFit: 50, elegance: 50, comfort: 50, originality: 50 };
  }

  const isRain = weather.condition === 'pluie';
  const isCold = weather.temp < 10;
  const hasVeste = items.some((i) => i.category === 'veste');
  const warmthMatch = isCold
    ? items.every((i) => i.warmth !== 'leger')
    : items.some((i) => i.warmth === 'leger');

  const weatherFit = Math.min(
    98,
    65 + (isRain && hasVeste ? 20 : 0) + (isCold && warmthMatch ? 20 : 0) + (!isRain && !isCold ? 15 : 0),
  );

  const colorFamilies = new Set(items.map((i) => i.colorFamily).filter(Boolean));
  // Les couleurs neutres (blanc, noir, gris, beige, marron) se coordonnent avec tout :
  // seules les couleurs non-neutres qui s'accumulent font baisser la compatibilité.
  const clashingFamilies = new Set(
    items.map((i) => i.colorFamily).filter((f) => f && !NEUTRAL_COLOR_FAMILIES.includes(f)),
  );
  const colorMatch = Math.min(96, Math.max(55, 96 - Math.max(0, clashingFamilies.size - 1) * 12));

  const warmthCategory = isCold ? 'chaud' : 'leger';
  const comfort = Math.min(96, 70 + items.filter((i) => i.warmth === warmthCategory).length * 6);

  const elegance = Math.min(
    95,
    60 + items.filter((i) => i.category === 'robe' || i.category === 'veste').length * 10 + (hasVeste ? 8 : 0),
  );

  const originality = Math.min(92, 50 + colorFamilies.size * 10 + (items.length >= 4 ? 10 : 0));

  return { colorMatch, weatherFit, elegance, comfort, originality };
}

function pickPreferred(pool, category, { warmthPref, colorFamilies } = {}) {
  const inCat = pool.filter((c) => c.category === category);
  if (!inCat.length) return null;
  let candidates = inCat;
  if (colorFamilies?.length) {
    const colorMatch = candidates.filter((c) => colorFamilies.includes(c.colorFamily));
    if (colorMatch.length) candidates = colorMatch;
  }
  if (warmthPref) {
    const warmthMatch = candidates.filter((c) => c.warmth === warmthPref);
    if (warmthMatch.length) candidates = warmthMatch;
  }
  return candidates[0] || inCat[0];
}

function generateOutfitForWeather(clothes, weather) {
  const pool = clothes.filter((c) => !c.laundry);
  const isRain = weather.condition === 'pluie';
  const isCold = weather.temp < 10;
  const warmthPref = isCold ? 'chaud' : 'leger';

  const items = [];
  const dress = !isRain && !isCold && weather.temp >= 20 ? pickPreferred(pool, 'robe', { warmthPref }) : null;
  let anchor = null;
  if (dress) {
    items.push(dress);
    anchor = dress;
  } else {
    const haut = pickPreferred(pool, 'haut', { warmthPref });
    if (haut) {
      items.push(haut);
      anchor = haut;
    }
    // Le bas est choisi pour se coordonner avec la couleur réellement détectée du haut.
    const bas = pickPreferred(pool, 'bas', { warmthPref, colorFamilies: compatibleColorFamilies(anchor?.colorFamily) });
    if (bas) items.push(bas);
  }

  // Le reste de la tenue se coordonne avec la couleur détectée de la pièce d'ancrage
  // (robe ou haut) plutôt que d'être choisi sans tenir compte des couleurs réelles.
  const colorFamilies = compatibleColorFamilies(anchor?.colorFamily);

  const chaussures = pickPreferred(pool, 'chaussures', { warmthPref, colorFamilies });
  if (chaussures) items.push(chaussures);

  if (isRain || isCold) {
    const veste = pickPreferred(pool, 'veste', { warmthPref, colorFamilies });
    if (veste) items.push(veste);
  }

  const accessoire = pickPreferred(pool, 'accessoire', { warmthPref, colorFamilies });
  if (accessoire) items.push(accessoire);

  const name = isRain ? 'Look pluie protégé' : isCold ? 'Look bien au chaud' : 'Look léger du jour';

  return {
    id: 'today',
    name,
    itemIds: items.map((i) => i.id),
    weather,
    scores: computeStyleScores(items, weather),
  };
}

const CONTEXT_RULES = [
  {
    id: 'professionnel',
    keywords: ['entretien', 'travail', 'bureau', 'boulot', 'professionnel', 'réunion', 'reunion', 'meeting'],
    label: 'un look professionnel',
    outfitName: 'Look professionnel',
    preferCategories: ['veste'],
    preferColorFamilies: ['bleu', 'blanc', 'beige'],
  },
  {
    id: 'soiree',
    keywords: ['soirée', 'soiree', 'resto', 'restaurant', 'rendez-vous', 'rdv', 'date', 'sortie', 'dîner', 'diner'],
    label: 'une tenue élégante pour ta soirée',
    outfitName: 'Look soirée',
    preferCategories: ['robe'],
    preferColorFamilies: ['rose', 'noir'],
  },
  {
    id: 'mariage',
    keywords: ['mariage', 'cérémonie', 'ceremonie'],
    label: 'une tenue chic pour ce mariage',
    outfitName: 'Look mariage chic',
    preferCategories: ['robe', 'veste'],
    preferColorFamilies: ['rose', 'beige', 'noir'],
  },
  {
    id: 'old-money',
    keywords: ['old money', 'preppy', 'chic discret'],
    label: 'un look old money',
    outfitName: 'Look old money',
    preferCategories: ['veste'],
    preferColorFamilies: ['beige', 'marron', 'blanc', 'bleu'],
  },
  {
    id: 'sport',
    keywords: ['sport', 'gym', 'courir', 'course', 'running', 'yoga', 'fitness'],
    label: 'une tenue sport',
    outfitName: 'Look sport',
    preferCategories: [],
    preferColorFamilies: [],
    forceWarmth: 'leger',
  },
  {
    id: 'casual',
    keywords: ['casual', 'décontracté', 'decontracte', 'weekend', 'balade', 'chill'],
    label: 'un look décontracté',
    outfitName: 'Look décontracté',
    preferCategories: [],
    preferColorFamilies: [],
  },
];

function detectContext(text) {
  const t = text.toLowerCase();
  return CONTEXT_RULES.find((rule) => rule.keywords.some((k) => t.includes(k))) || null;
}

function composeOutfitForContext(clothes, contextRule, weather) {
  const pool = clothes.filter((c) => !c.laundry);
  const isRain = weather.condition === 'pluie';
  const isCold = weather.temp < 10;
  const warmthPref = contextRule.forceWarmth || (isCold ? 'chaud' : 'leger');
  const colorFamilies = contextRule.preferColorFamilies;

  const items = [];
  const dress = contextRule.preferCategories.includes('robe')
    ? pickPreferred(pool, 'robe', { warmthPref, colorFamilies })
    : null;

  if (dress) {
    items.push(dress);
  } else {
    const haut = pickPreferred(pool, 'haut', { warmthPref, colorFamilies });
    const bas = pickPreferred(pool, 'bas', { warmthPref, colorFamilies });
    if (haut) items.push(haut);
    if (bas) items.push(bas);
  }

  const chaussures = pickPreferred(pool, 'chaussures', { warmthPref, colorFamilies });
  if (chaussures) items.push(chaussures);

  if (contextRule.preferCategories.includes('veste') || isRain || isCold) {
    const veste = pickPreferred(pool, 'veste', { warmthPref, colorFamilies });
    if (veste) items.push(veste);
  }

  const accessoire = pickPreferred(pool, 'accessoire', { warmthPref, colorFamilies });
  if (accessoire) items.push(accessoire);

  return {
    id: `context-${Date.now()}`,
    name: contextRule.outfitName,
    itemIds: items.map((i) => i.id),
    weather,
    scores: computeStyleScores(items, weather),
  };
}

function composeOutfitForDay(clothes, weather, event) {
  if (!event) return generateOutfitForWeather(clothes, weather);
  const context = detectContext(event.title) || CONTEXT_RULES.find((r) => r.id === 'casual');
  const outfit = composeOutfitForContext(clothes, context, weather);
  return { ...outfit, adaptedFor: event.title };
}

function buildWearInsights(clothes) {
  const insights = [];
  const worn = clothes.filter((c) => (c.wearCount ?? 0) > 0);
  const mostWorn = worn.reduce((best, c) => (!best || c.wearCount > best.wearCount ? c : best), null);
  if (mostWorn) {
    const rate = Math.max(1, Math.round(mostWorn.wearCount / 7));
    insights.push({
      icon: TrendingUp,
      title: mostWorn.name,
      description:
        mostWorn.wearCount >= 8
          ? `Porté environ ${rate}x par semaine — ta pièce chouchou !`
          : `Porté ${mostWorn.wearCount} fois jusqu'ici.`,
    });
  }

  const neverWorn = clothes.filter((c) => (c.wearCount ?? 0) === 0);
  if (neverWorn.length) {
    insights.push({
      icon: Clock,
      title: neverWorn[0].name,
      description: "Cette pièce n'a jamais été portée depuis son ajout.",
    });
  }

  const forgotten = clothes
    .filter((c) => (c.wearCount ?? 0) > 0 && (c.monthsSinceWorn ?? 0) >= 6)
    .sort((a, b) => b.monthsSinceWorn - a.monthsSinceWorn);
  if (forgotten.length) {
    insights.push({
      icon: Clock,
      title: forgotten[0].name,
      description: `Oubliée depuis ${forgotten[0].monthsSinceWorn} mois.`,
    });
  }

  if (!insights.length) {
    insights.push({
      icon: TrendingUp,
      title: 'Pas encore de données',
      description: 'Ajoute des vêtements pour voir tes habitudes de port.',
    });
  }

  return insights;
}

function pluralizeLabel(label, count) {
  const lower = label.toLowerCase();
  if (count <= 1 || lower.endsWith('s')) return lower;
  return `${lower}s`;
}

function buildWishlistSuggestions(clothes) {
  const suggestions = [];

  const counts = CATEGORIES.map((cat) => ({
    ...cat,
    count: clothes.filter((c) => c.category === cat.id).length,
  })).filter((c) => c.count > 0);

  if (counts.length >= 2) {
    const max = counts.reduce((a, b) => (b.count > a.count ? b : a));
    const min = counts.reduce((a, b) => (b.count < a.count ? b : a));
    if (max.count - min.count >= 2) {
      suggestions.push({
        icon: Lightbulb,
        title: `Beaucoup de ${pluralizeLabel(max.label, max.count)}`,
        description: `Tu as ${max.count} ${pluralizeLabel(max.label, max.count)}, mais seulement ${min.count} ${pluralizeLabel(min.label, min.count)}. Pense à varier !`,
      });
    }
  }

  const blackShoes = clothes.filter((c) => c.category === 'chaussures' && c.colorFamily === 'noir').length;
  const totalShoes = clothes.filter((c) => c.category === 'chaussures').length;
  if (totalShoes > 0 && blackShoes === 0) {
    suggestions.push({
      icon: Lightbulb,
      title: 'Aucune chaussure noire',
      description: 'Une paire noire est un basique polyvalent qui manque à ton dressing.',
    });
  }

  return suggestions.slice(0, 2);
}

const seedClothesById = Object.fromEntries(seedClothes.map((c) => [c.id, c]));

const seedOutfits = [
  { id: 'o1', name: 'Look bureau chic', itemIds: ['c2', 'c4', 'c9'], weather: { temp: 18, condition: 'nuageux' } },
  { id: 'o2', name: 'Casual weekend', itemIds: ['c1', 'c3', 'c8', 'c6'], weather: { temp: 22, condition: 'soleil' } },
  { id: 'o3', name: "Douceur d'été", itemIds: ['c5', 'c8', 'c11'], weather: { temp: 24, condition: 'soleil' } },
].map((o) => ({ ...o, scores: computeStyleScores(o.itemIds.map((id) => seedClothesById[id]), o.weather) }));

const initialWeek = [
  { day: 'Lundi', weather: { temp: 18, condition: 'nuageux' }, outfitId: 'o1' },
  { day: 'Mardi', weather: { temp: 20, condition: 'soleil' }, outfitId: null },
  { day: 'Mercredi', weather: { temp: 16, condition: 'pluie' }, outfitId: null },
  { day: 'Jeudi', weather: { temp: 19, condition: 'nuageux' }, outfitId: null },
  { day: 'Vendredi', weather: { temp: 23, condition: 'soleil' }, outfitId: null },
];

const seedEvents = [{ id: 'e1', day: 'Jeudi', title: "Entretien d'embauche", time: '10:00' }];

const seedMessages = [
  {
    id: 1, from: 'athena',
    text: "Bonjour Marie ! Je suis Athena, ta styliste personnelle. Dis-moi comment tu te sens ou pose-moi une question sur ta tenue du jour ✨",
  },
];

function generateAthenaResponse(text, { clothes, weather, todayOutfit }) {
  const t = text.toLowerCase();

  if (t.includes('pluie') || t.includes('pleu')) {
    const outfit = generateOutfitForWeather(clothes, { ...weather, condition: 'pluie' });
    return {
      text: "S'il pleut, mise sur une veste imperméable et des chaussures fermées. Voici ce que je te propose :",
      outfit: outfit.itemIds.length ? outfit : undefined,
    };
  }

  const context = detectContext(text);
  if (context) {
    const outfit = composeOutfitForContext(clothes, context, weather);
    if (!outfit.itemIds.length) {
      return {
        text: `J'ai bien noté pour ${context.label}, mais je ne trouve pas assez de pièces disponibles dans ton dressing (vérifie ton linge au lavage) !`,
      };
    }
    return { text: `Parfait, je te compose ${context.label} avec ce que tu as dans ton dressing :`, outfit };
  }

  if (t.includes('confort')) {
    return {
      text: `Pour un maximum de confort, "${todayOutfit.name}" est un excellent choix aujourd'hui : ${todayOutfit.scores.comfort}% de confort estimé.`,
      outfit: todayOutfit.itemIds.length ? todayOutfit : undefined,
    };
  }

  return {
    text: `Aujourd'hui, je te propose plutôt "${todayOutfit.name}", bien adapté à la météo du jour.`,
    outfit: todayOutfit.itemIds.length ? todayOutfit : undefined,
  };
}

function ScreenHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      <button
        onClick={onBack}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-pink/25 shadow-sm text-mauve shrink-0"
      >
        <ArrowLeft size={18} />
      </button>
      <h1 className="text-mauve font-semibold text-lg">{title}</h1>
    </div>
  );
}

function ClothingThumb({ item, className = 'w-14 h-14', iconSize = 22 }) {
  const photoSrcMap = useContext(PhotoSrcContext);
  const src = item?.photo ? photoSrcMap[item.photo] : null;
  const meta = CATEGORIES.find((c) => c.id === item?.category);
  const Icon = meta?.icon ?? Shirt;
  return (
    <div
      className={`rounded-xl overflow-hidden flex items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: src ? undefined : item?.color || '#AEC1C1' }}
    >
      {src ? (
        <img src={src} alt={item.name} className="w-full h-full object-cover" />
      ) : (
        <Icon size={iconSize} className="text-white" />
      )}
    </div>
  );
}

function ScoreBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-teal/80">{label}</span>
        <span className="font-semibold text-teal">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-bluegray/30 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
        active ? 'bg-mauve text-cream' : 'bg-pink/15 text-teal/70 border border-bluegray/40'
      }`}
    >
      {children}
    </button>
  );
}

function BottomNav({ active, onChange }) {
  return (
    <div className="shrink-0 bg-pink/15 backdrop-blur border-t border-bluegray/30 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 flex justify-between">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const isActive = active === id;
        return (
          <button key={id} onClick={() => onChange(id)} className="flex-1 flex flex-col items-center gap-1 py-1">
            <div
              className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                isActive ? 'bg-mauve text-cream' : 'text-teal/40'
              }`}
            >
              <Icon size={20} />
            </div>
            <span className={`text-[11px] font-medium ${isActive ? 'text-mauve' : 'text-teal/35'}`}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HomeScreen({
  weather,
  weatherMeta,
  onRefreshWeather,
  onChangeWeather,
  todayOutfit,
  clothesById,
  clothes,
  onOpenOutfit,
  onOpenWeek,
  onOpenAdd,
}) {
  const WeatherIcon = WEATHER_ICONS[weather.condition] ?? Sun;
  return (
    <div className="px-5 pt-6 pb-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-mauve text-sm">Bonjour Marie ✨</p>
          <h1 className="text-mauve text-2xl font-semibold">Ta journée</h1>
        </div>
        <div className="w-11 h-11 rounded-full bg-pink/50 flex items-center justify-center text-mauve font-semibold">
          MB
        </div>
      </div>

      <div className="bg-mauve rounded-3xl p-5 text-cream shadow-lg flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-cream/70 text-xs uppercase tracking-wide">Météo du jour</p>
            {weatherMeta.loading && <Loader2 size={11} className="animate-spin text-cream/70 shrink-0" />}
          </div>
          <p className="text-3xl font-semibold mt-1">{weather.temp}°</p>
          <p className="text-sm text-cream/80">{WEATHER_LABELS[weather.condition]}</p>
          <p className="text-xs text-cream/60 mt-1.5 flex items-center gap-1 truncate">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{weatherMeta.location || '…'}</span>
            {weatherMeta.tempMax != null && (
              <span className="shrink-0">
                · ↑{weatherMeta.tempMax}° ↓{weatherMeta.tempMin}°
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <WeatherIcon size={40} className="text-pink" />
          <button onClick={onRefreshWeather} className="text-cream/70 p-1 -m-1">
            <RefreshCw size={14} className={weatherMeta.loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {weatherMeta.error && <p className="text-xs text-mauve/70 -mt-3 px-1">{weatherMeta.error}</p>}

      <div>
        <p className="text-xs text-mauve/60 mb-1.5 px-1">Tester un scénario météo</p>
        <div className="flex gap-2">
          {WEATHER_SCENARIOS.map((s) => {
            const Icon = WEATHER_ICONS[s.weather.condition] ?? Sun;
            const active = weather.condition === s.weather.condition && weather.temp === s.weather.temp;
            return (
              <button
                key={s.id}
                onClick={() => onChangeWeather(s.weather)}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition whitespace-nowrap ${
                  active ? 'bg-mauve text-cream' : 'bg-pink/15 text-mauve'
                }`}
              >
                <Icon size={14} /> {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-pink/15 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-mauve font-semibold">Ta tenue du jour</h2>
          <span className="text-xs text-mauve bg-pink/40 px-2 py-1 rounded-full shrink-0">
            {todayOutfit.scores.weatherFit}% adapté
          </span>
        </div>
        {todayOutfit.adaptedFor && (
          <span className="inline-flex items-center gap-1 text-[11px] text-mauve bg-mauve/15 px-2 py-1 rounded-full mb-3">
            <Calendar size={11} /> Adapté pour : {todayOutfit.adaptedFor}
          </span>
        )}
        {todayOutfit.itemIds.length ? (
          <>
            <div className="flex gap-2 mb-4">
              {todayOutfit.itemIds.map((id) => (
                <ClothingThumb key={id} item={clothesById[id]} className="w-16 h-16" iconSize={26} />
              ))}
            </div>
            <button
              onClick={onOpenOutfit}
              className="w-full bg-mauve text-cream rounded-full py-3 font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
            >
              Voir le détail <ChevronRight size={18} />
            </button>
          </>
        ) : (
          <p className="text-sm text-mauve/70 py-2">
            Pas assez de vêtements disponibles pour composer une tenue — vérifie ton linge au lavage !
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={onOpenWeek} className="bg-bluegray/25 rounded-2xl p-4 flex flex-col items-start gap-2 text-left">
          <Calendar size={22} className="text-teal/70" />
          <span className="text-teal/70 font-medium text-sm">Ma semaine</span>
        </button>
        <button onClick={onOpenAdd} className="bg-pink/50 rounded-2xl p-4 flex flex-col items-start gap-2 text-left">
          <Plus size={22} className="text-mauve" />
          <span className="text-mauve font-medium text-sm">Ajouter un vêtement</span>
        </button>
      </div>

      <div>
        <h2 className="text-mauve font-semibold mb-3">Dressing récent</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {clothes
            .slice(-6)
            .reverse()
            .map((item) => (
              <div key={item.id} className="flex flex-col items-center gap-1">
                <ClothingThumb item={item} className="w-14 h-14" iconSize={22} />
                <span className="text-[10px] text-mauve max-w-[56px] truncate">{item.name}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function DressingScreen({ clothes, onToggleLaundry, onOpenItem }) {
  const [filter, setFilter] = useState('tous');
  const filtered = filter === 'tous' ? clothes : clothes.filter((c) => c.category === filter);
  return (
    <div className="px-5 pt-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-mauve text-2xl font-semibold">Mon Dressing</h1>
        <span className="text-xs text-mauve bg-pink/40 px-2 py-1 rounded-full">{clothes.length} pièces</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
        <FilterChip active={filter === 'tous'} onClick={() => setFilter('tous')}>
          Tous
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)}>
            {c.label}
          </FilterChip>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center text-mauve py-16">Aucun vêtement dans cette catégorie.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((item) => {
            const meta = CATEGORIES.find((c) => c.id === item.category);
            return (
              <div
                key={item.id}
                className={`bg-pink/15 rounded-2xl p-2.5 shadow-sm flex flex-col gap-2 transition ${
                  item.laundry ? 'opacity-60' : ''
                }`}
              >
                <button onClick={() => onOpenItem(item.id)} className="text-left flex flex-col gap-2">
                  <div className="relative">
                    <ClothingThumb
                      item={item}
                      className={`w-full aspect-square ${item.laundry ? 'grayscale' : ''}`}
                      iconSize={28}
                    />
                    {item.laundry && (
                      <span className="absolute top-1.5 left-1.5 bg-mauve text-cream text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                        Au lavage
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-teal truncate">{item.name}</p>
                    <p className="text-xs text-mauve">{meta?.label}</p>
                    {(item.color || item.material) && (
                      <div className="flex items-center gap-1.5 mt-1 min-w-0">
                        {item.color && (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color, boxShadow: 'inset 0 0 0 1px rgba(51,80,86,0.25)' }}
                          />
                        )}
                        {item.material && <span className="text-[11px] text-teal/60 truncate">{item.material}</span>}
                      </div>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => onToggleLaundry(item.id)}
                  className={`flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-1 self-start transition ${
                    item.laundry ? 'bg-mauve text-cream' : 'bg-bluegray/25 text-teal/70'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                      item.laundry ? 'bg-cream border-cream' : 'border-teal/40 bg-transparent'
                    }`}
                  >
                    {item.laundry && <Check size={10} className="text-mauve" />}
                  </span>
                  Au lavage
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatScreen({ messages, onSend, clothesById, onOpenOutfit }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const quickPrompts = ["Que porter s'il pleut ?", 'Une tenue confortable', "J'ai un entretien", 'Look old money'];

  function handleSend(t) {
    if (!t.trim()) return;
    onSend(t);
    setText('');
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-3 flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 rounded-full bg-mauve flex items-center justify-center text-cream">
          <Sparkles size={20} />
        </div>
        <div>
          <h1 className="text-mauve font-semibold text-lg">Athena</h1>
          <p className="text-xs text-mauve">Ta styliste IA</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-3 pb-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.from === 'athena'
                ? 'bg-pink/20 text-teal self-start rounded-tl-sm shadow-sm'
                : 'bg-mauve text-cream self-end rounded-tr-sm'
            }`}
          >
            {m.text}
            {m.outfit && (
              <div className="mt-2.5 pt-2.5 border-t border-mauve/20">
                <div className="flex gap-1.5 mb-2">
                  {m.outfit.itemIds.map((id) => (
                    <ClothingThumb key={id} item={clothesById[id]} className="w-10 h-10" iconSize={16} />
                  ))}
                </div>
                <button
                  onClick={() => onOpenOutfit(m.outfit)}
                  className="text-xs font-semibold text-mauve underline underline-offset-2"
                >
                  {m.outfit.name} · Voir le détail
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="px-5 pb-2 flex gap-2 overflow-x-auto shrink-0">
        {quickPrompts.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-pink/50 text-mauve font-medium"
          >
            {p}
          </button>
        ))}
      </div>

      <div className="px-5 pb-5 pt-2 flex gap-2 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend(text);
          }}
          placeholder="Écris à Athena..."
          className="flex-1 bg-pink/15 rounded-full px-4 py-2.5 text-sm text-teal placeholder:text-mauve/60 outline-none shadow-sm"
        />
        <button
          onClick={() => handleSend(text)}
          className="w-11 h-11 rounded-full bg-mauve text-cream flex items-center justify-center shrink-0 active:scale-95 transition"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

function FavoritesScreen({ outfits, favorites, clothesById, onOpen, onToggleFavorite }) {
  const favOutfits = outfits.filter((o) => favorites.includes(o.id));
  return (
    <div className="px-5 pt-6 pb-6">
      <h1 className="text-mauve text-2xl font-semibold mb-4">Mes Favoris</h1>
      {favOutfits.length === 0 ? (
        <div className="text-center text-mauve py-20 flex flex-col items-center gap-3">
          <Heart size={32} className="text-mauve/50" />
          <p>Aucune tenue enregistrée pour l'instant.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {favOutfits.map((o) => (
            <div
              key={o.id}
              onClick={() => onOpen(o.id)}
              className="bg-pink/15 rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left cursor-pointer"
            >
              <div className="flex -space-x-3">
                {o.itemIds.slice(0, 3).map((id) => (
                  <ClothingThumb key={id} item={clothesById[id]} className="w-12 h-12 border-2 border-white" iconSize={18} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-mauve truncate">{o.name}</p>
                <p className="text-xs text-mauve">
                  Élégance {o.scores.elegance}% · Confort {o.scores.comfort}%
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(o.id);
                }}
                className="text-mauve shrink-0"
              >
                <Heart size={20} fill="currentColor" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-pink/15 rounded-2xl py-3 flex flex-col items-center shadow-sm">
      <span className="text-teal text-lg font-semibold">{value}</span>
      <span className="text-mauve text-[11px]">{label}</span>
    </div>
  );
}

function InsightCard({ icon: Icon, title, description }) {
  return (
    <div className="bg-pink/15 rounded-2xl p-4 shadow-sm flex gap-3 items-start">
      <div className="w-9 h-9 rounded-full bg-mauve/20 flex items-center justify-center text-mauve shrink-0">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-teal text-sm font-medium truncate">{title}</p>
        <p className="text-mauve text-xs mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function StatsScreen({ clothes, onBack }) {
  const insights = useMemo(() => buildWearInsights(clothes), [clothes]);
  const wishlist = useMemo(() => buildWishlistSuggestions(clothes), [clothes]);

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Statistiques" onBack={onBack} />

      <div>
        <h2 className="text-mauve font-semibold mb-3">Habitudes de port</h2>
        <div className="flex flex-col gap-3">
          {insights.map((insight, i) => (
            <InsightCard key={i} {...insight} />
          ))}
        </div>
      </div>

      {wishlist.length > 0 && (
        <div>
          <h2 className="text-mauve font-semibold mb-3">Idées pour ta garde-robe</h2>
          <div className="flex flex-col gap-3">
            {wishlist.map((tip, i) => (
              <InsightCard key={i} {...tip} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-4 py-3.5 text-left gap-3">
      <div className="min-w-0">
        <span className="text-teal text-sm block">{label}</span>
        {value && <span className="text-mauve text-xs truncate block mt-0.5">{value}</span>}
      </div>
      <ChevronRight size={16} className="text-mauve shrink-0" />
    </button>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="w-full flex items-center justify-between px-4 py-3.5">
      <span className="text-teal text-sm">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${value ? 'bg-mauve' : 'bg-bluegray/50'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function ProfileScreen({
  clothes,
  outfits,
  favorites,
  weatherPrefs,
  measurements,
  stylePrefs,
  notif,
  onToggleNotif,
  onOpenWeatherPrefs,
  onOpenMeasurements,
  onOpenStylePrefs,
  onOpenStats,
  session,
  onOpenAuth,
  onLogoutClick,
  onOpenPrivacy,
  onClearDataClick,
}) {
  const weatherValue = weatherPrefs.city
    ? [weatherPrefs.city, SENSITIVITY_OPTIONS.find((o) => o.id === weatherPrefs.sensitivity)?.label]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  const hasMeasurements = MEASUREMENT_FIELDS.some((f) => measurements[f.id]);
  const measurementsValue = hasMeasurements
    ? [measurements.height && `${measurements.height} cm`, measurements.shoeSize && `Pointure ${measurements.shoeSize}`]
        .filter(Boolean)
        .join(' · ') || 'Renseignées'
    : undefined;

  const styleValue = stylePrefs.length ? stylePrefs.join(', ') : undefined;
  const email = session?.user?.email;

  return (
    <div className="px-5 pt-6 pb-6 flex flex-col gap-5">
      {email ? (
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="w-20 h-20 rounded-full bg-pink/50 flex items-center justify-center text-mauve text-2xl font-semibold">
            {email.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-center">
            <h1 className="text-mauve text-xl font-semibold">Mon compte</h1>
            <p className="text-mauve text-sm">{email}</p>
          </div>
        </div>
      ) : (
        <button onClick={onOpenAuth} className="flex flex-col items-center gap-3 pt-2">
          <div className="w-20 h-20 rounded-full bg-pink/50 flex items-center justify-center text-mauve">
            <User size={30} />
          </div>
          <div className="text-center">
            <p className="text-mauve font-semibold">Se connecter</p>
            <p className="text-mauve/70 text-xs">Sauvegarde ton dressing dans le cloud</p>
          </div>
        </button>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Vêtements" value={clothes.length} />
        <StatCard label="Tenues" value={outfits.length} />
        <StatCard label="Favoris" value={favorites.length} />
      </div>

      <button
        onClick={onOpenStats}
        className="w-full bg-mauve rounded-2xl p-4 shadow-sm flex items-center justify-between text-cream"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-cream/20 flex items-center justify-center shrink-0">
            <TrendingUp size={18} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-medium">Statistiques du dressing</p>
            <p className="text-cream/70 text-xs">Habitudes de port & suggestions</p>
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0" />
      </button>

      <div className="bg-pink/10 rounded-2xl shadow-sm divide-y divide-bluegray/20 overflow-hidden">
        <SettingRow label="Préférences météo" value={weatherValue} onClick={onOpenWeatherPrefs} />
        <SettingRow label="Taille & mensurations" value={measurementsValue} onClick={onOpenMeasurements} />
        <SettingRow label="Style préféré" value={styleValue} onClick={onOpenStylePrefs} />
        <ToggleRow label="Notifications" value={notif} onChange={onToggleNotif} />
      </div>

      {email && (
        <button onClick={onLogoutClick} className="w-full text-mauve text-sm py-3 font-medium">
          Se déconnecter
        </button>
      )}

      <button
        onClick={onClearDataClick}
        className="w-full flex items-center justify-center gap-1.5 text-mauve/70 text-xs font-medium py-1"
      >
        <Trash2 size={13} /> Effacer mes données
      </button>

      <button onClick={onOpenPrivacy} className="w-full text-mauve/50 text-xs pb-2">
        Politique de confidentialité
      </button>
    </div>
  );
}

function TextWithEmail({ text }) {
  const parts = text.split(PRIVACY_CONTACT_EMAIL);
  if (parts.length === 1) return text;
  return (
    <>
      {parts[0]}
      <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-mauve underline underline-offset-2">
        {PRIVACY_CONTACT_EMAIL}
      </a>
      {parts[1]}
    </>
  );
}

function PrivacyScreen({ onBack }) {
  return (
    <div className="px-5 pt-6 pb-10 flex flex-col gap-5">
      <ScreenHeader title="Politique de confidentialité" onBack={onBack} />

      <div className="-mt-2">
        <p className="text-xs text-mauve/70">Dernière mise à jour : 24 juillet 2026</p>
        <p className="text-sm text-teal leading-relaxed mt-3">
          Cette politique de confidentialité décrit comment l'application Athena Style (« l'application », « nous »)
          traite les informations lorsque vous l'utilisez.
        </p>
      </div>

      <div className="flex flex-col">
        {PRIVACY_SECTIONS.map((section) => (
          <div key={section.title} className="py-4 border-t border-bluegray/20 first:border-t-0 first:pt-0">
            <h2 className="text-mauve font-semibold text-sm mb-2">{section.title}</h2>

            {section.body?.map((paragraph, i) => (
              <p key={i} className="text-sm text-teal leading-relaxed mb-2 last:mb-0">
                <TextWithEmail text={paragraph} />
              </p>
            ))}

            {section.list && (
              <ul className="list-disc list-inside flex flex-col gap-1.5">
                {section.list.map((item) => (
                  <li key={item} className="text-sm text-teal leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            )}

            {section.subsections && (
              <div className="flex flex-col gap-4 mt-1">
                {section.subsections.map((sub) => (
                  <div key={sub.title}>
                    <h3 className="text-teal font-semibold text-sm mb-1.5">{sub.title}</h3>
                    {sub.body.map((paragraph, i) => (
                      <p key={i} className="text-sm text-teal leading-relaxed">
                        <TextWithEmail text={paragraph} />
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeatherPrefsScreen({ prefs, onSave, onBack }) {
  const [city, setCity] = useState(prefs.city);
  const [sensitivity, setSensitivity] = useState(prefs.sensitivity);

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Préférences météo" onBack={onBack} />

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Ville</label>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ex : Paris"
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
        />
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Ressenti de la température</label>
        <div className="flex flex-col gap-2">
          {SENSITIVITY_OPTIONS.map((o) => {
            const active = sensitivity === o.id;
            return (
              <button
                key={o.id}
                onClick={() => setSensitivity(o.id)}
                className={`w-full text-left px-4 py-3 rounded-2xl border transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onSave({ city: city.trim(), sensitivity })}
        className="w-full bg-mauve text-cream rounded-full py-3.5 font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        <Check size={18} /> Enregistrer
      </button>
    </div>
  );
}

function MeasurementsScreen({ measurements, onSave, onBack }) {
  const [values, setValues] = useState(measurements);

  function update(id, val) {
    setValues((prev) => ({ ...prev, [id]: val }));
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Taille & mensurations" onBack={onBack} />

      <div className="grid grid-cols-2 gap-4">
        {MEASUREMENT_FIELDS.map((f) => (
          <div key={f.id}>
            <label className="text-teal text-sm font-medium mb-2 block">{f.label}</label>
            <input
              value={values[f.id]}
              onChange={(e) => update(f.id, e.target.value)}
              placeholder={f.placeholder}
              inputMode="numeric"
              className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => onSave(values)}
        className="w-full bg-mauve text-cream rounded-full py-3.5 font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        <Check size={18} /> Enregistrer
      </button>
    </div>
  );
}

function StylePrefsScreen({ selected, onSave, onBack }) {
  const [chosen, setChosen] = useState(selected);

  function toggle(style) {
    setChosen((prev) => (prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]));
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Style préféré" onBack={onBack} />

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Choisis un ou plusieurs styles</label>
        <div className="flex flex-wrap gap-2">
          {STYLE_OPTIONS.map((style) => {
            const active = chosen.includes(style);
            return (
              <button
                key={style}
                onClick={() => toggle(style)}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                {style}
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => onSave(chosen)}
        className="w-full bg-mauve text-cream rounded-full py-3.5 font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition"
      >
        <Check size={18} /> Enregistrer
      </button>
    </div>
  );
}

function EventFormScreen({ event, day, onSave, onDelete, onBack }) {
  const [title, setTitle] = useState(event?.title || '');
  const [time, setTime] = useState(event?.time || '18:00');

  const detected = title.trim() ? detectContext(title) || CONTEXT_RULES.find((r) => r.id === 'casual') : null;

  function handleSubmit() {
    if (!title.trim()) return;
    onSave({ day: event?.day || day, title: title.trim(), time });
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title={event ? "Modifier l'événement" : 'Ajouter un événement'} onBack={onBack} />

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Jour</label>
        <p className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-mauve font-medium">
          {event?.day || day}
        </p>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Titre</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex : Réunion client"
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
        />
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Heure</label>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm"
        />
      </div>

      {detected && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-2 px-1">
          <Sparkles size={12} className="shrink-0" /> Tenue "{detected.outfitName}" détectée automatiquement
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!title.trim()}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          title.trim() ? 'bg-mauve text-cream active:scale-[0.98]' : 'bg-bluegray/40 text-teal/40'
        }`}
      >
        <Check size={18} /> Enregistrer
      </button>

      {event && (
        <button onClick={() => onDelete(event.id)} className="w-full text-mauve text-sm py-2 font-medium">
          Supprimer l'événement
        </button>
      )}
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-teal/40 backdrop-blur-sm px-6">
      <div className="w-full bg-cream rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
        <div>
          <h2 className="text-mauve font-semibold text-lg mb-1">{title}</h2>
          <p className="text-teal text-sm">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 bg-bluegray/30 text-teal rounded-full py-2.5 text-sm font-medium">
            Annuler
          </button>
          <button onClick={onConfirm} className="flex-1 bg-mauve text-cream rounded-full py-2.5 text-sm font-medium">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Traduit les messages d'erreur bruts renvoyés par Supabase Auth en français, pour ne
// jamais afficher de texte technique anglais à l'utilisatrice.
const AUTH_ERROR_MESSAGES = {
  'Invalid login credentials': 'Email ou mot de passe incorrect.',
  'User already registered': 'Un compte existe déjà avec cet email — connecte-toi plutôt.',
  'Email not confirmed': 'Confirme ton adresse email (lien reçu par mail) avant de te connecter.',
  'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
};

function AuthScreen({ onBack, onAuthSuccess }) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  function switchMode(next) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  // Si les variables VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY sont absentes de
  // l'environnement qui sert l'app (fichier .env.local en dev, variables Vercel en prod —
  // voir le README), `supabase` vaut null. Plutôt qu'un simple message discret dans le
  // formulaire (facile à manquer, et qui donnait l'impression que le bouton "ne faisait
  // rien"), on remplace tout l'écran par un état explicite pour que ce soit sans ambiguïté.
  if (!supabase) {
    return (
      <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
        <ScreenHeader title="Mon compte" onBack={onBack} />
        <div className="bg-pink/15 rounded-3xl p-5 shadow-sm flex flex-col items-center text-center gap-2">
          <Sparkles size={22} className="text-mauve" />
          <p className="text-teal text-sm font-medium">La sauvegarde cloud n'est pas configurée</p>
          <p className="text-teal/70 text-xs leading-relaxed">
            VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY sont absentes de l'environnement qui sert l'app
            (fichier .env.local en développement, variables Vercel en production). Voir le README, section
            "Compte et sauvegarde cloud".
          </p>
        </div>
      </div>
    );
  }

  async function handleSubmit() {
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('Renseigne ton email et ton mot de passe.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        onAuthSuccess(data.session);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        if (data.session) {
          onAuthSuccess(data.session);
        } else {
          setInfo('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse avant de te connecter.');
          setMode('signin');
        }
      }
    } catch (err) {
      const isNetworkError = err instanceof TypeError || /fetch|network/i.test(err.message || '');
      setError(
        isNetworkError
          ? 'Impossible de contacter le service. Vérifie ta connexion et réessaie.'
          : AUTH_ERROR_MESSAGES[err.message] || err.message || 'Une erreur est survenue, réessaie.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Mon compte" onBack={onBack} />

      <div className="flex gap-1 bg-pink/10 rounded-full p-1">
        <button
          onClick={() => switchMode('signin')}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
            mode === 'signin' ? 'bg-mauve text-cream' : 'text-teal/70'
          }`}
        >
          Se connecter
        </button>
        <button
          onClick={() => switchMode('signup')}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
            mode === 'signup' ? 'bg-mauve text-cream' : 'text-teal/70'
          }`}
        >
          Créer un compte
        </button>
      </div>

      <p className="text-sm text-teal leading-relaxed -mt-2">
        {mode === 'signin'
          ? 'Connecte-toi pour retrouver ton dressing sur tous tes appareils.'
          : "Crée un compte pour ne plus jamais perdre ton dressing, même en cas de changement de téléphone."}
      </p>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Email</label>
        <div className="relative">
          <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-mauve/60" />
          <input
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@exemple.com"
            className="w-full bg-pink/15 rounded-xl pl-11 pr-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
          />
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Mot de passe</label>
        <div className="relative">
          <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-mauve/60" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8 caractères minimum"
            className="w-full bg-pink/15 rounded-xl pl-11 pr-11 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-mauve/60"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-2 px-1">
          <Sparkles size={12} className="shrink-0" /> {error}
        </p>
      )}
      {info && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-2 px-1">
          <Sparkles size={12} className="shrink-0" /> {info}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          loading ? 'bg-bluegray/40 text-teal/40' : 'bg-mauve text-cream active:scale-[0.98]'
        }`}
      >
        {loading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Check size={18} />
        )}
        {mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
      </button>
    </div>
  );
}

function AddItemScreen({ onBack, onSave, onSaveMany }) {
  const [mode, setMode] = useState('single');
  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Ajouter un vêtement" onBack={onBack} />

      <div className="flex gap-1 bg-pink/10 rounded-full p-1">
        <button
          onClick={() => setMode('single')}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
            mode === 'single' ? 'bg-mauve text-cream' : 'text-teal/70'
          }`}
        >
          Un par un
        </button>
        <button
          onClick={() => setMode('batch')}
          className={`flex-1 rounded-full py-2 text-sm font-medium transition ${
            mode === 'batch' ? 'bg-mauve text-cream' : 'text-teal/70'
          }`}
        >
          Ajout rapide
        </button>
      </div>

      {mode === 'single' ? <SingleAddForm onSave={onSave} /> : <QuickAddPanel onSaveMany={onSaveMany} />}
    </div>
  );
}

function SingleAddForm({ onSave }) {
  const [photo, setPhoto] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(null);
  const [color, setColor] = useState(undefined);
  const [colorFamily, setColorFamily] = useState(undefined);
  const [warmth, setWarmth] = useState('leger');
  const [material, setMaterial] = useState(undefined);
  const [season, setSeason] = useState(undefined);
  const [detecting, setDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [detectionError, setDetectionError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let compressed;
      try {
        compressed = await compressImage(reader.result);
      } catch {
        compressed = reader.result;
      }
      setPhoto(compressed);
      setAutoDetected(false);
      setDetectionError(null);
      setDetecting(true);

      try {
        const detected = await analyzeClothingPhoto(compressed);
        setName(detected.name || '');
        setCategory(CATEGORIES.some((c) => c.id === detected.category) ? detected.category : null);
        setColor(detected.color);
        setColorFamily(detected.colorFamily);
        setWarmth(detected.warmth === 'chaud' ? 'chaud' : 'leger');
        setMaterial(detected.material);
        setSeason(detected.season);
        setAutoDetected(true);
      } catch {
        setDetectionError("L'analyse automatique n'a pas fonctionné, renseigne les informations ci-dessous.");
      } finally {
        setDetecting(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!category || saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || `${CATEGORIES.find((c) => c.id === category).label} sans nom`,
        category,
        photo,
        color: color ?? (photo ? undefined : PLACEHOLDER_COLORS[category]),
        colorFamily,
        warmth,
        material,
        season,
      });
    } catch {
      setSaveError("L'enregistrement a échoué (vérifie ta connexion) — le vêtement n'a pas été ajouté.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="bg-pink/15 rounded-3xl p-4 shadow-sm">
        <div className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-mauve/40 bg-cream flex items-center justify-center overflow-hidden mb-3 relative">
          {photo ? (
            <img src={photo} alt="Aperçu" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-mauve">
              <Camera size={28} />
              <span className="text-sm">Ajoute une photo</span>
            </div>
          )}
          {detecting && (
            <div className="absolute inset-0 bg-teal/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 text-cream">
              <Loader2 size={26} className="animate-spin" />
              <span className="text-sm font-medium">Analyse de la photo...</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            disabled={detecting}
            className="flex-1 flex items-center justify-center gap-2 bg-mauve text-cream rounded-full py-2.5 px-2 text-sm font-medium whitespace-nowrap disabled:opacity-60"
          >
            <Camera size={16} /> Caméra
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={detecting}
            className="flex-1 flex items-center justify-center gap-2 bg-bluegray/40 text-teal rounded-full py-2.5 px-2 text-sm font-medium whitespace-nowrap disabled:opacity-60"
          >
            <Upload size={16} /> Galerie
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>

      {autoDetected && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-3 px-1">
          <Sparkles size={12} className="shrink-0" /> Détecté automatiquement, tu peux ajuster si besoin
        </p>
      )}

      {detectionError && (
        <p className="text-xs text-mauve/70 flex items-center gap-1.5 -mt-3 px-1">
          <Sparkles size={12} className="shrink-0" /> {detectionError}
        </p>
      )}

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Nom (optionnel)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Chemise en lin"
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
        />
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Catégorie</label>
        <div className="grid grid-cols-3 gap-2.5">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Couleur</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_FAMILY_OPTIONS.map((cf) => {
            const active = colorFamily === cf.id;
            return (
              <button
                key={cf.id}
                onClick={() => {
                  setColorFamily(cf.id);
                  if (cf.hex) setColor(cf.hex);
                }}
                className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-teal/20 shrink-0"
                  style={{
                    background:
                      cf.hex ?? 'conic-gradient(from 0deg, #E3937C, #4A6FA5, #E0C468, #6B8E63, #E3937C)',
                  }}
                />
                <span className="text-xs font-medium">{cf.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Matière (optionnel)</label>
        <input
          value={material ?? ''}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Ex : coton, laine, cuir..."
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
        />
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Saison</label>
        <div className="grid grid-cols-2 gap-2.5">
          {SEASON_OPTIONS.map((s) => {
            const active = season === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSeason(s.id)}
                className={`py-2.5 rounded-2xl border text-sm font-medium transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Niveau de chaleur</label>
        <div className="grid grid-cols-2 gap-2.5">
          {WARMTH_OPTIONS.map((w) => {
            const active = warmth === w.id;
            return (
              <button
                key={w.id}
                onClick={() => setWarmth(w.id)}
                className={`py-2.5 rounded-2xl border text-sm font-medium transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-3 px-1">
          <Sparkles size={12} className="shrink-0" /> {saveError}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!category || detecting || saving}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          category && !detecting && !saving ? 'bg-mauve text-cream active:scale-[0.98]' : 'bg-bluegray/40 text-teal/40'
        }`}
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
        Valider
      </button>
    </>
  );
}

function QuickAddEditModal({ item, onChange, onClose }) {
  return (
    <div className="absolute inset-0 z-30 flex items-end sm:items-center justify-center bg-teal/40 backdrop-blur-sm px-0 sm:px-6">
      <div className="w-full max-h-[88%] overflow-y-auto bg-cream rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-mauve font-semibold text-lg">Modifier la pièce</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-pink/20 flex items-center justify-center text-teal shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {item.photo && <img src={item.photo} alt="Aperçu" className="w-full aspect-[4/3] object-cover rounded-2xl" />}

        {item.status === 'error' && (
          <p className="text-xs text-mauve/70 flex items-center gap-1.5 px-1">
            <Sparkles size={12} className="shrink-0" /> L'analyse automatique n'a pas fonctionné, renseigne les informations ci-dessous.
          </p>
        )}

        <div>
          <label className="text-teal text-sm font-medium mb-2 block">Nom (optionnel)</label>
          <input
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ex : Chemise en lin"
            className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
          />
        </div>

        <div>
          <label className="text-teal text-sm font-medium mb-2 block">Catégorie</label>
          <div className="grid grid-cols-3 gap-2.5">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = item.category === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onChange({ category: c.id })}
                  className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition ${
                    active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs font-medium">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-teal text-sm font-medium mb-2 block">Couleur</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_FAMILY_OPTIONS.map((cf) => {
              const active = item.colorFamily === cf.id;
              return (
                <button
                  key={cf.id}
                  onClick={() => onChange({ colorFamily: cf.id, color: cf.hex ?? item.color })}
                  className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border transition ${
                    active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full border border-teal/20 shrink-0"
                    style={{
                      background:
                        cf.hex ?? 'conic-gradient(from 0deg, #E3937C, #4A6FA5, #E0C468, #6B8E63, #E3937C)',
                    }}
                  />
                  <span className="text-xs font-medium">{cf.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-teal text-sm font-medium mb-2 block">Matière (optionnel)</label>
          <input
            value={item.material ?? ''}
            onChange={(e) => onChange({ material: e.target.value })}
            placeholder="Ex : coton, laine, cuir..."
            className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
          />
        </div>

        <div>
          <label className="text-teal text-sm font-medium mb-2 block">Saison</label>
          <div className="grid grid-cols-2 gap-2.5">
            {SEASON_OPTIONS.map((s) => {
              const active = item.season === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onChange({ season: s.id })}
                  className={`py-2.5 rounded-2xl border text-sm font-medium transition ${
                    active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-teal text-sm font-medium mb-2 block">Niveau de chaleur</label>
          <div className="grid grid-cols-2 gap-2.5">
            {WARMTH_OPTIONS.map((w) => {
              const active = item.warmth === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => onChange({ warmth: w.id })}
                  className={`py-2.5 rounded-2xl border text-sm font-medium transition ${
                    active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 bg-mauve text-cream active:scale-[0.98]"
        >
          <Check size={18} /> OK
        </button>
      </div>
    </div>
  );
}

function QuickAddPanel({ onSaveMany }) {
  const [queue, setQueue] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const activeCountRef = useRef(0);
  const pendingRef = useRef([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const total = queue.length;
  const processed = queue.filter((it) => it.status === 'done' || it.status === 'error').length;
  const isAnalyzing = total > 0 && processed < total;
  const editingItem = queue.find((it) => it.id === editingId) || null;

  function updateItem(id, patch) {
    if (!mountedRef.current) return;
    setQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function runJob({ id, photo }) {
    updateItem(id, { status: 'analyzing' });
    try {
      const detected = await analyzeClothingPhoto(photo);
      updateItem(id, {
        status: 'done',
        name: detected.name || '',
        category: CATEGORIES.some((c) => c.id === detected.category) ? detected.category : null,
        color: detected.color,
        colorFamily: detected.colorFamily,
        material: detected.material,
        season: detected.season,
        warmth: detected.warmth === 'chaud' ? 'chaud' : 'leger',
      });
    } catch {
      updateItem(id, { status: 'error' });
    }
  }

  // Traite la file d'analyse avec un nombre limité de requêtes en parallèle
  // (QUICK_ADD_CONCURRENCY), pour ne pas saturer le réseau ni la fonction serverless
  // quand plusieurs photos sont ajoutées d'un coup (galerie multiple, ou prises
  // successives). Les refs persistent tant que le composant reste monté, même si
  // handleFiles est appelé plusieurs fois avant la fin d'un lot précédent.
  function pump() {
    while (activeCountRef.current < QUICK_ADD_CONCURRENCY && pendingRef.current.length > 0) {
      const job = pendingRef.current.shift();
      activeCountRef.current += 1;
      runJob(job).finally(() => {
        activeCountRef.current -= 1;
        pump();
      });
    }
  }

  function enqueueForAnalysis(jobs) {
    pendingRef.current.push(...jobs);
    pump();
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const prepared = (
      await Promise.all(
        files.map(async (file) => {
          let dataUrl;
          try {
            dataUrl = await readFileAsDataURL(file);
          } catch {
            return null;
          }
          let compressed;
          try {
            compressed = await compressImage(dataUrl);
          } catch {
            compressed = dataUrl;
          }
          return {
            id: `q${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            photo: compressed,
            status: 'queued',
            name: '',
            category: null,
            color: undefined,
            colorFamily: undefined,
            material: undefined,
            season: undefined,
            warmth: 'leger',
          };
        }),
      )
    ).filter(Boolean);

    if (!prepared.length) return;
    setQueue((prev) => [...prev, ...prepared]);
    enqueueForAnalysis(prepared.map(({ id, photo }) => ({ id, photo })));
  }

  function removeItem(id) {
    setQueue((prev) => prev.filter((it) => it.id !== id));
    if (editingId === id) setEditingId(null);
  }

  async function handleSaveAll() {
    if (!queue.length || isAnalyzing || saving) return;
    setSaveError(null);
    const items = queue.map((it) => {
      const categoryMeta = CATEGORIES.find((c) => c.id === it.category);
      return {
        name: it.name?.trim() || (categoryMeta ? `${categoryMeta.label} sans nom` : 'Vêtement sans nom'),
        category: it.category,
        photo: it.photo,
        color: it.color ?? (it.category ? PLACEHOLDER_COLORS[it.category] : undefined),
        colorFamily: it.colorFamily,
        warmth: it.warmth,
        material: it.material,
        season: it.season,
      };
    });
    setSaving(true);
    try {
      await onSaveMany(items);
      setQueue([]);
    } catch {
      // Réseau indisponible : la file reste intacte pour que rien ne soit perdu, l'ajout
      // pourra être retenté d'un tap sur le même bouton une fois la connexion revenue.
      setSaveError("L'enregistrement a échoué (vérifie ta connexion) — rien n'a été perdu, réessaie.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="bg-pink/15 rounded-3xl p-4 shadow-sm flex flex-col gap-3">
        <p className="text-xs text-mauve flex items-center gap-1.5">
          <Sparkles size={12} className="shrink-0" /> Ajoute plusieurs photos : elles sont analysées automatiquement en arrière-plan.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-mauve text-cream rounded-full py-2.5 px-2 text-sm font-medium whitespace-nowrap"
          >
            <Camera size={16} /> Photo
          </button>
          <button
            onClick={() => galleryInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-bluegray/40 text-teal rounded-full py-2.5 px-2 text-sm font-medium whitespace-nowrap"
          >
            <Upload size={16} /> Galerie (plusieurs)
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFiles}
          className="hidden"
        />
        <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
      </div>

      {total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-mauve mb-1">
            <span>{isAnalyzing ? 'Analyse en cours...' : 'Analyse terminée'}</span>
            <span className="font-semibold">
              {processed} sur {total} analysés
            </span>
          </div>
          <div className="h-2 rounded-full bg-bluegray/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-mauve transition-all"
              style={{ width: `${total ? (processed / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {total === 0 ? (
        <p className="text-center text-mauve py-12 text-sm">
          Ajoute plusieurs photos pour cataloguer ton dressing d'un coup.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {queue.map((item) => (
            <div key={item.id} className="relative bg-pink/15 rounded-2xl p-2.5 shadow-sm flex flex-col gap-2">
              <button onClick={() => setEditingId(item.id)} className="text-left flex flex-col gap-2">
                <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-cream">
                  <img src={item.photo} alt="" className="w-full h-full object-cover" />
                  {item.status === 'analyzing' && (
                    <div className="absolute inset-0 bg-teal/50 backdrop-blur-[1px] flex items-center justify-center">
                      <Loader2 size={20} className="animate-spin text-cream" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <span className="absolute top-1.5 left-1.5 bg-mauve text-cream text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                      À compléter
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-teal truncate">{item.name || 'Sans nom'}</p>
                  <p className="text-xs text-mauve">
                    {CATEGORIES.find((c) => c.id === item.category)?.label || 'Catégorie ?'}
                  </p>
                  {item.color && (
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-teal/20 mt-1"
                      style={{ backgroundColor: item.color }}
                    />
                  )}
                </div>
              </button>
              <button
                onClick={() => removeItem(item.id)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-teal/50 text-cream flex items-center justify-center"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {saveError && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-1 px-1">
          <Sparkles size={12} className="shrink-0" /> {saveError}
        </p>
      )}

      <button
        onClick={handleSaveAll}
        disabled={!queue.length || isAnalyzing || saving}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          queue.length && !isAnalyzing && !saving ? 'bg-mauve text-cream active:scale-[0.98]' : 'bg-bluegray/40 text-teal/40'
        }`}
      >
        {isAnalyzing ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Analyse en cours...
          </>
        ) : saving ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Enregistrement...
          </>
        ) : (
          <>
            <Check size={18} /> Tout ajouter au dressing{queue.length ? ` (${queue.length})` : ''}
          </>
        )}
      </button>

      {editingItem && (
        <QuickAddEditModal
          item={editingItem}
          onChange={(patch) => updateItem(editingItem.id, patch)}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  );
}

function OutfitDetailScreen({ outfit, clothesById, isFavorite, onToggleFavorite, onBack }) {
  if (!outfit) {
    return (
      <div className="px-5 pt-6">
        <ScreenHeader title="Tenue du jour" onBack={onBack} />
        <p className="text-mauve text-center mt-10">Tenue introuvable.</p>
      </div>
    );
  }
  const WeatherIcon = WEATHER_ICONS[outfit.weather.condition] ?? Sun;

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Ta tenue du jour" onBack={onBack} />

      {outfit.adaptedFor && (
        <span className="inline-flex items-center gap-1.5 text-xs text-mauve bg-mauve/15 px-3 py-1.5 rounded-full self-start">
          <Calendar size={13} /> Adapté pour : {outfit.adaptedFor}
        </span>
      )}

      <div className="bg-pink/15 rounded-3xl p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-2 mb-4">
          {outfit.itemIds.map((id) => (
            <div key={id} className="flex flex-col items-center gap-1">
              <ClothingThumb item={clothesById[id]} className="w-full aspect-square" iconSize={26} />
              <span className="text-[10px] text-mauve text-center truncate w-full">{clothesById[id]?.name}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between bg-cream rounded-2xl px-4 py-3">
          <div>
            <p className="text-mauve font-semibold">{outfit.name}</p>
            <p className="text-xs text-mauve">Météo prévue : {WEATHER_LABELS[outfit.weather.condition]}</p>
          </div>
          <div className="flex items-center gap-1.5 text-teal">
            <WeatherIcon size={22} />
            <span className="font-semibold">{outfit.weather.temp}°</span>
          </div>
        </div>
      </div>

      <div className="bg-pink/15 rounded-3xl p-4 shadow-sm flex flex-col gap-4">
        <h2 className="text-mauve font-semibold">Style Score</h2>
        <ScoreBar label="Compatibilité des couleurs" value={outfit.scores.colorMatch} color="#957882" />
        <ScoreBar label="Adaptée à la météo" value={outfit.scores.weatherFit} color="#AEC1C1" />
        <ScoreBar label="Élégance" value={outfit.scores.elegance} color="#957882" />
        <ScoreBar label="Confort" value={outfit.scores.comfort} color="#E3CCCA" />
        <ScoreBar label="Originalité" value={outfit.scores.originality} color="#E3CCCA" />
      </div>

      <button
        onClick={onToggleFavorite}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition active:scale-[0.98] ${
          isFavorite ? 'bg-pink text-mauve' : 'bg-mauve text-cream'
        }`}
      >
        <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} />
        {isFavorite ? 'Enregistrée dans mes favoris' : 'Enregistrer'}
      </button>
    </div>
  );
}

function ClothingDetailScreen({ item, onBack, onSave, onDelete }) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? null);
  const [colorFamily, setColorFamily] = useState(item?.colorFamily);
  const [color, setColor] = useState(item?.color);
  const [material, setMaterial] = useState(item?.material ?? '');
  const [season, setSeason] = useState(item?.season);
  const [warmth, setWarmth] = useState(item?.warmth ?? 'leger');
  const [laundry, setLaundry] = useState(item?.laundry ?? false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  if (!item) {
    return (
      <div className="px-5 pt-6">
        <ScreenHeader title="Détail du vêtement" onBack={onBack} />
        <p className="text-mauve text-center mt-10">Vêtement introuvable.</p>
      </div>
    );
  }

  const lastWornLabel =
    !item.wearCount || item.monthsSinceWorn == null
      ? 'Jamais porté'
      : item.monthsSinceWorn === 0
        ? 'Ce mois-ci'
        : `Il y a ${item.monthsSinceWorn} mois`;

  async function handleSave() {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(item.id, {
        name: name.trim() || item.name,
        category,
        colorFamily,
        color,
        material,
        season,
        warmth,
        laundry,
      });
    } catch {
      setSaveError("L'enregistrement a échoué (vérifie ta connexion), réessaie.");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await onDelete(item.id);
    } catch {
      setDeleteError('La suppression a échoué (vérifie ta connexion), réessaie.');
      setDeleting(false);
    }
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Détail du vêtement" onBack={onBack} />

      <ClothingThumb item={{ ...item, color }} className="w-full aspect-[4/3]" iconSize={48} />

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Nom</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Chemise en lin"
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
        />
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Catégorie</label>
        <div className="grid grid-cols-3 gap-2.5">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const active = category === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs font-medium">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Couleur</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_FAMILY_OPTIONS.map((cf) => {
            const active = colorFamily === cf.id;
            return (
              <button
                key={cf.id}
                onClick={() => {
                  setColorFamily(cf.id);
                  if (cf.hex) setColor(cf.hex);
                }}
                className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full border transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-teal/20 shrink-0"
                  style={{
                    background:
                      cf.hex ?? 'conic-gradient(from 0deg, #E3937C, #4A6FA5, #E0C468, #6B8E63, #E3937C)',
                  }}
                />
                <span className="text-xs font-medium">{cf.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Matière</label>
        <input
          value={material ?? ''}
          onChange={(e) => setMaterial(e.target.value)}
          placeholder="Ex : coton, laine, cuir..."
          className="w-full bg-pink/15 rounded-xl px-4 py-3 text-sm text-teal outline-none shadow-sm placeholder:text-mauve/50"
        />
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Saison</label>
        <div className="grid grid-cols-2 gap-2.5">
          {SEASON_OPTIONS.map((s) => {
            const active = season === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSeason(s.id)}
                className={`py-2.5 rounded-2xl border text-sm font-medium transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Niveau de chaleur</label>
        <div className="grid grid-cols-2 gap-2.5">
          {WARMTH_OPTIONS.map((w) => {
            const active = warmth === w.id;
            return (
              <button
                key={w.id}
                onClick={() => setWarmth(w.id)}
                className={`py-2.5 rounded-2xl border text-sm font-medium transition ${
                  active ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
                }`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-teal text-sm font-medium mb-2 block">Statut</label>
        <button
          onClick={() => setLaundry((v) => !v)}
          className={`w-full flex items-center gap-2 text-sm font-medium rounded-2xl px-4 py-3 border transition ${
            laundry ? 'bg-mauve border-mauve text-cream' : 'bg-pink/10 border-bluegray/30 text-teal'
          }`}
        >
          <span
            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
              laundry ? 'bg-cream border-cream' : 'border-teal/40 bg-transparent'
            }`}
          >
            {laundry && <Check size={11} className="text-mauve" />}
          </span>
          Au lavage
        </button>
      </div>

      <div>
        <h2 className="text-teal text-sm font-medium mb-2">Statistiques de port</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Fois portée" value={item.wearCount ?? 0} />
          <StatCard label="Dernière fois" value={lastWornLabel} />
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-2 px-1">
          <Sparkles size={12} className="shrink-0" /> {saveError}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          saving ? 'bg-bluegray/40 text-teal/40' : 'bg-mauve text-cream active:scale-[0.98]'
        }`}
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
        Enregistrer les modifications
      </button>

      {deleteError && (
        <p className="text-xs text-mauve flex items-center gap-1.5 -mt-2 px-1">
          <Sparkles size={12} className="shrink-0" /> {deleteError}
        </p>
      )}

      <button
        onClick={() => setShowDeleteConfirm(true)}
        disabled={deleting}
        className="w-full rounded-full py-3 font-medium flex items-center justify-center gap-2 border border-mauve/40 text-mauve transition disabled:opacity-60"
      >
        {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        Supprimer cet article
      </button>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Supprimer cet article"
          message={`"${item.name}" sera définitivement supprimé de ton dressing, de tes tenues et de tes favoris. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            handleDelete();
          }}
        />
      )}
    </div>
  );
}

function WeekScreen({ week, outfits, clothes, clothesById, events, onPrepare, onOpenOutfit, onAddEvent, onEditEvent, onBack }) {
  const [preparing, setPreparing] = useState(false);

  function handlePrepare() {
    setPreparing(true);
    setTimeout(() => {
      onPrepare();
      setPreparing(false);
    }, 900);
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Ma semaine" onBack={onBack} />

      <div className="flex flex-col gap-3">
        {week.map((day) => {
          const event = events.find((e) => e.day === day.day);
          const outfit = event ? composeOutfitForDay(clothes, day.weather, event) : outfits.find((o) => o.id === day.outfitId);
          const Icon = WEATHER_ICONS[day.weather.condition] ?? Sun;
          return (
            <div key={day.day} className="bg-pink/15 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 flex flex-col items-center shrink-0">
                  <span className="text-teal font-semibold text-sm">{day.day.slice(0, 3)}</span>
                  <div className="flex items-center gap-1 text-mauve mt-1">
                    <Icon size={14} />
                    <span className="text-xs">{day.weather.temp}°</span>
                  </div>
                </div>
                {outfit ? (
                  <button onClick={() => onOpenOutfit(outfit)} className="flex-1 flex items-center gap-2 min-w-0">
                    <div className="flex -space-x-2">
                      {outfit.itemIds.slice(0, 3).map((id) => (
                        <ClothingThumb key={id} item={clothesById[id]} className="w-9 h-9 border-2 border-white" iconSize={14} />
                      ))}
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-sm font-medium text-mauve truncate">{outfit.name}</p>
                      {outfit.adaptedFor && (
                        <p className="text-[10px] text-mauve/70 truncate">Adapté pour : {outfit.adaptedFor}</p>
                      )}
                    </div>
                    <ChevronRight size={16} className="text-mauve ml-auto shrink-0" />
                  </button>
                ) : (
                  <span className="flex-1 text-sm text-mauve/60 italic">Non planifiée</span>
                )}
              </div>

              {event ? (
                <button
                  onClick={() => onEditEvent(event)}
                  className="flex items-center gap-2 bg-white/40 rounded-xl px-3 py-2 text-left"
                >
                  <Calendar size={14} className="text-mauve shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-teal truncate">{event.title}</p>
                    <p className="text-[10px] text-mauve">{event.time}</p>
                  </div>
                  <ChevronRight size={14} className="text-mauve shrink-0" />
                </button>
              ) : (
                <button
                  onClick={() => onAddEvent(day.day)}
                  className="flex items-center gap-1.5 text-xs text-mauve/70 font-medium self-start"
                >
                  <Plus size={12} /> Ajouter un événement
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={handlePrepare}
        disabled={preparing}
        className="w-full bg-mauve text-cream rounded-full py-3.5 font-medium flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-70"
      >
        <Sparkles size={18} />
        {preparing ? 'Athena prépare ta semaine...' : 'Préparer ma semaine'}
      </button>
    </div>
  );
}

export default function AthenaStyle() {
  const [clothes, setClothes] = useState(seedClothes);
  const [outfits, setOutfits] = useState(seedOutfits);
  const [favorites, setFavorites] = useState(['o3']);
  const [week, setWeek] = useState(initialWeek);
  const [events, setEvents] = useState(seedEvents);
  const [messages, setMessages] = useState(seedMessages);
  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState(() =>
    typeof window !== 'undefined' && window.location.pathname === '/privacy' ? { name: 'privacy' } : { name: 'main' },
  );
  const [weatherPrefs, setWeatherPrefs] = useState({ city: 'Paris', sensitivity: null });
  const [measurements, setMeasurements] = useState({ height: '', chest: '', waist: '', shoeSize: '' });
  const [stylePrefs, setStylePrefs] = useState([]);
  const [notif, setNotif] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
  const [session, setSession] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [photoSrcMap, setPhotoSrcMap] = useState({});
  const [todayWeather, setTodayWeather] = useState({ temp: 18, condition: 'nuageux' });
  const [weatherMeta, setWeatherMeta] = useState({
    loading: true,
    error: null,
    location: null,
    tempMax: null,
    tempMin: null,
  });

  // Suit la session Supabase (connecté/déconnecté) : ne gère ici que les changements DE
  // SESSION APRÈS le démarrage (l'état initial est résolu une seule fois dans l'effet de
  // chargement ci-dessous, pour pouvoir décider dès le premier rendu si le dressing doit
  // venir du cloud ou du stockage local).
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      let initialSession = null;
      if (supabase) {
        try {
          const { data } = await withTimeout(supabase.auth.getSession(), 5000);
          initialSession = data.session;
        } catch {
          // Session illisible ou réseau trop lent : on démarre déconnectée plutôt que de
          // bloquer le lancement de l'app.
        }
      }
      if (!cancelled) setSession(initialSession);

      const [
        loadedClothes,
        loadedOutfits,
        loadedFavorites,
        loadedWeek,
        loadedEvents,
        loadedWeatherPrefs,
        loadedMeasurements,
        loadedStylePrefs,
        loadedNotif,
      ] = await Promise.all([
        loadJSON(STORAGE_KEYS.clothes, seedClothes),
        loadJSON(STORAGE_KEYS.outfits, seedOutfits),
        loadJSON(STORAGE_KEYS.favorites, ['o3']),
        loadJSON(STORAGE_KEYS.week, initialWeek),
        loadJSON(STORAGE_KEYS.events, seedEvents),
        loadJSON(STORAGE_KEYS.weatherPrefs, { city: 'Paris', sensitivity: null }),
        loadJSON(STORAGE_KEYS.measurements, { height: '', chest: '', waist: '', shoeSize: '' }),
        loadJSON(STORAGE_KEYS.stylePrefs, []),
        loadJSON(STORAGE_KEYS.notif, true),
      ]);

      const photoEntries = await Promise.all(
        loadedClothes.filter((c) => c.photo).map(async (c) => [c.photo, await resolvePhotoSrc(c.photo)]),
      );

      if (cancelled) return;
      // Le dressing local (déjà chargé ci-dessus) s'affiche immédiatement, sans attendre
      // le réseau : c'est le cache hors-ligne. Si connectée, la version cloud est demandée
      // juste après, en arrière-plan, et remplace l'affichage dès qu'elle arrive — l'app ne
      // reste jamais bloquée sur l'écran de chargement en attendant Supabase.
      setClothes(loadedClothes);
      setOutfits(loadedOutfits);
      setFavorites(loadedFavorites);
      setWeek(loadedWeek);
      setEvents(loadedEvents);
      setWeatherPrefs(loadedWeatherPrefs);
      setMeasurements(loadedMeasurements);
      setStylePrefs(loadedStylePrefs);
      setNotif(loadedNotif);
      setPhotoSrcMap(Object.fromEntries(photoEntries));
      setAppReady(true);

      if (supabase && initialSession) {
        reloadClothesForSession(initialSession);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.clothes, clothes);
  }, [clothes, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.outfits, outfits);
  }, [outfits, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.favorites, favorites);
  }, [favorites, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.week, week);
  }, [week, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.events, events);
  }, [events, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.weatherPrefs, weatherPrefs);
  }, [weatherPrefs, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.measurements, measurements);
  }, [measurements, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.stylePrefs, stylePrefs);
  }, [stylePrefs, appReady]);

  useEffect(() => {
    if (appReady) saveJSON(STORAGE_KEYS.notif, notif);
  }, [notif, appReady]);

  const clothesById = useMemo(() => Object.fromEntries(clothes.map((c) => [c.id, c])), [clothes]);
  const todayEvent = events.find((e) => e.day === week[0]?.day);
  const todayOutfit = useMemo(
    () => composeOutfitForDay(clothes, todayWeather, todayEvent),
    [clothes, todayWeather, todayEvent],
  );
  const outfitDetailOutfit =
    screen.name === 'outfit-detail' ? screen.outfit || outfits.find((o) => o.id === screen.outfitId) : null;
  const clothingDetailItem =
    screen.name === 'clothing-detail' ? clothes.find((c) => c.id === screen.itemId) : null;

  async function refreshWeather() {
    setWeatherMeta((m) => ({ ...m, loading: true, error: null }));
    let location = null;
    try {
      const coords = await getBrowserLocation();
      location = { ...coords, name: 'Ma position' };
    } catch {
      location = null;
    }
    if (!location && weatherPrefs.city) {
      location = await geocodeCity(weatherPrefs.city).catch(() => null);
    }
    if (!location) {
      location = DEFAULT_LOCATION;
    }

    // Fixe le nom de ville dès que la localisation est résolue : même si la requête météo
    // échoue ensuite, l'écran ne doit jamais rester bloqué sur "..." indéfiniment.
    setWeatherMeta((m) => ({ ...m, location: location.name }));

    try {
      const data = await fetchWeatherForLocation(location);
      setTodayWeather({ temp: data.temp, condition: data.condition });
      setWeatherMeta({
        loading: false,
        error: null,
        location: location.name,
        tempMax: data.tempMax,
        tempMin: data.tempMin,
      });
    } catch {
      setWeatherMeta((m) => ({
        ...m,
        loading: false,
        location: location.name,
        error: 'Météo indisponible pour le moment, données par défaut utilisées.',
      }));
    }
  }

  useEffect(() => {
    refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handlePopState() {
      setScreen(window.location.pathname === '/privacy' ? { name: 'privacy' } : { name: 'main' });
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function openScreen(name, params = {}) {
    setScreen({ name, ...params });
  }

  function openPrivacy() {
    window.history.pushState({}, '', '/privacy');
    setScreen({ name: 'privacy' });
  }

  function goBack() {
    if (window.location.pathname === '/privacy') {
      window.history.pushState({}, '', '/');
    }
    setScreen({ name: 'main' });
  }

  function switchTab(t) {
    setTab(t);
    setScreen({ name: 'main' });
  }

  // Charge le dressing depuis Supabase (connectée) ou depuis le stockage local
  // (déconnectée), et résout les photos correspondantes. Appelé après une connexion, une
  // inscription ou une déconnexion réussie pour que la vue reflète immédiatement le bon
  // dressing, sans attendre un rechargement complet de l'app.
  async function reloadClothesForSession(newSession) {
    let nextClothes;
    if (supabase && newSession) {
      try {
        nextClothes = await fetchCloudClothes();
      } catch {
        return; // Hors ligne : on garde ce qui est déjà affiché plutôt que de le vider.
      }
    } else {
      nextClothes = await loadJSON(STORAGE_KEYS.clothes, seedClothes);
    }
    setClothes(nextClothes);
    const photoEntries = await Promise.all(
      nextClothes.filter((c) => c.photo).map(async (c) => [c.photo, await resolvePhotoSrc(c.photo)]),
    );
    setPhotoSrcMap((prev) => ({ ...prev, ...Object.fromEntries(photoEntries) }));
  }

  // Envoie la photo vers le bucket Supabase Storage si connectée ; si l'upload échoue
  // (hors ligne, par ex.) ou si déconnectée, repli sur le système de fichiers local pour
  // ne jamais perdre la photo — elle ne sera alors visible que sur cet appareil, jusqu'à
  // une prochaine synchronisation.
  async function saveClothingPhotoAny(dataUrl, fileName) {
    if (supabase && session) {
      try {
        return await uploadClothingPhoto(dataUrl, session.user.id, fileName);
      } catch {
        // repli local ci-dessous
      }
    }
    return savePhotoFile(dataUrl, `local-${fileName}`);
  }

  async function addClothing(item) {
    let photoPath = null;
    if (item.photo) {
      photoPath = await saveClothingPhotoAny(item.photo, `${Date.now()}.jpg`);
      setPhotoSrcMap((prev) => ({ ...prev, [photoPath]: item.photo }));
    }
    const draft = { laundry: false, wearCount: 0, monthsSinceWorn: null, warmth: 'leger', ...item, photo: photoPath };

    if (supabase && session) {
      const { data, error } = await supabase
        .from('clothes')
        .insert(clothingItemToRow(draft, session.user.id))
        .select()
        .single();
      if (error) throw error;
      setClothes((prev) => [...prev, clothingRowToItem(data)]);
    } else {
      setClothes((prev) => [...prev, { id: `c${Date.now()}`, ...draft }]);
    }
    setTab('dressing');
    setScreen({ name: 'main' });
  }

  // Ajoute plusieurs vêtements d'un coup (mode "ajout rapide") : les photos sont envoyées
  // en parallèle (cloud si connectée, sinon local) puis tous les articles rejoignent le
  // dressing en une seule mise à jour d'état (un seul insert group côté Supabase si connectée).
  async function addClothingBatch(items) {
    const prepared = await Promise.all(
      items.map(async (item, idx) => {
        let photoPath = null;
        if (item.photo) {
          photoPath = await saveClothingPhotoAny(item.photo, `${Date.now()}-${idx}.jpg`);
        }
        return {
          photoPath,
          rawPhoto: item.photo,
          draft: { laundry: false, wearCount: 0, monthsSinceWorn: null, warmth: 'leger', ...item, photo: photoPath },
        };
      }),
    );

    if (supabase && session) {
      const rows = prepared.map(({ draft }) => clothingItemToRow(draft, session.user.id));
      const { data, error } = await supabase.from('clothes').insert(rows).select();
      if (error) throw error;
      setClothes((prev) => [...prev, ...data.map(clothingRowToItem)]);
    } else {
      setClothes((prev) => [
        ...prev,
        ...prepared.map(({ draft }, idx) => ({ id: `c${Date.now()}-${idx}`, ...draft })),
      ]);
    }

    setPhotoSrcMap((prev) => {
      const next = { ...prev };
      prepared.forEach(({ photoPath, rawPhoto }) => {
        if (photoPath) next[photoPath] = rawPhoto;
      });
      return next;
    });
    setTab('dressing');
    setScreen({ name: 'main' });
  }

  // Bascule optimiste (mise à jour immédiate à l'écran) avec synchronisation Supabase en
  // arrière-plan : une action fréquente et anodine comme "au lavage" ne mérite pas
  // d'attendre le réseau, et un échec ponctuel n'est pas grave (retaper dessus suffit).
  function toggleLaundry(clothingId) {
    const current = clothes.find((c) => c.id === clothingId);
    if (!current) return;
    const nextLaundry = !current.laundry;
    setClothes((prev) => prev.map((c) => (c.id === clothingId ? { ...c, laundry: nextLaundry } : c)));
    if (supabase && session) {
      supabase
        .from('clothes')
        .update({ laundry: nextLaundry })
        .eq('id', clothingId)
        .then(({ error }) => {
          if (error) console.warn('Synchronisation "au lavage" impossible (hors ligne ?) :', error.message);
        })
        .catch((err) => {
          console.warn('Synchronisation "au lavage" impossible (hors ligne ?) :', err.message);
        });
    }
  }

  async function clearAllData() {
    await Promise.all(clothes.filter((c) => c.photo).map((c) => deleteClothingPhotoAny(c.photo)));
    await Promise.all(Object.values(STORAGE_KEYS).map((key) => Preferences.remove({ key })));
    if (supabase && session) {
      try {
        const { error } = await supabase.from('clothes').delete().eq('user_id', session.user.id);
        if (error) console.warn('Suppression du dressing cloud impossible (hors ligne ?) :', error.message);
      } catch (err) {
        // Réseau indisponible : on efface quand même l'appareil plutôt que de bloquer
        // "Effacer mes données" sur un problème de connexion.
        console.warn('Suppression du dressing cloud impossible (hors ligne ?) :', err.message);
      }
    }
    setClothes(seedClothes);
    setOutfits(seedOutfits);
    setFavorites(['o3']);
    setWeek(initialWeek);
    setEvents(seedEvents);
    setWeatherPrefs({ city: 'Paris', sensitivity: null });
    setMeasurements({ height: '', chest: '', waist: '', shoeSize: '' });
    setStylePrefs([]);
    setNotif(true);
    setPhotoSrcMap({});
    setShowClearDataConfirm(false);
    setTab('home');
    setScreen({ name: 'main' });
  }

  function toggleFavorite(outfitId) {
    setFavorites((prev) => (prev.includes(outfitId) ? prev.filter((id) => id !== outfitId) : [...prev, outfitId]));
  }

  function handleOutfitSave(outfit) {
    const alreadySaved = outfits.some((o) => o.id === outfit.id);
    if (!alreadySaved) {
      const newId = `outfit-${Date.now()}`;
      setOutfits((prev) => [...prev, { ...outfit, id: newId }]);
      setFavorites((prev) => [...prev, newId]);
      setScreen({ name: 'outfit-detail', outfitId: newId });
      return;
    }
    toggleFavorite(outfit.id);
  }

  function prepareWeek() {
    setWeek((prev) =>
      prev.map((d, i) => {
        if (d.outfitId || events.some((e) => e.day === d.day)) return d;
        const match = outfits.find((o) => o.weather.condition === d.weather.condition) || outfits[i % outfits.length];
        return { ...d, outfitId: match.id };
      }),
    );
  }

  function addEvent(event) {
    const id = `e${Date.now()}`;
    setEvents((prev) => [...prev, { id, ...event }]);
  }

  function updateEvent(id, patch) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteEvent(id) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  function sendMessage(text) {
    const userMsg = { id: Date.now(), from: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => {
      const reply = generateAthenaResponse(text, { clothes, weather: todayWeather, todayOutfit });
      setMessages((prev) => [...prev, { id: Date.now() + 1, from: 'athena', text: reply.text, outfit: reply.outfit }]);
    }, 700);
  }

  const showFab = screen.name === 'main' && tab === 'dressing';

  if (!appReady) {
    return (
      <div className="min-h-dvh w-full bg-neutral-950 flex items-center justify-center sm:p-6">
        <div className="relative flex flex-col items-center justify-center gap-4 w-full h-dvh sm:w-[390px] sm:h-[844px] sm:max-h-[90vh] bg-cream overflow-hidden shadow-2xl sm:rounded-[3rem] sm:border-[10px] sm:border-neutral-950 pt-[env(safe-area-inset-top)]">
          <div className="w-16 h-16 rounded-full bg-mauve flex items-center justify-center text-cream">
            <Sparkles size={28} />
          </div>
          <Loader2 size={22} className="animate-spin text-mauve" />
          <p className="text-mauve text-sm font-medium">Chargement de ton dressing...</p>
        </div>
      </div>
    );
  }

  return (
    <PhotoSrcContext.Provider value={photoSrcMap}>
      <div className="min-h-dvh w-full bg-neutral-950 flex items-center justify-center sm:p-6">
        <div className="relative flex flex-col w-full h-dvh sm:w-[390px] sm:h-[844px] sm:max-h-[90vh] bg-cream text-teal overflow-hidden shadow-2xl sm:rounded-[3rem] sm:border-[10px] sm:border-neutral-950 pt-[env(safe-area-inset-top)]">
          <div className="flex-1 overflow-y-auto">
            {screen.name === 'main' && tab === 'home' && (
              <HomeScreen
                weather={todayWeather}
                weatherMeta={weatherMeta}
                onRefreshWeather={refreshWeather}
                onChangeWeather={setTodayWeather}
                todayOutfit={todayOutfit}
                clothesById={clothesById}
                clothes={clothes}
                onOpenOutfit={() => openScreen('outfit-detail', { outfitId: todayOutfit.id, outfit: todayOutfit })}
                onOpenWeek={() => openScreen('week-plan')}
                onOpenAdd={() => openScreen('add-item')}
              />
            )}
            {screen.name === 'main' && tab === 'dressing' && (
              <DressingScreen
                clothes={clothes}
                onToggleLaundry={toggleLaundry}
                onOpenItem={(id) => openScreen('clothing-detail', { itemId: id })}
              />
            )}
            {screen.name === 'main' && tab === 'ai' && (
              <ChatScreen
                messages={messages}
                onSend={sendMessage}
                clothesById={clothesById}
                onOpenOutfit={(outfit) => openScreen('outfit-detail', { outfitId: outfit.id, outfit })}
              />
            )}
            {screen.name === 'main' && tab === 'favorites' && (
              <FavoritesScreen
                outfits={outfits}
                favorites={favorites}
                clothesById={clothesById}
                onOpen={(id) => openScreen('outfit-detail', { outfitId: id })}
                onToggleFavorite={toggleFavorite}
              />
            )}
            {screen.name === 'main' && tab === 'profile' && (
              <ProfileScreen
                clothes={clothes}
                outfits={outfits}
                favorites={favorites}
                weatherPrefs={weatherPrefs}
                measurements={measurements}
                stylePrefs={stylePrefs}
                notif={notif}
                onToggleNotif={setNotif}
                onOpenWeatherPrefs={() => openScreen('weather-prefs')}
                onOpenMeasurements={() => openScreen('measurements')}
                onOpenStylePrefs={() => openScreen('style-prefs')}
                onOpenStats={() => openScreen('stats')}
                session={session}
                onOpenAuth={() => openScreen('auth')}
                onLogoutClick={() => setShowLogoutConfirm(true)}
                onOpenPrivacy={openPrivacy}
                onClearDataClick={() => setShowClearDataConfirm(true)}
              />
            )}
            {screen.name === 'stats' && <StatsScreen clothes={clothes} onBack={goBack} />}
            {screen.name === 'privacy' && <PrivacyScreen onBack={goBack} />}
            {screen.name === 'auth' && (
              <AuthScreen
                onBack={goBack}
                onAuthSuccess={(newSession) => {
                  setSession(newSession);
                  reloadClothesForSession(newSession);
                  goBack();
                }}
              />
            )}
            {screen.name === 'add-item' && (
              <AddItemScreen onBack={goBack} onSave={addClothing} onSaveMany={addClothingBatch} />
            )}
            {screen.name === 'weather-prefs' && (
              <WeatherPrefsScreen
                prefs={weatherPrefs}
                onSave={(p) => {
                  setWeatherPrefs(p);
                  goBack();
                }}
                onBack={goBack}
              />
            )}
            {screen.name === 'measurements' && (
              <MeasurementsScreen
                measurements={measurements}
                onSave={(m) => {
                  setMeasurements(m);
                  goBack();
                }}
                onBack={goBack}
              />
            )}
            {screen.name === 'style-prefs' && (
              <StylePrefsScreen
                selected={stylePrefs}
                onSave={(s) => {
                  setStylePrefs(s);
                  goBack();
                }}
                onBack={goBack}
              />
            )}
            {screen.name === 'outfit-detail' && (
              <OutfitDetailScreen
                outfit={outfitDetailOutfit}
                clothesById={clothesById}
                isFavorite={outfitDetailOutfit ? favorites.includes(outfitDetailOutfit.id) : false}
                onToggleFavorite={() => outfitDetailOutfit && handleOutfitSave(outfitDetailOutfit)}
                onBack={goBack}
              />
            )}
            {screen.name === 'clothing-detail' && (
              <ClothingDetailScreen
                item={clothingDetailItem}
                onBack={goBack}
                onSave={async (id, patch) => {
                  if (supabase && session) {
                    const { error } = await supabase.from('clothes').update(clothingPatchToRow(patch)).eq('id', id);
                    if (error) throw error;
                  }
                  setClothes((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
                  goBack();
                }}
                onDelete={async (id) => {
                  if (supabase && session) {
                    const { error } = await supabase.from('clothes').delete().eq('id', id);
                    if (error) throw error;
                  }
                  const target = clothes.find((c) => c.id === id);
                  if (target?.photo) await deleteClothingPhotoAny(target.photo);
                  setClothes((prev) => prev.filter((c) => c.id !== id));
                  setOutfits((prev) => prev.map((o) => ({ ...o, itemIds: o.itemIds.filter((iid) => iid !== id) })));
                  goBack();
                }}
              />
            )}
            {screen.name === 'week-plan' && (
              <WeekScreen
                week={week}
                outfits={outfits}
                clothes={clothes}
                clothesById={clothesById}
                events={events}
                onPrepare={prepareWeek}
                onOpenOutfit={(outfit) => openScreen('outfit-detail', { outfitId: outfit.id, outfit })}
                onAddEvent={(day) => openScreen('event-form', { day })}
                onEditEvent={(event) => openScreen('event-form', { event, day: event.day })}
                onBack={goBack}
              />
            )}
            {screen.name === 'event-form' && (
              <EventFormScreen
                event={screen.event}
                day={screen.day}
                onSave={(e) => {
                  if (screen.event) updateEvent(screen.event.id, e);
                  else addEvent(e);
                  goBack();
                }}
                onDelete={(id) => {
                  deleteEvent(id);
                  goBack();
                }}
                onBack={goBack}
              />
            )}
          </div>

          {showFab && (
            <button
              onClick={() => openScreen('add-item')}
              className="absolute right-5 bottom-24 w-14 h-14 rounded-full bg-mauve text-cream shadow-lg flex items-center justify-center active:scale-95 transition z-20"
            >
              <Plus size={24} />
            </button>
          )}

          <BottomNav active={tab} onChange={switchTab} />

          {showLogoutConfirm && (
            <ConfirmDialog
              title="Déconnexion"
              message="Voulez-vous vraiment vous déconnecter ?"
              confirmLabel="Confirmer"
              onCancel={() => setShowLogoutConfirm(false)}
              onConfirm={async () => {
                try {
                  if (supabase) await supabase.auth.signOut();
                } catch {
                  // Réseau indisponible : on ferme quand même la boîte de dialogue plutôt
                  // que de bloquer l'utilisatrice sur un état intermédiaire.
                } finally {
                  setSession(null);
                  reloadClothesForSession(null);
                  setShowLogoutConfirm(false);
                }
              }}
            />
          )}

          {showClearDataConfirm && (
            <ConfirmDialog
              title="Effacer mes données"
              message="Ton dressing, tes favoris, ton agenda et tes préférences seront définitivement supprimés de cet appareil. Cette action est irréversible."
              confirmLabel="Effacer"
              onCancel={() => setShowClearDataConfirm(false)}
              onConfirm={clearAllData}
            />
          )}
        </div>
      </div>
    </PhotoSrcContext.Provider>
  );
}
