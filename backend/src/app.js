import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { parseFile } from "music-metadata";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";
import { logHttpRequest } from "./logger.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

// Validation Fail-Fast de la clé secrète JWT :
// Le serveur refuse formellement de démarrer si JWT_SECRET est absent ou trop faible.
if (!process.env.JWT_SECRET) {
  const error = new Error(
    "Configuration critique manquante : JWT_SECRET doit être défini dans backend/.env",
  );
  console.error("[startup] Échec de sécurité critique", error);
  throw error;
}

if (
  process.env.JWT_SECRET.length < 16 ||
  process.env.JWT_SECRET === "tp1-development-secret"
) {
  const error = new Error(
    "Configuration critique invalide : JWT_SECRET doit contenir au moins 16 caractères et différer de la clé par défaut 'tp1-development-secret'",
  );
  console.error("[startup] Échec de sécurité critique", error);
  throw error;
}

// Ce secret reste strictement côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET;

/** Analyse les cookies transmis dans l'en-tête Cookie de la requête HTTP */
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0]?.trim();
    if (!name) return;
    const value = parts.slice(1).join("=").trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Les types MIME autorisés correspondent aux formats demandés dans le sujet.
const allowed = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    // Seuls les types MIME audio demandés dans le sujet sont acceptés.
    if (allowed.has(file.mimetype)) {
      console.log(`[multer] Type accepté : ${file.mimetype}`);
      return callback(null, true);
    }

    const error = new Error("Format audio non accepté");
    console.error(`[multer] Type refusé : ${file.mimetype}`, error);
    return callback(error);
  },
});

/**
 * Middleware de limitation de débit (Rate Limiting) pour protéger contre les attaques par force brute (brute-force).
 * Bloque un client (identifié par son adresse IP) après un nombre maximal de requêtes dans une fenêtre temporelle donnée.
 *
 * @param {Object} options
 * @param {number} [options.maxAttempts=3] - Nombre maximum de requêtes autorisées dans la fenêtre (par défaut 3 essais)
 * @param {number} [options.windowMs=10000] - Durée de la fenêtre de blocage en millisecondes (par défaut 10 000 ms = 10s)
 * @returns {Function} Express middleware
 */
export function createRateLimiter({ maxAttempts = 3, windowMs = 10000, blockDurationMs = 10000 } = {}) {
  const attempts = new Map();

  // Nettoyage régulier des entrées expirées pour éviter l'accumulation mémoire
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of attempts.entries()) {
      if (now - data.lastAttemptAt > Math.max(windowMs, blockDurationMs)) {
        attempts.delete(ip);
      }
    }
  }, 30000);
  cleanupTimer.unref?.();

  return (req, res, next) => {
    // Identification du client via son adresse IP
    const clientIp = req.ip || req.socket?.remoteAddress || "127.0.0.1";
    const now = Date.now();

    const record = attempts.get(clientIp);

    // 1. Si le client est actuellement dans sa période de blocage
    if (record?.blockedUntil && now < record.blockedUntil) {
      const remainingSec = Math.max(1, Math.ceil((record.blockedUntil - now) / 1000));
      console.warn(
        `[security] IP ${clientIp} bloquée (tentative pendant blocage). Reste ${remainingSec}s`,
      );
      res.setHeader("Retry-After", remainingSec);
      return res.status(429).json({
        message: `Trop de tentatives de connexion. Veuillez réessayer dans ${remainingSec} seconde(s).`,
        retryAfter: remainingSec,
      });
    }

    // 2. Si le client n'était pas bloqué ou que son blocage est expiré
    if (record) {
      // Si la fenêtre de 10s est passée depuis la première tentative (sans blocage actif)
      if (now - record.firstAttemptAt > windowMs) {
        attempts.set(clientIp, { count: 1, firstAttemptAt: now, lastAttemptAt: now, blockedUntil: null });
        return next();
      }

      record.count += 1;
      record.lastAttemptAt = now;

      // Dès qu'on dépasse le nombre maximal d'essais autorisés (ex: 3), on enclenche un blocage de 10s pleines
      if (record.count > maxAttempts) {
        record.blockedUntil = now + blockDurationMs;
        const remainingSec = Math.ceil(blockDurationMs / 1000);
        console.warn(
          `[security] Rate limit dépassé pour l'IP ${clientIp} (${record.count} tentatives). Bloqué pendant ${remainingSec}s`,
        );

        res.setHeader("Retry-After", remainingSec);
        return res.status(429).json({
          message: `Trop de tentatives de connexion. Veuillez réessayer dans ${remainingSec} seconde(s).`,
          retryAfter: remainingSec,
        });
      }
    } else {
      attempts.set(clientIp, { count: 1, firstAttemptAt: now, lastAttemptAt: now, blockedUntil: null });
    }

    next();
  };
}

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  // Les requêtes sont consignées dans le terminal et dans un fichier log journalier (rétention 6 mois).
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs} ms)`,
      );
      logHttpRequest(req, res, durationMs);
    });
    next();
  });


  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      const jwtToken = token(user);

      // Émission du cookie de session sécurisé HTTP-Only (inaccessible par JavaScript/XSS)
      res.cookie("gpc_session", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      res.status(201).json({ token: jwtToken, user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  // Protection contre le brute-force : max 3 essais en 10 secondes par client
  const loginLimiter = createRateLimiter({ maxAttempts: 3, windowMs: 10000 });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", loginLimiter, async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      const jwtToken = token(user);

      // Émission du cookie de session sécurisé HTTP-Only (inaccessible par JavaScript/XSS)
      res.cookie("gpc_session", jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      res.json({ token: jwtToken, user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /**
   * Restaure et renouvelle le jeton d'accès en mémoire à partir du cookie HTTP-Only sécurisé.
   * Permet à une SPA d'éviter de stocker le token dans le localStorage (protection anti-XSS).
   */
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const cookies = parseCookies(req);
      const sessionToken = cookies.gpc_session;

      if (!sessionToken) {
        return res.status(401).json({ message: "Aucune session active" });
      }

      const decoded = jwt.verify(sessionToken, SECRET);
      const user = await User.findById(decoded.sub);

      if (!user) {
        return res.status(401).json({ message: "Utilisateur inconnu" });
      }

      const newToken = token(user);
      res.cookie("gpc_session", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      console.log(`[auth] Session renouvelée via cookie pour ${user.id}`);
      res.json({ token: newToken, user: user.toPublic() });
    } catch {
      res.clearCookie("gpc_session", { httpOnly: true, path: "/" });
      return res.status(401).json({ message: "Session expirée ou invalide" });
    }
  });

  /** Déconnexion : purge le cookie de session HTTP-Only côté serveur */
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("gpc_session", { httpOnly: true, path: "/" });
    res.json({ message: "Déconnexion réussie" });
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { returnDocument: "after", runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur (via mongoose-aggregate-paginate-v2). */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 5));
      const ownerId = new mongoose.Types.ObjectId(req.auth.sub);
      const search = String(req.query.search || req.query.q || "").trim();

      console.log(`[tracks] Lecture aggregatePaginate page=${page}, limit=${limit}, search="${search}", user=${req.auth.sub}`);

      // Construction du filtre de recherche textuelle insensible à la casse
      const matchCriteria = { ownerId };
      if (search) {
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const searchRegex = new RegExp(escapedSearch, "i");
        matchCriteria.$or = [
          { title: searchRegex },
          { artist: searchRegex },
          { album: searchRegex },
          { originalName: searchRegex },
        ];
      }

      // Pipeline d'agrégation MongoDB ciblant les pistes de l'utilisateur
      const aggregate = Track.aggregate([
        { $match: matchCriteria },
        { $sort: { createdAt: -1 } },
        { $project: { storedName: 0 } },
      ]);

      const options = {
        page,
        limit,
      };

      const result = await Track.aggregatePaginate(aggregate, options);

      // Normalisation des documents en format public compatible frontend
      const items = result.docs.map((track) => ({
        ...track,
        id: String(track._id),
        ownerId: String(track.ownerId),
        _id: undefined,
      }));

      console.log(`[tracks] ${items.length} piste(s) envoyée(s) sur ${result.totalDocs} (page ${result.page}/${result.totalPages})`);

      // Réponse enrichie et conforme au contrat mis à jour
      res.json({
        items,
        page: result.page,
        limit: result.limit,
        total: result.totalDocs,
        pages: result.totalPages,
        hasPrevPage: result.hasPrevPage,
        hasNextPage: result.hasNextPage,
        prevPage: result.prevPage,
        nextPage: result.nextPage,
      });
    } catch (error) {
      console.error("[tracks] Erreur de pagination aggregatePaginate", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio et le champ texte title.
   * Extrait les métadonnées ID3 (artiste, album, pochette) et enregistre la piste.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.single("audio"),
    async (req, res, next) => {
      try {
        if (!req.file) {
          console.warn(`[tracks] Upload sans fichier par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        const uploadedPath = path.join(UPLOADS, req.file.filename);
        let artist = "";
        let album = "";
        let coverImage = "";

        // Extraction automatique des métadonnées ID3 via music-metadata
        try {
          const metadata = await parseFile(uploadedPath);
          artist = metadata.common.artist || "";
          album = metadata.common.album || "";

          // Extraction de l'image de couverture si présente dans les tags ID3
          const picture = metadata.common.picture?.[0];
          if (picture) {
            const base64 = Buffer.from(picture.data).toString("base64");
            coverImage = `data:${picture.format};base64,${base64}`;
            console.log(`[tracks] Image de couverture extraite (${picture.format})`);
          }
        } catch (metaErr) {
          console.warn("[tracks] Impossible d'extraire les tags ID3 :", metaErr.message);
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: req.body.title || req.file.originalname,
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          artist,
          album,
          coverImage,
        });

        console.log(`[tracks] Upload enregistré avec métadonnées : ${track.id}`);
        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);

        // Si MongoDB échoue après l'écriture sur disque, on tente de nettoyer
        // le fichier orphelin. L'erreur de nettoyage est elle aussi loguée.
        if (req.file) {
          const uploadedPath = path.join(UPLOADS, req.file.filename);
          try {
            await fsPromises.unlink(uploadedPath);
            console.log(`[tracks] Fichier temporaire supprimé : ${uploadedPath}`);
          } catch (cleanupError) {
            console.error(
              `[tracks] Impossible de supprimer le fichier temporaire ${uploadedPath}`,
              cleanupError,
            );
          }
        }
        next(error);
      }
    },
  );

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier physique correspondant. */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    if (
      error instanceof multer.MulterError ||
      error?.message === "Format audio non accepté"
    ) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
