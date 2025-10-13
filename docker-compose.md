# Guide de déploiement Docker Compose

Ce document explique comment déployer l'application YouTube Orchestrator avec Docker Compose et gérer les différents environnements.

## Table des matières

- [Configuration actuelle](#configuration-actuelle)
- [Gestion des variables d'environnement](#gestion-des-variables-denvironnement)
- [Déploiement par environnement](#déploiement-par-environnement)
- [Commandes utiles](#commandes-utiles)
- [Bonnes pratiques de sécurité](#bonnes-pratiques-de-sécurité)

---

## Configuration actuelle

Le projet utilise `docker-compose.yml` avec la configuration suivante :

```yaml
version: "3.9"
services:
  orchestrator:
    build: .
    container_name: youtube-orchestrator
    env_file:
      - .env
    environment:
      - PORT=${PORT:-8080}
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - orchestrator-data:/app/data
    restart: unless-stopped

volumes:
  orchestrator-data:
```

### Composants clés

- **build: .** - Construit l'image depuis le Dockerfile local
- **env_file: .env** - Charge les variables depuis le fichier `.env`
- **environment** - Permet de redéfinir ou ajouter des variables
- **volumes** - Persiste les données dans `orchestrator-data`
- **restart: unless-stopped** - Redémarre automatiquement le container

---

## Gestion des variables d'environnement

### Ordre de priorité (du plus faible au plus fort)

1. Variables définies dans le Dockerfile (`ENV`)
2. Variables du fichier `.env` (`env_file`)
3. Variables définies dans `environment` du docker-compose
4. Variables d'environnement système lors du lancement

### Variables disponibles

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `PORT` | Port d'écoute du serveur | `8080` |
| `NODE_ENV` | Environnement d'exécution | *(non défini)* |
| `N8N_WEBHOOK_URL` | URL du webhook N8N principal | *Requis* |
| `N8N_STATUS_WEBHOOK_URL` | URL du webhook de statut N8N | *Requis* |
| `ADMIN_USERNAME` | Identifiant administrateur | `admin` |
| `ADMIN_PASSWORD` | Mot de passe administrateur | *Requis* |
| `SESSION_SECRET` | Secret pour les sessions | *Requis* |
| `N8N_RETRY_ATTEMPTS` | Nombre de tentatives webhook | `3` |
| `N8N_RETRY_DELAY_MS` | Délai entre les tentatives | `5000` |
| `N8N_TIMEOUT_MS` | Timeout des requêtes webhook | `60000` |
| `POLLING_INTERVAL_MS` | Intervalle de polling des jobs | `5000` |
| `POLLING_TIMEOUT_MS` | Timeout du polling | `600000` |
| `CRON_TIMEZONE` | Fuseau horaire pour les crons | `Europe/Paris` |

---

## Déploiement par environnement

### Option 1 : Fichiers .env multiples (Recommandé)

Créez un fichier `.env` pour chaque environnement :

#### `.env.development`
```env
PORT=8080
N8N_WEBHOOK_URL=http://localhost:5678/webhook/dev
N8N_STATUS_WEBHOOK_URL=http://localhost:5678/webhook/status/dev
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dev123
SESSION_SECRET=dev-secret-change-me
CRON_TIMEZONE=Europe/Paris
```

#### `.env.production`
```env
PORT=8080
NODE_ENV=production
N8N_WEBHOOK_URL=https://n8n.production.com/webhook/abc123
N8N_STATUS_WEBHOOK_URL=https://n8n.production.com/webhook/status/xyz789
ADMIN_USERNAME=admin
ADMIN_PASSWORD=VotreMotDePasseSecurise!
SESSION_SECRET=GenerezUnSecretAleatoireTresLong123456789
N8N_RETRY_ATTEMPTS=3
N8N_RETRY_DELAY_MS=5000
N8N_TIMEOUT_MS=60000
POLLING_INTERVAL_MS=5000
POLLING_TIMEOUT_MS=600000
CRON_TIMEZONE=Europe/Paris
```

**Déploiement :**
```bash
# Développement (utilise .env par défaut)
docker compose up -d

# Production
docker compose --env-file .env.production up -d --build
```

---

### Option 2 : Fichiers docker-compose multiples

Créez des fichiers docker-compose spécifiques :

#### `docker-compose.yml` (base commune)
```yaml
version: "3.9"
services:
  orchestrator:
    build: .
    container_name: youtube-orchestrator
    volumes:
      - orchestrator-data:/app/data
    restart: unless-stopped

volumes:
  orchestrator-data:
```

#### `docker-compose.dev.yml`
```yaml
version: "3.9"
services:
  orchestrator:
    env_file:
      - .env.development
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=development
```

#### `docker-compose.prod.yml`
```yaml
version: "3.9"
services:
  orchestrator:
    env_file:
      - .env.production
    ports:
      - "80:8080"
    environment:
      - NODE_ENV=production
    # Redéfinir depuis variables système (plus sécurisé)
    # - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    # - SESSION_SECRET=${SESSION_SECRET}
```

**Déploiement :**
```bash
# Développement
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

### Option 3 : Variables inline (pour tests rapides)

Redéfinir directement dans le docker-compose :

```yaml
version: "3.9"
services:
  orchestrator:
    build: .
    container_name: youtube-orchestrator
    environment:
      - PORT=8080
      - NODE_ENV=production
      - N8N_WEBHOOK_URL=https://n8n.prod.com/webhook/abc
      - N8N_STATUS_WEBHOOK_URL=https://n8n.prod.com/webhook/status
      - ADMIN_USERNAME=admin
      - ADMIN_PASSWORD=MotDePasse123!
      - SESSION_SECRET=SecretAleatoire123456
      - CRON_TIMEZONE=Europe/Paris
    ports:
      - "8080:8080"
    volumes:
      - orchestrator-data:/app/data
    restart: unless-stopped

volumes:
  orchestrator-data:
```

⚠️ **Attention :** Cette méthode expose les secrets dans le fichier. Ne pas commiter !

---

## Commandes utiles

### Démarrage et arrêt

```bash
# Démarrer en arrière-plan
docker compose up -d

# Démarrer avec rebuild de l'image
docker compose up -d --build

# Démarrer avec un fichier .env spécifique
docker compose --env-file .env.production up -d

# Arrêter les containers
docker compose down

# Arrêter et supprimer les volumes (⚠️ supprime les données)
docker compose down -v
```

### Logs et debugging

```bash
# Voir les logs en temps réel
docker compose logs -f

# Voir les logs d'un service spécifique
docker compose logs -f orchestrator

# Voir les 50 dernières lignes
docker compose logs --tail 50 orchestrator

# Inspecter la configuration
docker compose config
```

### Gestion des containers

```bash
# Lister les containers
docker compose ps

# Redémarrer un service
docker compose restart orchestrator

# Exécuter une commande dans le container
docker compose exec orchestrator sh

# Voir les variables d'environnement du container
docker compose exec orchestrator env
```

### Build et images

```bash
# Builder l'image sans démarrer
docker compose build

# Builder avec cache désactivé
docker compose build --no-cache

# Supprimer les images non utilisées
docker image prune -a
```

### Volumes et données

```bash
# Lister les volumes
docker volume ls

# Inspecter un volume
docker volume inspect youtube-summary_orchestrator-data

# Backup du volume
docker run --rm -v youtube-summary_orchestrator-data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz -C /data .

# Restore du volume
docker run --rm -v youtube-summary_orchestrator-data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /data
```

---

## Bonnes pratiques de sécurité

### 1. Ne jamais commiter les secrets

Ajoutez dans `.gitignore` :
```gitignore
.env
.env.local
.env.production
.env.*.local
```

### 2. Utiliser des secrets forts

Générez des secrets aléatoires :
```bash
# Génération d'un SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Ou avec OpenSSL
openssl rand -base64 32
```

### 3. Utiliser Docker secrets (production)

Pour les environnements de production (Docker Swarm ou Kubernetes) :

```yaml
version: "3.9"
services:
  orchestrator:
    image: youtube-orchestrator:latest
    secrets:
      - admin_password
      - session_secret
    environment:
      - ADMIN_PASSWORD_FILE=/run/secrets/admin_password
      - SESSION_SECRET_FILE=/run/secrets/session_secret

secrets:
  admin_password:
    external: true
  session_secret:
    external: true
```

### 4. Séparer les configurations sensibles

Ne jamais inclure les secrets dans le code ou les fichiers commités. Utilisez :
- Variables d'environnement système
- Gestionnaires de secrets (Vault, AWS Secrets Manager, etc.)
- Fichiers `.env` en local uniquement (ignorés par git)

### 5. Activer HTTPS en production

En production, déployez derrière un reverse proxy HTTPS :

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - orchestrator

  orchestrator:
    build: .
    environment:
      - NODE_ENV=production  # Active les cookies secure
    expose:
      - "8080"
```

### 6. Limiter les ressources

Pour éviter la surcharge :

```yaml
services:
  orchestrator:
    build: .
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

---

## Dépannage

### Le container ne démarre pas

```bash
# Voir les logs d'erreur
docker compose logs orchestrator

# Vérifier la configuration
docker compose config

# Reconstruire sans cache
docker compose build --no-cache
docker compose up -d
```

### Les variables d'environnement ne sont pas chargées

```bash
# Vérifier les variables dans le container
docker compose exec orchestrator env | grep N8N

# Vérifier le fichier .env
cat .env
```

### La connexion échoue

```bash
# Vérifier que le port est bien exposé
docker compose ps
netstat -an | grep 8080

# Tester depuis le container
docker compose exec orchestrator wget -O- http://localhost:8080/api/health
```

### Les données sont perdues

```bash
# Vérifier que le volume existe
docker volume ls | grep orchestrator-data

# Vérifier le contenu du volume
docker run --rm -v youtube-summary_orchestrator-data:/data alpine ls -la /data
```

---

## Support

Pour plus d'informations :
- Documentation Docker Compose : https://docs.docker.com/compose/
- Documentation du projet : voir `README.md` et `CLAUDE.md`
- Issues : Créer une issue sur le repository Git
