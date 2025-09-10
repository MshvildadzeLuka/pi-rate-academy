const mongoose = require('mongoose');
const { Schema } = mongoose;
const { isURL } = require('validator');
const RRule = require('rrule').RRule;
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (move to env/config file if not already)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Sub-schemas
const recurrenceRuleSchema = new Schema({
  freq: { type: String, enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], required: true },
  interval: { type: Number, min: 1, default: 1 },
  byweekday: [{ type: String, enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] }],
  dtstart: { type: Date, required: true },
  until: Date,
  count: Number
}, { _id: false });

const lectureMaterialSchema = new Schema({
  public_id: { type: String, required: true },
  url: { type: String, required: true, validate: [isURL, 'Invalid URL'] },
  resource_type: { type: String, enum: ['video', 'pdf', 'presentation', 'image'], required: true },
  size: { type: Number, min: 0 },
  duration: { type: Number, min: 0 },
  pages: { type: Number, min: 0 },
  thumbnail: String
}, { _id: false });

const lectureSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 500 },
  startTime: { 
    type: Date, 
    required: true 
  },
  endTime: { 
    type: Date, 
    required: true 
  },
  timezone: { 
    type: String, 
    required: true, 
    default: 'UTC'
  },
  isRecurring: { type: Boolean, default: false },
  recurrenceRule: recurrenceRuleSchema,
  materials: [lectureMaterialSchema],
  assignedGroup: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  instructor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  meetingUrl: { type: String, validate: [isURL, 'Invalid meeting URL'] },
  status: { type: String, enum: ['scheduled', 'ongoing', 'completed', 'cancelled'], default: 'scheduled' },
  recording: lectureMaterialSchema,
  transcript: lectureMaterialSchema,
  metadata: {
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    ipAddress: String,
    userAgent: String
  }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtuals
lectureSchema.virtual('durationMinutes').get(function() {
  return (this.endTime - this.startTime) / (1000 * 60);
});

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

// Statics and queries
lectureSchema.statics.findByGroupAndDateRange = function(groupId, startDate, endDate) {
  return this.find({
    assignedGroup: groupId,
    $or: [
      // Single events within date range
      {
        isRecurring: false,
        startTime: { $gte: startDate },
        endTime: { $lte: endDate }
      },
      // Recurring events that could occur in this range
      {
        isRecurring: true,
        $or: [
          { 'recurrenceRule.until': { $gte: startDate } },
          { 'recurrenceRule.until': { $exists: false } }
        ]
      }
    ]
  }).populate('assignedGroup', 'name');
};

lectureSchema.statics.convertTimezones = async function(lectureIds, newTimezone) {
  return this.updateMany({ _id: { $in: lectureIds } }, { $set: { timezone: newTimezone } });
};

lectureSchema.query.upcoming = function() {
  return this.where('startTime').gt(Date.now());
};

// Pre-validate hook: Custom check for ISO strings before Date casting (safeguard)
lectureSchema.pre('validate', function(next) {
  if (typeof this.startTime === 'string' && !Date.parse(this.startTime)) {
    this.invalidate('startTime', 'Invalid date format for startTime');
  }
  if (typeof this.endTime === 'string' && !Date.parse(this.endTime)) {
    this.invalidate('endTime', 'Invalid date format for endTime');
  }
  next();
});

// Pre-save (advanced with auto-status and conflict check)
lectureSchema.pre('save', async function(next) {
  if (this.endTime <= this.startTime) {
    return next(new Error('End time must be after start time'));
  }
  const conflicting = await this.constructor.findOne({
    assignedGroup: this.assignedGroup,
    startTime: { $lt: this.endTime },
    endTime: { $gt: this.startTime },
    _id: { $ne: this._id }
  });
  if (conflicting) {
    return next(new Error(`Time conflict with lecture "${conflicting.title}"`));
  }
  const now = new Date();
  this.status = this.startTime > now ? 'scheduled' : (this.endTime < now ? 'completed' : 'ongoing');
  next();
});

// Post-remove cleanup
lectureSchema.post('remove', async function(doc) {
  const destroys = doc.materials.map(m => cloudinary.uploader.destroy(m.public_id));
  if (doc.recording) destroys.push(cloudinary.uploader.destroy(doc.recording.public_id));
  await Promise.all(destroys);
});

// Indexes
lectureSchema.index({ assignedGroup: 1, startTime: 1 });
lectureSchema.index({ instructor: 1, startTime: 1 });
lectureSchema.index({ startTime: 1, endTime: 1 });

const Lecture = mongoose.model('Lecture', lectureSchema);

module.exports = Lecture; 
