import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import {
  FaArrowRight,
  FaBell,
  FaBookmark,
  FaCalendarAlt,
  FaCheckCircle,
  FaClock,
  FaMapMarkerAlt,
  FaSearch,
  FaSignInAlt,
  FaSignOutAlt,
  FaTimesCircle,
  FaUserPlus,
} from 'react-icons/fa';
import { format } from 'date-fns';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const API = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});
const authTokenKey = 'campusconnect-token';

const getToken = () => localStorage.getItem(authTokenKey);

API.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const categoryMeta = {
  Placement: { accent: 'blue' },
  Workshop: { accent: 'cyan' },
  Hackathon: { accent: 'purple' },
  Cultural: { accent: 'pink' },
  Sports: { accent: 'green' },
  Club: { accent: 'orange' },
  Seminar: { accent: 'indigo' },
  Internship: { accent: 'teal' },
  Announcement: { accent: 'gray' },
};

const setToken = (token, rememberMe = true) => {
  if (token && rememberMe) {
    localStorage.setItem(authTokenKey, token);
  } else {
    localStorage.removeItem(authTokenKey);
  }
};

const getDisplayDate = (dateString) => {
  if (!dateString) return 'Date TBD';
  const value = new Date(dateString);
  if (Number.isNaN(value.getTime())) return dateString;
  return format(value, 'dd MMMM yyyy');
};

const getEventDate = (dateString) => {
  if (!dateString) return null;
  const value = new Date(dateString);
  return Number.isNaN(value.getTime()) ? null : value;
};

const getCalendarDateTime = (dateString, timeString) => {
  const dateParts = dateString?.split('-').map(Number);
  const timeParts = timeString?.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!dateParts || dateParts.length !== 3 || !timeParts) return null;

  const [year, month, day] = dateParts;
  let hours = Number(timeParts[1]);
  const minutes = Number(timeParts[2]);
  const modifier = timeParts[3]?.toUpperCase();
  if (modifier === 'PM' && hours < 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  const value = new Date(year, month - 1, day, hours, minutes);
  if (
    value.getFullYear() !== year ||
    value.getMonth() !== month - 1 ||
    value.getDate() !== day
  ) {
    return null;
  }
  return value;
};

const getTomorrowsList = (events = []) => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return (events || []).filter((event) => {
    const eventDate = getEventDate(event.date);
    if (!eventDate) return false;
    return (
      eventDate.getFullYear() === tomorrow.getFullYear() &&
      eventDate.getMonth() === tomorrow.getMonth() &&
      eventDate.getDate() === tomorrow.getDate()
    );
  });
};

const formatUserName = (value) => {
  if (!value) return 'Student';
  return value.split(' ')[0];
};

function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEvents = async () => {
    try {
      const { data } = await API.get('/events');
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error('Unable to load events right now.');
    }
  };

  const fetchDashboard = async () => {
    try {
      const { data } = await API.get('/dashboard');
      setDashboard(data);
      setEvents(data.events || []);
      setUser(data.user);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      toast.error('Unable to load your dashboard.');
    }
  };

  const refreshData = async () => {
    if (user) {
      await fetchDashboard();
    } else {
      await fetchEvents();
    }
  };

  useEffect(() => {
    const bootstrapUser = async () => {
      try {
        const { data } = await API.get('/auth/me');
        if (data.user) {
          setUser(data.user);
          await fetchDashboard();
        } else {
          setToken(null);
          await fetchEvents();
        }
      } catch (error) {
        console.error('Unable to restore the session:', error);
        toast.error('Unable to check your login session. Showing public events.');
        setToken(null);
        setUser(null);
        await fetchEvents();
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapUser();
  }, []);

  const handleAuthSuccess = (userData, token, rememberMe = true) => {
    setToken(token, rememberMe);
    setUser(userData);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  };

  const handleLogout = async () => {
    try {
      await API.post('/auth/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
      toast.error('The server could not confirm logout. Your local session was cleared.');
    }

    setToken(null);
    setUser(null);
    setDashboard(null);
    await fetchEvents();
  };

  const handleEventToggle = async (eventId, action) => {
    if (!user) {
      toast.error('Please log in to save or register interest for an event.');
      return;
    }

    try {
      const { data } = await API.post(`/events/${eventId}/${action}`);
      if (data.user) setUser(data.user);
      await refreshData();
      toast.success(
        action === 'interest'
          ? 'Event registered! Your saved student details were used.'
          : data.isSaved
            ? 'Event saved successfully.'
            : 'Event removed from saved events.'
      );
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to update event.');
    }
  };

  const handleCancelRegistration = async (eventId) => {
    try {
      const { data } = await API.delete(`/events/${eventId}/interest`);
      if (data.user) setUser(data.user);
      await refreshData();
      toast.success('Event registration cancelled.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to cancel event registration.');
    }
  };

  const allEvents = useMemo(() => [...events].sort((a, b) => new Date(a.date) - new Date(b.date)), [events]);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <div className="spinner" />
          <p>Preparing CampusConnect for you...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Toaster position="top-right" reverseOrder={false} />
        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                user={user}
                events={allEvents}
                onLogout={handleLogout}
                onToggleInterest={(eventId) => handleEventToggle(eventId, 'interest')}
                onToggleSave={(eventId) => handleEventToggle(eventId, 'save')}
              />
            }
          />
          <Route
            path="/login"
            element={<LoginPage onAuthSuccess={handleAuthSuccess} user={user} />}
          />
          <Route
            path="/register"
            element={<RegisterPage onAuthSuccess={handleAuthSuccess} user={user} />}
          />
          <Route
            path="/exam-timetable"
            element={<ExamTimetablePage user={user} onLogout={handleLogout} />}
          />
          <Route
            path="/dashboard"
            element={
              user ? (
                <DashboardPage
                  user={user}
                  dashboard={dashboard}
                  events={allEvents}
                  onLogout={handleLogout}
                  onRefresh={refreshData}
                  onToggleInterest={(eventId) => handleEventToggle(eventId, 'interest')}
                  onToggleSave={(eventId) => handleEventToggle(eventId, 'save')}
                  onCancelRegistration={handleCancelRegistration}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/admin"
            element={
              user && user.role === 'admin' ? (
                <AdminPage user={user} events={allEvents} onLogout={handleLogout} onRefresh={refreshData} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

function AppHeader({ user, onLogout }) {
  return (
    <header className="topbar">
      <div className="container nav-wrap">
        <Link to="/" className="brand">
          <span className="brand-mark">C</span>
          CampusConnect
        </Link>

        <nav className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/dashboard">Dashboard</Link>
          {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
        </nav>

        <div className="nav-actions">
          {user ? (
            <>
              <span className="welcome-pill">Hi, {formatUserName(user.fullName)}</span>
              <button type="button" className="action-button logout-action" onClick={onLogout}>
                <FaSignOutAlt aria-hidden="true" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="action-button login-action">
                <FaSignInAlt aria-hidden="true" />
                Student Login
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function LandingPage({ user, events, onLogout, onToggleInterest, onToggleSave }) {
  const [query, setQuery] = useState('');
  const [registrationEvent, setRegistrationEvent] = useState(null);
  const searchResultsRef = useRef(null);
  const filteredEvents = useMemo(() => {
    const searchValue = query.trim().toLowerCase();
    if (!searchValue) return events;
    return events.filter(
      (event) =>
        event.title.toLowerCase().includes(searchValue) ||
        event.category.toLowerCase().includes(searchValue) ||
        event.venue.toLowerCase().includes(searchValue)
    );
  }, [events, query]);

  const featured = events.filter((event) => event.isFeatured).slice(0, 3);
  const placementHighlights = events.filter((event) => event.category === 'Placement').slice(0, 3);

  return (
    <>
      <AppHeader user={user} onLogout={onLogout} />

      <main className="page-shell">
        <section className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Never Miss a Campus Opportunity!</span>
              <h1>Discover events, drives, and opportunities across your campus.</h1>
              <p>
                CampusConnect helps students stay updated with placement drives, coding events,
                workshops, festivals, club activities, and important deadlines from one smart portal.
              </p>

              <div className="search-panel">
                <FaSearch />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search events, categories, or venue"
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => searchResultsRef.current?.scrollIntoView({ behavior: 'smooth' })}
                >
                  Search Events
                </button>
              </div>

              <div className="cta-row">
                <Link to="/dashboard" className="primary-btn">
                  Explore Events
                </Link>
                {!user && (
                  <>
                    <Link to="/login" className="secondary-btn">
                      Student Login
                    </Link>
                    <Link to="/register" className="secondary-btn">
                      <FaUserPlus aria-hidden="true" />
                      Student Registration
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="hero-side">
              <img
                className="hero-illustration"
                src="/campus-hero.svg"
                alt=""
                aria-hidden="true"
              />
              <div className="mini-card spotlight">
                <span className="status-key">Tomorrow at a glance</span>
                <h3>Campus Opportunity Board</h3>
                {getTomorrowsList(events).length > 0 ? (
                  getTomorrowsList(events).map((event) => (
                    <button
                      key={event._id}
                      type="button"
                      className="spotlight-item"
                      onClick={() => setRegistrationEvent(event)}
                      aria-label={`Open registration for ${event.title}`}
                    >
                      <strong>{event.title}</strong>
                      <span>{event.date} • {event.time}</span>
                      <span className="spotlight-action">Register interest <FaArrowRight /></span>
                    </button>
                  ))
                ) : (
                  <p className="muted">No event is scheduled for tomorrow.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="container section-block">
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Featured events</span>
              <h2>Trending on campus</h2>
            </div>
            <Link to="/dashboard" className="text-link">View all events</Link>
          </div>

          <div className="card-grid three-up">
            {featured.map((event) => (
              <EventCard
                key={event._id}
                event={event}
                onToggleInterest={() => onToggleInterest(event._id)}
                onToggleSave={() => onToggleSave(event._id)}
                user={user}
              />
            ))}
          </div>
        </section>

        <section className="container section-block alt-bg">
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Career boost</span>
              <h2>Placement opportunities</h2>
            </div>
          </div>

          <div className="card-grid three-up">
            {placementHighlights.map((event) => (
              <EventCard
                key={event._id}
                event={event}
                onToggleInterest={() => onToggleInterest(event._id)}
                onToggleSave={() => onToggleSave(event._id)}
                user={user}
              />
            ))}
          </div>
        </section>

        <section className="container section-block">
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Explore by category</span>
              <h2>Student favorites</h2>
            </div>
          </div>

          <div className="category-grid">
            {Object.keys(categoryMeta).map((category) => (
              <div key={category} className="category-card">
                <span className={`chip ${categoryMeta[category].accent}`}>{category}</span>
                <p>
                  {events.filter((event) => event.category === category).length} upcoming events
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="container section-block no-top-gap" ref={searchResultsRef}>
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Search results</span>
              <h2>All matching events</h2>
            </div>
          </div>

          <div className="card-grid">
            {filteredEvents.length > 0 ? (
              filteredEvents.slice(0, 8).map((event) => (
                <EventCard
                  key={event._id}
                  event={event}
                  onToggleInterest={() => onToggleInterest(event._id)}
                  onToggleSave={() => onToggleSave(event._id)}
                  user={user}
                />
              ))
            ) : (
              <div className="empty-state">No events match your current search.</div>
            )}
          </div>
        </section>
      </main>

      <Footer />
      {registrationEvent && (
        <div
          className="registration-overlay"
          onClick={() => setRegistrationEvent(null)}
        >
          <section
            className="registration-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="registration-close"
              onClick={() => setRegistrationEvent(null)}
              aria-label="Close event registration"
            >
              ×
            </button>
            <span className={`chip ${categoryMeta[registrationEvent.category]?.accent || 'gray'}`}>
              {registrationEvent.category}
            </span>
            <h2 id="registration-title">{registrationEvent.title}</h2>
            <p className="registration-description">{registrationEvent.description}</p>
            <div className="registration-details">
              <p><FaCalendarAlt /> {getDisplayDate(registrationEvent.date)} at {registrationEvent.time}</p>
              <p><FaMapMarkerAlt /> {registrationEvent.venue}</p>
              <p><FaCheckCircle /> Registration deadline: {getDisplayDate(registrationEvent.registrationDeadline)}</p>
            </div>
            {user ? (
              <>
                <p className="registration-profile-note">
                  Registration uses your saved student profile: {user.fullName} · {user.studentId}
                </p>
                {isEventRegistered(user, registrationEvent._id) ? (
                  <button type="button" className="primary-btn full-width" disabled>
                    Registered
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary-btn full-width"
                    onClick={() => {
                      onToggleInterest(registrationEvent._id);
                      setRegistrationEvent(null);
                    }}
                  >
                    Register for event
                  </button>
                )}
              </>
            ) : (
              <Link
                to="/login"
                state={{ registerEventId: registrationEvent._id }}
                className="primary-btn full-width"
              >
                <FaUserPlus aria-hidden="true" />
                Login to register interest
              </Link>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function LoginPage({ onAuthSuccess, user }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [navigate, user]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      const { data } = await API.post('/auth/login', { ...form, rememberMe });
      onAuthSuccess(data.user, data.token, rememberMe);
      toast.success('Login successful.');
      if (location.state?.registerEventId) {
        try {
          await API.post(`/events/${location.state.registerEventId}/interest`);
          toast.success('Event registration successful.');
        } catch (error) {
          toast.error(error.response?.data?.message || 'You are signed in, but event registration could not be completed.');
        }
      }
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed. Please try again.');
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to view your opportunities.">
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="field-group">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={onChange}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="field-group">
          <label htmlFor="password">Password</label>
          <div className="password-row">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={onChange}
              placeholder="Enter your password"
              required
            />
            <button type="button" onClick={() => setShowPassword((previous) => !previous)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="form-meta">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Keep me signed in for 30 days</span>
          </label>
          <a href="#">Forgot password?</a>
        </div>

        <button type="submit" className="primary-btn full-width">
          <FaSignInAlt /> Login
        </button>

        <p className="auth-switch">
          New student? <Link to="/register" state={location.state}>Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function RegisterPage({ onAuthSuccess, user }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    studentId: '',
    department: '',
    year: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [navigate, user]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      const { data } = await API.post('/auth/register', form);
      onAuthSuccess(data.user, data.token);
      toast.success('Registration successful. Welcome to CampusConnect!');
      if (location.state?.registerEventId) {
        try {
          await API.post(`/events/${location.state.registerEventId}/interest`);
          toast.success('Event registration successful.');
        } catch (error) {
          toast.error(error.response?.data?.message || 'Your account is ready, but event registration could not be completed.');
        }
      }
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Registration failed.');
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Join CampusConnect and never miss an opportunity.">
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="grid-two">
          <div className="field-group">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" value={form.fullName} onChange={onChange} required />
          </div>

          <div className="field-group">
            <label htmlFor="studentId">Student ID / USN</label>
            <input
              id="studentId"
              name="studentId"
              value={form.studentId}
              onChange={onChange}
              placeholder="Enter your student ID or USN"
              required
            />
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={onChange}
            placeholder="you@example.com"
            required
          />
        </div>

        <div className="grid-two">
          <div className="field-group">
            <label htmlFor="department">Department</label>
            <input id="department" name="department" value={form.department} onChange={onChange} required />
          </div>

          <div className="field-group">
            <label htmlFor="year">Year of study</label>
            <select id="year" name="year" value={form.year} onChange={onChange} required>
              <option value="">Select year</option>
              <option value="1st Year">1st Year</option>
              <option value="2nd Year">2nd Year</option>
              <option value="3rd Year">3rd Year</option>
              <option value="4th Year">4th Year</option>
            </select>
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="password">Password</label>
          <div className="password-row">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={onChange}
              minLength={8}
              required
            />
            <button type="button" onClick={() => setShowPassword((previous) => !previous)}>
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={onChange}
            required
          />
        </div>

        <button type="submit" className="primary-btn full-width">
          Register as Student
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

function DashboardPage({
  user,
  dashboard,
  events,
  onLogout,
  onRefresh,
  onToggleInterest,
  onToggleSave,
  onCancelRegistration,
}) {
  const [todayLabel] = useState(() =>
    new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  );
  const tomorrowEvents = getTomorrowsList(events);
  const savedEvents = events.filter((event) => isEventSaved(user, event._id));
  const registeredEvents = events.filter((event) => isEventRegistered(user, event._id));
  const stats = dashboard?.stats || {
    totalEvents: events.length,
    upcomingEvents: events.length,
    tomorrowCount: tomorrowEvents.length,
  };

  const addToCalendar = (event) => {
    const start = getCalendarDateTime(event.date, event.time);
    if (!start) {
      toast.error('This event has an invalid date or time and cannot be added to your calendar.');
      return;
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const escapeIcsText = (value) =>
      String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      `UID:${event._id}@campusconnect`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTEND:${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      `LOCATION:${escapeIcsText(event.venue)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/\s+/g, '-')}.ics`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Calendar file downloaded.');
  };

  return (
    <>
      <AppHeader user={user} onLogout={onLogout} />
      <main className="page-shell dashboard-page">
        <section className="container">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow alt">Student dashboard</span>
              <h1>Welcome back, {user.fullName}!</h1>
            </div>
            <button type="button" className="outline-button" onClick={onRefresh}>
              Refresh
            </button>
          </div>

          <div className="date-banner">
            <FaCalendarAlt /> {todayLabel}
            <span>Explore your next opportunity and stay ahead of deadlines.</span>
          </div>

          {tomorrowEvents.length > 0 ? (
            <div className="reminder-panel">
              <div className="reminder-header">
                <FaBell />
                <span>REMINDER: TOMORROW!</span>
              </div>

              {tomorrowEvents.map((event) => (
                <div key={event._id} className="reminder-card">
                  <div className="reminder-copy">
                    <h3>{event.title}</h3>
                    <p>
                      <strong>Date:</strong> {getDisplayDate(event.date)}
                    </p>
                    <p>
                      <strong>Time:</strong> {event.time}
                    </p>
                    <p>
                      <strong>Venue:</strong> {event.venue}
                    </p>
                    <p>
                      <strong>Registration deadline:</strong> {getDisplayDate(event.registrationDeadline)}
                    </p>
                  </div>
                  <div className="reminder-actions">
                    <button type="button" className="secondary-btn">View Details</button>
                    {isEventRegistered(user, event._id) ? (
                      <button type="button" className="primary-btn" disabled>Registered</button>
                    ) : (
                      <button type="button" className="primary-btn" onClick={() => onToggleInterest(event._id)}>
                        Register for event
                      </button>
                    )}
                    <button type="button" className="outline-button" onClick={() => addToCalendar(event)}>
                      Add to My Calendar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="stats-grid">
            <div className="stat-card dark">
              <span>Total events</span>
              <strong>{stats.totalEvents}</strong>
            </div>
            <div className="stat-card blue">
              <span>Upcoming</span>
              <strong>{stats.upcomingEvents}</strong>
            </div>
            <div className="stat-card green">
              <span>Tomorrow</span>
              <strong>{stats.tomorrowCount}</strong>
            </div>
          </div>
        </section>

        <section className="container section-block no-top-gap">
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Your activity</span>
              <h2>Registered events ({registeredEvents.length})</h2>
            </div>
          </div>
          <div className="card-grid">
            {registeredEvents.length ? (
              registeredEvents.map((event) => (
                <EventCard
                  key={event._id}
                  event={event}
                  user={user}
                  showSaveAction={false}
                  onCancelRegistration={() => onCancelRegistration(event._id)}
                />
              ))
            ) : (
              <div className="empty-state">You have not registered for any events yet.</div>
            )}
          </div>
        </section>

        <section className="container section-block no-top-gap">
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Bookmarked by you</span>
              <h2>Saved events ({savedEvents.length})</h2>
            </div>
          </div>
          <div className="card-grid">
            {savedEvents.length ? (
              savedEvents.map((event) => (
                <EventCard
                  key={event._id}
                  event={event}
                  user={user}
                  onToggleSave={() => onToggleSave(event._id)}
                  showRegistrationAction={false}
                />
              ))
            ) : (
              <div className="empty-state">You have not saved any events yet.</div>
            )}
          </div>
        </section>

        <section className="container section-block no-top-gap">
          <div className="section-header">
            <div>
              <span className="eyebrow alt">Your feed</span>
              <h2>Upcoming opportunities</h2>
            </div>
          </div>

          <div className="card-grid">
            {events.length > 0 ? (
              events.slice(0, 8).map((event) => (
                <EventCard
                  key={event._id}
                  event={event}
                  onToggleInterest={() => onToggleInterest(event._id)}
                  onToggleSave={() => onToggleSave(event._id)}
                  user={user}
                />
              ))
            ) : (
              <div className="empty-state">No events available right now. Check back soon.</div>
            )}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

function ExamTimetablePage({ user, onLogout }) {
  const [searchParams] = useSearchParams();
  const emptyForm = {
    examType: 'End Semester',
    year: '1st Year',
    semester: '1',
    subject: '',
    subjectCode: '',
    date: '',
    startTime: '',
    endTime: '',
    venue: '',
  };
  const [schedules, setSchedules] = useState([]);
  const [selectedYear, setSelectedYear] = useState('All years');
  const [selectedType, setSelectedType] = useState(
    searchParams.get('examType') === 'IA 2' ? 'IA 2' : 'All exams'
  );
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadSchedules = async () => {
    try {
      const { data } = await API.get('/exam-timetables');
      setSchedules(data.schedules || []);
    } catch (error) {
      console.error('Unable to load exam timetables:', error);
      toast.error(error.response?.data?.message || 'Unable to load the exam timetable.');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSchedules = () => {
    setIsLoading(true);
    loadSchedules();
  };

  useEffect(() => {
    let isMounted = true;

    API.get('/exam-timetables')
      .then(({ data }) => {
        if (isMounted) setSchedules(data.schedules || []);
      })
      .catch((error) => {
        console.error('Unable to load exam timetables:', error);
        if (isMounted) {
          toast.error(error.response?.data?.message || 'Unable to load the exam timetable.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleSchedules = useMemo(
    () =>
      schedules.filter(
        (schedule) =>
          (selectedYear === 'All years' || schedule.year === selectedYear) &&
          (selectedType === 'All exams' || schedule.examType === selectedType)
      ),
    [schedules, selectedType, selectedYear]
  );

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const startEdit = (schedule) => {
    setEditingId(schedule._id);
    setForm({
      examType: schedule.examType,
      year: schedule.year,
      semester: String(schedule.semester),
      subject: schedule.subject,
      subjectCode: schedule.subjectCode || '',
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      venue: schedule.venue || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const submitSchedule = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      if (editingId) {
        await API.put(`/exam-timetables/${editingId}`, form);
        toast.success('Exam timetable entry updated.');
      } else {
        await API.post('/exam-timetables', form);
        toast.success('Exam timetable entry added.');
      }
      cancelEdit();
      await loadSchedules();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to save the exam timetable entry.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSchedule = async (schedule) => {
    if (!window.confirm(`Delete the ${schedule.subject} exam entry?`)) return;
    try {
      await API.delete(`/exam-timetables/${schedule._id}`);
      setSchedules((current) => current.filter((entry) => entry._id !== schedule._id));
      if (editingId === schedule._id) cancelEdit();
      toast.success('Exam timetable entry deleted.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to delete the exam timetable entry.');
    }
  };

  return (
    <>
      <AppHeader user={user} onLogout={onLogout} />
      <main className="page-shell dashboard-page">
        <section className="container timetable-page">
          <header className="timetable-heading">
            <span className="eyebrow alt">Academic calendar</span>
            <h1>Exam Timetable</h1>
            <p>Find internal assessment (IA) and university end-semester exams for every year.</p>
            <button
              className="secondary-btn timetable-shortcut"
              type="button"
              onClick={() => setSelectedType('IA 2')}
            >
              View IA 2 timetable
            </button>
          </header>

          {user?.role === 'admin' && (
            <section className="timetable-admin-card">
              <div className="section-header">
                <div>
                  <span className="eyebrow alt">Admin tools</span>
                  <h2>{editingId ? 'Update timetable entry' : 'Add timetable entry'}</h2>
                </div>
              </div>
              <form className="auth-form timetable-form" onSubmit={submitSchedule}>
                <div className="grid-two">
                  <div className="field-group">
                    <label htmlFor="examType">Exam type</label>
                    <select id="examType" name="examType" value={form.examType} onChange={updateForm}>
                      <option value="IA 1">Internal Assessment 1 (IA 1)</option>
                      <option value="IA 2">Internal Assessment 2 (IA 2)</option>
                      <option value="End Semester">University End Semester</option>
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="year">Year</label>
                    <select id="year" name="year" value={form.year} onChange={updateForm}>
                      {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid-two">
                  <div className="field-group">
                    <label htmlFor="semester">Semester</label>
                    <select id="semester" name="semester" value={form.semester} onChange={updateForm}>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => (
                        <option key={semester} value={semester}>Semester {semester}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label htmlFor="subject">Subject</label>
                    <input id="subject" name="subject" value={form.subject} onChange={updateForm} required maxLength={120} />
                  </div>
                </div>

                <div className="grid-two">
                  <div className="field-group">
                    <label htmlFor="subjectCode">Subject code (optional)</label>
                    <input id="subjectCode" name="subjectCode" value={form.subjectCode} onChange={updateForm} maxLength={30} />
                  </div>
                  <div className="field-group">
                    <label htmlFor="examDate">Exam date</label>
                    <input id="examDate" name="date" type="date" value={form.date} onChange={updateForm} required />
                  </div>
                </div>

                <div className="grid-two">
                  <div className="field-group">
                    <label htmlFor="startTime">Start time</label>
                    <input id="startTime" name="startTime" type="time" value={form.startTime} onChange={updateForm} required />
                  </div>
                  <div className="field-group">
                    <label htmlFor="endTime">End time</label>
                    <input id="endTime" name="endTime" type="time" value={form.endTime} onChange={updateForm} required />
                  </div>
                </div>

                <div className="field-group">
                  <label htmlFor="venue">Room / venue (optional)</label>
                  <input id="venue" name="venue" value={form.venue} onChange={updateForm} maxLength={120} />
                </div>

                <div className="timetable-form-actions">
                  <button className="primary-btn" type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Add exam'}
                  </button>
                  {editingId && (
                    <button className="outline-button" type="button" onClick={cancelEdit}>
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>
            </section>
          )}

          <section className="timetable-list-card">
            <div className="section-header">
              <div>
                <span className="eyebrow alt">All academic years</span>
                <h2>Upcoming exam schedule</h2>
              </div>
              <button className="outline-button" type="button" onClick={refreshSchedules} disabled={isLoading}>
                {isLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            <div className="timetable-filters">
              <div className="field-group">
                <label htmlFor="filterYear">Filter by year</label>
                <select id="filterYear" value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                  <option>All years</option>
                  {['1st Year', '2nd Year', '3rd Year', '4th Year'].map((year) => (
                    <option key={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="filterExamType">Filter by exam type</label>
                <select id="filterExamType" value={selectedType} onChange={(event) => setSelectedType(event.target.value)}>
                  <option>All exams</option>
                  <option value="IA 1">Internal Assessment 1 (IA 1)</option>
                  <option value="IA 2">Internal Assessment 2 (IA 2)</option>
                  <option value="End Semester">University End Semester</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="empty-state">Loading exam schedules…</div>
            ) : visibleSchedules.length ? (
              <div className="timetable-table-wrap">
                <table className="timetable-table">
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Year / semester</th>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Venue</th>
                      {user?.role === 'admin' && <th>Manage</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSchedules.map((schedule) => (
                      <tr key={schedule._id}>
                        <td>
                          <span className={`chip ${schedule.examType.startsWith('IA') ? 'orange' : 'blue'}`}>
                            {schedule.examType === 'IA' ? 'IA 1' : schedule.examType}
                          </span>
                        </td>
                        <td>{schedule.year}<br />Semester {schedule.semester}</td>
                        <td>
                          <strong>{schedule.subject}</strong>
                          {schedule.subjectCode && <small>{schedule.subjectCode}</small>}
                        </td>
                        <td>{getDisplayDate(schedule.date)}</td>
                        <td>{schedule.startTime}–{schedule.endTime}</td>
                        <td>{schedule.venue || 'Not specified'}</td>
                        {user?.role === 'admin' && (
                          <td>
                            <div className="table-actions">
                              <button className="outline-button" type="button" onClick={() => startEdit(schedule)}>Edit</button>
                              <button className="danger-button" type="button" onClick={() => deleteSchedule(schedule)}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                {schedules.length
                  ? 'No exam entries match these filters.'
                  : 'No exam timetable has been published yet. Check back later for official dates.'}
              </div>
            )}
          </section>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AdminPage({ user, events, onLogout, onRefresh }) {
  const [today] = useState(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  });
  const [students, setStudents] = useState(null);
  const [studentSource, setStudentSource] = useState('MongoDB');
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Workshop',
    date: '',
    time: '10:00',
    venue: '',
    organizer: '',
    registrationDeadline: '',
    isFeatured: false,
  });

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    try {
      await API.post('/events', form);
      toast.success('Event published successfully.');
      onRefresh();
      setForm({
        title: '',
        description: '',
        category: 'Workshop',
        date: '',
        time: '10:00',
        venue: '',
        organizer: '',
        registrationDeadline: '',
        isFeatured: false,
      });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to publish the event.');
    }
  };

  const loadStudents = async () => {
    setIsLoadingStudents(true);
    try {
      const { data } = await API.get('/admin/students');
      setStudents(data.students);
      setStudentSource(data.source);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to load registered students.');
    } finally {
      setIsLoadingStudents(false);
    }
  };

  const downloadRegistrations = async (event) => {
    try {
      const { data } = await API.get(`/admin/events/${event._id}/registrations.csv`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${event.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '')}-registrations.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Event registrations downloaded.');
    } catch (error) {
      console.error('Unable to download event registrations:', error);
      toast.error('Unable to download event registrations.');
    }
  };

  const upcomingEvents = events.filter((event) => {
    const eventDate = getEventDate(event.date);
    return eventDate && eventDate >= today;
  });

  return (
    <>
      <AppHeader user={user} onLogout={onLogout} />
      <main className="page-shell dashboard-page">
        <section className="container admin-layout">
          <div className="admin-form-wrap">
            <span className="eyebrow alt">Admin panel</span>
            <h1>Publish a new event</h1>

            <form className="auth-form admin-form" onSubmit={onSubmit}>
              <div className="field-group">
                <label htmlFor="title">Event title</label>
                <input id="title" name="title" value={form.title} onChange={onChange} required />
              </div>

              <div className="field-group">
                <label htmlFor="description">Description</label>
                <textarea id="description" name="description" rows="4" value={form.description} onChange={onChange} required />
              </div>

              <div className="grid-two">
                <div className="field-group">
                  <label htmlFor="category">Category</label>
                  <select id="category" name="category" value={form.category} onChange={onChange}>
                    {Object.keys(categoryMeta).map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label htmlFor="organizer">Organizer</label>
                  <input id="organizer" name="organizer" value={form.organizer} onChange={onChange} />
                </div>
              </div>

              <div className="grid-two">
                <div className="field-group">
                  <label htmlFor="date">Event date</label>
                  <input id="date" name="date" type="date" value={form.date} onChange={onChange} required />
                </div>

                <div className="field-group">
                  <label htmlFor="time">Event time</label>
                  <input id="time" name="time" type="time" value={form.time} onChange={onChange} required />
                </div>
              </div>

              <div className="grid-two">
                <div className="field-group">
                  <label htmlFor="registrationDeadline">Registration deadline</label>
                  <input id="registrationDeadline" name="registrationDeadline" type="date" value={form.registrationDeadline} onChange={onChange} required />
                </div>

                <div className="field-group">
                  <label htmlFor="venue">Venue</label>
                  <input id="venue" name="venue" value={form.venue} onChange={onChange} required />
                </div>
              </div>

              <label className="checkbox-row admin-check">
                <input type="checkbox" name="isFeatured" checked={form.isFeatured} onChange={onChange} />
                <span>Feature this event on the homepage</span>
              </label>

              <button type="submit" className="primary-btn full-width">Publish Event</button>
            </form>
          </div>

          <div className="admin-panel-list">
            <span className="eyebrow alt">Live event list</span>
            <h2>Recent announcements</h2>
            <div className="stack-list">
              {events.slice(0, 5).map((event) => (
                <div key={event._id} className="mini-event-item">
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.category}</p>
                  </div>
                  <span>{getDisplayDate(event.date)}</span>
                </div>
              ))}
            </div>

            <section className="registered-students">
              <div className="registered-students-heading">
                <div>
                  <span className="eyebrow alt">Upcoming events</span>
                  <h2>Event registrations</h2>
                </div>
              </div>
              <p className="student-source">Download student registrations as an Excel-compatible CSV file.</p>
              {upcomingEvents.length ? (
                <div className="stack-list">
                  {upcomingEvents.map((event) => (
                    <div key={event._id} className="mini-event-item">
                      <div>
                        <strong>{event.title}</strong>
                        <p>{getDisplayDate(event.date)}</p>
                      </div>
                      <button className="outline-button" type="button" onClick={() => downloadRegistrations(event)}>
                        Download Excel (CSV)
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">There are no upcoming events open for registration.</div>
              )}
            </section>

            <div className="registered-students">
              <div className="registered-students-heading">
                <div>
                  <span className="eyebrow alt">Student directory</span>
                  <h2>Registered accounts</h2>
                </div>
                <button
                  type="button"
                  className="outline-button"
                  onClick={loadStudents}
                  disabled={isLoadingStudents}
                >
                  {isLoadingStudents ? 'Loading…' : students ? 'Refresh list' : 'View students'}
                </button>
              </div>
              <p className="student-source">Records from {studentSource}. Visible to administrators only.</p>
              {students && (
                students.length ? (
                  <div className="student-list">
                    {students.map((student) => (
                      <article key={student._id} className="student-record">
                        <div>
                          <strong>{student.fullName}</strong>
                          <a href={`mailto:${student.email}`}>{student.email}</a>
                        </div>
                        <span>{student.studentId || 'No student ID'}</span>
                        <span>{student.department || 'Department not set'} · {student.year || 'Year not set'}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">No student accounts have registered yet.</div>
                )
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-hero">
          <Link to="/" className="brand auth-brand">
            <span className="brand-mark">C</span>
            CampusConnect
          </Link>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="pill-stack">
            <span>Placement drives</span>
            <span>Hackathons</span>
            <span>Workshops</span>
            <span>Club events</span>
          </div>
        </div>
        <div className="auth-form-panel">{children}</div>
      </div>
    </div>
  );
}

function EventCard({
  event,
  user,
  onToggleInterest,
  onToggleSave,
  onCancelRegistration,
  showSaveAction = true,
  showRegistrationAction = true,
}) {
  const accentClass = categoryMeta[event.category]?.accent || 'gray';
  const registered = isEventRegistered(user, event._id);
  const saved = isEventSaved(user, event._id);

  return (
    <article className="event-card">
      <div className="event-head">
        <span className={`chip ${accentClass}`}>{event.category}</span>
        {event.isFeatured && <span className="chip highlight">Featured</span>}
      </div>

      <h3>{event.title}</h3>
      <p className="event-description">{event.description}</p>

      <div className="event-meta">
        <span><FaCalendarAlt /> {getDisplayDate(event.date)}</span>
        <span><FaClock /> {event.time}</span>
        <span><FaMapMarkerAlt /> {event.venue}</span>
      </div>

      <div className="event-footer">
        <div className="footer-meta">
          <span><FaCheckCircle /> Deadline: {getDisplayDate(event.registrationDeadline)}</span>
        </div>

        <div className="event-buttons">
          {user && showSaveAction && (
            <button type="button" className="outline-button" onClick={onToggleSave}>
              <FaBookmark /> {saved ? 'Unsave' : 'Save'}
            </button>
          )}
          {user && showRegistrationAction ? (
              registered ? (
                onCancelRegistration ? (
                  <button type="button" className="danger-button" onClick={onCancelRegistration}>
                    <FaTimesCircle /> Cancel registration
                  </button>
                ) : (
                  <button type="button" className="primary-btn" disabled>
                    <FaCheckCircle /> Registered
                  </button>
                )
              ) : (
                <button type="button" className="primary-btn" onClick={onToggleInterest}>
                  <FaUserPlus /> Register for event
                </button>
              )
            ) : !user && showRegistrationAction ? (
              <Link
                to="/login"
                state={{ registerEventId: event._id }}
                className="primary-btn"
                title="Log in to register interest for this event"
              >
                <FaUserPlus /> Register Interest
              </Link>
            ) : null}
          </div>
        {user && showRegistrationAction && !registered && (
          <p className="event-profile-note">
            One click with saved profile: {user.fullName} · {user.studentId}
          </p>
        )}
      </div>
    </article>
  );
}

function isEventRegistered(user, eventId) {
  return (user?.interestedEvents || []).some((id) => String(id) === String(eventId));
}

function isEventSaved(user, eventId) {
  return (user?.savedEvents || []).some((id) => String(id) === String(eventId));
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <h3>CampusConnect</h3>
          <p>Never Miss a Campus Opportunity!</p>
        </div>

        <div>
          <h4>Explore</h4>
          <ul>
            <li>Events</li>
            <li>Placement drives</li>
            <li>Workshops</li>
          </ul>
        </div>

        <div>
          <h4>Support</h4>
          <ul>
            <li>Contact</li>
            <li>Help center</li>
            <li>Privacy</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

export default App;
