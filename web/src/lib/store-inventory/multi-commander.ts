import type { CommanderStatus } from "./commander-status";

export type CommanderConfigurationType =
  | "single"
  | "partner"
  | "choose_a_background"
  | "doctors_companion";

export interface CommanderConfiguration {
  commanderOracleIds: string[];
  configurationType: CommanderConfigurationType;
}

export type MultiCommanderCheck =
  | { supported: true; configuration: CommanderConfiguration }
  | { supported: false; message: string };

const UNSUPPORTED_MESSAGE =
  "Multi-commander configurations are not yet supported by this builder.";

export function assessMultiCommanderSupport(input: {
  commanderStatus: CommanderStatus;
  typeLine: string;
  oracleText?: string;
}): MultiCommanderCheck {
  const basis = input.commanderStatus.eligibilityBasis;
  const oracleText = (input.oracleText ?? "").toLowerCase();

  if (basis === "partner_configuration") {
    return { supported: false, message: UNSUPPORTED_MESSAGE };
  }

  if (basis === "background") {
    return { supported: false, message: UNSUPPORTED_MESSAGE };
  }

  if (
    oracleText.includes("choose a background") ||
    oracleText.includes("background commander")
  ) {
    return { supported: false, message: UNSUPPORTED_MESSAGE };
  }

  if (oracleText.includes("doctor's companion") || oracleText.includes("doctors companion")) {
    return { supported: false, message: UNSUPPORTED_MESSAGE };
  }

  return {
    supported: true,
    configuration: {
      commanderOracleIds: [input.commanderStatus.oracleId],
      configurationType: "single",
    },
  };
}
