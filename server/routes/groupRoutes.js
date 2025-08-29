const express = require('express');
const router = express.Router();
const Group = require('../models/groupModel.js');
// **FIX**: Import `restrictTo` to create the admin middleware correctly.
const { protect, restrictTo } = require('../middleware/authMiddleware.js');
const asyncHandler = require('express-async-handler');

// **NEW**: Create the admin middleware using the restrictTo function.
const admin = restrictTo('Admin');

// @route   POST /api/groups
// @desc    Create a new group
// @access  Private/Admin
router.post('/', protect, admin, asyncHandler(async (req, res) => {
  const { name, users, zoomLink } = req.body;
  const group = new Group({ name, users, zoomLink });
  const createdGroup = await group.save();
  res.status(201).json(createdGroup);
}));

// @route   GET /api/groups
// @desc    Get all groups
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const groups = await Group.find({}).populate('users', 'firstName lastName role');
  res.json(groups);
}));

// @route   GET /api/groups/my-groups
// @desc    Get groups for the current user
// @access  Private
router.get('/my-groups', protect, asyncHandler(async (req, res) => {
  const groups = await Group.find({ users: req.user._id });
  res.json(groups);
}));

// @route   PUT /api/groups/:id
// @desc    Update a group
// @access  Private/Admin
router.put('/:id', protect, admin, asyncHandler(async (req, res) => {
  const { name, users, zoomLink } = req.body;
  const group = await Group.findById(req.params.id);

  if (group) {
    group.name = name || group.name;
    group.users = users || group.users;
    group.zoomLink = zoomLink || group.zoomLink;
    const updatedGroup = await group.save();
    res.json(updatedGroup);
  } else {
    res.status(404).json({ message: 'Group not found' });
  }
}));

// @route   DELETE /api/groups/:id
// @desc    Delete a group
// @access  Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (group) {
    await group.deleteOne();
    res.json({ message: 'Group removed' });
  } else {
    res.status(404).json({ message: 'Group not found' });
  }
}));

module.exports = router;
