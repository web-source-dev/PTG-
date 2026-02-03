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

// POST /api/routes/:id/stops/:stopId/complete - Complete a specific stop
router.post('/:id/stops/:stopId/complete', authorizeRoles('ptgAdmin', 'ptgDispatcher'), routeController.completeRouteStop);

// POST /api/routes/:id/stops/:stopId/not-delivered - Mark a stop as not delivered
router.post('/:id/stops/:stopId/not-delivered', authorizeRoles('ptgAdmin', 'ptgDispatcher', 'ptgDriver'), routeController.markStopNotDelivered);

// PUT /api/routes/:id/stops/:stopId/manual-status-update - Manually update stop, transport job, and vehicle statuses
router.put('/:id/stops/:stopId/manual-status-update', authorizeRoles('ptgAdmin', 'ptgDispatcher'), routeController.manualUpdateStopStatuses);

module.exports = router;

