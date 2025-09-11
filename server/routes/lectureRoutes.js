// Updated lectureRoutes.js - Fix delete method to use deleteOne() instead of remove()
const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middleware/authMiddleware.js');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ErrorResponse = require('../utils/errorResponse.js');

const Lecture = require('../models/lectureModel.js');
const Group = require('../models/groupModel.js');

// @desc    Create a new lecture (single document per lecture)
// @route   POST /api/lectures
// @access  Private/Teacher/Admin
router.post('/', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
    const { title, startTime, endTime, groupId, isRecurring, recurrenceRule, timezone } = req.body;

    if (!title || !startTime || !endTime || !groupId) {
        return next(new ErrorResponse('Missing required fields', 400));
    }

    const group = await Group.findById(groupId);
    if (!group) {
        return next(new ErrorResponse('Group not found', 404));
    }

    if (!Date.parse(startTime) || !Date.parse(endTime)) {
        return next(new ErrorResponse('Invalid date format for startTime or endTime', 400));
    }

    const newLecture = await Lecture.create({
        title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        assignedGroup: groupId,
        instructor: req.user._id,
        isRecurring,
        recurrenceRule,
        timezone: timezone || 'UTC'
    });

    res.status(201).json({ success: true, data: newLecture });
}));

// @desc    Fetch all lectures for a specific group
// @route   GET /api/lectures/group/:groupId
// @access  Private
router.get('/group/:groupId', protect, asyncHandler(async (req, res, next) => {
    const { groupId } = req.params;
    const { start, end } = req.query;
    
    let query = { assignedGroup: groupId };
    
    // Add date filtering if provided
    if (start && end) {
        query.$or = [
            {
                isRecurring: false,
                startTime: { $gte: new Date(start) },
                endTime: { $lte: new Date(end) }
            },
            {
                isRecurring: true,
                $or: [
                    { 'recurrenceRule.until': { $gte: new Date(start) } },
                    { 'recurrenceRule.until': { $exists: false } }
                ]
            }
        ];
    }
    
    const lectures = await Lecture.find(query)
        .populate('assignedGroup', 'name')
        .lean();
        
    res.json({ success: true, data: lectures });
}));

// @desc    Update a lecture
// @route   PUT /api/lectures/:id
// @access  Private/Teacher/Admin
router.put('/:id', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return next(new ErrorResponse('Lecture not found', 404));

    const { title, startTime, endTime, timezone } = req.body;
    lecture.title = title || lecture.title;
    lecture.startTime = startTime ? new Date(startTime) : lecture.startTime;
    lecture.endTime = endTime ? new Date(endTime) : lecture.endTime;
    lecture.timezone = timezone || lecture.timezone;

    await lecture.save();
    res.json({ success: true, data: lecture });
}));

// @desc    Delete a lecture, with support for single or recurring instances
// @route   DELETE /api/lectures/:id
// @access  Private/Teacher/Admin
router.delete('/:id', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { deleteAllRecurring, dateString } = req.body;
    
    const lecture = await Lecture.findById(id);
    if (!lecture) return next(new ErrorResponse('Lecture not found', 404));

    if (lecture.isRecurring && !deleteAllRecurring) {
        // Logic to delete only a single instance by adding an exception
        const exceptionDate = new Date(dateString);
        // Create a new exception event to hide this instance
        const newException = new Lecture({
            title: `DELETED: ${lecture.title}`,
            startTime: exceptionDate,
            endTime: new Date(exceptionDate.getTime() + (lecture.endTime - lecture.startTime)),
            assignedGroup: lecture.assignedGroup,
            instructor: req.user._id,
            isRecurring: false,
            timezone: lecture.timezone
        });
        await newException.save();
    } else {
        // Delete the entire recurring series or a single non-recurring event
        await lecture.deleteOne();
    }

    res.json({ success: true, message: 'Lecture removed' });
}));

module.exports = router;
