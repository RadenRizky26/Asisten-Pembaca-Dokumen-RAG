import { Router } from 'express';
import { listFiles, deleteFile, downloadFile, previewFile } from '../controllers/files.controller.js';

const router = Router();

router.get('/', listFiles);
router.delete('/:filename', deleteFile);
router.get('/download/:filename', downloadFile);
router.get('/preview/:filename', previewFile);

export default router;