const mongoose = require('mongoose');

const eventRegistrationSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true, collection: 'eventRegistrations' }
);

eventRegistrationSchema.index({ event: 1, student: 1 }, { unique: true });

module.exports =
  mongoose.models.EventRegistration || mongoose.model('EventRegistration', eventRegistrationSchema);
