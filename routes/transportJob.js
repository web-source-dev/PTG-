const express = require('express');
const router = express.Router();
const transportJobController = require('../controllers/transportJobController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All transport job routes require authentication
router.use(protect);

// Routes for transport jobs

// GET /api/transport-jobs - Get all transport jobs (with pagination and filters)
router.get('/', transportJobController.getAllTransportJobs);

// POST /api/transport-jobs - Create new transport job
router.post('/', authorizeRoles('ptgAdmin', 'ptgDispatcher'), transportJobController.createTransportJob);

// GET /api/transport-jobs/:id - Get single transport job
router.get('/:id', transportJobController.getTransportJobById);

// PUT /api/transport-jobs/:id - Update transport job
router.put('/:id', authorizeRoles('ptgAdmin', 'ptgDispatcher'), transportJobController.updateTransportJob);


// DELETE /api/transport-jobs/:id - Delete transport job
router.delete('/:id', authorizeRoles('ptgAdmin'), transportJobController.deleteTransportJob);

module.exports = router;

