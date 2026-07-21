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

const PAST_INJURY_OPTIONS = [
  "ACL Tear",
  "Rotator Cuff Injury",
  "Sprained Ankle",
  "Lower Back Strain",
  "Tennis Elbow",
  "Knee Surgery",
  "Shoulder Surgery",
  "Stress Fracture",
  "Other",
  "None",
];

export default function PlanWizard({
  mode,
  step,
  currentIndex,
  totalSteps,
  exercises,
  matches,
  resolving,
  sports,
  pastInjuries,
  description,
  error,
  onChooseMode,
  onGoBack,
  onUpdateExercise,
  onAddExerciseRow,
  onRemoveExerciseRow,
  onToggleSport,
  onTogglePastInjury,
  onDescriptionChange,
  onContinue,
  onContinueFromReview,
  onSave,
}) {
  return (
    <>
      <div className="flex items-center gap-3 mb-8">
        {Array.from({ length: totalSteps }, (_, dotIndex) => dotIndex).map((dotIndex) => (
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
              onClick={() => onChooseMode("injury")}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
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
              onClick={() => onChooseMode("general")}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
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

            <button
              type="button"
              onClick={() => onChooseMode("custom")}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 text-left transition-all hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
            >
              <div className="font-semibold text-[var(--foreground)] mb-1">
                I want to build my own workout
              </div>
              <div className="text-sm text-[var(--muted-foreground)]">
                You already know what exercises you want to do. Type them in
                and we'll match each one to a demo video and instructions.
              </div>
            </button>
          </div>
        </div>
      )}

      {step === "exercises" && (
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">
            {mode === "injury" ? "Add your prescribed exercises" : "Add your exercises"}
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
                  onChange={(e) => onUpdateExercise(index, "name", e.target.value)}
                  placeholder="e.g. Straight Leg Raises"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)]"
                />
                <input
                  type="number"
                  min="0"
                  value={ex.sets}
                  onChange={(e) => onUpdateExercise(index, "sets", e.target.value)}
                  placeholder="3"
                  className="w-20 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                />
                <input
                  type="number"
                  min="0"
                  value={ex.reps}
                  onChange={(e) => onUpdateExercise(index, "reps", e.target.value)}
                  placeholder="10"
                  className="w-20 rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                />
                {exercises.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveExerciseRow(index)}
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
            onClick={onAddExerciseRow}
            className="w-full rounded-lg border border-dashed border-[var(--border)] py-3 text-sm text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
          >
            + Add another exercise
          </button>
        </div>
      )}

      {step === "review" && (
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            Confirm your exercises
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            We matched what you typed to our exercise library so each one
            comes with a demo and instructions. If a match looks wrong,
            retype it.
          </p>

          <div className="flex flex-col gap-3">
            {exercises.map((ex, index) => {
              if (!ex.name.trim()) return null;
              const match = matches?.[index];
              return (
                <div
                  key={index}
                  className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  {match?.status === "matched" && match.gifUrl ? (
                    <img
                      src={match.gifUrl}
                      alt={match.name}
                      className="h-16 w-16 flex-shrink-0 rounded-lg object-cover bg-[var(--secondary)]"
                    />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--secondary)] text-xs text-[var(--muted-foreground)]">
                      No preview
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-[var(--muted-foreground)]">You typed</p>
                    <p className="font-medium text-[var(--foreground)] mb-1">{ex.name}</p>
                    {match?.status === "matched" ? (
                      <>
                        <p className="text-xs text-[var(--muted-foreground)]">Matched to</p>
                        <p className="font-semibold text-[var(--primary)]">{match.name}</p>
                      </>
                    ) : (
                      <p className="text-sm text-amber-500">
                        No match found. We'll save it with your typed name, no demo video.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onGoBack}
                    className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    Retype
                  </button>
                </div>
              );
            })}
          </div>
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
                  onClick={() => onToggleSport(sport)}
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
              <p className="text-sm font-medium text-[var(--muted-foreground)] mb-3">
                Past Injuries or Conditions
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {PAST_INJURY_OPTIONS.map((injury) => {
                  const selected = pastInjuries.includes(injury);
                  return (
                    <button
                      key={injury}
                      type="button"
                      onClick={() => onTogglePastInjury(injury)}
                      className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                        selected
                          ? "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]"
                          : "border-[var(--border)] bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:border-[var(--primary)]"
                      }`}
                    >
                      {injury}
                    </button>
                  );
                })}
              </div>

              <p className="text-sm font-medium text-[var(--muted-foreground)] mb-2">
                What would you like to work on?
              </p>
              <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="e.g. My lower back feels stiff after sitting all day, and my knees ache after running."
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-2.5 text-[var(--foreground)] resize-none"
              />
              <p className="text-xs text-[var(--muted-foreground)] mt-2">
                We'll use this to build a personalized plan. This isn't a
                diagnosis. Always check with a professional for anything
                serious.
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[var(--error)] mt-6">{error}</p>}

      <div className="flex items-center justify-between mt-10">
        {step !== "mode" ? (
          <button
            type="button"
            onClick={onGoBack}
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
            onClick={onContinue}
            disabled={resolving}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-60"
          >
            {resolving ? "Matching exercises…" : "Continue"}
          </button>
        )}

        {step === "review" && (
          <button
            type="button"
            onClick={onContinueFromReview}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            Continue
          </button>
        )}

        {step === "sports" && (
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg bg-[var(--primary)] px-6 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] transition-colors"
          >
            Save
          </button>
        )}
      </div>
    </>
  );
}
