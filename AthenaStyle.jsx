import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Home, Shirt, Sparkles, Heart, User, Plus, Camera, Upload, Check,
  ArrowLeft, Send, Calendar, Sun, CloudSun, Cloud, CloudRain, Wind,
  Footprints, Watch, ChevronRight, TrendingUp, Clock, Lightbulb,
  Loader2, MapPin, RefreshCw,
} from 'lucide-react';

const CATEGORIES = [
  { id: 'haut', label: 'Haut', icon: Shirt },
  { id: 'bas', label: 'Bas', icon: Shirt },
  { id: 'robe', label: 'Robe', icon: Shirt },
  { id: 'veste', label: 'Veste', icon: Shirt },
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

const AI_DETECTION_SAMPLES = [
  { name: 'Chemise à rayures', category: 'haut', color: '#EDEAE2', colorFamily: 'blanc', warmth: 'leger' },
  { name: 'Pull en maille', category: 'haut', color: '#957882', colorFamily: 'rose', warmth: 'chaud' },
  { name: 'Jean slim', category: 'bas', color: '#3E4A5C', colorFamily: 'bleu', warmth: 'chaud' },
  { name: 'Pantalon fluide', category: 'bas', color: '#335056', colorFamily: 'bleu', warmth: 'leger' },
  { name: 'Robe portefeuille', category: 'robe', color: '#E3CCCA', colorFamily: 'rose', warmth: 'leger' },
  { name: 'Blazer structuré', category: 'veste', color: '#AEC1C1', colorFamily: 'bleu', warmth: 'leger' },
  { name: 'Manteau long', category: 'veste', color: '#8B5E3C', colorFamily: 'marron', warmth: 'chaud' },
  { name: 'Baskets running', category: 'chaussures', color: '#F2F2F2', colorFamily: 'blanc', warmth: 'leger' },
  { name: 'Bottines en cuir', category: 'chaussures', color: '#3E2723', colorFamily: 'noir', warmth: 'chaud' },
  { name: 'Sac bandoulière', category: 'accessoire', color: '#C9B79C', colorFamily: 'beige', warmth: 'leger' },
  { name: 'Ceinture en cuir', category: 'accessoire', color: '#8B5E3C', colorFamily: 'marron', warmth: 'leger' },
];

function detectClothingFromPhoto() {
  return AI_DETECTION_SAMPLES[Math.floor(Math.random() * AI_DETECTION_SAMPLES.length)];
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

function getBrowserLocation(timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Géolocalisation non disponible'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function geocodeCity(cityName) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=fr&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Géocodage indisponible');
  const data = await res.json();
  const match = data?.results?.[0];
  if (!match) return null;
  return { name: match.name, latitude: match.latitude, longitude: match.longitude };
}

async function fetchWeatherForLocation({ latitude, longitude }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  const res = await fetch(url);
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
  const colorMatch = Math.min(96, Math.max(55, 96 - Math.max(0, colorFamilies.size - 1) * 12));

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
  if (dress) {
    items.push(dress);
  } else {
    const haut = pickPreferred(pool, 'haut', { warmthPref });
    const bas = pickPreferred(pool, 'bas', { warmthPref });
    if (haut) items.push(haut);
    if (bas) items.push(bas);
  }

  const chaussures = pickPreferred(pool, 'chaussures', { warmthPref });
  if (chaussures) items.push(chaussures);

  if (isRain || isCold) {
    const veste = pickPreferred(pool, 'veste', { warmthPref });
    if (veste) items.push(veste);
  }

  const accessoire = pickPreferred(pool, 'accessoire', { warmthPref });
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
  const meta = CATEGORIES.find((c) => c.id === item?.category);
  const Icon = meta?.icon ?? Shirt;
  return (
    <div
      className={`rounded-xl overflow-hidden flex items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: item?.photo ? undefined : item?.color || '#AEC1C1' }}
    >
      {item?.photo ? (
        <img src={item.photo} alt={item.name} className="w-full h-full object-cover" />
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

function DressingScreen({ clothes, onToggleLaundry }) {
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
                className={`bg-pink/15 rounded-2xl p-2.5 shadow-sm flex flex-col gap-2 text-left transition ${
                  item.laundry ? 'opacity-60' : ''
                }`}
              >
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
                </div>
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
  onLogoutClick,
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

  return (
    <div className="px-5 pt-6 pb-6 flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-20 h-20 rounded-full bg-pink/50 flex items-center justify-center text-mauve text-2xl font-semibold">
          MB
        </div>
        <div className="text-center">
          <h1 className="text-mauve text-xl font-semibold">Marie Brunette</h1>
          <p className="text-mauve text-sm">marie.brunette35@gmail.com</p>
        </div>
      </div>

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

      <button onClick={onLogoutClick} className="w-full text-mauve text-sm py-3 font-medium">
        Se déconnecter
      </button>
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

function AddItemScreen({ onBack, onSave }) {
  const [photo, setPhoto] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState(null);
  const [color, setColor] = useState(undefined);
  const [colorFamily, setColorFamily] = useState(undefined);
  const [warmth, setWarmth] = useState('leger');
  const [detecting, setDetecting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result);
      setAutoDetected(false);
      setDetecting(true);
      setTimeout(() => {
        const detected = detectClothingFromPhoto();
        setName(detected.name);
        setCategory(detected.category);
        setColor(detected.color);
        setColorFamily(detected.colorFamily);
        setWarmth(detected.warmth);
        setDetecting(false);
        setAutoDetected(true);
      }, 1200 + Math.random() * 800);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!category) return;
    onSave({
      name: name.trim() || `${CATEGORIES.find((c) => c.id === category).label} sans nom`,
      category,
      photo,
      color: color ?? (photo ? undefined : PLACEHOLDER_COLORS[category]),
      colorFamily,
      warmth,
    });
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Ajouter un vêtement" onBack={onBack} />

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

      <button
        onClick={handleSubmit}
        disabled={!category || detecting}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          category && !detecting ? 'bg-mauve text-cream active:scale-[0.98]' : 'bg-bluegray/40 text-teal/40'
        }`}
      >
        <Check size={18} /> Valider
      </button>
    </div>
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
  const [screen, setScreen] = useState({ name: 'main' });
  const [weatherPrefs, setWeatherPrefs] = useState({ city: 'Paris', sensitivity: null });
  const [measurements, setMeasurements] = useState({ height: '', chest: '', waist: '', shoeSize: '' });
  const [stylePrefs, setStylePrefs] = useState([]);
  const [notif, setNotif] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [todayWeather, setTodayWeather] = useState({ temp: 18, condition: 'nuageux' });
  const [weatherMeta, setWeatherMeta] = useState({
    loading: true,
    error: null,
    location: null,
    tempMax: null,
    tempMin: null,
  });

  const clothesById = useMemo(() => Object.fromEntries(clothes.map((c) => [c.id, c])), [clothes]);
  const todayEvent = events.find((e) => e.day === week[0]?.day);
  const todayOutfit = useMemo(
    () => composeOutfitForDay(clothes, todayWeather, todayEvent),
    [clothes, todayWeather, todayEvent],
  );
  const outfitDetailOutfit =
    screen.name === 'outfit-detail' ? screen.outfit || outfits.find((o) => o.id === screen.outfitId) : null;

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
        error: 'Météo indisponible pour le moment, données par défaut utilisées.',
      }));
    }
  }

  useEffect(() => {
    refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openScreen(name, params = {}) {
    setScreen({ name, ...params });
  }

  function goBack() {
    setScreen({ name: 'main' });
  }

  function switchTab(t) {
    setTab(t);
    setScreen({ name: 'main' });
  }

  function addClothing(item) {
    const id = `c${Date.now()}`;
    setClothes((prev) => [
      ...prev,
      { id, laundry: false, wearCount: 0, monthsSinceWorn: null, warmth: 'leger', ...item },
    ]);
    setTab('dressing');
    setScreen({ name: 'main' });
  }

  function toggleLaundry(clothingId) {
    setClothes((prev) => prev.map((c) => (c.id === clothingId ? { ...c, laundry: !c.laundry } : c)));
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

  return (
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
            <DressingScreen clothes={clothes} onToggleLaundry={toggleLaundry} />
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
              onLogoutClick={() => setShowLogoutConfirm(true)}
            />
          )}
          {screen.name === 'stats' && <StatsScreen clothes={clothes} onBack={goBack} />}
          {screen.name === 'add-item' && <AddItemScreen onBack={goBack} onSave={addClothing} />}
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
            onConfirm={() => setShowLogoutConfirm(false)}
          />
        )}
      </div>
    </div>
  );
}
