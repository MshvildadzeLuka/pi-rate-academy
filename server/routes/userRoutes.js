const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
// **FIX**: Import `restrictTo` to create the admin middleware correctly.
const { protect, restrictTo } = require('../middleware/authMiddleware');
const asyncHandler = require('express-async-handler');

// **NEW**: Create the admin middleware using the restrictTo function.
const admin = restrictTo('Admin');

// Utility function for public teacher data
const getPublicTeacherData = (teacher) => ({
  _id: teacher._id,
  firstName: teacher.firstName,
  lastName: teacher.lastName,
  photoUrl: teacher.photoUrl,
  aboutMe: teacher.aboutMe,
  socials: teacher.socials,
  averageRating: (teacher.averageRating || 0).toFixed(1),
  totalRatings: teacher.totalRatings || 0,
});

// @route   GET /api/users/teachers
// @desc    Get all teachers/admins (Public)
router.get('/teachers', asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: { $in: ['Teacher', 'Admin'] } })
    .select('firstName lastName photoUrl role averageRating totalRatings')
    .lean();
  res.json(teachers);
}));

// @route   GET /api/users/teacher/:id
// @desc    Get teacher profile (Public)
router.get('/teacher/:id', asyncHandler(async (req, res) => {
  const teacher = await User.findById(req.params.id)
    .select('firstName lastName photoUrl aboutMe socials role averageRating totalRatings')
    .lean();

  if (!teacher || !['Teacher', 'Admin'].includes(teacher.role)) {
    return res.status(404).json({ message: 'Instructor not found' });
  }

  res.json(getPublicTeacherData(teacher));
}));

// @route   GET /api/users/profile
// @desc    Get current user profile (Private)
// In userRoutes.js, update the profile endpoint to include groups
router.get('/profile', protect, asyncHandler(async (req, res) => {
  // Populate groups in the user profile
  const user = await User.findById(req.user._id).populate('groups');
  res.json(user);
}));

// @route   PUT /api/users/profile
// @desc    Update profile (Private)
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { firstName, lastName, aboutMe, socials } = req.body;
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (aboutMe !== undefined) user.aboutMe = aboutMe;
  if (socials) user.socials = socials;

  const updatedUser = await user.save();
  res.json({
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    role: updatedUser.role,
    photoUrl: updatedUser.photoUrl,
    aboutMe: updatedUser.aboutMe,
    socials: updatedUser.socials
  });
}));

// @route   PUT /api/users/profile/password
// @desc    Update password (Private)
router.put('/profile/password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'All password fields are required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'New passwords do not match' });
  }

  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(currentPassword))) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully' });
}));

// --- ADMIN ONLY ROUTES ---

// @route   GET /api/users
// @desc    Get all users (Admin)
// **FIX**: The `admin` middleware is now a valid function.
router.get('/', protect, admin, asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password -refreshToken').lean();
  res.json(users);
}));

// @route   POST /api/users
// @desc    Create user (Admin)
router.post('/', protect, admin, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  if (await User.findOne({ email })) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const user = await User.create({ firstName, lastName, email, password, role });
  res.status(201).json({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role
  });
}));

// @route   DELETE /api/users/:id
// @desc    Delete user (Admin)
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (req.user._id.toString() === user._id.toString()) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }

  await user.deleteOne();
  res.json({ message: 'User removed successfully' });
}));



module.exports = router;
