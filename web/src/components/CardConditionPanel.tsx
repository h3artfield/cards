"use client";

import type {
  CardConditionReport,
  ConditionEstimate,
  ConditionOverride,
  StaffEditRecord,
} from "@/lib/types";

function Subgrade({ label, score }: { label: string; score: number }) {
  const tone =
    score >= 9 ? "text-emerald-700" : score >= 7 ? "text-amber-700" : "text-red-700";
  return (
    <div className="rounded-md bg-white/90 px-2 py-1 ring-1 ring-gray-100">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className={`text-sm font-bold ${tone}`}>{score > 0 ? score.toFixed(1) : "—"}</p>
    </div>
  );
}

export function CardConditionPanel({
  report,
  conditionEstimate,
  conditionOverride,
  lastStaffEdit,
}: {
  report?: CardConditionReport;
  conditionEstimate?: ConditionEstimate;
  conditionOverride?: ConditionOverride;
  lastStaffEdit?: StaffEditRecord;
}) {
  const activeCondition = conditionOverride?.condition ?? conditionEstimate;

  if (report?.slabCertified) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">Certified slab</span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-900">
            {report.estimatedGrade}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-emerald-800">{report.disclaimer}</p>
        <EditAudit conditionOverride={conditionOverride} lastStaffEdit={lastStaffEdit} />
      </div>
    );
  }

  if (!report && !activeCondition) return null;

  if (report && !report.serviceAvailable) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
        <p className="font-semibold">Condition pre-grade</p>
        <p className="mt-1">{report.disclaimer}</p>
        {activeCondition && (
          <p className="mt-2 font-medium">Store condition: {activeCondition}</p>
        )}
        <EditAudit conditionOverride={conditionOverride} lastStaffEdit={lastStaffEdit} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-gray-800">Condition pre-grade</span>
        <div className="flex flex-wrap items-center gap-2">
          {report && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-900">
              Est. PSA {report.estimatedGrade}
              {report.gradeRange ? ` (${report.gradeRange})` : ""}
            </span>
          )}
          {activeCondition && (
            <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-gray-800 ring-1 ring-gray-200">
              {activeCondition}
              {conditionOverride ? " · edited" : ""}
            </span>
          )}
        </div>
      </div>

      {report && (
        <>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <Subgrade label="Centering" score={report.centering} />
            <Subgrade label="Corners" score={report.corners} />
            <Subgrade label="Edges" score={report.edges} />
            <Subgrade label="Surface" score={report.surface} />
          </div>
          {(report.frontCentering || report.backCentering) && (
            <p className="mt-1.5 text-[10px] text-gray-600">
              Centering front {report.frontCentering?.leftRight} · back{" "}
              {report.backCentering?.leftRight}
            </p>
          )}
          <p className="mt-1 text-[10px] text-gray-400">{report.disclaimer}</p>
        </>
      )}

      <EditAudit conditionOverride={conditionOverride} lastStaffEdit={lastStaffEdit} />
    </div>
  );
}

function EditAudit({
  conditionOverride,
  lastStaffEdit,
}: {
  conditionOverride?: ConditionOverride;
  lastStaffEdit?: StaffEditRecord;
}) {
  if (conditionOverride) {
    return (
      <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-950 ring-1 ring-amber-200">
        Edited by <strong>{conditionOverride.changedByName}</strong> on{" "}
        {new Date(conditionOverride.changedAt).toLocaleString()}
        {conditionOverride.previousCondition &&
        conditionOverride.previousCondition !== conditionOverride.condition
          ? ` · ${conditionOverride.previousCondition} → ${conditionOverride.condition}`
          : conditionOverride.condition
            ? ` · condition ${conditionOverride.condition}`
            : ""}
      </p>
    );
  }
  if (lastStaffEdit) {
    return (
      <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-950 ring-1 ring-amber-200">
        Edited by <strong>{lastStaffEdit.changedByName}</strong> on{" "}
        {new Date(lastStaffEdit.changedAt).toLocaleString()}
      </p>
    );
  }
  return null;
}
