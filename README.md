# SOS QR – Fiche d'urgence pour cyclistes – Cyclo Club de Lambersart (coût : 0 €)

- Site : https://ozolozo.github.io/sos/
- Google Sheet du club : https://docs.google.com/spreadsheets/d/1J1XRJSjZ2scvWNRTTnMHMaiGYPkaf66hMPGFhyTtUQk/edit

Deux fichiers :

| Fichier | Rôle | Hébergement |
|---|---|---|
| `Code.gs` | API + stockage des fiches dans un Google Sheet | Google Apps Script (compte Google du club) |
| `index.html` | Fiche d'urgence publique, création/modification, impressions | GitHub Pages |

Aucune donnée n'est stockée sur GitHub : le dépôt ne contient que la page. Les fiches sont uniquement dans le Google Sheet.

## Fonctionnalités

- **Fiche publique** (ce que voit la personne qui scanne) : bouton 112, identité/âge, groupe sanguin, allergies et traitements surlignés, antécédents, contacts avec boutons Appeler / SMS, premiers gestes. Bascule FR / EN / NL.
- **Prévenir les proches** : récupère la position GPS du téléphone du témoin, pré-remplit les SMS (lien Google Maps + lien de la fiche) et envoie un e-mail d'alerte aux contacts et au membre (1 alerte max / 5 min).
- **Notification de consultation** : e-mail au membre quand sa fiche est ouverte (1 max / 15 min).
- **Espace membre** (lien personnel secret) : modification, désactivation, régénération du QR (les anciens QR deviennent inutilisables).
- **Impressions** : planche de 20 stickers casque (QR 26 mm), planche de 12 stickers (38 mm), carte portefeuille 85,6 × 54 mm, QR en PNG, fond d'écran verrouillé 1080 × 2340.
- **Vue club** : le Google Sheet centralise toutes les fiches ; l'onglet `Journal` trace scans, alertes et régénérations.
- **Inscription protégée** par un code club.

## Installation (≈ 20 min)

### 1. Google Sheet + Apps Script
1. Avec le compte Google du club, créer un Google Sheet vide (ex. « SOS QR – Club »).
2. **Extensions > Apps Script**, remplacer le contenu de `Code.gs` par celui fourni, enregistrer.
3. Sélectionner la fonction `setup` et cliquer **Exécuter** (accepter les autorisations).
   → Les onglets `Fiches` et `Journal` sont créés. Le **code club** s'affiche dans le journal d'exécution.
4. **Déployer > Nouveau déploiement** > type **Application Web** :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
   → Copier l'URL qui se termine par `/exec`.

### 2. GitHub Pages
1. Créer un dépôt **public** au nom court (ex. `sos`) : plus l'URL est courte, plus le QR est lisible en petit format.
2. Dans `index.html`, renseigner en haut du second script :
   ```js
   API_URL: 'https://script.google.com/macros/s/XXXX/exec',
   NOM_CLUB: 'Cyclo Club de …'
   ```
3. Déposer `index.html` à la racine du dépôt.
4. **Settings > Pages** : Source *Deploy from a branch*, branche `main`, dossier `/ (root)`.
   → URL du site : `https://<compte>.github.io/sos/`

### 3. Relier les deux
Dans Apps Script : **Paramètres du projet > Propriétés du script**, renseigner `URL_SITE` avec l'URL du site (avec le `/` final). Elle sert au lien envoyé par e-mail à chaque nouvel inscrit.

### 4. Diffuser aux membres
Lien d'inscription à envoyer : `https://<compte>.github.io/sos/?new&club=<CODE_CLUB>`

## Exploitation

- **Désactiver une fiche** : colonne `actif` = `NON` dans le Sheet (ou depuis l'espace membre).
- **Membre qui a perdu son lien personnel** : il est dans la colonne `cleEdition` → `https://…/sos/?k=<cleEdition>`.
- **Changer le code club** : propriété du script `CODE_CLUB`.
- **Modifier `Code.gs` après déploiement** : *Déployer > Gérer les déploiements > ✏️ > Version : Nouvelle version*. L'URL `/exec` reste la même (ne pas créer un nouveau déploiement, sinon l'URL change).

## Impression

- Imprimer en **taille réelle / 100 %** (pas « Ajuster à la page »), sinon les QR ne font plus 26 / 38 mm.
- Support : papier adhésif vinyle imperméable pour imprimante laser ou jet d'encre (selon votre imprimante), éventuellement recouvert d'un film laminé transparent pour le casque.
- Tester le scan de chaque planche avant découpe.

## Limites à connaître

| Point | Détail |
|---|---|
| Réseau | Le téléphone **qui scanne** doit avoir Internet pour afficher la fiche. Le n° ICE imprimé en clair sur le sticker sert de secours. |
| SMS | Aucun SMS automatique : les SMS partent du téléphone du témoin (pré-remplis). Les alertes automatiques sont des e-mails. |
| Quota e-mail | Apps Script, compte Gmail gratuit : 100 destinataires / jour (1 500 avec Google Workspace). |
| Démarrage | Le premier appel à l'API après une période d'inactivité peut prendre quelques secondes. |
| Visibilité | Les sections Identité, Médical et Contacts (hors e-mails) sont visibles par toute personne qui scanne le QR. Les e-mails et la clé personnelle ne sont jamais renvoyés par l'API publique. |

## Tests effectués

Le `Code.gs` réel a été exécuté contre une simulation des services Google (Sheet, Mail, Cache, Lock, Properties) et la page pilotée par navigateur (profil Pixel 7) :
création avec code club valide / refusé, conversion `06…` → `+336…`, neutralisation des formules, e-mail du lien personnel, fiche publique sans fuite d'e-mails, notification de consultation limitée, géolocalisation → SMS pré-remplis + e-mails d'alerte, anti-rejeu, modification, désactivation, régénération du QR (ancien inopérant), lecture des QR en PNG, fond d'écran et PDF imprimés (300 dpi, sticker par sticker).

**À faire sur le terrain avant diffusion** : un scan réel depuis un iPhone et un Android pour valider l'ouverture des liens `tel:` et `sms:` pré-remplis.

---
Bibliothèque QR intégrée : qrcode-generator 1.4.4 – Kazuhiko Arase – licence MIT.
