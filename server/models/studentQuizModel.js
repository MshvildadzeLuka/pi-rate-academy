const mongoose = require('mongoose');
const { Schema } = mongoose;

const answerSchema = new Schema({
  question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
  selectedOption: Number,
  textAnswer: String,
  isCorrect: Boolean
}, { _id: false });

const studentQuizSchema = new Schema({
  templateId: { type: Schema.Types.ObjectId, ref: 'QuizTemplate', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  courseId: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
  status: {
    type: String,
    enum: ['upcoming', 'active', 'completed', 'graded', 'past-due', 'in-progress'],
    default: 'upcoming',
    index: true,
  },
  startTime: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  submission: {
    answers: [answerSchema],
    submittedAt: Date,
    isLate: { type: Boolean, default: false }
  },
  grade: {
    score: { type: Number, min: 0 },
    feedback: { type: String, trim: true, maxlength: 5000 },
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    gradedAt: Date
  },
  lastAttemptId: { type: Schema.Types.ObjectId, ref: 'QuizAttempt' },
  viewedByStudent: { type: Boolean, default: false },
  templatePoints: { type: Number, required: true },
  templateTitle: { type: String, required: true }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

studentQuizSchema.index({ studentId: 1, status: 1 });
studentQuizSchema.index({ courseId: 1, dueDate: 1 });

studentQuizSchema.pre('validate', async function(next) {
  // This hook automatically fixes old data that is missing title and points.
  if (this.isNew || !this.templateTitle || !this.templatePoints) {
    const template = await mongoose.model('QuizTemplate').findById(this.templateId);
    if (template) {
      this.templateTitle = template.title;
      this.templatePoints = template.points;
    }
  }
  // It also ensures the status is always correct before any save operation.
  this.status = this.calculateStatus();
  next();
});

studentQuizSchema.methods.calculateStatus = function() {
  const now = new Date();
  // If the user submitted, it is immediately graded/completed
  if (this.grade && typeof this.grade.score === 'number') return 'graded';
  if (this.submission && this.submission.submittedAt) return 'completed';
  
  // ✅ FIX: If the time ran out, it MUST become past-due, even if they were in-progress
  if (now > this.dueDate) return 'past-due'; 
  
  if (this.status === 'in-progress') return 'in-progress';
  if (now >= this.startTime && now <= this.dueDate) return 'active';
  return 'upcoming';
};

studentQuizSchema.methods.canStart = function() {
  // This function was missing, causing a TypeError.
  const currentStatus = this.calculateStatus();
  return currentStatus === 'active';
};

studentQuizSchema.statics.updateAllStatuses = async function() {
  const quizzesToUpdate = await this.find({
    // ✅ FIX: Include 'in-progress' so expired quizzes are caught by the cron job
    status: { $in: ['upcoming', 'active', 'in-progress', 'past-due'] } 
  });
  // The .save() call on each quiz will trigger the 'pre-validate' hook above.
  await Promise.all(quizzesToUpdate.map(quiz => quiz.save()));
};

studentQuizSchema.statics.createStudentQuizzes = async function(template, studentIds, courseId, session = null) {
  const studentQuizzes = studentIds.map(studentId => ({
    templateId: template._id,
    studentId,
    courseId,
    startTime: template.startTime,
    dueDate: template.endTime,
    templatePoints: template.points,
    templateTitle: template.title,
    status: 'upcoming'
  }));
  const options = session ? { session } : {};
  return this.insertMany(studentQuizzes, options);
};

const StudentQuiz = mongoose.model('StudentQuiz', studentQuizSchema);

module.exports = StudentQuiz;
