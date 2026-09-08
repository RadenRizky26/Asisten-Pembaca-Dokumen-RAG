import { Router } from 'express';
import { uploadFile, getUploadStatus } from '../controllers/upload.controller.js';
import { uploadMiddleware } from '../middleware/upload.middleware.js';

const router = Router();

router.post('/', uploadMiddleware.single('file'), uploadFile);
router.get('/status/:filename', getUploadStatus);

export default router;
