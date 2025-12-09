const { app } = require('@azure/functions');
const { Pool } = require('pg');
const { randomUUID } = require('crypto');

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://admin:admin123@localhost:5432/todo_db",
});

let dbConnected = false;

pool.on('error', (err) => {
  console.error(new Date().toISOString(), '❌ Unexpected database error', err.message);
  dbConnected = false;
});

pool.on('connect', () => {
  console.log(new Date().toISOString(), '🔌 New database connection established');
  dbConnected = true;
});

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        state BOOLEAN DEFAULT false
      )
    `);
    dbConnected = true;
    console.log('✅ Database connected and initialized');
  } catch (error) {
    dbConnected = false;
    console.error('❌ Database initialization failed:', error.message);
  }
}

// Retry connection
async function ensureConnection() {
  if (!dbConnected) {
    await initDB();
  }
}

initDB();
setInterval(ensureConnection, 10000);

// Helper pour vérifier la connexion DB
function checkDB() {
  if (!dbConnected) {
    return {
      status: 503,
      jsonBody: { 
        error: 'Database unavailable',
        message: 'Service temporarily unavailable. Please try again later.'
      }
    };
  }
  return null;
}

// GET /status
app.http('status', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'status',
  handler: async (request, context) => {
    try {
      const result = await pool.query('SELECT NOW()');
      return {
        status: 200,
        jsonBody: {
          status: 'healthy',
          database: 'connected',
          timestamp: result.rows[0].now
        }
      };
    } catch (error) {
      return {
        status: 200,
        jsonBody: {
          status: 'unhealthy',
          database: 'disconnected',
          error: error.message
        }
      };
    }
  }
});

// GET /tasks
app.http('getTasks', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'tasks',
  handler: async (request, context) => {
    const dbError = checkDB();
    if (dbError) return dbError;

    try {
      const result = await pool.query('SELECT * FROM tasks ORDER BY id');
      return {
        status: 200,
        jsonBody: result.rows
      };
    } catch (error) {
      console.error('Database query error:', error.message);
      dbConnected = false;
      return {
        status: 500,
        jsonBody: { error: 'Database error', message: error.message }
      };
    }
  }
});

// GET /tasks/:id
app.http('getTask', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'tasks/{id}',
  handler: async (request, context) => {
    const dbError = checkDB();
    if (dbError) return dbError;

    const id = request.params.id;

    try {
      const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return {
          status: 404,
          jsonBody: { error: 'Task not found' }
        };
      }
      return {
        status: 200,
        jsonBody: result.rows[0]
      };
    } catch (error) {
      console.error('Database query error:', error.message);
      dbConnected = false;
      return {
        status: 500,
        jsonBody: { error: 'Database error', message: error.message }
      };
    }
  }
});

// POST /tasks
app.http('createTask', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tasks',
  handler: async (request, context) => {
    const dbError = checkDB();
    if (dbError) return dbError;

    let body;
    try {
      body = await request.json();
    } catch (error) {
      return {
        status: 400,
        jsonBody: { error: 'Invalid JSON body' }
      };
    }

    const { title, state } = body;

    if (!title || typeof title !== 'string') {
      return {
        status: 400,
        jsonBody: { error: 'Title is required and must be a string' }
      };
    }

    try {
      const id = randomUUID();
      const taskState = state === true ? true : false;

      const result = await pool.query(
        'INSERT INTO tasks (id, title, state) VALUES ($1, $2, $3) RETURNING *',
        [id, title, taskState]
      );

      return {
        status: 201,
        jsonBody: result.rows[0]
      };
    } catch (error) {
      console.error('Database query error:', error.message);
      dbConnected = false;
      return {
        status: 500,
        jsonBody: { error: 'Database error', message: error.message }
      };
    }
  }
});

// PUT /tasks/:id
app.http('updateTask', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'tasks/{id}',
  handler: async (request, context) => {
    const dbError = checkDB();
    if (dbError) return dbError;

    const id = request.params.id;

    let body;
    try {
      body = await request.json();
    } catch (error) {
      return {
        status: 400,
        jsonBody: { error: 'Invalid JSON body' }
      };
    }

    const { title, state } = body;

    try {
      const checkResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        return {
          status: 404,
          jsonBody: { error: 'Task not found' }
        };
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (title !== undefined) {
        if (typeof title !== 'string') {
          return {
            status: 400,
            jsonBody: { error: 'Title must be a string' }
          };
        }
        updates.push(`title = $${paramCount++}`);
        values.push(title);
      }

      if (state !== undefined) {
        if (typeof state !== 'boolean') {
          return {
            status: 400,
            jsonBody: { error: 'State must be a boolean' }
          };
        }
        updates.push(`state = $${paramCount++}`);
        values.push(state);
      }

      if (updates.length === 0) {
        return {
          status: 200,
          jsonBody: checkResult.rows[0]
        };
      }

      values.push(id);
      const query = `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

      const result = await pool.query(query, values);
      return {
        status: 200,
        jsonBody: result.rows[0]
      };
    } catch (error) {
      console.error('Database query error:', error.message);
      dbConnected = false;
      return {
        status: 500,
        jsonBody: { error: 'Database error', message: error.message }
      };
    }
  }
});

// DELETE /tasks/:id
app.http('deleteTask', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'tasks/{id}',
  handler: async (request, context) => {
    const dbError = checkDB();
    if (dbError) return dbError;

    const id = request.params.id;

    try {
      const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        return {
          status: 404,
          jsonBody: { error: 'Task not found' }
        };
      }

      return {
        status: 200,
        jsonBody: result.rows[0]
      };
    } catch (error) {
      console.error('Database query error:', error.message);
      dbConnected = false;
      return {
        status: 500,
        jsonBody: { error: 'Database error', message: error.message }
      };
    }
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received');
  try {
    await pool.end();
  } catch (error) {
    console.error('Error closing pool:', error.message);
  }
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT signal received');
  try {
    await pool.end();
  } catch (error) {
    console.error('Error closing pool:', error.message);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  dbConnected = false;
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  dbConnected = false;
});

