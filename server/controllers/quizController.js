const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Quiz = require('../models/quizModel.js');
const Question = require('../models/questionModel.js');
const QuizAttempt = require('../models/quizAttemptModel.js');
const Group = require('../models/groupModel.js');
const QuestionBank = require('../models/questionBankModel.js');

// =================================================================
/**
 * @desc    Create a new quiz
 * @route   POST /api/quizzes
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const createQuiz = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    groupId,
    startTime,
    endTime,
   timeLimit, // New field
    questions: questionData,
  } = req.body;

  if (!title || !groupId || !startTime || !endTime || !questionData || questionData.length === 0) {
    res.status(400);
    throw new Error('Please provide all required fields for the quiz.');
  }

  // 1. Create Question documents from the incoming data
  const createdQuestions = await Question.insertMany(
    questionData.map((q) => ({ 
      ...q, 
      createdBy: req.user._id,
      imageUrl: q.imageUrl || null
    }))
  );
  const questionIds = createdQuestions.map((q) => q._id);

  // 2. Create the Quiz document
  const quiz = new Quiz({
    ...req.body,
    group: groupId,
    questions: questionIds,
    createdBy: req.user._id,
    isPublished: true,
    timeLimit: timeLimit, // Add the timeLimit
  });

  const createdQuiz = await quiz.save();
  
  const populatedQuiz = await Quiz.findById(createdQuiz._id)
    .populate('group', 'name')
    .populate('questions');

  res.status(201).json({ success: true, data: populatedQuiz });
});

// =================================================================
/**
 * @desc    Get a single quiz by its ID
 * @route   GET /api/quizzes/:id
 * @access  Private
 */
// =================================================================
const getQuizById = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id)
    .populate('questions')
    .populate('group', 'name users');

  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  // Authorization check
  const isTeacherOrAdmin = ['Teacher', 'Admin'].includes(req.user.role);
  const isInGroup = quiz.group.users.some(user => user._id.equals(req.user._id));

  if (!isTeacherOrAdmin && !isInGroup) {
      res.status(403);
      throw new Error('Not authorized to access this quiz');
  }

  // If the user is a student, find their attempts for this quiz
  let attempts = [];
  if (req.user.role === 'Student') {
    attempts = await QuizAttempt.find({
      quiz: quiz._id,
      student: req.user._id,
    }).sort({ attemptNumber: -1 });
  }

  res.json({ success: true, data: { ...quiz.toObject(), attempts } });
});

// =================================================================
/**
 * @desc    Get all quizzes for a specific group (for teachers)
 * @route   GET /api/quizzes/teacher/:groupId
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const getQuizzesForGroup = asyncHandler(async (req, res) => {
  const quizzes = await Quiz.find({ group: req.params.groupId })
    .populate('group', 'name')
    .sort({ startTime: -1 });

  res.json({ success: true, data: quizzes });
});

// =================================================================
/**
 * @desc    Get all quizzes for the logged-in student
 * @route   GET /api/quizzes/student
 * @access  Private (Student)
 */
// =================================================================
const getStudentQuizzes = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const studentGroups = await Group.find({ users: studentId });
  const groupIds = studentGroups.map((g) => g._id);

  const quizzes = await Quiz.find({ group: { $in: groupIds }, isPublished: true })
    .populate('group', 'name')
    .lean();

  const quizIds = quizzes.map((q) => q._id);
  const attempts = await QuizAttempt.find({
    student: studentId,
    quiz: { $in: quizIds },
  });

  const quizzesWithStatus = quizzes.map((quiz) => {
    const bestAttempt = attempts
      .filter((a) => a.quiz.equals(quiz._id))
      .sort((a, b) => b.score - a.score)[0];

    return bestAttempt ? { ...quiz, score: bestAttempt.score } : quiz;
  });

  res.json({ success: true, data: quizzesWithStatus });
});

// =================================================================
/**
 * @desc    Update a quiz
 * @route   PUT /api/quizzes/:id
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const updateQuiz = asyncHandler(async (req, res) => {
    const { questions: questionData, ...quizData } = req.body;
    let quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
        res.status(404);
        throw new Error('Quiz not found');
    }

    // Update simple fields
    Object.assign(quiz, quizData);

    // If questions are being updated, replace them
    if (questionData && Array.isArray(questionData)) {
        await Question.deleteMany({ _id: { $in: quiz.questions } });
        
        const newQuestions = await Question.insertMany(
            questionData.map(q => ({ 
              ...q, 
              createdBy: req.user._id,
              imageUrl: q.imageUrl || null
            }))
        );
        quiz.questions = newQuestions.map(q => q._id);
    }
    
    const updatedQuiz = await quiz.save();
    
    const populatedQuiz = await Quiz.findById(updatedQuiz._id)
        .populate('group', 'name')
        .populate('questions');

    res.json({ success: true, data: populatedQuiz });
});

// =================================================================
/**
 * @desc    Delete a quiz
 * @route   DELETE /api/quizzes/:id
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const deleteQuiz = asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id);

    if (!quiz) {
        res.status(404);
        throw new Error('Quiz not found');
    }

    // Cascade delete associated documents
    await Question.deleteMany({ _id: { $in: quiz.questions } });
    await QuizAttempt.deleteMany({ quiz: quiz._id });

    await quiz.deleteOne();

    res.json({ success: true, message: 'Quiz and all associated data deleted successfully.' });
});

// =================================================================
/**
 * @desc    Start a quiz attempt for a student
 * @route   POST /api/quizzes/:id/start
 * @access  Private (Student)
 */
// =================================================================
const startQuizAttempt = asyncHandler(async (req, res) => {
  const quiz = await Quiz.findById(req.params.id).populate('questions');
  if (!quiz) {
    res.status(404);
    throw new Error('Quiz not found');
  }

  const now = new Date();
  if (!quiz.isPublished || now < quiz.startTime || now > quiz.endTime) {
    res.status(400);
    throw new Error('This quiz is not currently active.');
  }

  const existingAttempts = await QuizAttempt.find({ quiz: quiz._id, student: req.user._id });

  const inProgressAttempt = existingAttempts.find(a => a.status === 'in-progress');
  if (inProgressAttempt) {
      return res.json({ success: true, data: inProgressAttempt, message: 'Resuming in-progress attempt.' });
  }

  if (existingAttempts.length >= quiz.maxAttempts) {
    res.status(400);
    throw new Error('Maximum attempts reached for this quiz.');
  }

  const newAttempt = await QuizAttempt.create({
    quiz: quiz._id,
    student: req.user._id,
    attemptNumber: existingAttempts.length + 1,
    startTime: new Date(),
    status: 'in-progress'
  });

  res.status(201).json({ success: true, data: newAttempt });
});

// =================================================================
/**
 * @desc    Submit an answer for a single question
 * @route   POST /api/quizzes/attempt/:attemptId/answer
 * @access  Private (Student)
 */
// =================================================================
const submitAnswer = asyncHandler(async (req, res) => {
  const { questionId, selectedOptionIndex } = req.body;
  const attempt = await QuizAttempt.findById(req.params.attemptId);

  if (!attempt || attempt.student.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized for this attempt.');
  }
  if (attempt.status !== 'in-progress') {
    res.status(400);
    throw new Error('This quiz has already been submitted.');
  }

  const question = await Question.findById(questionId);
  if (!question) {
    res.status(404);
    throw new Error('Question not found');
  }

  let isCorrect = false;
  let pointsAwarded = 0;
  
  if (question.type === 'multiple-choice' || question.type === 'true-false') {
    const correctOptionIndex = question.options.findIndex(opt => opt.isCorrect);
    isCorrect = correctOptionIndex === selectedOptionIndex;
    pointsAwarded = isCorrect ? question.points : 0;
  }

  const answer = {
    question: questionId,
    selectedOptionIndex,
    isCorrect: isCorrect,
    pointsAwarded: pointsAwarded,
    answeredAt: new Date()
  };

  const existingAnswerIndex = attempt.answers.findIndex(a => a.question.equals(questionId));

  if (existingAnswerIndex > -1) {
    attempt.answers[existingAnswerIndex] = answer;
  } else {
    attempt.answers.push(answer);
  }

  await attempt.save();
  res.json({ success: true, data: attempt });
});

// =================================================================
/**
 * @desc    Finalize and submit a quiz attempt
 * @route   POST /api/quizzes/attempt/:attemptId/submit
 * @access  Private (Student)
 */
// =================================================================
const submitQuizAttempt = asyncHandler(async (req, res) => {
  let attempt = await QuizAttempt.findById(req.params.attemptId);

  if (!attempt || attempt.student.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized for this attempt.');
  }

  attempt.endTime = new Date();
  attempt.status = 'submitted';
  
  await attempt.autoGrade();

  res.json({ success: true, message: 'Quiz submitted successfully', data: attempt });
});

// =================================================================
/**
 * @desc    Get the results of a quiz attempt
 * @route   GET /api/quizzes/attempt/:attemptId/results
 * @access  Private
 */
// =================================================================
const getQuizAttemptResults = asyncHandler(async (req, res) => {
  const attempt = await QuizAttempt.findById(req.params.attemptId)
    .populate({
      path: 'quiz',
      populate: { 
        path: 'questions',
        model: 'Question'
      }
    })
    .populate('student', 'firstName lastName email');

  if (!attempt) {
    res.status(404);
    throw new Error('Attempt not found');
  }
  
  const isStudentOwner = attempt.student._id.equals(req.user._id);
  const isTeacher = ['Teacher', 'Admin'].includes(req.user.role);

  if (!isStudentOwner && !isTeacher) {
    res.status(403);
    throw new Error('Not authorized to view these results');
  }

  res.json({ success: true, data: attempt });
});

// =================================================================
/**
 * @desc    Get analytics for a quiz
 * @route   GET /api/quizzes/:id/analytics
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const getQuizAnalytics = asyncHandler(async (req, res) => {
    const quiz = await Quiz.findById(req.params.id).populate('group', 'users');
    if (!quiz) {
        res.status(404);
        throw new Error('Quiz not found');
    }

    const attempts = await QuizAttempt.find({ quiz: quiz._id })
      .populate('student', 'firstName lastName email')
      .populate({
        path: 'quiz',
        populate: {
          path: 'questions',
          model: 'Question'
        }
      });
    
    const totalStudents = quiz.group.users.filter(u => u.role === 'Student').length;
    const submittedAttempts = attempts.filter(a => a.status !== 'in-progress');
    const scores = submittedAttempts.map(a => a.score);

    const analytics = {
        participation: {
            totalStudents,
            attemptedCount: attempts.length,
            completionRate: totalStudents > 0 ? (submittedAttempts.length / totalStudents) * 100 : 0,
        },
        performance: {
            averageScore: scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0,
            highestScore: scores.length > 0 ? Math.max(...scores) : 0,
            lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
        },
        attempts: submittedAttempts,
    };

    res.json({ success: true, data: analytics });
});

// =================================================================
/**
 * @desc    Upload an image for a question
 * @route   POST /api/quizzes/questions/image-upload
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const uploadQuestionImage = asyncHandler(async (req, res) => {
    if (!req.file || !req.file.url) {
        res.status(400);
        throw new Error('Image upload failed. No file found.');
    }
    res.json({
        success: true,
        data: {
            imageUrl: req.file.url,
            publicId: req.file.public_id,
        },
    });
});

// =================================================================
/**
 * @desc    Get available question banks
 * @route   GET /api/quizzes/question-banks/:groupId
 * @access  Private (Teacher/Admin)
 */
// =================================================================
const getQuestionBanksForGroup = asyncHandler(async (req, res) => {
    const questionBanks = await QuestionBank.find({
        $or: [{ owner: req.user._id }, { accessLevel: 'public' }],
    }).populate('questions', 'text type difficulty options');

    res.json({ success: true, data: questionBanks });
});


module.exports = {
  createQuiz,
  getQuizById,
  getQuizzesForGroup,
  getStudentQuizzes,
  updateQuiz,
  deleteQuiz,
  startQuizAttempt,
  submitAnswer,
  submitQuizAttempt,
  getQuizAttemptResults,
  getQuizAnalytics,
  uploadQuestionImage,
  getQuestionBanksForGroup,
};