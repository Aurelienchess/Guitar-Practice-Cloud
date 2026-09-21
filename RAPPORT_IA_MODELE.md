# Rapport d'usage de l'IA - TP1

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.

---

## 1. Prise de connaissance du projet & Initialisation du protocole IA

**Prompt :**
> "Dans un premier temps prend connaissance de mon projet, notamment tous les fichiers .md (RAPPORT_IA_MODELE.md, SUJET_ETUDIANT_TP2.md (globalement ce que je vais devoir faire en deuxième), CONSEILS_POUR_UTIISER_ASSISTANT_AI.md, SUJET_ETUDIANT_TP3.md (globalement ce que je vais devoir faire en dernier), SUJET_ETUDIANT_TP1.md (globalement ce que je vais devoir faire en premier), frontend-starter/best-practices.md, backend/best-practices.md, API_CONTRACT.md, ATLAS_SETUP.md, frontend-starter/GEMINI.md, frontend-starter/CLAUDE.md, frontend-starter/AGENTS.md, backend/GEMINI.md, backend/CLAUDE.md, backend/AGENTS.md, README.md, RAPPORT_IA_MODELE.md) qui explique globalement le fonctionnement de l'IA dans ce projet."

### Rapport de ce que l'agent a vu et analysé
- **Structure globale des TP :**
  - **TP1 (`SUJET_ETUDIANT_TP1.md`) :** Architecture, Authentification et Profil utilisateur. Mise en place de formulaires réactifs, appels API `/api/auth/register` et `/api/auth/login`, stockage du JWT côté client, mise à jour du Signal `currentUser`, gestion du profil avec `GET` et `PUT /api/users/me`, intercepteur HTTP JWT et gestion des statuts 401.
  - **TP2 (`SUJET_ETUDIANT_TP2.md`) :** Bibliothèque de morceaux audio avec pagination côté serveur (`GET /api/tracks?page=...&limit=...`), upload multipart (avec Multer côté back) sous champs `audio` et `title` (limité à 25 Mo), lecture audio sécurisée via récupération de `Blob`, génération d'un `ObjectURL` et révocation propre à la destruction.
  - **TP3 (`SUJET_ETUDIANT_TP3.md`) :** Suppression d'une piste (`DELETE /api/tracks/:id`), suivi de la progression de l'upload via les événements HTTP Angular, et écriture d'au moins 3 tests automatisés unitaires/intégration frontend (tests sans base de données réelle).
- **Règles et bonnes pratiques de développement :**
  - **Frontend Angular 22 (`frontend-starter/best-practices.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) :** Composants standalone obligatoires (sans spécifier `standalone: true` ni `ChangeDetectionStrategy.OnPush` car ils sont activés par défaut en v22), utilisation de `inject()`, gestion réactive d'état avec les Signals, Reactive Forms, structures de contrôle natives `@if`, `@for`, `@switch`, séparation stricte composant -> service (`providedIn: 'root'`) -> `HttpClient` (jamais de `HttpClient` direct dans les composants), pas de credentials ni de secrets dans le frontend.
  - **Backend Express/Mongoose (`backend/best-practices.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`) :** Utilisation de Mongoose avec schémas explicites, gestion d'erreurs asynchrones avec `async`/`await`, middlewares de validation et de sécurité, upload sécurisé avec Multer (limite 25 Mo, validation type MIME, stockage sous nom unique), logs informatifs sans données sensibles (pas de tokens, ni mots de passe, ni URI MongoDB).
- **Contrat HTTP (`API_CONTRACT.md`) :**
  - Préfixe `/api`. Routes publiques (`/health`, `/auth/register`, `/auth/login`) et routes protégées nécessitant le header `Authorization: Bearer <token>` (`/users/me`, `/tracks`, etc.). Tout changement d'API doit impérativement être consigné dans ce fichier.
- **Consignes d'utilisation de l'assistant IA (`CONSEILS_POUR_UTIISER_ASSISTANT_AI.md`) :**
  - Rôle de l'étudiant : garder la pleine maîtrise et compréhension du code, valider chaque étape, ne jamais faire de copier-coller aveugle.
  - Travail par étapes incrémentales, vérification systématique dans les DevTools (onglet Network) et via `npm run build` et tests.
  - Traçabilité des interactions avec l'IA et tenue rigoureuse du document de synthèse `RAPPORT_IA_MODELE.md`.

### Explication du premier prompt :
Il permet de donner à l'agent une vision globale du projet et de son environnement de travail. Je lui ai demandé de s'atarder dans un prermier temps tout particulièrement sur les fichiers .md pour que l'agent puisse prendre connaissance des conventions et des consignes concernant l'ia afin de les respecter. De plus il peut prendre connaissance des consignes des 3 tps afin qu'il ai une idée de l'ensemble de l'avancement du projet et qu'il n'anticipe pas des modifications qui arriveraient plus tard.

---

## 2. Analyse détaillée du Backend, Workflows, Base de Données et Sécurité

**Prompt :**
> "Maintenant que tu as une idée globale de mon projet, analyse le backend, je veux comprendre l'architecture, les workflows, les technologies et modules utilisées, comment est gérée l'authentification, comment l'upload des fichiers est gérée, comment les échanges avec la bd sont fait, génère moi des diagrammes et des schémas et mets le résultat dans backend/analyse.md. Tu ajoutera aussi dis critiques de ce code par ordre de priorité d'importance et que tu suggère des améliorations à venir. En particulier sur les aspects sécurité."

### Rapport de ce que l'agent a fait et analysé
- **Exploration et inventaire exhaustif du backend :**
  - Examen des dépendances (`package.json`) : Node.js 22 (ESM natif), Express 5.1.0, Mongoose 9.0.0, bcryptjs 3.0.2, jsonwebtoken 9.0.2, multer 2.0.2, cors 2.8.5.
  - Analyse du point d'entrée (`server.js`) : Démarrage asynchrone, validation de présence de `MONGODB_URI`, connexion MongoDB Atlas bloquante avec `mongoose.connect()`, initialisation automatique du compte `demo@example.com` si absent, gestion de l'écoute HTTP sur le port configuré.
  - Analyse de l'application et du pipeline Express (`app.js`) : Middleware de logs chronométrés, middleware CORS permissif, parseur JSON natif, middleware personnalisé `auth` (validation JWT via `jwt.verify`), configuration du stockage Multer sur disque (`diskStorage` avec UUID et extension, limite de taille 25 Mo, filtre de type MIME audio), handlers de routes pour auth, users et tracks, et gestionnaire central d'erreurs (MulterError, ValidationError, CastError).
  - Analyse des modèles Mongoose (`models/User.js` et `models/Track.js`) :
    - `User.js` : Définition du schéma avec contraintes d'unicité, setter virtuel `password`, hook `pre('validate')` pour le hachage asynchrone avec `bcryptjs` (salt 10), méthode d'instance `verifyPassword`, projection publique `toPublic()`, masquage par défaut de `passwordHash` (`select: false`).
    - `Track.js` : Référence `ownerId` vers `User`, masquage de `storedName` (`select: false`), index composite `{ ownerId: 1, createdAt: -1 }` optimisant la pagination par utilisateur, méthode `toPublic()`.
  - Examen de la suite de tests (`test/api.test.js`) : Utilisation du runner natif `node:test` pour tester `/api/health` et la conformité des schémas Mongoose sans nécessiter de connexion active à la base de données.
- **Rédaction du document d'analyse (`backend/analyse.md`) :**
  - Synthèse des technologies et justification de chaque module.
  - Schéma d'architecture globale en Mermaid (Angular <-> Express pipeline <-> Mongoose/Atlas et Filesystem).
  - Diagrammes de séquence et d'activité détaillant :
    - L'authentification (inscription `POST /api/auth/register`, connexion `POST /api/auth/login`, protection par token via le middleware `auth`).
    - L'upload audio (traitement `multipart/form-data`, vérification MIME/taille, écriture sur disque, sauvegarde MongoDB et rollback en cas d'erreur).
    - La lecture et le streaming audio (`GET /api/tracks/:id/audio` avec vérification de propriété et `res.sendFile`).
    - La suppression de piste (`DELETE /api/tracks/:id` avec nettoyage du fichier disque).
  - Diagramme Entité-Association (ERD) des collections MongoDB.
  - Revue critique hiérarchisée par niveau de risque (2 failles critiques : secret JWT par défaut et absence de rate limiting ; 3 failles élevées : CORS ouvert, filtrage MIME non vérifié par magic numbers, absence de Helmet ; points d'architecture et de maintenabilité).
  - Plan d'amélioration et recommandations concrètes de renforcement.

### Pourquoi j'ai voulu faire ça et ce que j'en ai compris
Avant de commencer le développement et apporter des modifications fonctionnelles il est important de bien comprendre le fonctionnement du backend actuellement. Cette analyse me permet donc d'avoir une idée de l'architecture pour mieux comprendre les échanges de flux de données comme la création de compte, la connexion et la gestion des fichiers audio. De plus l'explicatif des technologies utilisées me permet de mieux les comprendre. C'est le cas notament de Mongoose car je pensais initialement qu'il représentait uniquement la base de données lors des échanges de données alors qu'il s'occupe de bien plus comme par exemple l'hashage et la validation utilisateur.
Pour finir j'ai grâce à ce prompt une idée des vulnérabilités actuelles du backend d'un point de vue sécurité afin d'être en mesure de les corriger dans un avenir proche et de les expliquer.

---

## 3. Analyse détaillée du Frontend, Navigation des Données et Sécurité

**Prompt :**
> "Maintenant j'aimerais que tu fasse la même analyse que le backend mais pour le frontend en exposant les technologies utilisés, la navigation de données en la reliant avec le backend et tous les problèmes de sécurités dans l'ordre d'importance où tu proposera des améliorations. Le tout avec des schéma."

### Rapport de ce que l'agent a fait et analysé
- **Exploration approfondie du code source `frontend-starter/` :**
  - Examen des dépendances (`package.json`) : Angular 22.1.0 standalone, RxJS 7.8.0, Vitest 4.0.8, proxy de développement `proxy.conf.json`.
  - Analyse du point d'amorçage (`main.ts`) : `bootstrapApplication` avec `provideRouter(routes)` et `provideHttpClient(withInterceptors([authInterceptor]))`.
  - Cartographie des composants et de la navigation (`routes.ts`, `app/components/*`) :
    - `AppComponent` : Shell racine, barre de navigation statique (sans état réactif connecté/déconnecté).
    - `LoginPageComponent` & `RegisterPageComponent` : Formulaires réactifs (`FormGroup`), validation de base, appels d'authentification.
    - `ProfilePageComponent` : Consultation et mise à jour du profil via `AuthService`.
    - `TracksPageComponent` : Pagination serveur, upload de fichier via `FormData`, et lecture audio sécurisée via récupération de `Blob`.
  - Analyse de l'infrastructure partagée (`src/app/shared/`) :
    - `AuthService` : Gestion réactive d'état par Signals (`token`, `currentUser`) et persistance dans `localStorage`.
    - `TrackService` : Méthodes HTTP encapsulées (`list`, `upload`, `audio`).
    - `authGuard` : Garde de routage fonctionnel (`CanActivateFn`) basé sur `auth.token()`.
    - `authInterceptor` : Intercepteur HTTP fonctionnel injectant le header `Authorization: Bearer <token>`.
- **Rédaction du document d'analyse (`frontend-starter/analyse.md`) :**
  - Synthèse des technologies modernes (Angular 22 standalone, Signals, RxJS, Vitest).
  - Schéma d'architecture globale reliant les composants, les services, le stockage local, l'intercepteur, le proxy et l'API backend.
  - Diagrammes de séquence détaillés :
    - Authentification et synchronisation d'état (Formulaire -> AuthService -> API -> `localStorage` -> Signals -> Router).
    - Garde de routage et intercepteur JWT (Vérification guard -> injection Bearer token).
    - Lecture audio sécurisée en mémoire (`Blob` -> `URL.createObjectURL` -> `<audio [src]>`).
  - Revue critique de sécurité classée par sévérité (XSS sur `localStorage`, absence de capture des erreurs 401 dans l'intercepteur, fuites mémoire d'`ObjectURL` sans destruction, garde naïve, intercepteur non scopé).
  - Recommandations concrètes de renforcement (gestion 401, `DestroyRef`, validation stricte des formulaires).

### Ce que j'en ai compris, pourquoi j'ai voulu faire ça
Après avoir clarifié le backend, il est normal d'avoir la même clarté sur le frontend. Ce prompt m'a donc permis d'avoir un aperçu sur comment l'application gère les formulaires, la transition des données jusqu'au proxy et à l'API, ainsi que le fonctionnement du lecteur audio par Blob de manière plus visuel. Par ailleurs je ne comprenais pas à quoi correspondait le token JWT. Ce prompt m'a donc permis de comprendre qu'il sert de preuve d'identité émise à la connexion et que le serveur n'a pas à stocker mais uniquement à valider cette preuve et que l'intercepteur HTTP injecte le header sur chaque requête angular. De plus le fait que le serveur n'est pas à stocker cette signature ça permet, d'un point de vue sécurité, que si le payload est modifié, alors la signature ne correspond plus et le token est rejeté. 
Pour finir, des failles côté client sont aussi présentes et pourront potentiellement être corrigées par la suite.

---

## 4. Mission 0 : Cartographier l'application

**Prompt :**
> « Réalisons maintenant la mission 0 de mon TP1 dans le rapport. Retrouve et décris le composant racine, puis la configuration des routes, puis l'enregistrement de `HttpClient`, puis les modèles, services et pages, puis le mécanisme qui ajoute le JWT aux requêtes protégées et enfin créer un schéma annoté du flux lors d'un clic sur « Se connecter ». »

### Rapport de ce que l'agent a fait et analysé

#### Composant racine : `app/components/app/app.ts`
- Sélecteur HTML : `<app-root>`, c'est lui que `index.html` monte au démarrage.
- Classe vide (`export class AppComponent {}`), toute la logique est déléguée aux services.
- Importe uniquement `RouterLink` et `RouterOutlet` : il se contente d'afficher la barre de navigation et la vue de la route active via `<router-outlet>`.
- Pas d'état réactif : la barre de navigation est statique (ne change pas selon qu'on est connecté ou non).

#### Configuration des routes : `app/routes.ts`
| Route | Composant | Garde |
|---|---|---|
| `/` (vide) | → redirige vers `/tracks` | : |
| `/login` | `LoginPageComponent` | aucune |
| `/register` | `RegisterPageComponent` | aucune |
| `/profile` | `ProfilePageComponent` | `authGuard` |
| `/tracks` | `TracksPageComponent` | `authGuard` |
| `**` (tout le reste) | → redirige vers `/tracks` | : |

- Les routes `/profile` et `/tracks` sont protégées par `canActivate: [authGuard]` : si le token est absent, l'utilisateur est renvoyé vers `/login`.

#### Enregistrement de `HttpClient` : `main.ts`
```typescript
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
});
```
- `provideHttpClient(...)` enregistre `HttpClient` pour toute l'application au niveau racine (équivalent moderne du module `HttpClientModule`).
- `withInterceptors([authInterceptor])` branche l'intercepteur JWT sur **toutes** les requêtes HTTP sortantes dès le démarrage.

#### Modèles TypeScript : `app/shared/models/`
| Fichier | Rôle |
|---|---|
| `user.model.ts` | Forme de l'objet `User` renvoyé par l'API (`id`, `name`, `email`) |
| `auth-response.model.ts` | Réponse du login/register : `{ token: string, user: User }` |
| `track.model.ts` | Forme d'une piste audio (`id`, `title`, `duration`, `createdAt`) |
| `page.model.ts` | Enveloppe de pagination : `{ data: T[], total, page, limit }` |

#### Services : `app/shared/services/`
- **`AuthService`** (`providedIn: 'root'`) :
  - Contient deux Signals : `token` (initialisé depuis `localStorage`) et `currentUser`.
  - Méthodes : `login`, `register`, `profile`, `update`, `logout`.
  - Appelle `HttpClient` directement : les composants ne touchent jamais à `HttpClient`.
- **`TrackService`** (`providedIn: 'root'`) :
  - Méthodes : `list(page, limit)`, `upload(file, title)`, `audio(id)` (réponse de type `Blob`).

#### Garde de routage : `app/shared/guards/auth.guard.ts`
```typescript
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.token() ? true : router.createUrlTree(['/login']);
};
```
- Vérifie uniquement la **présence** du token dans le Signal (pas l'expiration ni la validité cryptographique).

#### Pages (composants de page) : `app/components/`
| Composant | Responsabilité |
|---|---|
| `LoginPageComponent` | Formulaire réactif email/mot-de-passe, appel `AuthService.login()` |
| `RegisterPageComponent` | Formulaire réactif nom/email/mot-de-passe, appel `AuthService.register()` |
| `ProfilePageComponent` | Affichage + modification du nom via `AuthService.profile()` et `update()` |
| `TracksPageComponent` | Liste paginée, upload de fichier, lecture audio via `Blob` + `ObjectURL` |

#### Mécanisme JWT : `app/shared/interceptors/auth.interceptor.ts`
```typescript
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(AuthService).token();
  return next(
    token
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request,
  );
};
```
- À chaque requête HTTP, l'intercepteur lit le Signal `token` de `AuthService`.
- Si le token est présent, il **clone** la requête (immuabilité) en y ajoutant le header `Authorization: Bearer <token>`.
- Si aucun token, la requête passe telle quelle (routes publiques `/auth/login`, `/auth/register`).

---

#### Schéma annoté : Flux lors d'un clic sur « Se connecter »

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant LP as LoginPageComponent
    participant AS as AuthService
    participant IC as authInterceptor
    participant PX as Proxy dev :4200
    participant EX as Express :3000
    participant MG as MongoDB Atlas

    U->>LP: Clic "Se connecter"
    LP->>LP: form.getRawValue()
    LP->>AS: auth.login(email, password)
    AS->>IC: HttpClient POST /api/auth/login
    Note over IC: token() == null<br/>route publique, requête non modifiée
    IC->>PX: POST /api/auth/login
    PX->>EX: Proxy vers :3000
    EX->>MG: User.findOne({ email })
    MG-->>EX: Document User
    EX->>EX: verifyPassword() via bcryptjs
    EX->>EX: jwt.sign({ sub, email }, SECRET, 2h)
    EX-->>PX: 200 { token, user }
    PX-->>AS: Observable AuthResponse
    AS->>AS: localStorage.setItem gpc_token
    AS->>AS: token.set(response.token)
    AS->>AS: currentUser.set(response.user)
    AS-->>LP: next() - succès
    LP->>LP: router.navigateByUrl('/tracks')
    Note over LP: Toutes les requêtes suivantes<br/>reçoivent Authorization: Bearer token
```

### Ce que j'en ai compris
Ici, l'agent se sert des fichiers d'analyses précédemments effectuer pour fournir les livrables de la mission 0. En effet, cela permet de terminer cette phase de préparation avant le développement. On peut dès lors constater les différentes couches de l'application : le composant racine qui délègue l'affichage au routeur, le routeur, qui protège certaines routes, et l'intercepteur JWT qui branche automatiquement le token sur toutes les requêtes HTTP sans que les composants aient à s'en occuper. Le schéma de séquence permet de suivre précisément le chemin que font les données quand l'utilisateur clique sur « Se connecter » depuis le formulaire jusqu'à la réponse de MongoDB, en passant par le proxy de développement. La route /api/auth/login est publique car l'intercepteur laisse passer la requête sans token et que c'est seulement après la réponse réussie que le token est stocké dans le localStorage et dans le Signal, ce qui déclenche ainsi l'accès aux routes protégées pour toutes les requêtes suivantes. 

#### Différence entre le Signal et le localStorage
La différence entre le localStorage et le Signal est que le localStorage laisse la donnée sur le disque même si la page est fermée ou rafraîchie alors que le Signal maintient la donnée en mémoire et alèrte tous les composants en lien avec elle de son changement.
C'est pour cela qu'au démarrage de l'application AuthService initialise le Signal en lisant localStorage ce qui permet de restaurer une potentiel session existante et qu'ensuite le Signal pilote l'interface en temps réel sans que les composants aient besoin du localStorage.

---

## 5. Mission 1 : Compléter la partie utilisateur du frontend

**Prompt :**
> « Maintenant j'aimerais réaliser la mission 1 : Compléter ou réécrire la partie utilisateur du frontend : formulaires réactifs pour l'inscription et la connexion ; validations et messages d'erreur compréhensibles ; appels de /api/auth/register et /api/auth/login ; sauvegarde du JWT côté navigateur, sans jamais l'afficher dans les logs ; mise à jour du Signal currentUser ; redirection après une connexion ou une inscription réussie ; bouton de déconnexion avec nettoyage de l'état local ; chargement de /api/users/me lorsque le profil est demandé ; modification du nom avec PUT /api/users/me ; gestion d'un 401, avec retour vers /login si le token est invalide ou expiré. »
### Rapport de ce que l'agent a fait et analysé

#### 1. `auth.interceptor.ts` : Ajout de la gestion du 401
**Problème :** L'intercepteur original ne faisait qu'ajouter le token. Si le serveur répondait `401 Unauthorized` (token expiré ou invalide), rien ne se passait côté client.

**Ce qui a été ajouté :**
- Import de `catchError` et `throwError` de RxJS.
- Import de `Router`.
- Pipeline `.pipe(catchError(...))` sur la réponse HTTP : si le statut est `401`, `auth.logout()` est appelé (nettoyage `localStorage` + remise à zéro des Signals) puis `router.navigateByUrl('/login')` redirige l'utilisateur.
- La requête rejetée est relancée via `throwError(() => error)` pour que les composants puissent aussi catcher l'erreur si nécessaire.

```typescript
return next(req).pipe(
  catchError((error: { status?: number }) => {
    if (error.status === 401) {
      auth.logout();
      void router.navigateByUrl('/login');
    }
    return throwError(() => error);
  }),
);
```

---

#### 2. `login-page.ts` + `login-page.html` : Connexion renforcée

**Modifications du composant :**
- Suppression des valeurs par défaut `demo@example.com` / `Demo1234!` (faille de sécurité : des credentials ne doivent pas être codés en dur dans le source).
- Ajout du validateur `Validators.minLength(8)` sur le mot de passe.
- Ajout du Signal `loading` : mis à `true` au début de la requête, `false` à la fin (succès ou erreur), pour désactiver le bouton et prévenir le double-envoi.
- Suppression du `console.debug` qui affichait le résultat de connexion (le token ne doit jamais apparaître dans les logs).
- Ajout d'un `if (this.form.invalid) return;` de garde en début de `submit()`.

**Modifications du template :**
- Messages d'erreur par champ (apparus uniquement après que le champ a été touché) :
  - Email : « L'adresse email est requise » / « Veuillez entrer une adresse email valide ».
  - Mot de passe : « Le mot de passe est requis » / « Le mot de passe doit contenir au moins 8 caractères ».
- Bouton `[disabled]="form.invalid || loading()"` : désactivé si le formulaire est invalide OU si une requête est en cours.
- Texte du bouton dynamique : « Se connecter » → « Connexion… » pendant le chargement.
- Attributs `autocomplete` sur les inputs (bonne pratique UX).

---

#### 3. `register-page.ts` + `register-page.html` : Inscription renforcée

**Modifications du composant :**
- Ajout de `Validators.minLength(2)` sur le champ `name`.
- Ajout de `Validators.minLength(8)` sur le champ `password`.
- Ajout du Signal `loading`.
- Redirection vers `/tracks` (au lieu de `/profile`) après inscription réussie, cohérent avec le comportement de la connexion.
- Suppression des `console.debug` / `console.error` remplacés par le Signal `error`.

**Modifications du template :**
- Messages d'erreur par champ sur les trois champs (nom, email, mot de passe).
- Bouton désactivé si formulaire invalide ou chargement en cours.
- Texte du bouton dynamique : « Créer mon compte » → « Inscription… ».

---

#### 4. `profile-page.ts` + `profile-page.html` : Profil automatique et feedback utilisateur

**Modifications du composant :**
- Implémentation de `OnInit` : le profil est désormais chargé automatiquement à l'ouverture de la page (`ngOnInit` → `auth.profile().subscribe(...)`) sans que l'utilisateur ait à cliquer sur « Charger mon profil ».
- Ajout du Signal `saved` : passe à `true` après un enregistrement réussi pour afficher un message de confirmation.
- Ajout du Signal `error` : affiche le message d'erreur renvoyé par l'API (ou un message générique) en cas d'échec.
- Ajout du Signal `loading` : désactive le bouton pendant la requête `PUT`.
- Suppression de tous les `console.debug` et `console.error` : l'état est géré par les Signals visibles dans l'UI.
- Ajout de `Validators.minLength(2)` sur le champ nom.

**Modifications du template :**
- Suppression du bouton manuel « Charger mon profil ».
- Affichage d'un état de chargement (« Chargement du profil… ») tant que `currentUser` est `null`.
- Message de succès (« Nom mis à jour avec succès ✓ ») via `@if (saved())`.
- Message d'erreur via `@if (error())`.
- Validation par champ sur le nom.
- Bouton désactivé si formulaire invalide ou loading.

---

#### 5. `app.ts` + `app.html` : Navigation réactive et déconnexion

**Modifications du composant :**
- Injection de `AuthService` (exposé en `readonly auth` pour être lisible dans le template).
- Injection de `Router`.
- Ajout de la méthode `logout()` : appelle `auth.logout()` (nettoie `localStorage` et remet les Signals à `null`) puis redirige vers `/login`.

**Modifications du template :**
- La barre de navigation est maintenant **réactive au Signal `auth.token()`** :
  - Si connecté (`auth.token()` est non nul) : affiche « Backing tracks », « Profil » et un bouton « Déconnexion ».
  - Si non connecté : affiche uniquement « Connexion » et « Créer un compte ».
- Le bouton Déconnexion déclenche `logout()` sur le composant racine.

```html
@if (auth.token()) {
  <a routerLink="/tracks">Backing tracks</a>
  <a routerLink="/profile">Profil</a>
  <button type="button" (click)="logout()">Déconnexion</button>
} @else {
  <a routerLink="/login">Connexion</a>
  <a routerLink="/register">Créer un compte</a>
}
```

---

#### Vérification : build Angular
```
✅ ng build → 0 erreur, 0 warning : bundle : 297 kB (main.js)
```

### Ce que j'en ai compris, pourquoi j'ai voulu faire ça
Il s'agît de la première phase de développement du TP1. Il faut donc compléter le starter pour avoir une connexion, inscription et déconnexion fonctionnelles avec des retours visuels clairs. J'ai compris qu'il était important de séparer les responsabilités : les composants ne touchent jamais HttpClient directement car ils délèguent tout à AuthService. Les Signals permettent à l'interface de se mettre à jour automatiquement dès que l'état change (cela peut être dû à une connexion, déconnexion ou une modification du nom de l'utilisateur) sans qu'il soit nécessaire de recharger la page. La gestion du 401 dans l'intercepteur permet de déconnecter l'utilisateur "proprement" si un token a expiré.

### Modèle d'IA que j'utilise
Le modèle d'IA que j'utilisais était initialement Gemini Code Assist (gratuit pendant un an pour les étudiants). Sauf que l'extension VSCode est obsolète car google a migré ses services dans Antigravity j'ai donc était contraint de changer d'extensions et passer sur Antigravity. Or toutes les tokens de la semaine ont été utilisés à la fin de la mission 0 du TP1 ce qui signifie que j'ai dû mettre à niveau l'abonnement pour passer au forfait Google AI Pro pour 5€49/mois afin d'avoir plus de tokens par semaine. Pour observer combien il m'en reste, je dois aller dans les paramètres de l'extension puis dans le sous menu models où je peux observer combien il me reste de tokens pour chaque IA (exemple dans la photo ci-dessous).
![alt text](image-1.png)
Les conseils pour l'utilisation de l'IA me viennent de l'IA elle-même ou de mon père qui, pour son travail, utilise Copilot dans VSCode.

### Résumé des routes backend

| Méthode | Route | Accès | Usage |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Créer un nouveau compte utilisateur |
| `POST` | `/api/auth/login` | Public | Se connecter et recevoir un JWT |
| `GET` | `/api/users/me` | Protégé (JWT) | Charger le profil de l'utilisateur connecté |
| `PUT` | `/api/users/me` | Protégé (JWT) | Modifier le nom de l'utilisateur connecté |
| `GET` | `/api/tracks` | Protégé (JWT) | Lister les pistes audio avec pagination |
| `POST` | `/api/tracks` | Protégé (JWT) | Uploader une nouvelle piste audio |
| `GET` | `/api/tracks/:id/audio` | Protégé (JWT) | Récupérer le fichier audio d'une piste |

### Tests de connexion

#### Apparition d'une requête de connexion réussie
![alt text](image-2.png)

Header
![alt text](image-3.png)

Payload (Problème de sécurité car le mot de passe est affiché en clair pouvant être accessible par un renifleur)
![alt text](image-8.png)

#### Apparition d'une requête de connexion échouée
![alt text](image-5.png)

Header (erreur 401 bien renvoyé)
![alt text](image-6.png)

Payload (Problème de sécurité avec mot de passe toujours en clair)
![alt text](image-9.png)

#### Modification de /api/users/me (changement de nom)
![alt text](image-11.png)

Header
![alt text](image-12.png)

Payload
![alt text](image-13.png)