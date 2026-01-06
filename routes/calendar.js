const express = require('express');
const router = express.Router();
const {
  getAllCalendarEvents,
  getCalendarEventById,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getMyCalendarEvents
} = require('../controllers/calendarController');
const { protect, authorizeRoles } = require('../middleware/auth');

// All calendar routes require authentication
router.use(protect);

// Routes for calendar events

// GET /api/calendar - Get all calendar events (with pagination and filters)
router.get('/', authorizeRoles('ptgAdmin', 'ptgDispatcher'), getAllCalendarEvents);

// GET /api/calendar/my - Get calendar events for current user
router.get('/my', getMyCalendarEvents);

// POST /api/calendar - Create new calendar event
router.post('/', createCalendarEvent);

// GET /api/calendar/:id - Get single calendar event
router.get('/:id', getCalendarEventById);

// PUT /api/calendar/:id - Update calendar event
router.put('/:id', updateCalendarEvent);

// DELETE /api/calendar/:id - Delete calendar event
router.delete('/:id', authorizeRoles('ptgAdmin'), deleteCalendarEvent);

module.exports = router;
