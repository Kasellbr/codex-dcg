# Codex DCG — version 2

Site de révision d'Aksel (GitHub Pages : https://kasellbr.github.io/codex-dcg/).

## Mettre en ligne cette version (une fois)
GitHub → ton dépôt → « Add file » → « Upload files » → glisse **tout le contenu** du dossier `codex-dcg-v2` (y compris le dossier `.github` : sur Mac, affiche les fichiers cachés avec Cmd + Maj + .) → « Commit changes ». Le fichier `semaines/2026-10-19.json` du zip remplace l'ancien : il ne contient plus que la pré-session du dimanche 25 octobre.

## Contenu du dépôt
- `index.html` : la page (ne contient plus de données).
- `assets/` : `app.js` (l'application), `style.css`, icônes.
- `data/base.json` : contenu de base (fiches, 400 cartes, QCM, cas pratiques, annales).
- `semaines/AAAA-MM-JJ.json` : programme d'une semaine (date du lundi). Un nouveau fichier est préparé chaque dimanche par la tâche planifiée « Préparation de la semaine DCG ».
- `pdfs/` : cours complets en PDF (inchangés).
- `manifest.webmanifest` et `sw.js` : installation sur l'écran d'accueil et fonctionnement hors connexion.

## Publication automatique de la semaine
Chaque dimanche, la tâche planifiée écrit le programme dans la page Notion « Codex DCG – fichier de la semaine ».
Le robot GitHub `.github/workflows/publier.yml` (script `.github/recuperer_semaine.py`) lit cette page le dimanche soir
et le lundi matin, ajoute `semaines/AAAA-MM-JJ.json` au dépôt et republie le site. Il republie aussi le site à chaque modification du dépôt.

Réglages à faire une seule fois :
1. Notion : créer une intégration interne « Codex DCG » (lecture seule) et copier sa clé secrète.
2. Notion : sur la page « Codex DCG – fichier de la semaine », menu ••• → Connexions → ajouter l'intégration.
3. GitHub : Settings → Secrets and variables → Actions → New repository secret : nom `NOTION_TOKEN`, valeur = la clé.
4. GitHub : Settings → Pages → Build and deployment → Source : « GitHub Actions ».
5. GitHub : onglet Actions → « Publier le site » → « Run workflow » pour vérifier (coche verte).

## Ajouter une semaine à la main (secours)
GitHub → dossier `semaines` → « Add file » → « Upload files » → dépose le fichier `AAAA-MM-JJ.json` → « Commit changes ».
Le site l'affiche tout seul (onglet « Aujourd'hui »), et ajoute ses cartes aux révisions le jour de chaque séance.

## Progression
Enregistrée dans le navigateur de chaque appareil. Onglet « Progrès » → Exporter / Importer pour la sauvegarder ou la transférer.
La progression de l'ancienne version est reprise automatiquement au premier lancement.

## Tester une autre date
Ajoute `?jour=2026-10-27` à l'adresse pour voir le site comme si on était ce jour-là.
