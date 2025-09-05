const mongoose = require('mongoose');
const { Schema } = mongoose;

const groupSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    users: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    zoomLink: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const Group = mongoose.model('Group', groupSchema);
module.exports = Group;