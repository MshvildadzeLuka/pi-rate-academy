const mongoose = require('mongoose');
const { Schema } = mongoose;
const { isURL } = require('validator');

// Main Video Schema
const videoSchema = new Schema({
  // Core Fields
  title: {
    type: String,
    required: [true, 'Video title is required'],
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  
  // YouTube Link
  url: {
    type: String,
    required: [true, 'YouTube URL is required'],
    validate: {
      validator: function(url) {
        // More flexible YouTube URL validation
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.?be)\/.+$/;
        return isURL(url) && youtubeRegex.test(url);
      },
      message: 'Please provide a valid YouTube URL'
    }
  },
  
  // Video Type (upload for lecture recordings, link for additional resources)
  type: {
    type: String,
    enum: {
      values: ['upload', 'link'],
      message: 'Video type must be either "upload" or "link"'
    },
    default: 'link'
  },
  
  // Metadata
  owner: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  views: {
    type: Number,
    default: 0
  },
  
  // Additional fields for better organization
  tags: [{
    type: String,
    trim: true
  }],
  
  // For grouping videos (optional)
  category: {
    type: String,
    trim: true
  },
  
  // Duration in seconds (optional)
  duration: {
    type: Number,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
videoSchema.index({ title: 'text', description: 'text' });
videoSchema.index({ owner: 1 });
videoSchema.index({ type: 1 });
videoSchema.index({ createdAt: -1 });
videoSchema.index({ tags: 1 });
videoSchema.index({ category: 1 });

// Virtual for getting YouTube video ID
videoSchema.virtual('youtubeId').get(function() {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = this.url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
});

// Virtual for getting thumbnail URL
videoSchema.virtual('thumbnailUrl').get(function() {
  const videoId = this.youtubeId;
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
});

// Virtual for getting embed URL
videoSchema.virtual('embedUrl').get(function() {
  const videoId = this.youtubeId;
  return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
});

// Instance method to increment views
videoSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

// Static method to get videos by owner
videoSchema.statics.findByOwner = function(ownerId) {
  return this.find({ owner: ownerId }).sort({ createdAt: -1 });
};

// Static method to get videos by type
videoSchema.statics.findByType = function(type) {
  return this.find({ type }).sort({ createdAt: -1 });
};

// Model
const Video = mongoose.model('Video', videoSchema);
module.exports = Video;