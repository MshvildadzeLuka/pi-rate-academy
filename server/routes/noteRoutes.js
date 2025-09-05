// noteRoutes.js (Minor updates for better error handling and ensuring raw file integrity during download)
const express = require('express');
const router = express.Router();
const Note = require('../models/noteModel');
const Group = require('../models/groupModel');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload, createCloudinaryUploader, handleUploadErrors, deleteCloudinaryFile } = require('../middleware/uploadMiddleware');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('express-async-handler');
const axios = require('axios');
const stream = require('stream');

// Create uploader for notes
const uploadToNotes = createCloudinaryUploader('notes');

// @desc    Get all notes for current user (based on their groups)
// @route   GET /api/notes
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  let query = {};
  
  // For students and teachers, only show notes from their groups
  if (req.user.role !== 'Admin') {
    // Get all groups the user is a member of
    const userGroups = await Group.find({ users: req.user._id });
    const userGroupIds = userGroups.map(g => g._id.toString());
    
    query = { groupId: { $in: userGroupIds } };
  }
  
  const notes = await Note.find(query)
    .populate('groupId', 'name')
    .populate('creatorId', 'firstName lastName')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: notes.length,
    data: notes
  });
}));

// @desc    Get notes for a specific group
// @route   GET /api/notes/group/:groupId
// @access  Private
router.get('/group/:groupId', protect, asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;
  
  // Check if user has access to this group (Admins have access to all groups)
  if (req.user.role !== 'Admin') {
    // Check if user is a member of the requested group
    const userGroups = await Group.find({ users: req.user._id });
    const userGroupIds = userGroups.map(g => g._id.toString());
    
    if (!userGroupIds.includes(groupId)) {
      return next(new ErrorResponse('Not authorized to access this group', 403));
    }
  }
  
  const notes = await Note.find({ groupId })
    .populate('creatorId', 'firstName lastName')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: notes.length,
    data: notes
  });
}));

// @desc    Upload a new lecture note
// @route   POST /api/notes
// @access  Private/Teacher/Admin
router.post('/', protect, restrictTo('Teacher', 'Admin'), upload.single('file'), handleUploadErrors, asyncHandler(async (req, res, next) => {
    const { title, description, groupId } = req.body;

    if (!req.file) {
        return next(new ErrorResponse('Please upload a file.', 400));
    }

    // Use Cloudinary for ALL file types
    try {
        const cloudinaryUploader = createCloudinaryUploader('notes');
        await new Promise((resolve, reject) => {
            cloudinaryUploader(req, res, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        
        const fileUrl = req.file.url;
        const publicId = req.file.public_id;
        const resourceType = req.file.resource_type;

        if (!fileUrl || !publicId) {
            return next(new ErrorResponse('File upload to cloud storage failed. Please try again.', 500));
        }
        
        // Check if group exists and user has access
        const group = await Group.findById(groupId);
        if (!group) {
            return next(new ErrorResponse('Group not found', 404));
        }
        if (req.user.role !== 'Admin' && !req.user.groups.map(g => g.toString()).includes(groupId)) {
            return next(new ErrorResponse('Not authorized to add notes to this group', 403));
        }
        
        const note = await Note.create({
            title: title || req.file.originalname,
            description: description || '',
            fileName: req.file.originalname,
            fileUrl: fileUrl,
            publicId: publicId,
            groupId,
            creatorId: req.user._id,
            fileType: req.file.mimetype,
            fileSize: req.file.size
        });
        
        await note.populate('creatorId', 'firstName lastName');
        await note.populate('groupId', 'name');
        
        res.status(201).json({
            success: true,
            data: note
        });

    } catch (error) {
        console.error('Cloudinary Upload Error:', error);
        return next(new ErrorResponse('Failed to upload file to cloud storage.', 500));
    }
}));

// @desc    Delete a note
// @route   DELETE /api/notes/:id
// @access  Private/Teacher/Admin
router.delete('/:id', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
  const note = await Note.findById(req.params.id);
  
  if (!note) {
    return next(new ErrorResponse('Note not found', 404));
  }
  
  // Check if user has permission to delete
  if (req.user.role !== 'Admin' && note.creatorId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to delete this note', 403));
  }
  
  // Delete from Cloudinary with correct resource type
  try {
    const resourceType = note.fileType.startsWith('image/') ? 'image' : note.fileType === 'application/pdf' ? 'raw' : 'raw';
    await deleteCloudinaryFile(note.publicId, resourceType);
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    // Continue with deletion even if Cloudinary fails
  }
  
  await Note.findByIdAndDelete(req.params.id);
  
  res.status(200).json({
    success: true,
    data: {}
  });
}));

// @desc    Download a note file directly
// @route   GET /api/notes/:id/download
// @access  Private
router.get('/:id/download', protect, asyncHandler(async (req, res, next) => {
  const note = await Note.findById(req.params.id);
  
  if (!note) {
    return next(new ErrorResponse('Note not found', 404));
  }
  
  // Check if user has access to this note's group (Admins have access to all groups)
  if (req.user.role !== 'Admin') {
    const userGroups = await Group.find({ users: req.user._id });
    const userGroupIds = userGroups.map(g => g._id.toString());
    
    if (!userGroupIds.includes(note.groupId.toString())) {
      return next(new ErrorResponse('Not authorized to access this note', 403));
    }
  }
  
  try {
    // Fetch the file from Cloudinary
    const response = await axios({
      method: 'GET',
      url: note.fileUrl,
      responseType: 'stream',
      headers: {
        'Accept': '*/*'
      }
    });
    
    // Set appropriate headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(note.fileName)}"`);
    res.setHeader('Content-Type', note.fileType);
    res.setHeader('Content-Length', response.headers['content-length'] || note.fileSize);
    
    // Pipe the file stream to the response
    response.data.pipe(res);
    
    // Handle stream errors
    response.data.on('error', (err) => {
      console.error('Stream error:', err);
      return next(new ErrorResponse('Error downloading file', 500));
    });
    
  } catch (error) {
    console.error('Download error:', error);
    return next(new ErrorResponse('Failed to download file', 500));
  }
}));

module.exports = router;