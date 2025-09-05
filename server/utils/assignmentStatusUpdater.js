const cron = require('node-cron');
const StudentAssignment = require('../models/studentAssignmentModel');

// Run every hour to update assignment statuses
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Running scheduled assignment status update...');
    const result = await StudentAssignment.updateAllStatuses();
    console.log(`Updated ${result.modifiedCount} assignment statuses`);
  } catch (error) {
    console.error('Error in scheduled status update:', error);
  }
});

module.exports = cron;