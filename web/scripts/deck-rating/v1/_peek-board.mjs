import { readFileSync } from "node:fs";
const field = JSON.parse(readFileSync("data/milestones/deck-rating/v1/plan-factory/field.json", "utf8"));
const names = new Set([
  "Aerith Gainsborough","Gogo, Master of Mimicry","Emrakul, the Promised End","Dark Leo & Shredder",
  "Alibou, Ancient Witness","Atraxa, Grand Unifier","Donatello, Gadget Master","Katara, the Fearless",
  "Lumra, Bellow of the Woods","Mai, Scornful Striker","Myrel, Shield of Argive","Niv-Mizzet, Parun",
  "Ob Nixilis, the Fallen","Old Gnawbone","Prosper, Tome-Bound","Spider-Woman, Stunning Savior",
  "Tekuthal, Inquiry Dominus","Toph, Hardheaded Teacher","Toski, Bearer of Secrets","Uro, Titan of Nature's Wrath",
  "Valgavoth, Terror Eater","Yarok, the Desecrated"
]);
for (const e of field.entries) {
  if (!names.has(e.name)) continue;
  console.log([
    e.name,
    e.score?.display ?? "",
    e.scris?.speed ?? "",
    e.score?.planRate ?? "",
    (e.gaps?.[0] ?? "").slice(0, 140),
  ].join(" | "));
}
