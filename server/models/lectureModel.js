const mongoose = require('mongoose');
const { Schema } = mongoose;
const { isISO8601, isURL } = require('validator');
// const timezone = require('mongoose-timezone'); // <-- REMOVED
const RRule = require('rrule').RRule;
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (should be in env vars)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Recurrence Rule Sub-Schema
const recurrenceRuleSchema = new Schema({
  freq: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'],
    required: true
  },
  interval: {
    type: Number,
    min: 1,
    default: 1
  },
  byweekday: [{
    type: String,
    enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  }],
  dtstart: {
    type: Date,
    required: true
  },
  until: Date,
  count: Number
}, { _id: false });

// Lecture Material Sub-Schema (Cloud Storage)
const lectureMaterialSchema = new Schema({
  public_id: {
    type: String,
    required: true
  },
  url: {
    type: String,
    required: true,
    validate: [isURL, 'Invalid URL']
  },
  resource_type: {
    type: String,
    enum: ['video', 'pdf', 'presentation', 'image'],
    required: true
  },
  size: {
    type: Number,
    min: 0
  },
  duration: {  // For videos
    type: Number,
    min: 0
  },
  pages: {  // For PDFs
    type: Number,
    min: 0
  },
  thumbnail: String
}, { _id: false });

// Main Lecture Schema
const lectureSchema = new Schema({
  title: {
    type: String,
    required: [true, 'Lecture title is required'],
    trim: true,
    maxlength: [120, 'Title cannot exceed 120 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  startTime: {
    type: Date,
    required: [true, 'Start time is required'],
    validate: [isISO8601, 'Invalid ISO 8601 timestamp']
  },
  endTime: {
    type: Date,
    required: [true, 'End time is required'],
    validate: [isISO8601, 'Invalid ISO 8601 timestamp'],
    validate: {
      validator: function(v) {
        return v > this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  timezone: {
    type: String,
    required: true,
    default: 'UTC',
    enum: Intl.supportedValuesOf('timeZone')
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrenceRule: recurrenceRuleSchema,
  materials: [lectureMaterialSchema],
  assignedGroup: {
    type: Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  instructor: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  meetingUrl: {
    type: String,
    validate: [isURL, 'Invalid meeting URL']
  },
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  recording: {
    type: lectureMaterialSchema
  },
  transcript: {
    type: lectureMaterialSchema
  },
  metadata: {
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    ipAddress: String,
    userAgent: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add timezone plugin
// lectureSchema.plugin(timezone, { paths: ['startTime', 'endTime'] }); // <-- REMOVED

// Virtual for duration (in minutes)
lectureSchema.virtual('durationMinutes').get(function() {
  return (this.endTime - this.startTime) / (1000 * 60);
});

// Virtual for recurrence instances
lectureSchema.virtual('occurrences').get(function() {
  if (!this.isRecurring) return [this.startTime];
  
  const rule = new RRule({
    freq: RRule[this.recurrenceRule.freq],
    interval: this.recurrenceRule.interval,
    dtstart: this.recurrenceRule.dtstart,
    until: this.recurrenceRule.until,
    count: this.recurrenceRule.count,
    byweekday: this.recurrenceRule.byweekday?.map(day => RRule[day])
  });

  return rule.all();
});

// Pre-save validation
lectureSchema.pre('save', async function(next) {
  const conflictingLecture = await this.constructor.findOne({
    assignedGroup: this.assignedGroup,
    startTime: { $lt: this.endTime },
    endTime: { $gt: this.startTime },
    _id: { $ne: this._id }
  });

  if (conflictingLecture) {
    throw new Error(`Time conflict with lecture "${conflictingLecture.title}"`);
  }

  const now = new Date();
  if (this.startTime > now) {
    this.status = 'scheduled';
  } else if (this.endTime < now) {
    this.status = 'completed';
  } else {
    this.status = 'ongoing';
  }

  next();
});

// Post-remove cleanup
lectureSchema.post('remove', async function(doc) {
  await Promise.all(doc.materials.map(material => 
    cloudinary.uploader.destroy(material.public_id)
  ));
  
  if (doc.recording) {
    await cloudinary.uploader.destroy(doc.recording.public_id);
  }
});

// Static method for bulk timezone conversion
lectureSchema.statics.convertTimezones = async function(lectureIds, newTimezone) {
  return this.updateMany(
    { _id: { $in: lectureIds } },
    { $set: { timezone: newTimezone } }
  );
};

// Query helper for upcoming lectures
lectureSchema.query.upcoming = function() {
  return this.where('startTime').gt(Date.now());
};

// Indexes
lectureSchema.index({ assignedGroup: 1, startTime: 1 });
lectureSchema.index({ instructor: 1, startTime: 1 });
lectureSchema.index({ startTime: 1, endTime: 1 });

const Lecture = mongoose.model('Lecture', lectureSchema);

module.exports = Lecture;