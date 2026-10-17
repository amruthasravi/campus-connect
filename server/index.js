const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const Event = require('./models/Event');
const EventRegistration = require('./models/EventRegistration');
const ExamTimetable = require('./models/ExamTimetable');

const app = express();
const PORT = process.env.PORT || 5000;
const jwtSecret = process.env.JWT_SECRET || 'campusconnect-secret';
const persistentSessionDuration = 30 * 24 * 60 * 60 * 1000;

const memory = {
  users: [],
  events: [],
  eventRegistrations: [],
  examTimetables: [],
};

const examTypes = ['IA 1', 'IA 2', 'End Semester'];
const studyYears = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const isValidExamDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
};

const validateExamTimetable = (body) => {
  const {
    examType,
    year,
    semester,
    subject,
    date,
    startTime,
    endTime,
  } = body;

  if (!examTypes.includes(examType)) return 'Choose IA 1, IA 2, or End Semester as the exam type.';
  if (!studyYears.includes(year)) return 'Choose a valid year of study.';
  if (!Number.isInteger(Number(semester)) || Number(semester) < 1 || Number(semester) > 8) {
    return 'Semester must be a number from 1 to 8.';
  }
  if (!subject?.trim()) return 'Subject name is required.';
  if (!isValidExamDate(date)) return 'Enter a valid exam date.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || '')) return 'Enter a valid start time.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime || '')) return 'Enter a valid end time.';
  if (endTime <= startTime) return 'Exam end time must be after its start time.';
  return null;
};

const buildSampleEvents = () => {
  const today = new Date();
  const dateFromOffset = (offsetDays, hour = 10) => {
    const date = new Date(today);
    date.setDate(date.getDate() + offsetDays);
    date.setHours(hour, 0, 0, 0);
    return date;
  };

  return [
    {
      title: 'Campus Placement Drive - Capgemini',
      description: 'Join our campus recruitment drive for full-time software engineering opportunities.',
      category: 'Placement',
      date: dateFromOffset(1).toISOString().split('T')[0],
      time: '10:00 AM',
      venue: 'Main Auditorium',
      registrationDeadline: dateFromOffset(0).toISOString().split('T')[0],
      organizer: 'Career Services Team',
      isFeatured: true,
      interestedStudents: [],
      savedBy: [],
    },
    {
      title: 'AI & ML Workshop',
      description: 'Hands-on workshop on machine learning pipelines, model evaluation and deployment.',
      category: 'Workshop',
      date: dateFromOffset(3, 11).toISOString().split('T')[0],
      time: '11:00 AM',
      venue: 'Innovation Lab',
      registrationDeadline: dateFromOffset(2).toISOString().split('T')[0],
      organizer: 'Department of CSE',
      isFeatured: true,
      interestedStudents: [],
      savedBy: [],
    },
    {
      title: 'CodeSprint 2026',
      description: 'A 24-hour hackathon focused on AI-powered solutions for campus challenges.',
      category: 'Hackathon',
      date: dateFromOffset(6, 9).toISOString().split('T')[0],
      time: '09:00 AM',
      venue: 'Tech Block – Room 203',
      registrationDeadline: dateFromOffset(4).toISOString().split('T')[0],
      organizer: 'Code Club',
      isFeatured: false,
      interestedStudents: [],
      savedBy: [],
    },
    {
      title: 'Cultural Fest 2026',
      description: 'An energetic two-day celebration of music, dance, art, and student talent.',
      category: 'Cultural',
      date: dateFromOffset(9, 16).toISOString().split('T')[0],
      time: '04:00 PM',
      venue: 'Open Air Theatre',
      registrationDeadline: dateFromOffset(7).toISOString().split('T')[0],
      organizer: 'Cultural Committee',
      isFeatured: true,
      interestedStudents: [],
      savedBy: [],
    },
  ];
};

const seedAdminUser = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@campusconnect.edu').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123';

  const existingMemory = memory.users.find((user) => user.email === adminEmail);
  if (!existingMemory) {
    memory.users.push({
      _id: 'admin-user',
      fullName: 'CampusConnect Admin',
      email: adminEmail,
      studentId: 'ADMIN-001',
      department: 'Administration',
      year: 'N/A',
      password: await bcrypt.hash(adminPassword, 10),
      role: 'admin',
      isVerified: true,
      savedEvents: [],
      interestedEvents: [],
    });
  }

  if (mongoose.connection.readyState === 1) {
    const adminExists = await User.findOne({ email: adminEmail });
    if (!adminExists) {
      await User.create({
        fullName: 'CampusConnect Admin',
        email: adminEmail,
        studentId: 'ADMIN-001',
        department: 'Administration',
        year: 'N/A',
        password: await bcrypt.hash(adminPassword, 10),
        role: 'admin',
        isVerified: true,
        savedEvents: [],
        interestedEvents: [],
      });
    }
  }
};

const seedEvents = async () => {
  if (mongoose.connection.readyState === 1) {
    const count = await Event.countDocuments();
    if (count === 0) {
      await Event.insertMany(buildSampleEvents());
    }
  } else if (memory.events.length === 0) {
    memory.events = buildSampleEvents();
  }
};

const migrateEventRegistrations = async () => {
  if (!isMongoConnected()) return;

  await EventRegistration.init();
  const events = await Event.find({
    $or: [
      { registrations: { $exists: true, $ne: [] } },
      { interestedStudents: { $exists: true, $ne: [] } },
    ],
  })
    .select('_id registrations interestedStudents createdAt updatedAt')
    .lean();

  for (const event of events) {
    const registrations = new Map();
    for (const registration of event.registrations || []) {
      if (registration.student) {
        registrations.set(String(registration.student), registration.registeredAt || event.createdAt);
      }
    }
    for (const studentId of event.interestedStudents || []) {
      if (!studentId) continue;
      if (!registrations.has(String(studentId))) {
        registrations.set(String(studentId), event.updatedAt || event.createdAt);
      }
    }

    const operations = [...registrations].map(([student, registeredAt]) => ({
      updateOne: {
        filter: { event: event._id, student },
        update: { $setOnInsert: { registeredAt } },
        upsert: true,
      },
    }));
    if (operations.length) {
      await EventRegistration.bulkWrite(operations, { ordered: false });
    }
  }
};

const isMongoConnected = () => mongoose.connection.readyState === 1;

const sanitizeUser = (user) => {
  if (!user) return null;
  const plainUser = user.toObject ? user.toObject() : { ...user };
  delete plainUser.password;
  return plainUser;
};

const generateToken = (user, rememberMe = true) =>
  jwt.sign(
    {
      id: user._id || user.id,
      email: user.email,
      role: user.role,
    },
    jwtSecret,
    { expiresIn: rememberMe ? '30d' : '12h' }
  );

const parseDate = (dateString) => {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const standardizeEmail = (email) => (email || '').trim().toLowerCase();

const getEventDateTime = (event) => {
  const date = parseDate(event.date);
  const timeString = event.time || '09:00 AM';
  if (!date) return null;
  const [time, modifier] = timeString.match(/(\d{1,2}):(\d{2})\s?(AM|PM)?/i)?.slice(1, 4) || ['09', '00', 'AM'];
  let hours = Number(time);
  const minutes = Number(timeString.match(/:(\d{2})/i)?.[1] || 0);
  if (modifier && modifier.toUpperCase() === 'PM' && hours < 12) hours += 12;
  if (modifier && modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;

  const value = new Date(date);
  value.setHours(hours, minutes, 0, 0);
  return value;
};

const getDiffDays = (firstDate, secondDate) => {
  const start = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
  const end = new Date(secondDate.getFullYear(), secondDate.getMonth(), secondDate.getDate());
  return (end - start) / (1000 * 60 * 60 * 24);
};

const attachTokenCookie = (res, token, rememberMe = true) => {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  if (rememberMe) {
    options.maxAge = persistentSessionDuration;
  }

  res.cookie('token', token, options);
};

const protect = async (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }

  const user = isMongoConnected()
    ? await User.findById(decoded.id).lean()
    : memory.users.find((entry) => String(entry._id) === String(decoded.id));

  if (!user) {
    return res.status(401).json({ message: 'User not found.' });
  }

  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

const listEvents = async () => {
  if (isMongoConnected()) {
    return Event.find({}).sort({ date: 1, time: 1 }).lean();
  }

  return [...memory.events].sort((a, b) => {
    const left = getEventDateTime(a)?.getTime?.() || 0;
    const right = getEventDateTime(b)?.getTime?.() || 0;
    return left - right;
  });
};

const findEventById = async (id) => {
  if (isMongoConnected()) {
    return Event.findById(id).lean();
  }

  return memory.events.find((event) => String(event._id) === String(id));
};

const updateEventData = async (id, updateData) => {
  if (isMongoConnected()) {
    return Event.findByIdAndUpdate(id, updateData, { new: true }).lean();
  }

  const eventIndex = memory.events.findIndex((item) => String(item._id) === String(id));
  if (eventIndex === -1) return null;
  memory.events[eventIndex] = { ...memory.events[eventIndex], ...updateData };
  return memory.events[eventIndex];
};

const saveEventRecord = async (payload) => {
  if (isMongoConnected()) {
    return Event.create(payload);
  }

  const newEvent = {
    _id: `evt-${Date.now()}`,
    ...payload,
    interestedStudents: [],
    savedBy: [],
  };
  memory.events.push(newEvent);
  return newEvent;
};

const findUserByEmail = async (email) => {
  const normalized = standardizeEmail(email);
  if (isMongoConnected()) {
    return User.findOne({ email: normalized });
  }
  return memory.users.find((user) => standardizeEmail(user.email) === normalized) || null;
};

const persistUser = async (userData) => {
  if (isMongoConnected()) {
    return User.create(userData);
  }

  const savedUser = {
    _id: `user-${Date.now()}`,
    ...userData,
    savedEvents: userData.savedEvents || [],
    interestedEvents: userData.interestedEvents || [],
  };
  memory.users.push(savedUser);
  return savedUser;
};

const updateUser = async (userId, updateData) => {
  if (isMongoConnected()) {
    return User.findByIdAndUpdate(userId, updateData, { new: true }).lean();
  }

  const userIndex = memory.users.findIndex((user) => String(user._id) === String(userId));
  if (userIndex === -1) return null;
  memory.users[userIndex] = { ...memory.users[userIndex], ...updateData };
  return memory.users[userIndex];
};

const createTransporter = () => {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const sendReminderEmails = async () => {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('[Reminder service] SMTP not configured. Reminder emails are disabled.');
    return;
  }

  const events = await listEvents();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const tomorrowEvents = events.filter((event) => {
    const eventDate = parseDate(event.date);
    if (!eventDate) return false;
    return getDiffDays(eventDate, tomorrow) === 0;
  });

  if (tomorrowEvents.length === 0) return;

  const users = isMongoConnected() ? await User.find({}).lean() : memory.users;
  for (const user of users) {
    if (!user.email) continue;
    const eventList = tomorrowEvents
      .map((event) => `• ${event.title} | ${event.date} at ${event.time} | ${event.venue}`)
      .join('\n');

    await transporter.sendMail({
      from: process.env.FROM_EMAIL || 'noreply@campusconnect.edu',
      to: user.email,
      subject: 'CampusConnect reminder: events happening tomorrow',
      text: `Hello ${user.fullName || 'Student'},\n\nYou have upcoming campus events tomorrow:\n\n${eventList}\n\nDon’t miss the chance to participate!`,
    });
  }
};

cron.schedule('0 8 * * *', async () => {
  try {
    await sendReminderEmails();
  } catch (error) {
    console.error('Reminder job failed:', error.message);
  }
});

app.use(helmet());
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: isMongoConnected() ? 'MongoDB connected' : 'Memory fallback',
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, studentId, department, year, password, confirmPassword } = req.body;

  if (!fullName || !email || !studentId || !department || !year || !password || !confirmPassword) {
    return res.status(400).json({ message: 'Please complete all required fields.' });
  }
  if (typeof email !== 'string' || typeof studentId !== 'string') {
    return res.status(400).json({ message: 'Enter a valid email address and student ID / USN.' });
  }

  const normalizedEmail = standardizeEmail(email);
  const normalizedStudentId = studentId.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }

  const userExists = await findUserByEmail(normalizedEmail);
  if (userExists) {
    return res.status(409).json({ message: 'A student with this email already exists.' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await persistUser({
    fullName,
    email: normalizedEmail,
    studentId: normalizedStudentId.toLowerCase(),
    department,
    year,
    password: hashedPassword,
    role: 'student',
    isVerified: false,
    savedEvents: [],
    interestedEvents: [],
  });

  const token = generateToken(user);
  attachTokenCookie(res, token);

  return res.status(201).json({
    message: 'Student registration successful.',
    user: sanitizeUser(user),
    token,
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, rememberMe = true } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const normalizedEmail = standardizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  const user = await findUserByEmail(normalizedEmail);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const token = generateToken(user, Boolean(rememberMe));
  attachTokenCookie(res, token, Boolean(rememberMe));

  res.json({
    message: 'Login successful.',
    user: sanitizeUser(user),
    token,
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/auth/me', async (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.cookies?.token;
  if (!token) {
    return res.json({ user: null });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch {
    res.clearCookie('token');
    return res.json({ user: null });
  }

  const user = isMongoConnected()
    ? await User.findById(decoded.id).lean()
    : memory.users.find((entry) => String(entry._id) === String(decoded.id));

  if (!user) {
    res.clearCookie('token');
  }

  return res.json({ user: sanitizeUser(user) });
});

app.get('/api/events', async (req, res) => {
  try {
    const events = await listEvents();
    res.json({ events });
  } catch (error) {
    console.error('Unable to fetch events:', error.message);
    res.status(500).json({ message: 'Unable to fetch events.' });
  }
});

app.get('/api/admin/students', protect, requireAdmin, async (req, res) => {
  const students = isMongoConnected()
    ? await User.find({ role: 'student' })
        .select('fullName email studentId department year createdAt')
        .sort({ createdAt: -1 })
        .lean()
    : memory.users
        .filter((user) => user.role === 'student')
        .map(({ _id, fullName, email, studentId, department, year, createdAt }) => ({
          _id,
          fullName,
          email,
          studentId,
          department,
          year,
          createdAt,
        }))
        .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));

  return res.json({
    students,
    source: isMongoConnected() ? 'MongoDB' : 'Memory fallback',
  });
});

const escapeCsvCell = (value) => {
  const cell = String(value ?? '');
  const safeCell = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
  return `"${safeCell.replace(/"/g, '""')}"`;
};

app.get('/api/admin/events/:id/registrations.csv', protect, requireAdmin, async (req, res) => {
  let event;
  if (isMongoConnected()) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    event = await Event.findById(req.params.id)
      .populate({ path: 'registrations.student', select: 'fullName email studentId department year' })
      .populate({ path: 'interestedStudents', select: 'fullName email studentId department year' })
      .lean();
  } else {
    event = await findEventById(req.params.id);
  }

  if (!event) {
    return res.status(404).json({ message: 'Event not found.' });
  }
  const eventDate = parseDate(event.date);
  if (!eventDate || eventDate < new Date(new Date().setHours(0, 0, 0, 0))) {
    return res.status(400).json({ message: 'Registration exports are available for upcoming events only.' });
  }

  const registrations = new Map();
  if (isMongoConnected()) {
    const savedRegistrations = await EventRegistration.find({ event: event._id })
      .populate({ path: 'student', select: 'fullName email studentId department year' })
      .lean();
    for (const registration of savedRegistrations) {
      if (registration.student) {
        registrations.set(String(registration.student._id), {
          student: registration.student,
          registeredAt: registration.registeredAt,
        });
      }
    }
  } else {
    for (const registration of memory.eventRegistrations.filter(
      (entry) => String(entry.event) === String(event._id)
    )) {
      const student = memory.users.find((user) => String(user._id) === String(registration.student));
      if (student) {
        registrations.set(String(student._id), { student, registeredAt: registration.registeredAt });
      }
    }
  }
  for (const registration of event.registrations || []) {
    const student = registration.student && typeof registration.student === 'object'
      ? registration.student
      : memory.users.find((user) => String(user._id) === String(registration.student));
    if (student && typeof student === 'object') {
      registrations.set(String(student._id), { student, registeredAt: registration.registeredAt });
    }
  }
  for (const value of event.interestedStudents || []) {
    const student = value && typeof value === 'object'
      ? value
      : memory.users.find((user) => String(user._id) === String(value));
    if (student && !registrations.has(String(student._id))) {
      registrations.set(String(student._id), { student, registeredAt: '' });
    }
  }

  const header = ['Event', 'Student name', 'USN', 'Email', 'Department', 'Year', 'Registered at'];
  const rows = [...registrations.values()]
    .map(({ student, registeredAt }) => [
      event.title,
      student.fullName,
      student.studentId,
      student.email,
      student.department,
      student.year,
      registeredAt ? new Date(registeredAt).toISOString() : '',
    ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  const filename = `${(event.title || 'event').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '')}-registrations.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(`\uFEFF${csv}`);
});

app.get('/api/exam-timetables', async (req, res) => {
  const filters = {};
  if (req.query.year && studyYears.includes(req.query.year)) {
    filters.year = req.query.year;
  }
  if (req.query.examType && examTypes.includes(req.query.examType)) {
    filters.examType = req.query.examType === 'IA 1'
      ? { $in: ['IA 1', 'IA'] }
      : req.query.examType;
  }

  const schedules = isMongoConnected()
    ? await ExamTimetable.find(filters)
        .sort({ date: 1, startTime: 1, semester: 1 })
        .lean()
    : memory.examTimetables
        .filter((schedule) =>
          (!filters.year || schedule.year === filters.year) &&
          (!filters.examType ||
            (Array.isArray(filters.examType.$in)
              ? filters.examType.$in.includes(schedule.examType)
              : schedule.examType === filters.examType))
        )
        .sort((first, second) =>
          first.date.localeCompare(second.date) ||
          first.startTime.localeCompare(second.startTime) ||
          first.semester - second.semester
        );

  return res.json({
    schedules,
    source: isMongoConnected() ? 'MongoDB' : 'Memory fallback',
  });
});

app.post('/api/exam-timetables', protect, requireAdmin, async (req, res) => {
  const validationError = validateExamTimetable(req.body);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const scheduleData = {
    examType: req.body.examType,
    year: req.body.year,
    semester: Number(req.body.semester),
    subject: req.body.subject.trim(),
    subjectCode: req.body.subjectCode?.trim() || '',
    date: req.body.date,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    venue: req.body.venue?.trim() || '',
    createdBy: req.user._id,
  };

  const schedule = isMongoConnected()
    ? await ExamTimetable.create(scheduleData)
    : {
        _id: `exam-${Date.now()}`,
        ...scheduleData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  if (!isMongoConnected()) memory.examTimetables.push(schedule);
  return res.status(201).json({ message: 'Exam timetable entry added.', schedule });
});

app.put('/api/exam-timetables/:id', protect, requireAdmin, async (req, res) => {
  const validationError = validateExamTimetable(req.body);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const updateData = {
    examType: req.body.examType,
    year: req.body.year,
    semester: Number(req.body.semester),
    subject: req.body.subject.trim(),
    subjectCode: req.body.subjectCode?.trim() || '',
    date: req.body.date,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    venue: req.body.venue?.trim() || '',
  };

  let schedule;
  if (isMongoConnected()) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Exam timetable entry not found.' });
    }
    schedule = await ExamTimetable.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).lean();
  } else {
    const index = memory.examTimetables.findIndex((entry) => entry._id === req.params.id);
    if (index !== -1) {
      memory.examTimetables[index] = {
        ...memory.examTimetables[index],
        ...updateData,
        updatedAt: new Date().toISOString(),
      };
      schedule = memory.examTimetables[index];
    }
  }

  if (!schedule) {
    return res.status(404).json({ message: 'Exam timetable entry not found.' });
  }
  return res.json({ message: 'Exam timetable entry updated.', schedule });
});

app.delete('/api/exam-timetables/:id', protect, requireAdmin, async (req, res) => {
  let deleted;
  if (isMongoConnected()) {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Exam timetable entry not found.' });
    }
    deleted = await ExamTimetable.findByIdAndDelete(req.params.id);
  } else {
    const index = memory.examTimetables.findIndex((entry) => entry._id === req.params.id);
    if (index !== -1) {
      [deleted] = memory.examTimetables.splice(index, 1);
    }
  }

  if (!deleted) {
    return res.status(404).json({ message: 'Exam timetable entry not found.' });
  }
  return res.json({ message: 'Exam timetable entry deleted.' });
});

app.post('/api/events', protect, requireAdmin, async (req, res) => {
  const { title, description, category, date, time, venue, organizer, registrationDeadline, isFeatured } = req.body;

  if (!title || !description || !category || !date || !time || !venue || !registrationDeadline) {
    return res.status(400).json({ message: 'Please fill in all required event details.' });
  }

  const event = await saveEventRecord({
    title,
    description,
    category,
    date,
    time,
    venue,
    organizer: organizer || 'CampusConnect',
    registrationDeadline,
    isFeatured: Boolean(isFeatured),
    createdBy: req.user._id,
    interestedStudents: [],
    savedBy: [],
  });

  res.status(201).json({ message: 'Event published successfully.', event });
});

app.post('/api/events/:id/interest', protect, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Only student accounts can sign up for events.' });
  }

  const event = await findEventById(req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found.' });
  }

  const eventDateTime = getEventDateTime(event);
  const registrationDeadline = parseDate(event.registrationDeadline);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (
    !eventDateTime ||
    eventDateTime < new Date() ||
    !registrationDeadline ||
    registrationDeadline < today
  ) {
    return res.status(400).json({ message: 'Registration is available only for upcoming events before the deadline.' });
  }

  const userId = req.user._id || req.user.id;
  const storedRegistration = isMongoConnected()
    ? await EventRegistration.findOne({ event: req.params.id, student: userId }).lean()
    : memory.eventRegistrations.find(
        (registration) =>
          String(registration.event) === String(req.params.id) &&
          String(registration.student) === String(userId)
      );
  const interestAlreadyExists = (event.interestedStudents || []).some((id) => String(id) === String(userId));

  if (interestAlreadyExists || storedRegistration) {
    return res.status(409).json({ message: 'You already registered interest for this event.' });
  }

  const registeredAt = new Date();
  if (isMongoConnected()) {
    await EventRegistration.create({
      event: req.params.id,
      student: userId,
      registeredAt,
    });
  } else {
    memory.eventRegistrations.push({
      _id: `event-registration-${Date.now()}`,
      event: req.params.id,
      student: userId,
      registeredAt: registeredAt.toISOString(),
    });
  }

  const updatedEvent = await updateEventData(req.params.id, {
    interestedStudents: [...(event.interestedStudents || []), userId],
    registrations: [
      ...(event.registrations || []),
      { student: userId, registeredAt },
    ],
  });

  const updatedUser = await updateUser(userId, {
    interestedEvents: [...(req.user.interestedEvents || []), req.params.id],
  });

  res.json({
    message: 'Interest registered successfully.',
    event: updatedEvent,
    user: sanitizeUser(updatedUser || req.user),
  });
});

app.delete('/api/events/:id/interest', protect, async (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Only student accounts can manage event registrations.' });
  }
  if (isMongoConnected() && !mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Event not found.' });
  }

  const event = await findEventById(req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found.' });
  }

  const userId = req.user._id || req.user.id;
  if (isMongoConnected()) {
    await EventRegistration.deleteOne({ event: req.params.id, student: userId });
  } else {
    memory.eventRegistrations = memory.eventRegistrations.filter(
      (registration) =>
        String(registration.event) !== String(req.params.id) ||
        String(registration.student) !== String(userId)
    );
  }

  const updatedEvent = isMongoConnected()
    ? await Event.findByIdAndUpdate(
        req.params.id,
        {
          $pull: {
            interestedStudents: userId,
            registrations: { student: userId },
          },
        },
        { new: true }
      ).lean()
    : await updateEventData(req.params.id, {
        interestedStudents: (event.interestedStudents || []).filter(
          (id) => String(id) !== String(userId)
        ),
        registrations: (event.registrations || []).filter(
          (registration) => String(registration.student) !== String(userId)
        ),
      });

  const updatedUser = await updateUser(userId, {
    interestedEvents: (req.user.interestedEvents || []).filter(
      (id) => String(id) !== String(req.params.id)
    ),
  });

  return res.json({
    message: 'Event registration cancelled.',
    event: updatedEvent,
    user: sanitizeUser(updatedUser || req.user),
  });
});

app.post('/api/events/:id/save', protect, async (req, res) => {
  const event = await findEventById(req.params.id);
  if (!event) {
    return res.status(404).json({ message: 'Event not found.' });
  }

  const userId = req.user._id || req.user.id;
  const isSaved = (event.savedBy || []).some((id) => String(id) === String(userId));

  const updatedSavedBy = isSaved
    ? (event.savedBy || []).filter((id) => String(id) !== String(userId))
    : [...(event.savedBy || []), userId];

  const updatedEvent = await updateEventData(req.params.id, { savedBy: updatedSavedBy });

  const savedEvents = isSaved
    ? (req.user.savedEvents || []).filter((id) => String(id) !== String(req.params.id))
    : [...(req.user.savedEvents || []), req.params.id];

  const updatedUser = await updateUser(userId, { savedEvents });

  res.json({
    message: isSaved ? 'Event removed from saved list.' : 'Event saved successfully.',
    isSaved: !isSaved,
    event: updatedEvent,
    user: sanitizeUser(updatedUser || req.user),
  });
});

app.get('/api/dashboard', protect, async (req, res) => {
  const events = await listEvents();
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const tomorrowEvents = events.filter((event) => {
    const eventDate = parseDate(event.date);
    return eventDate && eventDate.toDateString() === tomorrow.toDateString();
  });

  const user = sanitizeUser(req.user);
  res.json({
    user,
    stats: {
      totalEvents: events.length,
      upcomingEvents: events.filter((event) => parseDate(event.date) >= today).length,
      tomorrowCount: tomorrowEvents.length,
    },
    tomorrowEvents,
    events,
  });
});

const startServer = async () => {
  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI);
      console.log('MongoDB connected successfully.');
    }
  } catch (error) {
    console.error('MongoDB connection failed. Using in-memory data storage fallback:', error.message);
  }

  await seedAdminUser();
  await seedEvents();
  await migrateEventRegistrations();

  app.listen(PORT, () => {
    console.log(`CampusConnect API running on http://localhost:${PORT}`);
  });
};

startServer();
