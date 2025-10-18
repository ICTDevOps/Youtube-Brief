# Spécifications Techniques et Métier - YouTube Orchestrator

## Document de référence pour refonte de l'application
**Version actuelle :** 1.0.0
**Date :** 2025-10-15
**Objectif :** Base documentaire complète pour migration vers architecture multi-utilisateurs avec React

---

## 1. VISION MÉTIER

### 1.1 Objectif principal
L'application permet de **suivre automatiquement une ou plusieurs chaînes YouTube** et de générer périodiquement des **résumés par email** des vidéos publiées récemment.

### 1.2 Flux métier complet
1. L'utilisateur configure une ou plusieurs chaînes YouTube à surveiller
2. Pour chaque chaîne, il définit :
   - Une **planification** (cron) : quotidienne, hebdomadaire, mensuelle, ou personnalisée
   - Un **nombre de vidéos** à analyser (par défaut 5)
   - Une **période de recherche rétroactive** en jours (par défaut 7 jours)
   - Une ou plusieurs **adresses email** destinataires
3. À l'heure programmée, l'orchestrateur déclenche un **webhook N8N**
4. Le workflow N8N (externe) :
   - Récupère les vidéos récentes de la chaîne YouTube
   - Génère des résumés AI (via transcription + GPT)
   - Formate et envoie un email structuré aux destinataires
5. L'orchestrateur **surveille l'état d'exécution** du workflow (polling)
6. L'utilisateur peut consulter l'**historique des exécutions** avec statuts et logs détaillés

### 1.3 Cas d'usage principaux
- **Veille technologique** : suivre des chaînes tech et recevoir un digest hebdomadaire
- **Curation de contenu** : synthétiser plusieurs chaînes thématiques
- **Monitoring de concurrence** : suivre des chaînes concurrentes
- **Formation continue** : résumés automatiques de chaînes éducatives

---

## 2. ARCHITECTURE TECHNIQUE ACTUELLE

### 2.1 Stack technologique

#### Backend
- **Runtime** : Node.js 18+
- **Framework** : Express 5.1.0
- **Langage** : TypeScript 5.9.2 (cible ES2021, modules CommonJS)
- **Sécurité** : Helmet.js 8.1.0, bcryptjs 3.0.2 (facteur de coût 12)
- **Sessions** : express-session 1.18.2 (cookies httpOnly, sameSite: lax)
- **Stockage** : fs-extra 11.3.2 (fichier JSON atomique)
- **Scheduling** : node-cron 4.2.1 + cron-parser 5.4.0
- **Identifiants** : uuid 13.0.0

#### Frontend
- **Framework UI** : Vanilla JavaScript (pas de framework)
- **Design System** : Bootstrap 5 + Tabler Core 1.4.0
- **Icônes** : Material Icons Outlined
- **Internationalisation** : Système custom i18n (FR/EN)
- **Responsive** : Breakpoint mobile à 767px avec vues adaptatives (cards mobiles)

#### Infrastructure
- **Conteneurisation** : Docker + Docker Compose
- **Build** : Multi-stage Dockerfile optimisé
- **Volumes** : `orchestrator-data:/app/data` pour persistance
- **Reverse proxy** : Support HTTPS via proxy externe (recommandé en production)

### 2.2 Structure des fichiers

```
youtube-summary/
├── src/                          # Code source TypeScript
│   ├── @types/
│   │   └── express-session/      # Types custom pour sessions Express
│   ├── services/
│   │   ├── orchestrator.ts       # Logique métier principale
│   │   ├── authService.ts        # Authentification bcrypt
│   │   └── jobStatusService.ts   # Polling des jobs N8N
│   ├── utils/
│   │   ├── cron.ts              # Validation et parsing cron
│   │   └── validation.ts        # Validation des emails
│   ├── config.ts                # Chargement des variables d'environnement
│   ├── server.ts                # Point d'entrée Express + routes API
│   ├── storage.ts               # Service de persistance JSON
│   └── types.ts                 # Définitions TypeScript globales
├── public/                      # Frontend statique
│   ├── index.html              # SPA principale
│   ├── app.js                  # Logique client (1475 lignes)
│   ├── styles.css              # Styles personnalisés
│   ├── locales/                # Fichiers i18n (fr.json, en.json)
│   └── *.min.css/js            # Bibliothèques Tabler (copiées à la build)
├── data/
│   └── data.json               # Stockage persistant (généré au runtime)
├── scripts/
│   ├── start.sh               # Docker Compose up
│   └── stop.sh                # Docker Compose down
├── .env.example               # Template de configuration
├── Dockerfile                 # Image Docker multi-stage
├── docker-compose.yml         # Configuration des services
├── tsconfig.json             # Configuration TypeScript
└── package.json              # Dépendances et scripts
```

### 2.3 Modèle de données (TypeScript)

#### Channel
```typescript
interface Channel {
  id: string;                    // UUID v4
  youtubeChannelId: string;      // ID de la chaîne YouTube (ex: UCxxxxx)
  channelName: string;           // Nom convivial
  cronExpression: string;        // Expression cron (5 champs)
  isActive: boolean;             // État d'activation
  videoLimit: number;            // Nombre de vidéos à récupérer (défaut: 5)
  daysBack: number;              // Jours de recherche rétroactive (défaut: 7)
  emails: string[];              // Liste d'emails destinataires
  createdAt: string;             // ISO 8601 timestamp
  lastExecution?: string;        // ISO 8601 timestamp
  nextExecution?: string;        // ISO 8601 timestamp (calculé)
}
```

#### ExecutionLog
```typescript
type ExecutionStatus = 'pending' | 'started' | 'running' | 'success' | 'error' | 'cancelled';

interface ExecutionLog {
  id: string;                    // UUID v4
  channelId: string;             // Référence au Channel
  status: ExecutionStatus;       // État du workflow
  startedAt: string;             // ISO 8601 timestamp
  finishedAt?: string;           // ISO 8601 timestamp
  message: string;               // Message descriptif
  retries: number;               // Nombre de tentatives webhook
  jobId?: string;                // ID du job N8N (pour polling)
  progress?: string;             // Progression (si fournie par N8N)
  step?: string;                 // Étape en cours (si fournie par N8N)
  estimatedTime?: string;        // Temps estimé (si fourni par N8N)
}
```

#### Settings
```typescript
interface Settings {
  n8nWebhookUrl: string;         // URL du webhook N8N principal
  n8nStatusWebhookUrl: string;   // URL du webhook de statut N8N
  adminUsername: string;         // Nom d'utilisateur admin
  adminPasswordHash: string;     // Hash bcrypt (cost 12)
  sessionSecret: string;         // Secret pour signer les sessions
  pollingIntervalMs: number;     // Intervalle de polling (défaut: 5000ms)
  pollingTimeoutMs: number;      // Timeout de polling (défaut: 600000ms = 10min)
}
```

#### DataStore
```typescript
interface DataStore {
  channels: Channel[];
  logs: ExecutionLog[];
  settings: Settings;
}
```

### 2.4 API REST

**Base URL** : `/api`
**Authentification** : Session-based (cookie httpOnly)
**Format** : JSON

#### Endpoints publics
| Méthode | Route | Description | Réponse |
|---------|-------|-------------|---------|
| GET | `/api/health` | Health check | `{status: "ok"}` |
| GET | `/api/session` | Vérifier session | `{authenticated: boolean, username: string\|null}` |
| POST | `/api/login` | Connexion | `{username: string}` |
| POST | `/api/logout` | Déconnexion | 204 No Content |

#### Endpoints authentifiés (require session)

**Channels**
| Méthode | Route | Description | Body | Réponse |
|---------|-------|-------------|------|---------|
| GET | `/api/channels` | Liste des chaînes | - | `Channel[]` |
| POST | `/api/channels` | Créer une chaîne | `CreateChannelInput` | `Channel` |
| PUT | `/api/channels/:id` | Modifier une chaîne | `UpdateChannelInput` | `Channel` |
| DELETE | `/api/channels/:id` | Supprimer une chaîne | - | 204 |
| POST | `/api/channels/:id/trigger` | Déclencher manuellement | - | `{status: "queued"}` |

**Logs**
| Méthode | Route | Description | Query Params | Réponse |
|---------|-------|-------------|--------------|---------|
| GET | `/api/logs` | Historique paginé | `offset`, `limit` | `{total: number, items: ExecutionLog[]}` |
| DELETE | `/api/logs` | Vider l'historique | - | 204 |

**Jobs**
| Méthode | Route | Description | Réponse |
|---------|-------|-------------|---------|
| POST | `/api/jobs/:jobId/cancel` | Annuler un job | `{success: boolean, message: string}` |

**Settings**
| Méthode | Route | Description | Body | Réponse |
|---------|-------|-------------|------|---------|
| GET | `/api/settings` | Paramètres actuels | - | `SettingsSummary` |
| PUT | `/api/settings` | Mettre à jour | `UpdateSettingsInput` | `SettingsSummary` |

#### Gestion des erreurs
- **401** : Non authentifié → redirection automatique vers login (côté client)
- **400** : Validation échouée → `{error: string}`
- **404** : Ressource introuvable → `{error: string}`
- **500** : Erreur serveur → `{error: string, stack?: string}` (stack uniquement en dev)

### 2.5 Système de scheduling

#### Orchestration (orchestrator.ts)
- **Bibliothèque** : `node-cron` avec support timezone (Europe/Paris par défaut)
- **Format** : Expressions cron à 5 champs (minute heure jour mois jour-semaine)
- **Validation** : via `node-cron.validate()` + `cron-parser`
- **Calcul next execution** : `cron-parser` pour prévoir la prochaine exécution

#### Patterns pré-définis (UI)
| Fréquence | Description | Format cron | Exemple |
|-----------|-------------|-------------|---------|
| Quotidien | Tous les jours à une heure fixe | `MM HH * * *` | `0 9 * * *` (9h00) |
| Hebdomadaire | Jour de semaine spécifique | `MM HH * * D` | `0 9 * * 1` (Lundi 9h00) |
| Mensuel | Jour du mois spécifique | `MM HH DD * *` | `0 9 1 * *` (1er du mois 9h00) |
| Personnalisé | Expression cron manuelle | Custom | `*/30 * * * *` (toutes les 30min) |

#### Gestion du cycle de vie
1. **Création/modification** : application immédiate du nouveau schedule
2. **Désactivation** : suppression du job cron, `nextExecution` = undefined
3. **Suppression** : arrêt du job + suppression des données
4. **Bootstrap** : rechargement automatique de tous les schedules au démarrage

### 2.6 Système de persistance (storage.ts)

#### Caractéristiques
- **Format** : JSON indenté (2 espaces) dans `data/data.json`
- **Écriture atomique** : file d'attente pour éviter les corruptions
- **Normalisation** : merge avec valeurs par défaut à chaque lecture
- **Clonage** : `structuredClone()` (ou fallback JSON) pour immutabilité
- **Rotation des logs** : limite de 500 entrées (FIFO automatique)

#### Méthodes clés
```typescript
class StorageService {
  async init(): Promise<void>                    // Initialisation + lecture fichier
  async addChannel(channel: Channel): Promise<Channel>
  async updateChannel(id: string, mutator: Function): Promise<Channel>
  async removeChannel(id: string): Promise<boolean>
  async appendLog(entry: ExecutionLog): Promise<void>
  async updateLog(id: string, updates: Partial<ExecutionLog>): Promise<ExecutionLog>
  async listLogs(offset: number, limit: number): Promise<{total, items}>
  async clearAllLogs(): Promise<void>
  async updateSettings(updates: Partial<Settings>): Promise<Settings>
}
```

### 2.7 Intégration N8N

#### Workflow principal (déclenchement)
- **Méthode** : GET avec query parameters
- **URL** : `N8N_WEBHOOK_URL?channelId={id}&limit={nb}&daysBack={days}&emails={list}`
- **Timeout** : Configurable (défaut 60s)
- **Retry** : 3 tentatives par défaut avec délai de 5s
- **Réponse attendue** : Header `job_id` contenant l'identifiant du job N8N

#### Workflow de statut (polling)
- **Méthode** : GET avec query parameter `jobId`
- **URL** : `N8N_STATUS_WEBHOOK_URL?jobId={id}`
- **Header réponse** : `status` (valeurs: `en_cours`, `complete`, `error`, etc.)
- **Mapping statuts** :
  - `en_cours`/`running`/`processing` → `running`
  - `complete`/`completed`/`success`/`termine` → `success`
  - `error`/`failed`/`erreur` → `error`
  - `started`/`demarré` → `started`
  - `cancelled` → `cancelled`

#### Service de surveillance (jobStatusService.ts)
- **Démarrage** : 10s après réception du `job_id` (délai pour laisser N8N initialiser)
- **Intervalle** : Configurable via `POLLING_INTERVAL_MS` (défaut 5s)
- **Timeout global** : Configurable via `POLLING_TIMEOUT_MS` (défaut 10 minutes)
- **Arrêt automatique** : Quand statut final détecté ou timeout atteint
- **Annulation manuelle** : Endpoint `/api/jobs/:jobId/cancel` arrête le polling et marque le log comme `cancelled`

#### Gestion du cycle de vie des jobs
```
┌─────────────────┐
│ Trigger Channel │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create Log     │ Status: pending
│  (pending)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Call N8N        │
│ Webhook         │
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │job_id? │
    └───┬─┬──┘
   Oui  │ │ Non
        │ └──────────► Terminé (success/error)
        │
        ▼
┌─────────────────┐
│ Update Log      │ Status: started
│ + Start Polling │ (after 10s delay)
└────────┬────────┘
         │
         ▼
    ┌────────────┐
    │   Polling  │◄────┐
    │   Loop     │     │ Intervalle: 5s
    └──────┬─────┘     │
           │           │
           ▼           │
    ┌──────────────┐   │
    │Check Status? │   │
    └──────┬───────┘   │
           │           │
      ┌────┴────┐      │
      │         │      │
  En cours   Terminé   │
      │         │      │
      └─────────┘      │
      Update log       │
      Continue ────────┘

     Terminé
         │
         ▼
  ┌─────────────┐
  │ Final Status│
  │ + finishedAt│
  └─────────────┘
```

### 2.8 Authentification et sécurité

#### Stratégie d'authentification
- **Type** : Session-based (pas de JWT)
- **Stockage** : Cookie httpOnly, sameSite: lax
- **Durée** : 7 jours (maxAge: 604800000ms)
- **HTTPS requis** : `secure: true` en production
- **Secret session** : Variable `SESSION_SECRET` ou généré automatiquement (UUID)

#### Initialisation des credentials
1. Au premier démarrage : `ADMIN_USERNAME` et `ADMIN_PASSWORD` obligatoires dans `.env`
2. Hash bcrypt généré et stocké dans `data.json`
3. Aux démarrages suivants :
   - Si `.env` change → mise à jour du hash
   - Si identique → pas de re-hash (comparaison bcrypt)

#### Middleware de sécurité (Helmet.js)
```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
})
```

#### Validation des entrées
- **Emails** : Regex `^[^\s@]+@[^\s@]+\.[^\s@]+$` + vérification unicité
- **Cron expressions** : `node-cron.validate()` avant sauvegarde
- **Champs requis** : `youtubeChannelId`, `channelName`, `cronExpression`, `emails[]`
- **Valeurs numériques** : `videoLimit` et `daysBack` avec valeurs par défaut (5 et 7)

---

## 3. FRONTEND - INTERFACE UTILISATEUR

### 3.1 Architecture SPA

#### Structure
- **Single Page Application** : `index.html` unique
- **Routing** : Client-side sans framework (Vue conditionnelle login/dashboard)
- **État global** : Objet JavaScript `state` avec réactivité manuelle
- **Communication** : Fetch API avec gestion centralisée (`fetchJSON`)

#### Vues principales
1. **Vue Login** : Formulaire d'authentification + sélecteur de langue
2. **Vue Dashboard** :
   - Métriques en haut (channels actifs, prochaine exécution, jobs actifs)
   - Tableau des chaînes avec actions (CRUD + trigger manuel)
   - Tableau des logs avec pagination
   - Modales : Channel Editor, Settings, Confirmations

### 3.2 Internationalisation (i18n)

#### Système custom
```javascript
const i18n = {
  currentLang: 'fr',           // Langue active
  translations: {},            // Dictionnaire chargé

  async init()                 // Détection langue navigateur ou localStorage
  async loadTranslations()     // Chargement /locales/{lang}.json
  async setLanguage(lang)      // Changement dynamique + re-render
  t(key, params)               // Traduction avec interpolation {{param}}
  updatePage()                 // Mise à jour DOM via [data-i18n]
}
```

#### Fichiers de traduction
- **Format** : JSON hiérarchique
- **Emplacement** : `public/locales/fr.json`, `public/locales/en.json`
- **Interpolation** : `{{variableName}}` remplacé dynamiquement
- **Attributs HTML** : Support `data-i18n`, `placeholder`, `title`, `aria-label`

#### Langues supportées
- Français (par défaut)
- Anglais

### 3.3 Gestion des chaînes (Channels)

#### Vue Desktop (Table responsive)
| Colonne | Contenu |
|---------|---------|
| Chaîne | Nom + date de création |
| ID YouTube | Code de la chaîne (monospace) |
| Planification | Expression cron (badge) |
| Paramètres | Nb vidéos + jours de recherche |
| Dernière exéc. | Timestamp formaté |
| Prochaine exéc. | Timestamp calculé |
| Statut | Actif/Inactif (indicateur coloré) |
| Actions | Dropdown (Modifier, Déclencher, Supprimer) |

#### Vue Mobile (Cards empilées)
- **Breakpoint** : ≤ 767px
- **Layout** : Cards verticales avec:
  - En-tête : Nom + statut
  - Infos : Vidéos, jours, cron
  - Planning : Dernière/prochaine exécution
  - Actions : Boutons iconographiques horizontaux

#### Modal d'édition (Channel Form)
**Sections :**
1. **Informations de base**
   - Nom de la chaîne (texte)
   - ID YouTube (texte, requis pour création)
   - État actif/inactif (checkbox)

2. **Planification intelligente**
   - Sélecteur de fréquence (quotidien/hebdomadaire/mensuel/personnalisé)
   - Heure (time picker)
   - Options conditionnelles :
     - Hebdomadaire : sélecteur de jour (0-6)
     - Mensuel : jour du mois (1-31)
     - Personnalisé : champ cron brut
   - Prévisualisation de l'expression générée

3. **Paramètres de recherche**
   - Limite de vidéos (number, défaut: 5)
   - Jours de recherche rétroactive (number, défaut: 7)

4. **Destinataires**
   - Liste d'emails séparés par virgules (textarea)
   - Validation en temps réel avec feedback visuel (vert/rouge)
   - Détection des doublons

**Validation côté client :**
- Au moins 1 email valide requis
- Expression cron générée non vide
- Feedback immédiat avec classes Bootstrap (`is-valid`, `is-invalid`)

### 3.4 Gestion des logs (Execution History)

#### Tableau des exécutions
| Colonne | Contenu |
|---------|---------|
| Chaîne | Nom résolu depuis `channelId` |
| Statut | Badge coloré (pending/started/running/success/error/cancelled) |
| Début | Timestamp `startedAt` |
| Fin | Timestamp `finishedAt` ou `-` |
| Tentatives | Nombre de retries webhook |
| Message | Description textuelle |
| Actions | Bouton "Annuler" si job actif |

#### Pagination
- **Par défaut** : 5 logs par page
- **Contrôles** : Précédent / Page N/Total / Suivant
- **Info** : "Page X sur Y" avec total d'exécutions
- **Désactivation** : Boutons grisés aux limites

#### Couleurs de statut
| Statut | Badge Bootstrap | Classe de ligne |
|--------|----------------|-----------------|
| success | `text-bg-success` | `.success` (vert clair) |
| error | `text-bg-danger` | `.error` (rouge clair) |
| pending | `text-bg-warning` | `.pending` (jaune) |
| started | `text-bg-info` | `.started` (bleu clair) |
| running | `text-bg-primary` | `.running` (bleu) |
| cancelled | `text-bg-secondary` | `.cancelled` (gris) |

#### Auto-refresh
- **Intervalle** : 5 secondes
- **Condition** : Uniquement si authentifié
- **Comportement** : Mise à jour silencieuse (pas de toast en cas d'erreur)
- **Optimisation** : Update des lignes existantes plutôt que re-render complet

### 3.5 Paramètres (Settings Modal)

#### Champs modifiables
1. **URL webhook N8N** (texte)
2. **URL webhook statut N8N** (texte)
3. **Intervalle de polling** (ms, min: 1000)
4. **Timeout de polling** (ms, min: 60000)
5. **Nom d'utilisateur admin** (texte)
6. **Mot de passe admin** (optionnel, vide = pas de changement)

#### Métriques en lecture seule
- **Jobs actifs** : Compteur de workflows N8N en cours de surveillance

### 3.6 Système de notifications (Toasts)

#### Caractéristiques
- **Position** : Top-right fixed
- **Auto-dismiss** : 4 secondes
- **Variants** : primary, success, danger, warning, info
- **Animation** : Fade in/out
- **Fermeture manuelle** : Bouton close

#### Cas d'usage
| Événement | Message | Variant |
|-----------|---------|---------|
| Login réussi | "Connexion réussie" | success |
| Channel créé | "Chaîne créée" | success |
| Channel modifié | "Chaîne mise à jour" | success |
| Channel supprimé | "Chaîne supprimée" | success |
| Trigger manuel | "Déclenchement demandé pour {name}" | success |
| Logs vidés | "Toutes les exécutions supprimées" | success |
| Settings sauvegardés | "Paramètres enregistrés" | success |
| Job annulé | "Exécution annulée avec succès" | success |
| Refresh data | "Données rafraîchies" | primary |
| Erreur validation | Message d'erreur spécifique | danger |
| Erreur serveur | Message d'erreur API | danger |

### 3.7 Responsive Design

#### Breakpoints
- **Desktop** : > 767px → Table view
- **Mobile** : ≤ 767px → Card view

#### Adaptations mobiles
1. **Navigation** : Header collapsible
2. **Métriques** : Stack vertical
3. **Channels** : Cards au lieu de tableau
4. **Actions** : Boutons pleine largeur avec icônes
5. **Modales** : Fullscreen sur petits écrans
6. **Formulaires** : Inputs agrandis pour tactile

#### Optimisations tactiles
- **Boutons** : Min 44x44px (WCAG)
- **Espacement** : Padding augmenté
- **Dropdowns** : Menu positionné via Popper.js (anti-overflow)
- **Scrolling** : Touch-friendly, momentum scrolling

---

## 4. VARIABLES D'ENVIRONNEMENT

### 4.1 Fichier .env.example

```env
# Port HTTP du serveur
PORT=8080

# URLs des webhooks N8N
N8N_WEBHOOK_URL=https://[N8N Webhoock URL]
N8N_STATUS_WEBHOOK_URL=https://[N8N Webhoock URL]

# Credentials admin (obligatoires au premier démarrage)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me

# Secret pour signer les sessions Express (ou auto-généré si omis)
SESSION_SECRET=replace-with-random-secret

# Paramètres de retry webhook
N8N_RETRY_ATTEMPTS=3
N8N_RETRY_DELAY_MS=5000
N8N_TIMEOUT_MS=60000

# Paramètres de polling des jobs N8N
POLLING_INTERVAL_MS=5000
POLLING_TIMEOUT_MS=600000

# Timezone pour les cron expressions
CRON_TIMEZONE=Europe/Paris
```

### 4.2 Tableau récapitulatif

| Variable | Type | Défaut | Obligatoire | Description |
|----------|------|--------|-------------|-------------|
| `PORT` | number | 8080 | Non | Port d'écoute HTTP |
| `N8N_WEBHOOK_URL` | string | - | Oui | Webhook principal N8N |
| `N8N_STATUS_WEBHOOK_URL` | string | - | Oui | Webhook de statut N8N |
| `ADMIN_USERNAME` | string | - | Oui (1er démarrage) | Username admin |
| `ADMIN_PASSWORD` | string | - | Oui (1er démarrage) | Password admin (hashé ensuite) |
| `SESSION_SECRET` | string | UUID auto | Non | Secret pour sessions |
| `N8N_RETRY_ATTEMPTS` | number | 3 | Non | Nb de tentatives webhook |
| `N8N_RETRY_DELAY_MS` | number | 5000 | Non | Délai entre tentatives |
| `N8N_TIMEOUT_MS` | number | 60000 | Non | Timeout requête webhook |
| `POLLING_INTERVAL_MS` | number | 5000 | Non | Intervalle de polling |
| `POLLING_TIMEOUT_MS` | number | 600000 | Non | Timeout global de polling |
| `CRON_TIMEZONE` | string | - | Non | Timezone pour cron (ex: Europe/Paris) |
| `DATA_FILE` | string | data/data.json | Non | Chemin du fichier de stockage |
| `NODE_ENV` | string | development | Non | Environnement (production/development) |

---

## 5. DÉPLOIEMENT ET OPS

### 5.1 Docker

#### Dockerfile (Multi-stage)
```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  orchestrator:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - orchestrator-data:/app/data
    environment:
      - PORT=8080
      - N8N_WEBHOOK_URL=${N8N_WEBHOOK_URL}
      - N8N_STATUS_WEBHOOK_URL=${N8N_STATUS_WEBHOOK_URL}
      - ADMIN_USERNAME=${ADMIN_USERNAME}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET}
      - CRON_TIMEZONE=${CRON_TIMEZONE}
    restart: unless-stopped

volumes:
  orchestrator-data:
```

#### Scripts de gestion
```bash
# scripts/start.sh
#!/bin/bash
docker compose up -d --build

# scripts/stop.sh
#!/bin/bash
docker compose down
```

### 5.2 Déploiement local (sans Docker)

```bash
# Installation
npm install

# Développement (hot reload)
npm run dev

# Production
npm run build
npm start
```

### 5.3 Fichiers de données

#### data/data.json
```json
{
  "channels": [...],
  "logs": [...],
  "settings": {
    "n8nWebhookUrl": "https://...",
    "n8nStatusWebhookUrl": "https://...",
    "adminUsername": "admin",
    "adminPasswordHash": "$2a$12$...",
    "sessionSecret": "uuid-generated",
    "pollingIntervalMs": 5000,
    "pollingTimeoutMs": 600000
  }
}
```

**Recommandations :**
- ⚠️ Ne jamais versionner `data/data.json` (contient hash admin)
- Backup régulier du volume Docker `orchestrator-data`
- Rotation automatique des logs (500 max)

### 5.4 Production checklist

- [ ] Variables `.env` configurées (notamment `ADMIN_PASSWORD` fort)
- [ ] `NODE_ENV=production` défini
- [ ] Reverse proxy HTTPS (Nginx/Traefik/Caddy)
- [ ] Cookies `secure: true` activés
- [ ] CSP headers vérifiés
- [ ] Volume Docker persistant configuré
- [ ] Backup automatique de `data/data.json`
- [ ] Monitoring des logs Docker (`docker logs -f orchestrator`)
- [ ] Firewall : seul le port du reverse proxy ouvert
- [ ] DNS et certificats SSL configurés

---

## 6. LIMITES ET CONTRAINTES ACTUELLES

### 6.1 Limitations métier
1. **Mono-utilisateur** : Un seul compte admin, pas de gestion multi-tenant
2. **Pas de RBAC** : Tous les utilisateurs authentifiés ont les mêmes droits
3. **Pas d'historique détaillé** : Impossible de voir qui a modifié quoi
4. **Pas de notification in-app** : Aucun système de push/websocket pour alertes temps réel
5. **Emails en clair** : Stockés non chiffrés dans `data.json`

### 6.2 Limitations techniques
1. **Stockage JSON** :
   - Pas de transactions ACID
   - Performance limitée avec des milliers de channels/logs
   - Pas de requêtes complexes (filtres, tri avancé)
2. **Pas de cache** : Rechargement complet du fichier à chaque requête
3. **Pas de queue distribuée** : Jobs cron liés à l'instance serveur unique
4. **Polling N8N** : Coûteux si nombreux jobs simultanés (max recommandé : ~50)
5. **Pas de gestion de conflit** : Si 2 instances tournent, corruption possible du fichier JSON

### 6.3 Limitations frontend
1. **Pas de framework réactif** : Re-renders manuels, code verbose
2. **Pas de state management** : État global JavaScript basique
3. **Pas de routing** : URL ne change pas selon la vue
4. **Pas de lazy loading** : Tous les assets chargés d'un coup
5. **i18n custom** : Pas de pluralisation, faible support contextes complexes

### 6.4 Sécurité
1. **Rate limiting** : Absent (vulnérable au brute-force login)
2. **Audit logs** : Aucune traçabilité des actions admin
3. **Validation inputs** : Basique côté serveur, peut être améliorée
4. **CSRF protection** : Minimale (sessions only, pas de tokens)
5. **XSS** : Dépend uniquement de l'échappement HTML navigateur

---

## 7. ROADMAP REFONTE (Recommandations)

### 7.1 Priorité HAUTE : Multi-utilisateurs

#### Base de données
- [ ] Migration JSON → PostgreSQL ou MongoDB
- [ ] Schéma relationnel :
  - Users (id, email, password_hash, role, created_at)
  - Channels (id, user_id, youtube_channel_id, ...)
  - ExecutionLogs (id, channel_id, status, ...)
  - Settings (par user ou global)

#### Authentification
- [ ] JWT ou sessions avec Redis
- [ ] Rôles : Admin, User, Viewer
- [ ] OAuth2 (Google, GitHub) optionnel
- [ ] Gestion des invitations
- [ ] Reset password par email

#### Isolation des données
- [ ] Chaque user voit uniquement ses channels
- [ ] Admin peut voir tous les channels (dashboard global)
- [ ] Partage de channels entre users (collaborateurs)

### 7.2 Priorité HAUTE : Migration React

#### Stack proposée
- **Framework** : React 18+ avec TypeScript
- **Routing** : React Router v6
- **State Management** : Zustand ou Jotai (léger) ou Redux Toolkit (si complexe)
- **UI Library** :
  - Option 1 : Shadcn/ui + Tailwind CSS (moderne, customisable)
  - Option 2 : Material-UI v5 (complet, consistant)
  - Option 3 : Ant Design (riche en composants business)
- **Forms** : React Hook Form + Zod (validation)
- **Data Fetching** : TanStack Query (React Query) pour cache automatique
- **i18n** : react-i18next (standard, puissant)

#### Architecture recommandée
```
src/
├── components/
│   ├── layout/         # Header, Sidebar, Footer
│   ├── channels/       # ChannelTable, ChannelForm, ChannelCard
│   ├── logs/          # LogsTable, LogBadge, LogsFilter
│   ├── auth/          # LoginForm, ProtectedRoute
│   └── common/        # Button, Modal, Toast, Spinner
├── hooks/
│   ├── useAuth.ts     # Hook pour session/JWT
│   ├── useChannels.ts # React Query pour channels
│   └── useLogs.ts     # React Query pour logs
├── stores/
│   └── authStore.ts   # Zustand store pour auth
├── services/
│   ├── api.ts         # Axios instance configurée
│   ├── channels.ts    # API calls channels
│   └── logs.ts        # API calls logs
├── types/
│   └── models.ts      # Types TypeScript
├── utils/
│   ├── cron.ts        # Helpers cron
│   └── validation.ts  # Schemas Zod
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Channels.tsx
│   └── Settings.tsx
├── i18n/
│   ├── en.json
│   └── fr.json
└── App.tsx
```

### 7.3 Priorité MOYENNE : Améliorations backend

#### API
- [ ] Versioning API (`/api/v1/channels`)
- [ ] GraphQL en alternative REST (optionnel)
- [ ] Webhooks sortants (notifications externes)
- [ ] Rate limiting (express-rate-limit)
- [ ] Compression gzip/brotli
- [ ] CORS configuré proprement

#### Job Management
- [ ] Migration vers BullMQ (Redis-based job queue)
- [ ] Dashboard jobs avec bull-board
- [ ] Retry exponential backoff
- [ ] Dead letter queue pour jobs échoués
- [ ] Metrics Prometheus (jobs/sec, latency, etc.)

#### Observabilité
- [ ] Logs structurés (Winston ou Pino + format JSON)
- [ ] APM (Application Performance Monitoring) : New Relic, Datadog, ou OpenTelemetry
- [ ] Health checks avancés (DB, Redis, N8N)
- [ ] Alerting (Slack, PagerDuty) sur erreurs critiques

### 7.4 Priorité MOYENNE : Fonctionnalités métier

#### Channels avancés
- [ ] Templates de channels (préconfigurés par thématique)
- [ ] Import/Export CSV de channels
- [ ] Tags et catégories pour organiser
- [ ] Recherche full-text sur channels
- [ ] Filtres avancés (actif/inactif, dernier run, etc.)

#### Notifications
- [ ] Webhooks Discord/Slack pour notifications
- [ ] Notifications in-app (WebSocket ou Server-Sent Events)
- [ ] Résumé quotidien par email (digest de tous les logs)
- [ ] Alertes sur échecs consécutifs

#### Analytics
- [ ] Dashboard de métriques :
  - Taux de succès/échec par channel
  - Temps moyen d'exécution
  - Évolution nombre de vidéos par channel
  - Top channels les plus actifs
- [ ] Export de rapports (PDF, Excel)
- [ ] Graphiques (Chart.js ou Recharts)

### 7.5 Priorité BASSE : Nice-to-have

#### UX/UI
- [ ] Dark mode
- [ ] Personnalisation thème (couleurs primaires)
- [ ] Drag-and-drop pour réorganiser channels
- [ ] Bulk actions (activer/désactiver/supprimer multiple channels)
- [ ] Preview vidéos YouTube inline (iframe)

#### Intégrations
- [ ] Support autres plateformes (Twitch, Vimeo, Dailymotion)
- [ ] API publique documentée (OpenAPI/Swagger)
- [ ] SDK client (JavaScript, Python)
- [ ] Zapier/Make.com integration

#### Avancé
- [ ] Mode offline (PWA)
- [ ] Mobile app (React Native ou Capacitor)
- [ ] IA pour suggérer meilleurs horaires de planification
- [ ] Prédiction de charge serveur N8N

---

## 8. MIGRATION GUIDE (JSON vers DB)

### 8.1 Stratégie de migration

#### Étape 1 : Préparation
```sql
-- PostgreSQL schema example
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  youtube_channel_id VARCHAR(255) NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  video_limit INTEGER DEFAULT 5,
  days_back INTEGER DEFAULT 7,
  emails JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_execution TIMESTAMP,
  next_execution TIMESTAMP
);

CREATE TABLE execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  message TEXT,
  retries INTEGER DEFAULT 0,
  job_id VARCHAR(255),
  progress VARCHAR(255),
  step VARCHAR(255),
  estimated_time VARCHAR(255)
);

CREATE INDEX idx_channels_user_id ON channels(user_id);
CREATE INDEX idx_logs_channel_id ON execution_logs(channel_id);
CREATE INDEX idx_logs_status ON execution_logs(status);
```

#### Étape 2 : Script de migration
```typescript
// migrate-data.ts
import { readJson } from 'fs-extra';
import { pool } from './db'; // PostgreSQL pool

async function migrateData() {
  const data = await readJson('./data/data.json');

  // Create default admin user
  const adminResult = await pool.query(
    'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [data.settings.adminUsername, data.settings.adminPasswordHash, 'admin']
  );
  const adminId = adminResult.rows[0].id;

  // Migrate channels
  for (const channel of data.channels) {
    await pool.query(
      `INSERT INTO channels
       (id, user_id, youtube_channel_id, channel_name, cron_expression, is_active,
        video_limit, days_back, emails, created_at, last_execution, next_execution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [channel.id, adminId, channel.youtubeChannelId, channel.channelName,
       channel.cronExpression, channel.isActive, channel.videoLimit, channel.daysBack,
       JSON.stringify(channel.emails), channel.createdAt, channel.lastExecution,
       channel.nextExecution]
    );
  }

  // Migrate logs
  for (const log of data.logs) {
    await pool.query(
      `INSERT INTO execution_logs
       (id, channel_id, status, started_at, finished_at, message, retries, job_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [log.id, log.channelId, log.status, log.startedAt, log.finishedAt,
       log.message, log.retries, log.jobId]
    );
  }

  console.log('Migration completed!');
}

migrateData().catch(console.error);
```

### 8.2 ORM recommandé

**Option 1 : Prisma** (moderne, type-safe)
```prisma
// schema.prisma
model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String
  role          String    @default("user")
  channels      Channel[]
  createdAt     DateTime  @default(now())
}

model Channel {
  id               String         @id @default(uuid())
  userId           String
  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  youtubeChannelId String
  channelName      String
  cronExpression   String
  isActive         Boolean        @default(true)
  videoLimit       Int            @default(5)
  daysBack         Int            @default(7)
  emails           Json
  executionLogs    ExecutionLog[]
  createdAt        DateTime       @default(now())
  lastExecution    DateTime?
  nextExecution    DateTime?
}

model ExecutionLog {
  id            String    @id @default(uuid())
  channelId     String
  channel       Channel   @relation(fields: [channelId], references: [id], onDelete: Cascade)
  status        String
  startedAt     DateTime
  finishedAt    DateTime?
  message       String
  retries       Int       @default(0)
  jobId         String?
  progress      String?
  step          String?
  estimatedTime String?
}
```

**Option 2 : TypeORM** (mature, riche en fonctionnalités)
**Option 3 : Drizzle ORM** (léger, performant)

---

## 9. TESTS ET QUALITÉ

### 9.1 Tests actuels
⚠️ **Aucun test n'est implémenté actuellement**

### 9.2 Stratégie de tests recommandée

#### Backend
```bash
# Stack de test
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
```

**Tests unitaires** (services isolés)
```typescript
// Example: orchestrator.test.ts
describe('OrchestratorService', () => {
  it('should create a channel with valid cron', async () => {
    const channel = await orchestrator.createChannel({
      youtubeChannelId: 'UCxxxxx',
      channelName: 'Test Channel',
      cronExpression: '0 9 * * *',
      emails: ['test@example.com']
    });

    expect(channel.id).toBeDefined();
    expect(channel.nextExecution).toBeDefined();
  });

  it('should reject invalid cron expression', async () => {
    await expect(orchestrator.createChannel({
      youtubeChannelId: 'UCxxxxx',
      channelName: 'Test',
      cronExpression: 'invalid',
      emails: ['test@example.com']
    })).rejects.toThrow('Invalid cron expression');
  });
});
```

**Tests d'intégration** (API endpoints)
```typescript
// Example: api.test.ts
describe('POST /api/channels', () => {
  it('should create channel when authenticated', async () => {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: 'admin', password: 'test' });

    const res = await agent
      .post('/api/channels')
      .send({
        youtubeChannelId: 'UCxxxxx',
        channelName: 'Test',
        cronExpression: '0 9 * * *',
        emails: ['test@example.com']
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  it('should return 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/channels')
      .send({ /* ... */ });

    expect(res.status).toBe(401);
  });
});
```

#### Frontend (React)
```bash
# Stack de test
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event vitest
```

**Tests de composants**
```typescript
// Example: ChannelForm.test.tsx
import { render, screen, userEvent } from '@testing-library/react';
import { ChannelForm } from './ChannelForm';

test('should validate email format', async () => {
  render(<ChannelForm />);

  const emailInput = screen.getByLabelText(/emails/i);
  await userEvent.type(emailInput, 'invalid-email');

  expect(screen.getByText(/adresse email.*n'est pas valide/i)).toBeInTheDocument();
});
```

#### E2E
```bash
# Playwright ou Cypress
npm install --save-dev @playwright/test
```

```typescript
// Example: channels.spec.ts
test('full channel creation flow', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'test');
  await page.click('button[type="submit"]');

  await page.click('text=Ajouter une chaîne');
  await page.fill('input[name="channelName"]', 'Test Channel');
  await page.fill('input[name="youtubeChannelId"]', 'UCxxxxx');
  await page.selectOption('select[name="scheduleFrequency"]', 'daily');
  await page.fill('input[name="scheduleTime"]', '09:00');
  await page.fill('textarea[name="emails"]', 'test@example.com');
  await page.click('button[type="submit"]');

  await expect(page.locator('text=Chaîne créée')).toBeVisible();
});
```

### 9.3 CI/CD

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run test:e2e

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
```

---

## 10. ANNEXES

### 10.1 Glossaire

| Terme | Définition |
|-------|------------|
| **Channel** | Configuration d'une chaîne YouTube à surveiller |
| **Cron Expression** | Format de planification temporelle (5 champs : min heure jour mois jour-semaine) |
| **Execution Log** | Enregistrement d'une exécution de workflow (succès/échec) |
| **Job** | Instance d'exécution d'un workflow N8N |
| **Polling** | Interrogation répétée du statut d'un job N8N |
| **Webhook** | Point d'entrée HTTP pour déclencher N8N |
| **Orchestrator** | Service principal gérant channels et scheduling |
| **Storage** | Service de persistance JSON |
| **Retry** | Nouvelle tentative après échec webhook |

### 10.2 Diagrammes

#### Schéma global de l'architecture
```
┌─────────────┐
│   Browser   │
│  (Vanilla   │
│    JS + i18n│
└──────┬──────┘
       │ HTTP/REST
       │ Session Cookies
       ▼
┌──────────────────────────────────┐
│     Express Server (Port 8080)   │
│  ┌────────────────────────────┐  │
│  │  API Routes (/api/*)       │  │
│  │  - Auth (login/logout)     │  │
│  │  - Channels CRUD           │  │
│  │  - Logs (pagination)       │  │
│  │  - Settings                │  │
│  │  - Jobs (cancel)           │  │
│  └──────────┬─────────────────┘  │
│             │                     │
│  ┌──────────▼─────────────────┐  │
│  │  OrchestratorService       │  │
│  │  - Channel management      │  │
│  │  - Cron scheduling         │  │
│  │  - Webhook dispatching     │  │
│  └──────────┬─────────────────┘  │
│             │                     │
│  ┌──────────▼─────────────────┐  │
│  │  JobStatusService          │  │
│  │  - Polling N8N status      │  │
│  │  - Update logs in real-time│  │
│  └──────────┬─────────────────┘  │
│             │                     │
│  ┌──────────▼─────────────────┐  │
│  │  StorageService            │  │
│  │  - JSON file operations    │  │
│  │  - Atomic writes           │  │
│  │  - Log rotation (500 max)  │  │
│  └──────────┬─────────────────┘  │
└─────────────┼───────────────────-┘
              │
              ▼
      ┌───────────────┐
      │ data/data.json│
      │  - channels   │
      │  - logs       │
      │  - settings   │
      └───────────────┘

       HTTP GET (webhook)
              │
              ▼
      ┌───────────────┐
      │  N8N Workflow │
      │  1. Get videos│
      │  2. Summarize │
      │  3. Send email│
      └───────┬───────┘
              │
       Return job_id
       via header
              │
              ▼
      ┌───────────────┐
      │ Polling loop  │
      │ (5s interval) │
      │ Check status  │
      └───────────────┘
```

### 10.3 Exemples de payloads API

#### POST /api/channels
```json
{
  "youtubeChannelId": "UCXuqSBlHAE6Xw-yeJA0Tunw",
  "channelName": "Linus Tech Tips",
  "cronExpression": "0 9 * * 1",
  "isActive": true,
  "videoLimit": 10,
  "daysBack": 7,
  "emails": ["tech@example.com", "team@example.com"]
}
```

#### Response 201
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "youtubeChannelId": "UCXuqSBlHAE6Xw-yeJA0Tunw",
  "channelName": "Linus Tech Tips",
  "cronExpression": "0 9 * * 1",
  "isActive": true,
  "videoLimit": 10,
  "daysBack": 7,
  "emails": ["tech@example.com", "team@example.com"],
  "createdAt": "2025-10-15T10:30:00.000Z",
  "lastExecution": null,
  "nextExecution": "2025-10-21T09:00:00.000Z"
}
```

#### GET /api/logs?offset=0&limit=5
```json
{
  "total": 42,
  "items": [
    {
      "id": "log-123",
      "channelId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "success",
      "startedAt": "2025-10-15T09:00:00.000Z",
      "finishedAt": "2025-10-15T09:05:32.000Z",
      "message": "Exécution terminée avec succès",
      "retries": 0,
      "jobId": "n8n-job-456"
    },
    {
      "id": "log-124",
      "channelId": "550e8400-e29b-41d4-a716-446655440000",
      "status": "running",
      "startedAt": "2025-10-15T10:00:00.000Z",
      "finishedAt": null,
      "message": "Traitement en cours...",
      "retries": 0,
      "jobId": "n8n-job-789",
      "progress": "50%",
      "step": "Summarizing videos"
    }
  ]
}
```

### 10.4 Checklist de migration vers React

#### Phase 1 : Setup projet
- [ ] Créer projet React avec Vite ou Create React App (TypeScript)
- [ ] Configurer ESLint + Prettier
- [ ] Installer Tailwind CSS ou Material-UI
- [ ] Configurer React Router
- [ ] Installer TanStack Query (React Query)
- [ ] Configurer i18next

#### Phase 2 : Authentification
- [ ] Créer composant `<LoginForm />`
- [ ] Créer hook `useAuth()` avec context
- [ ] Créer composant `<ProtectedRoute />`
- [ ] Gérer redirection login/dashboard
- [ ] Persister session (localStorage ou cookie)

#### Phase 3 : Features core
- [ ] Dashboard avec métriques
- [ ] Liste des channels (table + cards mobile)
- [ ] Formulaire channel avec validation Zod
- [ ] Historique des logs avec pagination
- [ ] Système de toasts/notifications
- [ ] Modal de settings

#### Phase 4 : Optimisations
- [ ] Lazy loading des routes
- [ ] Prefetching React Query
- [ ] Optimistic updates (mutations)
- [ ] Error boundaries
- [ ] Loading skeletons
- [ ] Dark mode (optionnel)

#### Phase 5 : Tests
- [ ] Tests unitaires composants critiques
- [ ] Tests d'intégration (React Testing Library)
- [ ] Tests E2E Playwright (flows principaux)
- [ ] Coverage > 80%

#### Phase 6 : Déploiement
- [ ] Build optimisé (code splitting)
- [ ] CI/CD configuré
- [ ] Déploiement staging
- [ ] Tests utilisateurs
- [ ] Mise en production progressive (feature flags)

---

## CONCLUSION

Ce document constitue une base complète pour comprendre et refondre l'application **YouTube Orchestrator**.

**Points clés à retenir :**
1. Architecture actuelle simple mais fonctionnelle (mono-user, JSON storage)
2. Stack technique mature mais manquant de scalabilité
3. Besoins identifiés : multi-users, base de données, React frontend
4. Roadmap progressive avec priorités claires

**Prochaines étapes recommandées :**
1. Définir scope précis de la v2.0 (features must-have)
2. Choisir stack technique (React + PostgreSQL/MongoDB)
3. Concevoir schéma DB et API v2
4. Développer MVP multi-users en parallèle de v1 (migration progressive)
5. Scripter migration de données JSON → DB
6. Tester avec utilisateurs pilotes
7. Basculer en production avec rollback plan

**Temps estimé pour refonte complète :** 3-6 mois (selon équipe et scope)

---

**Document généré le :** 2025-10-15
**Auteur :** Claude Code
**Version :** 1.0
**Licence :** MIT (comme le projet source)
