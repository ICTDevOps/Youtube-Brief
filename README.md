# Orchestrateur YouTube pour N8N

Application légère pour planifier et déclencher des workflows N8N à partir de plusieurs chaînes YouTube, avec interface web et stockage JSON persistant.

## Fonctionnalités principales

- Tableau de bord web responsive (Bootstrap) avec authentification par session.
- Gestion multi-chaînes : ajout, édition, activation/désactivation, suppression, déclenchement manuel.
- Planification individuelle par expression cron (5 ou 6 champs) et calcul automatique de la prochaine exécution.
- Historique détaillé des exécutions (succès/erreur, horodatages, retries) avec pagination.
- Intégration HTTP avec un webhook N8N configurable, retries automatiques et timeout paramétrable.
- Stockage JSON sur disque (volume Docker) et logs conservés (limite 500 entrées).
- Scripts de démarrage/arrêt via Docker Compose.

## Prérequis

- Node.js 18+ (pour un lancement local hors Docker)
- Docker / Docker Compose (pour un déploiement conteneurisé)

## Configuration des variables d'environnement

Copiez le fichier `.env.example` vers `.env` et adaptez les valeurs :

```env
PORT=8080
N8N_WEBHOOK_URL=https://n8n.example.com/webhook/youtube
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
SESSION_SECRET=remplacez-ceci
N8N_RETRY_ATTEMPTS=3
N8N_RETRY_DELAY_MS=5000
N8N_TIMEOUT_MS=60000
CRON_TIMEZONE=Europe/Paris
```

> ⚠️ Le couple `ADMIN_USERNAME` / `ADMIN_PASSWORD` doit obligatoirement être fourni au premier démarrage afin de générer le hash stocké dans `data/data.json`.

### Signification des variables

| Variable | Description |
| --- | --- |
| `PORT` | Port HTTP exposé par le serveur (par défaut 8080). |
| `N8N_WEBHOOK_URL` | URL du webhook N8N à déclencher lors des planifications. |
| `ADMIN_USERNAME` | Identifiant administrateur pour la connexion à l'UI. |
| `ADMIN_PASSWORD` | Mot de passe administrateur (haché et stocké au démarrage). |
| `SESSION_SECRET` | Secret utilisé pour signer les sessions Express. |
| `N8N_RETRY_ATTEMPTS` | Nombre de tentatives sur le webhook (1 = aucune relance). |
| `N8N_RETRY_DELAY_MS` | Délai (ms) entre deux tentatives en cas d'échec. |
| `N8N_TIMEOUT_MS` | Timeout (ms) appliqué à l'appel du webhook. |
| `CRON_TIMEZONE` | Fuseau horaire appliqué aux expressions cron (ex: `Europe/Paris`). |

## Démarrage avec Docker

```bash
# Construire et démarrer en arrière-plan
./scripts/start.sh

# Arrêter et supprimer les conteneurs
./scripts/stop.sh
```

Le volume Docker `orchestrator-data` contient `data/data.json` (channels, paramètres, logs). Pour un premier démarrage sans scripts shell :

```bash
docker compose up -d --build
```

L'application est accessible sur `http://localhost:8080` (adapter selon `PORT`).

## Lancement local (hors Docker)

```bash
npm install
npm run build
npm start
```

Pour le développement avec rechargement TypeScript :

```bash
npm run dev
```

La donnée persiste dans `data/data.json`. Pensez à versionner seulement un fichier d'exemple si besoin (`.env.example`).

## API HTTP

Toutes les routes `/api/*` nécessitent une session authentifiée (sauf `/api/login`, `/api/session`, `/api/health`). Les réponses sont en JSON.

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Vérifie l'état du service (retour `{status: "ok"}`). |
| `POST` | `/api/login` | Authentification `{username, password}`. |
| `POST` | `/api/logout` | Déconnexion de la session actuelle. |
| `GET` | `/api/session` | Retourne `{authenticated, username}`. |
| `GET` | `/api/channels` | Liste des chaînes configurées. |
| `POST` | `/api/channels` | Ajoute une chaîne `{youtubeChannelId, channelName, cronExpression, isActive?}`. |
| `PUT` | `/api/channels/:id` | Met à jour une chaîne. |
| `DELETE` | `/api/channels/:id` | Supprime une chaîne. |
| `POST` | `/api/channels/:id/trigger` | Déclenche manuellement le webhook pour la chaîne. |
| `GET` | `/api/logs?offset&limit` | Historique des exécutions (pagination). |
| `GET` | `/api/settings` | Paramètres courants (webhook + identifiant admin). |
| `PUT` | `/api/settings` | Met à jour le webhook et/ou les identifiants admin. |

Les réponses d'erreur contiennent `{ error: string }` et éventuelle `stack` en mode développement.

## Structure du projet

```
.
├─ src/                 # Backend TypeScript (Express, scheduling, storage)
├─ public/              # UI statique (Bootstrap)
├─ data/data.json       # Stockage JSON (persistant via volume)
├─ scripts/             # Scripts Docker Compose start/stop
├─ Dockerfile
├─ docker-compose.yml
├─ README.md
└─ .env.example
```

## Notes de sécurité

- Mots de passe stockés hachés avec `bcrypt` (coût 12).
- Sessions signées, cookies `httpOnly` et `sameSite=lax`. Activer HTTPS via reverse proxy en production.
- Validation simple côté serveur sur les champs requis et expressions cron (via `node-cron`).
- Le fichier `data/data.json` doit être protégé (contient hash admin et historiques).

## Tests rapides

```bash
# Vérifier la compilation TypeScript
npm run build

# Lancer en développement
npm run dev
```

Pour vérifier la planification, vous pouvez définir une expression cron courte (`*/1 * * * *`) et observer les logs dans l'UI et `data/data.json`.

## Licence

MIT
