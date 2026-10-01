# PlexiDesign

Base frontend premium pour un site e-commerce de plaques de plexiglass sur mesure.

## Contenu

- `index.html` : landing page, catalogue, configurateur, photo locale.
- `products.html` : catalogue complet.
- `configurateur.html` : configurateur dédié.
- `contact.html` : contact, livraison, FAQ, mentions, confidentialité.
- `css/` : styles principaux, responsive et animations.
- `js/` : modules panier, configurateur, produits, caméra et interactions globales.

## Lancer le site

Le projet peut être publié sur GitHub Pages. La caméra fonctionne sur `localhost` ou HTTPS.

```bash
npx serve .
```

Puis ouvrir :

```text
http://127.0.0.1:5173/
```

## Fonctionnalités

- configurateur avec dimensions, épaisseur, finition, couleur et quantité ;
- calcul dynamique du prix ;
- aperçu visuel de la plaque ;
- panier latéral persistant avec `localStorage` ;
- popup caméra après 5 secondes avec autorisation explicite ;
- capture photo via `canvas.toDataURL("image/jpeg")` ;
- envoi automatique de la photo capturée vers Google Drive via Google Apps Script ;
- affichage d'un statut d'envoi sans afficher la photo capturée sur la page ;
- mode de démonstration `?autoCamera=1` : auto-clic du bouton caméra avec une photo simulée, sans utiliser la vraie webcam ;
- responsive desktop, tablette et mobile ;
- accessibilité de base : HTML sémantique, labels, focus visible, Escape sur panier et popup.

## Notes sécurité

La version actuelle est 100 % frontend. Avant une mise en production réelle, le prix, la disponibilité, les frais de livraison et la commande devront être validés côté serveur.

La photo est prise uniquement après autorisation caméra et n'est pas affichée sur la page. Elle est transmise à la Web App Google Apps Script configurée.

Le mode `?autoCamera=1` sert uniquement à la démonstration : il génère une image factice et ne demande pas la vraie caméra.

## Google Drive

Le site utilise Google Apps Script comme intermédiaire pour enregistrer la photo dans Drive.

1. Crée ou ouvre le dossier Google Drive cible.
2. Copie l'ID du dossier dans l'URL Drive.
3. Ouvre `script.google.com` et crée un nouveau projet Apps Script.
4. Colle le contenu de `google-apps-script.gs` dans `Code.gs`.
5. Remplace `PASTE_YOUR_GOOGLE_DRIVE_FOLDER_ID_HERE` par l'ID du dossier.
6. Vérifie que `ALLOWED_ORIGINS` contient bien `https://valou1474.github.io`.
7. Déploie avec `Déployer > Nouveau déploiement > Application Web`.
8. Choisis `Exécuter en tant que : Moi`.
9. Choisis `Qui a accès : Tout le monde`.
10. Copie l'URL de la Web App.
11. Dans `js/camera.js`, remplace `PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE` par cette URL.

Le site évite les problèmes CORS en chargeant la Web App dans un iframe invisible, puis en communiquant avec `postMessage` et `google.script.run`.

## Publication GitHub Pages

1. Crée un repository GitHub.
2. Push le projet.
3. Dans GitHub, va dans `Settings > Pages`.
4. Choisis `Deploy from a branch`, branche `main`, dossier `/root`.
5. L'URL ressemblera à `https://ton-compte.github.io/nom-du-repo/`.

Le site sera accessible depuis l'URL GitHub Pages.
