import { useState } from "react";
import AuthPage from "./AuthPage.jsx";
import HomePage from "./Homepage.jsx";
import PlanPage from "./PlanPage.jsx";
import SessionPage from "./SessionPage.jsx";

function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("home");

  if (!user) {
    return <AuthPage onAuthSuccess={setUser} />;
  }

  switch (page) {
    case "home":
      return <HomePage userName={user.firstName} onNavigate={setPage} />;
    case "plan":
      return <PlanPage onNavigate={setPage} />;
    case "session":
      return <SessionPage onNavigate={setPage} />;
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
