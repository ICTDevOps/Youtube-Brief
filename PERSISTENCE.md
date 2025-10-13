# Guide de persistance des données Docker

Ce document explique comment les données sont persistées dans l'application YouTube Orchestrator et comment les gérer.

## Table des matières

- [Comprendre la persistance](#comprendre-la-persistance)
- [Configuration actuelle](#configuration-actuelle)
- [Où sont stockées les données](#où-sont-stockées-les-données)
- [Scénarios de persistance](#scénarios-de-persistance)
- [Gestion des données](#gestion-des-données)
- [Backup et restauration](#backup-et-restauration)
- [Alternatives de persistance](#alternatives-de-persistance)

---

## Comprendre la persistance

### Pourquoi persister les données ?

Les containers Docker sont **éphémères** par nature : quand vous supprimez un container, toutes les données qu'il contient sont perdues. Pour conserver les données entre les redémarrages et les mises à jour, nous utilisons des **volumes Docker**.

### Comment fonctionne la persistance ?

```
┌─────────────────────────────────────────────────┐
│  Machine Hôte (Windows/Linux)                   │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ Volume Docker (stockage persistant)       │  │
│  │ Nom: orchestrator-data                    │  │
│  │                                           │  │
│  │ Contenu:                                  │  │
│  │  └─ data.json                             │  │
│  │     ├─ Chaînes YouTube configurées        │  │
│  │     ├─ Historique des exécutions          │  │
│  │     ├─ Paramètres de l'application        │  │
│  │     └─ Credentials hashés                 │  │
│  └───────────────────────────────────────────┘  │
│                      ↕                          │
│  ┌───────────────────────────────────────────┐  │
│  │ Container (temporaire, remplaçable)       │  │
│  │                                           │  │
│  │  /app/data ← Monté depuis le volume      │  │
│  │     └─ data.json (accès en lecture/écriture)│  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## Configuration actuelle

### docker-compose.yml

```yaml
version: "3.9"
services:
  orchestrator:
    build: .
    container_name: youtube-orchestrator
    volumes:
      - orchestrator-data:/app/data  # ← Montage du volume
    restart: unless-stopped

volumes:
  orchestrator-data:  # ← Déclaration du volume nommé
```

### Explications

**Ligne `volumes: - orchestrator-data:/app/data`**
- **`orchestrator-data`** : Nom du volume Docker (stockage géré par Docker)
- **`/app/data`** : Répertoire dans le container où les données sont écrites
- **`:`** : Relie le volume au chemin du container

**Section `volumes:`**
- Déclare que `orchestrator-data` est un volume géré par Docker
- Docker le créera automatiquement au premier lancement

### Nom complet du volume

Docker préfixe le nom du volume avec le nom du projet (nom du dossier) :

```
youtube-summary_orchestrator-data
```

---

## Où sont stockées les données

### Sur votre machine

#### Windows avec Docker Desktop
```
\\wsl$\docker-desktop-data\data\docker\volumes\youtube-summary_orchestrator-data\_data
```

#### Linux / WSL2
```
/var/lib/docker/volumes/youtube-summary_orchestrator-data/_data
```

#### macOS avec Docker Desktop
```
~/Library/Containers/com.docker.docker/Data/vms/0/data/docker/volumes/youtube-summary_orchestrator-data/_data
```

### Vérifier l'emplacement

```bash
# Voir les informations détaillées du volume
docker volume inspect youtube-summary_orchestrator-data

# Output (exemple):
# [
#     {
#         "CreatedAt": "2025-10-13T09:23:42+02:00",
#         "Driver": "local",
#         "Mountpoint": "/var/lib/docker/volumes/youtube-summary_orchestrator-data/_data",
#         "Name": "youtube-summary_orchestrator-data",
#         "Scope": "local"
#     }
# ]
```

### Contenu du volume

Le volume contient le fichier **`data.json`** qui stocke :

```json
{
  "channels": [
    {
      "id": "uuid-1234",
      "channelName": "Ma Chaîne YouTube",
      "youtubeChannelId": "UC...",
      "cronExpression": "0 9 * * 1",
      "isActive": true,
      "videoLimit": 5,
      "daysBack": 7,
      "emails": ["user@example.com"],
      "createdAt": "2025-10-13T10:00:00Z",
      "lastExecution": "2025-10-13T09:00:00Z",
      "nextExecution": "2025-10-20T09:00:00Z"
    }
  ],
  "executionLogs": [
    {
      "id": "log-uuid",
      "channelId": "uuid-1234",
      "status": "success",
      "startedAt": "2025-10-13T09:00:00Z",
      "finishedAt": "2025-10-13T09:00:30Z",
      "retries": 0,
      "message": "Workflow executed successfully"
    }
  ],
  "settings": {
    "n8nWebhookUrl": "https://n8n.example.com/webhook/...",
    "n8nStatusWebhookUrl": "https://n8n.example.com/webhook/status/...",
    "pollingIntervalMs": 5000,
    "pollingTimeoutMs": 600000,
    "adminUsername": "admin",
    "hashedPassword": "$2b$12$..."
  }
}
```

---

## Scénarios de persistance

### ✅ Les données PERSISTENT dans ces cas

#### 1. Arrêt et redémarrage du container
```bash
docker compose down
docker compose up -d
```
**Résultat :** Données conservées ✅

#### 2. Rebuild de l'image
```bash
docker compose up -d --build
```
**Résultat :** Données conservées ✅

#### 3. Recréation forcée du container
```bash
docker compose up -d --force-recreate
```
**Résultat :** Données conservées ✅

#### 4. Mise à jour du code de l'application
```bash
git pull
docker compose up -d --build
```
**Résultat :** Données conservées ✅

#### 5. Suppression du container seul
```bash
docker rm -f youtube-orchestrator
docker compose up -d
```
**Résultat :** Données conservées ✅

### ❌ Les données sont PERDUES dans ces cas

#### 1. Suppression avec l'option -v (volumes)
```bash
docker compose down -v
```
**Résultat :** Données supprimées ❌

#### 2. Suppression manuelle du volume
```bash
docker volume rm youtube-summary_orchestrator-data
```
**Résultat :** Données supprimées ❌

#### 3. Suppression de tous les volumes non utilisés
```bash
docker volume prune
```
**Résultat :** Si le container est arrêté, le volume peut être supprimé ❌

---

## Gestion des données

### Lister les volumes

```bash
# Voir tous les volumes
docker volume ls

# Filtrer par nom
docker volume ls | grep orchestrator
```

### Inspecter le volume

```bash
# Informations détaillées
docker volume inspect youtube-summary_orchestrator-data
```

### Voir le contenu des données

```bash
# Lire le fichier data.json depuis le container
docker exec youtube-orchestrator cat /app/data/data.json

# Afficher de manière formatée (si jq est installé)
docker exec youtube-orchestrator cat /app/data/data.json | jq .

# Lister les fichiers du répertoire data
docker exec youtube-orchestrator ls -la /app/data
```

### Copier les données vers votre machine

```bash
# Copier data.json sur votre machine locale
docker cp youtube-orchestrator:/app/data/data.json ./data-local.json

# Copier tout le dossier data
docker cp youtube-orchestrator:/app/data ./data-backup
```

### Copier des données vers le container

```bash
# Copier un fichier data.json modifié vers le container
docker cp ./data-local.json youtube-orchestrator:/app/data/data.json

# Redémarrer pour prendre en compte les changements
docker compose restart
```

### Modifier les données manuellement

⚠️ **Attention :** L'application doit être arrêtée pour éviter les conflits d'écriture.

```bash
# 1. Arrêter le container
docker compose down

# 2. Extraire les données
docker run --rm \
  -v youtube-summary_orchestrator-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /data/data.json /backup/data.json

# 3. Modifier data.json avec votre éditeur
nano data.json

# 4. Réinjecter les données
docker run --rm \
  -v youtube-summary_orchestrator-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /backup/data.json /data/data.json

# 5. Redémarrer le container
docker compose up -d
```

---

## Backup et restauration

### Backup manuel rapide

```bash
# Copier data.json vers un fichier daté
docker exec youtube-orchestrator cat /app/data/data.json > backup-$(date +%Y%m%d-%H%M%S).json
```

### Backup complet du volume

```bash
# Créer une archive tar.gz du volume complet
docker run --rm \
  -v youtube-summary_orchestrator-data:/data \
  -v "$(pwd)":/backup \
  alpine tar czf /backup/orchestrator-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
```

### Script de backup automatique

Créez le fichier `scripts/backup-data.sh` :

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="./backups"
CONTAINER_NAME="youtube-orchestrator"
DATE=$(date +%Y%m%d-%H%M%S)

# Créer le répertoire de backup s'il n'existe pas
mkdir -p "$BACKUP_DIR"

# Backup du fichier data.json
echo "Creating backup..."
docker exec "$CONTAINER_NAME" cat /app/data/data.json > "$BACKUP_DIR/data-$DATE.json"

# Vérifier le succès
if [ $? -eq 0 ]; then
    echo "✅ Backup créé : $BACKUP_DIR/data-$DATE.json"

    # Nettoyer les anciens backups (garder les 10 derniers)
    ls -t "$BACKUP_DIR"/data-*.json | tail -n +11 | xargs -r rm
    echo "Anciens backups nettoyés (10 derniers conservés)"
else
    echo "❌ Erreur lors de la création du backup"
    exit 1
fi
```

Rendre le script exécutable :
```bash
chmod +x scripts/backup-data.sh
```

Utilisation :
```bash
./scripts/backup-data.sh
```

### Script de backup du volume complet

Créez le fichier `scripts/backup-volume.sh` :

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="./backups"
VOLUME_NAME="youtube-summary_orchestrator-data"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/volume-$DATE.tar.gz"

# Créer le répertoire de backup
mkdir -p "$BACKUP_DIR"

# Backup du volume complet
echo "Creating volume backup..."
docker run --rm \
  -v "$VOLUME_NAME":/data \
  -v "$(pwd)":/backup \
  alpine tar czf "/backup/$BACKUP_FILE" -C /data .

# Vérifier le succès
if [ $? -eq 0 ]; then
    echo "✅ Backup créé : $BACKUP_FILE"
    SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    echo "Taille : $SIZE"

    # Nettoyer les anciens backups (garder les 5 derniers)
    ls -t "$BACKUP_DIR"/volume-*.tar.gz | tail -n +6 | xargs -r rm
    echo "Anciens backups nettoyés (5 derniers conservés)"
else
    echo "❌ Erreur lors de la création du backup"
    exit 1
fi
```

Rendre le script exécutable :
```bash
chmod +x scripts/backup-volume.sh
```

### Restauration depuis un backup

#### Restaurer data.json uniquement

```bash
# 1. Arrêter le container
docker compose down

# 2. Restaurer le fichier
docker run --rm \
  -v youtube-summary_orchestrator-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /backup/backups/data-20250113-120000.json /data/data.json

# 3. Redémarrer
docker compose up -d
```

#### Restaurer le volume complet

```bash
# 1. Arrêter le container
docker compose down

# 2. Supprimer l'ancien volume (optionnel)
docker volume rm youtube-summary_orchestrator-data

# 3. Créer un nouveau volume
docker volume create youtube-summary_orchestrator-data

# 4. Restaurer depuis le backup
docker run --rm \
  -v youtube-summary_orchestrator-data:/data \
  -v "$(pwd)":/backup \
  alpine tar xzf /backup/backups/volume-20250113-120000.tar.gz -C /data

# 5. Redémarrer
docker compose up -d
```

### Backup automatique avec cron

Pour Linux/macOS, ajoutez une tâche cron :

```bash
# Éditer la crontab
crontab -e

# Ajouter une ligne pour backup quotidien à 3h du matin
0 3 * * * cd /chemin/vers/youtube-summary && ./scripts/backup-data.sh >> /var/log/youtube-orchestrator-backup.log 2>&1
```

Pour Windows, utilisez le Planificateur de tâches.

---

## Alternatives de persistance

### Option 1 : Volume nommé (Actuel - Recommandé)

**Configuration actuelle :**
```yaml
volumes:
  - orchestrator-data:/app/data

volumes:
  orchestrator-data:
```

**Avantages :**
- ✅ Géré automatiquement par Docker
- ✅ Meilleure performance
- ✅ Indépendant du système de fichiers de l'hôte
- ✅ Portable entre différents environnements

**Inconvénients :**
- ⚠️ Moins accessible directement (nécessite commandes Docker)
- ⚠️ Emplacement géré par Docker

### Option 2 : Bind mount (dossier local)

**Configuration alternative :**
```yaml
volumes:
  - ./data:/app/data  # Dossier local → container
```

**Avantages :**
- ✅ Accès direct au fichier sur votre machine
- ✅ Facile à éditer manuellement
- ✅ Facile à versionner avec Git (si souhaité)
- ✅ Simple à backuper (copie de dossier)

**Inconvénients :**
- ⚠️ Problèmes de permissions possibles (Windows/Linux)
- ⚠️ Moins portable (chemin absolu ou relatif)
- ⚠️ Performance potentiellement réduite
- ⚠️ Risque de modifier les données par erreur

**Mise en œuvre :**

1. Créez le dossier local :
```bash
mkdir -p data
```

2. Modifiez `docker-compose.yml` :
```yaml
version: "3.9"
services:
  orchestrator:
    build: .
    container_name: youtube-orchestrator
    volumes:
      - ./data:/app/data  # ← Bind mount
    restart: unless-stopped

# Supprimez la section volumes: si vous n'utilisez plus le volume nommé
```

3. Ajoutez `data/` au `.gitignore` :
```gitignore
# Local data directory
data/
```

4. Redéployez :
```bash
docker compose down
docker compose up -d
```

### Option 3 : Volume avec driver spécifique

Pour des besoins avancés (NFS, cloud storage, etc.) :

```yaml
volumes:
  orchestrator-data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=192.168.1.100,rw
      device: ":/path/to/nfs/share"
```

---

## Migration entre les options

### De volume nommé vers bind mount

```bash
# 1. Extraire les données du volume
docker run --rm \
  -v youtube-summary_orchestrator-data:/source \
  -v "$(pwd)/data":/dest \
  alpine cp -a /source/. /dest/

# 2. Modifier docker-compose.yml (voir Option 2)

# 3. Arrêter et redémarrer
docker compose down
docker compose up -d

# 4. Optionnel : supprimer l'ancien volume
docker volume rm youtube-summary_orchestrator-data
```

### De bind mount vers volume nommé

```bash
# 1. Créer le volume
docker volume create youtube-summary_orchestrator-data

# 2. Copier les données
docker run --rm \
  -v "$(pwd)/data":/source \
  -v youtube-summary_orchestrator-data:/dest \
  alpine cp -a /source/. /dest/

# 3. Modifier docker-compose.yml (voir Option 1)

# 4. Redémarrer
docker compose down
docker compose up -d
```

---

## Dépannage

### Le volume ne se crée pas

```bash
# Créer manuellement le volume
docker volume create youtube-summary_orchestrator-data

# Redémarrer
docker compose up -d
```

### Les données ne persistent pas

```bash
# Vérifier que le volume est bien monté
docker inspect youtube-orchestrator | grep -A 10 Mounts

# Vérifier le contenu du volume
docker exec youtube-orchestrator ls -la /app/data
```

### Le fichier data.json est corrompu

```bash
# 1. Arrêter le container
docker compose down

# 2. Restaurer depuis un backup
docker run --rm \
  -v youtube-summary_orchestrator-data:/data \
  -v "$(pwd)":/backup \
  alpine cp /backup/backups/data-YYYYMMDD-HHMMSS.json /data/data.json

# 3. Redémarrer
docker compose up -d
```

### Permissions denied

Sur Linux, si vous utilisez un bind mount :

```bash
# Vérifier les permissions
ls -la data/

# Corriger les permissions (adaptez selon votre user)
sudo chown -R $USER:$USER data/
chmod -R 755 data/
```

### Volume plein / trop gros

```bash
# Vérifier la taille du volume
docker system df -v | grep orchestrator-data

# Nettoyer les logs anciens via l'application
# (Utilisez le bouton "Supprimer tout" dans l'interface)

# Ou nettoyer manuellement (avec précaution)
# Backup d'abord !
docker exec youtube-orchestrator cat /app/data/data.json > backup-before-clean.json
```

---

## Bonnes pratiques

### 1. Backups réguliers

- ✅ Automatisez les backups (cron, planificateur de tâches)
- ✅ Conservez plusieurs versions (rotation)
- ✅ Testez régulièrement la restauration
- ✅ Stockez les backups hors de la machine (cloud, NAS, etc.)

### 2. Versionning

- ✅ Ne versionnez PAS le fichier `data.json` dans Git (contient des données sensibles)
- ✅ Ajoutez `data/` et `backups/` au `.gitignore`
- ✅ Documentez votre stratégie de backup

### 3. Sécurité

- ✅ Limitez l'accès au volume (permissions)
- ✅ Chiffrez les backups pour le stockage externe
- ✅ Ne partagez jamais les fichiers data.json (contiennent des mots de passe hashés)

### 4. Monitoring

- ✅ Surveillez la taille du volume
- ✅ Vérifiez régulièrement l'intégrité des données
- ✅ Alertes en cas d'échec de backup

### 5. Documentation

- ✅ Documentez votre procédure de backup
- ✅ Documentez votre procédure de restauration
- ✅ Testez ces procédures régulièrement

---

## Ressources

- [Documentation Docker Volumes](https://docs.docker.com/storage/volumes/)
- [Best practices for data persistence](https://docs.docker.com/develop/dev-best-practices/)
- Guide du projet : `docker-compose.md`
- Configuration serveur : `CLAUDE.md`
