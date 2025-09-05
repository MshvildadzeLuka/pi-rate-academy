const mongoose = require('mongoose');
const { Schema } = mongoose;

const studentFileSchema = new Schema({
  public_id: { type: String, required: true },
  url: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true },
}, { _id: false });

const studentAssignmentSchema = new Schema({
  templateId: { type: Schema.Types.ObjectId, ref: 'AssignmentTemplate', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  status: {
    type: String,
    enum: ['upcoming', 'completed', 'graded', 'past-due'],
    default: 'upcoming',
    index: true,
  },
  dueDate: { type: Date, required: true },
  submission: {
    files: [studentFileSchema],
    submittedAt: { type: Date },
    isLate: { type: Boolean, default: false },
    ipAddress: String,
    userAgent: String
  },
  grade: {
    score: { type: Number, min: 0 },
    feedback: { type: String, trim: true, maxlength: 5000 },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    gradedAt: { type: Date },
    rubricScores: [{
      criteriaId: String,
      score: Number,
      comments: String
    }]
  },
  seenByTeacher: { type: Boolean, default: false },
  submissionHistory: [{
    files: [studentFileSchema],
    submittedAt: Date,
    version: Number,
    comments: String
  }],
  peerReviews: [{
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    createdAt: { type: Date, default: Date.now }
  }],
  viewedByStudent: { type: Boolean, default: false },
  firstViewedAt: Date,
  statusLastUpdated: { type: Date, default: Date.now },
  templatePoints: { type: Number, required: true },
  templateTitle: { type: String, required: true }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
studentAssignmentSchema.index({ studentId: 1, status: 1 });
studentAssignmentSchema.index({ courseId: 1, dueDate: 1 });
studentAssignmentSchema.index({ templateId: 1, status: 1 });
studentAssignmentSchema.index({ studentId: 1, courseId: 1 });
studentAssignmentSchema.index({ dueDate: 1 });


// [REWRITTEN] This single pre-validate hook now handles all data preparation before validation runs.
studentAssignmentSchema.pre('validate', async function(next) {
  // Step 1: Back-fill required fields for older documents if they are missing.
  // This runs before validation, preventing the error.
  if (!this.isNew && (!this.templateTitle || this.templatePoints == null)) {
    try {
      // We fetch the associated template to get the title and points.
      await this.populate({ path: 'templateId', select: 'title points' });
      
      if (this.templateId) {
        this.templateTitle = this.templateId.title;
        this.templatePoints = this.templateId.points;
      } else {
        // If the template was deleted, we can't proceed with saving.
        return next(new Error('Could not find the original assignment template to validate.'));
      }
    } catch (error) {
      console.error('Error back-filling required fields on StudentAssignment:', error);
      return next(error);
    }
  }

  // Step 2: Always calculate the correct status before saving.
  this.status = this.calculateStatus();
  
  // Step 3: Update the 'firstViewedAt' timestamp if necessary.
  if (this.isModified('viewedByStudent') && this.viewedByStudent && !this.firstViewedAt) {
    this.firstViewedAt = new Date();
  }

  next();
});


// Virtual for calculated grade percentage
studentAssignmentSchema.virtual('gradePercentage').get(function() {
  if (this.grade.score === null || this.grade.score === undefined || !this.templatePoints) return null;
  return (this.grade.score / this.templatePoints) * 100;
});

studentAssignmentSchema.methods.calculateStatus = function() {
  const now = new Date();
  if (this.grade && this.grade.score !== null && this.grade.score !== undefined) {
    return 'graded';
  }
  if (this.submission && this.submission.submittedAt) {
    return 'completed';
  }
  if (now > this.dueDate) {
    return 'past-due';
  }
  return 'upcoming';
};

studentAssignmentSchema.methods.canSubmit = function() {
  const now = new Date();
  return this.calculateStatus() === 'upcoming' && now <= this.dueDate;
};

studentAssignmentSchema.methods.canUnsubmit = function() {
  const now = new Date();
  return this.calculateStatus() === 'completed' && now <= this.dueDate;
};

studentAssignmentSchema.methods.updateStatusIfNeeded = function() {
  const newStatus = this.calculateStatus();
  if (newStatus !== this.status) {
    this.status = newStatus;
    this.statusLastUpdated = new Date();
    return true;
  }
  return false;
};

const StudentAssignment = mongoose.models.StudentAssignment || mongoose.model('StudentAssignment', studentAssignmentSchema);

StudentAssignment.updateAllStatuses = async function() {
  const now = new Date();
  // Find assignments that might need a status update
  const assignmentsToUpdate = await this.find({
    status: { $in: ['upcoming', 'past-due'] },
    'grade.score': { $exists: false }
  });

  let statusUpdatedCount = 0;
  for (const assignment of assignmentsToUpdate) {
    const oldStatus = assignment.status;
    // Calling .save() will trigger our new pre('validate') hook, which automatically
    // back-fills missing data and recalculates the correct status.
    await assignment.save();
    if (assignment.status !== oldStatus) {
        statusUpdatedCount++;
    }
  }
  return { statusUpdated: statusUpdatedCount };
};

StudentAssignment.createStudentAssignments = async function(template, studentIds, courseId, session = null) {
  const studentAssignments = studentIds.map(studentId => ({
    templateId: template._id,
    studentId: studentId,
    courseId: courseId,
    dueDate: template.endTime,
    templatePoints: template.points,
    templateTitle: template.title,
    status: 'upcoming'
  }));

  const options = session ? { session } : {};
  return await this.insertMany(studentAssignments, options);
};

StudentAssignment.updateTemplateData = async function(templateId, updateData, session = null) {
  const options = session ? { session } : {};
  return await this.updateMany(
    { templateId: templateId },
    { $set: updateData },
    options
  );
};

module.exports = StudentAssignment;
