const mongoose = require('mongoose');
const { Schema } = mongoose;

const noteSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      default: '',
      maxlength: 500
    },
    fileName: {
      type: String,
      required: true
    },
    fileUrl: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      required: true
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      required: true
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fileType: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    }
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
noteSchema.index({ groupId: 1, createdAt: -1 });
noteSchema.index({ creatorId: 1, groupId: 1 });

const Note = mongoose.model('Note', noteSchema);

module.exports = Note;