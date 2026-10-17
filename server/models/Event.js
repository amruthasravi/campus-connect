const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        'Placement',
        'Workshop',
        'Hackathon',
        'Cultural',
        'Sports',
        'Club',
        'Seminar',
        'Announcement',
        'Internship',
      ],
      default: 'Announcement',
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    venue: {
      type: String,
      required: true,
      trim: true,
    },
    registrationDeadline: {
      type: String,
      required: true,
    },
    organizer: {
      type: String,
      default: 'CampusConnect',
      trim: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    interestedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    registrations: [
      {
        student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        registeredAt: { type: Date, default: Date.now },
      },
    ],
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Event || mongoose.model('Event', eventSchema);
