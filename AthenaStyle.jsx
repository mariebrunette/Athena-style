import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Home, Shirt, Sparkles, Heart, User, Plus, Camera, Upload, Check,
  ArrowLeft, Send, Calendar, Sun, CloudSun, Cloud, CloudRain, Wind,
  Footprints, Watch, ChevronRight,
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

const seedClothes = [
  { id: 'c1', name: 'Chemise en lin blanche', category: 'haut', photo: null, color: '#EDEAE2' },
  { id: 'c2', name: 'Pull col rond mauve', category: 'haut', photo: null, color: '#957882' },
  { id: 'c3', name: 'Jean droit brut', category: 'bas', photo: null, color: '#3E4A5C' },
  { id: 'c4', name: 'Pantalon tailleur', category: 'bas', photo: null, color: '#335056' },
  { id: 'c5', name: 'Robe fluide rose poudré', category: 'robe', photo: null, color: '#E3CCCA' },
  { id: 'c6', name: 'Veste en jean', category: 'veste', photo: null, color: '#AEC1C1' },
  { id: 'c7', name: 'Trench beige', category: 'veste', photo: null, color: '#D8CFC0' },
  { id: 'c8', name: 'Baskets blanches', category: 'chaussures', photo: null, color: '#F2F2F2' },
  { id: 'c9', name: 'Mocassins bruns', category: 'chaussures', photo: null, color: '#8B5E3C' },
  { id: 'c10', name: 'Sac cabas naturel', category: 'accessoire', photo: null, color: '#C9B79C' },
  { id: 'c11', name: 'Écharpe mauve', category: 'accessoire', photo: null, color: '#957882' },
];

const seedOutfits = [
  {
    id: 'o1', name: 'Look bureau chic', itemIds: ['c2', 'c4', 'c9'],
    weather: { temp: 18, condition: 'nuageux' },
    scores: { comfort: 82, style: 90, weatherFit: 76 },
  },
  {
    id: 'o2', name: 'Casual weekend', itemIds: ['c1', 'c3', 'c8', 'c6'],
    weather: { temp: 22, condition: 'soleil' },
    scores: { comfort: 95, style: 78, weatherFit: 88 },
  },
  {
    id: 'o3', name: "Douceur d'été", itemIds: ['c5', 'c8', 'c11'],
    weather: { temp: 24, condition: 'soleil' },
    scores: { comfort: 88, style: 92, weatherFit: 94 },
  },
];

const initialWeek = [
  { day: 'Lundi', weather: { temp: 18, condition: 'nuageux' }, outfitId: 'o1' },
  { day: 'Mardi', weather: { temp: 20, condition: 'soleil' }, outfitId: null },
  { day: 'Mercredi', weather: { temp: 16, condition: 'pluie' }, outfitId: null },
  { day: 'Jeudi', weather: { temp: 19, condition: 'nuageux' }, outfitId: null },
  { day: 'Vendredi', weather: { temp: 23, condition: 'soleil' }, outfitId: null },
];

const seedMessages = [
  {
    id: 1, from: 'athena',
    text: "Bonjour Marie ! Je suis Athena, ta styliste personnelle. Dis-moi comment tu te sens ou pose-moi une question sur ta tenue du jour ✨",
  },
];

function generateAthenaReply(text, { todayOutfit }) {
  const t = text.toLowerCase();
  if (t.includes('pluie') || t.includes('pleu')) {
    return "S'il pleut, je te conseille ton trench ou une veste imperméable, avec des chaussures fermées. Je peux te préparer une tenue adaptée si tu veux !";
  }
  if (t.includes('confort')) {
    return `Pour un maximum de confort, "${todayOutfit?.name}" est un excellent choix aujourd'hui : ${todayOutfit?.scores.comfort}% de confort estimé.`;
  }
  if (t.includes('rendez-vous') || t.includes('rdv') || t.includes('sortie')) {
    return "Pour une occasion spéciale, mise sur une pièce qui te met en valeur, associée à un accessoire soigné. Regarde du côté de tes robes ou vestes structurées.";
  }
  return `Aujourd'hui, je te propose plutôt "${todayOutfit?.name}", bien adapté à la météo du jour. Va voir l'onglet Accueil pour le détail !`;
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

function HomeScreen({ today, todayOutfit, clothesById, clothes, onOpenOutfit, onOpenWeek, onOpenAdd }) {
  const WeatherIcon = WEATHER_ICONS[today.weather.condition] ?? Sun;
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

      <div className="bg-mauve rounded-3xl p-5 text-cream shadow-lg flex items-center justify-between">
        <div>
          <p className="text-cream/70 text-xs uppercase tracking-wide">Météo du jour</p>
          <p className="text-3xl font-semibold mt-1">{today.weather.temp}°</p>
          <p className="text-sm text-cream/80">{WEATHER_LABELS[today.weather.condition]}</p>
        </div>
        <WeatherIcon size={48} className="text-pink" />
      </div>

      {todayOutfit && (
        <div className="bg-pink/15 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-mauve font-semibold">Ta tenue du jour</h2>
            <span className="text-xs text-mauve bg-pink/40 px-2 py-1 rounded-full">
              {todayOutfit.scores.weatherFit}% adapté
            </span>
          </div>
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
        </div>
      )}

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

function DressingScreen({ clothes }) {
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
              <div key={item.id} className="bg-pink/15 rounded-2xl p-2.5 shadow-sm flex flex-col gap-2 text-left">
                <ClothingThumb item={item} className="w-full aspect-square" iconSize={28} />
                <div>
                  <p className="text-sm font-medium text-teal truncate">{item.name}</p>
                  <p className="text-xs text-mauve">{meta?.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatScreen({ messages, onSend }) {
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const quickPrompts = ["Que porter s'il pleut ?", 'Une tenue confortable', 'Idée pour un rendez-vous'];

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
            className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              m.from === 'athena'
                ? 'bg-pink/20 text-teal self-start rounded-tl-sm shadow-sm'
                : 'bg-mauve text-cream self-end rounded-tr-sm'
            }`}
          >
            {m.text}
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
                  Style {o.scores.style}% · Confort {o.scores.comfort}%
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
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!category) return;
    onSave({
      name: name.trim() || `${CATEGORIES.find((c) => c.id === category).label} sans nom`,
      category,
      photo,
      color: photo ? undefined : PLACEHOLDER_COLORS[category],
    });
  }

  return (
    <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
      <ScreenHeader title="Ajouter un vêtement" onBack={onBack} />

      <div className="bg-pink/15 rounded-3xl p-4 shadow-sm">
        <div className="w-full aspect-[4/3] rounded-2xl border-2 border-dashed border-mauve/40 bg-cream flex items-center justify-center overflow-hidden mb-3">
          {photo ? (
            <img src={photo} alt="Aperçu" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-mauve">
              <Camera size={28} />
              <span className="text-sm">Ajoute une photo</span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-mauve text-cream rounded-full py-2.5 px-2 text-sm font-medium whitespace-nowrap"
          >
            <Camera size={16} /> Caméra
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 bg-bluegray/40 text-teal rounded-full py-2.5 px-2 text-sm font-medium whitespace-nowrap"
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
        disabled={!category}
        className={`w-full rounded-full py-3.5 font-medium flex items-center justify-center gap-2 transition ${
          category ? 'bg-mauve text-cream active:scale-[0.98]' : 'bg-bluegray/40 text-teal/40'
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
        <h2 className="text-mauve font-semibold">Scores</h2>
        <ScoreBar label="Confort" value={outfit.scores.comfort} color="#E3CCCA" />
        <ScoreBar label="Style" value={outfit.scores.style} color="#957882" />
        <ScoreBar label="Adéquation météo" value={outfit.scores.weatherFit} color="#AEC1C1" />
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

function WeekScreen({ week, outfits, clothesById, onPrepare, onOpenOutfit, onBack }) {
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
          const outfit = outfits.find((o) => o.id === day.outfitId);
          const Icon = WEATHER_ICONS[day.weather.condition] ?? Sun;
          return (
            <div key={day.day} className="bg-pink/15 rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <div className="w-14 flex flex-col items-center shrink-0">
                <span className="text-teal font-semibold text-sm">{day.day.slice(0, 3)}</span>
                <div className="flex items-center gap-1 text-mauve mt-1">
                  <Icon size={14} />
                  <span className="text-xs">{day.weather.temp}°</span>
                </div>
              </div>
              {outfit ? (
                <button onClick={() => onOpenOutfit(outfit.id)} className="flex-1 flex items-center gap-2 min-w-0">
                  <div className="flex -space-x-2">
                    {outfit.itemIds.slice(0, 3).map((id) => (
                      <ClothingThumb key={id} item={clothesById[id]} className="w-9 h-9 border-2 border-white" iconSize={14} />
                    ))}
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-medium text-mauve truncate">{outfit.name}</p>
                  </div>
                  <ChevronRight size={16} className="text-mauve ml-auto shrink-0" />
                </button>
              ) : (
                <span className="flex-1 text-sm text-mauve/60 italic">Non planifiée</span>
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
  const [outfits] = useState(seedOutfits);
  const [favorites, setFavorites] = useState(['o3']);
  const [week, setWeek] = useState(initialWeek);
  const [messages, setMessages] = useState(seedMessages);
  const [tab, setTab] = useState('home');
  const [screen, setScreen] = useState({ name: 'main' });
  const [weatherPrefs, setWeatherPrefs] = useState({ city: 'Paris', sensitivity: null });
  const [measurements, setMeasurements] = useState({ height: '', chest: '', waist: '', shoeSize: '' });
  const [stylePrefs, setStylePrefs] = useState([]);
  const [notif, setNotif] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const clothesById = useMemo(() => Object.fromEntries(clothes.map((c) => [c.id, c])), [clothes]);
  const today = week[0];
  const todayOutfit = outfits.find((o) => o.id === today.outfitId);

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
    setClothes((prev) => [...prev, { id, ...item }]);
    setTab('dressing');
    setScreen({ name: 'main' });
  }

  function toggleFavorite(outfitId) {
    setFavorites((prev) => (prev.includes(outfitId) ? prev.filter((id) => id !== outfitId) : [...prev, outfitId]));
  }

  function prepareWeek() {
    setWeek((prev) =>
      prev.map((d, i) => {
        if (d.outfitId) return d;
        const match = outfits.find((o) => o.weather.condition === d.weather.condition) || outfits[i % outfits.length];
        return { ...d, outfitId: match.id };
      }),
    );
  }

  function sendMessage(text) {
    const userMsg = { id: Date.now(), from: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => {
      const reply = generateAthenaReply(text, { todayOutfit });
      setMessages((prev) => [...prev, { id: Date.now() + 1, from: 'athena', text: reply }]);
    }, 700);
  }

  const showFab = screen.name === 'main' && tab === 'dressing';

  return (
    <div className="min-h-dvh w-full bg-neutral-950 flex items-center justify-center sm:p-6">
      <div className="relative flex flex-col w-full h-dvh sm:w-[390px] sm:h-[844px] sm:max-h-[90vh] bg-cream text-teal overflow-hidden shadow-2xl sm:rounded-[3rem] sm:border-[10px] sm:border-neutral-950">
        <div className="flex-1 overflow-y-auto">
          {screen.name === 'main' && tab === 'home' && (
            <HomeScreen
              today={today}
              todayOutfit={todayOutfit}
              clothesById={clothesById}
              clothes={clothes}
              onOpenOutfit={() => openScreen('outfit-detail', { outfitId: todayOutfit?.id })}
              onOpenWeek={() => openScreen('week-plan')}
              onOpenAdd={() => openScreen('add-item')}
            />
          )}
          {screen.name === 'main' && tab === 'dressing' && <DressingScreen clothes={clothes} />}
          {screen.name === 'main' && tab === 'ai' && <ChatScreen messages={messages} onSend={sendMessage} />}
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
              onLogoutClick={() => setShowLogoutConfirm(true)}
            />
          )}
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
              outfit={outfits.find((o) => o.id === screen.outfitId)}
              clothesById={clothesById}
              isFavorite={favorites.includes(screen.outfitId)}
              onToggleFavorite={() => toggleFavorite(screen.outfitId)}
              onBack={goBack}
            />
          )}
          {screen.name === 'week-plan' && (
            <WeekScreen
              week={week}
              outfits={outfits}
              clothesById={clothesById}
              onPrepare={prepareWeek}
              onOpenOutfit={(id) => openScreen('outfit-detail', { outfitId: id })}
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
