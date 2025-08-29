const mongoose = require('mongoose');
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { isURL } = require('validator');

// Streaming Profile Sub-Schema
const streamProfileSchema = new Schema({
  id: { type: String, default: uuidv4 },
  name: {
    type: String,
    required: true,
    enum: ['360p', '480p', '720p', '1080p', '1440p', '4K']
  },
  bitrate: { type: Number, required: true }, // in kbps
  codec: {
    type: String,
    enum: ['H.264', 'H.265', 'VP9', 'AV1'],
    default: 'H.264'
  },
  url: {
    type: String,
    required: true,
    validate: {
      validator: (url) => isURL(url),
      message: 'Invalid stream URL'
    }
  }
}, { _id: false });

// Subtitle Track Sub-Schema
const subtitleSchema = new Schema({
  id: { type: String, default: uuidv4 },
  language: {
    type: String,
    required: true,
    match: [/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Invalid language code']
  },
  label: { type: String, required: true },
  url: {
    type: String,
    required: true,
    validate: {
      validator: (url) => isURL(url),
      message: 'Invalid subtitle URL'
    }
  },
  format: {
    type: String,
    enum: ['VTT', 'SRT', 'TTML', 'DFXP'],
    default: 'VTT'
  },
  default: { type: Boolean, default: false }
}, { _id: false });

// Video Metadata Sub-Schema
const videoMetadataSchema = new Schema({
  duration: { type: Number, min: 0 }, // in seconds
  dimensions: {
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  aspectRatio: String,
  frameRate: Number,
  size: { type: Number, min: 0 }, // in bytes
  format: String,
  encoder: String,
  chapters: [{
    title: String,
    start: Number,
    end: Number
  }]
}, { _id: false });

// Main Video Schema
const videoSchema = new Schema({
  // Core Fields
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  
  // Streaming
  masterUrl: {
    type: String,
    required: true,
    validate: {
      validator: (url) => isURL(url),
      message: 'Invalid master URL'
    }
  },
  streamingProfiles: [streamProfileSchema],
  subtitles: [subtitleSchema],
  
  // Technical
  metadata: videoMetadataSchema,
  processing: {
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed'],
      default: 'queued'
    },
    logs: [String],
    startedAt: Date,
    completedAt: Date
  },
  
  // Access Control
  visibility: {
    type: String,
    enum: ['public', 'unlisted', 'private'],
    default: 'private'
  },
  allowedDomains: [String],
  
  // Metadata
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploadSession: String
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Video Processing Hook
videoSchema.pre('save', function(next) {
  if (this.isModified('masterUrl') && this.masterUrl) {
    this.processVideo();
  }
  next();
});

// Video Processing Method
videoSchema.methods.processVideo = function() {
  return new Promise((resolve, reject) => {
    this.processing.status = 'processing';
    this.processing.startedAt = new Date();
    this.save();
    
    ffmpeg.ffprobe(this.masterUrl, (err, metadata) => {
      if (err) {
        this.processing.status = 'failed';
        this.processing.logs.push(`FFprobe error: ${err.message}`);
        this.save();
        return reject(err);
      }
      
      // Extract metadata
      this.metadata = {
        duration: metadata.format.duration,
        dimensions: {
          width: metadata.streams[0].width,
          height: metadata.streams[0].height
        },
        aspectRatio: metadata.streams[0].display_aspect_ratio,
        frameRate: metadata.streams[0].r_frame_rate,
        size: metadata.format.size,
        format: metadata.format.format_name,
        encoder: metadata.streams[0].codec_name
      };
      
      // Generate streaming profiles (simplified example)
      this.streamingProfiles = [
        {
          name: '720p',
          bitrate: 2500,
          codec: 'H.264',
          url: this.masterUrl.replace('.mp4', '_720p.m3u8')
        },
        {
          name: '1080p',
          bitrate: 5000,
          codec: 'H.264',
          url: this.masterUrl.replace('.mp4', '_1080p.m3u8')
        }
      ];
      
      this.processing.status = 'ready';
      this.processing.completedAt = new Date();
      this.save();
      resolve(this);
    });
  });
};

// Indexes
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ owner: 1 });
videoSchema.index({ 'processing.status': 1 });

// Model
const Video = mongoose.model('Video', videoSchema);
module.exports = Video;