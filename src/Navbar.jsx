import logo from "./assets/logo.png";

const NAV_ITEMS = [
  { label: "Home", path: "home" },
  { label: "My Plan", path: "plan" },
  { label: "Session", path: "session" },
  { label: "Progress", path: "progress" },
];

export default function NavBar({ activePath, onNavigate, onLogout, theme, onToggleTheme }) {
  return (
    <nav className="flex items-center gap-8 border-b border-[var(--border)] bg-[var(--card)] px-8 py-4">
      <span className="flex items-center gap-2 font-semibold text-lg tracking-tight text-[var(--foreground)]">
        <img src={logo} alt="" className="h-12 w-12" />
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

      <div className="ml-auto flex items-center gap-4">
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)]"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        )}

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            Log out
          </button>
        )}
      </div>
    </nav>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 0.75V2.5M8 13.5V15.25M15.25 8H13.5M2.5 8H0.75M13.06 2.94L11.83 4.17M4.17 11.83L2.94 13.06M13.06 13.06L11.83 11.83M4.17 4.17L2.94 2.94"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M14 9.3A6 6 0 1 1 6.7 2a4.7 4.7 0 0 0 7.3 7.3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}