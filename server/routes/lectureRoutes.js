const express = require('express');
const Lecture = require('../models/lectureModel.js');
// FIX: Import 'restrictTo' instead of the non-existent 'teacher'
const { protect, restrictTo } = require('../middleware/authMiddleware.js');

const router = express.Router();

// @route   POST /api/lectures
// @desc    Create a new lecture schedule
// @access  Private/Teacher
// FIX: Use the correct restrictTo('Teacher') middleware
router.post('/', protect, restrictTo('Teacher'), async (req, res) => {
  try {
    const { title, startTime, endTime, groupId } = req.body;

    if (!title || !startTime || !endTime || !groupId) {
      return res.status(400).json({ message: 'Missing required fields for lecture creation.' });
    }

    const lecture = new Lecture({
      title,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      assignedGroup: groupId,
      // Assuming the logged-in user is the instructor
      instructor: req.user._id 
    });
    const createdLecture = await lecture.save();
    res.status(201).json(createdLecture);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// @route   GET /api/lectures
// @desc    Fetch all lectures
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const lectures = await Lecture.find({}).populate('assignedGroup', 'name');
    res.json(lectures);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// @route   GET /api/lectures/group/:groupId
// @desc    Fetch all lectures for a specific group
// @access  Private
router.get('/group/:groupId', protect, async (req, res) => {
  try {
    const lectures = await Lecture.find({ assignedGroup: req.params.groupId });
    res.json(lectures);
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// @route   GET /api/lectures/:id
// @desc    Fetch a single lecture by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);
    if (lecture) {
      res.json(lecture);
    } else {
      res.status(404).json({ message: 'Lecture not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// @route   PUT /api/lectures/:id
// @desc    Update a lecture
// @access  Private/Teacher
// FIX: Use the correct restrictTo('Teacher') middleware
router.put('/:id', protect, restrictTo('Teacher'), async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);
    if (lecture) {
      lecture.title = req.body.title || lecture.title;
      lecture.startTime = req.body.startTime ? new Date(req.body.startTime) : lecture.startTime;
      lecture.endTime = req.body.endTime ? new Date(req.body.endTime) : lecture.endTime;
      lecture.assignedGroup = req.body.groupId || lecture.assignedGroup;
      
      const updatedLecture = await lecture.save();
      res.json(updatedLecture);
    } else {
      res.status(404).json({ message: 'Lecture not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// @route   DELETE /api/lectures/:id
// @desc    Delete a lecture
// @access  Private/Teacher
// FIX: Use the correct restrictTo('Teacher') middleware
router.delete('/:id', protect, restrictTo('Teacher'), async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);
    if (lecture) {
      await lecture.deleteOne();
      res.json({ message: 'Lecture removed' });
    } else {
      res.status(404).json({ message: 'Lecture not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

module.exports = router;