const express = require('express');
const router = express.Router();
const Video = require('../models/videoModel');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Helper function for consistent API responses
const apiResponse = (success, data = null, message = '', error = null) => {
  return {
    success,
    data,
    message,
    error: process.env.NODE_ENV === 'development' ? error : undefined
  };
};

// Get all videos with optional filtering
router.get('/', protect, async (req, res) => {
  try {
    const { type, page = 1, limit = 100 } = req.query; // Increased limit to get all videos
    
    // Build filter object
    const filter = {};
    if (type && ['upload', 'link'].includes(type)) {
      filter.type = type;
    }
    
    // Get all videos without pagination for frontend filtering
    const videos = await Video.find(filter)
      .populate('owner', 'firstName lastName')
      .sort({ createdAt: -1 });
    
    // FIXED: Return videos in the expected format for the frontend
    res.json({
      success: true,
      data: {
        videos
      },
      message: 'Videos retrieved successfully'
    });
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json(apiResponse(false, null, 'Failed to retrieve videos', err.message));
  }
});

// Get single video
router.get('/:id', protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id).populate('owner', 'firstName lastName');
    
    if (!video) {
      return res.status(404).json(apiResponse(false, null, 'Video not found'));
    }
    
    // Increment view count
    video.views += 1;
    await video.save();
    
    res.json(apiResponse(true, video, 'Video retrieved successfully'));
  } catch (err) {
    console.error('Error fetching video:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json(apiResponse(false, null, 'Invalid video ID'));
    }
    
    res.status(500).json(apiResponse(false, null, 'Failed to retrieve video', err.message));
  }
});

// Create new video (Admin only)
router.post('/', protect, restrictTo('Admin'), async (req, res) => {
  try {
    const { title, description, url, type = 'link' } = req.body;
    
    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json(apiResponse(false, null, 'Please provide a valid YouTube URL'));
    }
    
    // Create video
    const video = new Video({
      title,
      description,
      url,
      type,
      owner: req.user._id
    });
    
    const savedVideo = await video.save();
    await savedVideo.populate('owner', 'firstName lastName');
    
    res.status(201).json(apiResponse(true, savedVideo, 'Video created successfully'));
  } catch (err) {
    console.error('Error creating video:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json(apiResponse(false, null, 'Invalid data', err.message));
    }
    
    res.status(500).json(apiResponse(false, null, 'Failed to create video', err.message));
  }
});

// Update video (Admin only)
router.put('/:id', protect, restrictTo('Admin'), async (req, res) => {
  try {
    const { title, description, url, type } = req.body;
    
    // Validate YouTube URL if provided
    if (url) {
      const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
      if (!youtubeRegex.test(url)) {
        return res.status(400).json(apiResponse(false, null, 'Please provide a valid YouTube URL'));
      }
    }
    
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { title, description, url, type },
      { new: true, runValidators: true }
    ).populate('owner', 'firstName lastName');
    
    if (!video) {
      return res.status(404).json(apiResponse(false, null, 'Video not found'));
    }
    
    res.json(apiResponse(true, video, 'Video updated successfully'));
  } catch (err) {
    console.error('Error updating video:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json(apiResponse(false, null, 'Invalid data', err.message));
    }
    
    if (err.name === 'CastError') {
      return res.status(400).json(apiResponse(false, null, 'Invalid video ID'));
    }
    
    res.status(500).json(apiResponse(false, null, 'Failed to update video', err.message));
  }
});

// Delete video (Admin only)
router.delete('/:id', protect, restrictTo('Admin'), async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    
    if (!video) {
      return res.status(404).json(apiResponse(false, null, 'Video not found'));
    }
    
    res.json(apiResponse(true, null, 'Video deleted successfully'));
  } catch (err) {
    console.error('Error deleting video:', err);
    
    if (err.name === 'CastError') {
      return res.status(400).json(apiResponse(false, null, 'Invalid video ID'));
    }
    
    res.status(500).json(apiResponse(false, null, 'Failed to delete video', err.message));
  }
});

module.exports = router;