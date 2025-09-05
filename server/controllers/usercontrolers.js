// controllers/userController.js
const User = require('../models/userModel.js');
const asyncHandler = require('express-async-handler');

/**
 * @desc    Get all teachers/admins
 * @route   GET /api/users/teachers
 * @access  Public
 */
const getTeachers = asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: { $in: ['Teacher', 'Admin'] } }).select(
    'firstName lastName photoUrl role averageRating totalRatings'
  ).lean();
  res.json(teachers);
});

/**
 * @desc    Get teacher by ID
 * @route   GET /api/users/teacher/:id
 * @access  Public
 */
const getTeacherById = asyncHandler(async (req, res) => {
  const teacher = await User.findById(req.params.id).select(
    'firstName lastName photoUrl aboutMe socials role averageRating totalRatings'
  ).lean();

  if (!teacher || !['Teacher', 'Admin'].includes(teacher.role)) {
    return res.status(404).json({ message: 'Instructor not found' });
  }

  const publicData = {
    _id: teacher._id,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    photoUrl: teacher.photoUrl,
    aboutMe: teacher.aboutMe,
    socials: teacher.socials,
    averageRating: (teacher.averageRating || 0).toFixed(1),
    totalRatings: teacher.totalRatings || 0,
  };

  res.json(publicData);
});

/**
 * @desc    Get user profile
 * @route   GET /api/users/profile
 * @access  Private
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('-password -refreshToken').lean();
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user);
});

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  user.firstName = req.body.firstName || user.firstName;
  user.lastName = req.body.lastName || user.lastName;
  if (req.body.aboutMe !== undefined) user.aboutMe = req.body.aboutMe;
  if (req.body.socials) user.socials = req.body.socials;

  const updatedUser = await user.save();
  res.json({
    _id: updatedUser._id,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    role: updatedUser.role,
    photoUrl: updatedUser.photoUrl,
    aboutMe: updatedUser.aboutMe,
    socials: updatedUser.socials,
  });
});

/**
 * @desc    Update user password
 * @route   PUT /api/users/profile/password
 * @access  Private
 */
const updateUserPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'All password fields are required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'New passwords do not match' });
  }

  const user = await User.findById(req.user._id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (!(await user.matchPassword(currentPassword))) {
    return res.status(401).json({ message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully' });
});

/**
 * @desc    Get all users (Admin)
 * @route   GET /api/users
 * @access  Private/Admin
 */
const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password -refreshToken').lean();
  res.json(users);
});

/**
 * @desc    Create user (Admin)
 * @route   POST /api/users
 * @access  Private/Admin
 */
const createUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, role } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const user = await User.create({ 
    firstName, 
    lastName, 
    email, 
    password, 
    role 
  });

  res.status(201).json({
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
  });
});

/**
 * @desc    Delete user (Admin)
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (req.user._id.toString() === user._id.toString()) {
    return res.status(400).json({ message: 'Cannot delete your own account' });
  }

  await user.deleteOne();
  res.json({ message: 'User removed successfully' });
});

module.exports = {
  getTeachers,
  getTeacherById,
  getUserProfile,
  updateUserProfile,
  updateUserPassword,
  getAllUsers,
  createUser,
  deleteUser
};