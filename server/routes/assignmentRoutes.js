const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { upload, createCloudinaryUploader, handleUploadErrors } = require('../middleware/uploadMiddleware');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('express-async-handler');

// Models
const AssignmentTemplate = require('../models/assignmentTemplateModel');
const StudentAssignment = require('../models/studentAssignmentModel');
const Group = require('../models/groupModel');
const User = require('../models/userModel');
const RetakeRequest = require('../models/retakeRequestModel');
const PointsLedger = require('../models/pointsLedgerModel');

// Create uploader for assignments
const uploadToAssignments = createCloudinaryUploader('assignments');

// Middleware to update assignment statuses before certain operations
const updateAssignmentStatuses = asyncHandler(async (req, res, next) => {
  try {
    await StudentAssignment.updateAllStatuses();
    next();
  } catch (error) {
    console.error('Error updating assignment statuses:', error);
    next();
  }
});

// @desc    Create new assignment
// @route   POST /api/assignments
// @access  Private (Teacher/Admin)
router.post(
  '/',
  protect,
  restrictTo('Teacher', 'Admin'),
  upload.array('attachments', 5),
  uploadToAssignments,
  handleUploadErrors,
  asyncHandler(async (req, res, next) => {
    const { title, instructions, points, startTime, endTime } = req.body;
    let courseIds = Array.isArray(req.body.courseId) ? req.body.courseId : [req.body.courseId];

    if (!title || !courseIds.length || !startTime || !endTime) {
      return next(new ErrorResponse('Missing required fields', 400));
    }

    if (new Date(endTime) <= new Date(startTime)) {
      return next(new ErrorResponse('End time must be after start time', 400));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const attachments = req.files ? req.files.map(file => ({
        public_id: file.public_id,
        url: file.url,
        fileName: file.originalname,
        fileType: file.mimetype,
      })) : [];

      const template = new AssignmentTemplate({
        title,
        instructions,
        points: points || 100,
        courseId: courseIds,
        creatorId: req.user._id,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        attachments
      });

      await template.save({ session });

      let allStudentIds = [];
      for (const courseId of courseIds) {
        const group = await Group.findById(courseId).select('users').session(session);
        if (!group) throw new ErrorResponse(`Group ${courseId} not found`, 404);

        const studentUsers = await User.find({ _id: { $in: group.users }, role: 'Student' }).select('_id').session(session);
        studentUsers.forEach(student => {
            if (!allStudentIds.find(id => id.equals(student._id))) {
                allStudentIds.push(student._id);
            }
        });
      }

      if (allStudentIds.length > 0) {
        await StudentAssignment.createStudentAssignments(template, allStudentIds, courseIds[0], session);
      }

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({
        success: true,
        data: template
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  })
);

// @desc    Get assignments for teacher view
// @route   GET /api/assignments/teacher/:groupId
// @access  Private (Teacher/Admin)
router.get(
  '/teacher/:groupId',
  protect,
  restrictTo('Teacher', 'Admin'),
  updateAssignmentStatuses,
  asyncHandler(async (req, res, next) => {
    const { groupId } = req.params;
    const { status } = req.query;

    const query = { courseId: groupId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const assignments = await StudentAssignment.find(query)
      .populate('studentId', 'firstName lastName email')
      .populate({
        path: 'templateId',
        select: 'title points instructions attachments startTime endTime'
      })
      .sort({ dueDate: 1 })
      .lean();

    const now = new Date();
    const unseenPastDueIds = assignments
      .filter(sa => sa.status === 'past-due' && !sa.seenByTeacher && new Date(sa.dueDate) < now)
      .map(sa => sa._id);

    if (unseenPastDueIds.length > 0) {
      await StudentAssignment.updateMany(
        { _id: { $in: unseenPastDueIds } },
        { $set: { seenByTeacher: true } }
      );
    }

    res.status(200).json({
      success: true,
      count: assignments.length,
      data: assignments
    });
  })
);

// @desc    Get student assignments
// @route   GET /api/assignments/student
// @access  Private (Student)
router.get(
  '/student',
  protect,
  restrictTo('Student'),
  updateAssignmentStatuses,
  asyncHandler(async (req, res, next) => {
    const { status } = req.query;
    const now = new Date();

    const query = { 
        studentId: req.user._id,
    };
    if (status && status !== 'all') {
      query.status = status;
    }

    const assignments = await StudentAssignment.find(query)
      .populate({
        path: 'templateId',
        select: 'title points instructions attachments startTime endTime'
      })
      .sort({ dueDate: 1 })
      .lean();
      
    // [CORRECTED] Filter out assignments that have not started yet for students.
    const visibleAssignments = assignments.filter(assignment => {
        return assignment.templateId && new Date(assignment.templateId.startTime) <= now;
    });

    const unseenIds = visibleAssignments
      .filter(sa => !sa.viewedByStudent)
      .map(sa => sa._id);

    if (unseenIds.length > 0) {
      await StudentAssignment.updateMany(
        { _id: { $in: unseenIds } },
        { $set: { viewedByStudent: true, firstViewedAt: new Date() } }
      );
    }

    res.status(200).json({
      success: true,
      count: visibleAssignments.length,
      data: visibleAssignments
    });
  })
);

// @desc    Get a single assignment template for editing
// @route   GET /api/assignments/template/:id
// @access  Private (Teacher/Admin)
router.get(
  '/template/:id',
  protect,
  restrictTo('Teacher', 'Admin'),
  asyncHandler(async (req, res, next) => {
    const template = await AssignmentTemplate.findById(req.params.id);

    if (!template) {
      return next(new ErrorResponse('Assignment Template not found', 404));
    }

    res.status(200).json({
      success: true,
      data: template
    });
  })
);

// @desc    Update an assignment template
// @route   PUT /api/assignments/template/:id
// @access  Private (Teacher/Admin)
router.put(
  '/template/:id',
  protect,
  restrictTo('Teacher', 'Admin'),
  upload.array('attachments', 5),
  uploadToAssignments,
  handleUploadErrors,
  asyncHandler(async (req, res, next) => {
    const { title, instructions, points, startTime, endTime, courseId } = req.body;
    const template = await AssignmentTemplate.findById(req.params.id);

    if (!template) {
      return next(new ErrorResponse('Assignment Template not found', 404));
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      template.title = title || template.title;
      template.instructions = instructions || template.instructions;
      template.points = points || template.points;
      template.startTime = new Date(startTime) || template.startTime;
      template.endTime = new Date(endTime) || template.endTime;
      template.courseId = Array.isArray(courseId) ? courseId : [courseId];
      
      if (req.files && req.files.length > 0) {
        const newAttachments = req.files.map(file => ({
          public_id: file.public_id,
          url: file.url,
          fileName: file.originalname,
          fileType: file.mimetype,
        }));
        template.attachments.push(...newAttachments);
      }

      await template.save({ session });
      
      // Update all related student assignments with new data from the template
      await StudentAssignment.updateTemplateData(template._id, {
          dueDate: template.endTime,
          templateTitle: template.title,
          templatePoints: template.points
      }, session);

      // Re-run status checks on all affected assignments
      const assignments = await StudentAssignment.find({ templateId: template._id }).session(session);
      for (const assignment of assignments) {
        await assignment.save({ session });
      }
      
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        data: template
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  })
);

// [NEW] Route to delete an assignment template and all associated data
// @desc    Delete an assignment template
// @route   DELETE /api/assignments/template/:id
// @access  Private (Teacher/Admin)
router.delete(
    '/template/:id',
    protect,
    restrictTo('Teacher', 'Admin'),
    asyncHandler(async (req, res, next) => {
        const { id } = req.params;
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const template = await AssignmentTemplate.findById(id).session(session);
            if (!template) {
                throw new ErrorResponse('Assignment Template not found', 404);
            }

            const studentAssignments = await StudentAssignment.find({ templateId: id }).select('_id').session(session);
            const studentAssignmentIds = studentAssignments.map(sa => sa._id);

            if (studentAssignmentIds.length > 0) {
                await PointsLedger.deleteMany({ sourceId: { $in: studentAssignmentIds } }).session(session);
                await RetakeRequest.deleteMany({ requestableId: { $in: studentAssignmentIds } }).session(session);
                await StudentAssignment.deleteMany({ _id: { $in: studentAssignmentIds } }).session(session);
            }

            await AssignmentTemplate.findByIdAndDelete(id).session(session);

            await session.commitTransaction();
            session.endSession();

            res.status(200).json({ success: true, data: {} });
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            next(error);
        }
    })
);

// --- ROUTE ORDER IS IMPORTANT ---
router.post(
  '/requests',
  protect,
  restrictTo('Student'),
  asyncHandler(async (req, res, next) => {
    const { requestableId, reason } = req.body; 

    const assignment = await StudentAssignment.findById(requestableId); 
    if (!assignment || assignment.studentId.toString() !== req.user._id.toString()) {
      return next(new ErrorResponse('Assignment not found', 404));
    }
    
    const now = new Date();
    if (now <= new Date(assignment.dueDate)) {
      return next(new ErrorResponse('You can only request retakes for past-due assignments', 400));
    }
    
    const existingRequest = await RetakeRequest.findOne({
      requestableId: requestableId, 
      studentId: req.user._id,
      status: 'pending'
    });
    
    if (existingRequest) {
      return next(new ErrorResponse('You already have a pending request for this assignment', 400));
    }
    
    const request = new RetakeRequest({
      requestableId: requestableId,
      requestableType: 'StudentAssignment',
      studentId: req.user._id,
      courseId: assignment.courseId,
      reason,
    });
    
    await request.save();
    res.status(201).json({ success: true, data: request });
  })
);

router.get(
  '/requests',
  protect,
  restrictTo('Teacher', 'Admin'),
  asyncHandler(async (req, res, next) => {
    const { status } = req.query;
    const query = { requestableType: 'StudentAssignment' };
    
    if (status) {
      query.status = status;
    }

    const requests = await RetakeRequest.find(query)
      .populate('studentId', 'firstName lastName email')
      .populate({
        path: 'requestableId',
        select: 'templateTitle' 
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  })
);

router.put(
  '/requests/:id',
  protect,
  restrictTo('Teacher', 'Admin'),
  asyncHandler(async (req, res, next) => {
    const { status, newDueDate } = req.body;
    const request = await RetakeRequest.findById(req.params.id);

    if (!request) {
      return next(new ErrorResponse('Request not found', 404));
    }
    if (request.status !== 'pending') {
      return next(new ErrorResponse('Request has already been processed', 400));
    }
    if (!['approved', 'denied'].includes(status)) {
      return next(new ErrorResponse('Invalid status', 400));
    }

    request.status = status;
    request.reviewedBy = req.user._id;

    if (status === 'approved') {
      if (!newDueDate) {
        return next(new ErrorResponse('A new due date is required for approval', 400));
      }
      
      const updatedDueDate = new Date(newDueDate);
      request.newDueDate = updatedDueDate;
      
      const assignment = await StudentAssignment.findById(request.requestableId);
      if (assignment) {
        assignment.dueDate = updatedDueDate;
        assignment.submission = {};
        assignment.grade = {};
        
        await PointsLedger.findOneAndDelete({
          sourceId: assignment._id,
          sourceType: 'assignment'
        });
        
        await assignment.save();
      }
    }

    await request.save();

    res.status(200).json({
      success: true,
      data: request
    });
  })
);

router.get(
  '/:id',
  protect,
  asyncHandler(async (req, res, next) => {
    const assignment = await StudentAssignment.findById(req.params.id)
      .populate('studentId', 'firstName lastName email')
      .populate({
        path: 'templateId',
        select: 'title points instructions attachments startTime endTime'
      });

    if (!assignment) {
      return next(new ErrorResponse('Assignment not found', 404));
    }

    const isOwner = assignment.studentId._id.toString() === req.user._id.toString();
    const isTeacherOrAdmin = ['Teacher', 'Admin'].includes(req.user.role);
    const isInSameGroup = req.user.groups.includes(assignment.courseId.toString());

    if (!isOwner && !(isTeacherOrAdmin && isInSameGroup)) {
      return next(new ErrorResponse('Not authorized to view this assignment', 403));
    }

    await assignment.save();

    res.status(200).json({
      success: true,
      data: assignment
    });
  })
);

router.post(
  '/student/:assignmentId/submit',
  protect,
  restrictTo('Student'),
  upload.array('files', 5),
  uploadToAssignments,
  handleUploadErrors,
  asyncHandler(async (req, res, next) => {
    const { assignmentId } = req.params;
    const { comments } = req.body;

    const assignment = await StudentAssignment.findById(assignmentId);

    if (!assignment || assignment.studentId.toString() !== req.user._id.toString()) {
      return next(new ErrorResponse('Assignment not found', 404));
    }

    if (!assignment.canSubmit()) {
      return next(new ErrorResponse('Submissions are not allowed at this time', 400));
    }

    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);

    const files = req.files ? req.files.map(file => ({
      public_id: file.public_id,
      url: file.url,
      fileName: file.originalname,
      fileType: file.mimetype
    })) : [];

    const submission = {
      files,
      submittedAt: now,
      isLate,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    assignment.submission = submission;
    
    assignment.submissionHistory.push({
      ...submission,
      version: assignment.submissionHistory.length + 1,
      comments
    });

    await assignment.save();

    res.status(200).json({
      success: true,
      data: assignment
    });
  })
);

router.put(
  '/unsubmit/:assignmentId',
  protect,
  restrictTo('Student'),
  asyncHandler(async (req, res, next) => {
    const { assignmentId } = req.params;

    const assignment = await StudentAssignment.findById(assignmentId);
    if (!assignment || assignment.studentId.toString() !== req.user._id.toString()) {
      return next(new ErrorResponse('Assignment not found', 404));
    }

    if (!assignment.canUnsubmit()) {
      return next(new ErrorResponse('Cannot unsubmit assignment at this time', 400));
    }

    assignment.submission = {};
    await assignment.save();

    res.status(200).json({
      success: true,
      data: assignment
    });
  })
);

router.put(
  '/grade/:assignmentId',
  protect,
  restrictTo('Teacher', 'Admin'),
  asyncHandler(async (req, res, next) => {
    const { assignmentId } = req.params;
    const { score, feedback } = req.body;

    const assignment = await StudentAssignment.findById(assignmentId)
      .populate('templateId', 'points title');

    if (!assignment) {
      return next(new ErrorResponse('Assignment not found', 404));
    }

    if (!['completed', 'past-due'].includes(assignment.status)) {
      return next(new ErrorResponse('You can only grade completed or past-due assignments', 400));
    }

    if (score < 0 || score > assignment.templateId.points) {
      return next(new ErrorResponse(`Score must be between 0 and ${assignment.templateId.points}`, 400));
    }

    assignment.grade = {
      score,
      feedback,
      gradedBy: req.user._id,
      gradedAt: new Date()
    };

    await assignment.save();

    await PointsLedger.findOneAndUpdate(
      { sourceId: assignment._id, sourceType: 'assignment' },
      {
        studentId: assignment.studentId,
        courseId: assignment.courseId,
        pointsEarned: score,
        pointsPossible: assignment.templateId.points,
        awardedAt: new Date(),
        sourceTitle: assignment.templateId.title
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      success: true,
      data: assignment
    });
  })
);

module.exports = router;