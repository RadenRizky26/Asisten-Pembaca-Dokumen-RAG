import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { initDb } from './config/database.js';
import authRoutes from './routes/auth.routes.js';

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(env.PORT, async () => {
  console.log(`Server started on port ${env.PORT}`);
  try {
    await initDb();
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
});
