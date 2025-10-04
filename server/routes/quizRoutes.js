const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const QuizTemplate = require('../models/quizTemplateModel');
const StudentQuiz = require('../models/studentQuizModel');
const QuizAttempt = require('../models/quizAttemptModel');
const Question = require('../models/questionModel');
const PointsLedger = require('../models/pointsLedgerModel');
const Group = require('../models/groupModel');
const User = require('../models/userModel');
const RetakeRequest = require('../models/retakeRequestModel');
const { protect, restrictTo, checkOwnership } = require('../middleware/authMiddleware');
const asyncHandler = require('express-async-handler');
const ErrorResponse = require('../utils/errorResponse');

// ✅ FIX: This line has been corrected to import `createCloudinaryUploader`
// instead of the old `uploadToCloudinary` function.
const { upload, createCloudinaryUploader, handleUploadErrors } = require('../middleware/uploadMiddleware');

// Middleware to update quiz statuses
const updateQuizStatuses = asyncHandler(async (req, res, next) => {
  try {
    await StudentQuiz.updateAllStatuses();
  } catch (error) {
    console.error('Error updating quiz statuses:', error);
  }
  next(); // Always call next, even if the updater fails, so the app doesn't hang.
});

// server/routes/quizRoutes.js

// ✅ Ensure this route exists and is correct in your file.
// @route   GET /api/quizzes/templates/:templateId/analytics
// @desc    Get analytics for a specific quiz template
// @access  Private
router.get('/templates/:templateId/analytics', protect, asyncHandler(async (req, res, next) => {
    const { templateId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(templateId)) {
        return next(new ErrorResponse('Invalid template ID', 400));
    }

    const template = await QuizTemplate.findById(templateId).populate('courseId');
    if (!template) {
        return next(new ErrorResponse('Quiz template not found', 404));
    }

    // Robustness: Authorize user access
    const userGroupIds = req.user.groups.map(g => g.toString());
    const templateGroupIds = template.courseId.map(c => c._id.toString());
    const hasAccess = userGroupIds.some(userGroupId => templateGroupIds.includes(userGroupId));
    
    if (req.user.role !== 'Admin' && !hasAccess) {
        return next(new ErrorResponse('Not authorized to view analytics for this quiz', 403));
    }

    const studentQuizzes = await StudentQuiz.find({ templateId });

    if (studentQuizzes.length === 0) {
        return res.json({ success: true, data: { classAveragePercentage: 0 } });
    }

    const totalPossiblePoints = studentQuizzes[0].templatePoints;
    let totalScores = 0;
    let submissionCount = 0;

    studentQuizzes.forEach(sq => {
        if (sq.grade && typeof sq.grade.score === 'number') {
            totalScores += sq.grade.score;
            submissionCount++;
        }
    });

    const maxTotalScore = totalPossiblePoints * submissionCount;
    const classAveragePercentage = maxTotalScore > 0 ? (totalScores / maxTotalScore) * 100 : 0;

    res.json({ success: true, data: { classAveragePercentage: classAveragePercentage.toFixed(0) } });
}));
// @route   POST /api/quizzes
// @desc    Create a new quiz
// @access  Private/Teacher,Admin
router.post('/', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
  const {
    title, description, groupId, startTime, endTime, questions, timeLimit
  } = req.body;

  if (!title || !groupId || !startTime || !endTime || !questions || !questions.length) {
    return next(new ErrorResponse('Required fields are missing.', 400));
  }
  
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const questionPayload = questions.map(q => ({ ...q, createdBy: req.user._id }));
    const createdQuestions = await Question.insertMany(questionPayload, { session });
    
    // ✅ This calculation is now the single source of truth.
    const totalPoints = createdQuestions.reduce((sum, q) => sum + (q.points || 0), 0);

    const templateData = {
      title, description, courseId: [groupId], creatorId: req.user._id,
      startTime: new Date(startTime), endTime: new Date(endTime), questions: createdQuestions.map(q => q._id),
      points: totalPoints,
      timeLimit
    };
    
    const [newTemplate] = await QuizTemplate.create([templateData], { session });
    
    const group = await Group.findById(groupId).populate('users').session(session);
    if (!group) throw new ErrorResponse('Group not found', 404);
    
    const studentIds = group.users.filter(u => u.role === 'Student').map(u => u._id);
    if (studentIds.length > 0) {
      await StudentQuiz.createStudentQuizzes(newTemplate, studentIds, groupId, session);
    }

    await session.commitTransaction();
    const populatedTemplate = await QuizTemplate.findById(newTemplate._id).populate('questions');
    res.status(201).json({ success: true, data: populatedTemplate });
  } catch (error) {
    await session.abortTransaction();
    return next(error);
  } finally {
    session.endSession();
  }
}));
// server/routes/quizRoutes.js

// @route   GET /api/quizzes/teacher/:groupId
// @desc    Get all quizzes for a teacher/admin (Per-Student View)
// @access  Private/Teacher,Admin
router.get('/teacher/:groupId', protect, restrictTo('Teacher', 'Admin'), updateQuizStatuses, asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { status } = req.query;
  
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ success: false, message: 'Invalid group ID' });
  }
  
  const templates = await QuizTemplate.find({ courseId: { $in: [groupId] } });
  const templateIds = templates.map(t => t._id);
  
  if (templateIds.length === 0) {
    return res.json({ success: true, data: [] });
  }
  
  let query = { templateId: { $in: templateIds } };
  
  // ✅ FIX: This now correctly handles the "completed,graded" string from the frontend.
  // It splits the string by the comma and uses the $in operator to find documents
  // that match ANY of the statuses in the resulting array.
  if (status && status !== 'all') {
    query.status = { $in: status.split(',') };
  }
  
  const studentQuizzes = await StudentQuiz.find(query)
    .populate('studentId', 'firstName lastName email')
    .populate({
      path: 'templateId',
      select: 'title description points'
    })
    .sort({ dueDate: -1 });
    
  res.json({
    success: true,
    data: studentQuizzes
  });
}));

// @route   GET /api/quizzes/student
// @desc    Get all quizzes for a student
router.get('/student', protect, restrictTo('Student'), updateQuizStatuses, asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = { studentId: req.user._id };

  // ✅ FIX: This now handles comma-separated statuses (e.g., "completed,graded")
  if (status && status !== 'all') {
    query.status = { $in: status.split(',') };
  }

  const quizzes = await StudentQuiz.find(query)
    .populate({
      path: 'templateId',
      select: 'title description points questions startTime endTime timeLimit requiresPassword',
      populate: { path: 'questions' }
    })
    .sort({ dueDate: -1 });

  res.status(200).json({ success: true, data: quizzes });
}));

// server/routes/quizRoutes.js

// @route   GET /api/quizzes/:id
// @desc    Get a single StudentQuiz by its ID (Unified View)
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid quiz ID', 400));
  }
  
  // ✅ This query is now perfected to fetch everything the detail view needs.
  const studentQuiz = await StudentQuiz.findById(req.params.id)
    .populate({
      path: 'templateId',
      select: 'title description points timeLimit questions',
      populate: {
        path: 'questions',
        model: 'Question'
      }
    })
    .populate('studentId', 'firstName lastName email');
  
  if (!studentQuiz) {
    return next(new ErrorResponse('Quiz not found', 404));
  }
  
  // Authorization Check
  const isOwner = studentQuiz.studentId._id.toString() === req.user._id.toString();
  const userGroupIds = (req.user.groups || []).map(g => g._id.toString());
  const hasAccess = userGroupIds.includes(studentQuiz.courseId.toString());
  
  if (!isOwner && req.user.role !== 'Admin' && !hasAccess) {
      return next(new ErrorResponse('Not authorized to access this quiz', 403));
  }
  
  res.json({
    success: true,
    data: studentQuiz 
  });
}));

// @route   PUT /api/quizzes/:id
// @desc    Update a quiz template
// @access  Private/Teacher,Admin
router.put('/:id', protect, restrictTo('Teacher', 'Admin'), checkOwnership('quizTemplate', 'creatorId'), asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid quiz ID format', 400));
  }
  
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { questions, ...updateData } = req.body;
    const template = await QuizTemplate.findById(req.params.id).session(session);
    if (!template) {
      throw new ErrorResponse('Quiz template not found', 404);
    }

    // Assign basic fields from the request body
    Object.assign(template, updateData);

    // Explicitly handle fields that need transformation
    if (updateData.groupId) {
        template.courseId = [updateData.groupId];
    }
    if (updateData.startTime) {
        template.startTime = new Date(updateData.startTime);
    }
    if (updateData.endTime) {
        template.endTime = new Date(updateData.endTime);
    }

    // If new questions are provided, replace the old ones
    if (questions && Array.isArray(questions)) {
      await Question.deleteMany({ _id: { $in: template.questions } }, { session });
      const newQuestions = await Question.insertMany(
        questions.map(q => ({ ...q, createdBy: req.user._id })),
        { session }
      );
      template.questions = newQuestions.map(q => q._id);
    }
    
    // Recalculate total points based on the final set of questions
    const questionDocs = await Question.find({ '_id': { $in: template.questions } }).session(session);
    template.points = questionDocs.reduce((sum, q) => sum + (q.points || 0), 0);
    
    const updatedTemplate = await template.save({ session });

    // Propagate changes to all assigned student quizzes
    await StudentQuiz.updateMany(
      { templateId: updatedTemplate._id },
      { $set: { 
          templatePoints: updatedTemplate.points, 
          dueDate: updatedTemplate.endTime,
          templateTitle: updatedTemplate.title,
          startTime: updatedTemplate.startTime
        } 
      },
      { session }
    );
    
    await session.commitTransaction();

    // Populate the response with the latest data for the frontend
    await updatedTemplate.populate([
        { path: 'questions' },
        { path: 'courseId', select: 'name' }
    ]);
    
    res.json({ success: true, data: updatedTemplate });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
}));

// @route   DELETE /api/quizzes/:id
// @desc    Delete a quiz template and associated student quizzes
// @access  Private/Teacher,Admin
router.delete('/:id', protect, restrictTo('Teacher', 'Admin'), checkOwnership('quizTemplate', 'creatorId'), asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid quiz ID', 400));
  }
  
  const template = await QuizTemplate.findById(req.params.id);
  
  if (!template) {
    return next(new ErrorResponse('Quiz template not found', 404));
  }
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Delete associated questions
    await Question.deleteMany({ _id: { $in: template.questions } });
    
    // Delete associated student quizzes
    await StudentQuiz.deleteMany({ templateId: template._id });
    
    // Delete the template
    await QuizTemplate.findByIdAndDelete(req.params.id);
    
    await session.commitTransaction();
    
    res.json({
      success: true,
      message: 'Quiz and all associated student quizzes deleted successfully'
    });
  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
}));

// @route   POST /api/quizzes/:id/start
// @desc    Start a quiz attempt (Per-Student Model)
// @access  Private
router.post('/:id/start', protect, asyncHandler(async (req, res, next) => {
  const studentQuiz = await StudentQuiz.findById(req.params.id).populate('templateId');
  if (!studentQuiz) return next(new ErrorResponse('Quiz not found', 404));
  
  if (studentQuiz.studentId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to take this quiz', 403));
  }
  
  if (!studentQuiz.canStart()) {
    return next(new ErrorResponse('Cannot start quiz at this time.', 400));
  }
  
  const existingAttempts = await QuizAttempt.countDocuments({ studentQuiz: studentQuiz._id });
  if (existingAttempts >= 1) { // Max attempts is always 1
    return next(new ErrorResponse('You have already attempted this quiz.', 400));
  }

  const attempt = new QuizAttempt({
    studentQuiz: studentQuiz._id,
    student: req.user._id,
    template: studentQuiz.templateId._id,
    attemptNumber: existingAttempts + 1,
  });
  await attempt.save();
  
  studentQuiz.status = 'in-progress';
  await studentQuiz.save();
  
  res.status(201).json({ success: true, data: attempt });
}));

// @route   POST /api/quizzes/attempt/:attemptId/answer
// @desc    Submit an answer for a question
// @access  Private
router.post('/attempt/:attemptId/answer', protect, asyncHandler(async (req, res, next) => {
  const { attemptId } = req.params;
  const { questionId, selectedOptionIndex } = req.body;
  
  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    return next(new ErrorResponse('Invalid attempt ID', 400));
  }
  
  const attempt = await QuizAttempt.findById(attemptId)
    .populate('template');
  
  if (!attempt) {
    return next(new ErrorResponse('Attempt not found', 404));
  }
  
  // Check if attempt belongs to user
  if (attempt.student.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to access this attempt', 403));
  }
  
  // Check if attempt is still in progress
  if (attempt.status !== 'in-progress') {
    return next(new ErrorResponse('Attempt is already submitted', 400));
  }
  
  // Find the question
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new ErrorResponse('Question not found', 404));
  }
  
  // Check if answer already exists
  const existingAnswerIndex = attempt.answers.findIndex(
    a => a.question && a.question.toString() === questionId
  );
  
  // Calculate points
  const isCorrect = question.options[selectedOptionIndex] && question.options[selectedOptionIndex].isCorrect;
  const pointsAwarded = isCorrect ? question.points : 0;
  
  if (existingAnswerIndex !== -1) {
    // Update existing answer
    attempt.answers[existingAnswerIndex] = {
      question: questionId,
      selectedOptionIndex,
      pointsAwarded,
      answeredAt: new Date()
    };
  } else {
    // Add new answer
    attempt.answers.push({
      question: questionId,
      selectedOptionIndex,
      pointsAwarded,
      answeredAt: new Date()
    });
  }
  
  const updatedAttempt = await attempt.save();
  
  res.json({
    success: true,
    data: updatedAttempt
  });
}));

// server/routes/quizRoutes.js

// @route   POST /api/quizzes/attempt/:attemptId/submit
// @desc    Submit a quiz attempt (Per-Student Model)
// @access  Private
router.post('/attempt/:attemptId/submit', protect, asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.attemptId)) {
    return next(new ErrorResponse('Invalid attempt ID', 400));
  }

  // ✅ FIX: Added retry logic for handling write conflicts
  const MAX_RETRIES = 3;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const attempt = await QuizAttempt.findById(req.params.attemptId).session(session);

      if (!attempt) throw new ErrorResponse('Attempt not found', 404);
      if (attempt.student.toString() !== req.user._id.toString()) throw new ErrorResponse('Not authorized', 403);
      if (attempt.status !== 'in-progress') throw new ErrorResponse('Attempt is already submitted', 400);

      attempt.status = 'submitted';
      attempt.endTime = new Date();
      attempt.timeTaken = (attempt.endTime - attempt.startTime) / 1000;
      
      await attempt.autoGrade(); // This calculates and sets attempt.score
      
      const studentQuiz = await StudentQuiz.findById(attempt.studentQuiz).session(session);
      if (!studentQuiz) throw new ErrorResponse('Associated student quiz not found', 404);

      studentQuiz.submission = {
        answers: attempt.answers,
        submittedAt: attempt.endTime,
        isLate: attempt.endTime > studentQuiz.dueDate
      };
      studentQuiz.grade = { score: attempt.score };
      studentQuiz.lastAttemptId = attempt._id;
      // The pre-save hook will set the status to 'graded' or 'completed'

      await attempt.save({ session });
      await studentQuiz.save({ session });

      await PointsLedger.findOneAndUpdate(
        { sourceId: attempt._id, sourceType: 'quiz' },
        {
          studentId: attempt.student,
          courseId: studentQuiz.courseId,
          pointsEarned: attempt.score,
          pointsPossible: studentQuiz.templatePoints,
          awardedAt: new Date()
        },
        { upsert: true, new: true, session }
      );
      
      await session.commitTransaction();
      session.endSession();
      
      return res.json({ success: true, data: attempt }); // Success, exit the loop

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      // Check if the error is a write conflict and if we can still retry
      if (error.code === 112 && i < MAX_RETRIES - 1) {
        console.log(`Write conflict detected. Retrying submission (attempt ${i + 2})...`);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100)); // Wait a bit before retrying
        continue; // Go to the next loop iteration
      }
      
      // If it's not a write conflict or we've run out of retries, pass the error on
      return next(error);
    }
  }
}));

// @route   GET /api/quizzes/attempt/:attemptId/results
// @desc    Get quiz results (Per-Student Model)
// @access  Private
router.get('/attempt/:attemptId/results', protect, asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.attemptId)) {
    return next(new ErrorResponse('Invalid attempt ID', 400));
  }
  
  const attempt = await QuizAttempt.findById(req.params.attemptId)
    .populate({
        path: 'template',
        populate: { path: 'questions' }
    })
    .populate('student', 'firstName lastName');

  if (!attempt) return next(new ErrorResponse('Attempt not found', 404));

  const isOwner = attempt.student._id.toString() === req.user._id.toString();
  const isTeacherOrAdmin = ['Teacher', 'Admin'].includes(req.user.role);

  if (!isOwner && !isTeacherOrAdmin) {
    return next(new ErrorResponse('Not authorized', 403));
  }
  
  res.json({ success: true, data: attempt });
}));
// @route   GET /api/quizzes/:id/analytics
// @desc    Get quiz analytics (Per-Student Model)
// @access  Private/Teacher,Admin
router.get('/:id/analytics', protect, restrictTo('Teacher', 'Admin'), checkOwnership('quizTemplate', 'creatorId'), asyncHandler(async (req, res, next) => {
  if (!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid quiz ID format', 400));
  }
  
  const templateId = new mongoose.Types.ObjectId(req.params.id);
  const template = await QuizTemplate.findById(templateId)
    .populate({
      path: 'courseId',
      populate: { path: 'users' }
    });
  
  if (!template) {
    return next(new ErrorResponse('Quiz template not found', 404));
  }
  
  // Get all student quizzes for this template
  const studentQuizzes = await StudentQuiz.find({ templateId: templateId })
    .populate('studentId', 'firstName lastName email')
    .sort({ 'grade.score': -1 });
  
  // Calculate analytics
  let totalStudents = 0;
  // Count students across all groups associated with this quiz
  template.courseId.forEach(group => {
    totalStudents += group.users.filter(u => u.role === 'Student').length;
  });
  
  const attemptedCount = studentQuizzes.filter(sq => sq.status !== 'not-started').length;
  const completedCount = studentQuizzes.filter(sq => sq.status === 'submitted' || sq.status === 'graded').length;
  
  const scores = studentQuizzes
    .filter(sq => sq.grade && sq.grade.score !== undefined)
    .map(sq => sq.grade.score);
  
  const averageScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
  
  const completionRate = totalStudents > 0 ? (attemptedCount / totalStudents) * 100 : 0;
  
  // Get question-level analytics
  const questionAnalytics = [];
  if (template.questions && template.questions.length > 0) {
    for (const questionId of template.questions) {
      const question = await Question.findById(questionId);
      if (!question) continue;
      
      const correctAnswers = await QuizAttempt.aggregate([
        { $match: { template: templateId } },
        { $unwind: "$answers" },
        { $match: { "answers.question": questionId } },
        { 
          $group: {
            _id: "$answers.isCorrect",
            count: { $sum: 1 }
          }
        }
      ]);
      
      let correctCount = 0;
      let totalAnswers = 0;
      
      correctAnswers.forEach(item => {
        totalAnswers += item.count;
        if (item._id === true) correctCount = item.count;
      });
      
      const correctPercentage = totalAnswers > 0 ? (correctCount / totalAnswers) * 100 : 0;
      
      questionAnalytics.push({
        questionId: questionId,
        questionText: question.text,
        correctAnswers: correctCount,
        totalAnswers: totalAnswers,
        correctPercentage: correctPercentage
      });
    }
  }
  
  res.json({
    success: true,
    data: {
      participation: {
        totalStudents,
        attemptedCount,
        completedCount,
        completionRate
      },
      performance: {
        averageScore,
        highestScore,
        lowestScore,
        scores
      },
      questionAnalytics,
      studentQuizzes
    }
  });
}));

// @route   POST /api/quizzes/questions/image-upload
// @desc    Upload an image for a question
// @access  Private/Teacher,Admin
router.post(
  '/questions/image-upload', 
  protect, 
  restrictTo('Teacher', 'Admin'), 
  upload.single('image'), 
  // ✅ Use the factory to create a specific uploader for this route
  createCloudinaryUploader('quiz-questions'), 
  (req, res) => {
    if (!req.file || !req.file.url) {
      return res.status(400).json({ success: false, message: 'Image upload failed.' });
    }
    
    res.json({
      success: true,
      data: {
        imageUrl: req.file.url,
        publicId: req.file.public_id
      }
    });
  }
);

// @route   GET /api/quizzes/question-banks/:groupId
// @desc    Get question banks for a group
// @access  Private/Teacher,Admin
router.get('/question-banks/:groupId', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid group ID'
    });
  }
  
  // Get question banks owned by the user or shared with the organization
  const QuestionBank = require('../models/questionBankModel');
  const questionBanks = await QuestionBank.find({
    $or: [
      { owner: req.user._id },
      { accessLevel: 'organization', organization: req.user.organization },
      { accessLevel: 'public' }
    ]
  }).populate('questions');
  
  res.json({
    success: true,
    data: questionBanks
  });
}));

// @route   PUT /api/quizzes/grade/:quizId
// @desc    Grade a student quiz
// @access  Private/Teacher,Admin
router.put('/grade/:quizId', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
  const { quizId } = req.params;
  const { score, feedback } = req.body;

  const studentQuiz = await StudentQuiz.findById(quizId)
    .populate('templateId', 'points title');

  if (!studentQuiz) {
    return next(new ErrorResponse('Quiz not found', 404));
  }

  if (!['submitted', 'past-due'].includes(studentQuiz.status)) {
    return next(new ErrorResponse('Can only grade submitted or past-due quizzes', 400));
  }

  if (score < 0 || score > studentQuiz.templateId.points) {
    return next(new ErrorResponse(`Score must be between 0 and ${studentQuiz.templateId.points}`, 400));
  }

  studentQuiz.grade = {
    score,
    feedback,
    gradedBy: req.user._id,
    gradedAt: new Date()
  };

  studentQuiz.status = 'graded';
  await studentQuiz.save();

  await PointsLedger.findOneAndUpdate(
    { sourceId: studentQuiz._id, sourceType: 'quiz' },
    {
      studentId: studentQuiz.studentId,
      courseId: studentQuiz.courseId,
      pointsEarned: score,
      pointsPossible: studentQuiz.templateId.points,
      awardedAt: new Date(),
      sourceTitle: studentQuiz.templateId.title
    },
    { upsert: true, new: true }
  );

  res.status(200).json({ success: true, data: studentQuiz });
}));

// @route   GET /api/quizzes/bank
// @desc    Get all quiz templates for the bank
// @access  Private/Teacher,Admin
router.get('/bank', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  try {
    // ✅ FIX: Get ALL quiz templates, not just those created by current user
    // Also populate the questions to get full question data
    const quizBank = await QuizTemplate.find({})
      .populate({
        path: 'questions',
        model: 'Question'
      })
      .populate('courseId', 'name')
      .select('title description questions points startTime endTime timeLimit')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: quizBank
    });
  } catch (error) {
    console.error('Error fetching quiz bank:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch quiz bank'
    });
  }
}));

// @route   POST /api/quizzes/:id/request-retake
// @desc    Request a retake for a quiz
// @access  Private/Student
router.post('/:id/request-retake', protect, restrictTo('Student'), asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid quiz ID', 400));
  }
  
  const studentQuiz = await StudentQuiz.findById(id);
  
  if (!studentQuiz) {
    return next(new ErrorResponse('Quiz not found', 404));
  }
  
  // Check if user is the student
  if (studentQuiz.studentId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to request retake for this quiz', 403));
  }
  
  // Check if retake is allowed
  if (!studentQuiz.templateId.allowRetakes) {
    return next(new ErrorResponse('Retakes are not allowed for this quiz', 400));
  }
  
  // Create retake request
  const retakeRequest = new RetakeRequest({
    student: req.user._id,
    quiz: studentQuiz._id,
    reason: reason || 'No reason provided',
    status: 'pending'
  });
  
  await retakeRequest.save();
  
  res.status(201).json({
    success: true,
    data: retakeRequest,
    message: 'Retake request submitted successfully'
  });
}));

// server/routes/quizRoutes.js

// ✅ ADD THIS ENTIRE NEW ROUTE for fetching master templates
// @route   GET /api/quizzes/templates/:groupId
// @desc    Get all quiz templates for a teacher/admin
// @access  Private/Teacher,Admin
router.get('/templates/:groupId', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const { status } = req.query;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ success: false, message: 'Invalid group ID' });
  }

  const query = { courseId: { $in: [groupId] } };
  
  // Filter templates by time-based status
  const now = new Date();
  if (status && status !== 'all') {
    if (status === 'upcoming') {
      query.startTime = { $gt: now };
    } else if (status === 'active') {
      query.startTime = { $lte: now };
      query.endTime = { $gte: now };
    } else if (status === 'completed') {
      // For templates, 'completed' just means the end time has passed.
      query.endTime = { $lt: now };
    }
  }

  const templates = await QuizTemplate.find(query)
    .populate('courseId', 'name')
    .sort({ startTime: -1 });
    
  res.json({ success: true, data: templates });
}));

module.exports = router;
