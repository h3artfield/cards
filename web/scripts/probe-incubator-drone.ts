import { collectPipelineObservations } from "./lib/granted-pipeline-instrumentation";

const text =
  'Devoid (This card has no color.)\nWhen this creature enters, create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."';
const obs = collectPipelineObservations(text, "088d63ec-bd5e-4e80-acf9-2af270a9b395");
console.log(JSON.stringify(obs, null, 2));
