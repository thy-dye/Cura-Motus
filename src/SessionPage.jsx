import { useState } from "react";
import NavBar from "./Navbar.jsx";
import PoseDetector from "./cv/PoseDetector.jsx";

// TODO: replace with the real plan (mix of cameraExercises + additionalExercises
// from the Gemini-generated plan, or the user's prescribed PT exercises)
const MOCK_SESSION = [
  {
    id: 1,
    name: "Bodyweight Squat",
    type: "camera", // "camera" | "general"
    sets: 3,
    reps: 10,
    videoId: null, // TODO: fill from backend YouTube lookup
    steps: [
      "Stand with feet shoulder-width apart.",
      "Lower your hips back and down, keeping your chest up.",
      "Go as low as comfortable, then push back up to standing.",
    ],
  },
  {
    id: 2,
    name: "Cat-Cow Stretch",
    type: "general",
    sets: 2,
    reps: 8,
    videoId: null,
    steps: [
      "Start on hands and knees, wrists under shoulders.",
      "Inhale, drop your belly, lift your chest and tailbone (Cow).",
      "Exhale, round your spine, tuck your chin (Cat).",
    ],
  },
];

function CameraFeed({ feedbackMessage }) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[var(--foreground)]">
      <PoseDetector />

      {feedbackMessage && (
        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-black/60 px-4 py-2 text-sm font-medium text-white">
          {feedbackMessage}
        </div>
      )}
    </div>
  );
}

function VideoAndSteps({ exercise }) {
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
        ) : (
          <span className="text-sm text-[var(--muted-foreground)]">
            Video coming soon
          </span>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h3 className="font-semibold text-[var(--foreground)] mb-3">Steps</h3>
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
      </div>
    </div>
  );
}

export default function SessionPage({ onNavigate, session = MOCK_SESSION }) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [repCount, setRepCount] = useState(0);
  const [feedbackMessage, setFeedbackMessage] = useState(
    "Get in position, then start your set."
  );

  const exercise = session[exerciseIndex];
  const isCamera = exercise.type === "camera";

  const incrementRep = () => {
    // TODO (Malek): this is currently a manual/demo increment.
    // Real camera exercises should call this automatically from the
    // pose-detection logic whenever a rep is detected, instead of a button click.
    const next = repCount + 1;
    if (next >= exercise.reps) {
      setRepCount(0);
      completeSet();
    } else {
      setRepCount(next);
    }
  };

  const completeSet = () => {
    if (currentSet < exercise.sets) {
      setCurrentSet((prev) => prev + 1);
      setFeedbackMessage(`Set ${currentSet} done — nice work. Get ready for the next set.`);
    } else {
      goToNextExercise();
    }
  };

  const goToNextExercise = () => {
    if (exerciseIndex < session.length - 1) {
      setExerciseIndex((prev) => prev + 1);
      setCurrentSet(1);
      setRepCount(0);
      setFeedbackMessage("Get in position, then start your set.");
    } else if (onNavigate) {
      onNavigate("home");
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar activePath="session" onNavigate={onNavigate} />

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
            className="rounded-lg bg-[var(--secondary)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Set {currentSet} / {exercise.sets} &nbsp;·&nbsp; Rep {repCount} / {exercise.reps}
          </div>
        </div>

        {isCamera ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CameraFeed feedbackMessage={feedbackMessage} />
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
            onClick={() => onNavigate && onNavigate("home")}
            className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Exit Session
          </button>

          <button
            type="button"
            onClick={incrementRep}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            {isCamera ? "Log Rep (demo)" : "I did a rep"}
          </button>
        </div>
      </main>
    </div>
  );
}