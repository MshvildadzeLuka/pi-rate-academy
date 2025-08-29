const express = require('express');
const router = express.Router();
const Video = require('../models/videoModel');
const { protect } = require('../middleware/authMiddleware');
const ffmpeg = require('fluent-ffmpeg');
const m3u8 = require('m3u8-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

/**
 * @route   GET /api/videos
 * @desc    Get all videos
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const videos = await Video.find({});
    res.json(videos);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch videos' });
  }
});

// Middleware to set a default video quality
const detectBandwidth = async (req, res, next) => {
  req.bandwidth = { quality: '480p', download: 0 };
  next();
};

/**
 * @route   GET /api/videos/:id/stream
 * @desc    Adaptive HLS/DASH streaming endpoint
 * @access  Private
 */
router.get('/:id/stream', protect, detectBandwidth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const selectedProfile = video.streamingProfiles.find(p => p.name === req.bandwidth.quality) || video.streamingProfiles[0];
    
    if (!selectedProfile) {
        return res.status(404).json({ success: false, message: 'No suitable video profile found.' });
    }

    const sessionId = uuidv4();
    await Video.findByIdAndUpdate(video._id, {
      $push: {
        viewSessions: {
          sessionId,
          user: req.user._id,
          startedAt: new Date(),
          bandwidth: req.bandwidth.download,
          quality: selectedProfile.name,
          ip: req.ip,
        },
      },
    });

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'X-Session-ID': sessionId,
    });

    // In a production environment, you would typically redirect to a CDN URL.
    // Piping the stream directly from another source can be inefficient.
    // For this project, we are proxying the stream.
    ffmpeg(selectedProfile.url)
      .format('hls')
      .on('error', (err) => console.error('Stream error:', err))
      .pipe(res, { end: true });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Streaming failed',
      error: process.env.NODE_ENV === 'development' ? err.message : null,
    });
  }
});

/**
 * @route   GET /api/videos/:id/subtitles
 * @desc    Get available subtitles
 * @access  Private
 */
router.get('/:id/subtitles', protect, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    res.json({
      success: true,
      data: video.subtitles.map(sub => ({
        id: sub.id,
        language: sub.language,
        label: sub.label,
        url: `/api/videos/subtitles/${sub.id}/vtt`
      }))
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch subtitles',
      error: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});

/**
 * @route   GET /api/videos/subtitles/:subId/vtt
 * @desc    Serve subtitle file in WebVTT format
 * @access  Private
 */
router.get('/subtitles/:subId/vtt', protect, async (req, res) => {
  try {
    const video = await Video.findOne({ 'subtitles.id': req.params.subId });
    if (!video) {
      return res.status(404).json({ success: false, message: 'Subtitle not found' });
    }

    const subtitle = video.subtitles.find(s => s.id === req.params.subId);
    
    // In a real application, you would fetch the subtitle file from its URL 
    // and convert it to VTT format if necessary.
    // For now, we will assume it is accessible and just redirect.
    // const vttContent = await convertToVTT(subtitle.url); 
    
    // Placeholder: Redirecting to the subtitle URL.
    // You would replace this with actual file serving or conversion logic.
    if (subtitle && subtitle.url) {
        res.redirect(subtitle.url);
    } else {
        return res.status(404).json({ success: false, message: 'Subtitle file URL not found.' });
    }

  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: 'Subtitle serving failed',
      error: process.env.NODE_ENV === 'development' ? err.message : null
    });
  }
});

module.exports = router;