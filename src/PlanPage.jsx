import { useState } from "react";
import NavBar from "./Navbar.jsx";

const SPORT_OPTIONS = [
  "Soccer",
  "Basketball",
  "Running",
  "Swimming",
  "Tennis",
  "Volleyball",
  "Football",
  "Other",
  "None",
];

export default function PlanPage({ onNavigate, onComplete, initialStep = "mode" }) {
  const [mode, setMode] = useState(null); // "injury" | "general"
  const [step, setStep] = useState(initialStep); // "mode" | "exercises" | "sports"
  const [exercises, setExercises] = useState([{ name: "", sets: "", reps: "" }]);
  const [sports, setSports] = useState([]);
  const [description, setDescription] = useState("");

  const stepOrder =
    mode === "injury" ? ["mode", "exercises", "sports"] : ["mode", "sports"];
  const currentIndex = stepOrder.indexOf(step);

  const chooseMode = (chosen) => {
    setMode(chosen);
    setStep(chosen === "injury" ? "exercises" : "sports");
  };

  const goBack = () => {
    if (step === "mode") {
      if (onNavigate) onNavigate("home");
      return;
    }
    if (step === "sports" && mode === "injury") {
      setStep("exercises");
      return;
    }
    setStep("mode");
  };

  const updateExercise = (index, field, value) => {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  const addExerciseRow = () => {
    setExercises((prev) => [...prev, { name: "", sets: "", reps: "" }]);
  };

  const removeExerciseRow = (index) => {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleSport = (sport) => {
    if (sport === "None") {
      setSports(["None"]);
      return;
    }
    setSports((prev) => {
      const withoutNone = prev.filter((s) => s !== "None");
      return withoutNone.includes(sport)
        ? withoutNone.filter((s) => s !== sport)
        : [...withoutNone, sport];
    });
  };

  const handleSave = () => {
    if (mode === "injury") {
      const payload = { mode, exercises };
      // TODO: POST /backend/activities/put_exercises
      console.log("save prescribed exercises", payload);
      if (onComplete) onComplete(payload);
      if (onNavigate) onNavigate("home");
      return;
    }

    // General mode: send to Flask, which calls Gemini to generate a plan
    // constrained to our camera-supported exercises, plus additional
    // suggestions (shown with YouTube video + steps instead of camera feedback)
    const payload = { mode, sports, description };
    // TODO: POST /backend/plan/generate  →  returns
    //   { cameraExercises: [...], additionalExercises: [{ name, bodyPart, reason, youtubeSearchQuery }] }
    console.log("generate plan", payload);
    if (onComplete) onComplete(payload);
    if (onNavigate) onNavigate("home");
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar activePath="plan" onNavigate={onNavigate} />

      <main className="mx-auto max-w-2xl px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          {[0, 1, 2].map((dotIndex) => (
            <div
              key={dotIndex}
              className={`h-3 w-3 rounded-full transition-colors ${
                dotIndex <= currentIndex
                  ? "bg-[var(--primary)]"
                  : "bg-[var(--secondary)] border border-[var(--border)]"
              }`}
            />
          ))}
        </div>

        {step === "mode" && (
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">
              What brings you to Cura Motus?
            </h1>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => chooseMode("injury")}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--secondary)]"
              >
                <div className="font-semibold text-[var(--foreground)] mb-1">
                  I have exercises from my Physical Therapist
                </div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  You've received a prescribed exercise plan from a licensed
                  PT. We'll help you track and perform those exercises with
                  live feedback.
                </div>
              </button>

              <button
                type="button"
                onClick={() => chooseMode("general")}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-colors hover:border-[var(--primary)] hover:bg-[var(--secondary)]"
              >
                <div className="font-semibold text-[var(--foreground)] mb-1">
                  I have a minor issue or want to improve movement
                </div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  You're dealing with general soreness, stiffness, or a minor
                  issue and want guided exercises and stretches that may
                  help. Not a replacement for professional care.
                </div>
              </button>
            </div>
          </div>
        )}

        {step === "exercises" && (
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">
              Add your prescribed exercises
            </h1>

            <div className="flex flex-col gap-3 mb-4">
              <div className="flex gap-4 text-sm font-medium text-[var(--muted-foreground)] px-1">
                <span className="flex-1">Exercise name</span>
                <span className="w-20">Sets</span>
                <span className="w-20">Reps</span>
                <span className="w-6" />
              </div>

              {exercises.map((ex, index) => (
                <div key={index} className="flex gap-4 items-center">
                  <input
                    type="text"
                    value={ex.name}
                    onChange={(e) =>
                      updateExercise(index, "name", e.target.value)
                    }
                    placeholder="e.g. Straight Leg Raises"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)]"
                  />
                  <input
                    type="number"
                    min="0"
                    value={ex.sets}
                    onChange={(e) =>
                      updateExercise(index, "sets", e.target.value)
                    }
                    placeholder="3"
                    className="w-20 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                  <input
                    type="number"
                    min="0"
                    value={ex.reps}
                    onChange={(e) =>
                      updateExercise(index, "reps", e.target.value)
                    }
                    placeholder="10"
                    className="w-20 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                  {exercises.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExerciseRow(index)}
                      aria-label="Remove exercise"
                      className="w-6 text-[var(--muted-foreground)] hover:text-[var(--error)]"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addExerciseRow}
              className="w-full rounded-lg border border-dashed border-[var(--border)] py-3 text-sm text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
            >
              + Add another exercise
            </button>
          </div>
        )}

        {step === "sports" && (
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">
              Add your sport and activity history
            </h1>
            <p className="text-sm font-medium text-[var(--muted-foreground)] mb-3">
              Primary Sport or Activity
            </p>
            <div className="flex flex-wrap gap-2 mb-6">
              {SPORT_OPTIONS.map((sport) => {
                const selected = sports.includes(sport);
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => toggleSport(sport)}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                      selected
                        ? "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]"
                        : "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:border-[var(--primary)]"
                    }`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>

            {mode === "general" && (
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)] mb-2">
                  What would you like to work on?
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. My lower back feels stiff after sitting all day, and my knees ache after running."
                  rows={4}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)] resize-none"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-2">
                  We'll use this to build a personalized plan. This isn't a
                  diagnosis — always check with a professional for anything
                  serious.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-10">
          {step !== "mode" ? (
            <button
              type="button"
              onClick={goBack}
              className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Back
            </button>
          ) : (
            <span />
          )}

          {step === "exercises" && (
            <button
              type="button"
              onClick={() => setStep("sports")}
              className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
            >
              Continue
            </button>
          )}

          {step === "sports" && (
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </main>
    </div>
  );
}