const express = require('express');
const router = express.Router();
const Group = require('../models/groupModel.js');
const User = require('../models/userModel.js');
const { protect, restrictTo } = require('../middleware/authMiddleware.js');
const asyncHandler = require('express-async-handler');

const admin = restrictTo('Admin');

// Helper function to sync user.groups when updating group.users
async function syncUserGroups(groupId, newUserIds, oldUserIds = []) {
  const addedUsers = newUserIds.filter(id => !oldUserIds.includes(id));
  const removedUsers = oldUserIds.filter(id => !newUserIds.includes(id));

  // Add group to added users' groups
  for (const userId of addedUsers) {
    const user = await User.findById(userId);
    if (user && !user.groups.some(g => g.toString() === groupId.toString())) {
      user.groups.push(groupId);
      await user.save();
    }
  }

  // Remove group from removed users' groups
  for (const userId of removedUsers) {
    const user = await User.findById(userId);
    if (user) {
      user.groups = user.groups.filter(g => g.toString() !== groupId.toString());
      await user.save();
    }
  }
}

// Helper function to get the Admin user ID
let adminUserIdCache = null;
async function getAdminUserId() {
    if (adminUserIdCache) return adminUserIdCache;
    const adminUser = await User.findOne({ role: 'Admin' });
    if (adminUser) {
        adminUserIdCache = adminUser._id;
        return adminUserIdCache;
    }
    return null;
}

// @route   POST /api/groups
// @desc    Create a new group and sync user groups. Automatically adds Admin.
// @access  Private/Admin
router.post('/', protect, admin, asyncHandler(async (req, res) => {
  const { name, users = [], zoomLink } = req.body;
  const adminId = await getAdminUserId();
  
  // Ensure the Admin is always in the group's user list
  const groupUsers = [...new Set([...users, adminId])];

  const group = new Group({ name, users: groupUsers, zoomLink });
  const createdGroup = await group.save();

  // Sync users' groups
  await syncUserGroups(createdGroup._id, groupUsers);

  res.status(201).json(createdGroup);
}));

// @route   GET /api/groups
// @desc    Get all groups with populated users
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const groups = await Group.find({})
    .populate('users', 'firstName lastName email role')
    .lean();
  
  res.json(groups);
}));

// @route   GET /api/groups/my-groups
// @desc    Get groups for the current user with populated data. Includes all groups for Admin.
// @access  Private
router.get('/my-groups', protect, asyncHandler(async (req, res) => {
  if (req.user.role === 'Admin') {
    const allGroups = await Group.find({})
      .populate('users', 'firstName lastName email role')
      .lean();
    return res.json(allGroups);
  }
  
  const groups = await Group.find({ users: req.user._id })
    .populate('users', 'firstName lastName email role')
    .lean();
  
  res.json(groups);
}));

// @route   PUT /api/groups/:id
// @desc    Update a group and sync user groups. Automatically adds Admin.
// @access  Private/Admin
router.put('/:id', protect, admin, asyncHandler(async (req, res) => {
  const { name, users, zoomLink } = req.body;
  const group = await Group.findById(req.params.id);

  if (group) {
    const oldUsers = group.users.map(id => id.toString());
    const adminId = await getAdminUserId();

    // Ensure the Admin is always in the group's user list
    const groupUsers = [...new Set([...users, adminId])];

    group.name = name || group.name;
    group.users = groupUsers;
    group.zoomLink = zoomLink || group.zoomLink;
    const updatedGroup = await group.save();

    await syncUserGroups(updatedGroup._id, updatedGroup.users.map(id => id.toString()), oldUsers);

    res.json(updatedGroup);
  } else {
    res.status(404).json({ message: 'Group not found' });
  }
}));

// @route   DELETE /api/groups/:id
// @desc    Delete a group and remove from user groups
// @access  Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (group) {
    const userIds = group.users.map(id => id.toString());

    await syncUserGroups(group._id, [], userIds);

    await group.deleteOne();
    res.json({ message: 'Group removed' });
  } else {
    res.status(404).json({ message: 'Group not found' });
  }
}));

module.exports = router;
