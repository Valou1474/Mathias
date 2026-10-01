# PlexiDesign

Base frontend premium pour un site e-commerce de plaques de plexiglass sur mesure.

## Contenu

- `index.html` : landing page, catalogue, configurateur, photo locale.
- `products.html` : catalogue complet.
- `configurateur.html` : configurateur dédié.
- `contact.html` : contact, livraison, FAQ, mentions, confidentialité.
- `css/` : styles principaux, responsive et animations.
- `js/` : modules panier, configurateur, produits, caméra et interactions globales.

## Lancer le site en statique

Le projet peut être publié sur GitHub Pages. La caméra fonctionne sur `localhost` ou HTTPS.

```bash
npx serve .
```

Puis ouvrir :

```text
http://127.0.0.1:5173/
```

## Lancer avec envoi email réel

GitHub Pages ne peut pas envoyer d'email, car c'est un hébergement statique. Pour activer l'envoi photo, lance le serveur Node inclus :

```bash
npm install
copy .env.example .env
npm start
```

Renseigne ensuite les variables SMTP dans `.env`. Le backend reçoit uniquement les photos envoyées avec consentement, vérifie le format PNG et envoie vers `valentin.leblanc@ecoles-epsi.net`.

## Fonctionnalités

- configurateur avec dimensions, épaisseur, finition, couleur et quantité ;
- calcul dynamique du prix ;
- aperçu visuel de la plaque ;
- panier latéral persistant avec `localStorage` ;
- popup caméra après 5 secondes avec autorisation explicite ;
- capture photo locale via `canvas.toDataURL()` ;
- consentement explicite avant envoi photo vers `valentin.leblanc@ecoles-epsi.net` ;
- endpoint `/api/photo-email` avec validation et envoi SMTP via Nodemailer ;
- responsive desktop, tablette et mobile ;
- accessibilité de base : HTML sémantique, labels, focus visible, Escape sur panier et popup.

## Notes sécurité

La version actuelle est 100 % frontend. Avant une mise en production réelle, le prix, la disponibilité, les frais de livraison et la commande devront être validés côté serveur.

L'envoi de photo par email passe par le serveur Node et exige un consentement explicite côté interface. La destination est fixée côté serveur pour éviter qu'un visiteur puisse choisir une autre adresse.

## Publication GitHub Pages

1. Crée un repository GitHub.
2. Push le projet.
3. Dans GitHub, va dans `Settings > Pages`.
4. Choisis `Deploy from a branch`, branche `main`, dossier `/root`.
5. L'URL ressemblera à `https://ton-compte.github.io/nom-du-repo/`.

Le site sera accessible depuis l'URL GitHub Pages. L'envoi email réel devra rester sur un backend séparé, ou être testé en local avec `npm start`.
