const express = require('express');
const router = express.Router();
const routeController = require('../controllers/routeController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All route routes require authentication
router.use(protect);

// Routes for routes

// GET /api/routes - Get all routes (with pagination and filters)
router.get('/', routeController.getAllRoutes);

// POST /api/routes - Create new route
router.post('/', authorizeRoles('ptgAdmin', 'ptgDispatcher'), routeController.createRoute);

// GET /api/routes/:id - Get single route
router.get('/:id', routeController.getRouteById);

// PUT /api/routes/:id - Update route
router.put('/:id', authorizeRoles('ptgAdmin', 'ptgDispatcher'), routeController.updateRoute);

// DELETE /api/routes/:id - Delete route
router.delete('/:id', authorizeRoles('ptgAdmin'), routeController.deleteRoute);

// POST /api/routes/:routeId/remove-transport-job - Remove transport job from route
router.post('/:routeId/remove-transport-job', authorizeRoles('ptgAdmin', 'ptgDispatcher'), routeController.removeTransportJobFromRoute);

module.exports = router;

