import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

export const LOGS_DIR = path.resolve("data/logs");

// Initialisation du dossier des logs au démarrage du serveur
try {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
} catch (error) {
  console.error("[logger] Impossible de créer le dossier des logs", error);
}

/**
 * Nettoie les fichiers logs dont l'âge dépasse `maxAgeDays` (par défaut 180 jours = 6 mois).
 * Conforme aux exigences de la CNIL et du RGPD sur la limitation de rétention des logs de connexion.
 *
 * @param {string} [logsDir=LOGS_DIR] Répertoire des logs à vérifier.
 * @param {number} [maxAgeDays=180] Âge maximal de rétention en jours (6 mois).
 * @returns {Promise<string[]>} Liste des fichiers supprimés.
 */
export async function cleanOldLogs(logsDir = LOGS_DIR, maxAgeDays = 180) {
  const deletedFiles = [];
  try {
    const entries = await fsPromises.readdir(logsDir, { withFileTypes: true });
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".log")) continue;

      const filePath = path.join(logsDir, entry.name);
      try {
        const stats = await fsPromises.stat(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > maxAgeMs) {
          await fsPromises.unlink(filePath);
          deletedFiles.push(entry.name);
          console.log(
            `[logger] Fichier de log expiré supprimé (> ${maxAgeDays} jours) : ${entry.name}`,
          );
        }
      } catch (err) {
        console.error(`[logger] Erreur lors de l'inspection de ${entry.name} :`, err);
      }
    }
  } catch (error) {
    console.error("[logger] Erreur lors du nettoyage des logs :", error);
  }
  return deletedFiles;
}

// Planification automatique de la purge au démarrage puis toutes les 24h.
// Le .unref() permet à Node.js de quitter normalement sans rester bloqué par le timer (essentiel pour les tests).
cleanOldLogs().catch(() => {});
const cleanupInterval = setInterval(() => {
  cleanOldLogs().catch(() => {});
}, 24 * 60 * 60 * 1000);
cleanupInterval.unref();

/**
 * Enregistre une entrée de log pour chaque requête HTTP terminée.
 * Récupère la date, l'heure, l'adresse IP cliente, la méthode, la route, le code HTTP et le temps de réponse.
 *
 * @param {import("express").Request} req Requête HTTP Express
 * @param {import("express").Response} res Réponse HTTP Express
 * @param {number} durationMs Durée d'exécution en millisecondes
 */
export function logHttpRequest(req, res, durationMs) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Récupération de l'adresse IP de l'utilisateur (en tenant compte d'un proxy ou reverse-proxy le cas échéant)
  const clientIp =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "inconnue";

  // Ligne de log structurée
  const logLine = `[${dateStr} ${timeStr}] IP=${clientIp} METHOD=${req.method} URL=${req.originalUrl} STATUS=${res.statusCode} DURATION=${durationMs}ms`;

  const logFile = path.join(LOGS_DIR, `access-${dateStr}.log`);

  // Écriture asynchrone non-bloquante
  fs.appendFile(logFile, logLine + "\n", "utf8", (err) => {
    if (err) {
      console.error("[logger] Erreur lors de l'écriture dans le fichier de log :", err);
    }
  });
}
