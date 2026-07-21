import { useEffect, useState } from "react";
import NavBar from "./Navbar.jsx";
import PoseDetector from "./cv/PoseDetector.jsx";
import { exerciseLabel, isLockedExercise, exerciseSteps } from "./exercises.js";

function CameraFeed({ exerciseId, feedbackMessage, onFeedback, onRepComplete, onFaultDetected, onPositioning, isActive }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[var(--foreground)]">
      <PoseDetector
        exerciseId={exerciseId}
        onFeedback={onFeedback}
        onRepComplete={onRepComplete}
        onFaultDetected={onFaultDetected}
        onPositioning={onPositioning}
        isActive={isActive}
      />

      {feedbackMessage && (
        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/60 px-4 py-2 text-sm font-medium text-white">
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}

function VideoAndSteps({ exercise, setSummary }) {
  const hasSteps = exercise.steps && exercise.steps.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-[var(--secondary)] flex items-center justify-center">
        {exercise.videoId ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube.com/embed/${exercise.videoId}`}
            title={exercise.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : exercise.gifUrl ? (
          <img
            src={exercise.gifUrl}
            alt={exercise.name}
            className="h-full w-full object-contain bg-[var(--card)]"
          />
        ) : (
          <span className="text-sm text-[var(--muted-foreground)]">
            Video coming soon
          </span>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h3 className="font-semibold text-[var(--foreground)] mb-3">Steps</h3>
        {hasSteps ? (
          <ol className="flex flex-col gap-2">
            {exercise.steps.map((step, i) => (
              <li
                key={i}
                className="flex gap-3 text-sm text-[var(--secondary-foreground)]"
              >
                <span
                  className="font-semibold text-[var(--primary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        ) : exercise.note ? (
          <p className="text-sm text-[var(--secondary-foreground)]">{exercise.note}</p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            No guidance available yet.
          </p>
        )}

        {setSummary && (
          <div className="mt-5 pt-5 border-t border-[var(--border)] text-left">
            <h3 className="font-semibold text-[var(--foreground)] mb-3">
              Set {setSummary.setNumber} Feedback
            </h3>
            {setSummary.repFeedback.length === 0 ? (
              <ul className="flex flex-col gap-2">
                <li className="flex gap-3 text-sm text-[var(--secondary-foreground)]">
                  <span
                    className="font-semibold text-emerald-500"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    ✓
                  </span>
                  No reps completed yet.
                </li>
              </ul>
            ) : (
              <ul className="flex flex-col gap-2">
                {setSummary.repFeedback.map((rep, idx) => (
                  <li
                    key={idx}
                    className="flex gap-3 text-sm text-[var(--secondary-foreground)]"
                  >
                    <span
                      className={`font-semibold ${
                        rep.passed ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {rep.passed ? '✓' : '⚠'}
                    </span>
                    <span>Rep {rep.repNumber}: {rep.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SessionPage({ user, onNavigate, onLogout, session: sessionProp }) {
  const [session, setSession] = useState(sessionProp || null);
  const [loading, setLoading] = useState(!sessionProp);
  const [error, setError] = useState("");

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  // The status bar under the video is now only for live form feedback
  // (rep confirmations, fault corrections). Positioning prompts live in
  // the banner above the camera, driven by onPositioning.
  const [feedbackMessage, setFeedbackMessage] = useState("");
  // Live rep count from the CV angle tracker for the current set. This is
  // informational for now (see TODO below on completeSet) - the manual
  // "Log Set" button is still what actually advances the session.
  const [cvRepCount, setCvRepCount] = useState(0);
  const [sessionState, setSessionState] = useState("active"); // active | summary
  const [repFeedback, setRepFeedback] = useState([]);
  const [setSummary, setSetSummary] = useState(null);
  // Positioning status from the pose detector, shown as a banner above the
  // camera. { positioned: bool, message: string | null }.
  const [positioning, setPositioning] = useState({ positioned: false, message: null });

  const handleCvFaultDetected = (faultMsg) => {
    // Faults are now reported per-rep via handleCvRepComplete
  };

  const handleCvFeedback = (message) => {
    setFeedbackMessage(message);
  };

  const handleCvPositioning = (status) => {
    setPositioning(status);
  };

  const handleCvRepComplete = (repInfo) => {
    setCvRepCount((prev) => prev + 1);
    setRepFeedback((prev) => [
      ...prev,
      {
        repNumber: prev.length + 1,
        passed: repInfo.passed,
        message: repInfo.message,
      },
    ]);
  };

  useEffect(() => {
    if (sessionProp) return; // explicit session passed in, skip fetching
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/backend/activities/get_user?user_id=${user.id}`);
        if (res.status === 404) {
          if (!cancelled) setSession([]);
          return;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) setError("Couldn't load your session.");
          return;
        }
        const plan = data?.[0]?.Exercises?.plan || [];
        if (!cancelled) {
          setSession(
            plan.map((item, index) => ({
              id: index,
              exerciseId: item.exercise_id,
              name: item.name || exerciseLabel(item.exercise_id),
              type: isLockedExercise(item.exercise_id) ? "camera" : "general",
              sets: item.sets,
              reps: item.reps,
              note: item.note,
              videoId: item.video?.video_id || null,
              gifUrl: item.gif_url || null,
              steps:
                item.instructions && item.instructions.length > 0
                  ? item.instructions
                  : exerciseSteps(item.exercise_id),
            }))
          );
        }
      } catch {
        if (!cancelled) setError("Couldn't reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, sessionProp]);

  const handleLogSetClick = () => {
    const exercise = session[exerciseIndex];
    if (sessionState === "active") {
      setSetSummary({
        setNumber: currentSet,
        repFeedback: [...repFeedback],
      });
      setSessionState("summary");
      setFeedbackMessage(`Set ${currentSet} completed. Review your feedback on the right.`);
    } else {
      if (currentSet < exercise.sets) {
        setCurrentSet((prev) => prev + 1);
        setCvRepCount(0);
        setRepFeedback([]);
        setSetSummary(null);
        setSessionState("active");
        setFeedbackMessage("");
      } else {
        logCompletion(exercise);
        if (exerciseIndex < session.length - 1) {
          setExerciseIndex((prev) => prev + 1);
          setCurrentSet(1);
          setCvRepCount(0);
          setRepFeedback([]);
          setSetSummary(null);
          setSessionState("active");
          setFeedbackMessage("");
        } else if (onNavigate) {
          onNavigate("home");
        }
      }
    }
  };

  const getButtonLabel = () => {
    const exercise = session[exerciseIndex];
    if (sessionState === "active") {
      return "Log Set";
    }
    if (currentSet < exercise.sets) {
      return `Start Set ${currentSet + 1}`;
    }
    return exerciseIndex < session.length - 1 ? "Next Exercise" : "Finish Session";
  };

  const logCompletion = (exercise) => {
    if (!user?.id) return;
    // Locked exercises log under their clean id ("squat"). Everything else
    // (a catalog pick or a PT-typed name) logs under its readable name
    // instead of a cryptic ExerciseDB id, so Progress's breakdown stays legible.
    const identifier = isLockedExercise(exercise.exerciseId)
      ? exercise.exerciseId
      : exercise.name;
    fetch("/backend/completion/put", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.id,
        exercise_name: identifier,
      }),
    }).catch(() => {
      // best-effort, don't block the session over a logging failure
    });
  };

  const goToNextExercise = () => {
    if (exerciseIndex < session.length - 1) {
      setExerciseIndex((prev) => prev + 1);
      setCurrentSet(1);
      setCvRepCount(0);
      setFeedbackMessage("");
    } else if (onNavigate) {
      onNavigate("home");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <NavBar activePath="session" onNavigate={onNavigate} onLogout={onLogout} />
        <main className="mx-auto max-w-5xl px-8 py-10">
          <p className="text-sm text-[var(--muted-foreground)]">
            Loading your session…
          </p>
        </main>
      </div>
    );
  }

  if (error || !session || session.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <NavBar activePath="session" onNavigate={onNavigate} onLogout={onLogout} />
        <main className="mx-auto max-w-5xl px-8 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            {error || "You don't have a plan yet."}
          </p>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate(error ? "home" : "plan")}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            {error ? "Back to Home" : "Create a Plan"}
          </button>
        </main>
      </div>
    );
  }

  const exercise = session[exerciseIndex];
  const isCamera = exercise.type === "camera";

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar activePath="session" onNavigate={onNavigate} onLogout={onLogout} />

      <main className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {exercise.name}
            </h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Exercise {exerciseIndex + 1} of {session.length}
            </p>
          </div>

          <div
            className="rounded-xl bg-[var(--primary)] px-6 py-3 text-lg font-bold text-[var(--primary-foreground)] shadow-sm"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Set {currentSet} / {exercise.sets} &nbsp;·&nbsp; {cvRepCount}/{exercise.reps} reps
          </div>
        </div>

        {isCamera && sessionState === "active" && (
          positioning.positioned ? (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[var(--secondary-foreground)]">
              <span
                className="font-semibold text-emerald-500"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                ✓
              </span>
              Positioned — go!
            </div>
          ) : positioning.message ? (
            <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-medium text-[var(--secondary-foreground)]">
              <span
                className="font-semibold text-amber-500"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                ⚠
              </span>
              {positioning.message}
            </div>
          ) : null
        )}

        {isCamera ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CameraFeed
              exerciseId={exercise.exerciseId}
              feedbackMessage={feedbackMessage}
              onFeedback={handleCvFeedback}
              onRepComplete={handleCvRepComplete}
              onFaultDetected={handleCvFaultDetected}
              onPositioning={handleCvPositioning}
              isActive={sessionState === "active"}
            />
            <VideoAndSteps exercise={exercise} setSummary={setSummary} />
          </div>
        ) : (
          <div className="max-w-xl mx-auto">
            <VideoAndSteps exercise={exercise} setSummary={setSummary} />
          </div>
        )}

        <div className="flex items-center justify-between mt-8">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("home")}
            className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Exit Session
          </button>

          <button
            type="button"
            onClick={handleLogSetClick}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            {getButtonLabel()}
          </button>
        </div>
      </main>
    </div>
  );
}
