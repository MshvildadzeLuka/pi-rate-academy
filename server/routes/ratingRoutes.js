const express = require('express');
const User = require('../models/userModel.js');
const { protect } = require('../middleware/authMiddleware.js');

const router = express.Router();

/**
 * @route   POST /api/ratings/:teacherId
 * @desc    Submit or update a rating and recalculate the teacher's average.
 * @access  Private (Students only)
 */
router.post('/:teacherId', protect, async (req, res) => {
    const { rating } = req.body;
    const studentId = req.user._id;
    const { teacherId } = req.params;

    if (req.user.role !== 'Student') {
        return res.status(403).json({ message: 'Only students can submit ratings.' });
    }
    if (!rating || rating < 0.5 || rating > 5) {
        return res.status(400).json({ message: 'Please provide a valid rating between 0.5 and 5.' });
    }

    try {
        const teacher = await User.findById(teacherId);
        if (!teacher || !['Teacher', 'Admin'].includes(teacher.role)) {
            return res.status(404).json({ message: 'Instructor not found.' });
        }

        // Find if this student has already rated this teacher
        const existingRating = teacher.ratings.find(
            r => r.student.toString() === studentId.toString()
        );

        if (existingRating) {
            // Update existing rating
            existingRating.rating = rating;
        } else {
            // Add new rating
            teacher.ratings.push({ student: studentId, rating });
        }
        
        // Recalculate the aggregate fields
        teacher.totalRatings = teacher.ratings.length;
        if (teacher.totalRatings > 0) {
            const sumOfRatings = teacher.ratings.reduce((acc, item) => acc + item.rating, 0);
            teacher.averageRating = sumOfRatings / teacher.totalRatings;
        } else {
            teacher.averageRating = 0;
        }
        
        // Save the updated teacher document
        await teacher.save();
        res.status(201).json({ message: 'Rating submitted successfully!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
});

module.exports = router;
