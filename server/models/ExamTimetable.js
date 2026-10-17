const mongoose = require('mongoose');

const examTimetableSchema = new mongoose.Schema(
  {
    examType: {
      type: String,
      required: true,
      enum: ['IA', 'IA 1', 'IA 2', 'End Semester'],
    },
    year: {
      type: String,
      required: true,
      enum: ['1st Year', '2nd Year', '3rd Year', '4th Year'],
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 8,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    subjectCode: {
      type: String,
      trim: true,
      default: '',
    },
    date: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    venue: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

examTimetableSchema.index({ year: 1, examType: 1, date: 1, semester: 1 });

module.exports =
  mongoose.models.ExamTimetable || mongoose.model('ExamTimetable', examTimetableSchema);
