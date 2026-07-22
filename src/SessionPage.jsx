import { useEffect, useRef, useState } from "react";
import NavBar from "./Navbar.jsx";
import PoseDetector from "./cv/PoseDetector.jsx";
import { exerciseLabel, isLockedExercise, exerciseSteps, exerciseIdentifier } from "./exercises.js";

const REST_SECONDS = 60;

// Hard-coded motivational lines read out over Speech Synthesis when a set
// wraps up - no LLM call needed, this is just picked at random.
const SET_COMPLETE_PHRASES = [
  "Great job, set complete!",
  "Nice work, that set is done.",
  "That's the set. Way to push through.",
  "Set complete. You're doing great.",
  "Awesome set! Take a breather.",
];

function speakText(text) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.15;
    window.speechSynthesis.speak(utterance);
  }
}

// Fixed dark housing, independent of the light/dark theme toggle - camera
// feeds conventionally sit on a black background regardless of app theme,
// and the status text under it (in PoseDetector) is hardcoded white.
function CameraFeed({ exerciseId, setNumber, onRepComplete, onFaultDetected, onPositioning, isActive }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#18181b]">
      <PoseDetector
        exerciseId={exerciseId}
        setNumber={setNumber}
        onRepComplete={onRepComplete}
        onFaultDetected={onFaultDetected}
        onPositioning={onPositioning}
        isActive={isActive}
      />
    </div>
  );
}

function VideoAndSteps({ exercise }) {
  const hasSteps = exercise.steps && exercise.steps.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-[var(--secondary)] flex items-center justify-center">
        {exercise.videoId ? (
          <iframe
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${exercise.videoId}`}
            title={exercise.name}
            referrerPolicy="strict-origin-when-cross-origin"
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
          <ol className="flex flex-col gap-4">
            {exercise.steps.map((step, i) => (
              <li
                key={i}
                className="flex gap-3 text-[15px] leading-relaxed text-[var(--secondary-foreground)]"
              >
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-sm font-semibold text-[var(--primary)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
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
      </div>
    </div>
  );
}

// Full-screen rest interstitial shown between sets/exercises. Fires from
// the same completeSet() call that triggers the Speech Synthesis cue, so
// the audio and the visual never drift out of sync with each other.
function RestInterstitial({ setNumber, secondsLeft, onSkip, onBack }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-[var(--background)]/95 backdrop-blur-sm">
      <button
        type="button"
        onClick={onBack}
        className="absolute left-6 top-6 text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      >
        ← Back
      </button>
      <div
        className="pop-in flex h-24 w-24 items-center justify-center rounded-full text-6xl font-bold"
        style={{ backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}
        aria-hidden="true"
      >
        ✓
      </div>
      <h2 className="text-3xl font-bold text-[var(--foreground)]">
        Set {setNumber} complete!
      </h2>
      <p
        className="text-6xl font-bold text-[var(--accent)]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {secondsLeft}
      </p>
      <p className="text-sm text-[var(--muted-foreground)]">
        Take a breather. Next set coming up.
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="rounded-lg bg-[var(--accent)] px-8 py-3 text-base font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90"
      >
        Skip rest
      </button>
    </div>
  );
}

export default function SessionPage({
  user,
  onNavigate,
  onLogout,
  session: sessionProp,
  theme,
  onToggleTheme,
  entryExerciseIndex,
  entryStartSet,
}) {
  const [session, setSession] = useState(sessionProp || null);
  const [loading, setLoading] = useState(!sessionProp);
  const [error, setError] = useState("");

  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  // Live rep count from the CV angle tracker for the current set. Once it
  // hits the exercise's target, the set auto-completes (see the effect
  // below) - the "Finish Set" button is only needed to end a set early.
  const [cvRepCount, setCvRepCount] = useState(0);
  const [sessionState, setSessionState] = useState("active"); // active | resting
  const [restSecondsLeft, setRestSecondsLeft] = useState(null);
  // Positioning status from the pose detector, shown as a banner above the
  // camera. { positioned: bool, message: string | null }.
  const [positioning, setPositioning] = useState({ positioned: false, message: null });
  const advancingRef = useRef(false);
  const enteredRef = useRef(false);

  // Jump straight to whichever exercise/set Home sent us in for (resuming a
  // circuit rather than always starting over at exercise 0, set 1). Runs
  // once, as soon as the plan is actually loaded - only then do we know how
  // many sets the target exercise has, to clamp entryStartSet against it.
  useEffect(() => {
    if (!session || session.length === 0 || enteredRef.current) return;
    enteredRef.current = true;
    const idx = Math.min(Math.max(entryExerciseIndex ?? 0, 0), session.length - 1);
    const targetExercise = session[idx];
    const maxSet = targetExercise?.sets || 1;
    const clampedSet = Math.min(Math.max(entryStartSet ?? 1, 1), maxSet);
    setExerciseIndex(idx);
    setCurrentSet(clampedSet);
    // entryExerciseIndex/entryStartSet are only meant to be read once, on
    // entry - re-running this if they somehow changed later would yank the
    // user back to a different exercise mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleCvFaultDetected = () => {
    // Not surfaced as UI - reserved for Malek's Speech Synthesis work if it
    // ever wants to read a form correction aloud.
  };

  const handleCvPositioning = (status) => {
    setPositioning(status);
  };

  const handleCvRepComplete = () => {
    setCvRepCount((prev) => {
      const nextCount = prev + 1;
      const exercise = session?.[exerciseIndex];
      // Only announce the rep number here if the set isn't finishing on
      // this rep - the completion phrase below takes over instead, so we
      // don't talk over ourselves.
      if (!exercise || nextCount < exercise.reps) {
        speakText(nextCount.toString());
      }
      return nextCount;
    });
  };

  // Shared by both the auto-detect effect below and the manual "Finish
  // Set" button, so a set wraps up the same way whether the camera hit
  // the rep target or the user ended it early themselves. This is also
  // what starts the rest interstitial and its audio cue together, from
  // the exact same call, so they can't drift out of sync.
  const completeSet = () => {
    const exercise = session?.[exerciseIndex];
    setSessionState("resting");
    setRestSecondsLeft(REST_SECONDS);
    // Log the set the moment it finishes, not at the end of the whole
    // exercise - this is what lets Home show real "X/Y sets" progress, and
    // means backing out during the rest that follows can never lose credit
    // for a set that's already done.
    if (exercise) logCompletion(exercise);

    const phrase = SET_COMPLETE_PHRASES[Math.floor(Math.random() * SET_COMPLETE_PHRASES.length)];
    speakText(`${phrase} Take a ${REST_SECONDS} second break.`);
  };

  // Once the live rep count hits the target for this set, automatically
  // wrap the set up - no need to wait on the manual "Finish Set" button.
  useEffect(() => {
    const exercise = session?.[exerciseIndex];
    if (!exercise || sessionState !== "active") return;
    if (cvRepCount < exercise.reps) return;
    completeSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cvRepCount]);

  // Countdown the rest break, one second at a time, and auto-advance to
  // the next set (or back to Home, if that was the last set) once it hits
  // zero.
  useEffect(() => {
    if (sessionState !== "resting" || restSecondsLeft === null) return;

    if (restSecondsLeft <= 0) {
      if (!advancingRef.current) {
        advancingRef.current = true;
        advanceAfterRest();
      }
      return;
    }

    const t = setTimeout(() => setRestSecondsLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState, restSecondsLeft]);

  const advanceAfterRest = () => {
    const exercise = session?.[exerciseIndex];
    advancingRef.current = false;
    setRestSecondsLeft(null);

    if (!exercise) return;

    if (currentSet < exercise.sets) {
      speakText(`Set ${currentSet + 1}, go!`);
      setCurrentSet((prev) => prev + 1);
      setCvRepCount(0);
      setSessionState("active");
    } else {
      // No forced "next exercise" - Home is the hub now, so once this
      // exercise's sets are done, go back there and let the user pick
      // whatever's next themselves.
      speakText("Nice work! Exercise complete.");
      if (onNavigate) onNavigate("home");
    }
  };

  const handleSkipRest = () => {
    if (sessionState !== "resting") return;
    advancingRef.current = true;
    setRestSecondsLeft(null);
    advanceAfterRest();
  };

  // Shared by "Exit Session" and the rest interstitial's "Back" button -
  // leaving mid-session should never keep talking after the user's already
  // navigated away, and shouldn't let a stale countdown fire advanceAfterRest
  // once we're gone. Whatever set already finished stays logged either way,
  // since completeSet() logs it immediately, not at the end of the rest.
  const leaveSession = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    advancingRef.current = true;
    setRestSecondsLeft(null);
    if (onNavigate) onNavigate("home");
  };

  // Speech Synthesis needs a user gesture before it's allowed to speak in
  // most browsers - this "unlocks" it on the first click anywhere on the
  // page instead of making the user wait for it to silently fail once.
  useEffect(() => {
    const unlockSpeech = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const utterance = new SpeechSynthesisUtterance(" ");
        window.speechSynthesis.speak(utterance);
      }
      document.removeEventListener("click", unlockSpeech);
    };
    document.addEventListener("click", unlockSpeech);
    return () => {
      document.removeEventListener("click", unlockSpeech);
    };
  }, []);

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

  const handleFinishSetClick = () => {
    if (sessionState === "active") {
      completeSet();
    }
  };

  const logCompletion = (exercise) => {
    if (!user?.id) return;
    const identifier = exerciseIdentifier(exercise.exerciseId, exercise.name);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <NavBar
          activePath="session"
          onNavigate={onNavigate}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
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
        <NavBar
          activePath="session"
          onNavigate={onNavigate}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
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
      <NavBar
        activePath="session"
        onNavigate={onNavigate}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {sessionState === "resting" && (
        <RestInterstitial
          setNumber={currentSet}
          secondsLeft={restSecondsLeft ?? REST_SECONDS}
          onSkip={handleSkipRest}
          onBack={leaveSession}
        />
      )}

      <main className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)] px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)]">
                {exercise.name}
              </h1>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">
                Exercise {exerciseIndex + 1} of {session.length}
              </p>
            </div>

            <div
              className="rounded-xl bg-[var(--primary)] px-6 py-3 text-lg font-bold text-[var(--primary-foreground)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Set {currentSet} / {exercise.sets} &nbsp;·&nbsp; {cvRepCount}/{exercise.reps} reps
            </div>
          </div>

          {isCamera && sessionState === "active" && (positioning.positioned || positioning.message) && (
            <div className="mt-4 flex items-center gap-2.5 border-t border-[var(--border)] pt-4 text-sm font-medium text-[var(--secondary-foreground)]">
              <span
                className={`font-semibold ${positioning.positioned ? "text-[var(--primary)]" : "text-amber-500"}`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {positioning.positioned ? "✓" : "⚠"}
              </span>
              {positioning.positioned ? "Positioned! Now go!" : positioning.message}
            </div>
          )}
        </div>

        {isCamera ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <CameraFeed
              exerciseId={exercise.exerciseId}
              setNumber={currentSet}
              onRepComplete={handleCvRepComplete}
              onFaultDetected={handleCvFaultDetected}
              onPositioning={handleCvPositioning}
              isActive={sessionState === "active"}
            />
            <VideoAndSteps exercise={exercise} />
          </div>
        ) : (
          <div className="max-w-xl mx-auto">
            <VideoAndSteps exercise={exercise} />
          </div>
        )}

        <div className="flex items-center justify-between mt-8">
          <button
            type="button"
            onClick={leaveSession}
            className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Exit Session
          </button>

          {sessionState === "active" && (
            <button
              type="button"
              onClick={handleFinishSetClick}
              className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
            >
              Finish Set
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
