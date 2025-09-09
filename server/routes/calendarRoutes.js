// Updated calendarRoutes.js to include group lectures in my-schedule endpoint
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/authMiddleware.js');
const asyncHandler = require('express-async-handler');
const ErrorResponse = require('../utils/errorResponse.js');

const CalendarEvent = require('../models/calendarEventModel.js');
const Group = require('../models/groupModel.js');
const Lecture = require('../models/lectureModel.js');
const User = require('../models/userModel.js');

// @desc    Get all personal events + lectures for the logged-in user
// @route   GET /api/calendar-events/my-schedule
// @access  Private
router.get('/my-schedule', protect, asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { start, end } = req.query;
  
  // Get user's groups
  const user = await User.findById(userId).populate('groups');
  const userGroupIds = user.groups ? user.groups.map(group => group._id) : [];

  // Get personal events - fetch all since recurring and few
  const personalEvents = await CalendarEvent.find({ userId }).lean();

  // Format personal events with local time strings
  const formattedPersonal = personalEvents.map(event => ({
    ...event,
    startTimeLocal: event.isRecurring 
      ? ensureTimeFormat(event.recurringStartTime) 
      : new Date(event.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
    endTimeLocal: event.isRecurring 
      ? ensureTimeFormat(event.recurringEndTime) 
      : new Date(event.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  }));

  // Get lectures for user's groups with date range if provided
  let groupLectures = [];
  for (const groupId of userGroupIds) {
    try {
      let lectureQuery = { assignedGroup: groupId };
      if (start && end) {
        lectureQuery.$or = [
          { isRecurring: true },
          {
            startTime: { $gte: new Date(start) },
            endTime: { $lte: new Date(end) }
          }
        ];
      }
      
      const lectures = await Lecture.find(lectureQuery)
        .populate('assignedGroup', 'name')
        .lean();
      
      groupLectures = [...groupLectures, ...lectures];
    } catch (error) {
      console.error(`Failed to fetch lectures for group ${groupId}:`, error);
    }
  }

  // Format lectures to match calendar event structure
  const formattedLectures = groupLectures.map(lecture => ({
    _id: lecture._id,
    title: lecture.title,
    type: 'lecture',
    startTime: lecture.startTime,
    endTime: lecture.endTime,
    groupId: lecture.assignedGroup._id,
    groupName: lecture.assignedGroup.name,
    isRecurring: lecture.isRecurring,
    recurrenceRule: lecture.recurrenceRule,
    startTimeLocal: new Date(lecture.startTime).toLocaleTimeString('en-GB', { 
      hour: '2-digit', minute: '2-digit', hour12: false 
    }),
    endTimeLocal: new Date(lecture.endTime).toLocaleTimeString('en-GB', { 
      hour: '2-digit', minute: '2-digit', hour12: false 
    })
  }));

  const allEvents = [...formattedPersonal, ...formattedLectures];
  res.status(200).json({ success: true, data: allEvents });
}));

// @desc    Get all personal availability events for all members of a specific group
// @route   GET /api/calendar-events/group/:groupId
// @access  Private (Admin/Teacher)
router.get('/group/:groupId', protect, asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return next(new ErrorResponse('Invalid Group ID', 400));
  }

  const group = await Group.findById(groupId).populate('users', '_id');
  if (!group) {
    return next(new ErrorResponse('Group not found', 404));
  }

  const memberIds = group.users.map(user => user._id);
  const memberEvents = await CalendarEvent.find({ userId: { $in: memberIds } }).lean();

  // Format times robustly (fix bug: handle missing ':' or invalid formats)
  const formattedEvents = memberEvents.map(event => {
    const formattedEvent = { ...event };
    if (formattedEvent.recurringStartTime) {
      formattedEvent.recurringStartTime = ensureTimeFormat(formattedEvent.recurringStartTime);
    }
    if (formattedEvent.recurringEndTime) {
      formattedEvent.recurringEndTime = ensureTimeFormat(formattedEvent.recurringEndTime);
    }
    return formattedEvent;
  });

  res.status(200).json({ success: true, data: formattedEvents });
}));

// Helper to fix time formats
function ensureTimeFormat(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return '00:00';
  if (!timeStr.includes(':')) {
    timeStr = timeStr.padStart(4, '0'); // e.g., '900' -> '0900'
    timeStr = `${timeStr.slice(0,2)}:${timeStr.slice(2)}`;
  }
  const [hours, minutes] = timeStr.split(':');
  return `${hours.padStart(2, '0')}:${(minutes || '00').padStart(2, '0')}`;
}

// @desc    Create personal event
// @route   POST /api/calendar-events
// @access  Private
router.post('/', protect, asyncHandler(async (req, res, next) => {
  const { type, isRecurring, dayOfWeek, recurringStartTime, recurringEndTime, startTime, endTime } = req.body;
  
  if (!['busy', 'preferred'].includes(type)) {
    return next(new ErrorResponse('Invalid event type', 400));
  }

  const newEvent = await CalendarEvent.create({
    userId: req.user._id,
    creatorId: req.user._id,
    type,
    isRecurring,
    dayOfWeek,
    recurringStartTime: ensureTimeFormat(recurringStartTime),
    recurringEndTime: ensureTimeFormat(recurringEndTime),
    startTime: startTime ? new Date(startTime) : null,
    endTime: endTime ? new Date(endTime) : null,
  });

  res.status(201).json({ success: true, data: newEvent });
}));

// @desc    Delete personal event
// @route   DELETE /api/calendar-events/:id
// @access  Private
router.delete('/:id', protect, asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { dateString, deleteAllRecurring } = req.body;

  const event = await CalendarEvent.findById(id);
  if (!event) return next(new ErrorResponse('Event not found', 404));
  if (event.userId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized', 403));
  }

  if (event.isRecurring && !deleteAllRecurring) {
    // CORRECTED: Creating an exception event. We remove the non-existent `title` field 
    // to avoid a validation error and use the correct field names.
    await CalendarEvent.create({
      userId: req.user._id,
      creatorId: req.user._id,
      type: event.type,
      isRecurring: false,
      exceptionDate: dateString,
      // We no longer try to set a 'title' field that doesn't exist on the schema.
    });
    res.status(200).json({ success: true, message: 'Instance removed' });
  } else {
    // For single events, or if deleting all recurring instances
    await event.deleteOne();
    res.status(200).json({ success: true, data: {} });
  }
}));
module.exports = router;
