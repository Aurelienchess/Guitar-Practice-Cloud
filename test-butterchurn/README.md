# Banc d'essai Butterchurn (MilkDrop WebGL)

Ce dossier autonome permet de tester le visualiseur audio [Butterchurn](https://github.com/jberg/butterchurn) (le port WebGL du célèbre visualiseur MilkDrop de Winamp) avant de l'intégrer dans le projet Angular Guitar Practice Cloud.

## Contenu

- `index.html` : Application web autonome avec canvas WebGL, lecteur audio, sélection de presets, mode plein écran et cycle automatique.
- `song1.mp3` : Morceau audio d'exemple prêt à l'emploi.

## Comment le tester ?

### Option 1 (Le plus simple) :
Faites un simple double-clic sur `index.html` pour l'ouvrir dans votre navigateur préféré (Chrome, Edge, Firefox).
Cliquez sur **« Choisir un MP3 »** ou sur **« Lecture »**.

### Option 2 (Serveur local de développement) :
Dans un terminal :
```powershell
# Depuis la racine du projet ou depuis ce dossier :
npx serve test-butterchurn
# Ou avec python :
cd test-butterchurn
python -m http.server 8080
```
Puis ouvrez `http://localhost:8080`.

## Fonctionnalités incluses

1. **Rendu WebGL temps réel :** Rendu calqué sur les fréquences audio du morceau.
2. **Bibliothèque complète de presets :** Plus de 300 presets MilkDrop accessibles via menu déroulant ou boutons précédent/suivant/aléatoire.
3. **Changement automatique :** Alternance automatique avec transition fluide (*blend*) toutes les 15 secondes.
4. **Plein écran :** Bouton pour basculer le canvas en plein écran interactif.
5. **Multi-sources audio :** Écoute du fichier d'exemple fourni (`song1.mp3`) ou import de n'importe quel fichier audio local.

