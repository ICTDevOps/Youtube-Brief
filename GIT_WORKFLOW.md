# Git Workflow Guide

Ce document détaille le workflow Git configuré pour ce projet, incluant la stratégie de branching, les conventions et les bonnes pratiques.

## 📋 Table des matières

- [Structure des branches](#structure-des-branches)
- [Workflow quotidien](#workflow-quotidien)
- [Conventions de nommage](#conventions-de-nommage)
- [Types de commits](#types-de-commits)
- [Pull Requests](#pull-requests)
- [Commandes essentielles](#commandes-essentielles)
- [Situations d'urgence](#situations-durgence)
- [Bonnes pratiques](#bonnes-pratiques)

## 🌳 Structure des branches

### Branches principales

| Branche | Rôle | Protection | Déploiement |
|---------|------|------------|-------------|
| `main` | Production stable - Code en production | 🔒 Protégée | Production |
| `develop` | Intégration - Base pour le développement | ⚠️ Semi-protégée | Staging/Test |

### Branches temporaires

| Type | Nomenclature | Base | Destination | Usage |
|------|--------------|------|-------------|-------|
| `feature/*` | `feature/nom-fonctionnalite` | `develop` | `develop` | Nouvelles fonctionnalités |
| `hotfix/*` | `hotfix/description-fix` | `main` | `main` + `develop` | Corrections urgentes |
| `release/*` | `release/v1.2.0` | `develop` | `main` | Préparation de release |
| `bugfix/*` | `bugfix/description-bug` | `develop` | `develop` | Corrections de bugs |

## 🔄 Workflow quotidien

### 1. Démarrer une nouvelle fonctionnalité

```bash
# Se placer sur develop et synchroniser
git checkout develop
git pull origin develop

# Créer une branche feature
git checkout -b feature/authentification-oauth

# Vérifier la branche active
git branch
```

### 2. Développer et committer

```bash
# Voir les modifications
git status
git diff

# Ajouter les fichiers modifiés
git add .
# OU sélectivement
git add src/auth.ts src/types.ts

# Committer avec un message descriptif
git commit -m "feat(auth): add OAuth2 authentication system"

# Pousser la branche
git push -u origin feature/authentification-oauth
```

### 3. Finaliser la fonctionnalité

```bash
# Sur GitHub : créer une Pull Request
# feature/authentification-oauth → develop

# Après merge et suppression de la PR
git checkout develop
git pull origin develop
git branch -d feature/authentification-oauth
```

### 4. Release vers production

```bash
# Créer une release depuis develop
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# Tests finaux, mise à jour version, changelog...
git add .
git commit -m "release: prepare v1.2.0"
git push -u origin release/v1.2.0

# PR release/v1.2.0 → main
# Après merge, tagger la release
git checkout main
git pull origin main
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0

# Merge main → develop pour synchroniser
```

### 5. Hotfix urgent

```bash
# Partir de main pour les corrections urgentes
git checkout main
git pull origin main
git checkout -b hotfix/security-fix-session

# Développer la correction
git add .
git commit -m "fix(security): patch session vulnerability"
git push -u origin hotfix/security-fix-session

# PR vers main ET develop
# Tagger immédiatement après merge
git tag -a v1.2.1 -m "Hotfix v1.2.1 - Security patch"
git push origin v1.2.1
```

## 📝 Conventions de nommage

### Branches

```bash
feature/user-dashboard       # ✅ Bon
feature/UserDashboard        # ❌ Éviter les majuscules
feature/add_user_dashboard   # ❌ Éviter les underscores

hotfix/fix-login-bug         # ✅ Bon
hotfix/emergency-patch       # ✅ Bon

release/v1.2.0              # ✅ Bon
release/1.2.0               # ✅ Acceptable
```

### Tags

```bash
v1.0.0          # Release majeure
v1.1.0          # Release mineure
v1.1.1          # Patch
v1.2.0-beta.1   # Pre-release
```

## 💬 Types de commits

Suivre la convention [Conventional Commits](https://www.conventionalcommits.org/) :

```bash
feat(scope): description          # Nouvelle fonctionnalité
fix(scope): description           # Correction de bug
docs(scope): description          # Documentation
style(scope): description         # Formatage, style
refactor(scope): description      # Refactoring
test(scope): description          # Tests
chore(scope): description         # Maintenance, config
perf(scope): description          # Optimisation performance
ci(scope): description            # Intégration continue
build(scope): description         # Build, dépendances
```

### Exemples de commits

```bash
feat(auth): add OAuth2 integration
fix(api): resolve timeout issue in webhook calls
docs(readme): update installation instructions
refactor(storage): optimize JSON file operations
test(auth): add unit tests for login service
chore(deps): update dependencies to latest versions
perf(cron): improve scheduling performance
ci(github): add automated testing workflow
build(docker): optimize Docker image size
```

## 🔀 Pull Requests

### Template de PR

```markdown
## Description
Brief description of changes

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project conventions
- [ ] Self-review completed
- [ ] Documentation updated if needed
```

### Workflow de review

1. **Créer la PR** avec titre descriptif
2. **Assigner des reviewers** (minimum 1)
3. **Tests automatiques** doivent passer
4. **Review et approbation** requises
5. **Merge** avec squash si nécessaire
6. **Suppression** de la branche après merge

## 🛠️ Commandes essentielles

### Synchronisation

```bash
# Synchroniser toutes les branches
git fetch --all

# Synchroniser et nettoyer les branches supprimées
git fetch --prune

# Voir l'état de toutes les branches
git branch -vv

# Mettre à jour la branche courante
git pull origin $(git branch --show-current)
```

### Navigation

```bash
# Lister toutes les branches
git branch -a

# Changer de branche
git checkout develop
git switch feature/my-feature  # Nouvelle syntaxe

# Créer et basculer
git checkout -b feature/new-feature
git switch -c feature/new-feature  # Nouvelle syntaxe

# Revenir à la branche précédente
git checkout -
```

### Historique

```bash
# Voir l'historique
git log --oneline --graph
git log --oneline --graph --all

# Voir les modifications d'un fichier
git log -p -- src/server.ts

# Voir qui a modifié quoi
git blame src/server.ts

# Différences entre branches
git diff main..develop
```

### Nettoyage

```bash
# Supprimer les branches mergées localement
git branch --merged | grep -v "main\|develop" | xargs -n 1 git branch -d

# Supprimer une branche locale
git branch -d feature/completed-feature

# Supprimer une branche distante
git push origin --delete feature/completed-feature

# Nettoyer les références distantes
git remote prune origin
```

## 🚨 Situations d'urgence

### Annuler le dernier commit (local)

```bash
# Garder les modifications
git reset --soft HEAD~1

# Supprimer les modifications
git reset --hard HEAD~1
```

### Annuler un commit déjà poussé

```bash
# Créer un commit de revert
git revert HEAD

# Ou pour un commit spécifique
git revert abc123def
```

### Récupérer du travail perdu

```bash
# Voir l'historique des actions
git reflog

# Récupérer un commit
git checkout abc123def

# Créer une branche depuis ce point
git checkout -b recovery-branch
```

### Sauvegarder temporairement

```bash
# Sauvegarder les modifications
git stash push -m "travail en cours sur auth"

# Lister les stash
git stash list

# Récupérer le dernier stash
git stash pop

# Récupérer un stash spécifique
git stash pop stash@{1}

# Supprimer un stash
git stash drop stash@{0}
```

### Résoudre les conflits

```bash
# Après un merge/rebase avec conflits
git status  # Voir les fichiers en conflit

# Éditer les fichiers pour résoudre
# Puis marquer comme résolu
git add fichier-resolu.ts

# Finaliser le merge
git commit
```

## ✅ Bonnes pratiques

### Commits

- **Atomiques** : un commit = une modification logique
- **Messages clairs** : utiliser les conventions
- **Fréquents** : committer souvent, pusher régulièrement
- **Tests** : s'assurer que les tests passent

### Branches

- **Courtes** : durée de vie limitée pour les features
- **Synchronisées** : rebase régulier sur develop
- **Nommage** : descriptif et consistant
- **Nettoyage** : supprimer après merge

### Workflow

- **Pull avant push** : toujours synchroniser
- **Review** : ne jamais merger sans review
- **Tests** : automatiser les vérifications
- **Documentation** : maintenir à jour

### Sécurité

- **Pas de secrets** : jamais de mots de passe/clés dans git
- **Protection** : branches main/develop protégées
- **Signatures** : signer les commits importants
- **Audit** : historique propre et traçable

## 🔧 Configuration recommandée

### Configuration globale

```bash
# Identité
git config --global user.name "Votre Nom"
git config --global user.email "email@example.com"

# Éditeur par défaut
git config --global core.editor "code --wait"

# Aliases utiles
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.cm commit
git config --global alias.lg "log --oneline --graph --all"

# Comportement par défaut
git config --global push.default simple
git config --global pull.rebase false
git config --global init.defaultBranch main
```

### Gitignore global

```bash
# Créer un gitignore global
git config --global core.excludesfile ~/.gitignore_global

# Ajouter des patterns communs
echo ".DS_Store" >> ~/.gitignore_global
echo "*.log" >> ~/.gitignore_global
echo ".vscode/" >> ~/.gitignore_global
```

---

## 📚 Ressources supplémentaires

- [Git Documentation](https://git-scm.com/doc)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials)

---

*Dernière mise à jour : $(date)*