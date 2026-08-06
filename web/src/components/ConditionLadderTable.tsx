import type {
  ConditionEstimate,
  ConditionLadderEntry,
} from "@/lib/types";

export function ConditionLadderTable({
  ladder,
  activeCondition,
}: {
  ladder: ConditionLadderEntry[];
  activeCondition?: ConditionEstimate;
}) {
  if (!ladder.length) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">Condition</th>
            <th className="px-3 py-2">Market</th>
            <th className="px-3 py-2">Cash</th>
            <th className="px-3 py-2">Trade</th>
          </tr>
        </thead>
        <tbody>
          {ladder.map((row) => {
            const highlighted =
              activeCondition != null
                ? row.condition === activeCondition
                : row.isEstimated;
            return (
            <tr
              key={row.condition}
              className={highlighted ? "bg-indigo-50 font-medium" : ""}
            >
              <td className="px-3 py-2">
                {row.label}
                {highlighted && (
                  <span className="ml-1 text-xs text-indigo-600">(active)</span>
                )}
              </td>
              <td className="px-3 py-2">${row.marketValue.toFixed(2)}</td>
              <td className="px-3 py-2">${row.cashOffer.toFixed(2)}</td>
              <td className="px-3 py-2">${row.tradeOffer.toFixed(2)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
