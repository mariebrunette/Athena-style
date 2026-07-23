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

### Notes d'implémentation

- **Pas de routeur** : l'app gère la navigation entre écrans via du state React (pas de `react-router`), donc aucune configuration de routing particulière n'est nécessaire pour Capacitor (pas de souci de chemins relatifs/`file://` à gérer).
- **Zones sûres (notch, barre de statut, indicateur d'accueil)** : le viewport (`index.html`) utilise `viewport-fit=cover`, et l'app applique `env(safe-area-inset-*)` en CSS (haut du cadre, barre de navigation basse) pour ne jamais passer sous l'encoche ou la barre de gestes. `capacitor.config.json` active aussi `contentInset: "always"` côté iOS pour un rendu cohérent.
- **Couleur de fond** : `backgroundColor` est réglé sur `#F6F3EC` (crème, charte graphique de l'app) dans `capacitor.config.json` pour éviter un flash blanc au lancement.
- **Écran plein cadre sur mobile** : en dessous de 640px de large (tout appareil natif), l'app s'affiche en plein écran sans le cadre de téléphone décoratif (celui-ci n'apparaît qu'en aperçu desktop élargi).

## Structure

- `AthenaStyle.jsx` — composant applicatif principal (tous les écrans).
- `src/App.jsx` — réexporte `AthenaStyle.jsx`.
- `capacitor.config.json` — configuration Capacitor (appId, appName, webDir, couleurs).
- `ios/`, `android/` — projets natifs générés par Capacitor (committés, à resynchroniser après chaque build web).
