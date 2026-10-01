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
- La caméra est utilisée uniquement après action de l'utilisateur sur le bouton d'accord.
- La photo est capturée en JPEG via `canvas.toDataURL("image/jpeg")`.
- La photo n'est pas affichée sur le site public après capture.
- Le navigateur envoie la photo en `POST /api/photos`.
- Le serveur enregistre l'image dans `data/photos.sqlite`.
- La page `admin.html` permet de voir les photos avec identifiant et mot de passe.
- Le mode `?autoCamera=1` reste un mode de démonstration : il génère une image factice et n'utilise pas la vraie webcam.

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
