import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { initDb } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import chatRoutes from './routes/chat.routes.js';
import filesRoutes from './routes/files.routes.js';
import generatedRoutes from './routes/generated.routes.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';

const app = express();

const corsOptions = {
  origin: env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
  credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(authMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/generated', generatedRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorMiddleware);

if (process.env.VERCEL !== '1') {
  app.listen(env.PORT, async () => {
    console.log(`Server started on port ${env.PORT}`);
    try {
      await initDb();
      console.log('Database initialized');
    } catch (err) {
      console.error('Database initialization failed:', err);
    }
  });
}

export default app;