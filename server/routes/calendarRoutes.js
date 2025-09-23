
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

function ensureTimeFormat(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return '00:00';
    if (!timeStr.includes(':')) {
        timeStr = timeStr.padStart(4, '0');
        timeStr = `${timeStr.slice(0,2)}:${timeStr.slice(2)}`;
    }
    const [hours, minutes] = timeStr.split(':');
    return `${hours.padStart(2, '0')}:${(minutes || '00').padStart(2, '0')}`;
}

// @desc    Get all personal events + lectures for the logged-in user
// @route   GET /api/calendar-events/my-schedule
// @access  Private
router.get('/my-schedule', protect, asyncHandler(async (req, res) => {
    // Correctly structured and commented code
    const { start, end } = req.query;
    const { _id: userId } = req.user;

    const [personalEvents, groupLectures] = await Promise.all([
        CalendarEvent.find({ userId }).lean(),
        Lecture.find({
            assignedGroup: { $in: req.user.groups },
            $or: [
                {
                    isRecurring: false,
                    startTime: { $gte: new Date(start) },
                    endTime: { $lte: new Date(end) }
                },
                { isRecurring: true }
            ]
        }).populate('assignedGroup', 'name').lean()
    ]);

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
    }));

    const allEvents = [...personalEvents, ...formattedLectures];
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

// @desc    Create personal event
// @route   POST /api/calendar-events
// @access  Private
router.post('/', protect, asyncHandler(async (req, res, next) => {
    const { type, isRecurring, dayOfWeek, recurringStartTime, recurringEndTime, startTime, endTime, title } = req.body;
    if (!['busy', 'preferred'].includes(type)) {
        return next(new ErrorResponse('Invalid event type', 400));
    }
    const newEvent = await CalendarEvent.create({
        userId: req.user._id,
        creatorId: req.user._id,
        type,
        title,
        isRecurring,
        dayOfWeek,
        recurringStartTime: isRecurring ? ensureTimeFormat(recurringStartTime) : null,
        recurringEndTime: isRecurring ? ensureTimeFormat(recurringEndTime) : null,
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
        await CalendarEvent.create({
            userId: req.user._id,
            creatorId: req.user._id,
            type: event.type,
            isRecurring: false,
            exceptionDate: dateString,
            title: `DELETED: ${id}`
        });
        res.status(200).json({ success: true, message: 'Instance removed' });
    } else {
        await event.deleteOne();
        res.status(200).json({ success: true, data: {} });
    }
}));

module.exports = router;
