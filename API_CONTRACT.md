# Contrat HTTP - Guitar Practice Cloud (TP1 & TP2)

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5` | JWT | `Page<Track>` |
| POST | `/tracks` | multipart : `audio`, `title` | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| DELETE | `/tracks/:id` | JWT | `204 No Content` |

### Modèle `Track`
Un objet `Track` contient :
- `id` : identifiant public de la piste (`string`)
- `ownerId` : identifiant du propriétaire (`string`)
- `title` : titre du morceau (`string`)
- `originalName` : nom d'origine du fichier (`string`)
- `mimeType` : type MIME audio (`string`)
- `size` : taille du fichier en octets (`number`)
- `artist` : nom de l'artiste issu des tags ID3 (`string`, optionnel)
- `album` : nom de l'album issu des tags ID3 (`string`, optionnel)
- `coverImage` : pochette audio sous forme de Data URL (`string`, optionnel)
- `createdAt` : date d'ajout (`string`)

### Modèle `Page<Track>` (Pagination Mongoose `aggregate-paginate-v2`)
L'endpoint `GET /api/tracks` renvoie une structure paginée enrichie :
```json
{
  "items": [ "Track" ],
  "page": 1,
  "limit": 5,
  "total": 42,
  "pages": 9,
  "hasPrevPage": false,
  "hasNextPage": true,
  "prevPage": null,
  "nextPage": 2
}
```

Formats acceptés pour l'upload : MP3, WAV, OGG et M4A, 25 Mo maximum. Les métadonnées ID3 (artiste, album, pochette) sont automatiquement extraites lors de l'upload.

Erreurs courantes : `400` validation (ou fichier audio manquant/invalide), `401` authentification (token absent, invalide ou expiré), `404` ressource introuvable ou non autorisée, `409` email déjà utilisé.
