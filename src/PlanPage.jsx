import { useState } from "react";
import NavBar from "./Navbar.jsx";
import PlanWizard from "./PlanWizard.jsx";
import PlanResult from "./PlanResult.jsx";

export default function PlanPage({ user, onNavigate, onLogout, onComplete, initialStep = "mode", theme, onToggleTheme }) {
  const [mode, setMode] = useState(null); // "injury" | "general" | "custom"
  const [step, setStep] = useState(initialStep); // "mode" | "exercises" | "review" | "sports"
  const [exercises, setExercises] = useState([{ name: "", sets: "", reps: "" }]);
  // Aligned by index with `exercises` - each entry is null (not yet
  // resolved) or { status: "matched", exerciseId, name, gifUrl,
  // instructions } / { status: "no_match" }, filled in by continueToReview.
  const [matches, setMatches] = useState([]);
  const [resolving, setResolving] = useState(false);
  const [sports, setSports] = useState([]);
  const [pastInjuries, setPastInjuries] = useState([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const isManualEntryMode = mode === "injury" || mode === "custom";

  const stepOrder = isManualEntryMode
    ? ["mode", "exercises", "review", "sports"]
    : ["mode", "sports"];
  const currentIndex = stepOrder.indexOf(step);

  const chooseMode = (chosen) => {
    setMode(chosen);
    setStep(chosen === "general" ? "sports" : "exercises");
  };

  const goBack = () => {
    if (step === "mode") {
      if (onNavigate) onNavigate("home");
      return;
    }
    if (step === "review") {
      setStep("exercises");
      return;
    }
    if (step === "sports" && isManualEntryMode) {
      setStep("review");
      return;
    }
    setStep("mode");
  };

  // Resolves each typed exercise name against the ExerciseDB catalog so
  // the review step can show the match (name + thumbnail) before saving,
  // with a chance to retype anything that matched wrong.
  const continueToReview = async () => {
    const hasAny = exercises.some((ex) => ex.name.trim());
    if (!hasAny) {
      setError("Add at least one exercise before continuing.");
      return;
    }
    setError("");
    setResolving(true);
    try {
      const resolved = await Promise.all(
        exercises.map(async (ex) => {
          if (!ex.name.trim()) return null;
          try {
            const res = await fetch("/backend/api/resolve-exercise", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: ex.name.trim() }),
            });
            const data = res.ok ? await res.json() : null;
            const match = data?.match;
            return match ? { status: "matched", ...match } : { status: "no_match" };
          } catch {
            return { status: "no_match" };
          }
        })
      );
      setMatches(resolved);
      setStep("review");
    } finally {
      setResolving(false);
    }
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

  const togglePastInjury = (injury) => {
    if (injury === "None") {
      setPastInjuries(["None"]);
      return;
    }
    setPastInjuries((prev) => {
      const withoutNone = prev.filter((i) => i !== "None");
      return withoutNone.includes(injury)
        ? withoutNone.filter((i) => i !== injury)
        : [...withoutNone, injury];
    });
  };

  const handleSave = async () => {
    if (isManualEntryMode) {
      // Matches were already resolved in continueToReview and confirmed on
      // the review step - just combine them with the typed sets/reps here.
      const enrichedPrescribed = exercises
        .map((ex, index) => ({ ex, match: matches[index] }))
        .filter(({ ex }) => ex.name.trim())
        .map(({ ex, match }) => {
          const base = {
            exercise_id: null,
            name: ex.name.trim(),
            sets: Number(ex.sets) || 0,
            reps: Number(ex.reps) || 0,
            source: "prescribed",
          };
          if (match?.status === "matched") {
            return {
              ...base,
              exercise_id: match.exerciseId,
              gif_url: match.gifUrl,
              instructions: match.instructions,
            };
          }
          return base;
        });

      if (enrichedPrescribed.length === 0) {
        setError("Add at least one exercise before saving.");
        return;
      }

      setSubmitting(true);
      try {
        const saveRes = await fetch("/backend/activities/put_exercises", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user?.id,
            exercises: { plan: enrichedPrescribed },
          }),
        });

        if (!saveRes.ok) {
          setError("Couldn't save your exercises. Please try again.");
          return;
        }

        setResult({ plan: enrichedPrescribed, disclaimer: null });
      } catch {
        setError("Couldn't reach the server. Please try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // General mode: ask Gemini (via Flask) for a plan constrained to our
    // locked, camera-supported exercises, fetch a demo video for each
    // exercise it picks, then save the combined result to this user's
    // ACTIVITIES row.
    setError("");
    setSubmitting(true);

    try {
      const planRes = await fetch("/backend/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sports,
          past_injuries: pastInjuries,
          current_issue: description,
          details: "",
        }),
      });
      const planData = await planRes.json().catch(() => null);

      if (!planRes.ok) {
        const message =
          planData?.error === "missing_field"
            ? "Tell us what you'd like to work on before saving."
            : planData?.detail || planData?.error || "Couldn't generate a plan. Please try again.";
        setError(message);
        return;
      }

      const enrichedPlan = await Promise.all(
        (planData.plan || []).map(async (item) => {
          // Catalog picks already carry a gif_url from the backend's own
          // validation step — the YouTube lookup only knows the 3 locked
          // ids, so skip it entirely for anything else.
          if (item.source !== "locked") {
            return item;
          }
          try {
            const videoRes = await fetch(`/backend/api/exercise-video/${item.exercise_id}`);
            const video = videoRes.ok ? await videoRes.json() : null;
            return { ...item, video };
          } catch {
            return { ...item, video: null };
          }
        })
      );

      const saveRes = await fetch("/backend/activities/put_exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id,
          exercises: { plan: enrichedPlan, disclaimer: planData.disclaimer },
        }),
      });

      if (!saveRes.ok) {
        setError("Plan generated, but saving it failed. Please try again.");
        return;
      }

      setResult({ plan: enrichedPlan, disclaimer: planData.disclaimer });
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const finishAndGoHome = () => {
    if (onComplete) {
      onComplete({ mode, sports, pastInjuries, description, plan: result?.plan });
    }
    if (onNavigate) onNavigate("home");
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar
        activePath="plan"
        onNavigate={onNavigate}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="mx-auto max-w-2xl px-8 py-10">
        {result || submitting ? (
          <PlanResult submitting={submitting} result={result} onFinish={finishAndGoHome} />
        ) : (
          <PlanWizard
            mode={mode}
            step={step}
            currentIndex={currentIndex}
            totalSteps={stepOrder.length}
            exercises={exercises}
            matches={matches}
            resolving={resolving}
            sports={sports}
            pastInjuries={pastInjuries}
            description={description}
            error={error}
            onChooseMode={chooseMode}
            onGoBack={goBack}
            onUpdateExercise={updateExercise}
            onAddExerciseRow={addExerciseRow}
            onRemoveExerciseRow={removeExerciseRow}
            onToggleSport={toggleSport}
            onTogglePastInjury={togglePastInjury}
            onDescriptionChange={setDescription}
            onContinue={continueToReview}
            onContinueFromReview={() => setStep("sports")}
            onSave={handleSave}
          />
        )}
      </main>
    </div>
  );
}
