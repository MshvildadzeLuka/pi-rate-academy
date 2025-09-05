const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  userId: { // The user who will receive the notification
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['quiz', 'assignment', 'system', 'announcement', 'retake'],
    default: 'system'
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  link: { // A URL to navigate to when the notification is clicked
    type: String,
    trim: true
  },
  relatedId: { // ID of the related entity (quiz, assignment, etc.)
    type: Schema.Types.ObjectId
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 0 }
  }
}, { 
  timestamps: true 
});

// Indexes
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1 });

// Static method to create a notification
notificationSchema.statics.createNotification = function(userId, data) {
  return this.create({
    userId,
    ...data
  });
};

// Static method to get unread notifications count for a user
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({ userId, isRead: false });
};

// Static method to mark all notifications as read for a user
notificationSchema.statics.markAllAsRead = function(userId) {
  return this.updateMany(
    { userId, isRead: false },
    { isRead: true }
  );
};

// Static method to get notifications for a user with pagination
notificationSchema.statics.getUserNotifications = function(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec();
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;