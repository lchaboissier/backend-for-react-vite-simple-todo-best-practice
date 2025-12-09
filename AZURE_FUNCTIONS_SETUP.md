# Configuration Azure Functions

## Installation

```bash
# Installer les dépendances
npm install

# Installer Azure Functions Core Tools globalement
npm install -g azure-functions-core-tools@4 --unsafe-perm true
```

## Tester en local

### 1. Démarrer la base de données PostgreSQL

Si tu utilises Docker:
```bash
cd docker
docker-compose up -d
```

Ou avec ta propre instance PostgreSQL sur localhost:5432

### 2. Configurer les variables d'environnement

Le fichier `local.settings.json` contient déjà la config par défaut:
```json
{
  "Values": {
    "DATABASE_URL": "postgresql://admin:admin123@localhost:5432/todo_db"
  }
}
```

Modifie `DATABASE_URL` si nécessaire.

### 3. Lancer Azure Functions en local

```bash
npm start
```

ou directement:
```bash
func start
```

Le serveur démarre sur `http://localhost:7071` (port par défaut d'Azure Functions).

## Endpoints disponibles

Toutes les routes sont préfixées par `/api`:

- `GET /api/status` - Statut de la connexion DB
- `GET /api/tasks` - Liste toutes les tâches
- `GET /api/tasks/{id}` - Récupère une tâche
- `POST /api/tasks` - Créer une tâche
- `PUT /api/tasks/{id}` - Modifier une tâche
- `DELETE /api/tasks/{id}` - Supprimer une tâche

## Exemples de requêtes

```bash
# Status
curl http://localhost:7071/api/status

# Créer une tâche
curl -X POST http://localhost:7071/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Ma tâche", "state": false}'

# Lister les tâches
curl http://localhost:7071/api/tasks

# Modifier une tâche
curl -X PUT http://localhost:7071/api/tasks/{id} \
  -H "Content-Type: application/json" \
  -d '{"state": true}'

# Supprimer une tâche
curl -X DELETE http://localhost:7071/api/tasks/{id}
```

## Déploiement Azure

### 1. Créer la Function App sur Azure

```bash
# Via Azure CLI
az functionapp create \
  --resource-group <nom-resource-group> \
  --consumption-plan-location <region> \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4 \
  --name <nom-function-app> \
  --storage-account <nom-storage-account>
```

### 2. Configurer les variables d'environnement sur Azure

```bash
az functionapp config appsettings set \
  --name <nom-function-app> \
  --resource-group <nom-resource-group> \
  --settings DATABASE_URL="<ta-connection-string-azure-postgres>"
```

### 3. Déployer

```bash
func azure functionapp publish <nom-function-app>
```

## Différences avec Express

- Port par défaut: `7071` au lieu de `3001`
- Routes préfixées par `/api` automatiquement
- Pas besoin de `cors` et `express.json()`, géré par Azure Functions
- Retours en format `{ status, jsonBody }` au lieu de `res.json()`
- Modèle de programmation v4 avec `@azure/functions`

## Garder l'ancien serveur Express

L'ancien fichier `index.js` est conservé. Pour le lancer:

```bash
npm run start:express
```

