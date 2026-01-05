const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { protect } = require('../middleware/auth');

// All upload routes require authentication
router.use(protect);

// POST /api/upload/image - Upload single image from base64
router.post('/image', uploadController.uploadImage);

// POST /api/upload/images - Upload multiple images from base64 array
router.post('/images', uploadController.uploadImages);

// DELETE /api/upload/image/:publicId - Delete image from Cloudinary
router.delete('/image/:publicId', uploadController.deleteImage);

module.exports = router;

