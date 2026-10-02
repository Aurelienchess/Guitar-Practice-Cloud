# Guitar Practice Cloud — package étudiant

Ce dépôt contient uniquement les ressources nécessaires aux trois TP :
`backend/` et `frontend-starter/`, ainsi que les sujets et documents utiles.

## Prérequis

- Node.js 22 ou plus récent ;
- un compte MongoDB Atlas par binôme ;
- Git et un navigateur récent.
- Un IDE de qualité
- Recommandé : un abonnement à un 

Consulter [ATLAS_SETUP.md](ATLAS_SETUP.md) pour créer la base de données.

## Démarrer le backend

```bash
cd backend
cp .env.example .env
```

Renseigner dans `.env` l’URI MongoDB Atlas et le secret JWT. Ne jamais publier
ce fichier ni copier un secret dans le code Angular.

```bash
npm install
npm start
```

Le backend écoute normalement sur `http://localhost:3000`.

## Démarrer le frontend

Dans un autre terminal :

```bash
cd frontend-starter
npm install
npm start
```

Ouvrir `http://localhost:4200`. Le compte de démonstration est
`demo@example.com` / `Demo1234!`.

## Documents de travail

- [SUJET_ETUDIANT_TP1.md](SUJET_ETUDIANT_TP1.md), [SUJET_ETUDIANT_TP2.md](SUJET_ETUDIANT_TP2.md) et [SUJET_ETUDIANT_TP3.md](SUJET_ETUDIANT_TP3.md) : missions des trois séances ;
- [API_CONTRACT.md](API_CONTRACT.md) : endpoints, authentification et formats échangés ;
- [RAPPORT_IA_MODELE.md](RAPPORT_IA_MODELE.md) : modèle de compte rendu.
- [CONSEILS_POUR_UTIISER_ASSISTANT_AI.md](CONSEILS_POUR_UTIISER_ASSISTANT_AI.md) : utiliser correctement un assistant IA, quel que soit l’outil choisi.

Le backend contient également ses propres consignes pour les assistants :
[`backend/AGENTS.md`](backend/AGENTS.md), [`backend/CLAUDE.md`](backend/CLAUDE.md),
[`backend/GEMINI.md`](backend/GEMINI.md) et
[`backend/best-practices.md`](backend/best-practices.md). Elles couvrent
Node.js, Express, Mongoose, MongoDB, l’authentification, Multer, les uploads,
les logs et les tests.

Les fichiers audio présents dans `frontend-starter/fichiers-audio-de-test/` sont
des fixtures fournies pour les essais. Aucun fichier uploadé, dossier de
dépendances (`node_modules`), fichier `.env` ou identifiant local n’est inclus.

## Ajouts supplémentaires non demandés dans les tp

En plus des exigences obligatoires des trois sujets de TP, plusieurs fonctionnalités, ont été implémentés et documentés dans `RAPPORT_IA_MODELE.md` :

### 1. Fonctionnalités avancées & Architecture (TP2)
- Pagination côté serveur via pipeline d'agrégation MongoDB : Remplacement de la pagination basique par un pipeline d'agrégation Mongoose et mise à jour du contrat d'API dans `API_CONTRACT.md`.
- Intégration d'Angular Material Paginator : Remplacement des boutons Précédent/Suivant par un choix dynamique du nombre d'éléments par page et une navigation plus complète avec première, précédente, suivante et dernière page.
- Extraction automatique des tags ID3 : Analyse des métadonnées du fichier audio à l'upload pour extraire automatiquement l'artiste, l'album et la jaquette d'origine pour illustrer les cartes de morceaux.
- Formatage lisible des métadonnées : Conversion des tailles de fichiers en unités adaptées (Ko, Mo, Go) et affichage des dates par rapport au format local français.

### 2. Expérience Utilisateur
- Recherche instantanée avec la pagination serveur : Champ de recherche insensible à la casse sur le titre, l'artiste, l'album et le nom de fichier, garantissant que tous les morceaux correspondants sont immédiatement regroupés sur la page courante.
- Bouton Play / Pause interactif : Alternance de l'icône de la carte de morceau, permettant de mettre en pause la musique en un clic direct sur sa carte.
- Fenêtre modale personnalisée pour la confirmation de suppression : Remplacement de l'alerte par une modale avec rappel du titre du morceau ciblé et protection contre les doubles clics.
- Refonte visuelle du Header, des bouton et du menu déroulant 
- Affichage du nom de l'utilisateur connecté avec restauration automatique de session au rafraîchissement de la page.

### 3. Renforcement de la Sécurité backend & frontend
- Protection anti-brute force par limitation de débit : Middleware personnalisé limitant les tentatives.
- Validation Fail-Fast du secret JWT : Le serveur backend refuse de démarrer si la clé secrète est absente, comporte moins de 16 caractères ou correspond à la valeur par défaut.
- Cookie HttpOnly : Le jeton JWT est stocké uniquement en mémoire vive dans un Signal Angular.
- Garde de routage : Lors d'un rafraîchissement de page, le garde restaure automatiquement le jeton en mémoire en interrogeant le cookie de session avant d'autoriser l'accès à la route.

### 4. Bonnes pratiques d'exploitation et Conformité RGPD
- Journalisation des fichiers logs journaliers : Enregistrement des requêtes HTTP dans des fichiers logs avec date, heure, adresse IP cliente, méthode, route, code HTTP et durée.
- Purge automatique après 6 mois : Nettoyage automatique des fichiers logs obsolètes au démarrage et toutes les 24h, respectant le principe de minimisation et les recommandations RGPD sur la durée de conservation des données de connexion.

### 5. Suite de tests automatisés
- 12 tests backend : Ajout de tests de contrat et de sécurité pour la gestion des jetons invalides, les erreurs d'upload, le rate limiting, la déconnexion par cookie, la journalisation et la purge après 6 mois.
- Tests frontend : Validation des services et intercepteurs avec simulation réseau.