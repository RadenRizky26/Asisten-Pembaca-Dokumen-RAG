import { Router } from 'express';
import { downloadGenerated } from '../controllers/generated.controller.js';

const router = Router();

router.get('/download/:filename', downloadGenerated);

export default router;