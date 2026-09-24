"use client";

export function AdminSectionTabs({
  sections,
  active,
  onChange,
}: {
  sections: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {sections.map((section) => {
        const isActive = section.id === active;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-[var(--accent)] text-[var(--ink-900)]"
                : "bg-[var(--ink-750)] text-[var(--text)] ring-1 ring-[var(--line)] hover:border-[var(--line-strong)] hover:text-[var(--text-hi)]"
            }`}
          >
            {section.label}
          </button>
        );
      })}
    </div>
  );
}
