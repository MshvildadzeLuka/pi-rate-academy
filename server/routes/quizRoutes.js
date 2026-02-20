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
    title, description, groupId, startTime, endTime, questions, timeLimit,
    isProtected, allowRetakes, retakePolicy // ✅ ADDED new fields
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
      timeLimit,
      isProtected: isProtected || false,          // ✅ ADDED logic
      allowRetakes: allowRetakes || false,        // ✅ ADDED logic
      retakePolicy: retakePolicy || 'highest'     // ✅ ADDED logic
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

  if (status && status !== 'all') {
    query.status = { $in: status.split(',') };
  }

  const quizzes = await StudentQuiz.find(query)
    .populate({
      path: 'templateId',
      select: 'title description points questions startTime endTime timeLimit isProtected allowRetakes retakePolicy requiresPassword', // ✅ Ensure new fields are selected
      populate: { path: 'questions' }
    })
    .sort({ dueDate: -1 });

  res.status(200).json({ success: true, data: quizzes });
}));

// @route   GET /api/quizzes/:id
// @desc    Get a single StudentQuiz by its ID (Unified View)
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid quiz ID', 400));
  }
  
  const studentQuiz = await StudentQuiz.findById(req.params.id)
    .populate({
      path: 'templateId',
      select: 'title description points timeLimit isProtected allowRetakes retakePolicy questions', // ✅ Added new fields here
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

    const { questions, ...updateData } = req.body; // ✅ ...updateData automatically captures isProtected, allowRetakes, retakePolicy
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

// ✅ NEW ROUTE: DUPLICATE QUIZ
// @route   POST /api/quizzes/:id/duplicate
// @desc    Duplicate a quiz template and assign it to a new group
// @access  Private/Teacher,Admin
router.post('/:id/duplicate', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid quiz ID format', 400));
  }

  const { groupId } = req.body;
  if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
    return next(new ErrorResponse('Valid group ID is required', 400));
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1. Find existing template
    const originalTemplate = await QuizTemplate.findById(req.params.id).populate('questions').session(session);
    if (!originalTemplate) {
      throw new ErrorResponse('Original quiz template not found', 404);
    }

    // 2. Clone the questions so the new quiz is fully independent
    const newQuestionsData = originalTemplate.questions.map(q => {
      const qObj = q.toObject();
      delete qObj._id;        // Remove old ID
      delete qObj.createdAt;
      delete qObj.updatedAt;
      qObj.createdBy = req.user._id; // Assign to current user
      return qObj;
    });
    
    const newQuestions = await Question.insertMany(newQuestionsData, { session });
    const newQuestionIds = newQuestions.map(q => q._id);
    const totalPoints = newQuestions.reduce((sum, q) => sum + (q.points || 0), 0);

    // 3. Create the new Quiz Template
    const templateData = {
      title: `${originalTemplate.title} (Copy)`,
      description: originalTemplate.description,
      courseId: [groupId],
      creatorId: req.user._id,
      startTime: originalTemplate.startTime,
      endTime: originalTemplate.endTime,
      questions: newQuestionIds,
      points: totalPoints,
      timeLimit: originalTemplate.timeLimit,
      isProtected: originalTemplate.isProtected,
      allowRetakes: originalTemplate.allowRetakes,
      retakePolicy: originalTemplate.retakePolicy
    };

    const [newTemplate] = await QuizTemplate.create([templateData], { session });

    // 4. Assign the quiz to the new group's students
    const group = await Group.findById(groupId).populate('users').session(session);
    if (!group) {
      throw new ErrorResponse('Target group not found', 404);
    }

    const studentIds = group.users.filter(u => u.role === 'Student').map(u => u._id);
    if (studentIds.length > 0) {
      await StudentQuiz.createStudentQuizzes(newTemplate, studentIds, groupId, session);
    }

    await session.commitTransaction();
    
    // Return populated template
    const populatedTemplate = await QuizTemplate.findById(newTemplate._id).populate('questions');
    res.status(201).json({ success: true, data: populatedTemplate });

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
    await Question.deleteMany({ _id: { $in: template.questions } });
    await StudentQuiz.deleteMany({ templateId: template._id });
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

// ✅ NEW ROUTE: RETAKE QUIZ
// @route   POST /api/quizzes/:id/retake
// @desc    Clear previous attempt and restart quiz
// @access  Private/Student
router.post('/:id/retake', protect, restrictTo('Student'), asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return next(new ErrorResponse('Invalid student quiz ID', 400));
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1. Find the StudentQuiz and populate template
    const studentQuiz = await StudentQuiz.findById(req.params.id).populate('templateId').session(session);
    
    if (!studentQuiz) {
      throw new ErrorResponse('Quiz assignment not found', 404);
    }

    // 2. Authorization check
    if (studentQuiz.studentId.toString() !== req.user._id.toString()) {
      throw new ErrorResponse('Not authorized to modify this quiz', 403);
    }

    // 3. Verify retakes are allowed
    if (!studentQuiz.templateId.allowRetakes) {
      throw new ErrorResponse('Retakes are not allowed for this quiz', 400);
    }

    // 4. Find all old attempts for this StudentQuiz to clear their ledger points
    const oldAttempts = await QuizAttempt.find({ studentQuiz: studentQuiz._id }).session(session);
    const oldAttemptIds = oldAttempts.map(attempt => attempt._id);

    // 5. Delete PointsLedger associated with all prior attempts for this quiz
    if (oldAttemptIds.length > 0) {
      await PointsLedger.deleteMany({
        sourceId: { $in: oldAttemptIds },
        sourceType: 'quiz'
      }).session(session);
    }

    // 6. Reset StudentQuiz to original state
    studentQuiz.status = 'not-started';
    studentQuiz.grade = undefined;
    studentQuiz.submission = undefined;
    studentQuiz.lastAttemptId = undefined; // Clear reference to last attempt

    await studentQuiz.save({ session });
    
    await session.commitTransaction();
    
    res.status(200).json({ success: true, message: 'Quiz reset successfully. Ready for retake.', data: studentQuiz });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
}));

// @route   POST /api/quizzes/:id/start
// @desc    Start a quiz attempt
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
  
  // NOTE: Logic allows multiple attempts conceptually, but checks if currently in progress
  const inProgressAttempt = await QuizAttempt.findOne({ 
    studentQuiz: studentQuiz._id, 
    status: 'in-progress' 
  });
  
  if (inProgressAttempt) {
     return res.status(200).json({ success: true, data: inProgressAttempt });
  }

  const existingAttemptsCount = await QuizAttempt.countDocuments({ studentQuiz: studentQuiz._id });

  const attempt = new QuizAttempt({
    studentQuiz: studentQuiz._id,
    student: req.user._id,
    template: studentQuiz.templateId._id,
    attemptNumber: existingAttemptsCount + 1,
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
  
  if (attempt.student.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to access this attempt', 403));
  }
  
  if (attempt.status !== 'in-progress') {
    return next(new ErrorResponse('Attempt is already submitted', 400));
  }
  
  const question = await Question.findById(questionId);
  if (!question) {
    return next(new ErrorResponse('Question not found', 404));
  }
  
  const existingAnswerIndex = attempt.answers.findIndex(
    a => a.question && a.question.toString() === questionId
  );
  
  const isCorrect = question.options[selectedOptionIndex] && question.options[selectedOptionIndex].isCorrect;
  const pointsAwarded = isCorrect ? question.points : 0;
  
  if (existingAnswerIndex !== -1) {
    attempt.answers[existingAnswerIndex] = {
      question: questionId,
      selectedOptionIndex,
      pointsAwarded,
      answeredAt: new Date()
    };
  } else {
    attempt.answers.push({
      question: questionId,
      selectedOptionIndex,
      pointsAwarded,
      answeredAt: new Date()
    });
  }
  
  const updatedAttempt = await attempt.save();
  res.json({ success: true, data: updatedAttempt });
}));

// ✅ NEW ROUTE: AUTOSAVE QUIZ DRAFT
// @route   PUT /api/quizzes/attempt/:attemptId/autosave
// @desc    Auto-save draft answers without submitting
// @access  Private/Student
router.put('/attempt/:attemptId/autosave', protect, asyncHandler(async (req, res, next) => {
  const { attemptId } = req.params;
  const answers = req.body.answers || req.body; // Accepts array directly or wrapped in {answers: []}

  if (!mongoose.Types.ObjectId.isValid(attemptId)) {
    return next(new ErrorResponse('Invalid attempt ID', 400));
  }

  if (!Array.isArray(answers)) {
    return next(new ErrorResponse('Answers data must be an array', 400));
  }

  const attempt = await QuizAttempt.findById(attemptId);
  
  if (!attempt) {
    return next(new ErrorResponse('Attempt not found', 404));
  }

  if (attempt.student.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized', 403));
  }

  if (attempt.status !== 'in-progress') {
    return next(new ErrorResponse('Cannot auto-save. Attempt is no longer in progress.', 400));
  }

  // Process all submitted answers in the array
  for (const ans of answers) {
    const { questionId, selectedOptionIndex } = ans;
    
    if (!mongoose.Types.ObjectId.isValid(questionId)) continue;
    
    const question = await Question.findById(questionId);
    if (!question) continue;

    const isCorrect = question.options[selectedOptionIndex] && question.options[selectedOptionIndex].isCorrect;
    const pointsAwarded = isCorrect ? question.points : 0;

    const existingAnswerIndex = attempt.answers.findIndex(
      a => a.question && a.question.toString() === questionId.toString()
    );

    if (existingAnswerIndex !== -1) {
      attempt.answers[existingAnswerIndex] = {
        question: questionId,
        selectedOptionIndex,
        pointsAwarded,
        answeredAt: new Date()
      };
    } else {
      attempt.answers.push({
        question: questionId,
        selectedOptionIndex,
        pointsAwarded,
        answeredAt: new Date()
      });
    }
  }

  // ✅ CRITICAL: Just save the document. Do not change status or call autoGrade.
  await attempt.save();
  
  res.status(200).json({ success: true, message: 'Draft answers saved successfully' });
}));

// @route   POST /api/quizzes/attempt/:attemptId/submit
// @desc    Submit a quiz attempt
// @access  Private
router.post('/attempt/:attemptId/submit', protect, asyncHandler(async (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.attemptId)) {
    return next(new ErrorResponse('Invalid attempt ID', 400));
  }

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
      
      await attempt.autoGrade(); 
      
      const studentQuiz = await StudentQuiz.findById(attempt.studentQuiz).session(session);
      if (!studentQuiz) throw new ErrorResponse('Associated student quiz not found', 404);

      studentQuiz.submission = {
        answers: attempt.answers,
        submittedAt: attempt.endTime,
        isLate: attempt.endTime > studentQuiz.dueDate
      };
      studentQuiz.grade = { score: attempt.score };
      studentQuiz.lastAttemptId = attempt._id;

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
      
      return res.json({ success: true, data: attempt }); 

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      if (error.code === 112 && i < MAX_RETRIES - 1) {
        console.log(`Write conflict detected. Retrying submission (attempt ${i + 2})...`);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100)); 
        continue; 
      }
      
      return next(error);
    }
  }
}));

// @route   GET /api/quizzes/attempt/:attemptId/results
// @desc    Get quiz results
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
// @desc    Get quiz analytics
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
  
  const studentQuizzes = await StudentQuiz.find({ templateId: templateId })
    .populate('studentId', 'firstName lastName email')
    .sort({ 'grade.score': -1 });
  
  let totalStudents = 0;
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
      participation: { totalStudents, attemptedCount, completedCount, completionRate },
      performance: { averageScore, highestScore, lowestScore, scores },
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
  createCloudinaryUploader('quiz-questions'), 
  (req, res) => {
    if (!req.file || !req.file.url) {
      return res.status(400).json({ success: false, message: 'Image upload failed.' });
    }
    res.json({
      success: true,
      data: { imageUrl: req.file.url, publicId: req.file.public_id }
    });
  }
);

// @route   GET /api/quizzes/question-banks/:groupId
// @desc    Get question banks for a group
// @access  Private/Teacher,Admin
router.get('/question-banks/:groupId', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ success: false, message: 'Invalid group ID' });
  }
  
  const QuestionBank = require('../models/questionBankModel');
  const questionBanks = await QuestionBank.find({
    $or: [
      { owner: req.user._id },
      { accessLevel: 'organization', organization: req.user.organization },
      { accessLevel: 'public' }
    ]
  }).populate('questions');
  
  res.json({ success: true, data: questionBanks });
}));

// @route   PUT /api/quizzes/grade/:quizId
// @desc    Grade a student quiz
// @access  Private/Teacher,Admin
router.put('/grade/:quizId', protect, restrictTo('Teacher', 'Admin'), asyncHandler(async (req, res, next) => {
  const { quizId } = req.params;
  const { score, feedback } = req.body;

  const studentQuiz = await StudentQuiz.findById(quizId).populate('templateId', 'points title');

  if (!studentQuiz) return next(new ErrorResponse('Quiz not found', 404));

  if (!['submitted', 'past-due'].includes(studentQuiz.status)) {
    return next(new ErrorResponse('Can only grade submitted or past-due quizzes', 400));
  }

  if (score < 0 || score > studentQuiz.templateId.points) {
    return next(new ErrorResponse(`Score must be between 0 and ${studentQuiz.templateId.points}`, 400));
  }

  studentQuiz.grade = { score, feedback, gradedBy: req.user._id, gradedAt: new Date() };
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
  const quizBank = await QuizTemplate.find({ creatorId: req.user._id }).select('title questions startTime endTime');
  res.json({ success: true, data: quizBank });
}));

// @route   POST /api/quizzes/:id/request-retake
// @desc    Request a retake for a quiz
// @access  Private/Student
router.post('/:id/request-retake', protect, restrictTo('Student'), asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!mongoose.Types.ObjectId.isValid(id)) return next(new ErrorResponse('Invalid quiz ID', 400));
  
  const studentQuiz = await StudentQuiz.findById(id);
  if (!studentQuiz) return next(new ErrorResponse('Quiz not found', 404));
  
  if (studentQuiz.studentId.toString() !== req.user._id.toString()) {
    return next(new ErrorResponse('Not authorized to request retake for this quiz', 403));
  }
  
  if (!studentQuiz.templateId.allowRetakes) {
    return next(new ErrorResponse('Retakes are not allowed for this quiz', 400));
  }
  
  const retakeRequest = new RetakeRequest({
    student: req.user._id,
    quiz: studentQuiz._id,
    reason: reason || 'No reason provided',
    status: 'pending'
  });
  
  await retakeRequest.save();
  
  res.status(201).json({ success: true, data: retakeRequest, message: 'Retake request submitted successfully' });
}));

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
  
  const now = new Date();
  if (status && status !== 'all') {
    if (status === 'upcoming') {
      query.startTime = { $gt: now };
    } else if (status === 'active') {
      query.startTime = { $lte: now };
      query.endTime = { $gte: now };
    } else if (status === 'completed') {
      query.endTime = { $lt: now };
    }
  }

  const templates = await QuizTemplate.find(query).populate('courseId', 'name').sort({ startTime: -1 });
  res.json({ success: true, data: templates });
}));

module.exports = router;
