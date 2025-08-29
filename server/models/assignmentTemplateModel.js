const mongoose = require('mongoose');
const { Schema } = mongoose;

const fileSchema = new Schema({
  public_id: { 
    type: String, 
    required: true 
  },
  url: { 
    type: String, 
    required: true 
  },
  fileName: { 
    type: String, 
    required: true 
  },
  fileType: { 
    type: String, 
    required: true 
  },
}, { _id: false });

const assignmentTemplateSchema = new Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: 120
  },
  instructions: { 
    type: String, 
    trim: true,
    maxlength: 5000
  },
  points: { 
    type: Number, 
    default: 100,
    min: 0,
    max: 1000
  },
  courseId: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Group', 
    required: true 
  }],
  creatorId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  attachments: [fileSchema],
  startTime: { 
    type: Date, 
    required: true 
  },
  endTime: { 
    type: Date, 
    required: true 
  },
}, { 
  timestamps: true 
});

// Index for better query performance
assignmentTemplateSchema.index({ courseId: 1, createdAt: -1 });
assignmentTemplateSchema.index({ creatorId: 1, endTime: 1 });

// Virtual for checking if assignment is active
assignmentTemplateSchema.virtual('isActive').get(function() {
  const now = new Date();
  return now >= this.startTime && now <= this.endTime;
});

// Virtual for time remaining in hours
assignmentTemplateSchema.virtual('hoursRemaining').get(function() {
  const now = new Date();
  if (now > this.endTime) return 0;
  return Math.ceil((this.endTime - now) / (1000 * 60 * 60));
});

const AssignmentTemplate = mongoose.models.AssignmentTemplate || mongoose.model('AssignmentTemplate', assignmentTemplateSchema);

module.exports = AssignmentTemplate;