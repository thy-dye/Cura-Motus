const NAV_ITEMS = [
  { label: "Home", path: "home" },
  { label: "My Plan", path: "plan" },
  { label: "Session", path: "session" },
  { label: "Progress", path: "progress" },
];

export default function NavBar({ activePath, onNavigate, onLogout }) {
  return (
    <nav className="flex items-center gap-8 border-b border-[var(--border)] bg-[var(--card)] px-8 py-4">
      <span className="font-semibold text-lg tracking-tight text-[var(--foreground)]">
        Cura Motus
      </span>

      <div className="flex items-center gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === activePath;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => onNavigate && onNavigate(item.path)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[var(--secondary)] text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {onLogout && (
        <button
          type="button"
          onClick={onLogout}
          className="ml-auto text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Log out
        </button>
      )}
    </nav>
  );
}