# Cycle

Suivi des règles sous pilule contraceptive, sous forme de web app installable sur iPhone.
Tout fonctionne hors connexion ; les données restent dans le téléphone (localStorage).

## Installer sur iPhone

1. Ouvrir le lien de l'app dans **Safari**.
2. Toucher **Partager** (carré avec une flèche vers le haut).
3. Choisir **Sur l'écran d'accueil**, puis **Ajouter**.

## Fichiers

- `index.html`, `styles.css`, `app.js` : l'application.
- `sw.js` : service worker (hors connexion). Changer `VERSION` à chaque mise en ligne.
- `icons/` : icônes et écrans de lancement, générés depuis `tools/icon.svg`.
- Ajouter `?sim` à l'adresse simule l'encoche et la barre d'accueil d'un iPhone 15 (contrôle visuel).
