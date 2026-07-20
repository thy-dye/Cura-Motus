import { useState } from "react";
import NavBar from "./Navbar.jsx";
import PlanWizard from "./PlanWizard.jsx";
import PlanResult from "./PlanResult.jsx";

export default function PlanPage({ user, onNavigate, onLogout, onComplete, initialStep = "mode" }) {
  const [mode, setMode] = useState(null); // "injury" | "general"
  const [step, setStep] = useState(initialStep); // "mode" | "exercises" | "sports"
  const [exercises, setExercises] = useState([{ name: "", sets: "", reps: "" }]);
  const [sports, setSports] = useState([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

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

  const handleSave = async () => {
    if (mode === "injury") {
      const payload = { mode, exercises };
      // TODO: POST /backend/activities/put_exercises
      console.log("save prescribed exercises", payload);
      if (onComplete) onComplete(payload);
      if (onNavigate) onNavigate("home");
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
          past_injuries: [],
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
    if (onComplete) onComplete({ mode, sports, description, plan: result?.plan });
    if (onNavigate) onNavigate("home");
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <NavBar activePath="plan" onNavigate={onNavigate} onLogout={onLogout} />

      <main className="mx-auto max-w-2xl px-8 py-10">
        {result || submitting ? (
          <PlanResult submitting={submitting} result={result} onFinish={finishAndGoHome} />
        ) : (
          <PlanWizard
            mode={mode}
            step={step}
            currentIndex={currentIndex}
            exercises={exercises}
            sports={sports}
            description={description}
            error={error}
            onChooseMode={chooseMode}
            onGoBack={goBack}
            onUpdateExercise={updateExercise}
            onAddExerciseRow={addExerciseRow}
            onRemoveExerciseRow={removeExerciseRow}
            onToggleSport={toggleSport}
            onDescriptionChange={setDescription}
            onContinue={() => setStep("sports")}
            onSave={handleSave}
          />
        )}
      </main>
    </div>
  );
}
