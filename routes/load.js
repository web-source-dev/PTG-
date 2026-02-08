const express = require('express');
const router = express.Router();
const loadController = require('../controllers/loadController');
const { protect, optionalAuth, authorizeRoles } = require('../middleware/auth');

// Apply optional auth for API key authentication
router.use(optionalAuth);

// Routes for loads

// GET /api/loads - Get all loads (with pagination and filters)
router.get('/', loadController.getAllLoads);

// POST /api/loads - Create new load
router.post('/', loadController.createLoad);

// GET /api/loads/:id - Get single load
router.get('/:id', loadController.getLoadById);

// PUT /api/loads/:id - Update load
router.put('/:id', loadController.updateLoad);

// DELETE /api/loads/:id - Delete load (soft delete)
router.delete('/:id', loadController.deleteLoad);

module.exports = router;

