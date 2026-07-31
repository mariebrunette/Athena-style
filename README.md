# Athena Style

Styliste personnel IA mobile-first : scanne ta garde-robe, propose une tenue du jour selon la météo réelle, un agenda intégré et une IA conversationnelle. Construit avec React, Vite et Tailwind CSS, et empaqueté en app native iOS/Android avec [Capacitor](https://capacitorjs.com).

## Développement web

```bash
npm install
npm run dev       # serveur de dev sur http://localhost:5173
npm run build      # build de production dans dist/
npm run lint        # oxlint
```

## App mobile (Capacitor)

Le projet est déjà initialisé avec Capacitor (`capacitor.config.json`, `appId: com.mariebrunette.athenastyle`) et les plateformes `ios/` et `android/` sont déjà ajoutées au dépôt. Après toute modification du code web, il faut **rebuilder puis resynchroniser** les projets natifs avant de les ouvrir dans Xcode / Android Studio — les commandes ci-dessous font les deux automatiquement.

### iOS (nécessite macOS + Xcode)

```bash
npm run cap:ios
# équivalent à : vite build && npx cap sync ios && npx cap open ios
```

Ouvre le projet dans Xcode. Sélectionne un simulateur ou un appareil, puis Build & Run (⌘R). La première fois, configure ton Team de signature dans l'onglet "Signing & Capabilities" du target `App`.

### Android (nécessite Android Studio)

```bash
npm run cap:android
# équivalent à : vite build && npx cap sync android && npx cap open android
```

Ouvre le projet dans Android Studio, laisse Gradle synchroniser, puis Run ▶ sur un émulateur ou un appareil connecté.

### Resynchroniser sans ouvrir l'IDE

```bash
npm run cap:sync
# équivalent à : vite build && npx cap sync
```

À lancer après chaque changement du code web (nouveau composant, dépendance, etc.) pour que les projets natifs reflètent le dernier build.

## Reconnaissance photo IA (Claude Vision)

Sur l'écran "Ajouter un vêtement", après capture/import d'une photo, l'app appelle une fonction serverless Vercel qui interroge l'API Claude (vision) pour pré-remplir automatiquement nom, catégorie, couleur, matière et saison. **La clé API Anthropic ne quitte jamais le serveur** : elle est lue côté fonction serverless depuis `process.env.ANTHROPIC_API_KEY`, jamais présente dans le code client ni dans le bundle livré au navigateur/à l'app.

### Déploiement Vercel

1. **Connecte le dépôt** sur [vercel.com](https://vercel.com) (New Project → importe ce repo). Vercel détecte automatiquement Vite ; `vercel.json` précise déjà `buildCommand`/`outputDirectory` par sécurité.
2. **Renseigne la clé API** : Project Settings → Environment Variables → ajoute `ANTHROPIC_API_KEY` avec ta clé (console Anthropic), pour les environnements Production **et** Preview. Ne la mets jamais dans un fichier committé — un `.env.local` pour tester en local est ignoré par git (`.gitignore`).
3. **Déploie** (`git push` déclenche un déploiement automatique une fois le projet lié, ou `npx vercel --prod` en CLI).
4. **Tester en local** avec les vraies fonctions serverless : `npx vercel dev` (nécessite `npx vercel login` une première fois) sert le front ET `/api/analyze-clothing` sur le même port. `npm run dev` (Vite seul) ne sait pas servir `/api` : l'appel échoue proprement et l'app bascule sur la saisie manuelle — pratique pour développer l'UI sans consommer de quota API.

### Utilisation depuis l'app native (Capacitor)

L'app native embarque son propre build web local (WebView sur `capacitor://localhost` en iOS, `https://localhost` en Android) : un appel `fetch('/api/...')` relatif n'atteindrait jamais la fonction déployée sur Vercel. Pour que la reconnaissance photo fonctionne dans les apps iOS/Android, définis `VITE_API_BASE_URL` avec l'URL de ton déploiement Vercel **avant** de builder pour Capacitor :

```bash
VITE_API_BASE_URL=https://ton-projet.vercel.app npm run cap:sync
```

Sans cette variable (valeur par défaut vide), l'app utilise un chemin relatif — correct uniquement quand l'app elle-même est servie depuis le même domaine Vercel (ex: test dans un navigateur mobile pointé sur l'URL Vercel). La fonction serverless renvoie déjà les en-têtes CORS nécessaires pour accepter les appels cross-origin depuis l'app native.

### Repli si l'analyse échoue

Réseau coupé, quota Anthropic dépassé, fonction non déployée : l'appel échoue proprement (timeout 15s inclus), un message discret s'affiche ("L'analyse automatique n'a pas fonctionné, renseigne les informations ci-dessous"), et le formulaire reste pleinement utilisable en saisie manuelle — jamais de blocage.

### Compression avant envoi

Chaque photo est redimensionnée côté client (max ~1000px de large, JPEG qualité 0.8, via `<canvas>`) avant tout envoi réseau, pour réduire le coût des appels Claude et le temps de réponse. C'est aussi cette version compressée qui est ensuite écrite sur le système de fichiers de l'appareil.

## Persistance des données

Toutes les données utilisateur (dressing, favoris, agenda, préférences de profil, statistiques de port) sont sauvegardées sur l'appareil et rechargées automatiquement au lancement — rien n'est perdu à la fermeture de l'app.

- **Métadonnées** (vêtements, favoris, événements, préférences météo/mensurations/style, notifications) : [`@capacitor/preferences`](https://capacitorjs.com/docs/apis/preferences), un stockage clé-valeur simple. En navigateur (dev), ce plugin utilise `localStorage` en interne — aucun code séparé n'est nécessaire pour le fallback web, c'est le comportement natif du plugin.
- **Photos de vêtements** : écrites sur le système de fichiers de l'appareil via [`@capacitor/filesystem`](https://capacitorjs.com/docs/apis/filesystem) (répertoire `Directory.Data`). Seul le **chemin du fichier** est stocké dans les métadonnées du vêtement (jamais le base64) ; l'image affichée est résolue à la volée (`Capacitor.convertFileSrc` en natif, relecture du fichier en base64 via `Filesystem.readFile` en fallback web) et mise en cache en mémoire (`PhotoSrcContext`).
- **Chargement au lancement** : un écran de chargement s'affiche pendant que toutes les données sont relues depuis le stockage (et que les photos sont résolues) ; les écrans normaux ne s'affichent qu'une fois ce chargement terminé.
- **Effacer mes données** (Profil) : supprime les fichiers photo, vide les clés Preferences, et réinitialise l'app à son état de démonstration initial — testé pour survivre à un rechargement complet (pas seulement une réinitialisation en mémoire).
- Non persisté (volontairement) : l'historique du chat Athena, la météo en temps réel (rechargée à chaque lancement), et l'état d'affichage courant (onglet actif, écran ouvert).

### Notes d'implémentation

- **Pas de routeur** : l'app gère la navigation entre écrans via du state React (pas de `react-router`), donc aucune configuration de routing particulière n'est nécessaire pour Capacitor (pas de souci de chemins relatifs/`file://` à gérer). Seule exception : `/privacy` (politique de confidentialité) est géré par un routage minimal fait main (`window.location.pathname` + `history.pushState`/`popstate`), sans dépendance supplémentaire, pour avoir une URL publique dédiée (utile pour la soumission aux stores). `vercel.json` inclut déjà la règle de réécriture SPA nécessaire (`/(.*)` → `/index.html`) pour que `/privacy` fonctionne en accès direct sur Vercel ; sur un autre hébergeur statique, une règle équivalente est à configurer.
- **Zones sûres (notch, barre de statut, indicateur d'accueil)** : le viewport (`index.html`) utilise `viewport-fit=cover`, et l'app applique `env(safe-area-inset-*)` en CSS (haut du cadre, barre de navigation basse) pour ne jamais passer sous l'encoche ou la barre de gestes. `capacitor.config.json` active aussi `contentInset: "always"` côté iOS pour un rendu cohérent.
- **Couleur de fond** : `backgroundColor` est réglé sur `#F6F3EC` (crème, charte graphique de l'app) dans `capacitor.config.json` pour éviter un flash blanc au lancement.
- **Écran plein cadre sur mobile** : en dessous de 640px de large (tout appareil natif), l'app s'affiche en plein écran sans le cadre de téléphone décoratif (celui-ci n'apparaît qu'en aperçu desktop élargi).

## Compte et sauvegarde cloud (Supabase)

**En cours de mise en place.** L'app reste aujourd'hui 100% locale (voir "Persistance des données" ci-dessus) : ce qui suit prépare la connexion à [Supabase](https://supabase.com) (authentification par email + base de données + stockage des photos) pour que le dressing survive à une désinstallation ou un changement de téléphone. Rien n'est encore branché à l'interface — l'app fonctionne exactement comme avant tant que l'authentification (étape suivante) n'est pas en place.

### Créer le projet Supabase

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécuter le contenu de `supabase/schema.sql` : il crée les tables (`clothes`, `outfits`, `calendar_events`, `preferences`, `profiles`), active la sécurité au niveau ligne (Row Level Security — chaque utilisateur ne voit/modifie que ses propres données), un trigger qui crée automatiquement un profil à l'inscription, et un bucket de stockage privé `clothing-photos` pour les photos.
3. Dans **Project Settings → API**, récupérer l'**URL du projet** et la **clé publique** (`publishable`/`anon` — jamais la clé `secret`/`service_role`, qui ne doit jamais quitter un environnement serveur).

### Connecter l'app

```bash
# .env.local (jamais commité, voir .gitignore)
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
```

`src/supabaseClient.js` initialise le client à partir de ces variables. Si elles sont absentes, `supabase` vaut `null` et un avertissement est affiché dans la console — l'app continue de fonctionner en local uniquement. Pour un déploiement Vercel, ajouter les mêmes variables dans Project Settings → Environment Variables (Production et Preview) ; pour une app native (Capacitor), elles sont lues au moment du build (`npm run cap:sync`), comme `VITE_API_BASE_URL`.

## Structure

- `AthenaStyle.jsx` — composant applicatif principal (tous les écrans).
- `src/App.jsx` — réexporte `AthenaStyle.jsx`.
- `src/supabaseClient.js` — client Supabase (auth + base de données + stockage), clés lues depuis les variables d'environnement.
- `supabase/schema.sql` — schéma de base de données Supabase (tables, Row Level Security, bucket de stockage) à exécuter dans le SQL Editor du projet.
- `api/analyze-clothing.js` — fonction serverless Vercel : reconnaissance photo via Claude Vision (clé API côté serveur uniquement).
- `vercel.json` — config de déploiement Vercel (build, réécriture SPA, durée max de la fonction).
- `capacitor.config.json` — configuration Capacitor (appId, appName, webDir, couleurs).
- `ios/`, `android/` — projets natifs générés par Capacitor (committés, à resynchroniser après chaque build web).
