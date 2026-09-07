import { Router } from 'express';
import { chatStream, getSessions, createSession, updateSession, deleteSession } from '../controllers/chat.controller.js';

const router = Router();

router.post('/stream', chatStream);
router.get('/sessions', getSessions);
router.post('/sessions', createSession);
router.put('/sessions/:id', updateSession);
router.delete('/sessions/:id', deleteSession);

export default router;