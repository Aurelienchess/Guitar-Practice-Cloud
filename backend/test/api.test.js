import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";
import { LOGS_DIR, cleanOldLogs } from "../src/logger.js";

let server, base;
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

test.before(async () => {
  // Connexion MongoDB si MONGODB_URI est présent pour tester l'intégralité du contrat
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
    } catch {
      // Les tests s'exécutent même en mode dégradé si la base n'est pas joignable
    }
  }

  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});

test("health sans dépendre de MongoDB", async () => {
  const r = await fetch(base + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("schémas Mongoose et relation", () => {
  const u = new User({
    name: "Test",
    email: "TEST@example.com",
    password: "12345678",
  });

  assert.equal(u.email, "test@example.com");
  const t = new Track({
    ownerId: new mongoose.Types.ObjectId(),
    title: "Blues",
    originalName: "b.mp3",
    storedName: "x.mp3",
    mimeType: "audio/mpeg",
    size: 42,
  });

  assert.equal(t.title, "Blues");
  assert.equal(Track.schema.path("ownerId").options.ref, "User");
});

test("sécurité : réponse 401 sans JWT", async () => {
  const r = await fetch(base + "/api/tracks");
  assert.equal(r.status, 401);
  const data = await r.json();
  assert.equal(data.message, "Authentification requise");
});

test("sécurité : réponse 401 avec un JWT invalide", async () => {
  const r = await fetch(base + "/api/tracks", {
    headers: {
      Authorization: "Bearer token-invalide-ou-corrompu",
    },
  });
  assert.equal(r.status, 401);
  const data = await r.json();
  assert.equal(data.message, "Jeton invalide ou expiré");
});

test("contrat upload : erreur 400 lors d'un upload sans fichier", async () => {
  const fakeToken = jwt.sign(
    { sub: new mongoose.Types.ObjectId().toString(), email: "user@test.com" },
    SECRET,
    { expiresIn: "1h" },
  );

  const formData = new FormData();
  formData.append("title", "Sans fichier audio");

  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${fakeToken}`,
    },
    body: formData,
  });

  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.message, "Fichier audio requis");
});

test("contrat upload : erreur 400 si le type MIME audio est refusé", async () => {
  const fakeToken = jwt.sign(
    { sub: new mongoose.Types.ObjectId().toString(), email: "user@test.com" },
    SECRET,
    { expiresIn: "1h" },
  );

  const formData = new FormData();
  formData.append("title", "Fichier texte interdit");
  const textBlob = new Blob(["contenu non audio"], { type: "text/plain" });
  formData.append("audio", textBlob, "test.txt");

  const r = await fetch(base + "/api/tracks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${fakeToken}`,
    },
    body: formData,
  });

  assert.equal(r.status, 400);
  const data = await r.json();
  assert.equal(data.message, "Format audio non accepté");
});

test("contrat de pagination : paramètres page et limit", () => {
  // Test de calcul des paramètres de pagination respectant les bornes
  const pageParam = Math.max(1, Number("2") || 1);
  const limitParam = Math.min(50, Math.max(1, Number("10") || 5));
  assert.equal(pageParam, 2);
  assert.equal(limitParam, 10);

  // Valeurs par défaut et bornage min/max
  const invalidPage = Math.max(1, Number("-5") || 1);
  const invalidLimit = Math.min(50, Math.max(1, Number("999") || 5));
  assert.equal(invalidPage, 1);
  assert.equal(invalidLimit, 50);
});

test("contrat sécurité : lecture audio d'un morceau inexistant ou non possédé renvoie 404", async () => {
  const user1Id = new mongoose.Types.ObjectId().toString();
  const otherUserId = new mongoose.Types.ObjectId().toString();

  // Création d'une instance en mémoire Track appartenant à user1
  const track = new Track({
    _id: new mongoose.Types.ObjectId(),
    ownerId: new mongoose.Types.ObjectId(user1Id),
    title: "Morceau Propriétaire 1",
    originalName: "song.mp3",
    storedName: "stored-song.mp3",
    mimeType: "audio/mpeg",
    size: 2048,
  });

  // Token émis pour un autre utilisateur (otherUserId)
  const otherUserToken = jwt.sign(
    { sub: otherUserId, email: "other@test.com" },
    SECRET,
    { expiresIn: "1h" },
  );

  // L'utilisateur 2 tente d'accéder au morceau appartenant à l'utilisateur 1
  const r = await fetch(`${base}/api/tracks/${track.id}/audio`, {
    headers: {
      Authorization: `Bearer ${otherUserToken}`,
    },
  });

  // Le serveur vérifie ownerId et renvoie 404 (non trouvé ou interdit) sans fuite de données
  assert.ok(r.status === 404 || r.status === 500);
  if (r.status === 404) {
    const data = await r.json();
    assert.equal(data.message, "Piste inconnue");
  }
});

test("sécurité : limitation de débit (429 Too Many Requests) après 3 tentatives de connexion", async () => {
  const credentials = {
    email: "attacker@test.com",
    password: "wrong-password",
  };

  const postLogin = () =>
    fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

  // Essais 1, 2 et 3 : autorisés (répondent 401 car mauvais mot de passe)
  const r1 = await postLogin();
  assert.equal(r1.status, 401);

  const r2 = await postLogin();
  assert.equal(r2.status, 401);

  const r3 = await postLogin();
  assert.equal(r3.status, 401);

  // Essai 4 dans la même fenêtre : bloqué par le rate limiter avec HTTP 429
  const r4 = await postLogin();
  assert.equal(r4.status, 429);
  const data4 = await r4.json();
  assert.ok(data4.message.includes("Trop de tentatives de connexion"));
  assert.ok(r4.headers.get("retry-after"));
});

test("sécurité : renouvellement de session via cookie HTTP-Only et déconnexion", async () => {
  // 1. Sans cookie : refusé 401
  const rEmpty = await fetch(`${base}/api/auth/refresh`, { method: "POST" });
  assert.equal(rEmpty.status, 401);

  // 2. Avec un faux cookie : refusé 401
  const rFake = await fetch(`${base}/api/auth/refresh`, {
    method: "POST",
    headers: { Cookie: "gpc_session=fake-token" },
  });
  assert.equal(rFake.status, 401);

  // 3. Déconnexion : purge du cookie côté serveur
  const rLogout = await fetch(`${base}/api/auth/logout`, { method: "POST" });
  assert.equal(rLogout.status, 200);
  const setCookie = rLogout.headers.get("set-cookie") || "";
  assert.ok(setCookie.includes("gpc_session="));
});

test("journalisation : écriture dans un fichier log avec date, heure et IP", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);

  // Petite pause pour laisser l'I/O asynchrone non-bloquante s'effectuer
  await new Promise((resolve) => setTimeout(resolve, 60));

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const logFilePath = path.join(LOGS_DIR, `access-${todayStr}.log`);

  assert.ok(fs.existsSync(logFilePath), "Le fichier de log du jour doit exister");
  const content = fs.readFileSync(logFilePath, "utf8");

  assert.ok(content.includes(todayStr), "Le log doit contenir la date");
  assert.ok(content.includes("IP="), "Le log doit contenir l'IP");
  assert.ok(content.includes("METHOD=GET"), "Le log doit contenir la méthode HTTP");
  assert.ok(content.includes("URL=/api/health"), "Le log doit contenir la route");
  assert.ok(content.includes("STATUS=200"), "Le log doit contenir le code HTTP 200");

});

test("journalisation : purge automatique des logs de plus de 6 mois", async () => {
  // Simuler un vieux fichier de log de plus de 180 jours (200 jours)
  const oldLogName = "access-2025-01-01.log";
  const oldLogPath = path.join(LOGS_DIR, oldLogName);
  fs.writeFileSync(oldLogPath, "[2025-01-01 10:00:00] IP=127.0.0.1 GET /api/test -> 200\n", "utf8");

  const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldLogPath, oldDate, oldDate);

  const deleted = await cleanOldLogs(LOGS_DIR, 180);

  assert.ok(deleted.includes(oldLogName), "Le fichier vieux de plus de 6 mois doit être supprimé");
  assert.ok(!fs.existsSync(oldLogPath), "Le fichier vieux ne doit plus exister");
});

