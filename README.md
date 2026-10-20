# PlexiDesign

Site e-commerce de plaques de plexiglass sur mesure avec backend Raspberry Pi pour enregistrer les photos en base SQLite.

## Contenu

- `index.html` : accueil, catalogue, configurateur et statut photo.
- `products.html` : catalogue complet.
- `configurateur.html` : configurateur dédié.
- `contact.html` : contact, livraison, FAQ, mentions, confidentialité.
- `admin.html` : page admin pour consulter les photos enregistrées.
- `css/` : styles principaux, responsive et animations.
- `js/` : modules panier, configurateur, produits, caméra, admin et interactions globales.
- `server.js` : serveur Node.js pour Raspberry Pi.
- `database/schema.sql` : SQL de création de la base de données SQLite.

## Fonctionnement

- Le site est servi par le Raspberry avec Node.js.
- Une fenêtre explique l’envoi de la photo et l’enregistrement de l’IP ; la caméra est demandée après acceptation explicite.
- Une case facultative permet de joindre une position récente (coordonnées, précision en mètres et date du relevé). Le navigateur demande une autorisation de localisation distincte. En cas de refus, d’indisponibilité ou de délai dépassé, la photo est envoyée sans position.
- La photo est capturée en JPEG via `canvas.toDataURL("image/jpeg")`.
- La photo n'est pas affichée sur le site public après capture et aucun grand message de succès n'est ajouté à la page.
- Le navigateur envoie la photo en `POST /api/photos`.
- Le serveur enregistre l'image dans `data/photos.sqlite`.
- La page `admin.html` affiche l’IP, la date de prise et la position avec un lien OpenStreetMap. Chaque photo peut être supprimée avec ses données associées après confirmation.
- Le mode `?autoCamera=1` reste un mode de démonstration : après acceptation, il génère une image factice sans webcam ni localisation réelle.

## Installation Raspberry Pi

Installe Node.js, puis dans le dossier du projet :

```bash
npm install
```

Lance le serveur :

```bash
ADMIN_USER=admin ADMIN_PASSWORD='mot-de-passe-fort' npm start
```

Par défaut, le serveur écoute sur :

```text
http://localhost:3000/
```

Depuis un autre appareil du même réseau, utilise l'adresse IP du Raspberry :

```text
http://IP_DU_RASPBERRY:3000/
```

Sur téléphone, la caméra et la localisation nécessitent un accès **HTTPS** (exception : `localhost` sur l’appareil lui-même). L’adresse HTTP locale du Raspberry permet de consulter le site, mais les autorisations caméra/localisation peuvent être indisponibles.

La page admin est ici :

```text
http://IP_DU_RASPBERRY:3000/admin.html
```

## Base de données

La base SQLite est créée automatiquement au lancement du serveur dans :

```text
data/photos.sqlite
```

Le fichier SQL de création est :

```text
database/schema.sql
```

Au redémarrage, les colonnes IP et localisation sont ajoutées automatiquement aux bases existantes, en conservant les anciennes photos. Les anciennes photos affichent « Non enregistrée » pour l’IP et aucune position : ces données ne peuvent pas être reconstituées.

Pour créer la base manuellement avec l'outil `sqlite3` :

```bash
mkdir -p data
sqlite3 data/photos.sqlite < database/schema.sql
```

## Variables utiles

```bash
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./data/photos.sqlite
ADMIN_USER=admin
ADMIN_PASSWORD=mot-de-passe-fort
```

Si un reverse proxy relaie les connexions, configure `TRUST_PROXY` avec ses adresses ou réseaux de confiance, séparés par des virgules. Exemple pour un proxy sur la même machine : `TRUST_PROXY=loopback`. Le proxy doit remplacer les en-têtes de transfert fournis par le client. Sans cette variable, l’IP enregistrée est celle de la connexion directe ; derrière un proxy, ce sera celle du proxy. L’IP peut aussi être celle d’un VPN ou d’un réseau partagé et ne fournit pas une position GPS.

La suppression via `DELETE /api/photos/:id` exige les identifiants admin et retire l’image et les métadonnées de la base active. Les éventuelles sauvegardes externes de la base sont à gérer séparément. Les dossiers privés (notamment `data/`, `database/` et `node_modules/`) ne sont pas servis publiquement.

## Vérification

```bash
npm test
```

Les tests utilisent une base temporaire indépendante des photos du site.
Sur un Raspberry Pi, leur démarrage peut être lent : le test du serveur attend jusqu’à deux minutes à chaque lancement avant de signaler un délai dépassé.

Important : change toujours `ADMIN_PASSWORD` avant d'exposer le Raspberry sur ton réseau.

## Lancement automatique avec systemd

Exemple de service à adapter avec le chemin réel du projet :

```ini
[Unit]
Description=PlexiDesign Raspberry
After=network.target

[Service]
WorkingDirectory=/home/pi/plexidesign
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=ADMIN_USER=admin
Environment=ADMIN_PASSWORD=mot-de-passe-fort

[Install]
WantedBy=multi-user.target
```

## Notes sécurité

Le backend accepte les images JPEG ou PNG jusqu'à 5 Mo.

La page admin protège la liste et l'affichage des images avec une authentification Basic. Pour un vrai usage public, ajoute HTTPS, un mot de passe fort, et évite d'exposer directement le Raspberry à Internet sans reverse proxy sécurisé.
