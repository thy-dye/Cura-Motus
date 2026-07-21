import { useState } from "react";
import AuthPage from "./AuthPage.jsx";
import HomePage from "./Homepage.jsx";
import PlanPage from "./PlanPage.jsx";
import SessionPage from "./SessionPage.jsx";
import ProgressPage from "./ProgressPage.jsx";

const STORAGE_KEY = "curamotus_user";

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function App() {
  const [user, setUser] = useState(loadStoredUser);
  const [page, setPage] = useState("home");

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
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  switch (page) {
    case "home":
      return (
        <HomePage
          user={user}
          userName={user.firstName}
          onNavigate={setPage}
          onLogout={handleLogout}
        />
      );
    case "plan":
      return (
        <PlanPage user={user} onNavigate={setPage} onLogout={handleLogout} />
      );
    case "session":
      return (
        <SessionPage user={user} onNavigate={setPage} onLogout={handleLogout} />
      );
    case "progress":
      return (
        <ProgressPage user={user} onNavigate={setPage} onLogout={handleLogout} />
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
