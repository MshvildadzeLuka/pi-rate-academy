const mongoose = require('mongoose');
const { Schema } = mongoose;

const calendarEventSchema = new Schema(
  {
    userId: { // The user who owns this personal event
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    groupId: { // Optional for context, links to a course group
      type: Schema.Types.ObjectId,
      ref: 'Group',
      index: true,
    },
    type: {
      type: String,
      enum: ['busy', 'preferred'], // Removed 'lecture'
      required: true,
    },
    title: { // <-- ADDED THIS NEW FIELD
      type: String,
      trim: true,
    },
    // For single events
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    // For recurring
    isRecurring: {
      type: Boolean,
      default: false,
    },
    dayOfWeek: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    recurringStartTime: {
      type: String, // 'HH:MM'
      match: /^([01]\d|2[0-3]):([0-5]\d)$/, // Validate HH:MM format
    },
    recurringEndTime: {
      type: String, // 'HH:MM'
      match: /^([01]\d|2[0-3]):([0-5]\d)$/, // Validate HH:MM format
    },
    exceptionDate: {
      type: String, // YYYY-MM-DD
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

calendarEventSchema.index({ userId: 1, startTime: 1, endTime: 1 });
// Pre-save validation for times
calendarEventSchema.pre('save', function(next) {
  if (this.isRecurring) {
    if (!this.recurringStartTime || !this.recurringEndTime) {
      return next(new Error('Recurring events require start/end times'));
    }
    const startMin = timeToMinutes(this.recurringStartTime);
    const endMin = timeToMinutes(this.recurringEndTime);
    if (startMin >= endMin) {
      return next(new Error('End time must be after start time'));
    }
  } else {
    if (this.startTime >= this.endTime) {
      return next(new Error('End time must be after start time'));
    }
  }
  next();
});

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);

module.exports = CalendarEvent;
