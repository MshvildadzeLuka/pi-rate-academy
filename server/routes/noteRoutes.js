const express = require('express');
const router = express.Router();
const Note = require('../models/noteModel');
// FIX: Imported `restrictTo` instead of the non-existent `teacher` middleware.
const { protect, restrictTo } = require('../middleware/authMiddleware');
const multer = require('multer');
const CustomCloudinaryStorage = require('../cloudinary.storage');
const cloudinary = require('cloudinary').v2;
const path = require('path');

const storage = CustomCloudinaryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(pdf|docx?|pptx?)$/i)) {
      return cb(new Error('Only document files are allowed!'), false);
    }
    cb(null, true);
  },
});

/**
 * @route   GET /api/notes
 * @desc    Get all notes
 * @access  Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const notes = await Note.find({});
    res.json(notes);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notes' });
  }
});

/**
 * @route   POST /api/notes
 * @desc    Upload a new lecture note
 * @access  Private/Teacher
 */
// FIX: Replaced `teacher` with the correct `restrictTo('Teacher')` function call.
router.post('/', protect, restrictTo('Teacher'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.cloudinary) {
      return res.status(400).json({ success: false, message: 'File upload failed.' });
    }
    const note = await Note.create({
      title: req.body.title || req.file.originalname,
      description: req.body.description || '',
      fileName: req.file.originalname,
      fileUrl: req.file.path,
      publicId: req.file.cloudinary.public_id,
      uploaderId: req.user._id,
    });
    res.status(201).json({ success: true, data: note });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'File processing failed',
      error: process.env.NODE_ENV === 'development' ? err.message : null,
    });
  }
});

/**
 * @route   GET /api/notes/:id/download
 * @desc    Generate a download link for a note
 * @access  Private
 */
router.get('/:id/download', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.publicId) {
      return res.status(404).json({ success: false, message: 'Note not found or has no downloadable file.' });
    }
    const downloadUrl = cloudinary.url(note.publicId, {
      resource_type: 'raw',
      flags: 'attachment',
    });
    res.redirect(downloadUrl);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Download failed' });
  }
});

/**
 * @route   GET /api/notes/:id/preview
 * @desc    Get PDF preview (first 3 pages as images)
 * @access  Private
 */
router.get('/:id/preview', protect, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note || !note.publicId || !note.fileName.toLowerCase().endsWith('.pdf')) {
      return res.status(404).json({ success: false, message: 'PDF preview not available for this note.' });
    }
    const previewUrls = [1, 2, 3].map(pageNumber =>
      cloudinary.url(note.publicId, {
        resource_type: 'image',
        page: pageNumber,
        width: 800,
        crop: 'limit',
        quality: 'auto',
        format: 'jpg',
      })
    );
    res.json({
      success: true,
      data: previewUrls,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Preview generation failed',
      error: process.env.NODE_ENV === 'development' ? err.message : null,
    });
  }
});

module.exports = router;