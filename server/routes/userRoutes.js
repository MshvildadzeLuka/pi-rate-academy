const express = require('express');
const router = express.Router();
const User = require('../models/userModel');
const PointsLedger = require('../models/pointsLedgerModel');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload, createCloudinaryUploader, handleUploadErrors, deleteCloudinaryFile } = require('../middleware/uploadMiddleware');
const asyncHandler = require('express-async-handler');
const ErrorResponse = require('../utils/errorResponse');

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
// @desc    Get current student's points history (Private/Student)
router.get('/profile/points', protect, restrictTo('Student'), asyncHandler(async (req, res) => {
  const pointsHistory = await PointsLedger.getStudentWeeklyPoints(req.user._id);
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

  // CORRECTED: Manually set the password to trigger the pre-save hook
  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated successfully' });
}));

// --- ADMIN ONLY ROUTES ---

// @route   GET /api/users
// @desc    Get all users (Admin)
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
