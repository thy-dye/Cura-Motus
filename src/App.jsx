import { useState } from "react";
import AuthPage from "./AuthPage.jsx";
import HomePage from "./Homepage.jsx";
import PlanPage from "./PlanPage.jsx";
import SessionPage from "./SessionPage.jsx";

const STORAGE_KEY = "curamotus_user";

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// DEV-ONLY CV TEST BYPASS - remove before demo/merge to main.
// Visit the app with ?cvtest=1 in the URL to jump straight to the camera
// session with a fake plan covering all 3 locked exercises, skipping
// login, onboarding, and the Gemini plan-generation call entirely.
// Useful while the plan generator is rate-limited/misconfigured, since
// it isolates PoseDetector testing from the rest of the auth/plan flow.
function getCvTestSession() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get("cvtest") !== "1") return null;

  return [
    { id: 0, exerciseId: "squat", name: "Bodyweight Squat", type: "camera", sets: 3, reps: 10, note: "", videoId: null, steps: [] },
    { id: 1, exerciseId: "lunge", name: "Standing Lunge", type: "camera", sets: 3, reps: 10, note: "", videoId: null, steps: [] },
    { id: 2, exerciseId: "shoulder-raise", name: "Shoulder Raise", type: "camera", sets: 3, reps: 10, note: "", videoId: null, steps: [] },
  ];
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

  const cvTestSession = getCvTestSession();
  if (cvTestSession) {
    return (
      <SessionPage
        user={user || { id: "cv-test-user", firstName: "Tester" }}
        onNavigate={setPage}
        onLogout={handleLogout}
        session={cvTestSession}
      />
    );
  }

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
