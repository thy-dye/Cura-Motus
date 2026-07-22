import { useState } from "react";
import AuthPage from "./AuthPage.jsx";
import HomePage from "./Homepage.jsx";
import PlanPage from "./PlanPage.jsx";
import SessionPage from "./SessionPage.jsx";
import ProgressPage from "./ProgressPage.jsx";

const STORAGE_KEY = "curamotus_user";
const THEME_STORAGE_KEY = "curamotus_theme";

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadStoredTheme() {
  try {
    // The inline script in index.html already resolved and set this
    // before React mounted (localStorage, falling back to the OS
    // preference), so read that back rather than re-deriving it here.
    return document.documentElement.dataset.theme || "light";
  } catch {
    return "light";
  }
}


function App() {
  const [user, setUser] = useState(loadStoredUser);
  const [page, setPage] = useState("home");
  const [theme, setTheme] = useState(loadStoredTheme);
  // Payload for the session page's entry point ({ exerciseIndex, startAtSet }
  // or null) - set whenever something navigates to "session" with a
  // specific exercise in mind (e.g. tapping a row on Home), so Session can
  // resume there instead of always starting at exercise 0, set 1.
  const [sessionEntry, setSessionEntry] = useState(null);

  const navigate = (nextPage, payload) => {
    if (nextPage === "session") setSessionEntry(payload || null);
    setPage(nextPage);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // theme just won't persist across reloads
    }
  };

  const handleAuthSuccess = (nextUser) => {
    setUser(nextUser);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
    } catch {
      // e.g. private browsing with storage disabled, session just won't persist
    }
  };

  const handleLogout = () => {
    setUser(null);
    setPage("home");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // nothing to clean up if storage was never available
    }
  };


  if (!user) {
    return (
      <AuthPage onAuthSuccess={handleAuthSuccess} theme={theme} onToggleTheme={toggleTheme} />
    );
  }

  switch (page) {
    case "home":
      return (
        <HomePage
          user={user}
          userName={user.firstName}
          onNavigate={navigate}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    case "plan":
      return (
        <PlanPage
          user={user}
          onNavigate={navigate}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    case "session":
      return (
        <SessionPage
          user={user}
          onNavigate={navigate}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
          entryExerciseIndex={sessionEntry?.exerciseIndex}
          entryStartSet={sessionEntry?.startAtSet}
        />
      );
    case "progress":
      return (
        <ProgressPage
          user={user}
          onNavigate={navigate}
          onLogout={handleLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    default:
      return (
        <div style={{ padding: 40 }}>
          <p>"{page}" page isn't built yet.</p>
          <button type="button" onClick={() => setPage("home")}>
            Back to Home
          </button>
        </div>
      );
  }
}

export default App;
