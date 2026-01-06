const express = require('express');
const router = express.Router();
const { globalSearch, advancedSearch } = require('../controllers/searchController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All search routes require authentication and admin/dispatcher roles
router.use(protect);
router.use(authorizeRoles('ptgAdmin', 'ptgDispatcher'));

// Routes for search

// GET /api/search - Global search across all entities
router.get('/', globalSearch);

// GET /api/search/advanced - Advanced search with filters
router.get('/advanced', advancedSearch);

module.exports = router;
