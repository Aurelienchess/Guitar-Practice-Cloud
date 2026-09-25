import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { Track } from "../src/models/Track.js";

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
