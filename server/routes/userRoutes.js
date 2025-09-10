
const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
const PointsLedger = require('../models/pointsLedgerModel');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload, createCloudinaryUploader, handleUploadErrors, deleteCloudinaryFile } = require('../middleware/uploadMiddleware');
const asyncHandler = require('express-async-handler');
const ErrorResponse = require('../utils/errorResponse');
const mongoose = require('mongoose'); // <-- Added this import

// Create uploader instances for different routes
const profilePhotoUploader = createCloudinaryUploader('profile-photos');
const admin = restrictTo('Admin');

// Utility function for public teacher data
const getPublicTeacherData = (teacher) => ({
  _id: teacher._id,
  firstName: teacher.firstName,
  lastName: teacher.lastName,
  photoUrl: teacher.photoUrl,
  mobileNumber: teacher.mobileNumber, // NEW
  aboutMe: teacher.aboutMe,
  socials: teacher.socials,
  averageRating: (teacher.averageRating || 0).toFixed(1),
  totalRatings: teacher.totalRatings || 0,
});

// @route   GET /api/users/teachers
// @desc    Get all teachers/admins (Public)
router.get('/teachers', asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: { $in: ['Teacher', 'Admin'] } })
    .select('firstName lastName photoUrl role averageRating totalRatings socials mobileNumber') // NEW FIELDS
    .lean();
  res.json(teachers);
}));

// @route   GET /api/users/teacher/:id
// @desc    Get teacher profile (Public)
router.get('/teacher/:id', asyncHandler(async (req, res) => {
  const teacher = await User.findById(req.params.id)
    .select('firstName lastName photoUrl aboutMe socials role averageRating totalRatings mobileNumber') // NEW FIELD
    .lean();

  if (!teacher || !['Teacher', 'Admin'].includes(teacher.role)) {
    return res.status(404).json({ message: 'Instructor not found' });
  }

  res.json(getPublicTeacherData(teacher));
}));

// @route   GET /api/users/profile
// @desc    Get current user profile (Private)
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('groups').lean();
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json(user);
}));

// @route   GET /api/users/profile/points
// @desc    Get a student's points history (Private/Student or Admin)
// CORRECTED: This route now correctly handles the userId query parameter for admins.
router.get('/profile/points', protect, asyncHandler(async (req, res, next) => {
  let userId;
  // Use the ID from the query parameter if available, otherwise use the logged-in user's ID.
  if (req.query.userId) {
      // Explicitly cast the userId string to a Mongoose ObjectId
      if (!mongoose.Types.ObjectId.isValid(req.query.userId)) {
          return next(new ErrorResponse('Invalid user ID format', 400));
      }
      userId = new mongoose.Types.ObjectId(req.query.userId);
  } else {
      userId = req.user._id;
  }

  if (req.user.role !== 'Admin' && req.user._id.toString() !== userId.toString()) {
      return next(new ErrorResponse('Not authorized to view these points', 403));
  }

  const pointsHistory = await PointsLedger.getStudentWeeklyPoints(userId);
  res.status(200).json({ success: true, data: pointsHistory });
}));

// @route   PUT /api/users/profile
// @desc    Update profile (Private)
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const { firstName, lastName, aboutMe, socials, mobileNumber } = req.body;
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (aboutMe !== undefined) user.aboutMe = aboutMe;
  if (socials) user.socials = socials;
  if (mobileNumber !== undefined) user.mobileNumber = mobileNumber; // NEW FIELD

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
    mobileNumber: updatedUser.mobileNumber // NEW FIELD
  });
}));

// @route   PUT /api/users/profile/photo
// @desc    Upload new profile photo (Private)
// NEW ROUTE
router.put('/profile/photo', protect, upload.single('photo'), profilePhotoUploader, handleUploadErrors, asyncHandler(async (req, res, next) => {
  if (!req.file || !req.file.url) {
    return next(new ErrorResponse('Photo upload failed.', 400));
  }
  
  const user = await User.findById(req.user._id);
  if (!user) return next(new ErrorResponse('User not found', 404));

  // If an old photo exists, delete it from Cloudinary
  if (user.photoPublicId) {
    try {
      await deleteCloudinaryFile(user.photoPublicId);
    } catch (error) {
      console.error('Failed to delete old photo from Cloudinary:', error);
      // We log the error but do not fail the request.
    }
  }

  user.photoUrl = req.file.url;
  user.photoPublicId = req.file.public_id;
  await user.save();

  res.status(200).json({
    success: true,
    photoUrl: user.photoUrl,
    message: 'Profile picture updated successfully'
  });
}));


// @route   PUT /api/users/profile/password
// @desc    Update password (Private)
router.put('/profile/password', protect, asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  
  if (!currentPassword || !newPassword || !confirmPassword) {
    return next(new ErrorResponse('All password fields are required', 400));
  }

  if (newPassword !== confirmPassword) {
    return next(new ErrorResponse('New passwords do not match', 400));
  }

  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(currentPassword))) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  // CORRECTED: Manually set the password to trigger the pre-save hook
  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully' });
}));

// --- ADMIN ONLY ROUTES ---

// @route   GET /api/users
// @desc    Get all users (Admin)
router.get('/', protect, admin, asyncHandler(async (req, res) => {
  const users = await User.find({}).select('-password -refreshToken').populate('groups').lean();
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

  // Delete profile picture from Cloudinary
  if (user.photoPublicId) {
    try {
      await deleteCloudinaryFile(user.photoPublicId);
    } catch (error) {
      console.error('Failed to delete user photo from Cloudinary during deletion:', error);
    }
  }

  await user.deleteOne();
  res.json({ message: 'User removed successfully' });
}));

module.exports = router;
